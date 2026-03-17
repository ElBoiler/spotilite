// main.js — Entry point. Wires auth → SDK → UI.
// All business logic lives here; modules handle I/O.

import {
  startAuth,
  handleCallback,
  getAccessToken,
  clearTokens,
  scheduleRefresh,
} from './auth.js';

import {
  fetchDailyMixes,
  playPlaylist,
  resumePlayback,
  pausePlayback,
  skipNext,
  skipPrevious,
} from './api.js';

import { initPlayer } from './player.js';

import {
  showLoginView,
  showPlayerView,
  showError,
  hideError,
  renderPlaylists,
  updateNowPlaying,
  updatePlayPauseButton,
  setControlsEnabled,
  bindKeyboard,
} from './ui.js';

// ─── Module-level state ───────────────────────────────────────────────────────

const clientId = window.SPOTIFY_CLIENT_ID;

let deviceId  = null;
let isPaused  = true;
let playlists = [];
let activeUri = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function handleApiError(err, context) {
  if (err.status === 401) {
    clearTokens();
    showError('Session expired. Please log in again.');
    showLoginView();
  } else {
    showError(`${context}: ${err.message}`);
  }
}

function reRenderPlaylists() {
  renderPlaylists(playlists, activeUri, selectPlaylist);
}

// ─── Playlist selection ───────────────────────────────────────────────────────

async function selectPlaylist(playlist) {
  activeUri = playlist.uri;
  reRenderPlaylists();

  const token = getAccessToken();
  try {
    await playPlaylist(token, deviceId, playlist.uri);
    hideError();
  } catch (err) {
    handleApiError(err, 'Play playlist');
  }
}

// ─── Transport ────────────────────────────────────────────────────────────────

async function handlePrev() {
  try {
    await skipPrevious(getAccessToken());
    hideError();
  } catch (err) {
    handleApiError(err, 'Skip previous');
  }
}

async function handleTogglePlay() {
  const token = getAccessToken();
  try {
    if (isPaused) {
      await resumePlayback(token, deviceId);
    } else {
      await pausePlayback(token);
    }
    hideError();
  } catch (err) {
    handleApiError(err, 'Toggle play');
  }
}

async function handleNext() {
  try {
    await skipNext(getAccessToken());
    hideError();
  } catch (err) {
    handleApiError(err, 'Skip next');
  }
}

// ─── SDK callbacks ────────────────────────────────────────────────────────────

function onReady(id) {
  deviceId = id;
  setControlsEnabled(true);
}

function onNotReady(_id) {
  setControlsEnabled(false);
  showError('Reconnecting…');
  // After 3 s attempt to reconnect by re-initialising the player
  setTimeout(() => {
    initPlayer(getAccessToken, onReady, onNotReady, onState, onSdkError)
      .catch(err => showError(`SDK reconnect failed: ${err.message}`));
  }, 3000);
}

function onState(state) {
  if (!state) return;

  const track       = state.track_window?.current_track;
  const trackName   = track?.name   ?? null;
  const artistName  = track?.artists?.map(a => a.name).join(', ') ?? null;

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

// ─── Player view bootstrap ───────────────────────────────────────────────────

async function showPlayer() {
  showPlayerView();
  setControlsEnabled(false);

  const token = getAccessToken();

  // Fetch and render playlists
  try {
    playlists = await fetchDailyMixes(token);
    if (playlists.length === 0) {
      showError('No Daily Mix playlists found in your library.');
    } else {
      hideError();
    }
    renderPlaylists(playlists, activeUri, selectPlaylist);
  } catch (err) {
    handleApiError(err, 'Fetch playlists');
  }

  // Initialise Web Playback SDK
  try {
    await initPlayer(getAccessToken, onReady, onNotReady, onState, onSdkError);
  } catch (err) {
    showError(`Failed to load Spotify SDK: ${err.message}`);
  }

  // Schedule token refresh
  const expiry    = parseInt(sessionStorage.getItem('token_expiry') || '0', 10);
  const expiresIn = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
  scheduleRefresh(clientId, expiresIn || 3600, () => {
    clearTokens();
    showError('Session expired. Please log in again.');
    showLoginView();
  });

  // Wire transport buttons
  document.getElementById('btn-prev').addEventListener('click', handlePrev);
  document.getElementById('btn-playpause').addEventListener('click', handleTogglePlay);
  document.getElementById('btn-next').addEventListener('click', handleNext);

  // Wire keyboard shortcuts
  bindKeyboard({
    togglePlay:    handleTogglePlay,
    next:          handleNext,
    prev:          handlePrev,
    selectByIndex: i => { if (playlists[i]) selectPlaylist(playlists[i]); },
  });

}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  // Wire login button early so it works on the login view
  document.getElementById('btn-login').addEventListener('click', () => startAuth(clientId));

  // Handle OAuth callback (URL has ?code= or ?error=)
  const params = new URLSearchParams(window.location.search);
  if (params.has('code') || params.has('error')) {
    try {
      const tokens = await handleCallback(clientId);
      if (tokens === null) {
        // Shouldn't happen if we checked params, but handle gracefully
        showLoginView();
        return;
      }
    } catch (err) {
      showError(err.message);
      showLoginView();
      return;
    }
  }

  // Decide which view to show
  if (getAccessToken()) {
    await showPlayer();
  } else {
    showLoginView();
  }
}

document.addEventListener('DOMContentLoaded', init);
