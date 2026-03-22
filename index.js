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

// Instrumentos por categoria
const INSTRUMENTOS = {
  tasaFija: ['TZXM6','S17A6','S30A6','S15Y6','S29Y6','T30J6','S31L6','S31G6','S30S6','S30O6','S30N6','T15E7','T30A7','T31Y7','T30J7'],
  boncer: ['X15Y6','X29Y6','TZX26','X31L6','X30S6','TZXO6','TX26','X30N6','TZXD6','TZXM7','TZXA7','TZXY7','TZX27','TZXD7','TZX28','TX28','TX31','DICP','PARP'],
  duales: ['TTJ26','TTS26','TTD26'],
  hardDolar: ['GD29','GD30','GD35','GD38','GD41','GD46','AO27','BPY26','BPOA7','BPOB7','BPOC7','BPOD7','BPOA8','BPOB8','AL29','AN29','AL30','AL35','AE38','AL41'],
  cauciones: ['CAUC/1D','CAUC/7D','CAUC/30D','CAUCUSD/1D','CAUCUSD/7D','CAUCUSD/30D']
};

// Detectar categoria de la pregunta
function detectarCategoria(msg) {
  const m = msg.toLowerCase();
  if (m.includes('lecap') || m.includes('tasa fija') || m.includes('s30n') || m.includes('tzx')) return 'tasaFija';
  if (m.includes('boncer') || m.includes('cer') || m.includes('inflacion') || m.includes('tx26') || m.includes('tzx26')) return 'boncer';
  if (m.includes('dual') || m.includes('ttj') || m.includes('tts')) return 'duales';
  if (m.includes('hard') || m.includes('dolar') || m.includes('global') || m.includes('bonar') || m.includes('gd30') || m.includes('al30') || m.includes('gd35') || m.includes('ae38')) return 'hardDolar';
  if (m.includes('caucion') || m.includes('cauciones') || m.includes('repo')) return 'cauciones';
  return null;
}

setInterval(async function() {
  const now = new Date();
  const diaSemana = now.getUTCDay();
  const hora = now.getUTCHours();
  const minuto = now.getUTCMinutes();
  if (diaSemana >= 1 && diaSemana <= 5 && hora === 12 && minuto === 0) {
    await generateDaily(TU_NUMERO);
  }
}, 60000);

setInterval(async function() {
  const now = new Date();
  for (let i = reminders.length - 1; i >= 0; i--) {
    const r = reminders[i];
    if (now >= r.when) {
      try {
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({ from: TWILIO_NUMBER, to: r.to, body: 'Recordatorio: ' + r.texto });
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
  } else if (msgLower === 'clientes' || msgLower === 'mis clientes') {
    twiml.message('Buscando...');
    res.type('text/xml').send(twiml.toString());
    listarClientes(from);
  } else if (msgLower.startsWith('recordar:') || msgLower.startsWith('recordarme:')) {
    twiml.message('Programando recordatorio...');
    res.type('text/xml').send(twiml.toString());
    programarRecordatorio(from, msg);
  } else if (msgLower === 'recordatorios' || msgLower === 'mis recordatorios') {
    twiml.message('Buscando...');
    res.type('text/xml').send(twiml.toString());
    listarRecordatorios(from);
  } else if (msgLower === 'reset' || msgLower === 'nueva conversacion') {
    chatHistory[from] = [];
    twiml.message('Conversacion reiniciada.');
    res.type('text/xml').send(twiml.toString());
  } else if (msgLower === 'ayuda' || msgLower === 'help') {
    const ayuda = 'Comandos:\n\ndaily - Informe de mercado\nmodificar: [cambio] - Editar daily\nguardar cliente: nombre, tel, notas\nclientes - Ver tus clientes\nrecordar: [cuando] [que]\nrecordatorios - Ver pendientes\nreset - Nueva conversacion\n\nPreguntas de mercado:\nlecaps / tasa fija\nbonceres / cer\nduales\nbonos dolar / globales\ncauciones\n\nO cualquier pregunta libre.';
    twiml.message(ayuda);
    res.type('text/xml').send(twiml.toString());
  } else {
    twiml.message('Consultando...');
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

async function getPreciosCategoria(categoria) {
  const token = await getPrimaryToken();
  if (!token) return null;
  const tickers = INSTRUMENTOS[categoria];
  if (!tickers) return null;

  const resultados = await Promise.all(tickers.map(async function(ticker) {
    let simbolo = ticker;
    if (categoria === 'hardDolar') simbolo = ticker + 'D/24hs';
    else if (categoria === 'boncer' || categoria === 'tasaFija' || categoria === 'duales') simbolo = ticker + '/24hs';
    else if (categoria === 'cauciones') simbolo = ticker;
    const precio = await getPrice(token, simbolo, 'SE,LA,CL');
    return precio ? { ticker: ticker, precio: precio } : null;
  }));

  return resultados.filter(function(r) { return r !== null; });
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
    const cliente = JSON.parse(text.trim());
    cliente.fechaAlta = new Date().toLocaleDateString('es-AR');
    crmData[to].push(cliente);
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'Cliente guardado: ' + cliente.nombre + (cliente.empresa ? ' - ' + cliente.empresa : '') + (cliente.telefono ? '\nTel: ' + cliente.telefono : '') + (cliente.notas ? '\nNotas: ' + cliente.notas : '') });
  } catch (err) { console.error('Error guardarCliente:', err); }
}

async function listarClientes(to) {
  const clientes = crmData[to];
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  if (!clientes || clientes.length === 0) {
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'No tenes clientes guardados. Usa "guardar cliente: nombre, tel, notas"' });
    return;
  }
  let lista = 'Tus clientes (' + clientes.length + '):\n\n';
  clientes.forEach(function(c, i) {
    lista += (i + 1) + '. ' + (c.nombre || 'Sin nombre') + (c.empresa ? ' - ' + c.empresa : '') + (c.telefono ? ' | ' + c.telefono : '') + '\n';
  });
  await client.messages.create({ from: TWILIO_NUMBER, to: to, body: lista.substring(0, 1500) });
}

async function programarRecordatorio(to, msg) {
  const contenido = msg.replace(/recordar:/i, '').replace(/recordarme:/i, '').trim();
  const ahora = new Date().toISOString();
  const prompt = 'Recordatorio: "' + contenido + '"\nAhora: ' + ahora + ' (Argentina UTC-3)\nDevolver SOLO JSON:\n{"texto":"","cuando":"ISO 8601","descripcionHumana":"ej: manana a las 9"}\nSolo el JSON.';
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 200, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await resp.json();
    const text = data.content ? data.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('') : '{}';
    const reminder = JSON.parse(text.trim());
    reminders.push({ to: to, texto: reminder.texto, when: new Date(reminder.cuando) });
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'Recordatorio programado:\n' + reminder.texto + '\n' + reminder.descripcionHumana });
  } catch (err) { console.error('Error recordatorio:', err); }
}

async function listarRecordatorios(to) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const misRecordatorios = reminders.filter(function(r) { return r.to === to; });
  if (misRecordatorios.length === 0) {
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'No tenes recordatorios pendientes.' });
    return;
  }
  let lista = 'Recordatorios pendientes:\n\n';
  misRecordatorios.forEach(function(r, i) {
    lista += (i + 1) + '. ' + r.texto + '\n' + r.when.toLocaleString('es-AR') + '\n\n';
  });
  await client.messages.create({ from: TWILIO_NUMBER, to: to, body: lista.substring(0, 1500) });
}

async function chat(to, mensaje) {
  if (!chatHistory[to]) chatHistory[to] = [];

  // Detectar si la pregunta es sobre una categoria de instrumentos
  const categoria = detectarCategoria(mensaje);
  let datosMarket = '';

  if (categoria) {
    const precios = await getPreciosCategoria(categoria);
    if (precios && precios.length > 0) {
      datosMarket = '\n\nDatos en tiempo real de Primary Markets para ' + categoria + ':\n';
      precios.forEach(function(p) {
        datosMarket += p.ticker + ': ' + p.precio + '\n';
      });
    }
  }

  const clientesStr = crmData[to] && crmData[to].length > 0 ? '\n\nClientes en CRM: ' + JSON.stringify(crmData[to]) : '';
  const systemPrompt = 'Sos un analista senior de mesa de dinero argentina con 20 anos de experiencia y asistente personal. Conoces el mercado local: Rofex, bonos soberanos, Lecaps, cauciones, dolar CCL/blue/oficial, BCRA, riesgo pais. Cuando tengas datos de Primary Markets usalos como fuente principal. Busca en la web para complementar con contexto. Respondas directo, preciso, con criterio. Maximo 5 lineas salvo que pidan algo largo.' + (dailyMemory[to] ? '\n\nInforme de hoy: ' + dailyMemory[to] : '') + clientesStr;

  const mensajeConDatos = datosMarket ? mensaje + datosMarket : mensaje;
  chatHistory[to].push({ role: 'user', content: mensajeConDatos });
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
