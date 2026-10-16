// api.js — Spotify Web API wrapper
// All functions take an accessToken string as first argument.
// Throws an error with .status property on HTTP errors.

const API = 'https://api.spotify.com/v1';

/**
 * Fetch wrapper with Bearer auth and JSON handling.
 * Throws { message, status } on HTTP errors.
 * @param {string} accessToken
 * @param {string} path         - API path, e.g. '/me/playlists'
 * @param {RequestInit} options
 * @returns {Promise<object|null>} parsed JSON, or null for 204 responses
 */
async function apiFetch(accessToken, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err  = new Error(`Spotify API error ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }

  // 204 No Content (pause, skip, etc.)
  if (res.status === 204) return null;

  // Some Spotify endpoints return 200 with a non-JSON body
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;

  return res.json();
}

// ─── Playback ─────────────────────────────────────────────────────────────────

/**
 * Start playing a playlist context on the specified device.
 * @param {string} accessToken
 * @param {string} deviceId
 * @param {string} contextUri  - e.g. 'spotify:playlist:...'
 */
export function playPlaylist(accessToken, deviceId, contextUri) {
  return apiFetch(accessToken, `/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body:   JSON.stringify({ context_uri: contextUri }),
  });
}

/**
 * Resume playback on the specified device (no context change).
 * @param {string} accessToken
 * @param {string} deviceId
 */
export function resumePlayback(accessToken, deviceId) {
  return apiFetch(accessToken, `/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
  });
}

/**
 * Pause playback.
 * @param {string} accessToken
 */
export function pausePlayback(accessToken) {
  return apiFetch(accessToken, '/me/player/pause', { method: 'PUT' });
}

/**
 * Skip to next track.
 * @param {string} accessToken
 */
export function skipNext(accessToken) {
  return apiFetch(accessToken, '/me/player/next', { method: 'POST' });
}

/**
 * Skip to previous track.
 * @param {string} accessToken
 */
export function skipPrevious(accessToken) {
  return apiFetch(accessToken, '/me/player/previous', { method: 'POST' });
}
