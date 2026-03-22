const express = require('express');
const twilio = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/webhook', async (req, res) => {
  const message = (req.body.Body || '').trim().toLowerCase();
  const from = req.body.From;
  const twiml = new twilio.twiml.MessagingResponse();

  if (message === 'daily') {
    twiml.message('Generando el informe, dame un momento...');
    res.type('text/xml').send(twiml.toString());
    generateDaily(from);
  } else {
    twiml.message('Escribi daily para recibir el informe del dia');
    res.type('text/xml').send(twiml.toString());
  }
});

async function generateDaily(to) {
  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month…
[11:19 p. m., 21/3/2026] Eduardo Medina: const express = require('express');
const twilio = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/webhook', async (req, res) => {
  const message = (req.body.Body || '').trim().toLowerCase();
  const from = req.body.From;
  const twiml = new twilio.twiml.MessagingResponse();

  if (message === 'daily') {
    twiml.message('Generando el informe, dame un momento...');
    res.type('text/xml').send(twiml.toString());
    generateDaily(from);
  } else {
    twiml.message('Escribi daily para recibir el informe del dia');
    res.type('text/xml').send(twiml.toString());
  }
});

async function generateDaily(to) {
  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month…
[11:47 p. m., 21/3/2026] Eduardo Medina: Ya lo hice y tira el mismo error, me pasas otro código donde el informe sea menos demandante y más concreto que detalle dólar, tasa en pesos, rofex, política y novedades pero bullets puntuales. Solo lo muy muy importante en 6 renglones
[12:06 a. m., 22/3/2026] Eduardo Medina: const express = require('express');
const twilio = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/webhook', async (req, res) => {
  const message = (req.body.Body || '').trim().toLowerCase();
  const from = req.body.From;
  const twiml = new twilio.twiml.MessagingResponse();
  if (message === 'daily') {
    twiml.message('Generando informe...');
    res.type('text/xml').send(twiml.toString());
    generateDaily(from);
  } else {
    twiml.message('Escribi daily para el informe');
    res.type('text/xml').send(twiml.toString());
  }
});

async function generateDaily(to) {
  const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  const prompt = process.env.DAILY_PROMPT.replace('{{fecha}}', today);

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
        max_tokens: 300,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = data.content ? data.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('') : JSON.stringify(data);

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: 'whatsapp:+14155238886',
      to: to,
      body: text.trim().substring(0, 1500)
    });

  } catch (err) {
    console.error('Error:', err);
  }
}

const PORT = process.env.PORT || 8000;
app.listen(PORT, function() { console.log('Bot corriendo en puerto ' + PORT); });
