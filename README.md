# Esports Match Dashboard

Live/upcoming match dashboard, covering Dota 2, Counter-Strike 2, and a
Deadlock placeholder. Auto-refreshes, shows a live countdown to each match's
start time, runs in Docker, and is built so new games can be added without
touching the frontend.

Extra features:
- **Spoiler-free mode** — toggle in the header blurs live scores/results
  behind a "tap to reveal" until you're ready to see them.
- **Favourite teams** — click the star next to a team name to favourite it
  (saved in the browser). Matches involving a favourite team float to the
  top and get a highlighted border.
- **Favourites-only filter** — toggle in the header to hide every match
  that doesn't involve a favourited team, across both Live and Upcoming.
- **Watch button** — when PandaScore reports an official stream for a
  match, a "Watch" button opens it (Twitch/YouTube, whatever the official
  broadcaster used). There's no watch button for launching Dota 2's own
  in-client spectator — Valve doesn't expose a documented way to deep-link
  into spectating a specific pro match from outside the client.
- **Admin panel** (`/admin`) — change the refresh interval, enable/disable
  games, and add new ones, all without editing files or restarting. See
  [Admin panel](#admin-panel) below.

## Quick start (Docker)

```bash
cp .env.example .env
# edit .env and paste in a free PandaScore API key (see below)
docker compose up --build
```

Open **http://localhost:9012**.

The app listens on port `9012` both inside and outside the container (the
`docker-compose.yml` `ports:` line maps `9012:9012`, and `PORT=9012` is what
the Node process itself binds to) — so the port printed in the container
logs (`Esports dashboard listening on http://localhost:9012`) always matches
what you type in the browser. 9012 was picked specifically to avoid common
conflicts: 8080 and 9000 are both frequently already in use (Steam's own
debug port defaults to 8080, for instance).

If you ever do need a different port, change **both** the host side and the
container side together, and keep `PORT` in `environment:` equal to
whatever you put on the right of the colon in `ports:` — those two must
always match, or the container will listen on a port Docker isn't
forwarding to.

Before your first run, also set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in
`.env` — the admin panel refuses to work without both set. See
[Admin panel](#admin-panel).

### No API key yet? Try demo mode

```bash
cp .env.example .env
# set DEMO_MODE=true in .env
docker compose up --build
```

This renders the full UI with sample matches so you can see it working
immediately, then swap in a real key later.

## Getting a free PandaScore API key

Dota 2 match schedules come from [PandaScore](https://pandascore.co/). Their
free tier gives 1,000 requests/hour for schedule/result data (no credit
card required):

1. Create an account at https://pandascore.co/
2. Go to your account settings → API keys, and copy your token
3. Put it in `.env` as `PANDASCORE_API_KEY=...`

The free tier does not include live in-game stats (kill feed, gold, etc.),
but it does include match status (`not_started` / `running` / `finished`),
scheduled start times, teams, and league/tournament names — enough to power
the live section and countdowns.

## Deploying to a server without building there

A GitHub Actions workflow (`.github/workflows/docker-publish.yml`) builds
this image and publishes it to GitHub Container Registry on every push to
`main` — no Docker Desktop or local build step needed on the machine you're
deploying to.

Once you've pushed to GitHub and the workflow has run at least once (check
the **Actions** tab), pull and run the published image directly on your
server:

The recommended way is `docker-compose.prod.yml` (included in this repo) —
it pulls the published image instead of building it, so redeploys are one
command:

```bash
# one-time setup on the server
mkdir game-tracker && cd game-tracker
# copy docker-compose.prod.yml and .env.example from this repo onto the server
cp .env.example .env   # fill in PANDASCORE_API_KEY, ADMIN_USERNAME, ADMIN_PASSWORD, etc.

docker compose -f docker-compose.prod.yml up -d
```

To redeploy after pushing new commits (once the Actions workflow has
finished publishing):

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

That second command recreates the container only if the image actually
changed, so it's safe to run any time. The `./data` volume it mounts is
where admin panel changes (refresh interval, enabled/disabled games,
added games) persist — without it, every redeploy resets to whatever's in
`server/games.json` baked into the image.

If you'd rather not use Compose, the equivalent plain `docker run`:

```bash
docker pull ghcr.io/devdurs/game-tracker:latest

docker run -d \
  --name game-tracker \
  --restart unless-stopped \
  -p 9012:9012 \
  -v $(pwd)/data:/app/server/data \
  -e PANDASCORE_API_KEY=your_key_here \
  -e REFRESH_INTERVAL_SECONDS=30 \
  -e DEMO_MODE=false \
  -e PORT=9012 \
  -e ADMIN_USERNAME=your_admin_username \
  -e ADMIN_PASSWORD=your_admin_password \
  ghcr.io/devdurs/game-tracker:latest
```

If the package is private (GitHub defaults new packages to the same
visibility as the repo), authenticate first with a
[personal access token](https://github.com/settings/tokens) that has
`read:packages` scope:

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

To redeploy after pushing new commits: wait for the Actions workflow to
finish, then on the server run `docker pull ghcr.io/devdurs/game-tracker:latest`
followed by `docker stop game-tracker && docker rm game-tracker` and the
`docker run` command above again (or manage it with a `docker-compose.yml`
on the server that references `image: ghcr.io/devdurs/game-tracker:latest`
instead of `build: .`).

## Admin panel

Visit `/admin` (e.g. `http://localhost:9012/admin`) and log in with
`ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env` — the browser will prompt
for these via standard HTTP Basic Auth. From there you can:

- Change the refresh interval (applies immediately, no restart)
- Enable or disable any game (disabled games disappear from the public
  dashboard and stop being polled, saving PandaScore API quota)
- Add a new game, choosing an existing provider (`pandascore` or `mock`)
  and, for PandaScore, that game's PandaScore slug (e.g. `lol`, `valorant`,
  `overwatch`)

**No database is used or needed.** Admin changes are written to a small
JSON file at `server/data/runtime-config.json`. `server/games.json` stays
untouched as the built-in seed list (it's what bootstraps
`runtime-config.json` the very first time the app runs); after that, the
runtime file is the live source of truth. This is why the Docker setup
mounts `server/data` as a volume — without persisting that one file,
admin changes would be lost every time the container is rebuilt or
redeployed.

Adding a game through the admin panel only works for providers that
already exist as code in `server/providers/` — it's choosing between
`pandascore` (any game PandaScore supports) and `mock` (a placeholder,
same as Deadlock uses). Wiring up a genuinely new data source (like a
future real Deadlock API) still means writing a new file in
`server/providers/`, same as before — the admin panel doesn't write code,
just configuration.

Basic Auth sends credentials on every request, so this is only meant to
be used over HTTPS — fine given it's proxied through Cloudflare Tunnel,
but don't expose `/admin` directly over plain HTTP on the open internet.

## Running without Docker

```bash
npm install
cp .env.example .env   # add your API key
npm start
```

## Adding another game (e.g. Deadlock)

The easiest way is the [admin panel](#admin-panel) — no file editing or
restart needed for games using an existing provider. What follows is what
that form does under the hood, useful if you're editing the seed file
directly or writing a new provider.

Games are defined in `server/games.json` (the seed list — see
[Admin panel](#admin-panel) for how the *running* list actually gets
edited):

```json
{
  "id": "deadlock",
  "name": "Deadlock",
  "provider": "mock",
  "slug": "deadlock",
  "icon": "🕸️",
  "color": "#8e44ad",
  "enabled": true
}
```

- `provider` points to a file in `server/providers/` implementing:
  `async function getMatches({ slug }) -> { live: [...], upcoming: [...] }`
  using the normalized match shape documented at the top of
  `server/providers/pandascore.js`.
- Deadlock is included as a stub using `server/providers/mock.js` because
  there's no public esports schedule API for it yet (it's still early in
  its competitive scene). When one appears, copy `pandascore.js` as a
  template, implement the new provider, and point `deadlock`'s `provider`
  field at it.
- Any game PandaScore already supports (CS2, LoL, Valorant, Overwatch,
  Rainbow Six, etc.) can be added immediately — just add an entry with
  `"provider": "pandascore"` and the correct PandaScore game slug.
- Restart the server (or container) after editing `games.json`.

## Configuration

All via environment variables / `.env`:

| Variable | Default | Description |
|---|---|---|
| `PANDASCORE_API_KEY` | — | Required for real Dota 2 data |
| `REFRESH_INTERVAL_SECONDS` | `30` | How often the server polls PandaScore and the frontend polls the server |
| `DEMO_MODE` | `false` | Force all games to use sample data |
| `PORT` | `9012` | Server port (must match the container-side number in `docker-compose.yml`'s `ports:` line) |
| `ADMIN_USERNAME` | — | Required to use `/admin` |
| `ADMIN_PASSWORD` | — | Required to use `/admin` |

## How auto-refresh works

The server polls PandaScore in the background every
`REFRESH_INTERVAL_SECONDS` and caches results in memory. The frontend polls
the server's `/api/matches/:gameId` endpoint on the same interval, and each
match's countdown timer ticks down client-side every second between
refreshes. If PandaScore is unreachable or misconfigured, the dashboard
falls back to demo data and shows a banner rather than going blank.

## Project layout

```
server/
  index.js             express app, in-memory cache, refresh loop, admin routes
  config-store.js       loads/saves the runtime config (no database)
  admin-auth.js          HTTP Basic Auth middleware for /admin
  games.json              seed list of games (bootstraps runtime config on first run)
  data/                    runtime-config.json lives here — gitignored, mounted as a volume
  providers/
    pandascore.js       real data source (Dota 2, CS2, and other PandaScore games)
    mock.js              demo/placeholder data source
public/
  index.html, app.js, style.css   main dashboard (no build step, vanilla JS)
admin/
  index.html, admin.js, admin.css   admin panel — only reachable via the
                                     authenticated /admin route, not part
                                     of the public static folder
Dockerfile
docker-compose.yml
```
