import { z } from "zod";

import { classifyGitLabFailure } from "@/lib/gitlab/transport";

import type { GitLabTokenError } from "./errors";

/**
 * **PAT 검증 판정** (gitlab-repositories design §2 "GitLab 연결" 2단계 · 실측 표). I/O 없는 순수 함수 — 껍데기(`./connection`)가
 * `GET /personal_access_tokens/self`의 결과를 값으로 넘긴다.
 *
 * ⚠️ **일시 장애를 "무효"로 접지 않는다** — 네트워크·5xx·429는 `unavailable`이다. 접으면 멀쩡한 토큰을 버리고 새로 만들게 한다.
 * ⚠️ **`last_used_ips`는 읽지 않는다** — IP 목록이라 저장하지 않는다(design §2 3단계). 스키마가 그 필드를 모른다.
 */

/** `/personal_access_tokens/self` 중 판정에 쓰는 필드만. 나머지(`last_used_ips` 등)는 버린다. */
const PatSelf = z.object({
  user_id: z.number().int().positive(),
  scopes: z.array(z.string()),
  expires_at: z.string().nullable(),
  active: z.boolean(),
  revoked: z.boolean(),
  granular: z.boolean().optional(),
  granular_scopes: z.unknown().optional(),
});

export type RemoteResult = { ok: true; body: unknown } | { ok: false; error: unknown };

export type PatVerdict =
  | { status: "ok"; gitlabUserId: string; scopes: string[]; expiresAt: Date | null }
  | { status: Exclude<GitLabTokenError, "account-mismatch"> }
  | { status: "unavailable" };

/** 레거시 PAT의 유일한 요구 스코프(D13). `read_api`·`write_repository`는 커밋·MR을 못 만든다(design §2 실측 표). */
export const REQUIRED_SCOPE = "api";

export function planPatVerification(result: RemoteResult): PatVerdict {
  if (!result.ok) {
    const failure = classifyGitLabFailure(result.error);
    // `/self`의 403은 스코프와 무관하게 토큰 쪽 거부다(문서 — self는 스코프 없이도 답한다). 404는 이 엔드포인트에 없다.
    return failure === "reauthorize" || failure === "scope-missing" || failure === "forbidden" ? { status: "token-invalid" } : { status: "unavailable" };
  }
  const parsed = PatSelf.safeParse(result.body);
  // 모양이 다르면 원격이 바뀐 것이다 — 토큰 탓으로 돌리지 않는다.
  if (!parsed.success) return { status: "unavailable" };
  const self = parsed.data;
  if (!self.active || self.revoked) return { status: "token-invalid" };
  // ⚠️ fine-grained 판정이 스코프보다 먼저다 — fine-grained 토큰의 `scopes`가 비어 "스코프 부족"으로 안내하면 레거시 PAT로 가라는 말이 빠진다.
  if (self.granular === true || self.granular_scopes !== undefined) return { status: "token-fine-grained" };
  if (!self.scopes.includes(REQUIRED_SCOPE)) return { status: "token-scope-missing" };
  const expiresAt = self.expires_at === null ? null : parseExpiry(self.expires_at);
  if (expiresAt === undefined) return { status: "unavailable" };
  return { status: "ok", gitlabUserId: String(self.user_id), scopes: [...self.scopes].sort(), expiresAt };
}

/** `expires_at`은 날짜(`2026-11-11`)이고 **그날 자정 UTC에 만료된다**(실측). 날짜가 아니면 `undefined`다. */
function parseExpiry(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const at = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(at.getTime()) ? undefined : at;
}

const GitLabUser = z.object({ id: z.number().int().positive(), username: z.string().min(1).max(255) });

/**
 * `GET /user` → 사용자명. ⚠️ **id가 `/self`의 `user_id`와 같아야 한다** — 두 호출 사이에 다른 토큰이 끼는 길은 없지만, 다르면 무엇을
 * 저장할지 모르는 상태라 받지 않는다.
 */
export function planGitLabUser(result: RemoteResult, gitlabUserId: string): { status: "ok"; username: string } | { status: "token-invalid" | "unavailable" } {
  if (!result.ok) return classifyGitLabFailure(result.error) === "reauthorize" ? { status: "token-invalid" } : { status: "unavailable" };
  const parsed = GitLabUser.safeParse(result.body);
  if (!parsed.success || String(parsed.data.id) !== gitlabUserId) return { status: "unavailable" };
  return { status: "ok", username: parsed.data.username };
}

/** 입력 PAT의 모양 — 공백·제어문자 없는 1~256자. 접두(`glpat-`)는 인스턴스 설정이라 요구하지 않는다. */
export function isTokenShaped(value: string): boolean {
  return value.length > 0 && value.length <= 256 && /^[\x21-\x7e]+$/.test(value);
}

/** 저장한 만료일이 지났는가 — 지났으면 호출 없이 재연결을 안내한다(design §2 사례 표 "토큰 만료"). 만료일은 그날 자정 UTC다. */
export function tokenExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}
