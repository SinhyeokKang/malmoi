-- Supabase 데이터 API 롤(anon·authenticated)의 public 스키마 USAGE·CREATE를 회수한다 (sec-audit-3 #2).
-- supabase_admin의 default ACL은 postgres로 지울 수 없어 대시보드로 만든 새 테이블이 두 롤에 열린 채 태어난다 —
-- 스키마 USAGE가 없으면 그 GRANT가 있어도 이름 해석 단계에서 막힌다. 탐지에 기대던 방어를 예방으로 바꾼다.
-- 롤 존재를 조건으로 거는 이유: 격리 PostgreSQL(test:projects:postgres)과 Prisma shadow DB에는 Supabase 롤이 없다.
-- ⚠️ PUBLIC의 USAGE는 건드리지 않는다 — PUBLIC이 USAGE를 가지면 두 롤이 그것을 상속하므로 적용 뒤 has_schema_privilege로 재조회한다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE USAGE, CREATE ON SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE USAGE, CREATE ON SCHEMA public FROM authenticated;
  END IF;
END $$;
