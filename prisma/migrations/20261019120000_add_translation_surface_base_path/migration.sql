-- mobile-strings (design §2): 기준 언어 파일 경로가 `{locale}` 치환으로 표현되지 않는 표면(Android `values/strings.xml`)만 채운다.
-- additive nullable — 기존 행 백필 없음(NULL = 기준 언어도 `pathTemplate` 치환). 버전을 건너뛴 업그레이드에서도 안전하다(SELF-HOSTING §3).

-- AlterTable
ALTER TABLE "TranslationSurface" ADD COLUMN     "basePath" TEXT;
