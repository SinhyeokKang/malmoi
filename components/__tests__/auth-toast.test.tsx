import { expect, it, vi } from "vitest";

/**
 * 로그인·초대 화면의 토스트 **수명**을 잰다 (8-1b 회귀 — Codex 리뷰 2026-09-11 실측).
 *
 * ⚠️ **`duration: Infinity` 토스트는 화면을 떠나도 안 사라졌다.** `/signin?error=AccessDenied`에서
 * 토스트를 띄운 뒤 푸터의 Docs로 이동하면 **`/docs`에도 그 토스트가 남았다** — `Toaster`가 루트에
 * 있고 `AuthToast`가 언마운트 정리를 안 했다. 로그인과 무관한 화면에 로그인 거부 사유가 떠 있으면
 * 그것은 그 화면의 상태로 읽힌다.
 *
 * ⚠️ **렌더 테스트가 없는 리포라** `useEffect`를 가로채 **효과 자체를**
 * 돌린다 — 소스 스캔보다 강하고 DOM이 필요 없다. `normal-login.test.tsx`가 서버 컴포넌트를 함수로
 * 부르는 것과 같은 계보다.
 */
const toastCalls = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastCalls }));

type Effect = { fn: () => void | (() => void); deps: unknown[] | undefined };
const effects = vi.hoisted(() => [] as { fn: () => void | (() => void); deps: unknown[] | undefined }[]);
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (fn: () => void | (() => void), deps?: unknown[]) => {
      effects.push({ fn, deps });
    },
  };
});

import { AuthToast } from "@/components/signin/auth-toast";

/** 한 번 렌더한다 — 등록된 효과를 돌리고 정리 함수들을 돌려준다 (언마운트를 흉내낼 수 있게). */
function render(props: { error?: string; sessions?: string }): {
  registered: Effect[];
  unmount: () => void;
} {
  effects.length = 0;
  toastCalls.error.mockClear();
  toastCalls.success.mockClear();
  toastCalls.dismiss.mockClear();
  AuthToast(props);
  const registered = [...effects];
  const cleanups = registered.map((e) => e.fn());
  return {
    registered,
    unmount: () => {
      for (const c of cleanups) if (typeof c === "function") c();
    },
  };
}

it("오류 토스트가 화면을 떠날 때 사라진다", () => {
  const { unmount } = render({ error: "You can't sign in with this account." });
  expect(toastCalls.error).toHaveBeenCalledWith(
    "You can't sign in with this account.",
    expect.objectContaining({ id: "auth-error", duration: Infinity }),
  );

  toastCalls.dismiss.mockClear();
  unmount();
  expect(toastCalls.dismiss).toHaveBeenCalledWith("auth-error");
});

it("세션 회수 토스트도 화면을 떠날 때 사라진다 — 30초가 남아 있어도 그 화면의 것이다", () => {
  const { unmount } = render({ sessions: "revoked" });
  expect(toastCalls.success).toHaveBeenCalled();

  toastCalls.dismiss.mockClear();
  unmount();
  expect(toastCalls.dismiss).toHaveBeenCalledWith("auth-sessions");
});

/**
 * ⚠️ **같은 실패를 다시 시도하면 다시 떠야 한다.** 초대 수락은 실패 사유를 `?e=<사유>`로 넘기고
 * **같은 URL로 되돌아온다** — 사용자가 토스트를 닫고 [Accept]를 다시 눌러 같은 사유로 실패하면
 * `error` prop이 글자까지 같다. 의존성 배열로 묶어 두면 그 재시도가 **무음**이다(아무 일도 안
 * 일어난 것으로 보인다). 그래서 이 효과만 매 렌더 돈다.
 */
it("오류 효과가 의존성 배열에 묶여 있지 않다 — 같은 사유의 재시도가 무음이 되지 않는다", () => {
  const { registered } = render({ error: "This invitation is for a different account." });
  const shows = registered.filter((e) => e.deps !== undefined && e.deps.length === 0);
  // 언마운트 정리 효과(`[]`)는 있어야 하고, 오류를 띄우는 효과는 그것과 달라야 한다.
  expect(shows.length).toBe(1);
  expect(registered.some((e) => e.deps === undefined)).toBe(true);
});

it("사유가 없으면 아무것도 띄우지 않는다", () => {
  render({});
  expect(toastCalls.error).not.toHaveBeenCalled();
  expect(toastCalls.success).not.toHaveBeenCalled();
});
