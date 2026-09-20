import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 화면 배선을 **소스에서** 센다 (translation-ui T8).
 *
 * ⚠️ 이 리포에는 렌더 테스트가 없다 (ARCHITECTURE §0.5) — jsdom이 못 보는 결함 부류가 셋이다. 그래서
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
  it("소스 카드가 적재 상태와 무관하게 유지된다 — 결과 유지 DOM 검증은 settings-sources가 담당한다", () => {
    expect(src).toMatch(/<SourcesCard/);
    expect(src).not.toMatch(/&&\s*<SourcesCard/);
  });

  /**
   * ⚠️ **블록 둘이 독립적으로 실패한다** (DESIGN §6.6). 건강성은 App 설치 토큰, 계정은 사용자 토큰이라
   * 하나로 묶으면 한쪽 GitHub 장애에 화면이 통째로 빈다 — 그래서 둘을 병렬로 읽고 각자 자기 오류를 낸다.
   */
  it("건강성과 계정을 병렬로 읽는다 — 한쪽 장애가 다른 쪽을 막지 않는다", () => {
    expect(src).toMatch(/Promise\.all\(/);
    expect(src).toMatch(/loadConnectionHealth\(/);
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
   * ARCHITECTURE §0 불변식 9(버린 값을 숨기지 않는다)가 정확히 그 자리에서 깨진다. 같은 커밋의 온보딩 결과
   * 화면은 처음부터 `failed`를 봤다: **두 화면이 같은 지표를 봐야 한다.**
   */
  it("Settings 재시도는 부분 실패 지표(`failed`)를 본다", () => {
    // 신규 생성은 부분 실패 전체를 거부한다. 기존 Settings 재시도만 부분 성공을 표시한다.
    for (const path of [
      "components/onboarding/first-ingest-retry.tsx",
    ]) {
      expect(read(path), path).toMatch(/failed === 0\s*\?/);
      /*
        ⚠️ **`errors.length`로 갈리면 안 된다 — 철자를 가리지 않는다.** `failed`는
        `errors.length + duplicateKeys`(ARCHITECTURE)라 **중복 키만 있는 부분 실패는
        `errors.length === 0`**이다. `? "success"`만 막으면 `? null`·`? <></>`가 그대로 지나간다.
      */
      expect(read(path), path).not.toMatch(/errors\.length === 0\s*\?/);
    }
  });

  it("버린 값이 있는 결과는 `warning`을 실제로 그린다", () => {
    // 판정뿐 아니라 실제 경고 그릇이 남아 있는지도 검사한다.
    for (const path of ["components/onboarding/first-ingest-retry.tsx"]) {
      // 한쪽은 `variant={… : "warning"}`이고 다른 쪽은 `variant="warning"`이다 — 그리는 값만 센다.
      expect(read(path), path).toMatch(/"warning"/);
    }
  });
});

describe("버튼 로딩은 스피너 하나다 (DESIGN §6.4)", () => {
  /**
   * ⚠️ **2026-09-10에 규칙이 뒤집혔다.** 전에는 `loadingLabel`로 문구까지 교체했고("Connect" →
   * "Connecting…"), 그 규칙이 요구한 것은 *"대기 라벨이 눌린 라벨에서 파생된다"*였다. 지금은
   * **스피너만 세우고 라벨을 그대로 둔다** — 문구가 바뀌면 폭이 흔들리고 화면마다 대기 문구를
   * 따로 들어야 했다(제거하며 죽은 문구 16개가 나왔다).
   *
   * 이 검사는 그 prop이 **되살아나지 않는지**를 본다 — 되살리면 같은 문구 부채가 다시 쌓인다.
   */
  it("`loadingLabel`이 어디에도 없다", () => {
    const files = [
      "components/ui/button.tsx",
      "components/reconnect-button.tsx",
      "components/onboarding/connect-github.tsx",
      "components/publish-button.tsx",
    ];
    for (const path of files) expect(read(path), path).not.toMatch(/loadingLabel/);
  });

  /** 스피너가 없으면 진행 신호가 통째로 사라진다 — 라벨이 안 바뀌므로 이것이 유일한 신호다. */
  it("`Button`이 진행 중에 스피너를 렌더한다", () => {
    const src = read("components/ui/button.tsx");
    expect(src).toMatch(/Loader2/);
    expect(src).toMatch(/animate-spin/);
  });
});

describe("초대 수락 — 갇히는 길을 남기지 않는다", () => {
  const src = read(INVITE);

  /**
   * ⚠️ "초대받은 주소의 계정으로 로그인해 주세요"라고 말해 놓고 로그아웃할 곳이 없으면 갇힌다 —
   * 이 페이지는 `(edit)` 레이아웃 밖이라 셸의 sign out이 없다 (code-review 2026-09-06 🟡11).
   */
  it("`email-mismatch`에 다른 계정으로 로그인하는 길이 있다", () => {
    // 판정은 순수 모듈로 이동했다. 화면 연결과 실제 CTA는 screen.test.tsx도 함께 센다.
    expect(read("lib/auth/invite-view.ts")).toMatch(/email-mismatch/);
    expect(src).toMatch(/planInviteView\(/);
    expect(src).toMatch(/case "wrong-account"/);
    expect(src).toMatch(/signOut\(/);
  });

  /** `?e=`를 읽는 쪽이 없으면 거부가 통째로 무음이다 (POSTMORTEM 2026-09-06 · issue #2). */
  it("`?e=`를 실제로 읽는다", () => {
    expect(src).toMatch(/searchParams/);
    expect(src).toMatch(/inviteErrorMessage\(/);
  });
});

/**
 * **계정 화면 — 사용자 축의 유일한 자리** (PRODUCT §7.7, 6b-4).
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
   * 연결만 있으면 `taken-by-other`가 영구 잠금이다 (ARCHITECTURE §6.2.1는 자동 병합을 금지한다).
   */
  it("연결과 해제가 둘 다 있다", () => {
    /**
     * ⚠️ **둘이 화면 파일에서 구역 컴포넌트로 내려갔다** (2026-09-13 — 머리 하나 + 리스트 셋).
     * 재는 자리를 안 옮기면 이 단언이 **화면에서 버튼이 사라져도 green**이 된다.
     */
    const section = read("components/account/github-section.tsx");
    expect(read(ACCOUNT)).toContain("GithubSection");
    expect(section).toContain("ConnectGithubButton");
    expect(section).toContain("DisconnectGithubButton");
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

/**
 * **보관된 프로젝트를 여는 다섯 화면** (7단계 — ARCHITECTURE §5.6.4).
 *
 * ⚠️ **`requireProjectAccess`가 `archived`를 값으로 돌려준다** — redirect하지 않는 이유는 되돌릴 수
 * 있는 상태이고 OWNER가 갈 곳이 설정 안의 카드 하나여서다(목록으로 튕기면 자기가 왜 거기 왔는지
 * 모른다). 그 대가가 **호출부가 빠뜨릴 수 있다**는 것이고, 빠뜨리면 화면이 **정상으로 렌더된다** —
 * 보관된 프로젝트에서 편집 표가 그대로 보이고, 저장을 눌러야 비로소 Action이 거부한다.
 * 눈으로는 안 보이는 결함이라 스캔이 든다 (`entry-points.test.ts`와 같은 계열).
 */
describe("보관 — 네 화면이 같은 갈래를 그린다 (7단계)", () => {
  /**
   * ⚠️ **Home이 2026-09-15에 이 목록에서 빠졌다** (project-home `2d`). 전면 교체가 **배너**로
   * 바뀌었다 — 보관된 프로젝트에서도 카드 넷과 메타 열이 자리를 지키고 값이 무엇이었는지 말한다.
   * 차단은 그대로 Action과 `/settings`가 들고, Home의 `[Sync]`·`[Publish]`는 비활성이다.
   * **`ProjectArchived`를 지우지 않는다** — 남은 넷이 계속 쓴다.
   */
  const SITES = [
    "app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/translations/page.tsx",
    "app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/locales/page.tsx",
    "app/(edit)/projects/[slug]/members/page.tsx",
  ];

  /**
   * ⚠️ **Logs가 2026-09-20에 이 목록에서 빠졌다** (logs-rework 완료조건 11). 보관 사건과 그 직전
   * 기록을 확인하려면 **복원해야 하는 순환**이었다 — 전면 교체 대신 `archivedPolicy: "read"`로
   * 통과시키고 화면이 배너를 그린다. **읽기 허용이 쓰기 허용이 아니라는 것**은 `access.test.ts`가
   * 갈래마다 세고, 여기서는 **그 정책을 실제로 넘기는 화면이 이 하나뿐인지**를 센다.
   */
  const LOGS = "app/(edit)/projects/[slug]/logs/page.tsx";

  it("Logs만 보관을 읽기로 통과시킨다", () => {
    expect(read(LOGS)).toContain('archivedPolicy: "read"');
    expect(read(LOGS)).not.toContain("ProjectArchived");
    for (const path of SITES) expect(read(path), path).not.toContain("archivedPolicy");
    expect(read(SETTINGS)).not.toContain("archivedPolicy");
  });

  /**
   * ⚠️ **읽기를 허용했으면 화면이 그 사실을 말해야 한다.** 전면 교체를 걷어낸 자리에 아무 표시가
   * 없으면 보관된 프로젝트의 이력이 **계속 쌓이는 것처럼** 읽힌다 — 조건부 렌더라 눈에 안 보이는
   * 부류이고(POSTMORTEM 2026-09-15 계열), 그래서 소스로 센다.
   */
  it("보관을 읽는 화면은 배너와 야간 문구 제거를 함께 든다", () => {
    const src = read(LOGS);
    expect(src).toContain("m.logs.archived");
    // 야간 발송이 보관을 건너뛰므로 `logs.reasons`의 그 절이 거짓이 된다 — 판정은 순수 함수가 든다.
    expect(src).toContain("planArchivedReason");
    expect(src).not.toContain("syncReasonMessage");
  });

  it("`translation:write` 화면 전부가 `ProjectArchived`를 반환한다", () => {
    for (const path of SITES) {
      const src = read(path);
      expect(src, path).toContain("ProjectArchived");
      expect(src, path).toMatch(/if\s*\(archived\)\s*return\s*<ProjectArchived/);
    }
  });

  /**
   * ⚠️ **인가 바로 다음이다.** 뒤로 밀면 그 사이의 조회가 이미 돌고 그 데이터가 RSC 페이로드에
   * 실린다 — 조건부 렌더가 차단이 아닌 것과 같은 축이다 (ARCHITECTURE §6.1, 실측 1.3MB).
   */
  it("보관 분기가 프로젝트 데이터 조회보다 앞이다", () => {
    for (const path of SITES) {
      const src = read(path);
      const branch = src.indexOf("if (archived)");
      const query = src.indexOf("getPrisma()");
      expect(branch, path).toBeGreaterThan(-1);
      if (query !== -1) expect(branch, path).toBeLessThan(query);
    }
  });

  /**
   * ⚠️ **설정 화면은 이 갈래를 안 만난다** — `project:settings`는 보관을 통과하는 유일한 permission이고,
   * 그것이 되돌리는 길이다. 여기에 분기를 두면 보관이 편도가 된다.
   */
  it("설정 화면은 보관 분기를 두지 않는다", () => {
    expect(read(SETTINGS)).not.toContain("ProjectArchived");
  });

  it("문구와 정책을 한 곳이 든다 — 화면이 각자 만들지 않는다", () => {
    for (const path of SITES) {
      expect(read(path), path).not.toContain("archive.empty");
    }
  });
});

/**
 * **마지막 임포트 실패가 설정 화면에 닿는다** (PRODUCT §7.8).
 *
 * 코드를 저장해 놓고 읽는 쪽을 안 만들면 실패가 통째로 무음이다 — 이 리포가 정확히 그 사고를
 * 밟았다 (POSTMORTEM 2026-09-06: 사유를 쿼리로 넘겨놓고 읽는 쪽이 없어 거부가 조용했다).
 */
describe("설정 화면 — 저장된 임포트 실패를 읽는다", () => {
  const src = read("components/settings/sources-card.tsx");

  it("컬럼을 select하고 판정 함수로 거른다 — DB 문자열을 직접 인덱싱하지 않는다", () => {
    expect(src).toContain("lastImportError");
    expect(src).toContain("isImportFailureCode");
  });

  it("사유를 사전이 낸 문장으로 그린다 — 파서 원문을 화면에 복제하지 않는다", () => {
    expect(src).toContain("importFailureMessage");
  });

  /** 첫 적재 전이면 이 화면의 버튼이, 이미 적재된 뒤면 대상 리포의 CI가 고칠 자리다. */
  it("복구 안내가 readiness로 갈린다", () => {
    expect(src).toContain("importRetry");
    expect(src).toContain("m.settings.sources.rerun");
  });
});

/**
 * **목록 둘이 새 집계 소비자다** (ARCHITECTURE §6.3).
 *
 * 쓰기는 성공했는데 목록만 옛 숫자를 보이는 부류를 막는다 — 이 리포가 이름으로 적어 둔 사고이고
 * (POSTMORTEM 2026-09-09), `/projects`가 **접두가 아니라 경로 하나**라 `/projects/new`가 매번
 * 따로 필요하다는 것이 그 회고의 요지다.
 */
describe("쓰기 경로가 목록 둘을 무효화한다", () => {
  it.each([
    ["번역 저장·Publish", "app/(edit)/actions.ts"],
    ["CI push", "app/api/push/route.ts"],
    ["CI 실패 보고", "app/api/push/failure/route.ts"],
    ["첫 적재", "app/(edit)/projects/actions.ts"],
  ])("%s", (_label, path) => {
    const src = read(path);
    expect(src).toContain('revalidatePath("/projects")');
    expect(src).toContain('revalidatePath("/projects/new")');
  });
});

/**
 * **설정 화면과 목록이 같은 술어를 쓴다** (PRODUCT §7.8).
 *
 * 두 화면이 같은 두 컬럼에서 정반대 사실을 말하면(목록 "Importing" / 설정 "실패"), 사용자는 어느
 * 쪽도 못 믿는다 — [다시 시도]를 누른 직후가 정확히 그 창이다 (2026-09-13 리뷰).
 */
describe("설정 화면 — 진행 중이 지난 실패를 이긴다", () => {
  it("활성 표면을 전부 읽고 행마다 검증된 판정 함수를 사용한다", () => {
    expect(read(SETTINGS)).toContain("surfaces: { where: { archivedAt: null }");
    expect(read("components/settings/sources-card.tsx")).toContain("planSurfaceImportStatus(source)");
    const planner = read("lib/import/surface-status.ts");
    expect(planner.indexOf("surface.lastImportStartedAt !== null")).toBeLessThan(planner.indexOf("isImportFailureCode(surface.lastImportError)"));
  });
});

/**
 * **모달 본문이 맨 위 요소의 포커스 링을 자르지 않는다** (2026-09-13 실측).
 *
 * 그 컨테이너는 스크롤·클리핑을 겸해 `overflow`를 뗄 수 없고, 링은 box-shadow라 요소 **밖으로**
 * 2px 퍼진다 — 위쪽 여백이 0이면 1단계 검색 필드의 링 상단이 통째로 잘린다. 네 단계의 첫 요소가
 * 전부 같은 자리라 필드마다 `ring-inset`을 덧대는 대신 여기서 2px을 내준다.
 */
it("온보딩 모달 본문이 포커스 링 자리를 남긴다", () => {
  const src = read("components/ui/modal.tsx");
  expect(src).toContain("px-8 pt-0.5 pb-6");
});
