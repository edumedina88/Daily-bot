const express = require('express');
const twilio = require('twilio');
const app = express();
app.use(express.urlencoded({ extended: false }));

const dailyMemory = {};
const chatHistory = {};
const crmData = {};
const reminders = [];

const TU_NUMERO = 'whatsapp:+5491163033654';
const TWILIO_NUMBER = 'whatsapp:+14155238886';

setInterval(async function() {
  const now = new Date();
  const horaArg = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const diaActual = horaArg.getUTCDay();
  const horaActual = horaArg.getUTCHours();
  const minutoActual = horaArg.getUTCMinutes();

  for (let i = reminders.length - 1; i >= 0; i--) {
    const r = reminders[i];
    let disparar = false;
    if (r.tipo === 'unico') {
      if (now >= r.when) disparar = true;
    } else if (r.tipo === 'diario') {
      if (horaActual === r.hora && minutoActual === r.minuto) disparar = true;
    } else if (r.tipo === 'habiles') {
      if (diaActual >= 1 && diaActual <= 5 && horaActual === r.hora && minutoActual === r.minuto) disparar = true;
    } else if (r.tipo === 'semanal') {
      if (diaActual === r.diaSemana && horaActual === r.hora && minutoActual === r.minuto) disparar = true;
    }
    if (disparar) {
      try {
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({ from: TWILIO_NUMBER, to: r.to, body: String.fromCodePoint(0x23F0) + ' Recordatorio: ' + r.texto });
        if (r.tipo === 'unico') reminders.splice(i, 1);
      } catch(e) { console.error('Error reminder:', e); }
    }
  }
}, 60000);

setInterval(async function() {
  const now = new Date();
  const horaArg = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const diaActual = horaArg.getUTCDay();
  const horaActual = horaArg.getUTCHours();
  const minutoActual = horaArg.getUTCMinutes();
  if (diaActual >= 1 && diaActual <= 5 && horaActual === 9 && minutoActual === 0) {
    await generateDaily(TU_NUMERO);
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
    twiml.message('Guardando cliente...');
    res.type('text/xml').send(twiml.toString());
    guardarCliente(from, msg);
  } else if (msgLower === 'clientes' || msgLower === 'mis clientes') {
    twiml.message('Buscando...');
    res.type('text/xml').send(twiml.toString());
    listarClientes(from);
  } else if (msgLower.startsWith('recordar') || msgLower.startsWith('agenda') || msgLower.startsWith('agregar tarea') || msgLower.startsWith('tarea:')) {
    twiml.message('Agendando...');
    res.type('text/xml').send(twiml.toString());
    programarRecordatorio(from, msg);
  } else if (msgLower === 'recordatorios' || msgLower === 'mis recordatorios' || msgLower === 'tareas' || msgLower === 'mis tareas') {
    twiml.message('Buscando...');
    res.type('text/xml').send(twiml.toString());
    listarRecordatorios(from);
  } else if (msgLower.startsWith('borrar recordatorio') || msgLower.startsWith('eliminar recordatorio') || msgLower.startsWith('borrar tarea')) {
    twiml.message('Procesando...');
    res.type('text/xml').send(twiml.toString());
    borrarRecordatorio(from, msg);
  } else if (msgLower === 'reset' || msgLower === 'nueva conversacion') {
    chatHistory[from] = [];
    twiml.message('Conversacion reiniciada.');
    res.type('text/xml').send(twiml.toString());
  } else if (msgLower === 'ayuda' || msgLower === 'help') {
    const ayuda = 'Comandos disponibles:\n\n' +
      'daily - Informe de mercado\n' +
      'modificar: [cambio] - Editar daily\n\n' +
      'recordar todos los dias a las 8am [tarea]\n' +
      'recordar dias habiles a las 17 [tarea]\n' +
      'recordar el lunes a las 10 [tarea]\n' +
      'recordar el 15/4 a las 9 [tarea]\n\n' +
      'tareas - Ver recordatorios pendientes\n' +
      'borrar recordatorio [numero]\n\n' +
      'guardar cliente: nombre, tel, notas\n' +
      'clientes - Ver tus clientes\n\n' +
      'reset - Nueva conversacion\n\n' +
      'O escribime cualquier pregunta.';
    twiml.message(ayuda);
    res.type('text/xml').send(twiml.toString());
  } else {
    twiml.message('Procesando...');
    res.type('text/xml').send(twiml.toString());
    chat(from, msg);
  }
});

async function getPrimaryToken() {
  try {
    const r = await fetch('https://api.remarkets.primary.com.ar/auth/getToken', {
      method: 'POST',
      headers: { 'X-Username': process.env.PRIMARY_USER, 'X-Password': process.env.PRIMARY_PASS }
    });
    return r.headers.get('X-Auth-Token') || null;
  } catch(e) { return null; }
}

async function getPrice(token, symbol, entries) {
  try {
    const e = entries || 'SE,LA,CL';
    const r = await fetch('https://api.remarkets.primary.com.ar/rest/marketdata/get?marketId=ROFX&symbol=' + encodeURIComponent(symbol) + '&entries=' + e + '&level=1', {
      headers: { 'X-Auth-Token': token }
    });
    const d = await r.json();
    const md = d.marketData;
    if (!md) return null;
    const p = md.LA || md.SE || md.CL;
    return p && p.price ? p.price : null;
  } catch(e) { return null; }
}

async function getOI(token, symbol) {
  try {
    const r = await fetch('https://api.remarkets.primary.com.ar/rest/marketdata/get?marketId=ROFX&symbol=' + encodeURIComponent(symbol) + '&entries=OI&level=1', {
      headers: { 'X-Auth-Token': token }
    });
    const d = await r.json();
    return d.marketData && d.marketData.OI ? d.marketData.OI.size : null;
  } catch(e) { return null; }
}

async function getMarketData() {
  const token = await getPrimaryToken();
  if (!token) return null;
  const [rofexAbr, rofexMay, rofexJun, al30, gd35, caucMay, s30n6, oiAbr] = await Promise.all([
    getPrice(token, 'DLR/ABR26', 'SE,LA'),
    getPrice(token, 'DLR/MAY26', 'SE,LA'),
    getPrice(token, 'DLR/JUN26', 'SE,LA'),
    getPrice(token, 'AL30D/CI', 'LA,CL,SE'),
    getPrice(token, 'GD35D/24hs', 'LA,CL,SE'),
    getPrice(token, 'CAUC/MAY26', 'SE,LA'),
    getPrice(token, 'S30N6/24hs', 'LA,CL,SE'),
    getOI(token, 'DLR/ABR26')
  ]);
  return { rofexAbr, rofexMay, rofexJun, al30, gd35, caucMay, s30n6, oiAbr };
}

async function generateDaily(to) {
  const d = new Date();
  const fecha = d.getDate() + '/' + (d.getMonth() + 1);
  const mkt = await getMarketData();
  let mktStr = 'Datos de mercado no disponibles';
  if (mkt) {
    const lines = [];
    if (mkt.rofexAbr) lines.push('Rofex ABR26: $' + mkt.rofexAbr + (mkt.oiAbr ? ' | OI: ' + mkt.oiAbr : ''));
    if (mkt.rofexMay) lines.push('Rofex MAY26: $' + mkt.rofexMay);
    if (mkt.rofexJun) lines.push('Rofex JUN26: $' + mkt.rofexJun);
    if (mkt.al30) lines.push('AL30: USD ' + mkt.al30);
    if (mkt.gd35) lines.push('GD35: USD ' + mkt.gd35);
    if (mkt.caucMay) lines.push('Cauc MAY26: ' + mkt.caucMay + '%');
    if (mkt.s30n6) lines.push('Lecap S30N6: ' + mkt.s30n6);
    mktStr = lines.join('\n');
  }
  const prompt = 'Sos un analista senior de mesa de dinero argentina con 20 anos de experiencia. Fecha: ' + fecha + '.\n\nDatos exactos del ultimo cierre via API de mercado:\n' + mktStr + '\n\nBusca en la web (Ambito, Cronista, Infobae, iProfesional) para completar: dolar oficial, CCL, blue, BCRA compras/reservas, riesgo pais, noticias politicas relevantes.\n\nGenera un informe de MAXIMO 7 lineas. No listes datos como un robot. Interpreta: que implica la curva de Rofex para el carry? Los bonos estan caros o baratos? Hay tension o calma en tasas? Que dice el mercado que no dice la macro oficial?\n\nNo incluyas ninguna aclaracion sobre fuentes de datos. Arranca directo con el informe.\n\nFormato sin markdown, max 7 lineas:\n' + String.fromCodePoint(0x1F4CA) + ' INFORME DIARIO ' + fecha + '\n[Lectura del mercado]\n' + String.fromCodePoint(0x1F4B5) + ' Dolar: oficial $X | CCL $X | blue $X | brecha X%\n' + String.fromCodePoint(0x1F4C8) + ' Tasas: cauciones X% | Lecap X% | carry: X\n' + String.fromCodePoint(0x1F52E) + ' Rofex: ABR $X | MAY $X | dev.impl ABR X% TNA\n' + String.fromCodePoint(0x1F3E6) + ' Bonos: AL30 $X | GD35 $X | riesgo pais X bps\n' + String.fromCodePoint(0x1F5DE) + ' BCRA/Macro: [compras + reservas + noticia clave]\n\nTono Bloomberg. Preciso. Con criterio. Sin relleno.';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await resp.json();
    const text = data.content ? data.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('') : JSON.stringify(data);
    dailyMemory[to] = text.trim();
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: text.trim().substring(0, 1500) });
  } catch (err) { console.error('Error generateDaily:', err); }
}

async function modificarDaily(to, instruccion) {
  const dailyAnterior = dailyMemory[to];
  if (!dailyAnterior) {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'No hay informe generado. Escribi daily primero.' });
    return;
  }
  const prompt = 'Tenes este informe:\n\n' + dailyAnterior + '\n\nEl usuario pide: ' + instruccion + '\n\nDevolvelo modificado con el mismo formato. Sin aclaraciones.';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await resp.json();
    const text = data.content ? data.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('') : JSON.stringify(data);
    dailyMemory[to] = text.trim();
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: text.trim().substring(0, 1500) });
  } catch (err) { console.error('Error modificarDaily:', err); }
}

async function guardarCliente(to, msg) {
  if (!crmData[to]) crmData[to] = [];
  const contenido = msg.replace(/guardar cliente:/i, '').replace(/guardar contacto:/i, '').trim();
  const prompt = 'Extraer datos de este contacto: "' + contenido + '"\nDevolver SOLO JSON:\n{"nombre":"","telefono":"","empresa":"","notas":"","seguimiento":""}\nSolo el JSON.';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 200, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await resp.json();
    const text = data.content ? data.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('') : '{}';
    const clean = text.trim().replace(/```json/g, '').replace(/```/g, '').trim();
    const cliente = JSON.parse(clean);
    cliente.fechaAlta = new Date().toLocaleDateString('es-AR');
    crmData[to].push(cliente);
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: String.fromCodePoint(0x1F465) + ' Cliente guardado:\n' + cliente.nombre + (cliente.empresa ? ' - ' + cliente.empresa : '') + (cliente.telefono ? '\nTel: ' + cliente.telefono : '') + (cliente.notas ? '\nNotas: ' + cliente.notas : '') + (cliente.seguimiento ? '\nSeguimiento: ' + cliente.seguimiento : '') });
  } catch (err) { console.error('Error guardarCliente:', err); }
}

async function listarClientes(to) {
  const clientes = crmData[to];
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  if (!clientes || clientes.length === 0) {
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'No tenes clientes guardados. Usa "guardar cliente: nombre, tel, notas"' });
    return;
  }
  let lista = String.fromCodePoint(0x1F4CB) + ' Tus clientes (' + clientes.length + '):\n\n';
  clientes.forEach(function(c, i) {
    lista += (i + 1) + '. ' + (c.nombre || 'Sin nombre') + (c.empresa ? ' - ' + c.empresa : '') + (c.telefono ? ' | ' + c.telefono : '') + (c.notas ? '\n   ' + c.notas : '') + '\n\n';
  });
  await client.messages.create({ from: TWILIO_NUMBER, to: to, body: lista.substring(0, 1500) });
}

async function programarRecordatorio(to, msg) {
  const ahora = new Date().toISOString();
  const prompt = 'El usuario quiere agendar esto: "' + msg + '"\nFecha y hora actual en Argentina: ' + ahora + ' (UTC-3)\n\nAnaliza si es:\n- "todos los dias" o "diario" -> tipo: diario\n- "dias habiles" o "lunes a viernes" -> tipo: habiles\n- un dia de la semana especifico -> tipo: semanal\n- una fecha especifica o evento unico -> tipo: unico\n\nDevolver SOLO JSON sin texto adicional:\n{"texto":"descripcion clara de la tarea","tipo":"diario|habiles|semanal|unico","hora":9,"minuto":0,"diaSemana":1,"cuando":"ISO 8601 solo si es unico","descripcionHumana":"cuando se va a recordar en castellano"}\n\nNota: diaSemana 0=domingo,1=lunes,...,6=sabado. hora y minuto en horario Argentina. Solo el JSON.';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await resp.json();
    const text = data.content ? data.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('') : '{}';
    const clean = text.trim().replace(/```json/g, '').replace(/```/g, '').trim();
    const reminder = JSON.parse(clean);
    reminders.push({
      to: to,
      texto: reminder.texto,
      tipo: reminder.tipo,
      hora: reminder.hora,
      minuto: reminder.minuto || 0,
      diaSemana: reminder.diaSemana,
      when: reminder.cuando ? new Date(reminder.cuando) : null,
      descripcionHumana: reminder.descripcionHumana,
      id: Date.now()
    });
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: String.fromCodePoint(0x2705) + ' Agendado:\n' + reminder.texto + '\n' + String.fromCodePoint(0x1F4C5) + ' ' + reminder.descripcionHumana });
  } catch (err) { console.error('Error recordatorio:', err); }
}

async function listarRecordatorios(to) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const misRecordatorios = reminders.filter(function(r) { return r.to === to; });
  if (misRecordatorios.length === 0) {
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'No tenes recordatorios pendientes.' });
    return;
  }
  let lista = String.fromCodePoint(0x1F4CB) + ' Tus tareas (' + misRecordatorios.length + '):\n\n';
  misRecordatorios.forEach(function(r, i) {
    const tipoLabel = r.tipo === 'diario' ? 'Todos los dias' : r.tipo === 'habiles' ? 'Dias habiles' : r.tipo === 'semanal' ? 'Semanal' : 'Unico';
    lista += (i + 1) + '. ' + r.texto + '\n   ' + tipoLabel + ' a las ' + String(r.hora).padStart(2, '0') + ':' + String(r.minuto).padStart(2, '0') + '\n\n';
  });
  lista += 'Para borrar: "borrar recordatorio [numero]"';
  await client.messages.create({ from: TWILIO_NUMBER, to: to, body: lista.substring(0, 1500) });
}

async function borrarRecordatorio(to, msg) {
  const match = msg.match(/\d+/);
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  if (!match) {
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'Indica el numero del recordatorio a borrar. Usa "tareas" para ver la lista.' });
    return;
  }
  const num = parseInt(match[0]) - 1;
  const misRecordatorios = reminders.filter(function(r) { return r.to === to; });
  if (num < 0 || num >= misRecordatorios.length) {
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'Numero invalido. Usa "tareas" para ver la lista.' });
    return;
  }
  const recordatorioABorrar = misRecordatorios[num];
  const idx = reminders.findIndex(function(r) { return r.id === recordatorioABorrar.id; });
  if (idx !== -1) reminders.splice(idx, 1);
  await client.messages.create({ from: TWILIO_NUMBER, to: to, body: String.fromCodePoint(0x1F5D1) + ' Borrado: ' + recordatorioABorrar.texto });
}

async function chat(to, mensaje) {
  if (!chatHistory[to]) chatHistory[to] = [];
  const misRecordatorios = reminders.filter(function(r) { return r.to === to; });
  const recordatoriosStr = misRecordatorios.length > 0 ? '\n\nTareas y recordatorios del usuario:\n' + misRecordatorios.map(function(r, i) { return (i+1) + '. ' + r.texto + ' (' + r.tipo + ' ' + String(r.hora).padStart(2,'0') + ':' + String(r.minuto).padStart(2,'0') + ')'; }).join('\n') : '';
  const clientesStr = crmData[to] && crmData[to].length > 0 ? '\n\nClientes en CRM:\n' + crmData[to].map(function(c, i) { return (i+1) + '. ' + c.nombre + (c.empresa ? ' - ' + c.empresa : '') + (c.telefono ? ' | ' + c.telefono : '') + (c.notas ? ' | ' + c.notas : ''); }).join('\n') : '';
  const systemPrompt = 'Sos un asistente personal y analista senior de mesa de dinero argentina con 20 anos de experiencia. IMPORTANTE: SI tenes memoria y CRM - los datos de clientes y recordatorios se guardan en el sistema y se te pasan en este mismo mensaje. NUNCA digas que no tenes memoria ni que no podes guardar informacion - ESO ES FALSO. Si el usuario pide guardar algo, confirma que lo guardaste. Si pide ver clientes o tareas, mostra los datos que se te pasan. Conoces el mercado local: Rofex, bonos soberanos, Lecaps, cauciones, dolar CCL/blue/oficial, BCRA, riesgo pais. Busca en la web para info actual de mercado. Respondas directo, preciso, con criterio. Maximo 5 lineas salvo que pidan algo largo.' + (dailyMemory[to] ? '\n\nInforme de hoy: ' + dailyMemory[to] : '') + recordatoriosStr + clientesStr;
  chatHistory[to].push({ role: 'user', content: mensaje });
  if (chatHistory[to].length > 10) chatHistory[to] = chatHistory[to].slice(-10);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: chatHistory[to]
      })
    });
    const data = await resp.json();
    const text = data.content ? data.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('') : JSON.stringify(data);
    chatHistory[to].push({ role: 'assistant', content: text.trim() });
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: text.trim().substring(0, 1500) });
  } catch (err) { console.error('Error chat:', err); }
}

const PORT = process.env.PORT || 8000;
app.listen(PORT, function() { console.log('Bot en puerto ' + PORT); });
