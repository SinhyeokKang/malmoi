import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { renderWorkflowYaml } from "../workflow";

/**
 * 결과 화면의 복사용 `.github/workflows/l10n.yml` (design §7). App 권한(`workflows: write`)을 늘리지 않고
 * 사용자가 붙인다.
 *
 * ⚠️ **`docs/ACTIONS.md`의 예시와 같은 모양이어야 한다** — 문서가 정본이고 이 함수는 그것을 slug만 바꿔 낸다.
 * 두 벌이 갈리면 문서를 보고 붙인 리포와 화면을 보고 붙인 리포가 다르게 동작한다. 그래서 아래가 문서의
 * 첫 YAML 블록을 읽어 주석·빈 줄을 뺀 채 바이트 단위로 대조한다 (`sync-branch-consumers.test.ts`와 같은 결).
 */

const root = new URL("../../../", import.meta.url);
const actionsDoc = readFileSync(fileURLToPath(new URL("docs/ACTIONS.md", root)), "utf8");

/** 문서의 첫 ```yaml 블록 본문. */
function firstYamlBlock(md: string): string {
  const m = /```yaml\n([\s\S]*?)```/.exec(md);
  if (!m?.[1]) throw new Error("docs/ACTIONS.md에 yaml 블록이 없다");
  return m[1];
}

/** 주석·빈 줄을 뺀다 — 문서의 설명 주석은 화면 복사본에 없어도 된다. */
function bare(yaml: string): string[] {
  return yaml
    .split("\n")
    .map((line) => line.replace(/\s+#.*$/, "").replace(/^\s*#.*$/, "").trimEnd())
    .filter((line) => line.length > 0);
}

describe("renderWorkflowYaml", () => {
  it("slug가 `project:`에 박힌다", () => {
    expect(renderWorkflowYaml({ slug: "my-app", baseBranch: "main" })).toMatch(/^\s+project: my-app$/m);
  });

  it("base 브랜치가 트리거에 박힌다 — `main`으로 고정하면 base가 `develop`인 리포에서 CI가 영영 안 돈다", () => {
    expect(renderWorkflowYaml({ slug: "x", baseBranch: "develop" })).toMatch(/branches: \[develop\]/);
    expect(renderWorkflowYaml({ slug: "x", baseBranch: "main" })).toMatch(/branches: \[main\]/);
  });

  it("수동 지정이면 `adapter:`·`base-locale:`이 붙는다", () => {
    const yml = renderWorkflowYaml({ slug: "x", baseBranch: "main", adapter: "ts-dict", baseLocale: "ko" });
    expect(yml).toMatch(/^\s+adapter: ts-dict$/m);
    expect(yml).toMatch(/^\s+base-locale: ko$/m);
  });

  it("자동 후보면 둘 다 붙지 않는다 — 탐지가 같은 답을 내므로 고정할 이유가 없다", () => {
    const yml = renderWorkflowYaml({ slug: "x", baseBranch: "main" });
    expect(yml).not.toMatch(/adapter:/);
    expect(yml).not.toMatch(/base-locale:/);
  });

  it("`wrapper`는 넣지 않는다 — 훅 기반 리포는 docs/ACTIONS.md를 보라고 화면이 따로 말한다", () => {
    expect(renderWorkflowYaml({ slug: "x", baseBranch: "main", adapter: "ts-dict", baseLocale: "ko" })).not.toMatch(
      /wrapper/,
    );
  });

  /**
   * ⚠️ **`concurrency.group`에 slug가 들어가야 한다** (2026-09-07 리뷰 🟡8). `github.ref`만 쓰면 한 리포에
   * 프로젝트가 둘일 때(SAAS §7.1 — prod의 `i18n-format-check`가 실물이다) 같은 커밋에서 두 워크플로가
   * 같은 그룹에 들어가고 `cancel-in-progress`가 **한쪽을 죽인다.** 그러면 그 표면은 영영 적재되지 않는데
   * 취소는 실패로 보이지 않는다. `syncBranchFor`가 브랜치 이름에 slug를 넣은 것과 같은 이유다.
   */
  it("concurrency group이 프로젝트마다 다르다 — 한 리포의 두 프로젝트가 서로를 취소하지 않는다", () => {
    const groupOf = (yml: string) => /^\s*group:\s*(.+)$/m.exec(yml)?.[1];
    const a = groupOf(renderWorkflowYaml({ slug: "format-check-code", baseBranch: "main" }));
    const b = groupOf(renderWorkflowYaml({ slug: "format-check-yaml", baseBranch: "main" }));

    expect(a).toContain("format-check-code");
    expect(b).toContain("format-check-yaml");
    expect(a).not.toBe(b);
    // ref도 남아 있어야 한다 — 브랜치가 다른 두 push는 서로를 취소하지 않는 것이 원래 의도다.
    expect(a).toContain("github.ref");
  });

  it("무한 루프 가드 `[skip-l10n]`과 `PUSH_TOKEN` secret 참조가 있다", () => {
    const yml = renderWorkflowYaml({ slug: "x", baseBranch: "main" });
    expect(yml).toContain("[skip-l10n]");
    expect(yml).toContain("${{ secrets.PUSH_TOKEN }}");
    expect(yml).toContain("SinhyeokKang/malmoi/.github/actions/l10n-push@main");
  });

  it("docs/ACTIONS.md의 예시와 같은 모양이다 — 주석·빈 줄을 빼면 줄 단위로 같다", () => {
    const doc = bare(firstYamlBlock(actionsDoc));
    // 문서 예시는 `project: order-check`·`branches: [main]`이다 — 같은 값으로 렌더해 대조한다.
    const ours = bare(renderWorkflowYaml({ slug: "order-check", baseBranch: "main" }));
    expect(ours).toEqual(doc);
  });

  it("파일 끝 개행이 정확히 하나다", () => {
    const yml = renderWorkflowYaml({ slug: "x", baseBranch: "main" });
    expect(yml.endsWith("\n")).toBe(true);
    expect(yml.endsWith("\n\n")).toBe(false);
  });

  it("같은 입력은 같은 문자열이다", () => {
    const a = renderWorkflowYaml({ slug: "x", baseBranch: "main", adapter: "code-dict", baseLocale: "en" });
    const b = renderWorkflowYaml({ slug: "x", baseBranch: "main", adapter: "code-dict", baseLocale: "en" });
    expect(a).toBe(b);
  });
});
