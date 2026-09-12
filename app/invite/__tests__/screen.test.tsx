import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ row: vi.fn(), session: vi.fn(), viewer: vi.fn(), member: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: state.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ projectInvitation: { findUnique: state.row }, user: { findUnique: state.viewer }, projectMember: { findUnique: state.member } }) }));
vi.mock("../actions", () => ({ acceptInvitation: vi.fn() }));
// 저장 봉투 복호는 이 화면의 계약이 아니다 — `page.test.tsx`가 손상된 행의 갈래를 따로 센다.
vi.mock("@/lib/credentials/records", () => ({ decodeInvitation: (row: unknown) => row, decodeUser: (row: unknown) => row }));
vi.mock("@/lib/credentials/access", () => ({ credentialIO: (read: () => Promise<unknown>) => read() }));
vi.mock("@/components/signin/dot-field", () => ({ DotField: () => null }));
import Page from "../[token]/page";
import { m } from "@/lib/i18n";

const invitation = {
  id: "i1",
  projectId: "p1",
  email: "person@example.com",
  role: "EDITOR",
  acceptedAt: null,
  expiresAt: new Date("2099-01-01"),
  project: { name: "bugshot-2", locales: [{ code: "ko" }, { code: "ja" }] },
};

async function html(status: "ok" | "none", viewerEmail = "person@example.com") {
  state.member.mockResolvedValue(null);
  state.session.mockResolvedValue({ status, userId: "u1" });
  state.row.mockResolvedValue(invitation);
  state.viewer.mockResolvedValue({ id: "u1", email: viewerEmail });
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ token: "t" }), searchParams: Promise.resolve({}) }),
  );
}

/**
 * ⚠️ **320 컬럼의 제목 칸이 비어 있던 유일한 화면이었다** (account-linking spec §2) — `docs/DESIGN.md`가
 * 셸 밖 폼 컬럼에 `h1 text-2xl font-medium`을 **이미 요구한다**. 새 결정이 아니라 규칙 위반의 교정이다.
 */
it("제목이 선다 — 설명이 제목을 겸하지 않는다", async () => {
  for (const status of ["ok", "none"] as const) {
    const markup = await html(status);
    expect(markup).toContain("<h1");
    // `renderToStaticMarkup`이 아포스트로피를 이스케이프하므로 사전 값을 같은 규칙으로 접는다.
    expect(markup).toContain(m.invite.title.replace(/'/g, "&#x27;"));
  }
});

/**
 * ⚠️ **노출을 단계로 가른다** — 이 화면은 matcher 밖이라 링크를 가진 누구에게나 열린다. 그때 고를
 * 것은 "로그인할까"뿐이라 프로젝트 상세가 필요 없다.
 */
it("비로그인에는 프로젝트 카드가 없고 로그인에는 있다", async () => {
  const signedOut = await html("none");
  expect(signedOut).not.toContain("bugshot-2");
  // ⚠️ **`/signin`과 같은 문구·같은 버튼이다** — 이 화면만 다른 말을 쓰던 드리프트를 2026-09-12에 걷었다.
  expect(signedOut).toContain(m.signIn.github);
  expect(signedOut).toContain(m.signIn.google);

  const signedIn = await html("ok");
  expect(signedIn).toContain("bugshot-2");
  expect(signedIn).toContain(m.projects.role.EDITOR);
  // 국기는 CSS background-image다 — 번역자가 자기 언어가 있는지 보는 값이다.
  expect(signedIn).toContain("/flags/kr.svg");
});

/**
 * ⚠️ **둘째 문장이 이 기능으로 거짓이 됐다** — 병합하면 다른 수단으로 들어와도 수락된다.
 * 실제 거부는 `email-mismatch` 갈래가 말한다 (design §6).
 */
it("설명이 다른 계정으로는 안 된다고 말하지 않는다", async () => {
  const markup = await html("ok");
  expect(markup).toContain("p***@example.com");
  expect(markup).not.toContain("won&#x27;t accept it");
  expect(markup).not.toContain("won't accept it");
});

/** ⚠️ **숫자를 싣지 않는다** — 키 수·멤버 수는 수락 여부를 바꾸지 않고 규모만 새게 한다. */
it("프로젝트 카드가 규모를 노출하지 않는다", async () => {
  const source = (await import("node:fs")).readFileSync(
    (await import("node:path")).join(process.cwd(), "components/invite/project-card.tsx"),
    "utf8",
  );
  for (const forbidden of ["memberCount", "keyCount", "_count"]) expect(source).not.toContain(forbidden);
});

const renderPage = async (e?: string) => renderToStaticMarkup(await Page({ params: Promise.resolve({ token: "t" }), searchParams: Promise.resolve({ e }) }));
const escaped = (value: string) => value.replace(/'/g, "&#x27;");

it.each([
  { name: "sign-in", status: "none", email: "person@example.com", member: false, other: 0, accept: 0 },
  { name: "accept", status: "ok", email: "person@example.com", member: false, other: 0, accept: 1 },
  { name: "wrong-account mismatch", status: "ok", email: "other@example.com", member: false, other: 1, accept: 0 },
  { name: "wrong-account member", status: "ok", email: "person@example.com", member: true, other: 1, accept: 0 },
  { name: "blocked", status: "unavailable", email: "person@example.com", member: false, other: 0, accept: 0 },
])("$name의 CTA를 함께 고른다", async ({ status, email, member, other, accept }) => {
  state.session.mockResolvedValue({ status, userId: "u1" });
  state.row.mockResolvedValue(invitation);
  state.viewer.mockResolvedValue({ id: "u1", email });
  state.member.mockResolvedValue(member ? { userId: "u1" } : null);
  const markup = await renderPage();
  expect(markup.split(m.invite.otherAccount).length - 1).toBe(other);
  expect(markup.split(m.invite.accept).length - 1).toBe(accept);
  if (other) {
    const notice = member ? "already-member" : "email-mismatch";
    expect(markup).toContain(escaped(m.errors.invite[notice]));
    expect(markup.indexOf('role="alert"')).toBeLessThan(markup.indexOf("bugshot-2"));
  }
});

it("비로그인과 막힌 초대는 멤버를 조회하지 않는다", async () => {
  for (const row of [invitation, null, { ...invitation, expiresAt: new Date(0) }, { ...invitation, acceptedAt: new Date() }]) {
    for (const status of ["none", "ok"] as const) {
      if (row === invitation && status === "ok") continue;
      state.member.mockClear(); state.viewer.mockClear();
      state.row.mockResolvedValue(row);
      state.session.mockResolvedValue({ status, userId: "u1" });
      await renderPage();
      expect(state.member).not.toHaveBeenCalled();
      expect(state.viewer).not.toHaveBeenCalled();
    }
  }
});

it("멤버 조회는 초대의 프로젝트와 세션 사용자 PK로 좁힌다", async () => {
  await html("ok");
  expect(state.member).toHaveBeenCalledWith({ where: { projectId_userId: { projectId: "p1", userId: "u1" } }, select: { userId: true } });
});

it("사용자 또는 멤버 조회 장애는 토큰 보존 재시도만 낸다", async () => {
  for (const query of [state.viewer, state.member]) {
    await html("ok");
    query.mockRejectedValueOnce(new Error("offline"));
    const markup = await renderPage();
    expect(markup).toContain('action="/invite/t"');
    expect(markup).toContain(m.common.retry);
    expect(markup).not.toContain(m.invite.accept);
    expect(markup).not.toContain(m.invite.otherAccount);
    expect(markup).not.toContain("bugshot-2");
  }
});

it.each(["unauthorized", "unavailable"] as const)("%s도 초대의 인라인 알림이다", async (e) => {
  for (const status of ["none", "ok"] as const) {
    await html(status);
    const markup = await renderPage(e);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(escaped(m.errors.invite[e]));
  }
});
