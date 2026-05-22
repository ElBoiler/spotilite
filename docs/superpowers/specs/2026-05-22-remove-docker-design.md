# Remove Docker, host on GitHub Pages — Design

**Date:** 2026-05-22
**Status:** Approved

## Goal

Make Spotilite a pure static site hosted on GitHub Pages. No Docker, no build step, no environment variables. Each user supplies their own Spotify Client ID via the UI; it persists in `localStorage`.

## Motivation

The app is already a fully static frontend. Docker only does two trivial jobs: serve files via nginx, and substitute `SPOTIFY_CLIENT_ID` into `index.html` at container start. Both can be replaced — the first by GitHub Pages, the second by a one-time setup step in the UI. Removing Docker eliminates the install/build/run friction and the platform-specific footguns (CRLF in `entrypoint.sh`, `localhost`-vs-`127.0.0.1` redirect URI mismatch).

## Files removed

- `Dockerfile`
- `entrypoint.sh`
- `nginx.conf`

## Files moved

- `app/*` → repo root. GitHub Pages will serve from the root of `main`. The `app/` directory is deleted.

## Files changed

### `index.html` (renamed from `app/index.html.tmpl`)

- Drop the `<script>window.SPOTIFY_CLIENT_ID = '__SPOTIFY_CLIENT_ID__';</script>` line.
- Add a new view `<section id="credentials-view" hidden>` containing:
  - Short instructions (where to get a Client ID, what redirect URI to register).
  - `<input id="client-id-input" type="text" spellcheck="false">` for the Client ID.
  - A read-only display of the redirect URI the user must register (filled in by JS from `window.location`).
  - `<button id="btn-save-client-id">Save & continue</button>`.
- Add a `btn-edit-credentials` affordance in the player view (next to "Edit playlists").

### `auth.js`

- Replace the module-level constant `REDIRECT_URI = 'http://127.0.0.1:8080'` with a function:
  ```js
  function getRedirectUri() {
    const { origin, pathname } = window.location;
    // Strip index.html if present; ensure trailing slash for exact-match.
    const base = pathname.replace(/index\.html$/, '');
    return origin + (base.endsWith('/') ? base : base + '/');
  }
  ```
- `startAuth` and `exchangeCode` call `getRedirectUri()` instead of using the constant.
- In `handleCallback`, replace `window.history.replaceState({}, '', '/')` with `window.history.replaceState({}, '', getRedirectUri())` so it works under a subpath (e.g. `/light-spotting/`).

### `main.js`

- Remove the `const clientId = window.SPOTIFY_CLIENT_ID;` block and its error message.
- Add `loadClientId()` / `saveClientId(id)` reading/writing `localStorage` key `spotify_client_id`.
- At init time:
  1. If no client ID stored → show credentials view.
  2. Else if URL contains `code` / `error` → run `handleCallback`.
  3. Else if access token present → load playlists; show setup or player view.
  4. Else → show login view.
- Wire `btn-save-client-id` to validate (non-empty, trimmed) and store, then show the login view.
- Wire `btn-edit-credentials` to show the credentials view pre-filled with the stored value.
- All references to `clientId` read from the live stored value (a `getClientId()` helper) rather than a module-level snapshot, so edits take effect without reload.

### `ui.js`

- Add `showCredentialsView()`, `getClientIdInput()`, `setClientIdInput()`, `setRedirectUriDisplay()`.
- Update `showLoginView`, `showSetupView`, `showPlayerView` to also hide the credentials view.

### `README.md`

Rewritten flow:

1. Go to developer.spotify.com/dashboard → Create app.
2. Under Redirect URIs add **exactly** `https://<your-username>.github.io/light-spotting/` (trailing slash included). Save. Copy Client ID.
3. Open `https://<your-username>.github.io/light-spotting/`.
4. Paste your Client ID, click Save.
5. Click "Login with Spotify", grant access.
6. Paste your playlist links, one per line.

A short "Self-host / fork" section explains: fork the repo, enable GitHub Pages (Settings → Pages → Deploy from branch `main`, root), register your fork's gh-pages URL as the Spotify redirect URI.

### `.gitattributes`

Keep as-is. The `*.sh` rule is now unused but harmless; removing it is a separate cleanup.

## Architecture

```
index.html          → 4 views: credentials, login, setup, player
main.js             → reads clientId from localStorage; routes views; wires events
auth.js             → REDIRECT_URI derived from window.location; PKCE flow unchanged
ui.js               → view show/hide + credentials inputs
api.js, player.js   → unchanged
favicon.svg         → unchanged
style.css           → unchanged (may add minimal styling for new view)
```

## Data flow at boot

```
DOMContentLoaded
  ↓
clientId in localStorage?
  ├─ no  → showCredentialsView()
  └─ yes ↓
URL has ?code= or ?error= ?
  ├─ yes → handleCallback() → token stored → continue
  └─ no  ↓
access token in sessionStorage?
  ├─ no  → showLoginView()
  └─ yes ↓
saved playlists in localStorage?
  ├─ no  → showSetupView()
  └─ yes → showPlayerView() → initPlayer() → scheduleRefresh()
```

## Edge cases

- **Trailing slash in redirect URI.** Spotify requires exact match. `getRedirectUri()` always returns a trailing slash. README emphasises this.
- **User edits Client ID after a successful login.** Clear stored tokens (`clearTokens()`) when saving a new Client ID, so the next action goes through OAuth again with the new app.
- **Empty/whitespace Client ID.** Validation in `btn-save-client-id` handler: trim, reject empty, show inline error.
- **Existing repo users with cached docker setup.** Out of scope — they re-clone or follow README.
- **Local serving still possible.** Anyone running `npx serve` or `python -m http.server` at the repo root gets the same app working at whatever port they choose, as long as they register that URL in their Spotify dashboard. Not documented as the primary path.

## Testing

- Manual smoke test on a deployed GitHub Pages URL: enter Client ID → login → save playlists → play/pause/skip → reload tab → edit credentials → re-login.
- `tests/test.html` (existing unit tests) — verify nothing references the old `window.SPOTIFY_CLIENT_ID` or the hardcoded redirect URI; update assertions if they do.

## Out of scope

- Switching token storage to `localStorage`.
- Adding a bundler / build step.
- PWA / offline support.
- Multi-account switching.
- Cleaning up the now-unused `*.sh` rule in `.gitattributes`.
