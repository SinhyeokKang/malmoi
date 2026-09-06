import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { planAccountLink } from "@/lib/github-connect/account-link";
import type { ConnectError } from "@/lib/github-connect/message";
import { stateCookieNames, verifyState } from "@/lib/github-connect/state";
import { exchangeCode, getViewer, type UserTokens } from "@/lib/github-connect/user";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * GitHub이 브라우저를 되돌리는 지점 (design §3.1). **연결 흐름에서 Route Handler는 이것 하나다** —
 * 나가는 쪽은 Server Action이 쿠키를 심고 `redirect`한다.
 *
 * CLAUDE.md의 "내부 쓰기에 Route Handler를 새로 만들지 않는다"의 **예외가 아니라 반대편**이다:
 * 호출자가 우리 UI가 아니라 GitHub이 보낸 전체 페이지 내비게이션이고, Server Action은 돌아오는
 * 쪽을 받을 수 없다.
 *
 * ⚠️ **`middleware.ts`의 matcher에 넣지 않는다** (design §7.1). `/`로 302되면 `code`가 사라지고
 * 사용자에게는 "연결을 눌렀는데 로그인 화면으로 돌아왔다"로 보인다 — `/invite/[token]`을 뺀 것과
 * 같은 이유다. 대신 `requireUser()`를 지나고 `entry-points.test.ts`의 `GUARDS`가 그것을 센다.
 */

const PROVIDER = "github-app";

export async function GET(request: Request): Promise<NextResponse> {
  // 세션이 왕복 중 끊기면 `/`로 간다. `code`는 잃지만 재시도로 복구되고, 그때 맞는 목적지는
  // 로그인 화면이다.
  const { userId } = await requireUser();

  const url = new URL(request.url);
  // ⚠️ **두 이름을 다 본다.** 쿠키를 심는 Action은 `x-forwarded-proto`로 프로토콜을 판정하고 여기는
  // 요청 URL을 본다 — 다른 신호라 갈릴 수 있고, 하나만 찾으면 그때 연결이 통째로 죽는다.
  const cookieStore = await cookies();
  const cookie = stateCookieNames()
    .map((name) => cookieStore.get(name)?.value)
    .find((value) => value !== undefined);

  const state = verifyState({
    cookie,
    query: url.searchParams.get("state"),
    userId,
    now: new Date(),
    secret: requireEnv("AUTH_SECRET"),
  });

  // ⚠️ **state를 믿을 수 없으면 `slug`도 믿을 수 없다** — 목적지가 `/projects`이고, 그 화면이
  // `isConnectError`로 사유를 읽는다 (design §3.5). 사용자가 취소한 경우도 여기서는 갈래를 바꾸지
  // 않는다: 어디로 돌아가야 하는지 모르는 것이 먼저다.
  const denied = url.searchParams.get("error") !== null;
  if (state.status !== "ok") {
    return landing(request, null, denied ? "denied" : state.status);
  }
  const slug = state.slug;

  if (denied) return landing(request, slug, "denied");

  const code = url.searchParams.get("code");
  // code도 error도 없는 요청을 성공으로 읽지 않는다.
  if (code === null || code === "") return landing(request, slug, "exchange-failed");

  let tokens: UserTokens;
  let viewer: { id: string; login: string };
  try {
    tokens = await exchangeCode(code);
    viewer = await getViewer(tokens.accessToken);
  } catch (error) {
    // 재사용·만료된 code가 여기로 온다 — GitHub은 그것도 HTTP 200 본문으로 주고 라이브러리가 던진다.
    logFailure("exchange", error);
    return landing(request, slug, "exchange-failed");
  }

  let outcome: ConnectError | null;
  try {
    outcome = await linkAccount(getPrisma(), { userId, providerAccountId: viewer.id, tokens });
  } catch (error) {
    // DB 장애를 거부로 위장하지 않는다 (POSTMORTEM 2026-09-06).
    logFailure("link", error);
    return landing(request, slug, "unavailable");
  }

  return landing(request, slug, outcome);
}

/**
 * 실패를 **서버 로그에만** 남긴다 (`/api/pull`과 같은 형).
 *
 * ⚠️ 사용자에게는 `?e=`로 사유가 이미 가지만, 그것은 갈래 이름일 뿐 원인이 아니다. 로그가 없으면
 * "GitHub과 연결을 마치지 못했어요"라는 제보에 재현 말고는 길이 없다 — 2026-09-03 Vercel 첫 배포가
 * 정확히 그 상태였다(무엇이 없는지 추측해야 했다).
 *
 * **응답 본문에는 싣지 않는다.** 이 응답은 사용자 브라우저로 가고, 사유는 화면 문구가 이미 말한다.
 */
function logFailure(stage: string, error: unknown): void {
  const ref = randomUUID().slice(0, 8);
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[github-connect] ${ref} ${stage}: ${detail}`);
}

/**
 * `planAccountLink`의 판정을 쓰기로 옮긴다 (design §3.1의 표).
 *
 * ⚠️ **`upsert`를 쓰지 않는다.** 두 요청이 동시에 `existing: null`을 받으면 둘째의 update 분기가
 * 첫째의 `userId`를 덮어써 **연결 소유권이 이동한다.** 어댑터의 `linkAccount`도 `create`만 한다 —
 * 그 성질을 따르고 P2002를 재조회로 푼다.
 */
async function linkAccount(
  prisma: PrismaClient,
  input: { userId: string; providerAccountId: string; tokens: UserTokens },
): Promise<ConnectError | null> {
  const { userId, providerAccountId, tokens } = input;
  const key = { provider: PROVIDER, providerAccountId };

  const existing = await prisma.account.findUnique({
    where: { provider_providerAccountId: key },
    select: { userId: true },
  });
  // `userId`로는 `findUnique`가 성립하지 않는다 — unique가 `[provider, providerAccountId]`뿐이다.
  const current = await prisma.account.findFirst({
    where: { userId, provider: PROVIDER },
    select: { providerAccountId: true },
  });

  const plan = planAccountLink({ sessionUserId: userId, existing, current });

  // 남의 행은 토큰조차 갱신하지 않는다 (SAAS §5.5 — 자동 병합 금지).
  if (plan === "taken-by-other") return "taken-by-other";

  if (plan === "already-linked") {
    // `userId`를 data에 넣지 않는다 — 이미 내 행이고, 넣으면 경합에서 소유권이 움직인다.
    await prisma.account.update({ where: { provider_providerAccountId: key }, data: columns(tokens) });
    return null;
  }

  if (plan === "replace" && current !== null) {
    // User당 App 연결은 하나다 (design §2.3). 삭제와 생성이 갈리면 그 사이에 연결이 0인 창이 생긴다.
    await prisma.$transaction(async (tx) => {
      await tx.account.delete({
        where: { provider_providerAccountId: { provider: PROVIDER, providerAccountId: current.providerAccountId } },
      });
      await tx.account.create({ data: { userId, ...key, type: "oauth", ...columns(tokens) } });
    });
    return null;
  }

  try {
    await prisma.account.create({ data: { userId, ...key, type: "oauth", ...columns(tokens) } });
    return null;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // 졌다 — 먼저 만든 것이 누구 것인지 다시 본다. 내 것이면 같은 사람의 중복 클릭이다.
    const winner = await prisma.account.findUnique({
      where: { provider_providerAccountId: key },
      select: { userId: true },
    });
    return winner?.userId === userId ? null : "taken-by-other";
  }
}

/**
 * ⚠️ **`authentication`을 통째로 넘기지 않는다** — `pickTokens`가 이미 걸렀지만, 이 자리가 `Account`
 * 행의 모양을 정하는 곳이라 무엇이 저장되는지 한눈에 보이게 둔다.
 */
function columns(tokens: UserTokens): {
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
} {
  return {
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    // 어댑터 계약대로 **초** 단위 epoch다.
    expires_at: tokens.expiresAt === null ? null : Math.floor(tokens.expiresAt.getTime() / 1000),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/**
 * 착지 + state 쿠키 소거. **사유는 항상 `?e=`로 실린다** — 넘겨놓고 읽는 쪽을 안 만들면 거부가
 * 통째로 무음이다 (POSTMORTEM 2026-09-06). 읽는 쪽은 설정 화면과 `/projects` 둘이다.
 */
function landing(
  request: Request,
  slug: string | null,
  error: ConnectError | null,
): NextResponse {
  const path = slug === null ? "/projects" : `/projects/${slug}/settings`;
  const target = error === null ? path : `${path}?e=${error}`;
  const res = NextResponse.redirect(new URL(target, request.url));
  // 같은 state로 두 번 들어오지 못하게 한다. 실패 경로에서도 지운다 — 남겨 두면 다음 시도가
  // 옛 nonce와 대조된다. **읽을 때와 같이 두 이름을 다 지운다.**
  for (const name of stateCookieNames()) {
    // `__Host-` 쿠키는 `Secure` 없이 보내면 브라우저가 접두 규칙 위반으로 무시해 지워지지 않는다.
    res.cookies.set(name, "", { maxAge: 0, path: "/", secure: name.startsWith("__Host-") });
  }
  return res;
}
