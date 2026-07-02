function el(id) {
  return document.getElementById(id);
}

function showNote(msg, isError) {
  var n = el('admin-note');
  n.textContent = msg;
  n.classList.remove('hidden');
  n.style.borderColor = isError ? '#e74c3c' : '#574a1a';
  n.style.color = isError ? '#e74c3c' : '#e6c86e';
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function renderGames(games) {
  var wrap = el('games-list');
  if (!games.length) {
    wrap.innerHTML = '<div class="empty">No games configured.</div>';
    return;
  }
  wrap.innerHTML = games
    .map(function (g) {
      return (
        '<div class="admin-game-row">' +
        '<span class="admin-game-icon">' + escapeHtml(g.icon || '') + '</span>' +
        '<span class="admin-game-name">' +
        escapeHtml(g.name) +
        ' <span class="admin-muted">(' + escapeHtml(g.id) + ' · ' + escapeHtml(g.provider) + ':' + escapeHtml(g.slug) + ')</span>' +
        '</span>' +
        (g.note ? '<span class="admin-muted admin-note-inline">' + escapeHtml(g.note) + '</span>' : '') +
        '<label class="admin-toggle">' +
        '<input type="checkbox" data-id="' + escapeHtml(g.id) + '" ' + (g.enabled !== false ? 'checked' : '') + ' />' +
        'enabled' +
        '</label>' +
        '<button type="button" class="admin-remove-btn" data-id="' + escapeHtml(g.id) + '" ' +
        'data-name="' + escapeHtml(g.name) + '" title="Remove this game">Remove</button>' +
        '</div>'
      );
    })
    .join('');

  var boxes = wrap.querySelectorAll('input[type=checkbox]');
  for (var i = 0; i < boxes.length; i++) {
    boxes[i].addEventListener('change', function (e) {
      updateGameEnabled(e.target.dataset.id, e.target.checked);
    });
  }

  var removeButtons = wrap.querySelectorAll('.admin-remove-btn');
  for (var j = 0; j < removeButtons.length; j++) {
    removeButtons[j].addEventListener('click', function (e) {
      var id = e.target.dataset.id;
      var name = e.target.dataset.name;
      if (!window.confirm('Remove "' + name + '"? This deletes it from the config entirely — you\'ll need to re-add it via the form below to get it back.')) {
        return;
      }
      removeGame(id, name);
    });
  }
}

function removeGame(id, name) {
  fetch('/api/admin/games/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.error) {
        showNote(data.error, true);
        return;
      }
      showNote('Removed ' + name + '.', false);
      loadConfig();
    })
    .catch(function () {
      showNote('Failed to remove ' + name + '.', true);
    });
}

function loadConfig() {
  fetch('/api/admin/config')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      el('refresh-input').value = data.refreshIntervalSeconds;
      el('recent-results-input').checked = Boolean(data.recentResultsEnabled);
      renderGames(data.games);
    })
    .catch(function (err) {
      showNote('Failed to load config: ' + err.message, true);
    });
}

function updateGameEnabled(id, enabled) {
  fetch('/api/admin/games/' + encodeURIComponent(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: enabled }),
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.error) {
        showNote(data.error, true);
        return;
      }
      showNote((enabled ? 'Enabled ' : 'Disabled ') + id + '.', false);
    })
    .catch(function () {
      showNote('Failed to update ' + id + '.', true);
    });
}

el('refresh-save').addEventListener('click', function () {
  var seconds = Number(el('refresh-input').value);
  fetch('/api/admin/refresh-interval', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seconds: seconds }),
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.error) {
        showNote(data.error, true);
        return;
      }
      showNote('Refresh interval set to ' + data.refreshIntervalSeconds + 's.', false);
    })
    .catch(function () {
      showNote('Failed to update refresh interval.', true);
    });
});

el('recent-results-input').addEventListener('change', function (e) {
  var enabled = e.target.checked;
  fetch('/api/admin/recent-results', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: enabled }),
  })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.error) {
        showNote(data.error, true);
        return;
      }
      showNote('Recent Results ' + (enabled ? 'enabled' : 'disabled') + '.', false);
    })
    .catch(function () {
      showNote('Failed to update Recent Results setting.', true);
    });
});

el('add-game-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var form = e.target;
  var payload = {
    id: form.id.value.trim(),
    name: form.name.value.trim(),
    icon: form.icon.value.trim(),
    color: form.color.value,
    provider: form.provider.value,
    slug: form.slug.value.trim(),
    note: form.note.value.trim(),
  };
  fetch('/api/admin/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(function (res) {
      return res.json().then(function (data) {
        return { status: res.status, data: data };
      });
    })
    .then(function (result) {
      if (result.data.error) {
        showNote(result.data.error, true);
        return;
      }
      showNote('Added ' + payload.name + '.', false);
      form.reset();
      loadConfig();
    })
    .catch(function () {
      showNote('Failed to add game.', true);
    });
});

loadConfig();
