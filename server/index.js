require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { loadConfig, saveConfig } = require('./config-store');
const { requireAdminAuth } = require('./admin-auth');

const DEMO_MODE = String(process.env.DEMO_MODE || '').toLowerCase() === 'true';
const PORT = Number(process.env.PORT || 9012);

// config = { refreshIntervalSeconds, games: [...] } — admin-editable at
// runtime, persisted to server/data/runtime-config.json (see
// config-store.js). Seeded from server/games.json + REFRESH_INTERVAL_SECONDS
// on first run.
let config = loadConfig();
saveConfig(config); // make sure the file exists from the very first run

function getGame(id) {
  return config.games.find((g) => g.id === id);
}

function getEnabledGames() {
  return config.games.filter((g) => g.enabled !== false);
}

const providers = {};
function getProvider(name) {
  if (!providers[name]) {
    providers[name] = require(path.join(__dirname, 'providers', `${name}.js`));
  }
  return providers[name];
}

function providerExists(name) {
  return fs.existsSync(path.join(__dirname, 'providers', `${name}.js`));
}

// cache[gameId] = { live, upcoming, recent, updatedAt, error }
const cache = {};

// pendingRecent[gameId] = matches that dropped off the "live" list but
// haven't shown up in the provider's official "recent/past" results yet.
// Providers can take a few minutes to flip a match's status and publish
// it to their past-matches endpoint after it actually ends, so we don't
// want a match to just vanish from the dashboard the moment it stops
// being "live" — we hold onto our own last-known copy of it until the
// official recent list catches up, then drop our copy in favor of the
// real one (matched by id) to avoid showing it twice.
const pendingRecent = {};

function reconcileRecent(gameId, previousLive, live, recent) {
  const liveIds = new Set(live.map((m) => m.id));
  const recentIds = new Set(recent.map((m) => m.id));
  const pending = pendingRecent[gameId] || [];

  for (const m of previousLive) {
    if (!liveIds.has(m.id) && !recentIds.has(m.id) && !pending.some((p) => p.id === m.id)) {
      pending.push(m);
    }
  }

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const stillPending = pending.filter(
    (m) => !recentIds.has(m.id) && m.beginAt && new Date(m.beginAt).getTime() >= cutoff
  );

  pendingRecent[gameId] = stillPending;
  return [...stillPending, ...recent];
}

async function refreshGame(game) {
  const providerName = DEMO_MODE ? 'mock' : game.provider;
  const previousLive = (cache[game.id] && cache[game.id].live) || [];
  try {
    const provider = getProvider(providerName);
    const { live, upcoming, recent } = await provider.getMatches({ slug: game.slug });
    cache[game.id] = {
      live,
      upcoming,
      recent: reconcileRecent(game.id, previousLive, live, recent || []),
      updatedAt: new Date().toISOString(),
      error: null,
      demo: DEMO_MODE || providerName === 'mock',
    };
  } catch (err) {
    console.error(`[${game.id}] refresh failed:`, err.message);
    try {
      const mock = getProvider('mock');
      const { live, upcoming, recent } = await mock.getMatches({ slug: game.slug });
      cache[game.id] = {
        live,
        upcoming,
        recent: recent || [],
        updatedAt: new Date().toISOString(),
        error: err.message,
        demo: true,
      };
    } catch (mockErr) {
      cache[game.id] = {
        live: [],
        upcoming: [],
        recent: [],
        updatedAt: new Date().toISOString(),
        error: err.message,
        demo: false,
      };
    }
  }
}

async function refreshAll() {
  await Promise.all(getEnabledGames().map(refreshGame));
}

// Self-rescheduling timer (instead of setInterval) so an admin changing
// the refresh interval takes effect immediately, without a restart.
let refreshTimer = null;
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    await refreshAll();
    scheduleRefresh();
  }, config.refreshIntervalSeconds * 1000);
}

const app = express();
app.use(express.json());

// Admin routes are registered before the public static mount so nothing
// under /admin can ever be served without authentication.
app.use('/admin', requireAdminAuth, express.static(path.join(__dirname, '..', 'admin')));

app.get('/api/admin/config', requireAdminAuth, (req, res) => {
  res.json({ refreshIntervalSeconds: config.refreshIntervalSeconds, games: config.games });
});

app.put('/api/admin/refresh-interval', requireAdminAuth, (req, res) => {
  const seconds = Number(req.body && req.body.seconds);
  if (!Number.isFinite(seconds) || seconds < 5) {
    return res.status(400).json({ error: 'seconds must be a number >= 5' });
  }
  config.refreshIntervalSeconds = seconds;
  saveConfig(config);
  scheduleRefresh();
  res.json({ ok: true, refreshIntervalSeconds: config.refreshIntervalSeconds });
});

app.put('/api/admin/games/:id', requireAdminAuth, (req, res) => {
  const game = getGame(req.params.id);
  if (!game) return res.status(404).json({ error: 'unknown game' });

  if (typeof req.body.enabled === 'boolean') {
    const wasEnabled = game.enabled !== false;
    game.enabled = req.body.enabled;
    saveConfig(config);
    if (!wasEnabled && game.enabled) {
      refreshGame(game); // populate the cache right away instead of waiting for the next cycle
    }
  }

  res.json({ ok: true, game });
});

app.post('/api/admin/games', requireAdminAuth, async (req, res) => {
  const body = req.body || {};
  const id = String(body.id || '').trim();
  const name = String(body.name || '').trim();
  const provider = String(body.provider || '').trim();
  const slug = String(body.slug || '').trim();
  const icon = String(body.icon || '').trim();
  const color = String(body.color || '').trim();
  const note = String(body.note || '').trim();

  if (!id || !name || !provider || !slug) {
    return res.status(400).json({ error: 'id, name, provider, and slug are required' });
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    return res.status(400).json({ error: 'id must be lowercase letters, numbers, and hyphens only' });
  }
  if (getGame(id)) {
    return res.status(409).json({ error: `a game with id "${id}" already exists` });
  }
  if (!providerExists(provider)) {
    return res.status(400).json({ error: `unknown provider "${provider}" — no server/providers/${provider}.js` });
  }

  const newGame = {
    id,
    name,
    provider,
    slug,
    icon: icon || '🎮',
    color: color || '#888888',
    enabled: true,
    ...(note ? { note } : {}),
  };

  config.games.push(newGame);
  saveConfig(config);
  await refreshGame(newGame);
  res.status(201).json({ ok: true, game: newGame });
});

// Public routes.
app.get('/api/games', (req, res) => {
  res.json(
    getEnabledGames().map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      color: g.color,
      note: g.note || null,
    }))
  );
});

app.get('/api/matches/:gameId', (req, res) => {
  const game = getEnabledGames().find((g) => g.id === req.params.gameId);
  if (!game) return res.status(404).json({ error: 'unknown game' });
  const data = cache[game.id] || { live: [], upcoming: [], recent: [], updatedAt: null, error: 'not loaded yet' };
  res.json({ ...data, refreshIntervalSeconds: config.refreshIntervalSeconds });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));

refreshAll().then(() => {
  app.listen(PORT, () => {
    console.log(`Esports dashboard listening on http://localhost:${PORT}`);
  });
  scheduleRefresh();
});
