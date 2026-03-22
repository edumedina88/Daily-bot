const express = require('express');
const twilio = require('twilio');
const app = express();
app.use(express.urlencoded({ extended: false }));

// Memoria temporal
const dailyMemory = {};
const chatHistory = {};
const crmData = {};
const reminders = [];

// Tu numero de WhatsApp
const TU_NUMERO = 'whatsapp:+5491163033654';
const TWILIO_NUMBER = 'whatsapp:+14155238886';

// Daily automatico lunes a viernes a las 9am Argentina (UTC-3 = 12:00 UTC)
setInterval(async function() {
  const now = new Date();
  const diaSemana = now.getUTCDay(); // 0=domingo, 6=sabado
  const hora = now.getUTCHours();
  const minuto = now.getUTCMinutes();
  if (diaSemana >= 1 && diaSemana <= 5 && hora === 12 && minuto === 0) {
    console.log('Enviando daily automatico...');
    await generateDaily(TU_NUMERO);
  }
}, 60000);

// Chequear recordatorios cada minuto
setInterval(async function() {
  const now = new Date();
  for (let i = reminders.length - 1; i >= 0; i--) {
    const r = reminders[i];
    if (now >= r.when) {
      try {
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({
          from: TWILIO_NUMBER,
          to: r.to,
          body: '⏰ Recordatorio: ' + r.texto
        });
      } catch(e) { console.error('Error reminder:', e); }
      reminders.splice(i, 1);
    }
  }
}, 60000);

app.post('/webhook', async (req, res) => {
  const msg = (req.body.Body || '').trim();
  const msgLower = msg.toLowerCase();
  const from = req.body.From;
  const twiml = new twilio.twiml.MessagingResponse();

  if (msgLower === 'daily') {
    twiml.message('Generando informe...');
    res.type('text/xml').send(twiml.toString());
    generateDaily(from);

  } else if (msgLower.startsWith('modificar:') || msgLower.startsWith('modificar ')) {
    twiml.message('Modificando informe...');
    res.type('text/xml').send(twiml.toString());
    modificarDaily(from, msg);

  } else if (msgLower.startsWith('guardar cliente:') || msgLower.startsWith('guardar contacto:')) {
    twiml.message('Guardando...');
    res.type('text/xml').send(twiml.toString());
    guardarCliente(from, msg);

  } else if (msgLower === 'mis clientes' || msgLower === 'clientes') {
    twiml.message('Buscando...');
    res.type('text/xml').send(twiml.toString());
    listarClientes(from);

  } else if (msgLower.startsWith('recordar:') || msgLower.startsWith('recordarme:')) {
    twiml.message('Programando recordatorio...');
    res.type('text/xml').send(twiml.toString());
    programarRecordatorio(from, msg);

  } else if (msgLower === 'mis recordatorios' || msgLower === 'recordatorios') {
    twiml.message('Buscando...');
    res.type('text/xml').send(twiml.toString());
    listarRecordatorios(from);

  } else if (msgLower === 'reset' || msgLower === 'nueva conversacion') {
    chatHistory[from] = [];
    twiml.message('Conversacion reiniciada.');
    res.type('text/xml').send(twiml.toString());

  } else if (msgLower === 'ayuda' || msgLower === 'help') {
    const ayuda = 'Comandos:\n\n📊 daily - Informe de mercado\n✏️ modificar: [cambio] - Editar el daily\n👤 guardar cliente: nombre, tel, notas\n📋 clientes - Ver tus clientes\n⏰ recordar: [cuando] [que]\n📅 recordatorios - Ver pendientes\n🔄 reset - Nueva conversacion\n\nO escribime cualquier pregunta de mercado.';
    twiml.message(ayuda);
    res.type('text/xml').send(twiml.toString());

  } else {
    twiml.message('Procesando...');
    res.type('text/xml').send(twiml.toStri
