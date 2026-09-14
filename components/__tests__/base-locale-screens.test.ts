import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 기준 로케일 변경이 **두 화면에 실제로 배선됐는지** 소스에서 센다 (6b-3 — design §3.13).
 *
 * ⚠️ **6b-5가 자리를 옮겼다** (PRODUCT §7.7 결정 4): 필드와 대기 Alert가 `settings` → `locales`다.
 * 옮기는 이유는 로케일이 지금까지 **번역 표의 열로만** 존재해서 orphaned 로케일이 왜 그렇게 됐고
 * 어떻게 되살리는지 말할 자리가 없었기 때문이다. **번역 화면의 배너는 그대로 둔다** — 편집자가
 * 읽는 자리다.
 *
 * ⚠️ 렌더 테스트가 없는 자리의 상시 방어선이다(`translations-screen`·`members-screen`과 같은 계열).
 * 이 사이클의 실패 유형은 특히 뚜렷하다: **`basePending`이 green인 것과 두 화면이 그것을 부르는
 * 것은 다른 사실**이고, 한쪽만 부르면 "경고는 사라졌는데 실제로는 아직 대기 중"이 된다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** ⚠️ **주석을 벗기고 센다** — docstring이 자기가 피하는 것을 이름으로 적는다(`focus-ring`과 같은 벗기기). */
const read = (path: string): string =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const SETTINGS_PAGE = "app/(edit)/projects/[slug]/settings/page.tsx";
const SETTINGS_FORM = "components/settings/repository-form.tsx";
const LOCALES_PAGE = "app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/locales/page.tsx";
const LOCALES_FORM = "components/locales/base-locale-form.tsx";
const TRANSLATIONS_PAGE = "app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/translations/page.tsx";
const HEADER = "components/translations/header.tsx";
const BASE_BANNER = "components/translations/base-pending-banner.tsx";
const EDIT_LOSS_BANNER = "components/translations/edit-loss-banner.tsx";

describe("대기 조건은 한 벌이다 — 두 화면이 `basePending`을 부른다", () => {
  it("로케일 화면이 `basePending`을 읽는다", () => {
    const src = read(LOCALES_PAGE);
    expect(src).toMatch(/from "@\/lib\/onboarding\/base-pending"/);
    expect(src).toMatch(/basePending\(/);
  });

  /**
   * ⚠️ **옮겨간 것은 "고칠 줄 + Copy" UI다.** 필드가 없는 화면에 그 UI만 남으면 사용자가 고칠 곳을
   * 찾아 두 화면을 오간다 — §7.7 결정 4가 그 왕복을 없애려고 자리를 합친 것이다.
   *
   * ⚠️ **`basePending` 자체는 설정에 남는다** — 워크플로 YAML이 **대기 중** `base-locale:`을 박기
   * 때문이다(그 줄이 없으면 CI가 옛 base를 계속 보내고 변경이 영영 안 일어난다). 그래서 이 컬럼의
   * 소비자가 셋이고, `updateBaseLocale`의 무효화 범위가 그 셋을 다 덮어야 한다 (POSTMORTEM 2026-09-09).
   */
  it("설정 화면이 고칠 줄을 더는 보이지 않는다 — 필드와 같은 자리로 갔다", () => {
    const src = read(SETTINGS_PAGE);
    expect(src).not.toMatch(/baseLocaleLine\(/);
    // 조건은 여전히 읽는다 — 워크플로 YAML이 그것으로 `base-locale:`을 고정한다.
    expect(src).toMatch(/basePending\(/);
  });

  it("번역 화면의 배너가 `basePending`을 읽는다", () => {
    const src = read(BASE_BANNER);
    expect(src).toMatch(/from "@\/lib\/onboarding\/base-pending"/);
    expect(src).toMatch(/basePending\(/);
  });

  /**
   * ⚠️ **조건을 손으로 다시 쓰면 두 벌이 된다.** `declaredBaseLocale !== baseLocale` 같은 비교가
   * 화면에 직접 나타나면 `basePending`의 갈래 넷(현실 null·선언 null·같음·다름) 중 하나가 반드시
   * 빠진다 — 특히 "첫 push 전"이 온보딩 중 경고로 새어 나온다.
   */
  it("어느 화면도 비교를 손으로 다시 쓰지 않는다", () => {
    for (const path of [SETTINGS_PAGE, BASE_BANNER, HEADER, SETTINGS_FORM, LOCALES_PAGE, LOCALES_FORM]) {
      expect(read(path), path).not.toMatch(/declaredBaseLocale\s*!==\s*baseLocale/);
      expect(read(path), path).not.toMatch(/baseLocale\s*!==\s*declaredBaseLocale/);
    }
  });
});

describe("번역 화면 — 배너 둘의 자리가 갈린다", () => {
  /**
   * ⚠️ **둘 다 조건부 분기 밖의 고정 슬롯이어야 한다** (DESIGN §6.1 · POSTMORTEM 2026-09-07).
   * 헤더 자체가 페이지의 무조건 렌더 자리에 있고(`translations-screen`이 그것을 센다) 배너는 그
   * 헤더 안의 형제다 — 분기 안에 넣으면 `router.refresh()`가 방금 만든 상태를 언마운트한다.
   */
  it("헤더가 두 배너를 형제로 든다 — 하나가 다른 하나의 분기 안에 있지 않다", () => {
    const src = read(HEADER);
    const base = src.indexOf("<BasePendingBanner");
    const loss = src.indexOf("<EditLossBanner");
    expect(base).toBeGreaterThan(-1);
    expect(loss).toBeGreaterThan(-1);
    // 대기 배너가 **먼저**다 — "왜 지금 보내야 하는가"가 "보내라"보다 앞이다.
    expect(base).toBeLessThan(loss);
    // 사이에 조건부 렌더(`&&`·삼항)가 끼면 한쪽이 다른 쪽의 분기 안이다.
    expect(src.slice(base, loss)).not.toMatch(/&&|\?/);
  });

  it("페이지가 현실과 선언을 둘 다 넘긴다 — 하나만 넘기면 배너가 판정할 수 없다", () => {
    const src = read(TRANSLATIONS_PAGE);
    expect(src).toMatch(/baseLocale=\{project\.baseLocale\}/);
    expect(src).toMatch(/declaredBaseLocale=\{project\.declaredBaseLocale\}/);
  });

  /**
   * ⚠️ **문구가 검토 표시를 예고하지 않는다.** `planPush`가 base 교체 push에서 `needsReview` 전파를
   * 건너뛰므로 그 일이 안 일어난다 — 예고하면 거짓이고, 둘을 말하면 무엇을 해야 하는지가 흐려진다.
   */
  it("대기 배너에 닫기가 없다 — 할 일이 남은 동안 계속 참이다", () => {
    expect(read(BASE_BANNER)).not.toMatch(/onDismiss/);
    // 편집 손실 배너는 반대다 — 건수가 0이 되거나 사용자가 닫으면 사라진다.
    expect(read(EDIT_LOSS_BANNER)).toMatch(/onDismiss/);
  });
});

describe("로케일 화면 — 폼과 대기 Alert (6b-5)", () => {
  /** 여러 줄일 수 있는 코드는 값 칩이 아니라 `<pre>`다 (DESIGN §6.4). */
  it("대기 Alert가 고칠 줄을 `<pre>`로 내고 복사할 수 있다", () => {
    const src = read(LOCALES_PAGE);
    expect(src).toMatch(/<Alert variant="warning"/);
    expect(src).toMatch(/<pre/);
    expect(src).toMatch(/<CopyButton/);
  });

  /**
   * ⚠️ **고칠 줄을 이 화면에서 직접 보인다** (§7.7 결정 4의 경계). 설정 화면으로 링크하면 "고치려면
   * 두 화면을 오간다"가 되고, 자리를 합친 이유가 사라진다. 워크플로 YAML 전체는 설정에 남는다 —
   * 여기 필요한 것은 한 줄이다.
   */
  it("`base-locale:` 리터럴을 화면이 직접 만들지 않는다", () => {
    const src = read(LOCALES_PAGE);
    expect(src).toMatch(/baseLocaleLine\(/);
    expect(src).not.toMatch(/base-locale:/);
  });

  /**
   * **필드는 저장이 보낼 값을 보인다** (malmoi#20 회귀).
   *
   * ⚠️ 현실로 초기화하면 대기 중에 화면을 새로 열었을 때 필드가 옛 언어를 보이고, 그 상태의
   * 저장이 옛 언어를 "고른 값"으로 보내 **되돌리기 경로가 선언을 지운다** — 배너까지 함께 사라져
   * 무음이다. 판정이 green인 것과 폼이 그것을 부르는 것은 다른 사실이다.
   */
  it("기준 언어 필드가 `baseLocaleFieldValue`로 초기화된다 — 현실 단독이 아니다", () => {
    const src = read(LOCALES_FORM);
    expect(src).toMatch(/from "@\/lib\/onboarding\/base-pending"/);
    expect(src).toMatch(/baseLocaleFieldValue\(/);
    // 옛 형태(`useState(baseLocale ?? …)`)가 남아 있으면 안 된다.
    expect(src).not.toMatch(/useState\(\s*baseLocale\s*\?\?/);
  });

  /** 저장 실패는 **in-block** `Alert danger`다 — 페이지 수준 거부(`?e=`)만 global이다 (DESIGN §6.6). */
  it("저장 실패가 폼 안의 danger Alert로 간다", () => {
    const src = read(LOCALES_FORM);
    expect(src).toMatch(/<Alert variant="danger"/);
    expect(src).toMatch(/isRepositorySettingsError/);
  });

  /**
   * ⚠️ **raw 컨트롤을 쓰지 않는다** — 포커스 링이 `components/ui/`의 프리미티브에만 있고
   * `focus-ring.test.ts`가 "`ui/` 밖에 네 태그 0개"를 전면 방어선으로 든다.
   */
  it("폼이 `components/ui/` 프리미티브만 쓴다", () => {
    const src = read(LOCALES_FORM);
    expect(src).toMatch(/from "@\/components\/ui\/select"/);
    expect(src).not.toMatch(/<select\b/);
  });

  /**
   * ⚠️ **orphaned 행이 사유와 되살리는 방법을 든다.** ARCHITECTURE §5.5.16이 그 상태를 정의해 놓고
   * **화면이 없었다** — 번역자가 볼 수 있는 것은 열이 사라진 사실뿐이었다. 이 화면의 존재 이유가
   * 그것이고, 배지만 달고 설명이 없으면 그 이유가 성립하지 않는다.
   */
  it("orphaned 행이 danger 배지와 설명을 든다", () => {
    const src = read(LOCALES_PAGE);
    expect(src).toMatch(/variant="danger"/);
    expect(src).toMatch(/orphaned/);
    expect(src).toMatch(/m\.locales\.orphaned/);
  });
});

describe("설정 화면 — 기준 브랜치만 남았다 (6b-5)", () => {
  it("readiness 분기 밖이다 — revalidate가 저장 결과를 씻지 않는다", () => {
    const src = read(SETTINGS_PAGE);
    const form = src.indexOf("<RepositoryForm");
    const readiness = src.indexOf("readiness === ");
    expect(form).toBeGreaterThan(-1);
    // 폼이 readiness를 처음 읽는 자리보다 **앞**이다 — 그 분기 안에 있을 수 없다.
    expect(form).toBeLessThan(readiness);
  });

  /**
   * ⚠️ **셀렉트가 남아 있으면 소유자가 둘이다.** 두 화면에서 같은 컬럼을 쓸 수 있으면 한쪽의 저장이
   * 다른 쪽의 대기를 지우는 경로가 다시 열린다 (malmoi#20의 원인 구조).
   */
  it("설정 폼에 로케일 셀렉트가 없다", () => {
    const src = read(SETTINGS_FORM);
    expect(src).not.toMatch(/from "@\/components\/ui\/select"/);
    expect(src).not.toMatch(/<Select/);
    expect(src).not.toMatch(/baseLocaleFieldValue\(/);
  });

  /**
   * ⚠️ **로케일 목록 조회도 함께 갔다.** 그 select의 유일한 소비자가 셀렉트 항목이었으므로 남겨
   * 두면 **아무 데도 안 쓰이는 행을 매 렌더에 읽는다** — 되돌아오면 그것이 조용한 비용이라 여기서
   * 센다. 이 화면이 선언 컬럼에 대해 하는 일은 워크플로 YAML에 한 줄을 박는 것뿐이다.
   */
  it("설정 화면이 로케일 목록을 조회하지 않는다", () => {
    const src = read(SETTINGS_PAGE);
    expect(src).not.toMatch(/locales:\s*\{/);
    // 로케일 화면은 반대다 — orphaned 행을 **보여주는 것**이 그 화면의 요지라 걸러 오지도 않는다.
    expect(read(LOCALES_PAGE)).toContain("loadProject(prisma, projectId, surfaceId)");
    expect(read("lib/keys/query.ts")).toMatch(/locales:\s*\{/);
  });

  /**
   * ⚠️ **워크플로 YAML은 그대로 둔다** (§7.7 결정 4) — 대기 중 `base-locale:`을 박는 동작도
   * 유지한다. 그 줄이 없으면 CI가 탐지 1순위(옛 base)를 보내고 `checkFormat`이 통과시켜 사용자가
   * 원한 변경이 **영영 일어나지 않는다.** 그래서 이 화면은 선언 컬럼을 **읽기만** 한다.
   */
  it("설정 화면이 선언을 워크플로 YAML에는 여전히 넘긴다", () => {
    expect(read(SETTINGS_PAGE)).toMatch(/declaredBaseLocale/);
  });
});
