import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { panelConstraints } from "@/lib/shell/panel-size";

/**
 * **모달 ②의 좌 후보 목록 ↔ 우 미리보기 구분선.**
 *
 * ⚠️ **그룹 폭을 잰다** (responsive-app A5) — 옛 판은 모달 1024 − `px-8` − 핸들 = 952를 고정 분모로 박았지만 `lg` 미만 시트에서는
 * 본문이 뷰포트를 따른다. 608 미만이면 순차 판이다(DOM 계약은 `files-sequential.test.tsx`).
 *
 * ⚠️ **소스로 센다** — 클래스·치수 배선은 jsdom이 못 잰다(폭이 0). 판 동작은 DOM 테스트가, 수치는 순수 테스트가 든다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const files = readFileSync(join(ROOT, "components/onboarding/steps/files.tsx"), "utf8");
const modal = readFileSync(join(ROOT, "components/ui/large-modal.tsx"), "utf8");

describe("② 파일 선택 — 패널 구분선", () => {
  it("좌우가 `ResizablePanel`이고 사이에 핸들이 있다", () => {
    expect(files).toMatch(/from "@\/components\/ui\/resizable"/);
    expect(files).toMatch(/<ResizablePanelGroup\b/);
    expect(files).toMatch(/<ResizableHandle\b/);
    expect([...files.matchAll(/<ResizablePanel\b/g)]).toHaveLength(2);
  });

  /**
   * ⚠️ **핸들 폭이 셸과 같은 8px이다** (2026-09-14 사용자 확정 — 옛 16에서 내렸다). 껍데기 본문은
   * `bodyDirection="row"`에서 `gap-4`를 드는데, 그 **안에** 핸들을 형제로 끼우면 간격이 16+8+16이
   * 된다. 그래서 좌·우·핸들을 하나의 `ResizablePanelGroup`으로 묶어 본문의 **자식 하나**로 만든다 —
   * 자식이 하나면 `gap`이 아무것도 하지 않으므로 껍데기는 손대지 않는다(`bodyDirection="row"`
   * 소비자는 이 화면 하나뿐이지만, 그 `gap`은 두 자식을 놓는 다음 화면의 계약이라 지우지 않는다).
   */
  it("핸들이 8px이고, 껍데기의 `gap-4`는 그대로 둔다", () => {
    // 순차 판에서는 `hidden`이 덧붙는다 — 폭 8은 `FILES_HANDLE_PX`와 같이 움직인다(files-layout 순수 테스트).
    expect(files).toMatch(/<ResizableHandle[^>]*className=\{cn\("w-2"/s);
    expect(modal).toMatch(/bodyDirection === "row"/);
    expect(modal).toMatch(/\bgap-4\b/);
  });

  /**
   * 좌측 치수는 셸 LNB와 같은 200 / 240 / 320이다. ⚠️ **분모가 고정 952가 아니다** (responsive-app A5) — `lg` 미만 LargeModal이
   * 뷰포트 폭 시트라 375에서 본문이 343이다. 그래서 body content box를 재서 `filesLayout`(`lib/onboarding/files-layout.ts`)에 넘기고,
   * 경계·clamp 수치는 그 순수 테스트(`lib/onboarding/__tests__/files-layout.test.ts`)가 든다. 여기서는 소비자가 그 판정만 쓰는지 센다.
   */
  it("좌측 치수가 잰 폭의 `filesLayout`에서 온다 — 고정 분모·셸 하한 의존이 없다", () => {
    expect(files).toMatch(/from "@\/lib\/onboarding\/files-layout"/);
    expect(files).toMatch(/filesLayout\(bodyWidth, chosen\.current\)/);
    expect(files).toMatch(/new ResizeObserver\(/);
    expect(files).not.toMatch(/FILES_PANEL_WIDTH/);
    expect(files).not.toMatch(/960 - 8/);
    expect(files).not.toMatch(/min-w-shell-min/);
    expect(files).not.toMatch(/panelConstraints\(/);
  });

  /** 옛 고정 폭이 남아 있으면 `Panel`이 계산한 폭을 덮는다. */
  it("좌측에 옛 `w-60 shrink-0`이 남아 있지 않다", () => {
    expect(files).not.toMatch(/\bw-60\b/);
  });

  /**
   * ⚠️ **`Panel`은 인라인으로 `overflow: hidden`을 건다** — 클래스가 아니라 라이브러리의
   * `getPanelStyle`이다. 좌측이 그걸 그대로 받으면 `w-full` 필드의 포커스 링(바깥 2px)이 좌우로
   * 잘린다 (2026-09-13 사용자 관측 — 그때는 `overflow-y-auto`가 원인이었고 이번엔 인라인이다).
   * 스크롤은 후보 목록(`RadioGroup`)만 든다.
   */
  it("좌측 패널이 인라인 `overflow: hidden`을 되돌린다 — 포커스 링이 잘린다", () => {
    expect(files).toMatch(/overflow: "visible"/);
    expect(files).not.toMatch(/<ResizablePanel[^>]*overflow-y-auto/s);
  });
});

/**
 * malmoi#88 — 1280×720에서 수동 지정 폼(315px)이 열리면 좌측의 **유일하게 줄어드는 자식**인 후보 목록이 24px로
 * 눌렸다(행은 69). 목록에 한 행의 바닥을 주고, 넘치는 몫은 **좌측 열 전체**가 스크롤한다.
 *
 * ⚠️ **스크롤은 패널이 아니라 안쪽 래퍼가 든다** — 패널에 `overflow-y-auto`를 두면 가로도 `auto`가 되어 `w-full` 필드의
 * 포커스 링이 잘린다(위 테스트). 래퍼는 `p-1`로 링 자리를 두고 `-m-1`로 자리를 되돌린다.
 * ⚠️ 새 프로젝트 ②도 같은 `FilesStep`이다 — 두 소비자가 같은 규칙을 받는다(RadioGroup 갈래도 바닥을 든다).
 */
describe("② 좌측 열 — 목록이 한 행 아래로 눌리지 않는다 (#88)", () => {
  it("좌측 열의 안쪽 래퍼가 스크롤하고 포커스 링 자리를 둔다", () => {
    expect(files).toMatch(/data-files-left[^>]*className="[^"]*\boverflow-y-auto\b[^"]*"/);
    expect(files).toMatch(/data-files-left[^>]*className="[^"]*-m-1\b[^"]*\bp-1\b[^"]*"/);
  });

  it("후보 목록(두 갈래 모두)이 한 행의 바닥을 든다", () => {
    const floors = [...files.matchAll(/min-h-\[4\.5rem\]/g)];
    expect(floors.length).toBeGreaterThanOrEqual(2);
    expect(files).toMatch(/<ul className="[^"]*min-h-\[4\.5rem\][^"]*"[^>]*aria-label=\{m\.newProject\.files\.candidates\}/);
    // ⚠️ `[^>]*`로 못 잇는다 — 그 여는 태그의 `onValueChange={value => …}`에 `>`가 있다.
    expect(files).toMatch(/<RadioGroup\b[\s\S]*?className="[^"]*min-h-\[4\.5rem\][^"]*">\{candidateList\}/);
  });
});
