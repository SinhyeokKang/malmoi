import "server-only";

import { randomUUID } from "node:crypto";

import type { Role } from "@/lib/auth/permission";
import { deploymentMode } from "@/lib/deployment/mode";
import { optionalEnv } from "@/lib/env";

import { readInvitationEmailConfig, type InvitationEmailConfig } from "./config";
import { buildInvitationEmail } from "./message";
import { judgeBatchResponse, type BatchResponse, type EmailOutcome } from "./result";

/**
 * Resend `/emails/batch` 호출 (design §4). **commit 뒤 한 번 await한다** — 잠금 안 네트워크 호출도,
 * fire-and-forget도 없다. 자동 재시도는 0회다: 결과를 모르는 요청을 다시 보내면 이전 링크가 만료된다.
 */

const ENDPOINT = "https://api.resend.com/emails/batch";
const TIMEOUT_MS = 10_000;

export function readInvitationEmailConfigFromEnv(): InvitationEmailConfig {
  const config = readInvitationEmailConfig(
    {
      RESEND_API_KEY: optionalEnv("RESEND_API_KEY"),
      INVITATION_EMAIL_FROM: optionalEnv("INVITATION_EMAIL_FROM"),
      INVITATION_EMAIL_ORIGIN: optionalEnv("INVITATION_EMAIL_ORIGIN"),
    },
    // hosted는 Vercel이 주입한 환경과 대조하고(로컬은 비어 있어 localhost만), self-hosted는 설정 origin을 쓴다.
    deploymentMode(),
  );
  /*
   * 화면은 "email-unavailable" 하나라 운영자가 원인을 찾을 곳이 이 줄뿐이다(self-hosting design §2) — 형식은 맞지만 공급자가
   * 거부하는 키는 preflight를 지나므로. ⚠️ 사유 코드만 — 키·발신자·origin 값을 싣지 않는다.
   */
  if (config.status === "unavailable") console.error(`[invite-email] config unavailable reason=${config.reason}`);
  return config;
}

/** ⚠️ 던지지 않는다 — 발송 실패가 이미 commit한 초대를 생성 실패로 바꾸면 안 된다. */
export async function sendInvitationEmails(
  config: Extract<InvitationEmailConfig, { status: "ready" }>,
  project: { name: string; image: string | null },
  messages: readonly { to: string; token: string; role: Role }[],
): Promise<EmailOutcome> {
  const body = messages.map((m) => buildInvitationEmail({ from: config.from, origin: config.origin, to: m.to, token: m.token, project, role: m.role }));
  let response: BatchResponse;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        // 한 요청 안의 네트워크 중복만 막는다 — 새 발급 요청끼리의 중복을 막는 장치가 아니다.
        "Idempotency-Key": `invitation-batch/${randomUUID()}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // 본문이 JSON이 아니어도 상태 코드로 판정한다 — 2xx면 id를 확인할 수 없으니 unknown이 된다.
    }
    response = { kind: "http", status: res.status, body: parsed };
  } catch {
    response = { kind: "failed" };
  }

  const outcome = judgeBatchResponse(response, messages.length);
  // ⚠️ 공급자 오류 원문을 찍지 않는다 — 주소·링크를 되울릴 수 있다. 상태 코드와 개수만 남긴다.
  if (outcome !== "accepted") {
    const status = response.kind === "http" ? `http-${response.status}` : "network";
    console.error(`[invite-email] batch ${outcome} ${status} count=${messages.length}`);
  }
  return outcome;
}
