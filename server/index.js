require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const games = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'games.json'), 'utf8')
).filter((g) => g.enabled !== false);

const REFRESH_INTERVAL_SECONDS = Number(process.env.REFRESH_INTERVAL_SECONDS || 30);
const DEMO_MODE = String(process.env.DEMO_MODE || '').toLowerCase() === 'true';
const PORT = Number(process.env.PORT || 8080);

const providers = {};
function getProvider(name) {
  if (!providers[name]) {
    providers[name] = require(path.join(__dirname, 'providers', `${name}.js`));
  }
  return providers[name];
}

// cache[gameId] = { live, upcoming, updatedAt, error }
const cache = {};

async function refreshGame(game) {
  const providerName = DEMO_MODE ? 'mock' : game.provider;
  try {
    const provider = getProvider(providerName);
    const { live, upcoming } = await provider.getMatches({ slug: game.slug });
    cache[game.id] = {
      live,
      upcoming,
      updatedAt: new Date().toISOString(),
      error: null,
      demo: DEMO_MODE || providerName === 'mock',
    };
  } catch (err) {
    console.error(`[${game.id}] refresh failed:`, err.message);
    // Fall back to mock data so the dashboard still renders something
    // useful (e.g. missing API key) instead of a blank screen.
    try {
      const mock = getProvider('mock');
      const { live, upcoming } = await mock.getMatches({ slug: game.slug });
      cache[game.id] = {
        live,
        upcoming,
        updatedAt: new Date().toISOString(),
        error: err.message,
        demo: true,
      };
    } catch (mockErr) {
      cache[game.id] = {
        live: [],
        upcoming: [],
        updatedAt: new Date().toISOString(),
        error: err.message,
        demo: false,
      };
    }
  }
}

async function refreshAll() {
  await Promise.all(games.map(refreshGame));
}

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/games', (req, res) => {
  res.json(
    games.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      color: g.color,
      note: g.note || null,
    }))
  );
});

app.get('/api/matches/:gameId', (req, res) => {
  const game = games.find((g) => g.id === req.params.gameId);
  if (!game) return res.status(404).json({ error: 'unknown game' });
  const data = cache[game.id] || { live: [], upcoming: [], updatedAt: null, error: 'not loaded yet' };
  res.json({ ...data, refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

refreshAll().then(() => {
  app.listen(PORT, () => {
    console.log(`Esports dashboard listening on http://localhost:${PORT}`);
  });
});

setInterval(refreshAll, REFRESH_INTERVAL_SECONDS * 1000);
