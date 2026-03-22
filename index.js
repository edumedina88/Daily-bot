const express = require('express');
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
  const prompt = 'Sos un analista senior de mesa de dinero argentina. Fecha: ' + today + '. Busca datos reales en la web. Tu tarea es escribir un informe diario de 6 lineas para clientes corporativos. Cada dia debe ser distinto: si hay tension cambiaria, enfatizas el dolar. Si hay movimiento en tasas, lo destacas. Si hay noticia politica clave, la pones primero. Adapta el orden y el tono segun lo que MAS importa hoy. Formato fijo pero contenido dinamico:\n\nINFORME DIARIO ' + today + '\n[linea 1: lo mas importante del dia en una oracion, sin etiqueta]\nDolar: oficial $X | CCL $X | blue $X | brecha X%\nTasas: cauciones X% | Lecap X% | carry [atractivo/neutro/negativo]\nRofex: [mes cercano] $X - dev. impl. X% TNA\nBCRA: USD X M hoy | acum. USD X.XXX M | reservas USD XX.XXX M\n\nTono: directo, como Bloomberg. Sin palabras de relleno. Solo lo que mueve el amperímetro.';
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

    const client =
