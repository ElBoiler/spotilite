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
 * Returns seconds remaining until the access token expires.
 * Returns 0 if expiry is unknown or already past.
 */
export function getTokenExpiresIn() {
  const expiry = parseInt(sessionStorage.getItem('token_expiry') || '0', 10);
  return Math.max(0, Math.floor((expiry - Date.now()) / 1000));
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
  return setTimeout(async () => {
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
