import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 기준 로케일 변경이 **두 화면에 실제로 배선됐는지** 소스에서 센다 (6b-3 — design §3.13).
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
const TRANSLATIONS_PAGE = "app/(edit)/projects/[slug]/translations/page.tsx";
const HEADER = "components/translations/header.tsx";
const BASE_BANNER = "components/translations/base-pending-banner.tsx";
const EDIT_LOSS_BANNER = "components/translations/edit-loss-banner.tsx";

describe("대기 조건은 한 벌이다 — 두 화면이 `basePending`을 부른다", () => {
  it("설정 화면이 `basePending`을 읽는다", () => {
    const src = read(SETTINGS_PAGE);
    expect(src).toMatch(/from "@\/lib\/onboarding\/base-pending"/);
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
    for (const path of [SETTINGS_PAGE, BASE_BANNER, HEADER, SETTINGS_FORM]) {
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

describe("설정 화면 — 폼과 대기 Alert", () => {
  it("readiness 분기 밖이다 — revalidate가 저장 결과를 씻지 않는다", () => {
    const src = read(SETTINGS_PAGE);
    const form = src.indexOf("<RepositoryForm");
    const readiness = src.indexOf("readiness === ");
    expect(form).toBeGreaterThan(-1);
    // 폼이 readiness를 처음 읽는 자리보다 **앞**이다 — 그 분기 안에 있을 수 없다.
    expect(form).toBeLessThan(readiness);
  });

  /** 여러 줄일 수 있는 코드는 값 칩이 아니라 `<pre>`다 (DESIGN §6.4). */
  it("대기 Alert가 고칠 줄을 `<pre>`로 내고 복사할 수 있다", () => {
    const src = read(SETTINGS_PAGE);
    expect(src).toMatch(/<Alert variant="warning"/);
    expect(src).toMatch(/<pre/);
    expect(src).toMatch(/<CopyButton/);
  });

  /**
   * ⚠️ **그 줄의 정본이 `baseLocaleLine`이다.** 화면이 `base-locale:` 리터럴을 직접 조립하면
   * 워크플로 생성기와 갈리고, 그때 사용자가 붙여넣은 YAML이 action의 input과 어긋나 CI가 조용히
   * 옛 base를 계속 보낸다.
   */
  it("`base-locale:` 리터럴을 화면이 직접 만들지 않는다", () => {
    const src = read(SETTINGS_PAGE);
    expect(src).toMatch(/baseLocaleLine\(/);
    expect(src).not.toMatch(/base-locale:/);
  });

  /** 저장 실패는 **in-block** `Alert danger`다 — 페이지 수준 거부(`?e=`)만 global이다 (DESIGN §6.6). */
  it("저장 실패가 폼 안의 danger Alert로 간다", () => {
    const src = read(SETTINGS_FORM);
    expect(src).toMatch(/<Alert variant="danger"/);
    expect(src).toMatch(/isRepositorySettingsError/);
  });

  /**
   * ⚠️ **raw 컨트롤을 쓰지 않는다** — 포커스 링이 `components/ui/`의 프리미티브에만 있고
   * `focus-ring.test.ts`가 "`ui/` 밖에 네 태그 0개"를 전면 방어선으로 든다.
   */
  it("폼이 `components/ui/` 프리미티브만 쓴다", () => {
    const src = read(SETTINGS_FORM);
    expect(src).toMatch(/from "@\/components\/ui\/input"/);
    expect(src).toMatch(/from "@\/components\/ui\/select"/);
    expect(src).not.toMatch(/<input\b/);
    expect(src).not.toMatch(/<select\b/);
  });
});
