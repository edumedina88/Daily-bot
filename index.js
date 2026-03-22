async function getPrimaryToken() {
  const r = await fetch('https://api.remarkets.primary.com.ar/auth/getToken', {
    method: 'POST',
    headers: { 'X-Username': 'emedinadamestoy22765', 'X-Password': 'fxufgZ9$' }
  });
  return r.headers.get('X-Auth-Token');
}

async function testSimbolo(token, simbolo) {
  const r = await fetch('https://api.remarkets.primary.com.ar/rest/marketdata/get?marketId=ROFX&symbol=' + encodeURIComponent(simbolo) + '&entries=SE,LA,CL&level=1', {
    headers: { 'X-Auth-Token': token }
  });
  const d = await r.json();
  const md = d.marketData;
  if (!md) return null;
  const p = md.LA || md.SE || md.CL;
  return p && p.price ? p.price : null;
}

async function main() {
  const token = await getPrimaryToken();
  console.log('Token OK:', token ? 'si' : 'no');

  const sufijos = ['/24hs', 'D/24hs', '/CI', 'D/CI', '/48hs'];
  const tickers = ['S30N6', 'TZX26', 'TX26', 'AL30', 'GD30', 'GD35', 'TTJ26', 'CAUC'];

  for (const ticker of tickers) {
    for (const sufijo of sufijos) {
      const simbolo = ticker + sufijo;
      const precio = await testSimbolo(token, simbolo);
      if (precio) {
        console.log('FUNCIONA: ' + simbolo + ' = ' + precio);
      }
    }
  }
  console.log('Test terminado');
}

main().catch(console.error);
```

Después en Railway, andá a tu proyecto → **terminal** o **shell** y ejecutá:
```
node test.js
