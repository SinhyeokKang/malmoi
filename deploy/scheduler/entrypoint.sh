#!/bin/sh
# CRON_SECRET을 헤더 파일로 옮기고 crond를 전면에서 띄운다. 스케줄러는 Cron 비밀과 내부 목적지만 안다 —
# DB·OAuth·암호화 키를 받지 않는다(design §6).
set -eu
: "${CRON_SECRET:?CRON_SECRET is required}"
umask 077
mkdir -p /run/malmoi
printf 'Authorization: Bearer %s\n' "$CRON_SECRET" > /run/malmoi/cron-auth
unset CRON_SECRET
exec crond -f -l 6
