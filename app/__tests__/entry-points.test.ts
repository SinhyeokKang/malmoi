import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **인가 없이 실행되는 서버 진입점이 0인지 소스에서 센다** (spec 완료 조건 6).
 *
 * ⚠️ 읽어서 판정하는 것은 한 번 지나면 무너진다. `lib/adapters/__tests__/contract.ts`가 `ADAPTERS`를
 * 순회해 매트릭스를 강제하는 것과 같은 성질의 **상시 방어선**이다 — 새 Action·새 페이지가 인가를
 * 안 지나면 여기서 red가 된다.
 *
 * **예외는 이름으로 고정한다.** 경계가 다른 진입점들이고, 각자 자기 인증을 한다:
 * - `/api/push` — Bearer `PUSH_TOKEN` (CI가 부른다. 사람이 아니다)
 * - `/api/pull` — `CRON_SECRET` (Vercel Cron)
 * - `/api/auth/[...nextauth]` — Auth.js 핸들러 자체
 * - `/` — 로그인 화면. 세션이 없는 사람이 보는 유일한 화면이다
 * - `/invite/[token]` — **수락 전엔 멤버가 아니다.** 토큰이 인가를 대신한다 (membership.test.ts)
 *
 * 목록에 이름을 더하려면 **왜 그 진입점이 프로젝트 인가를 안 지나는지**가 함께 설명돼야 한다.
 */

const APP = fileURLToPath(new URL("..", import.meta.url));

/** 프로젝트 인가를 지나지 않아도 되는 진입점. 경로는 `app/` 기준이다. */
const EXEMPT = new Set([
  "api/push/route.ts",
  "api/pull/route.ts",
  "api/auth/[...nextauth]/route.ts",
  "page.tsx",
  "invite/[token]/page.tsx",
  "invite/actions.ts",
]);

/** 인가를 지났다고 인정하는 호출. 셋 다 결국 `planProjectAccess`로 간다. */
const GUARDS = ["requireProjectAccess", "getProjectAccess", "requireUser"];

function walk(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    // 테스트와 레이아웃은 진입점이 아니다 — 레이아웃은 차단 지점이 될 수 없다(병렬 렌더).
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = join(dir, entry);
    const rel = base === "" ? entry : `${base}/${entry}`;
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, rel));
      continue;
    }
    if (/^(page\.tsx|route\.ts|actions\.ts)$/.test(entry)) out.push(rel);
  }
  return out;
}

/** 라우트 그룹 `(edit)`은 URL에 없고 예외 목록도 URL 기준이라 지운다. */
function normalize(rel: string): string {
  return rel
    .split("/")
    .filter((part) => !(part.startsWith("(") && part.endsWith(")")))
    .join("/");
}

const ENTRY_POINTS = walk(APP).map((rel) => ({
  rel,
  path: normalize(rel),
  source: readFileSync(join(APP, rel), "utf8"),
}));

describe("서버 진입점", () => {
  it("하나 이상 찾았다 — 스캐너가 조용히 0건이 되지 않는다", () => {
    // 글롭이 깨져 0건이 되면 이 테스트 전체가 공허하게 통과한다
    // (`vitest.config.ts`가 `passWithNoTests`를 안 켜는 것과 같은 이유).
    expect(ENTRY_POINTS.length).toBeGreaterThan(3);
  });

  it("예외 목록의 이름이 전부 실재한다 — 낡은 예외가 남지 않는다", () => {
    const found = new Set(ENTRY_POINTS.map((e) => e.path));
    for (const name of EXEMPT) expect(found).toContain(name);
  });

  it("예외가 아닌 진입점은 전부 인가를 지난다", () => {
    const unguarded = ENTRY_POINTS.filter(
      (e) => !EXEMPT.has(e.path) && !GUARDS.some((g) => e.source.includes(g)),
    ).map((e) => e.path);
    expect(unguarded).toEqual([]);
  });

  it("Server Action 파일의 모든 export가 인가를 지난다", () => {
    // `"use server"` 파일은 export 하나하나가 공개 엔드포인트다 — 파일에 호출이 한 번
    // 있다는 것으로는 부족하고, 각 함수가 스스로 불러야 한다.
    const actionFiles = ENTRY_POINTS.filter(
      (e) => e.path.endsWith("actions.ts") && !EXEMPT.has(e.path),
    );
    expect(actionFiles.length).toBeGreaterThan(0);

    for (const file of actionFiles) {
      const exported = [...file.source.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
      expect(exported.length).toBeGreaterThan(0);
      const bodies = file.source.split(/export async function /).slice(1);
      for (const body of bodies) {
        expect(GUARDS.some((g) => body.includes(g))).toBe(true);
      }
    }
  });
});

describe("차단 규칙", () => {
  it("조건부 렌더로 인증을 막지 않는다 (POSTMORTEM 2026-08-31)", () => {
    // App Router는 레이아웃과 페이지를 병렬로 렌더한다 — `if (!session) return <Denied/>`는
    // 표시를 막을 뿐이고 페이지는 이미 실행돼 RSC 페이로드에 데이터가 실린다(실측 1.3MB).
    // `?.user`·중괄호·괄호를 낀 형태까지 잡는다 — 좁은 패턴은 안 잡고도 잡은 척한다.
    const CONDITIONAL_RENDER = /if \(!session[^)]*\)\s*\{?\s*return\s*\(?\s*</;

    // ⚠️ **`/invite/[token]`만 예외다.** 비로그인에게 **마스킹한 이메일·프로젝트 이름·역할**만
    // 보이고 번역 데이터는 조회조차 하지 않는다 — 새는 것이 그것이 전부라 허용한다 (design §4.1).
    for (const entry of ENTRY_POINTS.filter((e) => e.path !== "invite/[token]/page.tsx")) {
      expect(entry.source).not.toMatch(CONDITIONAL_RENDER);
    }
  });

  it("허용 핸들 목록이 남아 있지 않다 — 인가는 ProjectMember가 한다", () => {
    for (const entry of ENTRY_POINTS) {
      expect(entry.source).not.toContain("AUTH_ALLOWED_LOGINS");
    }
  });

  it("편집 경로가 ACTIVE_PROJECT_SLUG를 읽지 않는다 — 프로젝트는 URL과 멤버십이 정한다", () => {
    const editPaths = ENTRY_POINTS.filter((e) => !e.path.startsWith("api/"));
    for (const entry of editPaths) {
      expect(entry.source).not.toContain("ACTIVE_PROJECT_SLUG");
    }
  });
});
