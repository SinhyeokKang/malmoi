import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SKIP_MARKER } from "@/lib/pull/payload";

/**
 * **GitLab CI 원본(`.gitlab/malmoi-i18n-push/`)의 계약** (gitlab-repositories D1). `action-setup.test.ts`의 짝 — 셸이라 순수 함수가
 * 없어서 텍스트로 순서와 모양을 센다. 생성 job(`lib/onboarding/gitlab-ci.ts`)이 clone·SHA 대조 뒤 `push.sh`를 부르고, `push.sh`가
 * 설치 뒤 `run.ts`를, `run.ts`가 `push:local`을 부른다 — 페이로드 생산자는 여전히 `lib/push/payload.ts` 하나다.
 */

const DIR = join(".gitlab", "malmoi-i18n-push");
const sh = readFileSync(join(DIR, "push.sh"), "utf8");
const run = readFileSync(join(DIR, "run.ts"), "utf8");
/** 주석 줄을 뺀다 — 셸은 `#`만(`*"…"*)` 패턴이 `*`로 시작한다), TS는 `//`·블록 주석. */
const code = (src: string) => src.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const tsCode = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join("\n");
const valueImports = (src: string) =>
  [...tsCode(src).matchAll(/^\s*import\s+(?!type\s)[^'";]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);

describe("push.sh", () => {
  it("bash이고 실행 비트가 있고 실패에서 멈춘다", () => {
    expect(sh.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(statSync(join(DIR, "push.sh")).mode & 0o111).not.toBe(0);
    expect(code(sh)).toContain("set -euo pipefail");
  });

  it("루프 가드 둘째 겹 — 커밋 메시지의 마커를 의존성 설치 전에 본다", () => {
    const body = code(sh);
    const guard = body.indexOf(`*"${SKIP_MARKER}"*`);
    expect(guard).toBeGreaterThan(0);
    expect(body).toContain("CI_COMMIT_MESSAGE");
    expect(guard).toBeLessThan(body.indexOf("pnpm install"));
    // 가드는 스킵(exit 0)이다 — red가 아니다.
    expect(body.slice(guard, body.indexOf("esac", guard))).toContain("exit 0");
  });

  it("`pnpm install --frozen-lockfile`이 하나이고 pnpm 버전은 packageManager에서 읽는다", () => {
    const body = code(sh);
    expect(body.match(/pnpm install/g)).toHaveLength(1);
    expect(body).toContain("pnpm install --frozen-lockfile");
    expect(body).toContain("packageManager");
  });

  it("run.ts를 tsx로 부른다", () => {
    expect(code(sh)).toMatch(/pnpm exec tsx \.gitlab\/malmoi-i18n-push\/run\.ts/);
  });
});

describe("run.ts", () => {
  it("값 import가 node 내장과 CI 입력 변환뿐이다 — Prisma·server-only 그래프에 닿지 않는다(push-local-graph와 같은 이유)", () => {
    const specs = valueImports(run);
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) expect(s === "../../lib/cli/gitlab-ci-input" || s?.startsWith("node:")).toBe(true);
    // 순수 모듈의 import도 잎 둘뿐이다 — 늘면 여기서 그래프를 다시 본다.
    expect(valueImports(readFileSync(join("lib", "cli", "gitlab-ci-input.ts"), "utf8")).sort()).toEqual(["@/lib/pull/payload", "@/lib/pull/sync-branch"]);
  });

  it("생산자는 push:local이다 — 페이로드를 여기서 조립하지 않는다", () => {
    expect(tsCode(run)).toContain('"push:local"');
    expect(tsCode(run)).not.toMatch(/\/api\/push/);
  });

  it("열린 MR 조회는 JOB-TOKEN으로 GET만 하고 5초에 끊는다(안내 전용 — 실패가 red가 아니다)", () => {
    const body = tsCode(run);
    expect(body).toContain('"JOB-TOKEN"');
    expect(body).not.toMatch(/method:\s*"(POST|PUT|DELETE|PATCH)"/);
    expect(body).toContain("AbortSignal.timeout(5000)");
  });
});
