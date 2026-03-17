# Spotify Controller — Design Spec
*2026-03-17*

## Problem / Goal

Control Spotify (Daily Mix playlists + transport) from a lightweight Docker container, without the Spotify desktop app installed or open. Audio plays through the browser tab, which also serves as the UI. Runs on `localhost` only.

## Approach

**Web Playback SDK + PKCE OAuth, served by nginx:alpine.**

No backend runtime (no Python, no Node). The container is an nginx:alpine static file server. All logic — auth, playback, API calls — runs in the browser via the Spotify Web Playback SDK and Fetch API.

> **Locality constraint:** The Web Playback SDK requires a secure context. `http://localhost` is permitted by browsers; accessing from another machine on the network (e.g. `192.168.x.x`) is not supported without HTTPS, which is out of scope.

> **Tab requirement:** The browser tab must remain open and active for audio playback to continue. Closing the tab stops playback. If the browser throttles or suspends the tab, the SDK may disconnect (see Error Handling).

## Architecture

```
Docker container (nginx:alpine, ~8MB)
└── /usr/share/nginx/html/
    ├── index.html     — shell + markup, SPOTIFY_CLIENT_ID placeholder
    ├── app.js         — all application logic
    └── style.css      — minimal styles

Entrypoint (entrypoint.sh):
  envsubst '$SPOTIFY_CLIENT_ID' < index.html.tmpl > index.html
  # Variable list is quoted to prevent corrupting ${}  in JS or CSS
  exec nginx -g 'daemon off;'
```

```
Browser
├── PKCE OAuth flow        — auth with Spotify, no backend secret needed
├── Web Playback SDK       — registers browser as "Light Spotting" Connect device
├── Spotify Web API        — fetch Daily Mix playlists, issue transport commands
└── Token refresh logic    — refreshes access token before 1-hour expiry
```

## Data Flow

1. **Startup**: `docker run -e SPOTIFY_CLIENT_ID=xxx -p 8080:80 light-spotting`
   - Port mapping is `8080:80` (host 8080 → container nginx port 80)
2. **Auth**: On page load, if no token in `sessionStorage`, show Login button.
   - User clicks → browser redirected to Spotify PKCE auth page
   - `code_verifier` (random 64-byte base64url) and PKCE `state` stored in `sessionStorage` before redirect
   - Spotify redirects back to `http://localhost:8080` (no trailing slash — must match dashboard exactly)
   - JS validates `state` from URL matches stored value (prevents CSRF)
   - JS POSTs to `https://accounts.spotify.com/api/token` with `grant_type=authorization_code`, `code`, `code_verifier`, `client_id`, `redirect_uri`
   - Stores `access_token` and `refresh_token` in `sessionStorage`
   - *On tab close, tokens are lost; user must log in again — accepted trade-off*
3. **Token Refresh**: `setTimeout` fires 5 minutes before expiry
   - Duration is `(expires_in - 300) * 1000` ms, computed from the token response field — not a hardcoded constant
   - POST `https://accounts.spotify.com/api/token` with `grant_type=refresh_token`, `refresh_token`, `client_id`
   - Response may include a new `refresh_token` (token rotation) — always overwrite stored value
4. **SDK Init**: Web Playback SDK initialises with current access token, registers `"Light Spotting"` device, receives `device_id` from `ready` event
5. **Playlists**: `GET /v1/me/playlists` (paginated, up to 50 per page), filtered client-side:
   - `owner.id === 'spotify'` AND name starts with `"Daily Mix"`
   - *Locale caveat: Daily Mix names are localised. The name filter is a heuristic; non-English locales may not match. The `owner.id === 'spotify'` check is the authoritative filter.*
   - *Visibility caveat: Daily Mixes only appear here if the user has followed them in Spotify. Document this in the README.*
6. **Play**: `PUT /v1/me/player/play` with `context_uri` of selected playlist and `device_id`
7. **Transport**: `POST /v1/me/player/next|previous`, `PUT /v1/me/player/pause|play`
8. **Now Playing**: SDK `player_state_changed` event updates track/artist in real time

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | `FROM nginx:alpine`, copies app, sets entrypoint |
| `entrypoint.sh` | Scoped `envsubst` injects `SPOTIFY_CLIENT_ID`, starts nginx |
| `app/index.html.tmpl` | HTML template with `__SPOTIFY_CLIENT_ID__` placeholder (or use envsubst placeholder) |
| `app/app.js` | PKCE auth, token refresh, SDK setup, API calls, UI rendering |
| `app/style.css` | Minimal styles (no external dependencies) |
| `nginx.conf` | `listen 80; root /usr/share/nginx/html;` — serves static files |

## UI

Single-page, no framework, no external fonts or icons:

```
┌──────────────────────────────┐
│  Daily Mix 1   ← playing     │
│  Daily Mix 2                 │
│  Daily Mix 3                 │
│  Daily Mix 4                 │
│  Daily Mix 5                 │
│  Daily Mix 6                 │
├──────────────────────────────┤
│  Song Name — Artist          │
│  [⏮]  [⏸ Pause]  [⏭]      │
└──────────────────────────────┘
```

- Keyboard shortcuts: `Space` = play/pause, `→` = next, `←` = prev, `1-6` = select mix
- Transport buttons disabled until SDK `ready` event fires

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Not authenticated (page load) | Show "Login with Spotify" button; do not auto-redirect (prevents redirect loops) |
| PKCE `state` mismatch | Show error: "Authentication failed — please try again" |
| SDK `not_ready` event | Re-initialize SDK; disable transport controls; show "Reconnecting…" |
| SDK disconnects (tab throttled) | Same as `not_ready` — re-init and re-transfer playback to device |
| No Daily Mixes found | Show "No Daily Mix playlists found. Make sure you follow them in Spotify." |
| API 401 | Attempt token refresh; if refresh fails, clear tokens and prompt re-login |
| API other error | Log to console; show brief inline error message |

## OAuth Scopes Required

| Scope | Purpose |
|-------|---------|
| `streaming` | Web Playback SDK |
| `user-read-email` | SDK prerequisite |
| `user-read-private` | SDK prerequisite |
| `user-read-playback-state` | Not currently used — SDK `player_state_changed` provides playback state; retained for future REST polling |
| `user-modify-playback-state` | Play/pause/skip |
| `playlist-read-private` | User's private playlists (Daily Mixes are Spotify-owned and public; this scope gates the user's own private playlists — included for completeness) |

## One-time Setup (user)

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create an app (any name) → note the **Client ID**
3. Under app settings → Redirect URIs → add exactly: `http://localhost:8080` (no trailing slash)
4. Run: `docker run -e SPOTIFY_CLIENT_ID=<client_id> -p 8080:80 light-spotting`
5. Open `http://localhost:8080` in your browser
6. If Daily Mixes don't appear, open Spotify and follow each Daily Mix playlist first

## Verification

1. `docker build -t light-spotting .` — succeeds, image ≤ 30MB (nginx:alpine is ~23MB uncompressed)
2. `docker run -e SPOTIFY_CLIENT_ID=xxx -p 8080:80 light-spotting`
3. Open `http://localhost:8080` — login button visible
4. Log in → redirected back, Daily Mix playlists listed
5. Click a mix → audio plays in browser
6. Pause/resume/skip work; keyboard shortcuts work
7. Inspect `sessionStorage` — `access_token`, `refresh_token` present
8. Wait `(expires_in − 5)` minutes without closing tab — token refreshes silently (typically ~55 min)
