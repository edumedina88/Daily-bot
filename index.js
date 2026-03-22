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

  const prompt = 'Sos un analista senior de una mesa de dinero argentina escribiendo un informe diario para clientes corporativos. Hoy es ' + today + '. Busca informacion real y actual en la web.\n\nEl informe debe ser fluido, profesional y generar valor. No uses tablas ni bullets rigidos. Redactalo como un analista que le esc
