import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 화면 배선을 **소스에서** 센다 (translation-ui T8).
 *
 * ⚠️ 이 리포에는 렌더 테스트가 없다 (design §4) — jsdom이 못 보는 결함 부류가 셋이다. 그래서
 * `translations-screen`·`focus-ring`·`client-graph`와 같은 계열으로, **판정이 green인 것과 화면이
 * 그것을 실제로 쓰는 것은 다른 사실**임을 스캔이 든다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** 주석을 벗긴다 — 이 화면들의 docstring이 자기가 **피하는 것**을 이름으로 적는다. */
const read = (path: string): string =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const LAYOUT = "app/layout.tsx";
const SETTINGS = "app/(edit)/projects/[slug]/settings/page.tsx";
const INVITE = "app/invite/[token]/page.tsx";

describe("문서 언어 (T8)", () => {
  /**
   * ⚠️ **T4가 미뤄 둔 한 줄이다.** 화면 문구가 전부 영어가 되는 커밋이 이것이므로 여기서 바꾼다 —
   * `lang`이 틀리면 스크린리더가 영어 문장을 한국어 음성 엔진으로 읽고, 하이픈네이션·따옴표도 갈린다.
   */
  it("`<html lang=\"en\">`이다 — 문구가 전부 영어가 됐다", () => {
    expect(read(LAYOUT)).toMatch(/lang="en"/);
    expect(read(LAYOUT)).not.toMatch(/lang="ko"/);
  });
});

describe("설정 화면 — revalidate가 결과를 씻지 않는다 (POSTMORTEM 2026-09-07)", () => {
  const src = read(SETTINGS);

  /**
   * ⚠️ 실물 검증이 잡은 결함의 상시 방어선이다. `runFirstIngest`가 `revalidatePath`를 부르고 readiness가
   * `awaiting_first_sync` → `ready`로 바뀐다 — 그 조건부 분기 **안**에 결과 컴포넌트가 있으면 성공이
   * 자기 표시기를 언마운트하고, `failed > 0`의 "M건을 읽지 못했다"가 아무에게도 닿지 않는다(불변식 9).
   */
  it("`FirstIngestRetry`가 readiness 분기 밖이다 — 버튼만 `canRun`으로 감춘다", () => {
    expect(src).toMatch(/<FirstIngestRetry/);
    expect(src).toMatch(/canRun=\{/);
    // 분기 안에 있으면 `&&` 뒤에 붙는다 — 그 형태를 금지한다.
    expect(src).not.toMatch(/&&\s*<FirstIngestRetry/);
  });

  /**
   * ⚠️ **블록 둘이 독립적으로 실패한다** (DESIGN §6.6). 건강성은 App 설치 토큰, 계정은 사용자 토큰이라
   * 하나로 묶으면 한쪽 GitHub 장애에 화면이 통째로 빈다 — 그래서 둘을 병렬로 읽고 각자 자기 오류를 낸다.
   */
  it("건강성과 계정을 병렬로 읽는다 — 한쪽 장애가 다른 쪽을 막지 않는다", () => {
    expect(src).toMatch(/Promise\.all\(/);
    expect(src).toMatch(/loadHealth\(/);
    // ⚠️ **6b-4에서 이 로더가 `lib/github-connect/account-view.ts`로 내려갔다** — `/account`가 같은
    // 3갈래를 필요로 하고, 사본을 두면 두 화면이 갈린다. 이름을 고정해 사본이 돌아오는 것을 막는다.
    expect(src).toMatch(/loadAccountView\(/);
    expect(src).not.toMatch(/async function loadAccount/);
  });
});

describe("적재 결과 tone은 `failed`가 정한다 (code-review 2026-09-08 🟡)", () => {
  /**
   * ⚠️ **헤드라인과 tone이 다른 지표를 보면 부분 실패가 조용해진다.** `ingestHeadline`은 `failed`로
   * 문장을 고르는데 tone을 `errors.length`로 고르면, 진단 목록이 빈 부분 실패가 `success`로 그려진다 —
   * SAAS 불변식 9(버린 값을 숨기지 않는다)가 정확히 그 자리에서 깨진다. 같은 커밋의 온보딩 결과
   * 화면은 처음부터 `failed`를 봤다: **두 화면이 같은 지표를 봐야 한다.**
   */
  it("설정 화면도 온보딩 결과 화면과 같은 지표(`failed`)를 본다", () => {
    for (const path of [
      "components/onboarding/first-ingest-retry.tsx",
      "components/onboarding/new-project-flow.tsx",
    ]) {
      expect(read(path), path).toMatch(/failed === 0 \? "success" : "warning"/);
      expect(read(path), path).not.toMatch(/errors\.length === 0 \? "success"/);
    }
  });
});

describe("대기 라벨은 누른 행동을 말한다 (DESIGN §6.4)", () => {
  /**
   * ⚠️ **`loadingLabel`이 `label`과 무관하면 안 된다.** [Connect]를 눌렀는데 "Reconnect"로 바뀌면
   * 사용자는 다른 동작이 시작된 것으로 읽고, 반대로 둘이 **같으면** 대기 상태가 시각적으로 사라진다.
   */
  it("재연결 버튼의 대기 라벨이 눌린 라벨에서 파생된다", () => {
    const src = read("components/reconnect-button.tsx");
    expect(src).toMatch(/loadingLabel=\{pendingLabel\}/);
  });

  it("GitHub 연결 버튼에 진행 중 문구가 따로 있다", () => {
    expect(read("components/onboarding/connect-github.tsx")).toMatch(/redirecting/);
  });
});

describe("초대 수락 — 갇히는 길을 남기지 않는다", () => {
  const src = read(INVITE);

  /**
   * ⚠️ "초대받은 주소의 계정으로 로그인해 주세요"라고 말해 놓고 로그아웃할 곳이 없으면 갇힌다 —
   * 이 페이지는 `(edit)` 레이아웃 밖이라 셸의 sign out이 없다 (code-review 2026-09-06 🟡11).
   */
  it("`email-mismatch`에 다른 계정으로 로그인하는 길이 있다", () => {
    expect(src).toMatch(/email-mismatch/);
    expect(src).toMatch(/signOut\(/);
  });

  /** `?e=`를 읽는 쪽이 없으면 거부가 통째로 무음이다 (POSTMORTEM 2026-09-06 · issue #2). */
  it("`?e=`를 실제로 읽는다", () => {
    expect(src).toMatch(/searchParams/);
    expect(src).toMatch(/inviteErrorMessage\(/);
  });
});

/**
 * **계정 화면 — 사용자 축의 유일한 자리** (SAAS §7.7, 6b-4).
 *
 * ⚠️ **이 화면이 생긴 원인은 "자리가 없었다"다.** 연결 해제 버튼이 `/projects` 목록에 얹혀 있었고
 * (2026-09-07 리뷰 🟡9), 그것은 목록 화면의 일이 아니다 — 프로젝트를 하나도 안 만든 사용자에게
 * 도달 가능한 자리가 그것뿐이었기 때문이다. 자리가 생겼으니 **옮긴다: 복제가 아니다**
 * (6b-2가 초대 폼을 지운 근거와 같다).
 */
describe("계정 화면 — 옮겼고 복제하지 않았다 (6b-4)", () => {
  const ACCOUNT = "app/(edit)/account/page.tsx";
  const PROJECTS = "app/(edit)/projects/page.tsx";
  const USER_MENU = "components/shell/user-menu.tsx";

  it("`requireUser`만 지난다 — 인가할 프로젝트가 없다", () => {
    const src = read(ACCOUNT);
    expect(src).toContain("requireUser");
    expect(src).not.toContain("requireProjectAccess");
  });

  /**
   * ⚠️ **`?e=`를 읽는 자리가 셋에서 넷이 됐다.** callback이 `dest`에 따라 사유를 이 화면으로도
   * 보내므로, 안 읽으면 거부가 통째로 무음이다 (POSTMORTEM 2026-09-06). **판정 함수로 걸러야 한다** —
   * 주소창 값을 캐스팅하면 프로토타입 키가 문자열 자리에 함수를 넣어 화면이 죽는다
   * (POSTMORTEM 2026-09-08).
   */
  it("`?e=`를 `isConnectError`로 걸러 읽는다 — 캐스팅하지 않는다", () => {
    const src = read(ACCOUNT);
    expect(src).toContain("searchParams");
    expect(src).toContain("isConnectError");
    expect(src).not.toMatch(/as ConnectError/);
  });

  /**
   * ⚠️ **연결과 해제가 한 화면에 다 있어야 한다.** 해제만 있으면 계정이 없는 사용자에게 빈 카드이고,
   * 연결만 있으면 `taken-by-other`가 영구 잠금이다 (SAAS §5.5는 자동 병합을 금지한다).
   */
  it("연결과 해제가 둘 다 있다", () => {
    const src = read(ACCOUNT);
    expect(src).toContain("ConnectGithubButton");
    expect(src).toContain("DisconnectGithubButton");
  });

  it("계정 카드가 `/projects` 목록에서 사라졌다 — 이동이지 복제가 아니다", () => {
    const src = read(PROJECTS);
    expect(src).not.toContain("DisconnectGithubButton");
    expect(src).not.toContain("APP_ACCOUNT_PROVIDER");
  });

  it("사용자 메뉴에 계정 항목이 있다 — 셸에서 도달하는 경로다", () => {
    const src = read(USER_MENU);
    expect(src).toContain("routes.account()");
  });

  /**
   * ⚠️ 사이드바가 `projectSections`를 직접 부르던 자리를 `navZones`가 받는다 — 구역 판정이 두 벌이
   * 되면 하나가 낡는다 (`lib/shell/nav.ts`가 그 판정의 유일한 자리다).
   */
  it("사이드바는 구역을 `navZones`에서 받는다", () => {
    const src = read("components/shell/sidebar.tsx");
    expect(src).toContain("navZones");
    expect(src).not.toContain("projectSections");
  });
});
