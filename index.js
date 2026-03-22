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
async function generateDaily(to) {
  const d = new Date();
  const fecha = d.getDate() + '/' + (d.getMonth() + 1);
  const prompt = 'Sos analista senior de mesa de dinero argentina. Fecha: ' + fecha + '. Busca datos reales hoy en la web. Responde SOLO con esto, max 7 lineas, sin markdown:\nINFORME DIARIO ' + fecha + '\n[La noticia o dato mas importante del dia en una oracion]\nDolar: oficial $X | CCL $X | blue $X | brecha X%\nTasas: cauciones X% | Lecap X% | carry: X\nRofex: [mes] $X | dev.impl X% TNA\nBCRA: compro USD X M hoy | acum USD X.XXX M | reservas USD XX.XXX M\nMesa de Dinero';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, tools: [{ type: 'web_search_20250305', name: 'web_search' }], messages: [{ role: 'user', content: prompt }] })
    });
    const data = await resp.json();
    const text = data.content ? data.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('') : JSON.stringify(data);
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: 'whatsapp:+14155238886', to: to, body: text.trim().substring(0, 1500) });
  } catch (err) { console.error('Error:', err); }
}
const PORT = process.env.PORT || 8000;
app.listen(PORT, function() { console.log('Bot en puerto ' + PORT); });
