const express = require('express');
const twilio = require('twilio');
const app = express();
app.use(express.urlencoded({ extended: false }));

// Memoria temporal por numero de WhatsApp
const dailyMemory = {};
const chatHistory = {};

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
  } else if (msgLower === 'nueva conversacion' || msgLower === 'nueva conversacion' || msgLower === 'reset') {
    chatHistory[from] = [];
    const twiml2 = new twilio.twiml.MessagingResponse();
    twiml2.message('Conversacion reiniciada.');
    res.type('text/xml').send(twiml2.toString());
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

  const prompt = 'Sos un analista senior de mesa de dinero argentina con 20 anos de experiencia. Fecha: ' + fecha + '.\n\nDatos exactos del ultimo cierre via API de mercado:\n' + mktStr + '\n\nBusca en la web (Ambito, Cronista, Infobae, iProfesional) para completar: dolar oficial, CCL, blue, BCRA compras/reservas, riesgo pais, noticias politicas relevantes.\n\nGenera un informe de MAXIMO 7 lineas. No listes datos como un robot. Interpreta: que implica la curva de Rofex para el carry? Los bonos estan caros o baratos? Hay tension o calma en tasas? Que dice el mercado que no dice la macro oficial? Si hay algo importante politico o de funcionarios que impacte en mercado, ponelo.\n\nNo incluyas ninguna aclaracion sobre fuentes de datos ni como obtuviste la informacion. Arranca directo con el informe.\n\nFormato sin markdown, iconos discretos y profesionales, max 7 lineas:\n📊 INFORME DIARIO ' + fecha + '\n[Lectura del mercado - algo que valga la pena, no un dato]\n💵 Dolar: oficial $X | CCL $X | blue $X | brecha X%\n📈 Tasas: cauciones X% | Lecap X% | carry: [positivo/neutro/negativo]\n🔮 Rofex: ABR $X | MAY $X | dev.impl ABR X% TNA | OI: X\n🏦 Bonos: AL30 $X | GD35 $X | riesgo pais X bps\n🗞 BCRA/Macro: [compras + reservas + noticia clave del dia]\n\nTono Bloomberg. Preciso. Con criterio. Sin relleno.';

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

    // Guardar el daily en memoria
    dailyMemory[to] = text.trim();

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: 'whatsapp:+14155238886', to: to, body: text.trim().substring(0, 1500) });
  } catch (err) { console.error('Error generateDaily:', err); }
}

async function modificarDaily(to, instruccion) {
  const dailyAnterior = dailyMemory[to];

  if (!dailyAnterior) {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: 'whatsapp:+14155238886', to: to, body: 'No hay un informe generado todavia. Escribi daily primero.' });
    return;
  }

  const prompt = 'Tenes este informe diario de mercado argentino:\n\n' + dailyAnterior + '\n\nEl usuario pide: ' + instruccion + '\n\nDevolvelo modificado manteniendo exactamente el mismo formato y estilo. Sin aclaraciones, directo el informe.';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await resp.json();
    const text = data.content ? data.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('') : JSON.stringify(data);

    // Actualizar memoria con el daily modificado
    dailyMemory[to] = text.trim();

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: 'whatsapp:+14155238886', to: to, body: text.trim().substring(0, 1500) });
  } catch (err) { console.error('Error modificarDaily:', err); }
}

async function chat(to, mensaje) {
  // Inicializar historial si no existe
  if (!chatHistory[to]) chatHistory[to] = [];

  // Agregar contexto del daily si existe
  const systemPrompt = 'Sos un analista senior de mesa de dinero argentina con 20 anos de experiencia. Conoces a fondo el mercado local: Rofex, bonos soberanos, Lecaps, cauciones, dolar CCL/blue/oficial, BCRA, riesgo pais. Respondas de forma directa, precisa y con criterio de mercado. Sin vueltas. Tono profesional pero conversacional. Maximo 5 lineas por respuesta salvo que te pidan algo largo.' + (dailyMemory[to] ? '\n\nEl informe de hoy que ya generaste es:\n' + dailyMemory[to] : '');

  // Agregar mensaje del usuario al historial
  chatHistory[to].push({ role: 'user', content: mensaje });

  // Mantener historial de max 10 mensajes para no explotar el contexto
  if (chatHistory[to].length > 10) {
    chatHistory[to] = chatHistory[to].slice(-10);
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages: chatHistory[to]
      })
    });
    const data = await resp.json();
    const text = data.content ? data.content.filter(function(b) { return b.type === 'text'; }).map(function(b) { return b.text; }).join('') : JSON.stringify(data);

    // Guardar respuesta en historial
    chatHistory[to].push({ role: 'assistant', content: text.trim() });

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: 'whatsapp:+14155238886', to: to, body: text.trim().substring(0, 1500) });
  } catch (err) { console.error('Error chat:', err); }
}

const PORT = process.env.PORT || 8000;
app.listen(PORT, function() { console.log('Bot en puerto ' + PORT); });
