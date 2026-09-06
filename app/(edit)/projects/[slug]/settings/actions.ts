"use server";

import { randomBytes } from "node:crypto";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getProjectAccess } from "@/lib/auth/query";
import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { signState, stateCookieName } from "@/lib/github-connect/state";
import { authorizeUrl } from "@/lib/github-connect/user";

/**
 * GitHub 계정 연결의 **나가는 쪽** (design §3.1). 돌아오는 쪽만 Route Handler다
 * (`app/api/github/callback/route.ts`) — 외부로 302하는 것은 Server Action이 쿠키를 심고
 * `redirect(절대 URL)`로 할 수 있고, 그래야 CLAUDE.md의 "내부 쓰기에 Route Handler 금지"와
 * 어긋나지 않는다.
 *
 * ⚠️ **화면은 6단계까지 없다.** 지금 이 Action을 부르는 것은 T4의 설정 화면이고, 그 전까지는
 * 도달 경로가 없다. 그래도 여기 두는 이유는 판정(`getProjectAccess`)과 쿠키 규칙이 라우트 옆에
 * 있어야 `entry-points.test.ts`가 그것을 세기 때문이다.
 */

const Input = z.object({ slug: z.string().min(1) });

/** 인가 화면까지 왕복하기에 충분하고, 방치된 탭이 오래 열려 있지 않을 만큼 짧다. */
const STATE_MINUTES = 10;

export type StartConnectResult = { ok: false; error: string };

/**
 * 성공하면 GitHub으로 `redirect`하므로 **반환하지 않는다.** 실패만 값으로 돌아온다 —
 * 거부는 값으로 흐른다 (ARCHITECTURE §6.3).
 */
export async function startGithubConnect(raw: { slug: string }): Promise<StartConnectResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { slug } = parsed.data;

  const session = await readSession();
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  const { userId } = session;

  const access = await getProjectAccess(getPrisma(), {
    userId,
    slug,
    permission: "project:settings",
  });
  if (access.status !== "ok") return { ok: false, error: access.status };

  // 프로토콜 판정을 프록시 헤더에서 한다 — Vercel 뒤에서는 요청 URL이 http로 보인다.
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  const nonce = randomBytes(32).toString("base64url");

  // ⚠️ **목적지 slug는 쿠키의 서명 안에 있다.** 쿼리로 실어 보내면 GitHub이 돌려줄 때 공격자가
  // 그 값을 정할 수 있다 — 서명 대상에 넣으면 open redirect 판정 자체가 필요 없다 (design §3.1).
  const cookieStore = await cookies();
  cookieStore.set(
    stateCookieName(secure),
    signState({
      userId,
      slug,
      nonce,
      expiresAt: new Date(Date.now() + STATE_MINUTES * 60 * 1000),
      secret: requireEnv("AUTH_SECRET"),
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_MINUTES * 60,
      // `__Host-` 접두와 짝이어야 한다 — 접두만 붙이고 Secure를 빼면 브라우저가 쿠키를 버린다.
      secure,
    },
  );

  // 쿼리에는 nonce만 간다. `redirect`는 던지므로 이 아래는 실행되지 않는다.
  redirect(authorizeUrl(nonce));
}
