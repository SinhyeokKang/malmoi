import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";

/**
 * `/account`와 프로젝트 설정이 함께 읽는 연결 상태 (6b-4).
 *
 * ⚠️ **401은 장애가 아니라 인가 철회다** (2026-09-19 프로덕션 실측). 사용자가 GitHub에서 App 인가를
 * 취소하면 저장된 토큰은 **만료 전**이라 `ensureUserToken`이 `ok`를 주고, `getViewer`의 401이 유일한
 * 신호다. `unavailable`로 접으면 화면이 "잠시 뒤 다시"를 말하면서 **컨트롤을 하나도 세우지 않아**
 * 사용자가 다시 연결할 수도, 해제할 수도 없는 자리에 갇힌다 — 다음 호출도 같은 401이라 영영 풀리지 않는다.
 * `listConnectableRepos`의 `listFailure`가 같은 이유로 401을 `reauthorize`로 올린다.
 */

const hoisted = vi.hoisted(() => ({ ensureUserToken: vi.fn(), getViewer: vi.fn() }));
vi.mock("../token-store", () => ({ ensureUserToken: hoisted.ensureUserToken }));
vi.mock("../user", () => ({ getViewer: hoisted.getViewer }));

const { loadAccountView } = await import("../account-view");
const prisma = {} as PrismaClient;
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.ensureUserToken.mockResolvedValue({ status: "ok", accessToken: "user-token" });
  hoisted.getViewer.mockResolvedValue({ id: "gh-1", login: "octocat" });
});

describe("토큰 상태는 그대로 흐른다", () => {
  it.each([
    ["not-connected", { status: "ok", login: null }],
    ["reauthorize", { status: "reauthorize" }],
    ["unavailable", { status: "unavailable" }],
  ] as const)("%s", async (status, view) => {
    hoisted.ensureUserToken.mockResolvedValue({ status });

    expect(await loadAccountView(prisma, "u1")).toEqual(view);
    expect(hoisted.getViewer).not.toHaveBeenCalled();
  });

  it("연결돼 있으면 핸들을 준다", async () => {
    expect(await loadAccountView(prisma, "u1")).toEqual({ status: "ok", login: "octocat" });
  });
});

describe("조회 실패", () => {
  it("401은 reauthorize다 — 인가 철회는 영구 상태이고 화면은 다시 연결할 문을 세워야 한다", async () => {
    hoisted.getViewer.mockRejectedValue(httpError(401));

    expect(await loadAccountView(prisma, "u1")).toEqual({ status: "reauthorize" });
  });

  it("그 밖의 실패는 unavailable이다 — 일시 장애를 영구 거부로 위장하지 않는다", async () => {
    hoisted.getViewer.mockRejectedValue(httpError(503));

    expect(await loadAccountView(prisma, "u1")).toEqual({ status: "unavailable" });
  });
});
