-- 셀프 호스팅 DB의 런타임 롤 bootstrap (design §4 · SH-02).
--
-- 마이그레이션 20260926175555가 public의 PUBLIC USAGE를 걷으므로, 앱이 쓰는 런타임 롤은 여기서 받는 명시 권한 없이는
-- 쿼리 자체가 실패한다. 앱에는 DDL·superuser 자격증명을 주지 않는다 — 마이그레이션 롤과 런타임 롤을 가른다.
--
-- ⚠️ prisma/migrations/에 넣지 않는다 — 넣으면 /merge의 db:deploy가 hosted prod에 적용한다. 설치 DB의 롤·권한 설정이다.
-- ⚠️ 매 업그레이드마다 `prisma migrate deploy` 다음에 다시 돈다 — 전부 멱등이어야 한다.
--
-- 실행: DB를 소유한 마이그레이션 롤(CREATEROLE 필요) 또는 superuser가 psql(15+, `\getenv`)로.
--   RUNTIME_DB_PASSWORD=… psql -X -v ON_ERROR_STOP=1 \
--     -v runtime_role=<런타임 롤> -v migrate_role=<마이그레이션 롤> -f deploy/bootstrap.sql
-- 비밀번호는 환경변수로 받는다 — psql -v로 넘기면 명령줄(ps)에 보인다.
-- 런타임 롤이 이미 있으면 만들지도 비밀번호를 바꾸지도 않는다 — 비밀번호 교체는 ALTER ROLE로 따로 한다.

\set ON_ERROR_STOP on
\getenv runtime_password RUNTIME_DB_PASSWORD

-- 선판정. 실패는 고정 사유 코드(`bootstrap: <code>`)로만 RAISE한다 — 실패한 문장 전문이 서버 로그에 남으므로(log_min_error_statement)
-- 비밀번호가 담긴 CREATE ROLE이 예측 가능한 이유로 실패하는 경로를 여기서 막는다.
\if :{?runtime_role}
\else
DO $$ BEGIN RAISE EXCEPTION 'bootstrap: runtime-role-missing'; END $$;
\endif
\if :{?migrate_role}
\else
DO $$ BEGIN RAISE EXCEPTION 'bootstrap: migrate-role-missing'; END $$;
\endif
\if :{?runtime_password}
\else
DO $$ BEGIN RAISE EXCEPTION 'bootstrap: password-missing'; END $$;
\endif
SELECT
  :'runtime_password' = '' AS runtime_password_empty,
  :'runtime_role' = :'migrate_role' AS runtime_is_migrate,
  -- 이미 있는 롤의 속성을 본다 — superuser·마이그레이션 롤을 런타임 롤로 주면 GRANT가 no-op으로 "성공"하고 앱이 DDL 자격증명으로 돈다.
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_role' AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls)) AS runtime_privileged,
  NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_role')
    AND NOT (SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user) AS cannot_create
\gset
\if :runtime_password_empty
DO $$ BEGIN RAISE EXCEPTION 'bootstrap: password-empty'; END $$;
\endif
\if :runtime_is_migrate
DO $$ BEGIN RAISE EXCEPTION 'bootstrap: runtime-role-is-migrate-role'; END $$;
\endif
\if :runtime_privileged
DO $$ BEGIN RAISE EXCEPTION 'bootstrap: runtime-role-privileged'; END $$;
\endif
\if :cannot_create
DO $$ BEGIN RAISE EXCEPTION 'bootstrap: cannot-create-role'; END $$;
\endif

-- 이하 한 트랜잭션 — 중간에 멈추면(ON_ERROR_STOP) 연결이 끊기며 전부 롤백된다.
BEGIN;

-- 1. 런타임 롤 — 없을 때만 만든다. 이름·비밀번호는 format의 %I·%L로 인용한다.
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'runtime_role', :'runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_role') \gexec

-- 2. 기존 객체. ALTER DEFAULT PRIVILEGES는 이후 만들어지는 객체에만 걸리므로 따로 준다.
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"runtime_role";
-- 마이그레이션 이력은 마이그레이션 롤만 본다 — 런타임에서 읽는 코드가 없고, 쓰면 이력이 거짓이 된다.
SELECT format('REVOKE ALL ON TABLE public.%I FROM %I', '_prisma_migrations', :'runtime_role')
WHERE to_regclass('public._prisma_migrations') IS NOT NULL \gexec

-- 3. 다음 업그레이드의 마이그레이션이 만들 객체 — 마이그레이션 롤이 소유자이므로 FOR ROLE로 그 롤에 건다.
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrate_role" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrate_role" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"runtime_role";

COMMIT;
