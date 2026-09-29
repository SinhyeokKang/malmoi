import { planApiTokenIssue, type ApiTokenIssuePlan } from "@/lib/mcp/issue-plan";

/**
 * 동의 판정 (mcp-oauth design §3). **개인 토큰 발급과 같은 판정을 쓴다** — 어휘·만료·범위가 갈리면 동의 화면과 `/mcp`가 다른 권한을
 * 말한다(spec 조건 4). 결과의 만료가 **연결 수명**이다 — access의 짧은 수명이 아니다.
 *
 * ⚠️ 역할을 입력으로 받지 않는다 — 동의 시 역할로 선택을 막지 않고, 실행 시 현재 역할 ∩ grant로 판정한다.
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */

export type ConsentPlan =
  | { status: "ok"; grants: Extract<ApiTokenIssuePlan, { status: "ok" }>["grants"]; allProjects: boolean; projectIds: string[]; connectionExpiresAt: Date }
  | Extract<ApiTokenIssuePlan, { status: "invalid" }>;

export function planConsent(input: Parameters<typeof planApiTokenIssue>[0]): ConsentPlan {
  const plan = planApiTokenIssue(input);
  if (plan.status !== "ok") return plan;
  const { expiresAt, ...rest } = plan;
  return { ...rest, connectionExpiresAt: expiresAt };
}
