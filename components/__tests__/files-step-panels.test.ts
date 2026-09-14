import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { panelConstraints } from "@/lib/shell/panel-size";

/**
 * **모달 ②의 좌 후보 목록 ↔ 우 미리보기 구분선.**
 *
 * ⚠️ **여기는 px→% 환산 훅이 필요 없다** — 그룹 폭이 **항상 720**이다: 모달 `max-w-[800px]` −
 * `px-8`(64) = 736, 핸들 16을 빼면 720. 셸(`components/shell/shell-panels.tsx`)만 뷰포트를 따라
 * 변해서 재야 한다.
 *
 * ⚠️ **소스로 센다** — 이 화면을 DOM으로 세우는 테스트가 없고(`onboarding-modal.test.tsx`는 껍데기만
 * 든다), `FilesStep`은 prop이 열 개가 넘는다. `manual-format-hint.test.ts`와 같은 계열이다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const files = readFileSync(join(ROOT, "components/onboarding/steps/files.tsx"), "utf8");
const modal = readFileSync(join(ROOT, "components/onboarding/modal.tsx"), "utf8");

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
    expect(files).toMatch(/<ResizableHandle[^>]*className="w-2"/s);
    expect(modal).toMatch(/bodyDirection === "row"/);
    expect(modal).toMatch(/\bgap-4\b/);
  });

  /**
   * 좌측 치수는 셸 LNB와 같은 200 / 240 / 320이고, 728 위에서 %로 굳는다.
   * ⚠️ **분모가 핸들과 함께 움직인다** — 736 − 8이다. 핸들을 8로 내리고 여기를 16으로 두면
   * 240이 242로 서고, 그 3px은 화면에서 안 보이므로 이 숫자가 유일한 방어선이다.
   */
  it("좌측이 200 / 240 / 320을 728 기준 %로 든다", () => {
    const expected = panelConstraints(728, { min: 200, default: 240, max: 320 });
    expect(expected).not.toBeNull();
    expect((expected?.defaultSize ?? 0) * 728 / 100).toBeCloseTo(240, 6);
    expect(files).toMatch(/panelConstraints\(\s*FILES_PANEL_WIDTH\s*,/);
    expect(files).toMatch(/const FILES_PANEL_WIDTH = 736 - 8/);
    expect(files).toMatch(/min: 200, default: 240, max: 320/);
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
