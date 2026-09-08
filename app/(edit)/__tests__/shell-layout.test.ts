import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **셸은 뷰포트에 고정되고 콘텐츠 컬럼만 스크롤한다** (DESIGN §6.5 — GitLab super sidebar 형의 전제).
 *
 * ⚠️ 회귀 (malmoi#13, 2026-09-08 `/bugshot-qa` preview 실측): 셸 루트가 `min-h-svh`였고 `aside`·`header`가
 * `position: static`이라, 콘텐츠가 뷰포트보다 길면 **문서 전체가 스크롤되면서 셸이 함께 밀려 올라갔다.**
 * 24키짜리 번역 화면에서도 `scrollHeight` 1483 / 뷰포트 775였고, **Sign out(top 1411)과
 * Collapse sidebar(top 1443)가 스크롤 전부터 화면 밖**이었다 — 사이드바 접기는 그 버튼이 유일한 경로다.
 *
 * ⚠️ **렌더 테스트를 두지 않는 리포라**(translation-ui design §4) 소스로 센다. `focus-ring`·`globals-css`와
 * 같은 계열이고, 이 결함의 조건이 정확히 **레이아웃 클래스 조합**이라 그 층에서 판정이 성립한다.
 * 실물 확인은 `/bugshot-qa`가 계속 든다.
 */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const layout = readFileSync(join(ROOT, "app/(edit)/layout.tsx"), "utf8");
const sidebar = readFileSync(join(ROOT, "components/shell/sidebar.tsx"), "utf8");

describe("셸 레이아웃 — 뷰포트 고정", () => {
  it("셸 루트가 뷰포트 높이에 **고정**된다 — `min-h-svh`는 문서를 늘린다", () => {
    // `min-h-svh`는 "최소 한 화면"이라 콘텐츠가 길면 컨테이너가 함께 자란다. 그러면 그 안의
    // `aside`가 stretch로 문서 높이만큼 늘어나 하단 항목이 화면 밖으로 나간다.
    expect(layout).not.toMatch(/className="[^"]*\bmin-h-svh\b/);
    expect(layout).toMatch(/className="[^"]*\bh-svh\b/);
  });

  it("루트가 넘침을 가둔다 — 문서가 스크롤되면 셸이 딸려 올라간다", () => {
    expect(layout).toMatch(/className="flex h-svh[^"]*\boverflow-hidden\b/);
  });

  it("콘텐츠 컬럼이 자기 안에서 스크롤한다", () => {
    expect(layout).toMatch(/\boverflow-y-auto\b/);
  });

  it("사이드바도 자기 안에서 스크롤한다 — 항목이 늘어도 문서를 밀지 않는다", () => {
    expect(sidebar).toMatch(/\boverflow-y-auto\b/);
  });

  /**
   * ⚠️ **`xl` 미만의 오버레이는 이 규칙 밖이다** — 그때 `aside`는 `fixed inset-y-0`이라 부모 높이와
   * 무관하게 뷰포트를 채운다. 그 클래스가 사라지면 오버레이가 문서 높이만큼 길어진다.
   */
  it("좁은 화면의 오버레이가 뷰포트에 붙는다", () => {
    expect(sidebar).toMatch(/\bfixed inset-y-0\b/);
  });
});
