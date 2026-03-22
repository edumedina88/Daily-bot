const express = require('express');
const twilio = require('twilio');
const app = express();
app.use(express.urlencoded({ extended: false }));

app.post('/webhook', async (req, res) => {
  const msg = (req.body.Body || '').trim().toLowerCase();
  const from = req.body.From;
  const twiml = new twilio.twiml.MessagingResponse();
  if (msg === 'daily') {
    twiml.message('Generando informe...');
    res.type('text/xml').send(twiml.toString());
    generateDaily(from);
  } else {
    twiml.message('Escribi daily para el informe');
    res.type('text/xml').send(twiml.toString());
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
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({ from: 'whatsapp:+14155238886', to: to, body: text.trim().substring(0, 1500) });
  } catch (err) { console.error('Error:', err); }
}

const PORT = process.env.PORT || 8000;
app.listen(PORT, function() { console.log('Bot en puerto ' + PORT); });
