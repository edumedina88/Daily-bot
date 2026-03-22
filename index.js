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

async function fetchResearch() {
  try {
    const listResp = await fetch('https://www.portfoliopersonal.com/research/informes', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const listHtml = await listResp.text();
    const linkMatch = listHtml.match(/href="(\/research\/informes\/[^"]*[Cc]ierre[^"]*)"/) || listHtml.match(/href="(\/research\/informes\/[^"]+)"/);
    if (!linkMatch) return '';
    const pageUrl = 'https://www.portfoliopersonal.com' + linkMatch[1];
    const pageResp = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const pageHtml = await pageResp.text();
    const pdfMatch = pageHtml.match(/https:\/\/cdn1\.portfoliopersonal\.com\/Attachs\/\d+\.pdf/);
    if (!pdfMatch) {
      const clean = pageHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      return clean.substring(0, 4000);
    }
    const pdfResp = await fetch(pdfMatch[0], { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const buffer = await pdfResp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let text = '';
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] > 31 && bytes[i] < 127) text += String.fromCharCode(bytes[i]);
    }
    const cleaned = text.replace(/[^\x20-\x7E\n]/g, ' ').replace(/\s+/g, ' ');
    return cleaned.substring(0, 4000);
  } catch (e) {
    console.error('fetchResearch error:', e);
    return '';
  }
}

async function generateDaily(to) {
  const d = new Date();
  const fecha = d.getDate() + '/' + (d.getMonth() + 1);
  const research = await fetchResearch();

  const prompt = 'Sos analista senior de mesa de dinero argentina. Fecha: ' + fecha + '.\n\nTenes este informe de cierre de mercados como fuente principal de datos:\n---\n' + research + '\n---\n\nAdemas busca en la web noticias de hoy en Cronista, iProfesional, Ambito, Infobae sobre declaraciones de funcionarios, FMI, o novedades relevantes para el mercado.\n\nCon esos datos escribi el informe. Si un dato no esta en la fuente, buscalo en la web. Nunca inventes datos ni pongas s/d si podes buscarlo.\n\nFormato estricto, sin markdown, max 7 lineas:\n\nINFORME DIARIO ' + fecha + '\n[Dato o noticia mas critica del dia]\nDolar: oficial $X | CCL $X | blue $X | brecha X%\nTasas: cauciones Xd X% | Lecap X% | carry: X\nRofex: [mes] $X | dev.impl X% TNA\nBCRA: compro USD X M | acum USD X.XXX M | reservas USD XX.XXX M\n[Noticia politica o macro clave del dia]\n\nTono: directo, Bloomberg en español. Solo lo que mueve el mercado.';

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
