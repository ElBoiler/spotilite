#!/bin/sh
set -e

# Replace __SPOTIFY_CLIENT_ID__ placeholder with the env var value.
# Uses sed (busybox, always available in alpine) — no gettext package needed.
sed "s/__SPOTIFY_CLIENT_ID__/${SPOTIFY_CLIENT_ID}/g" \
  /usr/share/nginx/html/index.html.tmpl \
  > /usr/share/nginx/html/index.html

exec nginx -g 'daemon off;'
