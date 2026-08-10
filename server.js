const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.static('public'));
const server = app.listen(process.env.PORT || 3000);

const wss = new WebSocket.Server({ server });

// HARDCODED mints - token list wait cheyakunda
const TOKENS = {
  SOL: 'So11111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE'
};

async function fetchPrices() {
  try {
    const ids = Object.values(TOKENS).join(',');
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${ids}`);
    const data = await res.json();

    Object.entries(TOKENS).forEach(([symbol, mint]) => {
      const info = data.data[mint];
      if (info) {
        // Simulate different DEX prices (±0.3%)
        const base = info.price;
        const dexPrices = {
          jupiter: base,
          orca: base * (0.998 + Math.random()*0.004),
          raydium: base * (0.998 + Math.random()*0.004),
          meteora: base * (0.998 + Math.random()*0.004),
          phoenix: base * (0.998 + Math.random()*0.004)
        };

        Object.entries(dexPrices).forEach(([dex, price]) => {
          wss.clients.forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: 'price',
                dex,
                token: symbol,
                price
              }));
            }
          });
        });
      }
    });
  } catch(e) { console.log('fetch error', e.message); }
}

setInterval(fetchPrices, 800);
fetchPrices();

wss.on('connection', ws => {
  ws.send(JSON.stringify({type:'init'}));
});
