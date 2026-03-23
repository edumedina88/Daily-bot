const express = require('express');
const twilio = require('twilio');
const { Pool } = require('pg');
const app = express();
app.use(express.urlencoded({ extended: false }));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const dailyMemory = {};
const chatHistory = {};

const TU_NUMERO = 'whatsapp:+5491163033654';
const TWILIO_NUMBER = 'whatsapp:+14155238886';

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        usuario TEXT NOT NULL,
        nombre TEXT,
        telefono TEXT,
        empresa TEXT,
        notas TEXT,
        seguimiento TEXT,
        fecha_alta TEXT
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notas_clientes (
        id SERIAL PRIMARY KEY,
        usuario TEXT NOT NULL,
        cliente_nombre TEXT,
        nota TEXT,
        fecha TEXT
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conocimiento (
        id SERIAL PRIMARY KEY,
        usuario TEXT NOT NULL,
        info TEXT,
        fecha TEXT
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS recordatorios (
        id SERIAL PRIMARY KEY,
        usuario TEXT NOT NULL,
        texto TEXT,
        tipo TEXT,
        hora INTEGER,
        minuto INTEGER,
        dia_semana INTEGER,
        cuando TIMESTAMP,
        descripcion_humana TEXT,
        activo BOOLEAN DEFAULT true
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dailies (
        id SERIAL PRIMARY KEY,
        usuario TEXT NOT NULL,
        fecha TEXT,
        contenido TEXT,
        creado_en TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('Base de datos lista');
  } catch(e) { console.error('Error initDB:', e); }
}

initDB();

setInterval(async function() {
  const now = new Date();
  const horaArg = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const diaActual = horaArg.getUTCDay();
  const horaActual = horaArg.getUTCHours();
  const minutoActual = horaArg.getUTCMinutes();
  try {
    const res = await pool.query('SELECT * FROM recordatorios WHERE activo = true');
    for (const r of res.rows) {
      let disparar = false;
      if (r.tipo === 'unico' && r.cuando && now >= new Date(r.cuando)) disparar = true;
      else if (r.tipo === 'diario' && horaActual === r.hora && minutoActual === r.minuto) disparar = true;
      else if (r.tipo === 'habiles' && diaActual >= 1 && diaActual <= 5 && horaActual === r.hora && minutoActual === r.minuto) disparar = true;
      else if (r.tipo === 'semanal' && diaActual === r.dia_semana && horaActual === r.hora && minutoActual === r.minuto) disparar = true;
      if (disparar) {
        try {
          const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          await client.messages.create({ from: TWILIO_NUMBER, to: r.usuario, body: String.fromCodePoint(0x23F0) + ' Recordatorio: ' + r.texto });
          if (r.tipo === 'unico') await pool.query('UPDATE recordatorios SET activo = false WHERE id = $1', [r.id]);
        } catch(e) { console.error('Error enviando recordatorio:', e); }
      }
    }
  } catch(e) { console.error('Error chequeo recordatorios:', e); }
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
  } else if (msgLower.startsWith('info cliente:')) {
    twiml.message('Guardando nota...');
    res.type('text/xml').send(twiml.toString());
    agregarNotaCliente(from, msg);
  } else if (msgLower.startsWith('ver cliente:')) {
    twiml.message('Buscando...');
    res.type('text/xml').send(twiml.toString());
    verCliente(from, msg);
  } else if (msgLower.startsWith('borrar cliente') || msgLower.startsWith('eliminar cliente')) {
    twiml.message('Procesando...');
    res.type('text/xml').send(twiml.toString());
    borrarCliente(from, msg);
  } else if (msgLower.startsWith('aprender:')) {
    twiml.message('Guardando...');
    res.type('text/xml').send(twiml.toString());
    guardarConocimiento(from, msg);
  } else if (msgLower.startsWith('recordar') || msgLower.startsWith('agenda') || msgLower.startsWith('tarea:')) {
    twiml.message('Agendando...');
    res.type('text/xml').send(twiml.toString());
    programarRecordatorio(from, msg);
  } else if (msgLower === 'recordatorios' || msgLower === 'mis recordatorios' || msgLower === 'tareas' || msgLower === 'mis tareas') {
    twiml.message('Buscando...');
    res.type('text/xml').send(twiml.toString());
    listarRecordatorios(from);
  } else if (msgLower.startsWith('borrar recordatorio') || msgLower.startsWith('borrar tarea')) {
    twiml.message('Procesando...');
    res.type('text/xml').send(twiml.toString());
    borrarRecordatorio(from, msg);
  } else if (msgLower === 'reset' || msgLower === 'nueva conversacion') {
    chatHistory[from] = [];
    twiml.message('Conversacion reiniciada.');
    res.type('text/xml').send(twiml.toString());
  } else if (msgLower === 'ayuda' || msgLower === 'help') {
    const ayuda = 'Comandos:\n\n' +
      'daily - Informe de mercado\n' +
      'modificar: [cambio]\n\n' +
      'guardar cliente: nombre, tel, empresa, notas\n' +
      'info cliente: Juan Perez, llamo hoy, quiere Lecaps\n' +
      'ver cliente: Juan Perez\n' +
      'clientes - Ver todos\n' +
      'borrar cliente [numero]\n\n' +
      'aprender: [info de mercado]\n\n' +
      'recordar todos los dias a las 8am [tarea]\n' +
      'recordar dias habiles a las 17 [tarea]\n' +
      'recordar el lunes a las 10 [tarea]\n' +
      'tareas - Ver recordatorios\n' +
      'borrar recordatorio [numero]\n\n' +
      'reset - Nueva conversacion\n\n' +
      'O cualquier pregunta de mercado.';
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
    await pool.query('INSERT INTO dailies (usuario, fecha, contenido) VALUES ($1, $2, $3)', [to, fecha, text.trim()]);
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
    const fecha = new Date().toLocaleDateString('es-AR');
    await pool.query(
      'INSERT INTO clientes (usuario, nombre, telefono, empresa, notas, seguimiento, fecha_alta) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [to, cliente.nombre, cliente.telefono, cliente.empresa, cliente.notas, cliente.seguimiento, fecha]
    );
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: String.fromCodePoint(0x1F465) + ' Cliente guardado:\n' + cliente.nombre + (cliente.empresa ? ' - ' + cliente.empresa : '') + (cliente.telefono ? '\nTel: ' + cliente.telefono : '') + (cliente.notas ? '\nNotas: ' + cliente.notas : '') });
  } catch (err) { console.error('Error guardarCliente:', err); }
}

async function agregarNotaCliente(to, msg) {
  const contenido = msg.replace(/info cliente:/i, '').trim();
  const partes = contenido.split(',');
  const nombreCliente = partes[0].trim();
  const nota = partes.slice(1).join(',').trim();
  const fecha = new Date().toLocaleDateString('es-AR');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  try {
    await pool.query(
      'INSERT INTO notas_clientes (usuario, cliente_nombre, nota, fecha) VALUES ($1, $2, $3, $4)',
      [to, nombreCliente, nota, fecha]
    );
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: String.fromCodePoint(0x1F4DD) + ' Nota guardada para ' + nombreCliente + ':\n' + nota });
  } catch (err) { console.error('Error agregarNotaCliente:', err); }
}

async function verCliente(to, msg) {
  const nombreCliente = msg.replace(/ver cliente:/i, '').trim();
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  try {
    const resCliente = await pool.query('SELECT * FROM clientes WHERE usuario = $1 AND nombre ILIKE $2 LIMIT 1', [to, '%' + nombreCliente + '%']);
    const resNotas = await pool.query('SELECT * FROM notas_clientes WHERE usuario = $1 AND cliente_nombre ILIKE $2 ORDER BY id DESC LIMIT 10', [to, '%' + nombreCliente + '%']);
    if (resCliente.rows.length === 0) {
      await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'No encontre cliente con ese nombre. Usa "clientes" para ver la lista.' });
      return;
    }
    const c = resCliente.rows[0];
    let texto = String.fromCodePoint(0x1F465) + ' ' + c.nombre + '\n';
    if (c.empresa) texto += 'Empresa: ' + c.empresa + '\n';
    if (c.telefono) texto += 'Tel: ' + c.telefono + '\n';
    if (c.notas) texto += 'Perfil: ' + c.notas + '\n';
    if (c.seguimiento) texto += 'Seguimiento: ' + c.seguimiento + '\n';
    texto += 'Alta: ' + c.fecha_alta + '\n';
    if (resNotas.rows.length > 0) {
      texto += '\n' + String.fromCodePoint(0x1F4DD) + ' Historial:\n';
      resNotas.rows.forEach(function(n) {
        texto += '- ' + n.fecha + ': ' + n.nota + '\n';
      });
    } else {
      texto += '\nSin notas todavia.';
    }
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: texto.substring(0, 1500) });
  } catch (err) { console.error('Error verCliente:', err); }
}

async function listarClientes(to) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  try {
    const res = await pool.query('SELECT * FROM clientes WHERE usuario = $1 ORDER BY id', [to]);
    if (res.rows.length === 0) {
      await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'No tenes clientes guardados. Usa "guardar cliente: nombre, tel, notas"' });
      return;
    }
    let lista = String.fromCodePoint(0x1F4CB) + ' Tus clientes (' + res.rows.length + '):\n\n';
    res.rows.forEach(function(c, i) {
      lista += (i + 1) + '. ' + (c.nombre || 'Sin nombre') + (c.empresa ? ' - ' + c.empresa : '') + (c.telefono ? ' | ' + c.telefono : '') + '\n';
    });
    lista += '\nPara ver detalle: "ver cliente: nombre"';
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: lista.substring(0, 1500) });
  } catch (err) { console.error('Error listarClientes:', err); }
}

async function borrarCliente(to, msg) {
  const match = msg.match(/\d+/);
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  if (!match) {
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'Indica el numero del cliente a borrar. Usa "clientes" para ver la lista.' });
    return;
  }
  try {
    const res = await pool.query('SELECT * FROM clientes WHERE usuario = $1 ORDER BY id', [to]);
    const num = parseInt(match[0]) - 1;
    if (num < 0 || num >= res.rows.length) {
      await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'Numero invalido.' });
      return;
    }
    const clienteABorrar = res.rows[num];
    await pool.query('DELETE FROM clientes WHERE id = $1', [clienteABorrar.id]);
    await pool.query('DELETE FROM notas_clientes WHERE usuario = $1 AND cliente_nombre ILIKE $2', [to, clienteABorrar.nombre]);
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: String.fromCodePoint(0x1F5D1) + ' Borrado: ' + clienteABorrar.nombre });
  } catch (err) { console.error('Error borrarCliente:', err); }
}

async function guardarConocimiento(to, msg) {
  const info = msg.replace(/aprender:/i, '').trim();
  const fecha = new Date().toLocaleDateString('es-AR');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  try {
    await pool.query('INSERT INTO conocimiento (usuario, info, fecha) VALUES ($1, $2, $3)', [to, info, fecha]);
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: String.fromCodePoint(0x1F9E0) + ' Aprendido y guardado:\n' + info });
  } catch (err) { console.error('Error guardarConocimiento:', err); }
}

async function programarRecordatorio(to, msg) {
  const ahora = new Date().toISOString();
  const prompt = 'El usuario quiere agendar esto: "' + msg + '"\nFecha y hora actual en Argentina: ' + ahora + ' (UTC-3)\n\nAnaliza si es:\n- "todos los dias" o "diario" -> tipo: diario\n- "dias habiles" o "lunes a viernes" -> tipo: habiles\n- un dia de la semana especifico -> tipo: semanal\n- una fecha especifica o evento unico -> tipo: unico\n\nDevolver SOLO JSON:\n{"texto":"descripcion clara","tipo":"diario|habiles|semanal|unico","hora":9,"minuto":0,"diaSemana":1,"cuando":"ISO 8601 solo si es unico","descripcionHumana":"cuando en castellano"}\n\nSolo el JSON.';
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
    await pool.query(
      'INSERT INTO recordatorios (usuario, texto, tipo, hora, minuto, dia_semana, cuando, descripcion_humana) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [to, reminder.texto, reminder.tipo, reminder.hora, reminder.minuto || 0, reminder.diaSemana || null, reminder.cuando || null, reminder.descripcionHumana]
    );
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: String.fromCodePoint(0x2705) + ' Agendado:\n' + reminder.texto + '\n' + String.fromCodePoint(0x1F4C5) + ' ' + reminder.descripcionHumana });
  } catch (err) { console.error('Error recordatorio:', err); }
}

async function listarRecordatorios(to) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  try {
    const res = await pool.query('SELECT * FROM recordatorios WHERE usuario = $1 AND activo = true ORDER BY id', [to]);
    if (res.rows.length === 0) {
      await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'No tenes recordatorios pendientes.' });
      return;
    }
    let lista = String.fromCodePoint(0x1F4CB) + ' Tus tareas (' + res.rows.length + '):\n\n';
    res.rows.forEach(function(r, i) {
      const tipoLabel = r.tipo === 'diario' ? 'Todos los dias' : r.tipo === 'habiles' ? 'Dias habiles' : r.tipo === 'semanal' ? 'Semanal' : 'Unico';
      lista += (i + 1) + '. ' + r.texto + '\n   ' + tipoLabel + ' a las ' + String(r.hora).padStart(2, '0') + ':' + String(r.minuto).padStart(2, '0') + '\n\n';
    });
    lista += 'Para borrar: "borrar recordatorio [numero]"';
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: lista.substring(0, 1500) });
  } catch (err) { console.error('Error listarRecordatorios:', err); }
}

async function borrarRecordatorio(to, msg) {
  const match = msg.match(/\d+/);
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  if (!match) {
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'Indica el numero. Usa "tareas" para ver la lista.' });
    return;
  }
  try {
    const res = await pool.query('SELECT * FROM recordatorios WHERE usuario = $1 AND activo = true ORDER BY id', [to]);
    const num = parseInt(match[0]) - 1;
    if (num < 0 || num >= res.rows.length) {
      await client.messages.create({ from: TWILIO_NUMBER, to: to, body: 'Numero invalido.' });
      return;
    }
    const recordatorioABorrar = res.rows[num];
    await pool.query('UPDATE recordatorios SET activo = false WHERE id = $1', [recordatorioABorrar.id]);
    await client.messages.create({ from: TWILIO_NUMBER, to: to, body: String.fromCodePoint(0x1F5D1) + ' Borrado: ' + recordatorioABorrar.texto });
  } catch (err) { console.error('Error borrarRecordatorio:', err); }
}

async function chat(to, mensaje) {
  if (!chatHistory[to]) chatHistory[to] = [];
  try {
    const resClientes = await pool.query('SELECT * FROM clientes WHERE usuario = $1 ORDER BY id', [to]);
    const resRecordatorios = await pool.query('SELECT * FROM recordatorios WHERE usuario = $1 AND activo = true ORDER BY id', [to]);
    const resConocimiento = await pool.query('SELECT * FROM conocimiento WHERE usuario = $1 ORDER BY id DESC LIMIT 20', [to]);
    const clientesStr = resClientes.rows.length > 0 ? '\n\nClientes en CRM:\n' + resClientes.rows.map(function(c, i) { return (i+1) + '. ' + c.nombre + (c.empresa ? ' - ' + c.empresa : '') + (c.telefono ? ' | ' + c.telefono : '') + (c.notas ? ' | ' + c.notas : ''); }).join('\n') : '';
    const recordatoriosStr = resRecordatorios.rows.length > 0 ? '\n\nTareas pendientes:\n' + resRecordatorios.rows.map(function(r, i) { return (i+1) + '. ' + r.texto + ' (' + r.tipo + ' ' + String(r.hora).padStart(2,'0') + ':' + String(r.minuto).padStart(2,'0') + ')'; }).join('\n') : '';
    const conocimientoStr = resConocimiento.rows.length > 0 ? '\n\nConocimiento guardado:\n' + resConocimiento.rows.map(function(k) { return '- ' + k.info; }).join('\n') : '';
    const systemPrompt = 'Sos un asistente personal de mesa de dinero argentina llamado EduBot. Tenes una base de datos PostgreSQL propia donde se guardan clientes, recordatorios, conocimiento de mercado y dailies. Los datos que ves abajo son de tu base de datos y persisten entre sesiones. NUNCA digas que no tenes memoria - SI tenes base de datos propia. Conoces el mercado local: Rofex, bonos, Lecaps, cauciones, dolar, BCRA. Busca en la web para info actual de mercado. Respondas directo y preciso. Maximo 5 lineas salvo que pidan algo largo.' + (dailyMemory[to] ? '\n\nInforme de hoy: ' + dailyMemory[to] : '') + clientesStr + recordatoriosStr + conocimientoStr;
    chatHistory[to].push({ role: 'user', content: mensaje });
    if (chatHistory[to].length > 10) chatHistory[to] = chatHistory[to].slice(-10);
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
