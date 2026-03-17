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
    function createPlayer() {
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
    }

    // If SDK already loaded, create the player directly without script injection.
    // onSpotifyWebPlaybackSDKReady only fires once, so re-injecting the script
    // would leave the Promise unresolved on reconnect.
    if (window.Spotify) {
      createPlayer();
      return;
    }

    // Set the global callback before injecting the script tag.
    // The SDK calls this after loading.
    window.onSpotifyWebPlaybackSDKReady = createPlayer;

    // Inject the SDK script tag
    const script   = document.createElement('script');
    script.src     = SDK_URL;
    script.onerror = () => reject(new Error('Failed to load Spotify SDK'));
    document.body.appendChild(script);
  });
}
