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
import { defineConfig, env } from "prisma/config";

config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DIRECT_URL") },
});
