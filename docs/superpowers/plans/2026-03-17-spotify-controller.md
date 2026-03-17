# Spotify Controller Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal Docker container (nginx:alpine) that serves a browser-based Spotify controller — PKCE auth, Web Playback SDK audio, Daily Mix playlist picker, and transport controls (prev/pause/next).

**Architecture:** Static files (HTML/CSS/JS ES modules) served by nginx:alpine. No backend runtime. All logic — PKCE OAuth, Spotify Web API calls, Web Playback SDK — runs in the browser. `SPOTIFY_CLIENT_ID` is injected at container startup via `envsubst`.

**Tech Stack:** nginx:alpine, vanilla JS (ES modules, no framework, no bundler), Spotify Web Playback SDK (CDN `<script>`), Spotify Web API (Fetch), PKCE OAuth 2.0

---

## File Map

| File | Responsibility |
|------|---------------|
| `Dockerfile` | Build image: nginx:alpine + gettext (for envsubst), copy files, set entrypoint |
| `entrypoint.sh` | Run `envsubst '$SPOTIFY_CLIENT_ID'` on template, then start nginx |
| `nginx.conf` | Minimal nginx: listen 80, serve `/usr/share/nginx/html` |
| `app/index.html.tmpl` | HTML shell with `$SPOTIFY_CLIENT_ID` placeholder; login + player views |
| `app/style.css` | All styles — login, playlist list, now-playing, transport buttons |
| `app/js/auth.js` | PKCE helpers, token exchange, refresh scheduling, sessionStorage I/O |
| `app/js/api.js` | Spotify Web API wrapper: fetchDailyMixes, playPlaylist, pause, resume, next, previous |
| `app/js/player.js` | Web Playback SDK init, ready/not_ready/player_state_changed handling |
| `app/js/main.js` | Entry point: auth callback detection, SDK init, UI wiring, keyboard shortcuts |
| `README.md` | One-time setup instructions |

---

## Chunk 1: Docker scaffold + static shell

### Task 1: nginx config + Dockerfile + entrypoint

**Files:**
- Create: `nginx.conf`
- Create: `Dockerfile`
- Create: `entrypoint.sh`

- [ ] **Step 1: Create `nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Create `entrypoint.sh`**

```sh
#!/bin/sh
set -e
envsubst '$SPOTIFY_CLIENT_ID' < /usr/share/nginx/html/index.html.tmpl \
    > /usr/share/nginx/html/index.html
exec nginx -g 'daemon off;'
```

Note: the quoted `'$SPOTIFY_CLIENT_ID'` list is intentional — it scopes envsubst to only that variable, preventing corruption of `${}` in JS or CSS.

- [ ] **Step 3: Create `Dockerfile`**

```dockerfile
FROM nginx:alpine

# gettext provides envsubst
RUN apk add --no-cache gettext

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY app/ /usr/share/nginx/html/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
```

- [ ] **Step 4: Create `app/js/` directory**

```bash
mkdir -p app/js
```

- [ ] **Step 5: Commit**

```bash
git add Dockerfile entrypoint.sh nginx.conf
git commit -m "feat: add Docker scaffold (nginx:alpine + envsubst entrypoint)"
```

---

### Task 2: HTML template + CSS

**Files:**
- Create: `app/index.html.tmpl`
- Create: `app/style.css`

- [ ] **Step 1: Create `app/index.html.tmpl`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Light Spotting</title>
  <link rel="stylesheet" href="/style.css">
  <script src="https://sdk.scdn.co/spotify-player.js"></script>
</head>
<body>

  <div id="view-login" class="view hidden">
    <h1>Light Spotting</h1>
    <button id="btn-login">Login with Spotify</button>
    <p id="login-error" class="error hidden"></p>
  </div>

  <div id="view-player" class="view hidden">
    <ul id="playlist-list" aria-label="Daily Mix playlists"></ul>
    <div id="now-playing">
      <span id="track-name">&#8212;</span>
      <span id="artist-name"></span>
    </div>
    <div id="transport">
      <button id="btn-prev" title="Previous (&#8592;)" disabled>&#9198;</button>
      <button id="btn-playpause" title="Play/Pause (Space)" disabled>&#9654;</button>
      <button id="btn-next" title="Next (&#8594;)" disabled>&#9197;</button>
    </div>
    <p id="player-status" class="status"></p>
  </div>

  <script>window.SPOTIFY_CLIENT_ID = '$SPOTIFY_CLIENT_ID';</script>
  <script type="module" src="/js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `app/style.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, sans-serif;
  background: #121212;
  color: #fff;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.view { width: 340px; }
.hidden { display: none !important; }

#view-login { text-align: center; }
#view-login h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #1db954; }
#btn-login {
  background: #1db954; color: #000; border: none;
  padding: 0.75rem 2rem; border-radius: 9999px;
  font-size: 1rem; font-weight: 700; cursor: pointer;
}
#btn-login:hover { background: #1ed760; }

#playlist-list { list-style: none; margin-bottom: 1.25rem; }
#playlist-list li {
  padding: 0.6rem 0.75rem; border-radius: 4px;
  cursor: pointer; font-size: 0.95rem;
  transition: background 0.15s;
}
#playlist-list li:hover { background: #282828; }
#playlist-list li.playing { color: #1db954; font-weight: 700; }
#playlist-list li.playing::after { content: ' \25B6'; }

#now-playing {
  padding: 0.75rem 0;
  border-top: 1px solid #282828;
  border-bottom: 1px solid #282828;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}
#track-name { display: block; font-weight: 600; }
#artist-name { display: block; color: #b3b3b3; font-size: 0.8rem; margin-top: 0.2rem; }

#transport { display: flex; gap: 1rem; justify-content: center; }
#transport button {
  background: none; border: 1px solid #535353;
  color: #fff; width: 3rem; height: 3rem;
  border-radius: 50%; font-size: 1.1rem; cursor: pointer;
  transition: border-color 0.15s;
}
#transport button:hover:not(:disabled) { border-color: #fff; }
#transport button:disabled { opacity: 0.35; cursor: default; }

.status { margin-top: 0.75rem; font-size: 0.8rem; color: #b3b3b3; text-align: center; }
.error { color: #e22134; font-size: 0.85rem; margin-top: 0.75rem; }
```

- [ ] **Step 3: Commit**

```bash
git add app/index.html.tmpl app/style.css
git commit -m "feat: add HTML template and CSS"
```

---

## Chunk 2: PKCE auth module

### Task 3: `app/js/auth.js`

**Files:**
- Create: `app/js/auth.js`

- [ ] **Step 1: Create `app/js/auth.js`**

```js
// auth.js — PKCE OAuth flow, token storage, and refresh scheduling

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const AUTH_ENDPOINT  = 'https://accounts.spotify.com/authorize';
const REDIRECT_URI   = 'http://localhost:8080';
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
].join(' ');

// ── Storage helpers ──────────────────────────────────────────────────────────

export function getToken() {
  return sessionStorage.getItem('access_token');
}

export function getRefreshToken() {
  return sessionStorage.getItem('refresh_token');
}

function saveTokens({ access_token, refresh_token, expires_in }) {
  sessionStorage.setItem('access_token', access_token);
  if (refresh_token) sessionStorage.setItem('refresh_token', refresh_token);
  // Store absolute expiry timestamp in ms
  sessionStorage.setItem('token_expiry', Date.now() + expires_in * 1000);
}

export function clearTokens() {
  ['access_token', 'refresh_token', 'token_expiry',
   'pkce_verifier', 'pkce_state'].forEach(k => sessionStorage.removeItem(k));
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function randomBase64url(byteLength) {
  const arr = crypto.getRandomValues(new Uint8Array(byteLength));
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function sha256Base64url(plain) {
  const data   = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Auth redirect ─────────────────────────────────────────────────────────────

/**
 * Begin PKCE login: generate verifier + state, store them, redirect to Spotify.
 */
export async function startLogin(clientId) {
  const verifier  = randomBase64url(64);
  const state     = randomBase64url(16);
  const challenge = await sha256Base64url(verifier);

  sessionStorage.setItem('pkce_verifier', verifier);
  sessionStorage.setItem('pkce_state', state);

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    scope:                 SCOPES,
    redirect_uri:          REDIRECT_URI,
    state,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
  });

  window.location.href = `${AUTH_ENDPOINT}?${params}`;
}

// ── Auth callback ─────────────────────────────────────────────────────────────

/**
 * Handle the redirect back from Spotify. Validates state, exchanges code for tokens.
 * Cleans the URL with history.replaceState so a refresh doesn't re-trigger this.
 */
export async function handleCallback(clientId) {
  const params      = new URLSearchParams(window.location.search);
  const code        = params.get('code');
  const state       = params.get('state');
  const error       = params.get('error');

  if (error) throw new Error(`Spotify auth error: ${error}`);

  const storedState = sessionStorage.getItem('pkce_state');
  if (!storedState || state !== storedState) {
    throw new Error('State mismatch — possible CSRF. Please try logging in again.');
  }

  const verifier = sessionStorage.getItem('pkce_verifier');
  if (!verifier) throw new Error('Missing PKCE verifier. Please try logging in again.');

  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  REDIRECT_URI,
    client_id:     clientId,
    code_verifier: verifier,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || `Token exchange failed (${res.status})`);
  }

  saveTokens(await res.json());
  window.history.replaceState({}, '', '/');
}

// ── Token refresh ─────────────────────────────────────────────────────────────

let _refreshTimer = null;

/**
 * Refresh the access token using the stored refresh token.
 * Handles Spotify token rotation — always overwrites stored refresh_token.
 */
export async function refreshAccessToken(clientId) {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token stored.');

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     clientId,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || `Token refresh failed (${res.status})`);
  }

  const data = await res.json();
  saveTokens(data);
  return data.access_token;
}

/**
 * Schedule automatic token refresh 5 minutes before expiry.
 * Delay is (expires_in - 300) * 1000 ms, computed from stored token_expiry.
 * Reschedules itself after each successful refresh.
 */
export function scheduleRefresh(clientId, onRefreshed, onFailed) {
  if (_refreshTimer) clearTimeout(_refreshTimer);

  const expiry = parseInt(sessionStorage.getItem('token_expiry') || '0', 10);
  const delay  = expiry - Date.now() - 5 * 60 * 1000;

  const doRefresh = async () => {
    try {
      const newToken = await refreshAccessToken(clientId);
      onRefreshed(newToken);
      scheduleRefresh(clientId, onRefreshed, onFailed);
    } catch {
      onFailed();
    }
  };

  if (delay <= 0) { doRefresh(); return; }
  _refreshTimer = setTimeout(doRefresh, delay);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/js/auth.js
git commit -m "feat: add PKCE auth module (token exchange + refresh scheduling)"
```

---

## Chunk 3: API + player modules

### Task 4: `app/js/api.js`

**Files:**
- Create: `app/js/api.js`

- [ ] **Step 1: Create `app/js/api.js`**

```js
// api.js — Spotify Web API wrapper

const API_BASE = 'https://api.spotify.com/v1';

/**
 * Authenticated fetch. Returns parsed JSON, null on 204, or throws.
 * Throws { message, status: 401 } for auth errors so callers can trigger refresh.
 */
async function apiFetch(path, token, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    const err = new Error('Unauthorized'); err.status = 401; throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err  = new Error(body?.error?.message || `API error ${res.status}`);
    err.status = res.status; throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Fetch all playlists (handles pagination) and return only Daily Mix items.
 * Filter: owner.id === 'spotify' AND name starts with 'Daily Mix'.
 * Note: Daily Mixes only appear here if the user has followed them in Spotify.
 */
export async function fetchDailyMixes(token) {
  const mixes = [];
  let url = `${API_BASE}/me/playlists?limit=50`;

  while (url) {
    const data = await apiFetch(url, token);
    for (const item of data.items) {
      if (item.owner.id === 'spotify' && item.name.startsWith('Daily Mix')) {
        mixes.push({ id: item.id, name: item.name, uri: item.uri });
      }
    }
    url = data.next || null;
  }

  mixes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return mixes;
}

export async function playPlaylist(token, playlistUri, deviceId) {
  return apiFetch(`/me/player/play?device_id=${deviceId}`, token, {
    method: 'PUT',
    body: JSON.stringify({ context_uri: playlistUri }),
  });
}

export async function pause(token) {
  return apiFetch('/me/player/pause', token, { method: 'PUT' });
}

export async function resume(token) {
  return apiFetch('/me/player/play', token, { method: 'PUT' });
}

export async function next(token) {
  return apiFetch('/me/player/next', token, { method: 'POST' });
}

export async function previous(token) {
  return apiFetch('/me/player/previous', token, { method: 'POST' });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/js/api.js
git commit -m "feat: add Spotify Web API wrapper (playlists + transport)"
```

---

### Task 5: `app/js/player.js`

**Files:**
- Create: `app/js/player.js`

- [ ] **Step 1: Create `app/js/player.js`**

```js
// player.js — Spotify Web Playback SDK wrapper

let _player   = null;
let _deviceId = null;

/**
 * Initialize the SDK player. Returns a Promise that resolves when device is ready.
 *
 * @param {object} opts
 * @param {() => string}       opts.getToken      - Returns the current access token
 * @param {(state) => void}    opts.onStateChange - Called with SDK player_state object
 * @param {(deviceId) => void} opts.onReady       - Called when device is registered
 * @param {() => void}         opts.onNotReady    - Called when device goes offline
 */
export function initPlayer({ getToken, onStateChange, onReady, onNotReady }) {
  return new Promise((resolve, reject) => {
    const init = () => {
      _player = new window.Spotify.Player({
        name: 'Light Spotting',
        getOAuthToken: cb => cb(getToken()),
        volume: 0.8,
      });

      _player.addListener('ready', ({ device_id }) => {
        _deviceId = device_id;
        onReady(device_id);
        resolve();
      });

      _player.addListener('not_ready', ({ device_id }) => {
        console.warn('Player went offline:', device_id);
        onNotReady();
      });

      _player.addListener('player_state_changed', state => onStateChange(state));

      _player.addListener('initialization_error', ({ message }) =>
        reject(new Error(`SDK init error: ${message}`)));

      _player.addListener('authentication_error', ({ message }) =>
        reject(new Error(`SDK auth error: ${message}`)));

      _player.addListener('account_error', ({ message }) =>
        reject(new Error(`${message} — Spotify Premium is required.`)));

      _player.connect();
    };

    // SDK fires window.onSpotifyWebPlaybackSDKReady when loaded.
    // If it already fired (re-init after disconnect), call init() immediately.
    if (window.Spotify) {
      init();
    } else {
      window.onSpotifyWebPlaybackSDKReady = init;
    }
  });
}

export function getDeviceId() { return _deviceId; }

export function disconnectPlayer() {
  if (_player) { _player.disconnect(); _player = null; _deviceId = null; }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/js/player.js
git commit -m "feat: add Web Playback SDK wrapper"
```

---

## Chunk 4: Main entry point

### Task 6: `app/js/main.js`

**Files:**
- Create: `app/js/main.js`

- [ ] **Step 1: Create `app/js/main.js`**

```js
// main.js — Entry point: auth flow detection, SDK init, UI wiring

import {
  getToken, clearTokens,
  startLogin, handleCallback, scheduleRefresh,
} from './auth.js';

import {
  fetchDailyMixes,
  playPlaylist, pause, resume, next, previous,
} from './api.js';

import { initPlayer, getDeviceId, disconnectPlayer } from './player.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const viewLogin    = $('view-login');
const viewPlayer   = $('view-player');
const btnLogin     = $('btn-login');
const loginError   = $('login-error');
const playlistList = $('playlist-list');
const trackName    = $('track-name');
const artistName   = $('artist-name');
const btnPrev      = $('btn-prev');
const btnPlayPause = $('btn-playpause');
const btnNext      = $('btn-next');
const playerStatus = $('player-status');

// ── State ─────────────────────────────────────────────────────────────────────

const CLIENT_ID = window.SPOTIFY_CLIENT_ID;
let playlists   = [];
let activeUri   = null;
let isPaused    = true;

// ── View helpers ──────────────────────────────────────────────────────────────

function showLogin(errorMsg = '') {
  viewLogin.classList.remove('hidden');
  viewPlayer.classList.add('hidden');
  loginError.textContent = errorMsg;
  loginError.classList.toggle('hidden', !errorMsg);
}

function showPlayer() {
  viewLogin.classList.add('hidden');
  viewPlayer.classList.remove('hidden');
}

function setStatus(msg) { playerStatus.textContent = msg; }

function setTransportEnabled(on) {
  [btnPrev, btnPlayPause, btnNext].forEach(b => { b.disabled = !on; });
}

function renderPlaylists() {
  playlistList.innerHTML = '';
  if (!playlists.length) {
    const li = document.createElement('li');
    li.textContent = 'No Daily Mix playlists found. Make sure you follow them in Spotify.';
    li.style.color = '#b3b3b3';
    playlistList.appendChild(li);
    return;
  }
  playlists.forEach((pl, i) => {
    const li = document.createElement('li');
    li.textContent = pl.name;
    li.title = `Press ${i + 1} to play`;
    if (pl.uri === activeUri) li.classList.add('playing');
    li.addEventListener('click', () => selectPlaylist(pl.uri));
    playlistList.appendChild(li);
  });
}

function updateNowPlaying(state) {
  if (!state || !state.track_window || !state.track_window.current_track) {
    trackName.textContent = '\u2014'; artistName.textContent = ''; return;
  }
  const t = state.track_window.current_track;
  trackName.textContent  = t.name;
  artistName.textContent = t.artists.map(a => a.name).join(', ');
  isPaused = state.paused;
  btnPlayPause.textContent = isPaused ? '\u25B6' : '\u23F8';
  btnPlayPause.title = isPaused ? 'Play (Space)' : 'Pause (Space)';
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function withApiError(fn) {
  try {
    await fn();
  } catch (err) {
    if (err.status === 401) {
      clearTokens();
      showLogin('Session expired. Please log in again.');
    } else {
      console.error('API error:', err);
      setStatus('Error: ' + err.message);
    }
  }
}

async function selectPlaylist(uri) {
  const deviceId = getDeviceId();
  if (!deviceId) return;
  activeUri = uri;
  renderPlaylists();
  await withApiError(() => playPlaylist(getToken(), uri, deviceId));
}

// ── SDK callbacks ─────────────────────────────────────────────────────────────

function onReady(deviceId) {
  console.log('SDK ready, device_id:', deviceId);
  setTransportEnabled(true);
  setStatus('');
}

function onNotReady() {
  setTransportEnabled(false);
  setStatus('Reconnecting\u2026');
  // Disconnect the old player before re-initializing to avoid duplicate instances
  disconnectPlayer();
  setTimeout(() => initSDK(), 3000);
}

// ── SDK init ──────────────────────────────────────────────────────────────────

async function initSDK() {
  setStatus('Connecting to Spotify\u2026');
  try {
    await initPlayer({
      getToken,
      onStateChange: updateNowPlaying,
      onReady,
      onNotReady,
    });
  } catch (err) {
    console.error('SDK init failed:', err);
    setStatus(err.message);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);

  // Returning from Spotify OAuth callback
  if (params.has('code') || params.has('error')) {
    try {
      await handleCallback(CLIENT_ID);
    } catch (err) {
      showLogin(err.message); return;
    }
  }

  if (getToken()) {
    showPlayer();
    setTransportEnabled(false);

    scheduleRefresh(
      CLIENT_ID,
      newToken => sessionStorage.setItem('access_token', newToken),
      () => { clearTokens(); showLogin('Session expired. Please log in again.'); },
    );

    await withApiError(async () => {
      playlists = await fetchDailyMixes(getToken());
      renderPlaylists();
    });

    await initSDK();
    return;
  }

  // Not authenticated — show login (do not auto-redirect to prevent loops)
  showLogin();
}

// ── Event listeners ───────────────────────────────────────────────────────────

btnLogin.addEventListener('click', () => startLogin(CLIENT_ID));

btnPrev.addEventListener('click',      () => withApiError(() => previous(getToken())));
btnPlayPause.addEventListener('click', () =>
  withApiError(() => isPaused ? resume(getToken()) : pause(getToken())));
btnNext.addEventListener('click',      () => withApiError(() => next(getToken())));

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'BUTTON') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!btnPlayPause.disabled) btnPlayPause.click();
  } else if (e.code === 'ArrowRight') {
    if (!btnNext.disabled) btnNext.click();
  } else if (e.code === 'ArrowLeft') {
    if (!btnPrev.disabled) btnPrev.click();
  } else if (e.key >= '1' && e.key <= '6') {
    const pl = playlists[parseInt(e.key, 10) - 1];
    if (pl) selectPlaylist(pl.uri);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  showLogin('Something went wrong. Please refresh.');
});
```

- [ ] **Step 2: Commit**

```bash
git add app/js/main.js
git commit -m "feat: add main entry point (auth flow, SDK init, UI wiring)"
```

---

## Chunk 5: README + Docker integration test

### Task 7: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite `README.md`** with the following content (use Write tool):

```markdown
# light-spotting

A minimal Spotify controller that runs in Docker. No Spotify app needed — just a browser tab.

Browse your Daily Mix playlists and control playback from a clean web UI.

## Requirements

- Docker
- Spotify Premium account
- A browser on the same machine as Docker

## One-time Spotify setup

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Click **Create app**
3. Under **Redirect URIs** add exactly: `http://localhost:8080` (no trailing slash)
4. Save. Copy the **Client ID**.

> **Daily Mixes not appearing?** Open Spotify and follow each Daily Mix playlist first.
> They only appear via the API once followed.

## Usage

docker run -e SPOTIFY_CLIENT_ID=your_client_id_here -p 8080:80 light-spotting

Then open [http://localhost:8080](http://localhost:8080) and log in.

## Build locally

git clone <this repo>
cd light-spotting
docker build -t light-spotting .
docker run -e SPOTIFY_CLIENT_ID=your_client_id -p 8080:80 light-spotting

## Controls

| Action     | Click    | Keyboard |
|------------|----------|----------|
| Play/Pause | ⏸ button | `Space`  |
| Next track | ⏭ button | `→`      |
| Previous   | ⏮ button | `←`      |
| Select mix | Click row| `1`–`6`  |

## Notes

- Audio plays in the browser tab — keep it open while listening
- Works on `localhost` only (Spotify SDK requires a secure context)
- Tokens are in `sessionStorage` — log in again after closing the tab
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions"
```

---

### Task 8: Docker build + smoke test

- [ ] **Step 1: Build the image**

```bash
docker build -t light-spotting .
```

Expected: exits 0.

- [ ] **Step 2: Check image size**

```bash
docker image ls light-spotting --format "{{.Size}}"
```

Expected: ≤ 30MB.

- [ ] **Step 3: Run with dummy Client ID**

```bash
docker run -d --name ls-test -e SPOTIFY_CLIENT_ID=test_client_id -p 8080:80 light-spotting
sleep 2
```

- [ ] **Step 4: Verify page is served**

```bash
curl -sf http://localhost:8080/ | grep -c "Light Spotting"
```

Expected: `1`

- [ ] **Step 5: Verify Client ID was injected**

```bash
curl -sf http://localhost:8080/ | grep "test_client_id"
```

Expected: a line containing `test_client_id`

- [ ] **Step 6: Verify all JS modules are served**

```bash
for f in main auth api player; do
  code=$(curl -so /dev/null -w "%{http_code}" http://localhost:8080/js/${f}.js)
  echo "${f}.js: ${code}"
done
```

Expected: all `200`.

- [ ] **Step 7: Stop and remove test container**

```bash
docker stop ls-test && docker rm ls-test
```

- [ ] **Step 8: Tag release**

```bash
git tag v0.1.0
```

---

## End-to-end verification (manual — requires real Spotify credentials)

Run once with a real `SPOTIFY_CLIENT_ID`:

- [ ] Open `http://localhost:8080` → Login button visible
- [ ] Click Login → Spotify auth page opens
- [ ] Authorise → redirected back, Daily Mix playlists listed
- [ ] Click a playlist → audio plays in the browser tab
- [ ] Pause/play buttons work
- [ ] Next / Previous buttons work
- [ ] Keyboard: `Space`, `→`, `←`, `1`–`6` all work
- [ ] DevTools sessionStorage shows `access_token` and `refresh_token`
- [ ] Leave tab open ~55 min → no login prompt (token auto-refreshed)
