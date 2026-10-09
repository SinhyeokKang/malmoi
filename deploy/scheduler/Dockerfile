# 야간 pull 스케줄러 — busybox crond + curl만 든다 (self-hosting design §6).
FROM alpine:3.20
RUN apk add --no-cache curl
COPY crontab /etc/crontabs/root
COPY nightly-pull.sh /usr/local/bin/nightly-pull
COPY entrypoint.sh /usr/local/bin/entrypoint
ENV TZ=UTC
ENTRYPOINT ["/usr/local/bin/entrypoint"]
