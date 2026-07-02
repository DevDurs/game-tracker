// Placeholder/demo provider. Used for games that don't have a wired-up
// real data source yet (e.g. Deadlock, which has no public esports
// schedule API as of writing), and as a no-key fallback demo for any game.
//
// Swap this out once a real API exists: copy pandascore.js as a template,
// implement getMatches({ slug }) -> { live: [...], upcoming: [...] }
// using the same normalized match shape, then set "provider" in
// server/games.json to your new provider's filename (without .js).

function inMinutes(mins) {
  return new Date(Date.now() + mins * 60 * 1000).toISOString();
}

async function getMatches({ slug }) {
  return {
    live: [],
    recent: [
      {
        id: `${slug}-demo-recent-1`,
        status: 'finished',
        beginAt: inMinutes(-300),
        scheduledAt: inMinutes(-300),
        league: 'Demo League',
        serie: 'Season 1',
        tournament: 'Playoffs',
        matchType: 'best_of',
        bestOf: 3,
        streamUrl: null,
        teamA: { name: 'Team Epsilon', image: null, id: null },
        teamB: { name: 'Team Zeta', image: null, id: null },
        scoreA: 2,
        scoreB: 1,
      },
    ],
    upcoming: [
      {
        id: `${slug}-demo-1`,
        status: 'not_started',
        beginAt: inMinutes(45),
        scheduledAt: inMinutes(45),
        league: 'Demo League',
        serie: 'Season 1',
        tournament: 'Playoffs',
        matchType: 'best_of',
        bestOf: 3,
        streamUrl: null,
        teamA: { name: 'Team Alpha', image: null, id: null },
        teamB: { name: 'Team Beta', image: null, id: null },
        scoreA: null,
        scoreB: null,
      },
      {
        id: `${slug}-demo-2`,
        status: 'not_started',
        beginAt: inMinutes(180),
        scheduledAt: inMinutes(180),
        league: 'Demo League',
        serie: 'Season 1',
        tournament: 'Playoffs',
        matchType: 'best_of',
        bestOf: 5,
        streamUrl: null,
        teamA: { name: 'Team Gamma', image: null, id: null },
        teamB: { name: 'Team Delta', image: null, id: null },
        scoreA: null,
        scoreB: null,
      },
    ],
  };
}

module.exports = { getMatches };
