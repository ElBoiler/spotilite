# Spotify Controller Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight Docker container (nginx:alpine) that serves a browser-based Spotify controller with PKCE OAuth, Web Playback SDK audio, Daily Mix playlist selection, and transport controls.

**Architecture:** A static file server (nginx:alpine, no backend runtime) serves a vanilla JS single-page app. All logic — PKCE auth, Spotify API calls, and SDK playback — runs in the browser. The container is configured at startup via `envsubst` to inject the Spotify Client ID into the HTML template.

**Tech Stack:** nginx:alpine, vanilla JS ES modules, Spotify Web Playback SDK, Spotify Web API, PKCE OAuth 2.0

---

## File Map

| File | Responsibility |
|------|---------------|
| `Dockerfile` | Build image: nginx:alpine + gettext (for envsubst) + entrypoint |
| `entrypoint.sh` | Inject `SPOTIFY_CLIENT_ID` into HTML template at container startup |
| `nginx.conf` | Serve static files on port 80; include MIME types |
| `.dockerignore` | Exclude tests/, docs/, *.md from image |
| `app/index.html.tmpl` | HTML shell with `$SPOTIFY_CLIENT_ID` placeholder; two views: login + player |
| `app/style.css` | Minimal dark-theme styles; no external dependencies |
| `app/auth.js` | PKCE helpers, token storage/retrieval (sessionStorage), token refresh scheduling |
| `app/api.js` | Spotify REST API wrapper: fetch playlists, play/pause/skip |
| `app/player.js` | Spotify Web Playback SDK loader and wrapper |
| `app/main.js` | Entry point: wires auth callback → SDK init → playlist load → controls |
| `app/ui.js` | DOM updates, keyboard bindings — no business logic |
| `tests/test.html` | Browser-based tests for pure PKCE functions (dev only, not in image) |
| `README.md` | Setup guide, Docker run command, Spotify app registration steps |

---

## Chunk 1: Docker Infrastructure + HTML + CSS

### Task 1: nginx configuration

**Files:**
- Create: `nginx.conf`

- [ ] **Step 1: Create `nginx.conf`**

```nginx
events {}

http {
  include       /etc/nginx/mime.types;
  default_type  application/octet-stream;

  server {
    listen      80;
    root        /usr/share/nginx/html;
    index       index.html;

    location / {
      try_files $uri $uri/ /index.html;
    }
  }
}
```

> Note: `$uri` here is an nginx variable — it is NOT in `index.html.tmpl`, so `envsubst` will never touch this file. No escaping needed.

- [ ] **Step 2: Verify it's valid nginx config**

```bash
docker run --rm -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro nginx:alpine nginx -t
```

Expected output:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

---

### Task 2: Dockerfile and entrypoint

**Files:**
- Create: `Dockerfile`
- Create: `entrypoint.sh`
- Create: `.dockerignore`

- [ ] **Step 1: Create `entrypoint.sh`**

```sh
#!/bin/sh
set -e

# Inject SPOTIFY_CLIENT_ID into the HTML template.
# The quoted variable list ('$SPOTIFY_CLIENT_ID') prevents envsubst from
# corrupting any other $ patterns in the file (e.g. JS template literals).
envsubst '$SPOTIFY_CLIENT_ID' \
  < /usr/share/nginx/html/index.html.tmpl \
  > /usr/share/nginx/html/index.html

exec nginx -g 'daemon off;'
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
FROM nginx:alpine

# gettext provides envsubst
RUN apk add --no-cache gettext

COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /entrypoint.sh
COPY app/ /usr/share/nginx/html/

RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
```

- [ ] **Step 3: Create `.dockerignore`**

```
tests/
docs/
*.md
.git/
```

- [ ] **Step 4: Commit**

```bash
git add nginx.conf entrypoint.sh Dockerfile .dockerignore
git commit -m "feat: add Docker infrastructure (nginx, entrypoint, Dockerfile)"
```

---

### Task 3: HTML template

**Files:**
- Create: `app/index.html.tmpl`

- [ ] **Step 1: Create `app/` directory and `app/index.html.tmpl`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Light Spotting</title>
  <link rel="stylesheet" href="style.css">
  <script>window.SPOTIFY_CLIENT_ID = '$SPOTIFY_CLIENT_ID';</script>
</head>
<body>
  <div class="container">
    <h1>Light Spotting</h1>

    <div id="error-msg" hidden></div>

    <section id="login-view">
      <button id="btn-login">Login with Spotify</button>
    </section>

    <section id="player-view" hidden>
      <ul id="playlist-list" aria-label="Daily Mix playlists"></ul>

      <div id="now-playing" aria-live="polite">
        <span id="track-name">—</span>
        <span id="artist-name"></span>
      </div>

      <div id="controls">
        <span id="status-msg" role="status"></span>
        <button id="btn-prev"      disabled title="Previous (←)">⏮</button>
        <button id="btn-playpause" disabled title="Play/Pause (Space)" aria-label="Play">▶</button>
        <button id="btn-next"      disabled title="Next (→)">⏭</button>
      </div>
    </section>
  </div>

  <!--
    main.js loads the Spotify SDK dynamically after auth succeeds.
    This avoids SDK/module load order race conditions.
  -->
  <script type="module" src="main.js"></script>
</body>
</html>
```

> `$SPOTIFY_CLIENT_ID` is the only `$VAR` in this file. The `envsubst '$SPOTIFY_CLIENT_ID'` call in `entrypoint.sh` is scoped to this variable only.

- [ ] **Step 2: Commit**

```bash
git add app/index.html.tmpl
git commit -m "feat: add HTML template with login and player views"
```

---

### Task 4: CSS styles

**Files:**
- Create: `app/style.css`

- [ ] **Step 1: Create `app/style.css`**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #121212;
  color: #fff;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 4rem;
  min-height: 100vh;
}

.container {
  width: 320px;
  padding: 1.5rem;
}

h1 {
  font-size: 1rem;
  font-weight: 700;
  color: #1DB954;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 1.5rem;
}

/* ── Error banner ── */
#error-msg {
  background: #3e0c0c;
  color: #ff8080;
  padding: 0.6rem 0.75rem;
  border-radius: 4px;
  font-size: 0.8rem;
  margin-bottom: 1rem;
  line-height: 1.4;
}

/* ── Login view ── */
#login-view {
  text-align: center;
  padding: 2rem 0;
}

#btn-login {
  background: #1DB954;
  color: #000;
  border: none;
  border-radius: 2rem;
  padding: 0.75rem 2rem;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

#btn-login:hover { background: #1ed760; }

/* ── Playlist list ── */
#playlist-list {
  list-style: none;
  margin-bottom: 1.5rem;
}

#playlist-list li {
  padding: 0.45rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  color: #b3b3b3;
  transition: color 0.1s, background 0.1s;
}

#playlist-list li:hover       { color: #fff; background: #282828; }
#playlist-list li.active      { color: #1DB954; font-weight: 600; }
#playlist-list li .index-hint { color: #535353; font-size: 0.75rem; margin-right: 0.3rem; }

/* ── Now playing ── */
#now-playing {
  min-height: 2.8rem;
  margin-bottom: 0.75rem;
}

#track-name  { display: block; font-weight: 600; font-size: 0.875rem; }
#artist-name { display: block; font-size: 0.8rem; color: #b3b3b3; margin-top: 0.1rem; }

/* ── Transport controls ── */
#controls {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

#status-msg {
  font-size: 0.75rem;
  color: #b3b3b3;
  flex: 1;
}

#controls button {
  background: none;
  border: none;
  color: #fff;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  line-height: 1;
  transition: background 0.1s;
}

#controls button:hover:not(:disabled) { background: #282828; }
#controls button:disabled { color: #535353; cursor: default; }
```

- [ ] **Step 2: Commit**

```bash
git add app/style.css
git commit -m "feat: add minimal dark-theme CSS"
```

---

### Task 5: Verify Docker build

- [ ] **Step 1: Create a placeholder `app/main.js` so the build has a valid file**

```bash
echo "// placeholder" > app/main.js
echo "// placeholder" > app/auth.js
echo "// placeholder" > app/api.js
echo "// placeholder" > app/player.js
echo "// placeholder" > app/ui.js
```

- [ ] **Step 2: Build the image**

```bash
docker build -t light-spotting .
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Check image size**

```bash
docker image ls light-spotting
```

Expected: SIZE column shows ≤ 30MB.

- [ ] **Step 4: Run the container and verify nginx responds**

```bash
docker run --rm -d -e SPOTIFY_CLIENT_ID=test_client_id -p 8080:80 --name ls-test light-spotting
sleep 1
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080
docker stop ls-test
```

Expected output: `200`

- [ ] **Step 5: Commit**

```bash
git add app/main.js app/auth.js app/api.js app/player.js app/ui.js
git commit -m "chore: add placeholder JS files for Docker build verification"
```

---

## Chunk 2: JavaScript Modules — Auth + API

### Task 6: Auth module

**Files:**
- Modify: `app/auth.js`

The auth module is all pure functions + sessionStorage. No DOM access. No SDK dependency.

- [ ] **Step 1: Write `app/auth.js`**

```js
// auth.js — PKCE OAuth helpers, token storage, token refresh scheduling
// No DOM access. No SDK dependency. Pure functions + sessionStorage.

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
].join(' ');

const REDIRECT_URI = 'http://localhost:8080';
const TOKEN_URL    = 'https://accounts.spotify.com/api/token';
const AUTH_URL     = 'https://accounts.spotify.com/authorize';

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

/**
 * Generate a random 64-byte base64url-encoded code verifier.
 * @returns {string}
 */
export function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

/**
 * SHA-256 hash a verifier and return the base64url-encoded code challenge.
 * @param {string} verifier
 * @returns {Promise<string>}
 */
export async function generateCodeChallenge(verifier) {
  const data   = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(new Uint8Array(digest));
}

/** @param {Uint8Array} bytes @returns {string} */
function base64urlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g,  '');
}

/** @returns {string} 32-char hex state string */
export function generateState() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Auth flow ────────────────────────────────────────────────────────────────

/**
 * Redirect to Spotify auth page, storing verifier + state in sessionStorage.
 * @param {string} clientId
 */
export async function startAuth(clientId) {
  const verifier   = generateCodeVerifier();
  const challenge  = await generateCodeChallenge(verifier);
  const state      = generateState();

  sessionStorage.setItem('pkce_verifier', verifier);
  sessionStorage.setItem('pkce_state',    state);

  const params = new URLSearchParams({
    client_id:             clientId,
    response_type:         'code',
    redirect_uri:          REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
    state,
    scope:                 SCOPES,
  });

  window.location.href = `${AUTH_URL}?${params}`;
}

/**
 * Handle the OAuth callback.
 * Returns tokens on success, null if not a callback URL.
 * Throws on error or state mismatch.
 * @param {string} clientId
 * @returns {Promise<object|null>}
 */
export async function handleCallback(clientId) {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('code');
  const state  = params.get('state');
  const error  = params.get('error');

  if (error)          throw new Error(`Spotify auth error: ${error}`);
  if (!code || !state) return null; // Not a callback URL — normal page load

  const storedState = sessionStorage.getItem('pkce_state');
  if (state !== storedState) throw new Error('State mismatch — authentication failed, please try again');

  const verifier = sessionStorage.getItem('pkce_verifier');
  sessionStorage.removeItem('pkce_state');
  sessionStorage.removeItem('pkce_verifier');

  const tokens = await exchangeCode(code, verifier, clientId);
  storeTokens(tokens);

  // Remove code/state from URL without a page reload
  window.history.replaceState({}, '', '/');

  return tokens;
}

/**
 * Exchange auth code + verifier for tokens.
 * @param {string} code
 * @param {string} verifier
 * @param {string} clientId
 * @returns {Promise<object>} { access_token, refresh_token, expires_in, ... }
 */
export async function exchangeCode(code, verifier, clientId) {
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT_URI,
      client_id:     clientId,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ─── Token storage ────────────────────────────────────────────────────────────

/**
 * Store tokens in sessionStorage (cleared on tab close — accepted trade-off).
 * Always overwrites refresh_token if present (handles Spotify token rotation).
 * @param {{ access_token: string, refresh_token?: string, expires_in: number }} tokens
 */
export function storeTokens({ access_token, refresh_token, expires_in }) {
  sessionStorage.setItem('access_token', access_token);
  if (refresh_token) sessionStorage.setItem('refresh_token', refresh_token);
  sessionStorage.setItem('token_expiry', String(Date.now() + expires_in * 1000));
}

/** @returns {string|null} */
export function getAccessToken() {
  return sessionStorage.getItem('access_token');
}

export function clearTokens() {
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('refresh_token');
  sessionStorage.removeItem('token_expiry');
}

// ─── Token refresh ────────────────────────────────────────────────────────────

/**
 * Refresh the access token using the stored refresh token.
 * Spotify may rotate the refresh token — always overwrite the stored value.
 * @param {string} clientId
 * @returns {Promise<object>} new token response with expires_in
 */
export async function refreshTokens(clientId) {
  const refreshToken = sessionStorage.getItem('refresh_token');
  if (!refreshToken) throw new Error('No refresh token stored');

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     clientId,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  storeTokens(data); // overwrites access_token and (if present) refresh_token
  return data;
}

/**
 * Schedule a token refresh (expires_in - 300) seconds from now.
 * Recursively reschedules itself after each successful refresh.
 *
 * @param {string}   clientId
 * @param {number}   expiresIn  - seconds until expiry (from token response)
 * @param {Function} onFailed   - called if refresh fails; should prompt re-login
 */
export function scheduleRefresh(clientId, expiresIn, onFailed) {
  const ms = (expiresIn - 300) * 1000;
  setTimeout(async () => {
    try {
      const data = await refreshTokens(clientId);
      // Player's getOAuthToken reads from sessionStorage via getAccessToken(),
      // so it will automatically use the new token. No player re-init needed.
      scheduleRefresh(clientId, data.expires_in, onFailed);
    } catch (e) {
      console.error('Token refresh failed:', e);
      onFailed();
    }
  }, ms);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/auth.js
git commit -m "feat: add PKCE auth module with token storage and refresh scheduling"
```

---

### Task 7: Auth unit tests (browser)

**Files:**
- Create: `tests/test.html`

- [ ] **Step 1: Create `tests/` directory and `tests/test.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>auth.js unit tests</title>
  <style>
    body { font-family: monospace; padding: 1rem; }
    .pass { color: green; }
    .fail { color: red;   }
  </style>
</head>
<body>
  <h1>auth.js unit tests</h1>
  <pre id="output"></pre>
  <script type="module">
    import {
      generateCodeVerifier,
      generateCodeChallenge,
      generateState,
      storeTokens,
      getAccessToken,
      clearTokens,
    } from '../app/auth.js';

    const out = document.getElementById('output');
    let passed = 0, failed = 0;

    function assert(label, condition, detail = '') {
      if (condition) {
        out.innerHTML += `<span class="pass">✓ ${label}</span>\n`;
        passed++;
      } else {
        out.innerHTML += `<span class="fail">✗ ${label}${detail ? ': ' + detail : ''}</span>\n`;
        failed++;
      }
    }

    // ── generateCodeVerifier ──────────────────────────────────────────────────
    const v1 = generateCodeVerifier();
    assert('generateCodeVerifier returns a string', typeof v1 === 'string');
    assert('generateCodeVerifier length is 86 chars', v1.length === 86, `got ${v1.length}`);
    assert('generateCodeVerifier uses base64url chars only', /^[A-Za-z0-9\-_]+$/.test(v1));

    const v2 = generateCodeVerifier();
    assert('generateCodeVerifier produces unique values', v1 !== v2);

    // ── generateCodeChallenge ─────────────────────────────────────────────────
    // Known test vector: SHA-256('abc') base64url = 'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0'
    const challenge = await generateCodeChallenge('abc');
    assert(
      'generateCodeChallenge produces correct SHA-256 for "abc"',
      challenge === 'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0',
      `got ${challenge}`
    );
    assert('generateCodeChallenge returns base64url chars only', /^[A-Za-z0-9\-_]+$/.test(challenge));

    const c2 = await generateCodeChallenge(v1);
    assert('generateCodeChallenge returns a string', typeof c2 === 'string');
    assert('generateCodeChallenge result has no padding', !c2.includes('='));

    // ── generateState ─────────────────────────────────────────────────────────
    const s1 = generateState();
    assert('generateState returns a 32-char hex string', s1.length === 32 && /^[0-9a-f]+$/.test(s1));
    const s2 = generateState();
    assert('generateState produces unique values', s1 !== s2);

    // ── storeTokens / getAccessToken / clearTokens ────────────────────────────
    storeTokens({ access_token: 'tok_abc', refresh_token: 'ref_xyz', expires_in: 3600 });
    assert('getAccessToken returns stored access token', getAccessToken() === 'tok_abc');
    assert('refresh_token stored in sessionStorage', sessionStorage.getItem('refresh_token') === 'ref_xyz');
    assert('token_expiry stored', sessionStorage.getItem('token_expiry') !== null);

    // Token rotation: new refresh token overwrites old
    storeTokens({ access_token: 'tok_new', refresh_token: 'ref_new', expires_in: 3600 });
    assert('storeTokens overwrites refresh token on rotation', sessionStorage.getItem('refresh_token') === 'ref_new');

    // Missing refresh_token in response (not rotated) — should not overwrite
    storeTokens({ access_token: 'tok_new2', expires_in: 3600 });
    assert('storeTokens keeps existing refresh_token when not in response', sessionStorage.getItem('refresh_token') === 'ref_new');

    clearTokens();
    assert('clearTokens removes access_token', getAccessToken() === null);
    assert('clearTokens removes refresh_token', sessionStorage.getItem('refresh_token') === null);

    // ── Summary ───────────────────────────────────────────────────────────────
    out.innerHTML += `\n${passed} passed, ${failed} failed`;
  </script>
</body>
</html>
```

- [ ] **Step 2: Serve test page and verify all tests pass**

Open `tests/test.html` directly via a local dev server (the file uses `import` so it needs HTTP, not `file://`):

```bash
# From the repo root — Python's built-in server is fine for this
python3 -m http.server 9000
```

Then open `http://localhost:9000/tests/test.html` in your browser.

Expected: All assertions show green ✓, "N passed, 0 failed" at the bottom.

- [ ] **Step 3: Commit**

```bash
git add tests/test.html
git commit -m "test: add browser unit tests for PKCE auth helpers"
```

---

### Task 8: API module

**Files:**
- Modify: `app/api.js`

- [ ] **Step 1: Write `app/api.js`**

```js
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

  return res.json();
}

// ─── Playlists ────────────────────────────────────────────────────────────────

/**
 * Fetch all followed playlists and filter for Daily Mix entries.
 * Daily Mixes are owned by Spotify (owner.id === 'spotify') and have names
 * starting with 'Daily Mix'. The name filter is locale-specific — owner.id
 * is the authoritative check.
 *
 * Paginates automatically (max 50 per page).
 *
 * @param {string} accessToken
 * @returns {Promise<Array<{name: string, uri: string, id: string}>>} sorted by name
 */
export async function fetchDailyMixes(accessToken) {
  const mixes = [];
  let path = '/me/playlists?limit=50';

  while (path) {
    const data = await apiFetch(accessToken, path);

    const filtered = (data.items || []).filter(
      p => p && p.owner?.id === 'spotify' && p.name?.startsWith('Daily Mix')
    );
    mixes.push(...filtered);

    // data.next is the full URL; strip the base to get the path
    path = data.next ? data.next.replace(API, '') : null;
  }

  return mixes.sort((a, b) => a.name.localeCompare(b.name));
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
```

- [ ] **Step 2: Commit**

```bash
git add app/api.js
git commit -m "feat: add Spotify Web API module (playlists, transport)"
```

---

## Chunk 3: JavaScript Modules — Player, UI, Main + README

### Task 9: Player module

**Files:**
- Modify: `app/player.js`

The player module wraps the Spotify Web Playback SDK. It dynamically loads the SDK script so there are no race conditions with ES module loading.

- [ ] **Step 1: Write `app/player.js`**

```js
// player.js — Spotify Web Playback SDK wrapper
// Dynamically loads the SDK script after auth, avoiding load-order race conditions.

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

/**
 * Load the SDK and create a Spotify.Player instance.
 *
 * @param {Function} getToken   - () => string — reads current access token from storage
 * @param {Function} onReady    - (deviceId: string) => void
 * @param {Function} onNotReady - (deviceId: string) => void
 * @param {Function} onState    - (state: object) => void
 * @param {Function} onError    - (type: string, message: string) => void
 * @returns {Promise<Spotify.Player>}
 */
export function initPlayer(getToken, onReady, onNotReady, onState, onError) {
  return new Promise((resolve, reject) => {
    // Set the global callback before injecting the script tag.
    // The SDK calls this after loading.
    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name:          'Light Spotting',
        getOAuthToken: cb => cb(getToken()), // always reads fresh token from storage
        volume:        0.8,
      });

      player.addListener('ready',                ({ device_id }) => onReady(device_id));
      player.addListener('not_ready',            ({ device_id }) => onNotReady(device_id));
      player.addListener('player_state_changed', state           => onState(state));
      player.addListener('initialization_error', ({ message })   => onError('initialization', message));
      player.addListener('authentication_error', ({ message })   => onError('authentication', message));
      player.addListener('account_error',        ({ message })   => onError('account', message));

      player.connect();
      resolve(player);
    };

    // Inject the SDK script tag
    const script  = document.createElement('script');
    script.src    = SDK_URL;
    script.onerror = () => reject(new Error('Failed to load Spotify SDK'));
    document.body.appendChild(script);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/player.js
git commit -m "feat: add Spotify Web Playback SDK wrapper with dynamic loading"
```

---

### Task 10: UI module

**Files:**
- Modify: `app/ui.js`

The UI module is purely responsible for DOM updates. No business logic, no API calls.

- [ ] **Step 1: Write `app/ui.js`**

```js
// ui.js — DOM manipulation only. No business logic, no API calls.

// ─── Views ────────────────────────────────────────────────────────────────────

export function showLoginView() {
  document.getElementById('login-view').hidden  = false;
  document.getElementById('player-view').hidden = true;
}

export function showPlayerView() {
  document.getElementById('login-view').hidden  = true;
  document.getElementById('player-view').hidden = false;
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
 * Enable or disable all transport buttons and show/hide the status message.
 * @param {boolean} enabled
 */
export function setControlsEnabled(enabled) {
  ['btn-prev', 'btn-playpause', 'btn-next'].forEach(id => {
    document.getElementById(id).disabled = !enabled;
  });
  document.getElementById('status-msg').textContent = enabled ? '' : 'Reconnecting…';
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
```

- [ ] **Step 2: Commit**

```bash
git add app/ui.js
git commit -m "feat: add UI module (DOM updates, playlist render, keyboard shortcuts)"
```

---

### Task 11: Main entry point

**Files:**
- Modify: `app/main.js`

This wires everything together. It handles the auth callback on page load, initialises the SDK, loads playlists, and connects the transport controls.

- [ ] **Step 1: Write `app/main.js`**

```js
// main.js — entry point; wires auth → SDK → playlists → controls

import * as Auth   from './auth.js';
import * as Api    from './api.js';
import * as UI     from './ui.js';
import { initPlayer } from './player.js';

const CLIENT_ID = window.SPOTIFY_CLIENT_ID;

// Mutable app state
let deviceId          = null;
let playlists         = [];
let activePlaylistUri = null;
let player            = null;
let isPaused          = true;
let controlsBound     = false;

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function init() {
  // 1. Handle OAuth callback (code or error params in URL)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('code') || urlParams.has('error')) {
    try {
      const tokens = await Auth.handleCallback(CLIENT_ID);
      if (tokens) {
        Auth.scheduleRefresh(CLIENT_ID, tokens.expires_in, handleRefreshFailed);
      }
    } catch (e) {
      UI.showError(e.message);
      UI.showLoginView();
      return;
    }
  }

  // 2. Check for stored access token
  const accessToken = Auth.getAccessToken();
  if (!accessToken) {
    UI.showLoginView();
    document.getElementById('btn-login').addEventListener('click', () => Auth.startAuth(CLIENT_ID));
    return;
  }

  // 3. Show player shell, load SDK + playlists in parallel
  UI.showPlayerView();
  UI.setControlsEnabled(false);

  await Promise.all([
    loadPlaylists(),
    startSDK(),
  ]);
}

// ─── Playlists ────────────────────────────────────────────────────────────────

async function loadPlaylists() {
  try {
    playlists = await Api.fetchDailyMixes(Auth.getAccessToken());
    if (playlists.length === 0) {
      UI.showError('No Daily Mix playlists found. Make sure you follow them in Spotify.');
    } else {
      UI.hideError();
      UI.renderPlaylists(playlists, activePlaylistUri, onPlaylistSelect);
    }
  } catch (e) {
    await handleApiError(e, loadPlaylists);
  }
}

// ─── SDK ──────────────────────────────────────────────────────────────────────

async function startSDK() {
  try {
    player = await initPlayer(
      Auth.getAccessToken,  // pass the function — player reads fresh token each time
      onPlayerReady,
      onPlayerNotReady,
      onPlayerStateChange,
      onPlayerError,
    );
  } catch (e) {
    UI.showError(`Could not load Spotify player: ${e.message}`);
    console.error(e);
  }
}

function onPlayerReady(id) {
  deviceId = id;
  UI.setControlsEnabled(true);
  if (!controlsBound) {
    bindControls();
    controlsBound = true;
  }
}

function onPlayerNotReady() {
  UI.setControlsEnabled(false);
}

function onPlayerStateChange(state) {
  if (!state) return;

  const track = state.track_window?.current_track;
  if (track) {
    const artists = (track.artists || []).map(a => a.name).join(', ');
    UI.updateNowPlaying(track.name, artists);
  }

  isPaused = state.paused;
  UI.updatePlayPauseButton(isPaused);

  // Keep playlist highlight in sync with what's actually playing
  if (state.context?.uri && state.context.uri !== activePlaylistUri) {
    activePlaylistUri = state.context.uri;
    UI.renderPlaylists(playlists, activePlaylistUri, onPlaylistSelect);
  }
}

function onPlayerError(type, message) {
  console.error(`Player ${type} error: ${message}`);
  if (type === 'authentication') {
    handleUnauthorized();
  } else {
    UI.showError(`Player error (${type}): ${message}`);
  }
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function bindControls() {
  document.getElementById('btn-prev').addEventListener('click',      skipPrev);
  document.getElementById('btn-playpause').addEventListener('click', togglePlay);
  document.getElementById('btn-next').addEventListener('click',      skipNext);

  UI.bindKeyboard({
    togglePlay,
    next:           skipNext,
    prev:           skipPrev,
    selectByIndex:  i => { if (playlists[i]) onPlaylistSelect(playlists[i]); },
  });
}

async function onPlaylistSelect(playlist) {
  if (!deviceId) return;
  activePlaylistUri = playlist.uri;
  UI.renderPlaylists(playlists, activePlaylistUri, onPlaylistSelect);
  try {
    await Api.playPlaylist(Auth.getAccessToken(), deviceId, playlist.uri);
  } catch (e) {
    await handleApiError(e, () => onPlaylistSelect(playlist));
  }
}

async function togglePlay() {
  if (!deviceId) return;
  try {
    if (isPaused) await Api.resumePlayback(Auth.getAccessToken(), deviceId);
    else          await Api.pausePlayback(Auth.getAccessToken());
  } catch (e) {
    await handleApiError(e, togglePlay);
  }
}

async function skipNext() {
  if (!deviceId) return;
  try {
    await Api.skipNext(Auth.getAccessToken());
  } catch (e) {
    await handleApiError(e, skipNext);
  }
}

async function skipPrev() {
  if (!deviceId) return;
  try {
    await Api.skipPrevious(Auth.getAccessToken());
  } catch (e) {
    await handleApiError(e, skipPrev);
  }
}

// ─── Error handling ───────────────────────────────────────────────────────────

/**
 * Handle an API error. On 401, attempt token refresh then retry once.
 * @param {Error & { status?: number }} e
 * @param {Function} retry  - the function to retry after a successful refresh
 */
async function handleApiError(e, retry) {
  if (e.status === 401) {
    await handleUnauthorized(retry);
  } else {
    UI.showError(e.message);
    console.error(e);
  }
}

/**
 * Attempt a token refresh. On success, retry the failed operation once.
 * On failure, clear tokens and prompt re-login.
 * @param {Function} [retry]
 */
async function handleUnauthorized(retry) {
  try {
    const data = await Auth.refreshTokens(CLIENT_ID);
    Auth.scheduleRefresh(CLIENT_ID, data.expires_in, handleRefreshFailed);
    if (retry) await retry();
  } catch {
    Auth.clearTokens();
    UI.showLoginView();
    UI.showError('Session expired. Please log in again.');
  }
}

function handleRefreshFailed() {
  Auth.clearTokens();
  UI.showLoginView();
  UI.showError('Session expired. Please log in again.');
}

// ─── Start ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
```

- [ ] **Step 2: Commit**

```bash
git add app/main.js
git commit -m "feat: add main entry point wiring auth, SDK, playlists, and controls"
```

---

### Task 12: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# light-spotting

A tiny Spotify controller that runs in Docker. Choose from your Daily Mix playlists, and control playback — no Spotify desktop app required.

Audio plays through your browser tab, which registers as a Spotify Connect device. The container is an `nginx:alpine` static file server (~25 MB).

## Prerequisites

- Docker
- Spotify Premium account
- A modern browser (Chrome, Firefox, Edge)

## One-time Spotify setup

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and log in.
2. Click **Create app** (any name/description is fine).
3. In your new app's settings, under **Redirect URIs**, add:
   ```
   http://localhost:8080
   ```
   Save the settings.
4. Copy your **Client ID** from the app overview page.

> **Important:** The redirect URI must be entered exactly as `http://localhost:8080` with no trailing slash.

## Usage

### Build

```bash
docker build -t light-spotting .
```

### Run

```bash
docker run -e SPOTIFY_CLIENT_ID=<your_client_id> -p 8080:80 light-spotting
```

Open **http://localhost:8080** in your browser and click **Login with Spotify**.

### Controls

| Action | Mouse | Keyboard |
|--------|-------|----------|
| Select playlist | Click | `1` – `6` |
| Play / Pause | Click ▶/⏸ | `Space` |
| Next track | Click ⏭ | `→` |
| Previous track | Click ⏮ | `←` |

## Troubleshooting

**"No Daily Mix playlists found"**
Open Spotify and follow your Daily Mix playlists. They appear in the Home tab. Once followed, they'll show up here.

**"Authentication failed"**
Make sure the Redirect URI in your Spotify app settings is exactly `http://localhost:8080` (no trailing slash, no path).

**Audio stops unexpectedly**
The browser tab must remain open for playback to continue. Some browsers throttle background tabs — keep the tab active or disable tab suspension for this page.

**Accessing from another device**
The app only works at `localhost`. The Spotify Web Playback SDK requires a secure context; accessing from another machine on the network (e.g. `192.168.x.x`) requires HTTPS.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup guide and usage instructions"
```

---

### Task 13: End-to-end verification

- [ ] **Step 1: Final Docker build**

```bash
docker build -t light-spotting .
docker image ls light-spotting
```

Expected: build succeeds, SIZE ≤ 30MB.

- [ ] **Step 2: Run with real Client ID**

Prerequisite: complete the one-time Spotify Developer setup from the README (create app, add `http://localhost:8080` as Redirect URI, copy Client ID).

```bash
docker run -e SPOTIFY_CLIENT_ID=<your_real_client_id> -p 8080:80 --name ls light-spotting
```

- [ ] **Step 3: Browser checks**

Open `http://localhost:8080`. Verify in order:

1. Page loads — "Login with Spotify" button visible, no errors in console
2. Click Login → redirected to Spotify auth page
3. Authorize → redirected back to `http://localhost:8080`
4. Open DevTools → Application → Session Storage → `http://localhost:8080`. Keys `access_token`, `refresh_token`, and `token_expiry` are all present.
5. Daily Mix playlists listed (if none, follow them in Spotify first)
6. Click a playlist → audio begins playing in browser tab
7. Track name + artist updates in the Now Playing section
8. ⏸ button pauses audio; ▶ resumes
9. ⏭ skips to next track; ⏮ skips to previous
10. Keyboard: `Space` toggles play/pause, `→` / `←` skip, `1`–`6` switch playlists

- [ ] **Step 4: Cleanup**

```bash
docker stop ls && docker rm ls
```
