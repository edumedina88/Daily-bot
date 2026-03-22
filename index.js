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
    const r = await fetch('http://api.remarkets.primary.com.ar/auth/getToken', {
      method: 'POST',
      headers: { 'X-Username': process.env.PRIMARY_USER, 'X-Password': process.env.PRIMARY_PASS }
    });
    const t = r.headers.get('X-Auth-Token');
    return t || null;
  } catch(e) { return null; }
}

async function getPrice(token, symbol) {
  try {
    const r = await fetch('http://api.remarkets.primary.com.ar/rest/marketdata/get?marketId=ROFX&symbol=' + encodeURIComponent(symbol) + '&entries=LA,OI,TV&level=1', {
      headers: { 'X-Auth-Token': token }
    });
    const d = await r.json();
    const la = d.marketData && d.marketData.LA;
    return la && la.price ? la.price : null;
  } catch(e) { return null; }
}

async function getMarketData() {
  const token = await getPrimaryToken();
  if (!token) return null;
  const [rofexAbr, rofexMay, al30, gd35, caucMay, s30n6] = await Promise.all([
    getPrice(token, 'DLR/ABR26'),
    getPrice(token, 'DLR/MAY26'),
    getPrice(token, 'AL30D/CI'),
    getPrice(token, 'GD35D/24hs'),
    getPrice(token, 'CAUC/MAY26'),
    getPrice(token, 'S30N6/24hs')
  ]);
  return { rofexAbr, rofexMay, al30, gd35, caucMay, s30n6 };
}

async function generateDaily(to) {
  const d = new Date();
  const fecha = d.getDate() + '/' + (d.getMonth() + 1);
  const mkt = await getMarketData();

  const mktStr = mkt ? [
    mkt.rofexAbr ? 'Rofex ABR26: $' + mkt.rofexAbr : '',
    mkt.rofexMay ? 'Rofex MAY26: $' + mkt.rofexMay : '',
    mkt.al30 ? 'AL30: USD ' + mkt.al30 : '',
    mkt.gd35 ? 'GD35: USD ' + mkt.gd35 : '',
    mkt.caucMay ? 'Caucion MAY26: ' + mkt.caucMay + '%' : '',
    mkt.s30n6 ? 'Lecap S30N6: ' + mkt.s30n6 : ''
  ].filter(Boolean).join(' | ') : '';

  const prompt = 'Sos un analista senior de mesa de dinero argentina con 20 anos de experiencia. Fecha: ' + fecha + '. Datos exactos de mercado del ultimo cierre:\n' + mktStr + '\n\nCon estos datos y buscando en la web (Ambito, Cronista, Infobae, iProfesional) genera un informe de 7 lineas MAXIMO para clientes corporativos sofisticados.\n\nNo seas un robot que lista datos. Se un analista que INTERPRETA: que implica la curva de Rofex para el carry? Los bonos estan caros o baratos vs emergentes? Hay tension de tasas o calma? Que dice el mercado que no dice la macro oficial?\n\nFormato sin markdown:\nINFORME DIARIO ' + fecha + '\n[Lectura del mercado hoy - una oracion que diga algo que valga la pena]\nDolar: oficial $X | CCL $X | blue $X | brecha X%\nTasas/Rofex: cauciones X% | Lecap X% | Rofex ABR $X (dev X% TNA) | carry: X\nBonos: AL30 $X | GD35 $X | riesgo pais X bps | [lectura rapida]\nBCRA: compro USD X M | acum USD X.XXX M | reservas USD XX.XXX M\n[Contexto politico o macro que mueva el amperimetro hoy]\n\nTono: Bloomberg en espanol. Preciso, directo, con criterio. Sin relleno.';

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
