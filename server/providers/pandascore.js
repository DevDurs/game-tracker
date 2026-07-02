// PandaScore provider — https://developers.pandascore.co
// Free tier: 1000 req/hour, schedules + results (match status includes
// "running", "not_started", "finished"). Requires a free API key.
const fetch = require('node-fetch');

const BASE = 'https://api.pandascore.co';

function normalizeMatch(m) {
  const opponents = (m.opponents || []).map((o) => o.opponent).filter(Boolean);
  const [teamA, teamB] = opponents;

  return {
    id: m.id,
    status: m.status, // not_started | running | finished | canceled | postponed
    beginAt: m.begin_at || m.scheduled_at,
    scheduledAt: m.scheduled_at,
    league: m.league ? m.league.name : null,
    serie: m.serie ? m.serie.full_name : null,
    tournament: m.tournament ? m.tournament.name : null,
    matchType: m.match_type,
    bestOf: m.number_of_games,
    streamUrl:
      (m.streams_list && m.streams_list.find((s) => s.official)?.raw_url) ||
      (m.streams_list && m.streams_list[0]?.raw_url) ||
      null,
    teamA: teamA
      ? { name: teamA.name, image: teamA.image_url, id: teamA.id }
      : { name: 'TBD', image: null, id: null },
    teamB: teamB
      ? { name: teamB.name, image: teamB.image_url, id: teamB.id }
      : { name: 'TBD', image: null, id: null },
    scoreA: m.results && m.results[0] ? m.results[0].score : null,
    scoreB: m.results && m.results[1] ? m.results[1].score : null,
  };
}

async function fetchMatches(status, slug, apiKey, sort) {
  const url = `${BASE}/${slug}/matches/${status}?per_page=25&sort=${sort || 'begin_at'}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PandaScore ${status} fetch failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.map(normalizeMatch);
}

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000; // last 24 hours

async function getMatches({ slug }) {
  const apiKey = process.env.PANDASCORE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'PANDASCORE_API_KEY is not set. Get a free key at https://pandascore.co/ and add it to .env'
    );
  }

  const [running, upcoming, past] = await Promise.all([
    fetchMatches('running', slug, apiKey),
    fetchMatches('upcoming', slug, apiKey),
    // 'past' would otherwise sort oldest-first by begin_at; flip it so we
    // get the most recently finished matches, not the oldest ones.
    fetchMatches('past', slug, apiKey, '-begin_at'),
  ]);

  const cutoff = Date.now() - RECENT_WINDOW_MS;
  const recent = past.filter((m) => m.beginAt && new Date(m.beginAt).getTime() >= cutoff);

  return { live: running, upcoming, recent };
}

module.exports = { getMatches };
