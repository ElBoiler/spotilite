FROM nginx:alpine

# gettext provides envsubst
RUN apk add --no-cache gettext

COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /entrypoint.sh
COPY app/ /usr/share/nginx/html/

RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
