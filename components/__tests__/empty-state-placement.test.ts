import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

/**
 * 빈 상태가 **패널 세로 중앙**에 서는지를 소스로 센다 (DESIGN §6.4·§10 — 번역 화면 빈 상태 넷).
 *
 * ⚠️ **`EmptyState`는 수직 중앙을 하지 않는다** — 표 안(`logs`·로케일·대기 초대)에서도 쓰여서
 * 자리마다 다르고, `flex-1`은 **호출부가 든다**는 것이 그 컴포넌트의 계약이다. 그래서 이 축은
 * 호출부마다 따로 고정해야 하고, 화면에만 있으면 다음 리팩터가 조용히 지운다.
 *
 * ⚠️ **jsdom으로는 못 잰다** — 레이아웃 계산이 없어 "가운데 있나"가 값으로 안 나온다. 그래서
 * 구조가 아니라 **클래스**를 센다.
 *
 * ⚠️ **`PanelHeader`가 없는 화면만 대상이다.** 로케일·이력·대기 초대는 제목 줄 아래 본문 열 안에서
 * **표 대신** 서고 형제(설정 Card)도 있어, 중앙에 띄우면 그 형제와 겹쳐 읽힌다 (§479).
 */
const read = (path: string): string => readFileSync(path, "utf8");

it("readiness·보관 빈 상태가 패널 세로 중앙이다", () => {
  for (const path of ["components/project-not-ready.tsx", "components/project-archived.tsx"]) {
    const src = read(path);
    expect(src, path).toContain("flex-1");
    expect(src, path).toContain("items-center");
    expect(src, path).toContain("justify-center");
    // `PanelBody`의 안쪽 래퍼가 `flex flex-col`이어야 자식의 `flex-1`이 높이를 받는다.
    expect(src, path).toMatch(/PanelBody className="flex flex-col"/);
  }
});
