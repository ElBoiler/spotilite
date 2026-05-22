# Spotilite

A minimal Spotify controller that runs entirely in your browser. No desktop app, no Docker, no install.

Browse your saved playlists and control playback from a clean web UI.

## Requirements

- Spotify Premium account
- A modern browser

## Setup (one time, ~2 minutes)

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and click **Create app**.
2. Under **Redirect URIs** add the URL where you'll open Spotilite — **exactly**, including the trailing slash:
   - Hosted: `https://<your-github-username>.github.io/light-spotting/`
   - Local:  `http://127.0.0.1:8080/` *(Spotify blocks `localhost` — use the IP)*
3. Save the app and copy the **Client ID**.
4. Open Spotilite, paste the Client ID when prompted, click **Save**.
5. Click **Login with Spotify** and grant access.
6. Paste your Spotify playlist links, one per line. Right-click a playlist in Spotify → Share → Copy link to playlist.

That's it. Your Client ID and playlists are stored in your browser's `localStorage`; tokens live in `sessionStorage` and clear on tab close.

## Controls

| Action     | Click      | Keyboard |
|------------|------------|----------|
| Play/Pause | ⏸ button   | `Space`  |
| Next track | ⏭ button   | `→`      |
| Previous   | ⏮ button   | `←`      |
| Select mix | Click row  | `1`–`6`  |

## Self-host / run locally

The whole app is static files. To host your own copy:

**GitHub Pages (recommended).** Fork this repo, then in your fork's *Settings → Pages*, set source to **Deploy from a branch**, branch `main`, folder `/ (root)`. Your fork will be served at `https://<your-username>.github.io/light-spotting/` — register that as the Spotify redirect URI.

**Local static server.** From the repo root:

```sh
npx serve -l 8080
# or
python -m http.server 8080
```

Then open [http://127.0.0.1:8080/](http://127.0.0.1:8080/) and register that exact URL as the Spotify redirect URI.

## Notes

- Audio plays in the browser tab — keep it open while listening.
- Use `127.0.0.1` (not `localhost`) when serving locally — Spotify rejects `localhost` as a redirect URI.
- Tokens are stored in `sessionStorage` — log in again after closing the tab.
