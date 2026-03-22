const express = require('express');
const twilio = require('twilio');
const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/webhook', async (req, res) => {
  const msg = (req.body.Body || '').trim().toLowerCase();
  const from = req.body.From;
  const twiml = new twilio.twiml.MessagingResponse();
  if (msg === 'daily') {
    twiml.message('Generando informe...');
    res.type('text/xml').send(twiml.toString());
    generateDaily(from);
  } else {
    twiml.message('Escribi daily para el informe');
    res.type('text/xml').send(twiml.toString());
  }
});

async function fetchPPI() {
  try {
    const listResp = await fetch('https://www.portfoliopersonal.com/research/informes', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const listHtml = await listResp.text();
    const match = listHtml.match(/href="(\/research\/informes\/[^"]+Cierre[^"]+)"/i) || listHtml.match(/href="(\/research\/informes\/[^"]+)"/);
    if (!match) return '';
    const url = 'https://www.portfoliopersonal.com' + match[1];
    const pageResp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await pageResp.text();
    const bodyMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || html.match(/class="content"[^>]*>([\s\S]{200,3000})/i);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000);
    return text;
  } catch (e) {
    return '';
  }
}

async function generateDaily(to) {
  const d = new Date();
  const fecha = d.getDate() + '/' + (d.getMonth() + 1);
  const ppiContent = await fetchPPI();

  const prompt = 'Sos analista senior de mesa de dinero argentina. Fecha: ' + fecha + '.\n\nTenes este informe de cierre de PPI como fuente principal:\n---\n' + ppiContent.substring(0, 3000) + '\n---\n\nAdemas busca en la web noticias de hoy en Cronista, iProfesional, Ambito e Infobae sobre declaraciones de funcionarios, FMI, o novedades que muevan el mercado.\n\nEscribi un informe de maximo 7 lineas para clientes corporativos sofisticados. Cada dia adapta el orden segun lo mas importante. Formato sin markdown:\n\nINFORME DIARIO ' + fecha + '\n[La noticia o dato mas critico del dia - una oracion]\nDolar: oficial $X | CCL $X | blue $X | brecha X%\nTasas: cauciones Xd X% | Lecap corta X% | carry: X\nRofex: [mes] $X dev.impl X% TNA | int.abierto: X\nBCRA: compro USD X M | acum USD X.XXX M | reservas USD XX.XXX M\n[Noticia politica o macro relevante - una oracion]\n\nTono directo. Solo lo que mueve el amperimetro. Sin relleno.';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await resp.json();
    const text = data.content ? data.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('') : JSON.stringify(data);
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: 'whatsapp:+14155238886', to: to, body: text.trim().substring(0, 1500) });
  } catch (err) { console.error('Error:', err); }
}

const PORT = process.env.PORT || 8000;
app.listen(PORT, function() { console.log('Bot en puerto ' + PORT); });
