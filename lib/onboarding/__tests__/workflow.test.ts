import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isValidBranchName } from "@/lib/pull/branch-name";
import { SKIP_MARKER } from "@/lib/pull/payload";

import { renderProjectWorkflowYaml, renderSurfaceWorkflowStep, renderWorkflowYaml, workflowSurfaceOf } from "../workflow";

/**
 * 결과 화면의 복사용 `.github/workflows/malmoi-i18n.yml` (design §7). App 권한(`workflows: write`)을 늘리지 않고
 * 사용자가 붙인다.
 *
 * ⚠️ **`docs/ACTIONS.md`의 예시와 같은 모양이어야 한다** — 문서가 정본이고 이 함수는 그것을 slug만 바꿔 낸다.
 * 두 벌이 갈리면 문서를 보고 붙인 리포와 화면을 보고 붙인 리포가 다르게 동작한다. 그래서 아래가 문서의
 * 첫 YAML 블록을 읽어 주석·빈 줄을 뺀 채 바이트 단위로 대조한다 (`sync-branch-consumers.test.ts`와 같은 결).
 */

const root = new URL("../../../", import.meta.url);
const actionsDoc = readFileSync(fileURLToPath(new URL("docs/ACTIONS.md", root)), "utf8");

it("matches the documented additional surface step line by line", () => {
  const section = actionsDoc.split("<!-- additional-surface-step -->")[1];
  expect(section).toBeDefined();
  expect(bare(renderSurfaceWorkflowStep({ slug: "order-check", surfaceSlug: "web", pathTemplate: "web/{locale}.json" })))
    .toEqual(bare(firstYamlBlock(section!)));
});

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
    expect(renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "my-app", baseBranch: "main" })).toMatch(/^\s+project: my-app$/m);
  });

  it("base 브랜치가 트리거에 박힌다 — `main`으로 고정하면 base가 `develop`인 리포에서 CI가 영영 안 돈다", () => {
    expect(renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "x", baseBranch: "develop" })).toMatch(/branches: \["develop"\]/);
    expect(renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "x", baseBranch: "main" })).toMatch(/branches: \["main"\]/);
  });

  it("수동 지정이면 `adapter:`·`base-locale:`이 붙는다", () => {
    const yml = renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "x", baseBranch: "main", adapter: "ts-dict", baseLocale: "ko" });
    expect(yml).toMatch(/^\s+adapter: ts-dict$/m);
    expect(yml).toMatch(/^\s+base-locale: ko$/m);
  });

  it("자동 후보면 둘 다 붙지 않는다 — 탐지가 같은 답을 내므로 고정할 이유가 없다", () => {
    const yml = renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "x", baseBranch: "main" });
    expect(yml).not.toMatch(/adapter:/);
    expect(yml).not.toMatch(/base-locale:/);
  });

  it("`wrapper`는 넣지 않는다 — 훅 기반 리포는 docs/ACTIONS.md를 보라고 화면이 따로 말한다", () => {
    expect(renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "x", baseBranch: "main", adapter: "ts-dict", baseLocale: "ko" })).not.toMatch(
      /wrapper/,
    );
  });

  /**
   * ⚠️ **`concurrency.group`에 slug가 들어가야 한다** (2026-09-07 리뷰 🟡8). `github.ref`만 쓰면 한 리포에
   * 프로젝트가 둘일 때(PRODUCT §7.1 — prod의 `i18n-format-check`가 실물이다) 같은 커밋에서 두 워크플로가
   * 같은 그룹에 들어가고 `cancel-in-progress`가 **한쪽을 죽인다.** 그러면 그 표면은 영영 적재되지 않는데
   * 취소는 실패로 보이지 않는다. `syncBranchFor`가 브랜치 이름에 slug를 넣은 것과 같은 이유다.
   */
  it("concurrency group이 프로젝트마다 다르다 — 한 리포의 두 프로젝트가 서로를 취소하지 않는다", () => {
    const groupOf = (yml: string) => /^\s*group:\s*(.+)$/m.exec(yml)?.[1];
    const a = groupOf(renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "format-check-code", baseBranch: "main" }));
    const b = groupOf(renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "format-check-yaml", baseBranch: "main" }));

    expect(a).toContain("format-check-code");
    expect(b).toContain("format-check-yaml");
    expect(a).not.toBe(b);
    // ref도 남아 있어야 한다 — 브랜치가 다른 두 push는 서로를 취소하지 않는 것이 원래 의도다.
    expect(a).toContain("github.ref");
  });

  /**
   * ⚠️ **마커를 리터럴로 적지 않는다 — `SKIP_MARKER`를 import해 단언한다.** 이 값은 자리가 둘이고
   * (`payload.ts`가 커밋 메시지에 넣는 값 · 여기가 YAML `if:`에 박는 값) **둘이 갈리면 pull이 만든
   * 커밋을 대상 리포 워크플로가 못 알아봐 push가 다시 돌고 무한 루프가 된다.** 세 자리를 각자
   * 리터럴로 두면 하나만 바꿔도 이 테스트가 통과한다 — 2026-09-14의 `l10n` → `malmoi-i18n` 치환이
   * 정확히 그 상태를 지나갔다(셋을 함께 바꿔 우연히 green이었다).
   */
  it("무한 루프 가드(SKIP_MARKER)와 `PUSH_TOKEN` secret 참조가 있다", () => {
    const yml = renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "x", baseBranch: "main" });
    expect(yml).toContain(SKIP_MARKER);
    expect(yml).toContain("${{ secrets.PUSH_TOKEN }}");
    // ⚠️ **불변 태그다** (2026-09-09, sec-audit 발견 3) — `@main`이면 말모이 main의 커밋 하나가
    // `secrets.PUSH_TOKEN`을 든 대상 리포 러너에서 즉시 돈다.
    expect(yml).toContain("SinhyeokKang/malmoi/.github/actions/malmoi-i18n-push@malmoi-i18n-push-v1");
  });

  it("docs/ACTIONS.md의 예시와 같은 모양이다 — 주석·빈 줄을 빼면 줄 단위로 같다", () => {
    const doc = bare(firstYamlBlock(actionsDoc));
    // 문서 예시는 `project: order-check`·`branches: [main]`이다 — 같은 값으로 렌더해 대조한다.
    const ours = bare(renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "order-check", baseBranch: "main" }));
    expect(ours).toEqual(doc);
  });

  it("파일 끝 개행이 정확히 하나다", () => {
    const yml = renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "x", baseBranch: "main" });
    expect(yml.endsWith("\n")).toBe(true);
    expect(yml.endsWith("\n\n")).toBe(false);
  });

  it("같은 입력은 같은 문자열이다", () => {
    const a = renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "x", baseBranch: "main", adapter: "code-dict", baseLocale: "en" });
    const b = renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "x", baseBranch: "main", adapter: "code-dict", baseLocale: "en" });
    expect(a).toBe(b);
  });
});

/**
 * ⚠️ **온보딩이 브랜치를 묻기 시작하면서 `baseBranch`가 사용자 값이 됐다** (new-project-modal T5).
 * 전에는 `probeRepo`의 default branch뿐이라 `main`·`develop` 같은 평범한 이름만 왔다 — 이제
 * `release/2.0`·`feat/UI-1`이 그대로 flow sequence 안에 들어간다.
 */
describe("renderWorkflowYaml — 사용자가 고른 브랜치 이름", () => {
  const line = (yaml: string): string => yaml.split("\n").find((l) => l.includes("branches:")) ?? "";

  it("`/`가 든 이름이 한 항목으로 남는다 — YAML이 쪼개거나 잃지 않는다", () => {
    const yaml = renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "my-app", baseBranch: "release/2.0" });

    expect(yaml).toContain("release/2.0");
    expect(line(yaml)).toBe('    branches: ["release/2.0"]');
  });

  it("`,`가 든 이름도 한 항목이다 — 인용이 없으면 flow sequence가 둘로 갈린다", () => {
    expect(line(renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "my-app", baseBranch: "a,b" }))).toBe('    branches: ["a,b"]');
  });

  it("`isValidBranchName`을 지난 이름이면 인용이 깨질 문자가 없다 — `\\`·제어문자가 거부된다", () => {
    for (const name of ["main", "release/2.0", "feat/UI-1", "v1.0", "a,b", "a'b"]) {
      expect(isValidBranchName(name)).toBe(true);
      expect(line(renderWorkflowYaml({ surfaceSlug: "default", pathTemplate: "i18n/{locale}.json", slug: "my-app", baseBranch: name }))).toBe(`    branches: ["${name}"]`);
    }
  });
});

/**
 * **워크플로 파일 하나에 표면마다 step 하나** (multi-surface spec §5.2 · 대상 리포 계약).
 *
 * ⚠️ **Add surface 결과 화면을 벗어나면 그 step을 다시 볼 자리가 여기뿐이다.** 결과 화면은 한 번
 * 지나가고 새로고침하면 draft가 초기화된다 — 설정 화면이 활성 표면 전부를 렌더하지 않으면 두 번째
 * 표면의 `surface:`·`path-template:`을 사람이 손으로 조립해야 하고, 그것이 틀리면 CI가 409로
 * 거부하는 것이 아니라 **다른 표면을 덮어쓴다**(토큰은 프로젝트 단위다).
 */
describe("renderProjectWorkflowYaml — 표면마다 step 하나", () => {
  const one = { surfaceSlug: "web", pathTemplate: "web/{locale}.json" };
  const two = { surfaceSlug: "_locales", pathTemplate: "_locales/{locale}/messages.json" };
  const render = (surfaces: readonly { surfaceSlug: string; pathTemplate: string }[]) =>
    renderProjectWorkflowYaml({ slug: "order-check", baseBranch: "main", surfaces });

  it("표면 하나면 `renderWorkflowYaml`과 바이트가 같다 — 표면이 하나인 화면은 움직이지 않는다", () => {
    expect(render([one])).toBe(renderWorkflowYaml({ slug: "order-check", baseBranch: "main", ...one }));
  });

  it("표면 둘이면 push step이 둘이고 checkout은 하나다", () => {
    const yml = render([one, two]);
    expect(yml.split("malmoi-i18n-push@malmoi-i18n-push-v1").length - 1).toBe(2);
    expect(yml.split("actions/checkout@").length - 1).toBe(1);
  });

  it("각 step이 자기 surface와 path-template을 든다", () => {
    const yml = render([one, two]);
    expect(yml).toMatch(/^\s+surface: web$/m);
    expect(yml).toMatch(/^\s+surface: _locales$/m);
    expect(yml).toContain('path-template: "web/{locale}.json"');
    expect(yml).toContain('path-template: "_locales/{locale}/messages.json"');
  });

  it("step 사이가 빈 줄 하나다 — 사람이 붙여넣고 읽는 파일이다", () => {
    const lines = render([one, two]).split("\n");
    const at = lines.findIndex((l, i) => i > 0 && l.includes("malmoi-i18n-push@") && lines.slice(0, i).some(p => p.includes("malmoi-i18n-push@")));
    expect(lines[at - 1]).toBe("");
    expect(lines[at - 2]).not.toBe("");
  });

  it("파일 끝 개행이 정확히 하나다", () => {
    const yml = render([one, two]);
    expect(yml.endsWith("\n")).toBe(true);
    expect(yml.endsWith("\n\n")).toBe(false);
  });

  it("표면이 없으면 던진다 — step 없는 workflow는 red 없이 조용히 아무것도 안 한다", () => {
    expect(() => render([])).toThrow();
  });

  it("같은 입력은 같은 문자열이다", () => {
    expect(render([one, two])).toBe(render([one, two]));
  });

  it("표면 순서가 그대로 step 순서다 — 호출부가 정렬을 소유한다", () => {
    const order = (yml: string) => yml.split("\n").filter(l => l.trim().startsWith("surface:")).map(l => l.trim());
    expect(order(render([one, two]))).toEqual(["surface: web", "surface: _locales"]);
    expect(order(render([two, one]))).toEqual(["surface: _locales", "surface: web"]);
  });
});

/**
 * 표면 행 → step 입력. **설정 화면에 있던 분기를 그대로 옮긴 것이고 규칙을 바꾸지 않았다** —
 * 화면 안에 있으면 렌더 없이는 잴 수 없어 6b-3의 대기 규칙이 테스트 밖에 있었다.
 */
describe("workflowSurfaceOf", () => {
  const row = (over: Partial<Parameters<typeof workflowSurfaceOf>[0]> = {}) => workflowSurfaceOf({
    slug: "web", pathTemplate: "web/{locale}.json", adapterName: "json-catalog",
    baseLocale: "en", declaredBaseLocale: null, ...over,
  });

  it("자동 후보면 `adapter`·`baseLocale` 둘 다 붙지 않는다 — 탐지가 같은 답을 낸다", () => {
    expect(row()).toEqual({ surfaceSlug: "web", pathTemplate: "web/{locale}.json" });
  });

  it("선언이 대기 중이면 어댑터와 무관하게 선언한 base를 고정한다 (6b-3)", () => {
    expect(row({ declaredBaseLocale: "ko" }).baseLocale).toBe("ko");
  });

  it("`ts-dict`는 base를 고정한다 — 한 파일 안에 로케일이 여럿이라 탐지가 정하지 못한다", () => {
    expect(row({ adapterName: "ts-dict" })).toMatchObject({ adapter: "ts-dict", baseLocale: "en" });
  });

  it("`ts-dict`가 아니고 선언도 없으면 `adapter`를 박지 않는다", () => {
    expect(row({ adapterName: "chrome-locales" }).adapter).toBeUndefined();
  });

  it("첫 push 전이라 `pathTemplate`이 없으면 빈 문자열이다", () => {
    expect(row({ pathTemplate: null }).pathTemplate).toBe("");
  });
});
