-- Supabase 데이터 API 롤(anon·authenticated)의 public 스키마 USAGE·CREATE를 회수한다 (sec-audit-3 #2).
-- supabase_admin의 default ACL은 postgres로 지울 수 없어 대시보드로 만든 새 테이블이 두 롤에 열린 채 태어난다 —
-- 스키마 USAGE가 없으면 그 GRANT가 있어도 이름 해석 단계에서 막힌다. 탐지에 기대던 방어를 예방으로 바꾼다.
-- 롤 존재를 조건으로 거는 이유: 격리 PostgreSQL(test:projects:postgres)과 Prisma shadow DB에는 Supabase 롤이 없다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE USAGE, CREATE ON SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE USAGE, CREATE ON SCHEMA public FROM authenticated;
  END IF;
END $$;

-- PUBLIC의 USAGE도 걷는다 (결정 H) — prod nspacl에 =U가 있어 두 롤이 직접 GRANT 없이도 상속으로 USAGE를 되찾았다.
-- 안전한 이유: 런타임 롤 postgres는 직접 U를 갖고 CREATE는 스키마 소유자 pg_database_owner 멤버십으로 받는다.
-- service_role도 직접 U를 갖는다. 상속 USAGE를 잃는 것은 이 앱이 쓰지 않는 Supabase Auth·Storage·Realtime 내부 롤뿐이다.
-- dev는 이미 PUBLIC USAGE 없이(nspacl NULL → 소유자만) 돌고 있다. 격리 PostgreSQL에서는 no-op이거나 기본 권한을 걷을 뿐이다.
REVOKE USAGE ON SCHEMA public FROM PUBLIC;
