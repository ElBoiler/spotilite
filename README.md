# light-spotting

A minimal Spotify controller that runs in Docker. No Spotify desktop app needed — just a browser tab.

Browse your Daily Mix playlists and control playback from a clean web UI.

## Requirements

- Docker
- Spotify Premium account
- A browser on the same machine as Docker

## One-time Spotify setup

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Click **Create app**
3. Under **Redirect URIs** add exactly: `http://localhost:8080` *(no trailing slash)*
4. Save. Copy the **Client ID**.

> **Daily Mixes not appearing?** Open Spotify and follow each Daily Mix playlist first.
> They only appear via the API once you've followed them.

## Run

```sh
docker run -e SPOTIFY_CLIENT_ID=your_client_id_here -p 8080:80 light-spotting
```

Open [http://localhost:8080](http://localhost:8080) in your browser and log in.

## Build locally

```sh
git clone <this repo>
cd light-spotting
docker build -t light-spotting .
docker run -e SPOTIFY_CLIENT_ID=your_client_id -p 8080:80 light-spotting
```

## Controls

| Action     | Click      | Keyboard |
|------------|------------|----------|
| Play/Pause | ⏸ button   | `Space`  |
| Next track | ⏭ button   | `→`      |
| Previous   | ⏮ button   | `←`      |
| Select mix | Click row  | `1`–`6`  |

## Notes

- Audio plays in the browser tab — keep it open while listening
- Works on `localhost` only (Spotify SDK requires a secure context)
- Tokens are stored in `sessionStorage` — log in again after closing the tab
