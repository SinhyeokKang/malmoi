import { Prisma } from "@/generated/prisma/client";

/**
 * **작업 언어 술어** — 활성(비-orphan)이고 제거 예정(`LocaleChange` REMOVE)이 아닌 로케일 (locale-add design §5 · spec 22). 진행률·결측 분모·
 * Keys 검색·Home/Inbox 항목·Sources 수가 이것으로 센다. 추가 제안(ADD)은 작업이다. 순수 판정은 `localeRole`(`lib/translations/summary.ts`)이고
 * 여기는 그 SQL·Prisma 사본이다 — 셋이 갈리면 표의 분모와 카드의 수가 어긋난다.
 *
 * ⚠️ 미전달 셀 수(`pendingWhere`)는 이 술어를 쓰지 않는다(design §1) — 제거 요청이 그 언어의 미전달을 폐기하므로 0이고, 섞으면 보호 판정이 갈린다.
 * ⚠️ `server-only`를 붙이지 않는다 — 격리 PG 통합 테스트가 이 모듈을 쓰는 조회를 직접 부른다.
 */
export const workLocaleWhere = {
  orphaned: false,
  NOT: { change: { is: { operation: "REMOVE" } } },
} satisfies Prisma.LocaleWhereInput;

/** raw SQL 사본 — `alias`의 `Locale` 행이 제거 예정이 아니다. 별칭은 코드 상수만 넘긴다(입력값을 넣지 않는다). */
export function notRemoving(alias: "l"): Prisma.Sql {
  const l = Prisma.raw(`"${alias}"`);
  return Prisma.sql`NOT EXISTS (SELECT 1 FROM "LocaleChange" lc_remove WHERE lc_remove."projectId" = ${l}."projectId" AND lc_remove."surfaceId" = ${l}."surfaceId" AND lc_remove."localeCode" = ${l}."code" AND lc_remove."operation" = 'REMOVE')`;
}
