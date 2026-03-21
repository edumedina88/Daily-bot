const express = require('express');
const twilio = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: false }));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

app.post('/webhook', async (req, res) => {
  const message = req.body.Body?.trim().toLowerCase();
  const from = req.body.From;
  const twiml = new twilio.twiml.MessagingResponse();

  if (message === 'daily') {
    twiml.message('⏳ Generando el daily, dame un momento...');
    res.type('text/xml').send(twiml.toString());

    generateDaily(from);
  } else {
    twiml.message('Escribí *daily* para recibir el informe del día 📊');
    res.type('text/xml').send(twiml.toString());
  }
});

async function generateDaily(to) {
  const today = new Date().toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  const prompt = `Sos un analista de mesa de dinero argentina. Hoy es ${today}.
Generá un informe diario MUY CORTO para WhatsApp con búsqueda web. Formato exacto:

📅 *DAILY – ${today}*
_Mesa de Dinero_

🏦 *BCRA*
• Compra del día: USD X M | Acum. 2026: USD X.XXX M (X ruedas)
• Reservas brutas: USD XX.XXX M

💵 *CAMBIO*
• Oficial $X.XXX | CCL $X.XXX | MEP $X.XXX | Blue $X.XXX
• Banda sup: $X.XXX | Brecha CCL: ~X%

📈 *TASAS*
• Cauciones 1d: ~X% TNA | Lecap corta: ~XX-XX% TNA

📉 *MERCADO*
• Riesgo país: XXX bps ▲▼X% | Bonos: [resumen en 3 palabras]
• Rofex: [posición más cercana y tasa implícita de devaluación]

📰 *NOTICIAS*
• [noticia política/económica clave 1]
• [noticia política/económica clave 2]
• [noticia política/económica clave 3]

_Mesa de Dinero · uso exclusivo clientes_

Usá datos reales buscando en la web. Si un dato no está disponible poné s/d.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: 'whatsapp:+14155238886',
      to: to​​​​​​​​​​​​​​​​
