const express = require('express');
const twilio = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/webhook', async (req, res) => {
  const message = (req.body.Body || '').trim().toLowerCase();
  const from = req.body.From;
  const twiml = new twilio.twiml.MessagingResponse();

  if (message === 'daily') {
    twiml.message('Generando el daily, dame un momento...');
    res.type('text/xml').send(twiml.toString());
    generateDaily(from);
  } else {
    twiml.message('Escribi daily para recibir el informe del dia');
    res.type('text/xml').send(twiml.toString());
  }
});

async function generateDaily(to) {
  const today = new Date().toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  const prompt = `Sos un analista de mesa de dinero argentina. Hoy es ${today}. Generar informe diario corto para WhatsApp buscando datos reales en la web. Formato:

INFORME DIARIO - ${today}
Mesa de Dinero

BCRA
- Compra del dia: USD X M | Acum. 2026: USD X.XXX M (X ruedas)
- Reservas brutas: USD XX.XXX M

CAMBIO
- Oficial $X.XXX | CCL $X.XXX | MEP $X.XXX | Blue $X.XXX
- Banda sup: $X.XXX | Brecha CCL: X%

TASAS
- Cauciones 1d: X% TNA | Lecap corta: XX-XX% TNA

ROFEX
- Pos. cercana: $X.XXX (dev. impl. X% TNA)

MERCADO
- Riesgo pais: XXX bps | Bonos: resumen breve

NOTICIAS
- noticia 1
- noticia 2
- noticia 3

Saludos;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
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
    const text = data.content ? data.content.filter(b => b.type === 'text').map(b => b.text).join('') : JSON.stringify(data);

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: 'whatsapp:+14155238886',
      to: to,
      body: text.trim()
    });

  } catch (err) {
    console.error('Error:', err);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Bot corriendo en puerto ' + PORT));
