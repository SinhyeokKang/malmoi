import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **`ACTIVE_PROJECT_SLUG` 폴백이 사라졌다** (design §3.8 · tasks T3). 두 스크립트가 프로젝트를 env에서 추측하던
 * 자리를 **인자 필수**로 바꾼다 — 서버가 그 변수를 더 읽지 않으므로 폴백이 있으면 "로컬에서만 되는 값"이 남고,
 * 무엇보다 `push:local`의 `PUSH_TOKEN`은 이제 **그 프로젝트의 토큰 원문**이라 slug와 토큰이 어긋나면 409다.
 *
 * ⚠️ **기본값 인자 위치의 평가를 다시 만들지 않는다** — `arg(...) ?? requireEnv(...)`의 반대 순서가
 * "플래그를 줬는데도 환경변수가 없어 죽는" 진단 불가 실패를 만들었다 (POSTMORTEM 2026-08-31 🔁). 폴백 자체를
 * 없애는 것이 그 함정을 구조적으로 지운다.
 *
 * 소스 스캔인 이유: 두 스크립트는 `tsx` 진입점이라 import만 해도 `process.argv`를 읽고 DB·네트워크에 닿는다.
 * `app/__tests__/entry-points.test.ts`·`components/__tests__/focus-ring`과 같은 결의 상시 방어선이다.
 */

const root = new URL("../../", import.meta.url);
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, root)), "utf8");

describe("scripts — ACTIVE_PROJECT_SLUG 폴백이 없다", () => {
  it.each(["scripts/push-local.ts", "scripts/smoke-github.ts"])("%s", (path) => {
    expect(read(path)).not.toContain("ACTIVE_PROJECT_SLUG");
  });

  it("코드·설정 어디에서도 그 변수를 읽지 않는다 — 서버 라우트 둘도 포함이다", () => {
    for (const path of [
      "app/api/push/route.ts",
      "scripts/push-local.ts",
      "scripts/smoke-github.ts",
      "lib/push/guard.ts",
    ]) {
      expect(read(path)).not.toContain("ACTIVE_PROJECT_SLUG");
    }
  });
});

describe("scripts/push-local.ts — --project가 필수다", () => {
  const source = read("scripts/push-local.ts");

  it("`--project`가 없으면 usage + exit 2다 — 사용법 오류는 실행 실패(1)와 구별한다", () => {
    // 값 플래그 파싱은 `lib/cli/args.ts`가 하고, 여기서는 "없으면 죽는가"만 본다.
    expect(source).toMatch(/flagValue\(argv, "--project"\)/);
    expect(source).toMatch(/projectSlug === undefined[\s\S]{0,400}process\.exit\(2\)/);
  });

  it("`PUSH_TOKEN` 설명이 '그 프로젝트의 토큰'이다 — 서버 env와 같은 값이 아니다", () => {
    expect(source).toMatch(/그 프로젝트의|프로젝트 토큰|프로젝트별/);
  });
});

describe("scripts/smoke-github.ts — slug 인자가 필수다", () => {
  const source = read("scripts/smoke-github.ts");

  it("인자가 없으면 usage + exit 2다", () => {
    expect(source).toMatch(/process\.argv\[2\]/);
    expect(source).toMatch(/process\.exit\(2\)/);
  });

  it("사용법 주석에서 slug가 선택이 아니다 — `[<project-slug>]`가 아니라 `<project-slug>`", () => {
    expect(source).toMatch(/pnpm smoke:github <project-slug>/);
    expect(source).not.toMatch(/pnpm smoke:github \[<project-slug>\]/);
  });
});

describe("package.json·문서의 사용법이 인자 필수를 반영한다", () => {
  it("CLAUDE.md 명령어 표의 `smoke:github`가 slug를 선택으로 적지 않는다", () => {
    const claude = read("CLAUDE.md");
    expect(claude).not.toContain("pnpm smoke:github [<project-slug>]");
  });
});
