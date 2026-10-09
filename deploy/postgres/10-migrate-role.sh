#!/bin/sh
# postgres 이미지의 초기화 단계(빈 데이터 볼륨에서 한 번)에만 돈다 — superuser가 쓰이는 유일한 자리다 (self-hosting design §4).
#
# 마이그레이션 롤 = DB를 소유한 비-superuser + CREATEROLE. `deploy/bootstrap.sql`이 이 롤로 런타임 롤을 만든다(CREATEROLE 필요).
# 앱(web)은 bootstrap이 만든 런타임 롤로만 붙는다 — DDL·superuser 자격증명을 받지 않는다.
#
# ⚠️ 비밀번호는 env에서 psql 변수로 넘기고 `format('%L')`로 인용한다 — 명령줄(ps)·SQL 문자열 조립에 원문이 실리지 않게.
# ⚠️ 이 스크립트는 볼륨이 이미 있으면 돌지 않는다 — 비밀번호를 바꾸려면 ALTER ROLE을 직접 친다.
set -eu

: "${MIGRATE_DB_PASSWORD:?MIGRATE_DB_PASSWORD is required}"

psql -X -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv migrate_password MIGRATE_DB_PASSWORD
SELECT format('CREATE ROLE malmoi_migrate LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB CREATEROLE NOINHERIT', :'migrate_password') \gexec
SELECT format('ALTER DATABASE %I OWNER TO malmoi_migrate', current_database()) \gexec
-- PG15+의 public은 pg_database_owner 소유라 DB 소유자가 곧 스키마 소유자다. 명시해 둔다.
ALTER SCHEMA public OWNER TO malmoi_migrate;
SQL
