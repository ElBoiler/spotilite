// main.js — Entry point. Wires auth → SDK → UI.
// All business logic lives here; modules handle I/O.

import {
  startAuth,
  handleCallback,
  getAccessToken,
  clearTokens,
  scheduleRefresh,
  getTokenExpiresIn,
  refreshTokens,
} from './auth.js';

import {
  playPlaylist,
  resumePlayback,
  pausePlayback,
  skipNext,
  skipPrevious,
} from './api.js';

import { initPlayer } from './player.js';

import {
  showLoginView,
  showSetupView,
  showPlayerView,
  showError,
  hideError,
  renderPlaylists,
  updateNowPlaying,
  updatePlayPauseButton,
  setControlsEnabled,
  bindKeyboard,
  getSetupInput,
  setSetupInput,
} from './ui.js';

// ─── Module-level state ───────────────────────────────────────────────────────

const clientId = window.SPOTIFY_CLIENT_ID;
if (!clientId) {
  document.body.textContent = 'Error: SPOTIFY_CLIENT_ID is not configured. Did you pass -e SPOTIFY_CLIENT_ID=... to docker run?';
  throw new Error('SPOTIFY_CLIENT_ID is not set');
}

let deviceId      = null;
let isPaused      = true;
let playlists     = [];
let activeUri     = null;
let _player       = null;
let _reconnecting = false;
let _refreshTimer = null;

// ─── Playlist storage (localStorage) ─────────────────────────────────────────

const PLAYLISTS_KEY = 'saved_playlists';

/** @returns {Array<{uri: string, name: string}>} */
function loadSavedPlaylists() {
  try {
    const raw = JSON.parse(localStorage.getItem(PLAYLISTS_KEY) || '[]');
    // Migrate old format (array of URI strings)
    if (raw.length && typeof raw[0] === 'string') {
      return raw.map((uri, i) => ({ uri, name: `Playlist ${i + 1}` }));
    }
    return raw;
  } catch { return []; }
}

/** @param {Array<{uri: string, name: string}>} items */
function savePlaylists(items) {
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(items));
}

/**
 * Parse textarea input into [{uri, name}] objects.
 * Each line may be:
 *   "Name | https://open.spotify.com/playlist/ID"
 *   "https://open.spotify.com/playlist/ID"
 *   "spotify:playlist:ID"
 *   "ID"  (bare 22-char base62)
 */
function parsePlaylistInput(raw) {
  const seen   = new Set();
  const result = [];

  for (const line of raw.split('\n').map(l => l.trim()).filter(Boolean)) {
    let name    = null;
    let urlPart = line;

    const pipe = line.indexOf('|');
    if (pipe !== -1) {
      name    = line.slice(0, pipe).trim() || null;
      urlPart = line.slice(pipe + 1).trim();
    }

    let uri = null;
    const m = urlPart.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/);
    if (m) {
      uri = `spotify:playlist:${m[1]}`;
    } else if (/^spotify:playlist:[A-Za-z0-9]+$/.test(urlPart)) {
      uri = urlPart;
    } else if (/^[A-Za-z0-9]{22}$/.test(urlPart)) {
      uri = `spotify:playlist:${urlPart}`;
    }

    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    result.push({ uri, name: name || `Playlist ${result.length + 1}` });
  }

  return result;
}

function playlistsToText(items) {
  return items
    .map(p => {
      const url = `https://open.spotify.com/playlist/${p.uri.replace('spotify:playlist:', '')}`;
      return `${p.name} | ${url}`;
    })
    .join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleApiError(err, context) {
  if (err.status === 401) {
    if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
    clearTokens();
    showLoginView();
    showError('Session expired. Please log in again.');
  } else {
    showError(`${context}: ${err.message}`);
  }
}

/**
 * Run an API call; if it fails with 401, try a single token refresh and retry
 * once. The access token may have expired between scheduled refreshes (e.g. the
 * laptop slept and the timer never fired) — refreshing on demand avoids ejecting
 * the user when their refresh token is still good. A terminal refresh failure
 * (dead refresh token) re-throws the 401 so handleApiError sends them to login.
 *
 * @template T
 * @param {() => Promise<T>} fn  - performs the Spotify API call
 * @returns {Promise<T>}
 */
async function withAuthRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.status !== 401) throw err;
    try {
      await refreshTokens(clientId); // single-flight; rotates token in sessionStorage
    } catch {
      throw err; // terminal or transient refresh failure — surface the original 401
    }
    return fn(); // retry once with the fresh token; a second 401 propagates
  }
}

function reRenderPlaylists() {
  renderPlaylists(playlists, activeUri, selectPlaylist);
}

// ─── Playlist selection ───────────────────────────────────────────────────────

async function selectPlaylist(playlist) {
  activeUri = playlist.uri;
  reRenderPlaylists();

  try {
    await withAuthRetry(() => playPlaylist(getAccessToken(), deviceId, playlist.uri));
    hideError();
  } catch (err) {
    handleApiError(err, 'Play playlist');
  }
}

// ─── Transport ────────────────────────────────────────────────────────────────

async function handlePrev() {
  try {
    await withAuthRetry(() => skipPrevious(getAccessToken()));
    hideError();
  } catch (err) {
    handleApiError(err, 'Skip previous');
  }
}

async function handleTogglePlay() {
  try {
    if (isPaused) {
      await withAuthRetry(() => resumePlayback(getAccessToken(), deviceId));
    } else {
      await withAuthRetry(() => pausePlayback(getAccessToken()));
    }
    hideError();
  } catch (err) {
    handleApiError(err, 'Toggle play');
  }
}

async function handleNext() {
  try {
    await withAuthRetry(() => skipNext(getAccessToken()));
    hideError();
  } catch (err) {
    handleApiError(err, 'Skip next');
  }
}

// ─── SDK callbacks ────────────────────────────────────────────────────────────

function onReady(id) {
  deviceId = id;
  _reconnecting = false;
  setControlsEnabled(true);
}

function onNotReady(_id) {
  if (_reconnecting) return;
  _reconnecting = true;
  setControlsEnabled(false);
  showError('Reconnecting…');
  _player?.disconnect();
  setTimeout(async () => {
    try {
      _player = await initPlayer(getAccessToken, onReady, onNotReady, onState, onSdkError);
    } catch (err) {
      showError(`SDK reconnect failed: ${err.message}`);
      _reconnecting = false;
    }
  }, 3000);
}

function onState(state) {
  if (!state) return;

  const track      = state.track_window?.current_track;
  const trackName  = track?.name   ?? null;
  const artistName = track?.artists?.map(a => a.name).join(', ') ?? null;

  updateNowPlaying(trackName, artistName);

  isPaused = state.paused;
  updatePlayPauseButton(isPaused);

  if (state.context?.uri) {
    activeUri = state.context.uri;
    reRenderPlaylists();
  }
}

function onSdkError(type, message) {
  showError(`SDK error (${type}): ${message}`);
}

// ─── Setup view ───────────────────────────────────────────────────────────────

function showSetup() {
  showSetupView();
  const existing = loadSavedPlaylists();
  if (existing.length) setSetupInput(playlistsToText(existing));
}

function handleSavePlaylists() {
  const items = parsePlaylistInput(getSetupInput());
  if (!items.length) {
    showError('No valid playlist links found. Paste Spotify playlist URLs, one per line.');
    return;
  }

  savePlaylists(items);
  playlists = items;
  hideError();

  if (_player) {
    renderPlaylists(playlists, activeUri, selectPlaylist);
    showPlayerView();
  } else {
    showPlayer();
  }
}

// ─── Player view bootstrap ────────────────────────────────────────────────────

async function showPlayer() {
  showPlayerView();
  setControlsEnabled(false);

  // Load playlists from storage — no API call needed
  playlists = loadSavedPlaylists();
  renderPlaylists(playlists, activeUri, selectPlaylist);
  hideError();

  // One-time SDK init and event wiring
  if (!_player) {
    try {
      _player = await initPlayer(getAccessToken, onReady, onNotReady, onState, onSdkError);
    } catch (err) {
      showError(`Failed to load Spotify SDK: ${err.message}`);
    }

    _refreshTimer = scheduleRefresh(clientId, getTokenExpiresIn() || 60, () => {
      if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
      clearTokens();
      showLoginView();
      showError('Session expired. Please log in again.');
    });

    document.getElementById('btn-prev').addEventListener('click', handlePrev);
    document.getElementById('btn-playpause').addEventListener('click', handleTogglePlay);
    document.getElementById('btn-next').addEventListener('click', handleNext);

    bindKeyboard({
      togglePlay:    handleTogglePlay,
      next:          handleNext,
      prev:          handlePrev,
      selectByIndex: i => { if (playlists[i]) selectPlaylist(playlists[i]); },
    });
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  document.getElementById('btn-login').addEventListener('click', () => startAuth(clientId));
  document.getElementById('btn-save-playlists').addEventListener('click', handleSavePlaylists);
  document.getElementById('btn-manage').addEventListener('click', showSetup);

  const params = new URLSearchParams(window.location.search);
  if (params.has('code') || params.has('error')) {
    try {
      const tokens = await handleCallback(clientId);
      if (tokens === null) { showLoginView(); return; }
    } catch (err) {
      showError(err.message);
      showLoginView();
      return;
    }
  }

  if (getAccessToken()) {
    const saved = loadSavedPlaylists();
    if (saved.length === 0) {
      showSetup();
    } else {
      await showPlayer();
    }
  } else {
    showLoginView();
  }
}

document.addEventListener('DOMContentLoaded', init);
