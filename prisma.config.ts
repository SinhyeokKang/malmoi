// Prisma 7은 접속 URL을 스키마가 아니라 이 파일에서 읽는다 (`url`·`directUrl` 모두 스키마에서 제거됐다).
//
// **여기 있는 url은 마이그레이션 전용이다.** 런타임 접속은 lib/db.ts의 driver adapter가
// 별도로 잡는다. 그래서 v6의 url/directUrl 쌍이 이렇게 갈린다:
//   - 이 파일         → DIRECT_URL  (session 모드 pooler 5432) — DDL 세션이 필요하다
//   - lib/db.ts      → DATABASE_URL (transaction 모드 pooler 6543) — 서버리스 커넥션 절약
// 바꿔 쓰면 마이그레이션이 DDL 세션을 못 잡아 실패하거나 런타임 커넥션이 고갈된다.
//
// ⚠️ dotenv는 기본적으로 `.env`만 읽는다. 이 프로젝트의 시크릿은 Next.js 관례에 따라
// `.env.local`에 있으므로 경로를 명시해야 한다. 안 하면 URL이 undefined인 채로
// "P1001 Can't reach database server"가 떠서 접속 문제로 오진하게 된다.
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local" });

/**
 * ⚠️ **`env("DIRECT_URL")`을 쓰지 않는다.** 그 헬퍼는 **config 로드 시점에** 변수가 없으면
 * 던지고, 이 파일은 `prisma generate`에도 로드된다 — DB에 접속조차 하지 않는 명령이 마이그레이션
 * 전용 URL을 요구하게 된다. `pnpm build`가 generate를 거치므로 **`.env.local`이 없는 환경
 * (Vercel·새 체크아웃)의 빌드가 통째로 죽는다.** 2026-09-03 Vercel 첫 배포가 정확히 이걸로
 * 실패했고, 2026-08-31에 같은 파일이 같은 이유로 CI를 red로 만든 전례가 있다
 * (`docs/POSTMORTEM.md` — "모듈 로드 시점에 환경변수를 요구해 CI가 red").
 *
 * `datasource`는 **마이그레이션·introspection 전용**이라(@prisma/config 타입 주석) 없으면
 * 생략한다. 마이그레이션 명령을 URL 없이 돌리면 Prisma가 그 시점에 datasource 부재를 알린다 —
 * 필요한 명령에서만 실패하는 것이 요지다.
 */
const directUrl = process.env["DIRECT_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(directUrl ? { datasource: { url: directUrl } } : {}),
});
