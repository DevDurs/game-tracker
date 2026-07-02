// Runtime, admin-editable configuration — no database needed for this.
//
// server/games.json is the built-in "seed" list shipped with the code
// (stays clean in git). The first time the app runs, it's copied into
// server/data/runtime-config.json, which is what the admin panel actually
// reads and writes from then on. That file should live on a mounted
// volume (see docker-compose.yml) so admin changes survive container
// rebuilds/redeploys instead of being baked into the image.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'runtime-config.json');
const SEED_GAMES_PATH = path.join(__dirname, 'games.json');

function loadSeedGames() {
  return JSON.parse(fs.readFileSync(SEED_GAMES_PATH, 'utf8'));
}

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (err) {
      console.error(
        'Failed to parse server/data/runtime-config.json, falling back to seed games.json:',
        err.message
      );
    }
  }
  return {
    refreshIntervalSeconds: Number(process.env.REFRESH_INTERVAL_SECONDS || 30),
    // Off by default: PandaScore's free tier doesn't include past-match
    // results (that's the paid "Historical Data" tier, priced per
    // videogame). Leaving this on burns a request per game per refresh
    // for data that mostly comes back empty. See admin panel note.
    recentResultsEnabled: false,
    games: loadSeedGames(),
  };
}

function saveConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
  fs.renameSync(tmpPath, CONFIG_PATH);
}

module.exports = { loadConfig, saveConfig };
