import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **sync 브랜치 이름의 생산자와 소비자가 같은가.** `syncBranchFor`가 `malmoi-i18n/sync-<slug>`를 내는데 composite
 * action의 "열린 PR 경고"는 `--head malmoi-i18n/sync`를 조회해 항상 "없음"을 찍었다 — 편집 손실 창의 유일한 신호가
 * 죽었고 `trigger.test.ts`는 생성 함수만 봐서 못 잡았다 (Codex 감사 2026-09-06 #8). 스모크도 옛 ref를 읽었다.
 *
 * 이름을 만드는 코드는 하나(`lib/pull/trigger.ts`)고, 그것을 쓸 수 없는 곳(YAML)은 **같은 접두 + input**으로
 * 조립한다. 여기서 셋을 텍스트로 대조한다.
 */

const root = new URL("../../../", import.meta.url);
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, root)), "utf8");

describe("sync 브랜치 소비자 — malmoi-i18n/sync-<slug>", () => {
  it("composite action의 PR 경고가 프로젝트별 브랜치를 조회한다", () => {
    const yml = read(".github/actions/malmoi-i18n-push/action.yml");
    // 옛 상수를 그대로 조회하는 줄이 없다.
    expect(yml).not.toMatch(/--head\s+["']?l10n\/sync["']?(\s|$)/m);
    // 이름은 input으로 조립한다 — env로 한 번 받아 `--head "$SYNC_BRANCH"`로 넘긴다.
    expect(yml).toMatch(/malmoi-i18n\/sync-\$\{\{\s*inputs\.project\s*\}\}/);
    expect(yml).toMatch(/--head\s+"\$SYNC_BRANCH"/);
  });

  it("스모크가 생성 함수로 ref 이름을 만든다", () => {
    const smoke = read("scripts/smoke-github.ts");
    expect(smoke).toContain("syncBranchFor(");
    expect(smoke).not.toContain('"heads/malmoi-i18n/sync"');
  });

  it("ACTIONS.md가 옛 이름을 안내하지 않는다", () => {
    const doc = read("docs/ACTIONS.md");
    expect(doc).not.toMatch(/`l10n\/sync`/);
  });
});
