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
  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' });

  const prompt = 'Sos un analista senior de una mesa de dinero argentina escribiendo un informe diario para clientes corporativos. Hoy es ' + today + '. Busca informacion real y actual en la web.\n\nEl informe debe ser fluido, profesional y generar valor. Redactalo como un analista que le escribe a un cliente importante.\n\nEstructura exacta:\n\n*INFORME DIARIO*\n_' + today + ' | Mesa de Dinero_\n\n*Mercado cambiario*\nRedacta un parrafo sobre la dinamica del dolar: como cerro el oficial, CCL, MEP y blue.\n\n*Tasas en pesos*\nRedacta un parrafo sobre el estado de las tasas.\n\n*Dolar futuro - Rofex*\nRedacta un parrafo sobre la curva de futuros.\n\n*BCRA y reservas*\nUna oracion sobre compras del dia y acumulado. Nivel de reservas brutas.\n\n*Contexto politico y declaraciones*\nMenciona las declaraciones o noticias politicas mas relevantes del dia que impacten en el mercado: funcionarios, FMI, medidas de gobierno, etc. Solo lo que mueva el amperímetro.\n\n*Perspectiva*\nUn parrafo corto con la lectura del dia: que mira el mercado, que riesgo o catalizador hay en el horizonte inmediato.\n\n_Mesa de Dinero._\n\nUsa datos reales buscando en la web. Tono: directo, profesional, como Bloomberg en español. Maximo 150 palabras en total.Muy conciso';

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
    const text = data.content ? data.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('') : JSON.stringify(data);

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

const PORT = process.env.PORT || 8000;
app.listen(PORT, function() { console.log('Bot corriendo en puerto ' + PORT); });
