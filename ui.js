// ui.js — DOM manipulation only. No business logic, no API calls.

// ─── Views ────────────────────────────────────────────────────────────────────

const VIEWS = ['credentials-view', 'login-view', 'setup-view', 'player-view'];

function showOnly(id) {
  for (const v of VIEWS) document.getElementById(v).hidden = (v !== id);
}

export function showCredentialsView() { showOnly('credentials-view'); }
export function showLoginView()       { showOnly('login-view'); }
export function showSetupView()       { showOnly('setup-view'); }
export function showPlayerView()      { showOnly('player-view'); }

export function getSetupInput() {
  return document.getElementById('setup-input').value;
}

export function setSetupInput(value) {
  document.getElementById('setup-input').value = value;
}

export function getClientIdInput() {
  return document.getElementById('client-id-input').value;
}

export function setClientIdInput(value) {
  document.getElementById('client-id-input').value = value;
}

export function setRedirectUriDisplay(uri) {
  document.getElementById('redirect-uri-display').textContent = uri;
}

// ─── Error banner ─────────────────────────────────────────────────────────────

export function showError(message) {
  const el      = document.getElementById('error-msg');
  el.textContent = message;
  el.hidden      = false;
}

export function hideError() {
  document.getElementById('error-msg').hidden = true;
}

// ─── Playlist list ────────────────────────────────────────────────────────────

/**
 * Render the playlist list, marking the active item.
 * @param {Array<{name: string, uri: string}>} playlists
 * @param {string|null}  activeUri
 * @param {Function}     onSelect - (playlist) => void
 */
export function renderPlaylists(playlists, activeUri, onSelect) {
  const list   = document.getElementById('playlist-list');
  list.innerHTML = '';

  playlists.forEach((pl, i) => {
    const li = document.createElement('li');

    const hint      = document.createElement('span');
    hint.className  = 'index-hint';
    hint.textContent = `${i + 1}.`;
    hint.setAttribute('aria-hidden', 'true');

    li.appendChild(hint);
    li.appendChild(document.createTextNode(pl.name));

    if (pl.uri === activeUri) li.classList.add('active');

    li.addEventListener('click', () => onSelect(pl));
    list.appendChild(li);
  });
}

// ─── Now playing ──────────────────────────────────────────────────────────────

/**
 * @param {string|null} trackName
 * @param {string|null} artistName
 */
export function updateNowPlaying(trackName, artistName) {
  document.getElementById('track-name').textContent  = trackName  || '—';
  document.getElementById('artist-name').textContent = artistName || '';
}

/**
 * @param {boolean} isPaused
 */
export function updatePlayPauseButton(isPaused) {
  const btn        = document.getElementById('btn-playpause');
  btn.textContent  = isPaused ? '▶' : '⏸';
  btn.setAttribute('aria-label', isPaused ? 'Play' : 'Pause');
  btn.title        = isPaused ? 'Play (Space)' : 'Pause (Space)';
}

// ─── Controls state ───────────────────────────────────────────────────────────

/**
 * Enable or disable all transport buttons.
 * @param {boolean} enabled
 */
export function setControlsEnabled(enabled) {
  ['btn-prev', 'btn-playpause', 'btn-next'].forEach(id => {
    document.getElementById(id).disabled = !enabled;
  });
}

/**
 * Set the status message under the controls. Pass '' to clear.
 * @param {string} text
 */
export function setStatus(text) {
  document.getElementById('status-msg').textContent = text;
}

/**
 * Toggle the visual "disabled" state on the playlist list. Clicks are still
 * gated in the handler — this is purely a visual cue.
 * @param {boolean} disabled
 */
export function setPlaylistsDisabled(disabled) {
  const list = document.getElementById('playlist-list');
  if (list) list.classList.toggle('disabled', disabled);
}

// ─── Keyboard bindings ────────────────────────────────────────────────────────

/**
 * Bind keyboard shortcuts. Call once after the player view is shown.
 * @param {{ togglePlay: Function, next: Function, prev: Function, selectByIndex: Function }} handlers
 */
export function bindKeyboard(handlers) {
  document.addEventListener('keydown', e => {
    // Don't hijack shortcuts when focus is in an input
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName)) return;

    switch (e.key) {
      case ' ':
        e.preventDefault(); // prevent page scroll
        handlers.togglePlay();
        break;
      case 'ArrowRight':
        e.preventDefault();
        handlers.next();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        handlers.prev();
        break;
      default:
        if (e.key >= '1' && e.key <= '6') {
          handlers.selectByIndex(parseInt(e.key, 10) - 1);
        }
    }
  });
}
