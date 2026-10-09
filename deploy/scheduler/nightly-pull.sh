#!/bin/sh
# 기존 `GET /api/pull`을 내부망으로 부른다 (self-hosting design §6). 응답을 해석하지 않는다 — 프로젝트별 결과는 web 로그의
# `summarizeNightly` 줄이 정본이고, `-f`는 HTTP 오류(잘못된 비밀 401 등)만 실패로 남긴다. 재시도·따라잡기 없음.
#
# --max-time 300: `next start`는 maxDuration을 강제하지 않으므로 상한은 루프 예산(45초)과 진행 중 항목의 완료뿐이다
# (POSTMORTEM 2026-10-07). curl이 끊어도 서버 작업은 계속된다.
#
# ⚠️ Authorization 헤더는 파일(`-H @file`)로 넘긴다 — 명령줄에 비밀이 실리면 ps에 보인다. 파일은 entrypoint가 만든다.
set -eu
exec curl -fsS --max-time 300 -H @/run/malmoi/cron-auth http://web:3000/api/pull
