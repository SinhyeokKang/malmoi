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

/**
 * `shrink-0`과 함께 쓰인 Tailwind 고정 폭(px). `w-N`은 `N * 4`px이다.
 *
 * ⚠️ **`shrink-0`이 붙은 것만 센다** — 줄어들 수 있는 폭은 좁은 화면에서 예산을 다투지 않는다.
 */
const fixedWidths = (source: string): number[] =>
  [...source.matchAll(/className="([^"]*)"/g)]
    .map((m) => m[1] ?? "")
    .filter((cls) => /\bshrink-0\b/.test(cls))
    .flatMap((cls) => [...cls.matchAll(/(?:^|\s)w-(\d+)(?:\s|$)/g)].map((w) => Number(w[1]) * 4));

const PAGE = "app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/translations/page.tsx";
const HEADER = "components/translations/header.tsx";
const ANNOUNCER = "components/translations/announcer.tsx";
const BANNER = "components/translations/edit-loss-banner.tsx";
const PUBLISH = "components/publish-button.tsx";
const INPUT = "components/translation-input.tsx";
/** 8-4가 더한 자리들 — 표 축이 바뀌면서 배선이 이 넷으로 갈렸다. */
const FILTERS = "components/translations/filters.tsx";
const CHIPS = "components/translations/filter-chips.tsx";
const KEY_GROUP = "components/translations/key-group.tsx";
const LOCALE_BADGE = "components/translations/locale-badge.tsx";
const PANEL = "components/shell/content-panel.tsx";

describe("Publish — 결과가 모달 갈래 열하나로 가는 길이 한 줄이다", () => {
  it("옛 `pull-button.tsx`는 사라졌다 — 두 벌이 남으면 그중 하나가 낡는다", () => {
    expect(existsSync(join(ROOT, "components/pull-button.tsx"))).toBe(false);
  });

  it("갈래 판정을 한 곳에서 받는다 — 매핑 표를 두 벌 두지 않는다 (DESIGN §6.646)", () => {
    // ⚠️ **`PublishTone`은 2026-09-16에 사라졌다** — tone 넷을 내던 `pullMessage` 대신
    // `planPublishView`가 결과 8갈래를 내고, danger는 `Alert` 프리미티브가 그대로 든다.
    expect(read(PUBLISH)).toMatch(/planPublishView\(outcome\)/);
    expect(read(PUBLISH)).toMatch(/<Alert variant="danger"/);
  });

  it("버린 값의 **파일 목록**을 편다 — 건수만으로는 편집자가 행동할 수 없다 (ARCHITECTURE §0 불변식 9)", () => {
    const src = read(PUBLISH);
    expect(src).not.toMatch(/<details/);
    expect(src).toMatch(/<Warnings/);
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
    for (const path of [PAGE, HEADER, BANNER, PUBLISH, INPUT, FILTERS, CHIPS, KEY_GROUP, LOCALE_BADGE]) {
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

describe("접근 이름과 경로 (code-review 2026-09-08 🟡)", () => {
  /**
   * ⚠️ **903행 × 3로케일에서 placeholder는 이름이 아니다** — 값이 채워진 입력에는 읽히지 않으므로,
   * 스크린리더가 어느 키·어느 로케일인지 알 길이 없다. 같은 화면의 live region은 `Saved
   * buttons.cancel · ja`처럼 말하면서 정작 입력에는 그 맥락이 없었다 (DESIGN §7).
   */
  it("셀이 키와 로케일을 접근 이름으로 든다", () => {
    expect(read(INPUT)).toMatch(/aria-label=\{m\.translations\.cellLabel\(/);
  });

  /**
   * ✅ **초대 링크 검사는 `members-screen.test.ts`로 옮겼다** (2026-09-08 6b-2) — 임시 폼
   * `components/invite-form.tsx`가 멤버 화면의 `InviteDialog`로 대체되면서 이 화면에서 사라졌다.
   * 근거(경로 리터럴은 타입이 아니라 데이터다 — POSTMORTEM 2026-09-05)는 그대로 그쪽에 있다.
   */
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

/**
 * **설정의 보관 카드** (7단계 — design §6.2).
 *
 * ⚠️ **인라인 결과 Alert를 두지 않는다.** 성공하면 `revalidatePath("/", "layout")`이 이 화면을 다시
 * 그리는데, 결과 문구가 그 안에 있으면 방금 받은 결과가 **언마운트되면서 사라진다** —
 * POSTMORTEM 2026-09-07(`FirstIngestRetry`)이 정확히 그 함정이고, 여기서는 **카드 상태 전환 자체가
 * 피드백**이라 문구를 둘 이유도 없다 (`reconnect-button` 선례).
 */
describe("보관 카드 (7단계)", () => {
  const CARD = "components/settings/archive-card.tsx";
  const SETTINGS = "app/(edit)/projects/[slug]/settings/page.tsx";

  it("확인이 `Dialog`다 — 전 멤버의 편집을 멈추는 일이라 클릭 하나로 끝나면 안 된다", () => {
    expect(read(CARD)).toContain("Dialog");
  });

  it("확인 버튼이 `danger`다 — 멈추는 쪽이 되돌리는 쪽보다 무겁다", () => {
    expect(read(CARD)).toMatch(/variant="danger"/);
  });

  it("⚠️ 인라인 결과 Alert가 없다 — revalidate가 그것을 언마운트한다", () => {
    expect(read(CARD)).not.toContain("<Alert");
  });

  it("되돌리기는 확인을 묻지 않는다 — 잃는 것이 없다", () => {
    const src = read(CARD);
    expect(src).toContain("unarchiveProject");
    // Dialog가 하나뿐이다 — 보관 쪽에만 붙는다.
    expect(src.match(/<Dialog\b/g)?.length ?? 0).toBe(1);
  });

  /**
   * ⚠️ **열린 PR 조회 실패를 "없다"로 읽지 않는다** (POSTMORTEM 2026-09-03). 보관은 그 PR을 닫지
   * 않으므로(PRODUCT §7.9) 사람이 그것을 알고 판단해야 하는데, 실패를 부재로 접으면 그 정보가
   * 조용히 사라진다.
   */
  it("열린 PR 조회 실패에 전용 문구가 있다", () => {
    expect(read("messages/en.tsx")).toMatch(/prUnknown/);
  });

  it("카드가 readiness 분기 **밖**의 형제다 — 첫 적재 전에도 보관할 수 있어야 한다", () => {
    const src = read(SETTINGS);
    const card = src.indexOf("<ArchiveCard");
    expect(card).toBeGreaterThan(-1);
    // readiness 삼항 안에 들어가 있으면 그 분기 문자열이 카드보다 뒤에 닫힌다.
    expect(src.slice(card)).not.toMatch(/^\s*[^<]*readiness ===/);
  });
});

/**
 * **8-4 — 행 축의 배선.** 아래 여섯은 이 배송이 새로 만든 자리이고, 각각 이 리포가 **실제로 밟은**
 * 결함 하나씩을 막는다.
 */
describe("행 축 (8-4)", () => {
  /**
   * ⚠️ **실패한 Publish 뒤에 `router.refresh()`를 부르면 안 된다** (POSTMORTEM 2026-09-08). 서버
   * 상태가 안 바뀌었으니 갱신할 것이 없고, 사유가 `unauthorized`면 그 refresh가 미들웨어에 걸려
   * 로그인 화면으로 **네비게이션**해 방금 만든 danger Alert가 한 프레임도 안 보인다.
   *
   * ⚠️ **그 가드를 지키는 단언이 8-4 전까지 0건이었다** — 위 "성공 뒤 서버 렌더를 갱신한다"는
   * 호출이 **있는지만** 본다.
   */
  it("`router.refresh()`가 실패 갈래 **밖**이다", () => {
    const lines = read(PUBLISH).split("\n").filter((line) => line.includes("router.refresh()"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/status !== "failed"/);
  });

  /**
   * ⚠️ **제출 버튼 없는 `<form>`은 Enter로 submit되지 않는다** (POSTMORTEM 2026-09-08 — 검색이
   * 조용히 무효였고 CDP 원시 키까지 먹여 봐도 같았다). 툴바 재작성에서 되돌아가지 않게 고정한다.
   */
  it("툴바가 공통 검색 입력을 사용한다 — Enter 동작은 filter-interactions에서 검증한다", () => {
    const src = read(FILTERS);
    expect(src).not.toMatch(/<form\b/);
    expect(src).toMatch(/<SearchInput\b/);
    expect(src).toMatch(/onSearch=\{/);
  });

  /**
   * ⚠️ **칩의 제거 버튼이 링크 안에 있으면 안 된다.** 상호작용 요소의 중첩은 접근성으로 금지이고,
   * 그 모양이 정확히 Radix Slot이 던진 자리와 같다 (POSTMORTEM 2026-09-09 — `asChild` 자식 옆의
   * 형제 하나로 셸이 죽었다). 형태와 이름 두 축으로 센다.
   */
  it("칩은 링크가 아니다 — 라벨이 평문이고 제거만 버튼이다", () => {
    const src = read(CHIPS);
    expect(src).not.toMatch(/<Link\b/);
    expect(src).not.toMatch(/<a\b/);
    expect(src).toMatch(/aria-label=\{m\.translations\.chips\.remove\(/);
  });

  /**
   * ⚠️ **로케일 헤더가 사라져 orphaned 로케일의 표시가 살 자리가 배지뿐이다** (design §4).
   * 색만으로 말하면 스크린리더에 아무것도 안 남으므로 `sr-only` 문구가 함께 있어야 한다.
   */
  it("로케일 배지가 orphaned 표시를 든다", () => {
    const src = read(LOCALE_BADGE);
    expect(src).toMatch(/orphaned \? "danger"/);
    expect(src).toMatch(/sr-only/);
  });

  /**
   * ⚠️ **`Base` 라벨을 배지에서 뺐다** (2026-09-11 사용자). 이 표에서 base 행은 **맨 위 한 줄**이고
   * (`sortLocales`가 그렇게 세운다) 그 사실이 903키 × 로케일 수만큼 반복되면 배지 폭만 먹는다 —
   * "가장 흔한 상태가 조용해야 한다"는 규칙(DESIGN §6.2)의 연장이고, 그 라벨이 값을 하는 자리는
   * 로케일이 **목록**으로 서는 `/locales`·Home이다(거기서는 계속 쓴다 — 사전 키를 지우지 않았다).
   *
   * ⚠️ 대가를 적어 둔다 — base 셀을 비우면 그 키가 base 파일에서 빠져 **다음 push가 전 로케일에서
   * orphan한다**(`lib/pull/plan.ts`). 그 위험을 표에서 말하는 것은 이제 순서뿐이다.
   */
  it("배지가 base 라벨을 안 든다 — 이 표에서 base는 맨 위 한 줄이다", () => {
    expect(read(LOCALE_BADGE)).not.toMatch(/m\.locales\.base/);
    expect(read(KEY_GROUP)).not.toMatch(/isBase/);
    /*
      사전 키는 남는다 — `/locales`가 계속 쓴다.
      ⚠️ **Home이 2026-09-15에 이 목록에서 빠졌다** (project-home) — 로케일 목록 블록이 사라지고
      메타 열의 국기 줄이 그 자리를 받았다. base를 말할 자리가 그 화면에 더 이상 없다.
    */
    expect(read("app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/locales/page.tsx")).toMatch(/m\.locales\.base/);
  });

  /**
   * ⚠️ **`Untranslated` 배지·상태 필터·입력 테두리가 같은 배송에서 사라졌다** — 값이 빈 셀의
   * 유일한 시각 신호가 `placeholder`다 (spec Q3).
   */
  it("빈 셀의 `placeholder`가 살아 있다", () => {
    expect(read(INPUT)).toMatch(/placeholder=\{[^}]*m\.translations\.placeholder/);
    // 배지 쪽은 반대로 사라졌다 — 사전에서 지웠으므로 남아 있으면 typecheck가 죽지만, 의도를 남긴다.
    expect(read(KEY_GROUP)).not.toMatch(/m\.translations\.untranslated/);
  });

  /**
   * ⚠️ **본문 랜드마크를 `ContentPanel`이 든다** — 표 갈래가 `<table>`에서 `div` + `grid`로 바뀌면서
   * 이 화면의 트리를 통째로 다시 썼다. `shell-layout.test.ts`가 스스로 "렌더 경로를 못 본다"고
   * 적어 뒀으므로 **어느 자리가 드는지를 이름으로** 고정한다 (design §8-7).
   */
  it("`<main>`을 `ContentPanel`이 들고 번역 화면은 자기 것을 안 든다", () => {
    expect(read(PANEL)).toMatch(/<main\b/);
    for (const path of [PAGE, HEADER, KEY_GROUP]) {
      expect(read(path), path).not.toMatch(/<main\b/);
    }
  });

  /**
   * ⚠️ **결과 `Alert`가 스크롤 본문 맨 위에 그려진다** — 버튼은 고정 머리에 있으므로 903키 표를
   * 아래로 내린 채 누르면 방금 만든 문구가 **뷰포트 밖**이다. 성공은 "Last sent"가 바뀌는 간접
   * 신호라도 있지만 **실패는 신호가 0이다**(스피너가 멈추는 것이 전부) — 버린 값이 화면에 닿아야
   * 한다는 ARCHITECTURE §0 불변식 9가 거기서 깨진다 (2026-09-11 code-review 🟡).
   */
  it("Publish 결과를 화면으로 끌어온다", () => {
    const src = read(HEADER);
    expect(src).toMatch(/<PublishModal/);
    // 배너가 아니라 **결과**에만 걸린다 — 배너는 도착 시점의 조건이라 사용자가 위에서 본다.
    expect(src).toMatch(/publish=\{publish\}/);
  });

  /** ⚠️ 숫자만 그리면 접근 이름이 "Translations 1134"다 — 시안의 숫자 배지를 유지하며 문장을 준다. */
  it("개수 배지가 접근 이름으로 완전한 문장을 든다", () => {
    for (const path of [HEADER, PAGE]) {
      expect(read(path), path).toMatch(/sr-only[^>]*>\{m\.translations\.keys\(/);
    }
  });

  /**
   * ⚠️ **로케일 행의 고정 폭 예산** (malmoi#33, 2026-09-11 `/bugshot-qa` 실측).
   *
   * 1280px(규약 3의 최소 폭)에서 콘텐츠 패널이 688이고 키 셀 320을 빼면 **값 열이 366**이다. 그
   * 안에서 로케일 칸·메타 슬롯·padding·gap이 전부 고정이면 입력에 남는 폭이 그만큼 줄어드는데,
   * 메타가 `w-40`(160)을 고정으로 들던 동안 **입력이 28px**였다 — 값이 한 글자씩 세로로 쌓이고
   * 행 높이가 210px이 됐다.
   *
   * ⚠️ **spec의 "값 열 ≈368px에서도 한 줄 번역은 성립한다"가 열 전체를 입력 폭으로 읽은 것이다.**
   * 그래서 이 검사는 **행 안의 고정 폭 합**을 센다 — 다음 사람이 우측에 또 고정 폭을 더하면 red다.
   *
   * ⚠️ **폭은 렌더 결과라 소스 스캔이 원리적으로 못 보는 축이지만**, 원인은 소스에 있는 상수다.
   * 재는 것은 픽셀이 아니라 **예산을 쓰는 클래스**다.
   */
  it("로케일 행의 고정 폭이 로케일 칸 하나뿐이다", () => {
    const fixed = fixedWidths(read(KEY_GROUP));
    // ⚠️ **68이다** (2026-09-11 — 시안 `212:5076`). 80에서 12를 값 열에 돌려줬다.
    expect(fixed).toEqual([68]);
    // 1280에서 값 열 366 − 로케일 칸 68 − 입력 px-3(24) − 값 칸 pr-3(12) = 262.
    // ⚠️ **실측은 238이다** (2026-09-11 ego, 1280×900): 위 산식은 입력의 border-box를 재고 실측은
    // 그 안쪽까지 본다. 하한 200은 **어느 쪽으로 재도** 값이 한 글자씩 쌓이지 않는 선이다.
    expect(366 - fixed.reduce((n, w) => n + w, 0) - 24 - 12).toBeGreaterThanOrEqual(200);
  });

  it("고정 폭 스캐너가 실제로 `w-40 shrink-0`을 잡는다", () => {
    expect(fixedWidths('<div className="flex w-20 shrink-0 justify-center">')).toEqual([80]);
    expect(fixedWidths('<div className="w-40 shrink-0 justify-end">')).toEqual([160]);
    // `shrink-0`이 없으면 예산을 쓰지 않는다 — 줄어들 수 있는 폭은 대상이 아니다.
    expect(fixedWidths('<div className="w-40 justify-end">')).toEqual([]);
    // 키 셀 폭은 그리드가 들고 이 검사의 대상이 아니다.
    expect(fixedWidths('<div className="grid grid-cols-[320px_minmax(0,1fr)]">')).toEqual([]);
  });

  /** ⚠️ 왼쪽 패널이 **소스에서** 사라졌다 — 남으면 같은 필터가 두 곳이고 하나가 낡는다. */
  it("`NamespacePanel`·`NsLink`가 없다", () => {
    for (const path of [PAGE, HEADER, FILTERS]) {
      expect(read(path), path).not.toMatch(/NamespacePanel|NsLink/);
    }
  });

  /**
   * ⚠️ **스캐너가 red를 낼 수 있는지** 반례로 확인한다 (POSTMORTEM 2026-09-07 — "검사가 자기
   * 대상의 일부만 본다"). 이 배송이 스캔을 여섯 더했으므로 그만큼 공허할 위험도 늘었다.
   */
  it("위 검사식들이 실제로 그 형태를 잡는다", () => {
    expect(/status !== "failed"/.test("        router.refresh();")).toBe(false);
    expect(/<form\b/.test('  <form action={go}>')).toBe(true);
    expect(/<a\b/.test('<a href={x}>')).toBe(true);
    expect(/<a\b/.test('<Announcer>')).toBe(false);
    expect(/<main\b/.test('  <main className="x">')).toBe(true);
    expect(/NamespacePanel|NsLink/.test("      <NsLink href={x} />")).toBe(true);
  });
});
