#!/bin/sh
set -e

# Inject SPOTIFY_CLIENT_ID into the HTML template.
# The quoted variable list ('$SPOTIFY_CLIENT_ID') prevents envsubst from
# corrupting any other $ patterns in the file (e.g. JS template literals).
envsubst '$SPOTIFY_CLIENT_ID' \
  < /usr/share/nginx/html/index.html.tmpl \
  > /usr/share/nginx/html/index.html

exec nginx -g 'daemon off;'
