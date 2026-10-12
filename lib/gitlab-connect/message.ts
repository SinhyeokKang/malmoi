import { connectErrorMessage } from "@/lib/github-connect/message";
import type { Messages } from "@/lib/i18n";

import type { GitLabConnectError } from "./errors";

/**
 * GitLab 연결 실패 → 화면 문구 (gitlab-repositories tasks §5). `connectErrorMessage`와 같은 형 — `satisfies`가 갈래 누락을 컴파일에서
 * 막고, 모르는 값에는 **던지지 않고 GitLab 폴백**이다(GitHub 폴백은 "GitHub connection failed"라 GitLab 화면에서 거짓이다).
 *
 * ⚠️ 호스트 중립 거부(`repo-forbidden`·`repo-read-only`)는 GitHub 갈래와 **같은 문장**을 쓴다 — 같은 거부에 문구 두 벌 금지.
 * ⚠️ 일시 장애(`unavailable`)는 GitLab 문장이다 — "무효"로 접지 않는다(design §2).
 */
const SHARED = new Set(["repo-forbidden", "repo-read-only"] as const);

export function gitlabConnectErrorMessage(m: Messages, error: string): string {
  const gitlab = m.errors.gitlab satisfies Record<GitLabConnectError | "unavailable" | "fallback", string>;
  if (Object.hasOwn(gitlab, error)) return gitlab[error as keyof typeof gitlab];
  if ((SHARED as ReadonlySet<string>).has(error)) return connectErrorMessage(m, error as "repo-forbidden" | "repo-read-only");
  return gitlab.fallback;
}
