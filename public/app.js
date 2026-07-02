let games = [];
let activeGame = null;
let pollTimer = null;
let countdownTimer = null;
let refreshIntervalSeconds = 30;
let lastLive = [];
let lastUpcoming = [];
let lastRecent = [];

// --- Favourite teams (persisted locally in the browser) ---
let favoriteTeams = new Set(JSON.parse(localStorage.getItem('favoriteTeams') || '[]'));

function isFavorite(name) {
  return favoriteTeams.has(name);
}

function toggleFavorite(name) {
  if (favoriteTeams.has(name)) {
    favoriteTeams.delete(name);
  } else {
    favoriteTeams.add(name);
  }
  localStorage.setItem('favoriteTeams', JSON.stringify(Array.from(favoriteTeams)));
  renderLive(lastLive);
  renderUpcoming(lastUpcoming);
  renderRecent(lastRecent);
}

// --- Favourites-only filter (persisted locally) ---
let favoritesOnly = localStorage.getItem('favoritesOnly') === 'true';

function applyFavoritesButtonState() {
  var btn = document.getElementById('favorites-toggle');
  btn.classList.toggle('active', favoritesOnly);
  btn.textContent = favoritesOnly ? '★ Favourites only' : '☆ Favourites only';
}

function toggleFavoritesOnly() {
  favoritesOnly = !favoritesOnly;
  localStorage.setItem('favoritesOnly', String(favoritesOnly));
  applyFavoritesButtonState();
  renderLive(lastLive);
  renderUpcoming(lastUpcoming);
  renderRecent(lastRecent);
}

// --- Spoiler-free mode (persisted locally) ---
let spoilerMode = localStorage.getItem('spoilerMode') === 'true';

function applySpoilerButtonState() {
  var btn = document.getElementById('spoiler-toggle');
  btn.classList.toggle('active', spoilerMode);
  btn.textContent = spoilerMode ? 'Spoilers hidden' : 'Spoiler-free';
}

function toggleSpoilerMode() {
  spoilerMode = !spoilerMode;
  localStorage.setItem('spoilerMode', String(spoilerMode));
  applySpoilerButtonState();
  renderLive(lastLive);
  renderUpcoming(lastUpcoming);
  renderRecent(lastRecent);
}

function el(id) {
  return document.getElementById(id);
}

function loadGames() {
  return fetch('/api/games')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      games = data;
      var tabs = el('game-tabs');
      tabs.innerHTML = '';
      games.forEach(function (g, i) {
        var btn = document.createElement('button');
        btn.className = 'tab' + (i === 0 ? ' active' : '');
        btn.textContent = (g.icon || '') + ' ' + g.name;
        btn.onclick = function () { setActiveGame(g.id); };
        btn.dataset.gameId = g.id;
        tabs.appendChild(btn);
      });
      if (games.length) setActiveGame(games[0].id);
    });
}

function setActiveGame(gameId) {
  activeGame = gameId;
  var tabButtons = document.querySelectorAll('.tab[data-game-id]');
  for (var i = 0; i < tabButtons.length; i++) {
    tabButtons[i].classList.toggle('active', tabButtons[i].dataset.gameId === gameId);
  }
  var game = games.find(function (g) { return g.id === gameId; });
  el('active-icon').textContent = game ? (game.icon || 'game') : 'game';
  fetchMatches();
}

function fmtTime(iso) {
  if (!iso) return 'TBD';
  var d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function countdownString(iso) {
  var diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'starting now';
  var s = Math.floor(diff / 1000);
  var days = Math.floor(s / 86400);
  var hours = Math.floor((s % 86400) / 3600);
  var mins = Math.floor((s % 3600) / 60);
  var secs = s % 60;
  if (days > 0) return days + 'd ' + hours + 'h ' + mins + 'm';
  if (hours > 0) return hours + 'h ' + mins + 'm ' + secs + 's';
  return mins + 'm ' + secs + 's';
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;');
}

function teamHtml(team) {
  var img = team.image
    ? '<img src="' + team.image + '" alt="" onerror="this.style.display=\'none\'">'
    : '';
  var fav = isFavorite(team.name);
  var star = '';
  if (team.name && team.name !== 'TBD') {
    star =
      '<button class="fav-star' + (fav ? ' active' : '') +
      '" title="Favourite ' + escapeAttr(team.name) +
      '" data-team="' + escapeAttr(team.name) +
      '" onclick="toggleFavorite(this.dataset.team); event.stopPropagation();">' +
      (fav ? '★' : '☆') + '</button>';
  }
  return (
    '<span class="team' + (fav ? ' favorite' : '') + '">' +
    img + team.name + star + '</span>'
  );
}

function matchHasFavorite(m) {
  return isFavorite(m.teamA.name) || isFavorite(m.teamB.name);
}

function watchButtonHtml(m) {
  if (!m.streamUrl) return '';
  return (
    '<a class="watch-btn" href="' + escapeAttr(m.streamUrl) +
    '" target="_blank" rel="noopener noreferrer">Watch</a>'
  );
}

function spoilerWrap(innerHtml, matchId, key) {
  if (!spoilerMode) return innerHtml;
  var id = 'spoiler-' + matchId + '-' + key;
  return (
    '<span class="spoiler-box" data-spoiler-id="' + id +
    '" onclick="revealSpoiler(\'' + id + '\')">' +
    '<span class="spoiler-hidden">Tap to reveal</span>' +
    '<span class="spoiler-content hidden">' + innerHtml + '</span>' +
    '</span>'
  );
}

function revealSpoiler(id) {
  var box = document.querySelector('[data-spoiler-id="' + id + '"]');
  if (!box) return;
  box.querySelector('.spoiler-hidden').classList.add('hidden');
  box.querySelector('.spoiler-content').classList.remove('hidden');
}

function matchMetaLine(m) {
  return [m.league, m.serie, m.tournament].filter(Boolean).join(' - ') || '-';
}

function agoString(iso) {
  if (!iso) return '';
  var diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ' + (mins % 60) + 'm ago';
  var days = Math.floor(hours / 24);
  return days + 'd ago';
}

function renderLive(matches) {
  lastLive = matches;
  var wrap = el('live-matches');
  var visible = favoritesOnly ? matches.filter(matchHasFavorite) : matches;
  if (!visible.length) {
    wrap.innerHTML = favoritesOnly && matches.length
      ? '<div class="empty">No live matches involving a favourited team right now.</div>'
      : '<div class="empty">No live matches right now.</div>';
    return;
  }
  var sorted = visible.slice().sort(function (a, b) {
    return (matchHasFavorite(b) ? 1 : 0) - (matchHasFavorite(a) ? 1 : 0);
  });
  wrap.innerHTML = sorted
    .map(function (m) {
      var scoreHtml = m.scoreA != null ? '<span class="score">' + m.scoreA + ' - ' + m.scoreB + '</span>' : '';
      var cardClass = 'match-card' + (matchHasFavorite(m) ? ' favorite-card' : '');
      return (
        '<div class="' + cardClass + '">' +
        '<div class="match-teams">' + teamHtml(m.teamA) + '<span class="vs">vs</span>' + teamHtml(m.teamB) + '</div>' +
        '<div class="match-meta">' + matchMetaLine(m) + '</div>' +
        '<div class="match-right">' +
        watchButtonHtml(m) +
        spoilerWrap(scoreHtml, m.id, 'score') +
        '<span class="badge-live">LIVE</span>' +
        '</div>' +
        '</div>'
      );
    })
    .join('');
}

function renderUpcoming(matches) {
  lastUpcoming = matches;
  var wrap = el('upcoming-matches');
  var visible = favoritesOnly ? matches.filter(matchHasFavorite) : matches;
  if (!visible.length) {
    wrap.innerHTML = favoritesOnly && matches.length
      ? '<div class="empty">No upcoming matches involving a favourited team.</div>'
      : '<div class="empty">No upcoming matches scheduled.</div>';
    return;
  }
  var sorted = visible.slice().sort(function (a, b) {
    return (matchHasFavorite(b) ? 1 : 0) - (matchHasFavorite(a) ? 1 : 0);
  });
  wrap.innerHTML = sorted
    .map(function (m) {
      var cardClass = 'match-card' + (matchHasFavorite(m) ? ' favorite-card' : '');
      var countdown = m.beginAt ? countdownString(m.beginAt) : 'TBD';
      return (
        '<div class="' + cardClass + '" data-begin="' + (m.beginAt || '') + '">' +
        '<div class="match-teams">' + teamHtml(m.teamA) + '<span class="vs">vs</span>' + teamHtml(m.teamB) + '</div>' +
        '<div class="match-meta">' + matchMetaLine(m) + '<br/>' + fmtTime(m.beginAt) + '</div>' +
        '<div class="match-right">' +
        watchButtonHtml(m) +
        '<span class="countdown" data-countdown="' + (m.beginAt || '') + '">' + countdown + '</span>' +
        '</div>' +
        '</div>'
      );
    })
    .join('');
}

function renderRecent(matches) {
  lastRecent = matches;
  var wrap = el('recent-matches');
  var visible = favoritesOnly ? matches.filter(matchHasFavorite) : matches;
  if (!visible.length) {
    wrap.innerHTML = favoritesOnly && matches.length
      ? '<div class="empty">No results in the last 24h involving a favourited team.</div>'
      : '<div class="empty">No matches finished in the last 24 hours.</div>';
    return;
  }
  var sorted = visible.slice().sort(function (a, b) {
    return new Date(b.beginAt || 0) - new Date(a.beginAt || 0);
  });
  wrap.innerHTML = sorted
    .map(function (m) {
      var cardClass = 'match-card' + (matchHasFavorite(m) ? ' favorite-card' : '');
      var scoreHtml = m.scoreA != null ? '<span class="score">' + m.scoreA + ' - ' + m.scoreB + '</span>' : '';
      return (
        '<div class="' + cardClass + '">' +
        '<div class="match-teams">' + teamHtml(m.teamA) + '<span class="vs">vs</span>' + teamHtml(m.teamB) + '</div>' +
        '<div class="match-meta">' + matchMetaLine(m) + '<br/>' + agoString(m.beginAt) + '</div>' +
        '<div class="match-right">' +
        spoilerWrap(scoreHtml, m.id, 'recent-score') +
        '</div>' +
        '</div>'
      );
    })
    .join('');
}

function tickCountdowns() {
  var nodes = document.querySelectorAll('[data-countdown]');
  for (var i = 0; i < nodes.length; i++) {
    var iso = nodes[i].getAttribute('data-countdown');
    if (iso) nodes[i].textContent = countdownString(iso);
  }
}

function fetchMatches() {
  if (!activeGame) return;
  fetch('/api/matches/' + activeGame)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      refreshIntervalSeconds = data.refreshIntervalSeconds || refreshIntervalSeconds;
      el('refresh-interval').textContent = refreshIntervalSeconds;

      renderLive(data.live || []);
      renderUpcoming(data.upcoming || []);
      renderRecent(data.recent || []);

      el('last-updated').textContent = data.updatedAt
        ? new Date(data.updatedAt).toLocaleTimeString()
        : '-';

      var noteEl = el('note');
      var game = games.find(function (g) { return g.id === activeGame; });
      var messages = [];
      if (data.error) messages.push('Live data unavailable (' + data.error + '). Showing demo data.');
      else if (data.demo) messages.push('Showing demo data.');
      if (game && game.note) messages.push(game.note);
      if (messages.length) {
        noteEl.textContent = messages.join(' ');
        noteEl.classList.remove('hidden');
      } else {
        noteEl.classList.add('hidden');
      }

      el('status-dot').className = 'dot' + (data.error ? ' error' : '');
      el('status-text').textContent = data.error ? 'degraded' : 'live';
    })
    .catch(function () {
      el('status-dot').className = 'dot error';
      el('status-text').textContent = 'offline';
    });
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchMatches, refreshIntervalSeconds * 1000);
}

el('spoiler-toggle').addEventListener('click', toggleSpoilerMode);
applySpoilerButtonState();

el('favorites-toggle').addEventListener('click', toggleFavoritesOnly);
applyFavoritesButtonState();

loadGames().then(function () {
  countdownTimer = setInterval(tickCountdowns, 1000);
  startPolling();
  setInterval(startPolling, 60000);
});
