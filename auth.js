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

const TOKEN_URL    = 'https://accounts.spotify.com/api/token';
const AUTH_URL     = 'https://accounts.spotify.com/authorize';

// Spotify requires an exact-match redirect URI registered in the dashboard.
// Derive it from the current page so the same code works on GitHub Pages
// or any local static server. Note: when serving locally, Spotify prohibits
// 'localhost' — use 127.0.0.1.
export function getRedirectUri() {
  const { origin, pathname } = window.location;
  const base = pathname.replace(/index\.html$/, '');
  return origin + (base.endsWith('/') ? base : base + '/');
}

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
    redirect_uri:          getRedirectUri(),
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
  window.history.replaceState({}, '', getRedirectUri());

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
      redirect_uri:  getRedirectUri(),
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
  const t = sessionStorage.getItem('access_token');
  return t ? t.trim() : null;
}

export function clearTokens() {
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('refresh_token');
  sessionStorage.removeItem('token_expiry');
}

// ─── Token refresh ────────────────────────────────────────────────────────────

/**
 * Classify a failed token-refresh response as terminal or transient.
 *
 * Terminal failures mean the refresh token is dead and re-auth is the only
 * recovery (per Spotify's July 2026 6-month expiry change: discard, don't retry).
 * Transient failures (network, rate limit, server error) leave the refresh token
 * valid, so the caller should keep it and retry later.
 *
 * @param {{ status: number, body: object|null }} info
 *   status - HTTP status (0 for a network-level failure)
 *   body   - parsed JSON error body, or null if unavailable
 * @returns {'terminal'|'transient'}
 */
export function classifyRefreshError({ status, body }) {
  // Expired/revoked refresh token: Spotify returns 400 invalid_grant.
  if (status === 400 && body?.error === 'invalid_grant') return 'terminal';
  // Token endpoint 401 means client misconfig — retrying won't help.
  if (status === 401) return 'terminal';
  // Rate limited or server-side error — token is fine, try again later.
  if (status === 429 || status >= 500) return 'transient';
  // Anything else (network failure status 0, unexpected 4xx): default to
  // transient so an ambiguous blip never needlessly logs the user out.
  return 'transient';
}

// Single-flight guard: the scheduled timer and on-demand 401 retries can request
// a refresh near-simultaneously. Spotify rotates the refresh token, so two
// parallel POSTs would let the second reuse an already-consumed token and get a
// spurious invalid_grant. Concurrent callers share one in-flight promise instead.
let _refreshing = null;

/**
 * Refresh the access token using the stored refresh token.
 * Spotify may rotate the refresh token — always overwrite the stored value.
 *
 * On failure throws an Error with `.kind` set to 'terminal' or 'transient'
 * (see classifyRefreshError). Concurrent calls share a single in-flight request.
 *
 * @param {string} clientId
 * @returns {Promise<object>} new token response with expires_in
 */
export function refreshTokens(clientId) {
  if (_refreshing) return _refreshing;
  _refreshing = doRefresh(clientId).finally(() => { _refreshing = null; });
  return _refreshing;
}

async function doRefresh(clientId) {
  const refreshToken = sessionStorage.getItem('refresh_token');
  if (!refreshToken) {
    const err = new Error('No refresh token stored');
    err.kind = 'terminal';
    throw err;
  }

  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
        client_id:     clientId,
      }),
    });
  } catch (e) {
    // Network-level failure (offline, DNS, CORS abort) — no HTTP response.
    const err = new Error(`Token refresh failed (network): ${e.message}`);
    err.kind = 'transient';
    throw err;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const err  = new Error(`Token refresh failed (${res.status}): ${body ? JSON.stringify(body) : ''}`);
    err.kind   = classifyRefreshError({ status: res.status, body });
    throw err;
  }

  const data = await res.json();
  storeTokens(data); // overwrites access_token and (if present) refresh_token
  return data;
}

/**
 * Returns seconds remaining until the access token expires.
 * Returns 0 if expiry is unknown or already past.
 */
export function getTokenExpiresIn() {
  const expiry = parseInt(sessionStorage.getItem('token_expiry') || '0', 10);
  return Math.max(0, Math.floor((expiry - Date.now()) / 1000));
}

// Retry delay (seconds) after a transient refresh failure, while the current
// access token is still valid. Kept short so we recover quickly from a blip.
const TRANSIENT_RETRY_SECONDS = 30;

/**
 * Schedule a token refresh (expires_in - 300) seconds from now.
 * Recursively reschedules itself after each successful refresh.
 *
 * On a terminal failure (dead refresh token) calls onFailed() to prompt re-login.
 * On a transient failure (network/5xx/429) keeps the token and retries shortly,
 * only giving up (onFailed) once the access token has actually expired.
 *
 * @param {string}   clientId
 * @param {number}   expiresIn  - seconds until expiry (from token response)
 * @param {Function} onFailed   - called if refresh fails terminally; should prompt re-login
 */
export function scheduleRefresh(clientId, expiresIn, onFailed) {
  const ms = (expiresIn - 300) * 1000;
  return setTimeout(async () => {
    try {
      const data = await refreshTokens(clientId);
      // Player's getOAuthToken reads from sessionStorage via getAccessToken(),
      // so it will automatically use the new token. No player re-init needed.
      scheduleRefresh(clientId, data.expires_in, onFailed);
    } catch (e) {
      console.error('Token refresh failed:', e);
      if (e.kind === 'transient' && getTokenExpiresIn() > 0) {
        // Token still valid — ride out the blip and try again soon.
        scheduleRefresh(clientId, TRANSIENT_RETRY_SECONDS + 300, onFailed);
      } else {
        onFailed();
      }
    }
  }, ms);
}
