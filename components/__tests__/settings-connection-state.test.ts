import { describe, expect, it } from "vitest";

import { repositoryConnectionState } from "@/components/settings/connection-state";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { connectionProblem } from "@/lib/home/state";
import { STATE } from "@/lib/status/canon";

/**
 * **Settings 연결 행의 상태 키** (ux-drift-unify 1-Y15 · DESIGN §2.4 연결 행). 배지와 아이콘 칸이 같은 키에서 톤을 읽는다 —
 * 전엔 배지만 상태 톤이고 칸은 회색이었다. `lib/status/__tests__/cross-screen.test.ts`가 이 함수를 그대로 지난다(사본이 없다).
 */
describe("repositoryConnectionState", () => {
  it.each([
    ["ok", "connected"],
    ["repo-moved", "connected"],
    ["not-connected", "notConnected"],
    ["unpinned", "disconnected"],
    ["app-uninstalled", "disconnected"],
    ["installation-changed", "disconnected"],
    ["repo-replaced", "wrongRepository"],
    ["unknown", "couldNotCheck"],
  ] as const)("%s → %s", (status, key) => {
    expect(repositoryConnectionState(status, connectionProblem(status))).toBe(key);
  });

  it("끊김·미연결·다른 리포는 넘겨받은 판정을 따른다 — 판정을 다시 하지 않는다", () => {
    const status: ConnectionHealth["status"] = "unpinned";
    expect(repositoryConnectionState(status, "not-connected")).toBe("notConnected");
  });

  it("연결됨은 §2.4의 success · Connected다", () => {
    expect(STATE.connected).toMatchObject({ tone: "success", variant: "success", label: "Connected" });
  });
});
