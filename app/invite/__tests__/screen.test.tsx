import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({ row: vi.fn(), session: vi.fn() }));
vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/auth/read-session", () => ({ readSession: state.session }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ projectInvitation: { findUnique: state.row } }) }));
vi.mock("../actions", () => ({ acceptInvitation: vi.fn() }));
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

async function html(status: "ok" | "none") {
  state.session.mockResolvedValue({ status });
  state.row.mockResolvedValue(invitation);
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
    expect(markup).toContain(m.invite.title);
  }
});

/**
 * ⚠️ **노출을 단계로 가른다** — 이 화면은 matcher 밖이라 링크를 가진 누구에게나 열린다. 그때 고를
 * 것은 "로그인할까"뿐이라 프로젝트 상세가 필요 없다.
 */
it("비로그인에는 프로젝트 카드가 없고 로그인에는 있다", async () => {
  const signedOut = await html("none");
  expect(signedOut).not.toContain("bugshot-2");
  expect(signedOut).toContain(m.invite.github);

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
