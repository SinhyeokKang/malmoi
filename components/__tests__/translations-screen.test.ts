import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 번역 화면의 배선을 **소스에서** 센다 (translation-ui T7).
 *
 * ⚠️ 이 리포에는 렌더 테스트가 없다 (design §4 — jsdom이 못 보는 결함 부류가 셋이라 게이트만 늘어난다).
 * 그래서 `lib/keys/__tests__/actor.test.ts`·`focus-ring`·`client-graph`와 같은 계열로, **판정 함수가
 * green인 것과 화면이 그것을 실제로 쓰는 것은 다른 사실**임을 이 스캔이 든다 — 이 리포의 반복 실패
 * 유형이 "만든 것이 실제로 호출되는가"다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * ⚠️ **주석을 벗기고 센다** — `focus-ring`·`no-korean-ui`와 같은 벗기기다. 이 화면의 docstring은
 * 자기가 **피하는 것**을 이름으로 적으므로(`role="status"`를 셀에 두지 않는다), 안 벗기면 그 설명이
 * 위반으로 잡혀 영원히 red다.
 */
const read = (path: string): string =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const PAGE = "app/(edit)/projects/[slug]/translations/page.tsx";
const HEADER = "components/translations/header.tsx";
const ANNOUNCER = "components/translations/announcer.tsx";
const BANNER = "components/translations/edit-loss-banner.tsx";
const PUBLISH = "components/publish-button.tsx";
const INPUT = "components/translation-input.tsx";

describe("Publish — 다섯 문구가 Alert로 가는 길이 한 줄이다", () => {
  it("옛 `pull-button.tsx`는 사라졌다 — 두 벌이 남으면 그중 하나가 낡는다", () => {
    expect(existsSync(join(ROOT, "components/pull-button.tsx"))).toBe(false);
  });

  it("tone을 Alert variant로 **그대로** 넘긴다 — 매핑 표를 두 벌 두지 않는다 (design §3.4)", () => {
    // `PublishTone`과 Alert의 variant는 같은 네 이름이다 (lib/pull/message.ts).
    expect(read(PUBLISH)).toMatch(/variant=\{message\.tone\}/);
  });

  it("버린 값의 **파일 목록**을 편다 — 건수만으로는 편집자가 행동할 수 없다 (SAAS 불변식 9)", () => {
    const src = read(PUBLISH);
    expect(src).toMatch(/<details/);
    expect(src).toMatch(/warnings/);
  });

  it("성공 뒤 서버 렌더를 갱신한다 — 툴바의 'Last sent'가 그때 바뀐다", () => {
    expect(read(PUBLISH) + read(HEADER)).toMatch(/router\.refresh\(\)/);
  });

  /**
   * ⚠️ **결과를 든 컴포넌트가 조건부 분기 안에 있으면 안 된다** (POSTMORTEM 2026-09-07). 그때는
   * `revalidatePath`가 성공 직후 그 분기를 거짓으로 만들어 결과 문구를 언마운트했다. Publish는
   * `router.refresh()`라 축이 같다 — 헤더가 페이지의 무조건 렌더 자리에 있어야 상태가 살아남는다.
   */
  it("헤더는 페이지가 무조건 렌더한다 — readiness·필터 분기 안이 아니다", () => {
    const src = read(PAGE);
    expect(src).toMatch(/<TranslationsHeader/);
    // 분기 안에 있으면 `&&` 뒤에 붙는다 — 그 형태를 금지한다.
    expect(src).not.toMatch(/&&\s*<TranslationsHeader/);
  });
});

describe("live region — 표 하나에 하나다 (design §3.8)", () => {
  it("`aria-live`가 announcer에만 있다 — 903행×3로케일이면 셀마다 두는 순간 2,700개다", () => {
    for (const path of [PAGE, HEADER, BANNER, PUBLISH, INPUT]) {
      expect(read(path), path).not.toMatch(/aria-live/);
    }
    expect(read(ANNOUNCER)).toMatch(/aria-live="polite"/);
    expect(read(ANNOUNCER)).toMatch(/sr-only/);
  });

  it("셀 안 상태줄은 **시각 전용**이다 — `role=\"status\"`를 셀에 두지 않는다", () => {
    expect(read(INPUT)).not.toMatch(/role="status"/);
  });

  /**
   * ⚠️ **provider가 없으면 알림이 조용히 사라진다.** 기본값을 no-op로 둔 것은 셀 하나가 표 전체를
   * 죽이지 않게 하려는 것이고(POSTMORTEM 2026-09-08 Tooltip), 그 대가로 배선을 여기서 센다.
   */
  it("페이지가 표를 `Announcer`로 감싼다 — 감싸지 않으면 알림이 무음이다", () => {
    expect(read(PAGE)).toMatch(/<Announcer>/);
  });
});

describe("셀 편집 — 포커스를 뺏지 않는다 (design §3.8)", () => {
  const src = read(INPUT);

  it("판정을 순수 함수에 맡긴다 — `activeElement`를 직접 비교하지 않는다", () => {
    expect(src).toMatch(/shouldRefocus\(/);
    expect(src).toMatch(/document\.activeElement/);
  });

  it("되돌리지 않은 실패에는 [Retry]가 남는다 — 포커스는 사용자가 옮긴다", () => {
    expect(src).toMatch(/save\.retry/);
  });

  it("프리미티브를 쓴다 — `Textarea` `rows=1`이 903행에서 세로 스크롤을 줄인다 (DESIGN §6.1)", () => {
    expect(src).toMatch(/<Textarea/);
  });

  it("Shift+Enter는 개행이다 — Enter가 개행이면 저장 트리거가 blur뿐이다", () => {
    expect(src).toMatch(/shiftKey/);
  });
});

describe("편집 손실 배너 (design §3.11)", () => {
  const src = read(BANNER);

  it("닫기 키가 세션이 아니라 `lastPulledAt`이다 — 다음 Publish 뒤 다시 보인다", () => {
    expect(src).toMatch(/dismissKey/);
    expect(src).toMatch(/sessionStorage/);
  });

  it("클라이언트 마운트 뒤에만 렌더한다 — SSR은 닫힘 상태를 모른다(플래시 방지)", () => {
    expect(src).toMatch(/useEffect/);
    expect(src).toMatch(/mounted/);
  });

  it("경고 tone이다 — 편집이 사라질 수 있다는 말은 조용하면 안 된다", () => {
    expect(src).toMatch(/variant="warning"/);
  });
});
