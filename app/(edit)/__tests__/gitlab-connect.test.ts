import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHarness, sessionFor } from "./harness";

/**
 * **GitLab 연결 Server Action의 세션 경계** (gitlab-repositories tasks §2 B2 — "연결 흐름 도중 세션 만료"). 연결 흐름은 Action 여럿(① 목록 → PAT 입력 →
 * 재연결)을 잇는다 — Action마다 **세션을 다시 읽고**, 만료됐으면 원격 호출·쓰기 0으로 `unauthorized`를 값으로 돌려준다(입력을 보존한다 — 예외 J).
 * 코어의 동작(봉투·참조·권한)은 `lib/gitlab-connect/__tests__/connection.integration.ts`가 격리 PG로 잰다.
 */

const hoisted = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  /** 세션 저장소 장애 — `auth.ts`의 `logger.error`처럼 `noteAuthError`를 부르고 `null`을 돌려준다. */
  outage: false,
  prisma: undefined as unknown,
  fetch: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/auth", async () => {
  const { noteAuthError } = await import("@/lib/auth/outage");
  return { auth: async () => {
    if (!hoisted.outage) return hoisted.session;
    noteAuthError(Object.assign(new Error("session store down"), { type: "SessionTokenError" }));
    return null;
  } };
});
vi.mock("@/lib/db", () => ({ getPrisma: () => hoisted.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: hoisted.revalidatePath }));

const { connectGitLab, disconnectGitLab } = await import("../account/actions");
const { reconnectGitLabRepository } = await import("../projects/[slug]/settings/actions");
const { listConnectableGitLabRepos } = await import("../projects/actions");

let db: ReturnType<typeof createHarness>;

beforeEach(() => {
  vi.clearAllMocks();
  db = createHarness({
    projects: [{ id: "p1", slug: "acme", name: "Acme", repoHost: "gitlab", installationId: null, gitlabConnectionId: "conn-a", repositoryId: "87515176" }],
    members: [{ projectId: "p1", userId: "u-owner", role: "OWNER" }],
    users: [{ id: "u-owner", email: "o@a.com" }],
  });
  hoisted.prisma = db.prisma;
  hoisted.session = sessionFor("u-owner");
  hoisted.outage = false;
  vi.stubGlobal("fetch", hoisted.fetch);
});

describe("세션 — Action마다 다시 읽는다", () => {
  it("⚠️ 흐름 도중 세션이 만료되면 다음 Action이 unauthorized다 — GitLab 호출·쓰기 0", async () => {
    hoisted.session = null;
    expect(await listConnectableGitLabRepos()).toEqual({ ok: false, error: "unauthorized" });
    expect(await connectGitLab({ token: "glpat-x" })).toEqual({ ok: false, error: "unauthorized" });
    expect(await reconnectGitLabRepository({ slug: "acme" })).toEqual({ ok: false, error: "unauthorized" });
    expect(await disconnectGitLab()).toEqual({ ok: false, error: "unauthorized" });
    expect(hoisted.fetch).not.toHaveBeenCalled();
    expect(db.spies.updateProject).not.toHaveBeenCalled();
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it("입력 스키마(zod)가 틀리면 세션을 읽기 전에 invalid input이다 — 세션이 없어도 unauthorized가 아니다", async () => {
    hoisted.session = null;
    expect(await connectGitLab({ token: 42 } as never)).toEqual({ ok: false, error: "invalid input" });
    expect(await reconnectGitLabRepository({ slug: "" })).toEqual({ ok: false, error: "invalid input" });
    expect(hoisted.fetch).not.toHaveBeenCalled();
  });

  it("PAT 모양(공백·제어문자)은 세션 뒤 코어가 원격 호출 전에 거부한다 — 세션이 없으면 unauthorized가 먼저다", async () => {
    expect(await connectGitLab({ token: "glpat bad" })).toEqual({ ok: false, error: "invalid input" });
    hoisted.session = null;
    expect(await connectGitLab({ token: "glpat bad" })).toEqual({ ok: false, error: "unauthorized" });
    expect(hoisted.fetch).not.toHaveBeenCalled();
  });
});

/**
 * **세션 저장소 장애는 GitLab 장애와 다른 코드다** (감사 U6 · 리뷰 C ⚪6). 코어(`connectGitLabAccount`)의 `unavailable`은 GitLab·DB 장애이고 폼이
 * "GitLab didn't answer"로 말한다 — 세션을 못 읽은 것까지 그 코드로 접으면 GitLab을 부르지도 않았는데 GitLab 탓이 된다.
 */
describe("connectGitLab — 세션 저장소 장애", () => {
  it("세션을 못 읽으면 session-unavailable이고 GitLab·DB를 부르지 않는다 — 로그아웃(unauthorized)과도 다르다", async () => {
    hoisted.outage = true;
    expect(await connectGitLab({ token: "glpat-abcdefghijklmnopqrst" })).toEqual({ ok: false, error: "session-unavailable" });
    expect(hoisted.fetch).not.toHaveBeenCalled();
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });
});
