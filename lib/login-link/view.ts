import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import { maskEmail } from "@/lib/auth/email";
import { decodeUser } from "@/lib/credentials/records";

import {
  challengePrefix,
  checkChallenge,
  LOGIN_PROVIDERS,
  parseChallengeIdentifier,
  pickLoginAccount,
  type LinkDest,
  type LoginProvider,
} from "./policy";
import { challengeTokenHash } from "./store";

/**
 * 병합 화면이 **보일 값만** 만든다.
 *
 * ⚠️ **노출 최소화**: 비로그인에게 가는 것은 마스킹한 이메일 · provider 이름 · 가입 월뿐이다.
 * 이름·아바타 이미지·프로젝트 수는 싣지 않는다 — 그 이메일을 아는 사람이 남의 계정을 열람하는
 * 길이 된다.
 *
 * ⚠️ **클라이언트에서 가리는 것이 아니라 서버가 안 돌려준다** — 가리면 원문이 이미 RSC 페이로드에
 * 있다 (`loadMembers`와 같은 규칙, sec-audit 발견 4).
 */
export type ChallengeView = {
  emailLabel: string;
  /**
   * 표시 이름과 프로필 이미지 (2026-09-12 사용자 결정).
   *
   * ⚠️ **처음엔 싣지 않기로 했다가 뒤집혔다.** 근거: 이 화면에 도달하려면 요청자가 **이미 그
   * 주소를 IdP에서 검증받았어야** 한다(ARCHITECTURE §6.2) — 이름을 가려도 그 사람은 이미 주소를 안다.
   * 가리는 쪽의 대가가 더 컸다: 아바타 이니셜이 마스킹한 주소에서 나와 **셸과 다른 글자·다른
   * 색**이 되고, 자기 계정인지 알아보라고 만든 카드가 오히려 남의 계정처럼 보였다.
   *
   * ⚠️ **남는 노출은 훔친 challenge URL이다** — 그 URL을 얻은 사람이 이름·아바타를 본다
   * (design ⑧이 그 시나리오를 상정한다). 붙이려면 여전히 기존 provider의 OAuth를 통과해야 하므로
   * 계정이 열리지는 않는다. 프로젝트 수·멤버 목록 같은 **계정 내용**은 계속 싣지 않는다.
   */
  name: string | null;
  image: string | null;
  /** 확인에 쓸 수단 — 이 계정을 만든 쪽이다. */
  have: LoginProvider;
  /** 방금 시도해 거부된 수단. */
  pending: LoginProvider;
  joined: Date;
  dest: LinkDest;
};

export async function loadChallengeView(
  prisma: PrismaClient,
  challengeToken: string,
  now: Date,
): Promise<ChallengeView | null> {
  const row = await prisma.verificationToken.findFirst({
    where: { token: challengeTokenHash(challengeToken), identifier: { startsWith: challengePrefix() } },
  });
  const challenge = row === null ? null : parseChallengeIdentifier(row.identifier);
  if (row === null || challenge === null) return null;

  const accounts = await prisma.account.findMany({
    where: { userId: challenge.userId, provider: { in: [...LOGIN_PROVIDERS] } },
    select: { provider: true },
  });
  const have = pickLoginAccount(accounts);
  if (have === null) return null;
  // ⚠️ **만료를 이 화면으로 말하지 않는다** — `null`을 내고 호출부가 `/signin`으로 되돌린다.
  if (checkChallenge(challenge, { confirming: have.provider, expires: row.expires, now }) !== "ok") return null;

  const stored = await prisma.user.findUnique({
    where: { id: challenge.userId },
    select: { id: true, email: true, emailLookup: true, name: true, image: true, createdAt: true },
  });
  if (stored === null) return null;

  const user = decodeUser(stored);
  return {
    emailLabel: maskEmail(user.email),
    name: user.name ?? null,
    image: user.image ?? null,
    have: have.provider as LoginProvider,
    pending: challenge.provider,
    joined: stored.createdAt,
    dest: challenge.dest,
  };
}
