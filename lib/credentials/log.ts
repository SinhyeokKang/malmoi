import "server-only";
import { randomUUID } from "node:crypto";
import { classifyFailure } from "@/lib/failure";
import { CredentialError } from "./crypto";

/**
 * 자격증명 경로의 실패를 **서버 로그에 한 줄** 남긴다 (launch-readiness L5.1, POSTMORTEM 2026-09-14 후속).
 *
 * 이 경로의 실패는 전부 `CredentialError` 하나로 접혀 화면엔 "Unavailable"만 간다 — PII 키 하나가 빠져 로그인·초대가
 * 통째로 죽어도 로그가 0줄이었다. 그래서 **원인이 사라지는 자리**(남의 오류를 `CredentialError`로 바꾸는 catch)에서 찍는다.
 *
 * ⚠️ **원문은 안 남긴다** — Prisma 인자·암호문이 메시지에 실린다. `classifyFailure`가 우리 오류(`MissingEnvError` — 변수
 * **이름**만 담는다)는 메시지를, 남의 오류는 분류 한 낱말을 준다(`lib/github-connect/log.ts`와 같은 규칙).
 * ⚠️ **이미 `CredentialError`면 안 찍는다** — 안쪽 자리가 찍었거나 일부러 던진 거부다. 둘째 줄은 원인을 더하지 않는다.
 * 바깥 경계(`auth.ts`의 `signIn`)는 `logCredentialBoundary`로 **항상** 찍어 일부러 던진 거부도 최소 한 줄이 남는다.
 */
export function logCredentialFailure(stage: string, error: unknown): void {
  if (error instanceof CredentialError) return;
  logCredentialBoundary(stage, error);
}

export function logCredentialBoundary(stage: string, error: unknown): void {
  const failure = classifyFailure(error);
  console.error(`[credentials] ${randomUUID().slice(0, 8)} ${stage}: ${failure.safe ? failure.message : failure.detail}`);
}
