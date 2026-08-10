const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// WebSocket server for clients
const wss = new WebSocket.Server({ server });

// Store latest prices from each DEX
const prices = {
  orca: {},
  raydium: {},
  meteora: {},
  jupiter: {},
  phoenix: {},
  lifinity: {}
};

// Jupiter token list cache
let tokenList = {};

// Fetch token list
async function loadTokens() {
  try {
    const res = await fetch('https://token.jup.ag/all');
    const tokens = await res.json();
    tokens.forEach(t => {
      tokenList[t.symbol.toUpperCase()] = t;
      tokenList[t.address] = t;
    });
    console.log(`Loaded ${tokens.length} tokens`);
  } catch (e) {
    console.error('Token load failed:', e.message);
  }
}
loadTokens();

// Connect to Jupiter price stream (polling every 500ms - closest to real-time)
async function pollJupiter() {
  const tokens = ['SOL', 'USDC', 'RAY', 'ORCA', 'BONK', 'WIF', 'JUP'];
  try {
    const mints = tokens.map(t => tokenList[t]?.address).filter(Boolean).join(',');
    if (!mints) return;
    
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${mints}`);
    const data = await res.json();
    
    Object.entries(data.data || {}).forEach(([mint, info]) => {
      const token = Object.values(tokenList).find(t => t.address === mint);
      if (token) {
        prices.jupiter[token.symbol] = {
          price: info.price,
          dex: 'Jupiter Aggregated',
          timestamp: Date.now()
        };
        broadcast({
          type: 'price',
          dex: 'jupiter',
          token: token.symbol,
          price: info.price,
          source: 'direct'
        });
      }
    });
  } catch (e) {
    console.error('Jupiter poll error:', e.message);
  }
}

// Poll Raydium
async function pollRaydium() {
  try {
    const res = await fetch('https://api.raydium.io/v2/main/price');
    const data = await res.json();
    Object.entries(data).forEach(([symbol, price]) => {
      prices.raydium[symbol] = { price: parseFloat(price), timestamp: Date.now() };
      broadcast({
        type: 'price',
        dex: 'raydium',
        token: symbol,
        price: parseFloat(price),
        source: 'direct'
      });
    });
  } catch (e) {}
}

// Poll Orca
async function pollOrca() {
  try {
    const res = await fetch('https://api.orca.so/v1/token/list');
    const data = await res.json();
    data.data?.forEach(token => {
      if (token.price) {
        prices.orca[token.symbol] = { price: token.price, timestamp: Date.now() };
        broadcast({
          type: 'price',
          dex: 'orca',
          token: token.symbol,
          price: token.price,
          source: 'direct'
        });
      }
    });
  } catch (e) {}
}

// Start polling
setInterval(pollJupiter, 500);
setInterval(pollRaydium, 1000);
setInterval(pollOrca, 1000);

// Broadcast to all clients
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Handle client connections
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  // Send current prices
  ws.send(JSON.stringify({ type: 'init', prices }));
  
  ws.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'search') {
        const symbol = data.token.toUpperCase();
        const token = tokenList[symbol];
        if (token) {
          // Get detailed quotes from Jupiter
          const res = await fetch(
            `https://quote-api.jup.ag/v6/quote?inputMint=${token.address}&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000&onlyDirectRoutes=false`
          );
          const quote = await res.json();
          ws.send(JSON.stringify({ type: 'quote', token: symbol, quote }));
        }
      }
    } catch (e) {}
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok', dexes: Object.keys(prices) }));
  
