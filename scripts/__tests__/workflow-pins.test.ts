import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **워크플로 참조는 불변이어야 한다** (sec-audit 발견 3 · 13).
 *
 * `.github/actions/malmoi-i18n-push`는 **남의 리포에서** 돈다 — 소비자 job이 그 스텝에
 * `secrets.PUSH_TOKEN`과 `GITHUB_TOKEN`을 넘긴다. 그 action이 움직일 수 있는 태그를 쓰면
 * 업스트림 태그 재지정 하나로(2025년 `tj-actions/changed-files` 패턴) **모든 소비자 job에서** 코드가
 * 즉시 실행되고, 소비자 측 리뷰도 롤백 창도 없다.
 *
 * ⚠️ **말모이 `main`도 같은 축이다.** Free + private에서 브랜치 프로텍션이 거부되므로(403 실측)
 * `main` 직접 푸시를 막는 것은 `/merge` 관행뿐이다 — 소비자가 `@main`을 참조하면 그 관행이
 * 남의 리포의 보안 경계가 된다. 그래서 참조는 **불변 태그**(`malmoi-i18n-push-v2` — v1은 기존 소비자용)다.
 *
 * ⚠️ **렌더가 아니라 소스 스캔인 이유**: 이 결함은 CI가 green인 채로 열려 있고, 실행해서는
 * 관측되지 않는다. 같은 이유로 `focus-ring`·`credential-separation`이 소스를 센다.
 */

const GITHUB_DIR = ".github";

function ymlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...ymlFiles(full));
    else if (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) out.push(full);
  }
  return out;
}

/** `uses: owner/repo@ref` — 주석과 들여쓰기를 벗기고 ref만 남긴다. */
function usesRefs(): Array<{ file: string; line: number; value: string }> {
  const found: Array<{ file: string; line: number; value: string }> = [];
  for (const file of ymlFiles(GITHUB_DIR)) {
    readFileSync(file, "utf8").split("\n").forEach((raw, i) => {
      const m = /^\s*-?\s*uses:\s*(\S+)/.exec(raw);
      if (m?.[1] !== undefined) found.push({ file, line: i + 1, value: m[1] });
    });
  }
  return found;
}

describe("워크플로 참조 — 전부 40자 SHA로 핀 (sec-audit 3 · 13)", () => {
  it("스캐너가 실제로 무언가를 본다 — 0건이면 이 방어선은 장식이다", () => {
    expect(usesRefs().length).toBeGreaterThanOrEqual(3);
  });

  it("가변 태그(`@v4` 류)를 쓰는 `uses:`가 없다", () => {
    const unpinned = usesRefs()
      // 같은 리포 안의 로컬 action은 트리와 함께 이동하므로 핀 대상이 아니다.
      .filter((u) => !u.value.startsWith("./"))
      .filter((u) => !/@[0-9a-f]{40}$/.test(u.value))
      .map((u) => `${u.file}:${u.line} ${u.value}`);
    expect(unpinned).toEqual([]);
  });

  it("핀 옆에 사람이 읽을 버전 주석이 있다 — SHA만 있으면 갱신할 때 무엇이었는지 모른다", () => {
    for (const file of ymlFiles(GITHUB_DIR)) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (const [i, raw] of lines.entries()) {
        if (!/^\s*-?\s*uses:\s*\S+@[0-9a-f]{40}/.test(raw)) continue;
        expect(raw, `${file}:${i + 1}에 버전 주석이 없다`).toMatch(/#\s*v?\d/);
      }
    }
  });
});

/**
 * **action 안의 두 판은 Node 24 판이다** (action-run-cache). 위 스캐너는 "40자 SHA"만 봐서 v4(node20)로 되돌려도
 * green이다 — 기대 SHA를 박는다. 올릴 때는 upstream `action.yml`의 `runs.using`을 그 SHA에서 확인하고 이 값을 고친다.
 */
describe("malmoi action의 셋업 판 — node24 판 SHA (action-run-cache)", () => {
  const action = readFileSync(join(GITHUB_DIR, "actions", "malmoi-i18n-push", "action.yml"), "utf8");

  it("`pnpm/action-setup`이 v6.1.0이다", () => {
    expect(action).toMatch(/uses: pnpm\/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6\.1\.0$/m);
  });

  it("`actions/setup-node`가 v7.0.0이다", () => {
    expect(action).toMatch(/uses: actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\.0\.0$/m);
  });
});

describe("ci.yml — 권한을 트리 안에서 선언한다 (sec-audit 13)", () => {
  const ci = readFileSync(join(GITHUB_DIR, "workflows", "ci.yml"), "utf8");

  it("`permissions:`가 있다 — 리포 기본값은 대시보드 한 번으로 write가 된다", () => {
    expect(ci).toMatch(/^\s*permissions:/m);
  });

  it("`contents: read`다 — `verify`는 임의 프로젝트 코드를 `pnpm test`로 돈다", () => {
    expect(ci).toMatch(/permissions:\s*\n\s*contents:\s*read/);
  });
});

describe("소비자가 참조하는 ref — 불변 태그다 (sec-audit 3)", () => {
  it("`docs/ACTIONS.md`가 `@main`을 안내하지 않는다", () => {
    const doc = readFileSync(join("docs", "ACTIONS.md"), "utf8");
    expect(doc).not.toMatch(/malmoi-i18n-push@main/);
    expect(doc).toMatch(/malmoi-i18n-push@malmoi-i18n-push-v2/);
  });
});
