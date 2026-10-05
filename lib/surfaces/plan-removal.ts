import { accessErrorMessage, type AccessError } from "@/lib/auth/message";
import type { Messages } from "@/lib/i18n";

import { compareSurfaces } from "./plan";

/**
 * 소스 제거 판정 (sources-add-remove — ARCHITECTURE §5.9). 화면의 사전 차단과 서버 거부가 이 하나를 지난다.
 *
 * ⚠️ **보관이 맨 앞이다** — 보관된 프로젝트는 Restore만 받는다(PRODUCT §7.9). 그다음 대상 존재, 진행 중 적재, 마지막 소스 순이다.
 */

export type RemovalRefusal = "last-source" | "archived" | "importing" | "not-found";
export type RemovalInput = {
  targetId: string;
  /** 잠금 뒤 읽은 그 프로젝트의 활성 소스 전부(대상 포함). */
  active: readonly { id: string; slug: string }[];
  defaultSurfaceId: string | null;
  projectArchived: boolean;
  /** 대상 소스에 살아 있는 적재 표시가 있다(`hasActiveImport` — 만료된 표시는 막지 않는다). */
  importing: boolean;
};
export type RemovalVerdict = { ok: true; nextDefaultId: string | null } | { ok: false; error: RemovalRefusal };

export function planSurfaceRemoval(input: RemovalInput): RemovalVerdict {
  if (input.projectArchived) return { ok: false, error: "archived" };
  if (!input.active.some(surface => surface.id === input.targetId)) return { ok: false, error: "not-found" };
  if (input.importing) return { ok: false, error: "importing" };
  const rest = input.active.filter(surface => surface.id !== input.targetId);
  const heir = [...rest].sort((a, b) => compareSurfaces(a.slug, b.slug))[0];
  if (heir === undefined) return { ok: false, error: "last-source" };
  return { ok: true, nextDefaultId: input.defaultSurfaceId === input.targetId ? heir.id : null };
}

/** 제거가 돌려주는 거부 전부 — 인가(잠금 뒤 재판정 포함) · 판정 · 낡은 지문. */
export type SourceRemovalError = AccessError | RemovalRefusal | "stale-approval";

/**
 * 거부 → 문장 (멤버 `planMemberChange`와 같은 형). 화면의 사전 차단(마지막 소스)·확인 창의 서버 거부·MCP 결과가 이 하나를 지난다.
 * `archived`·`not-found`는 인가 문장이 이미 있어 그쪽을 쓴다 — 같은 거부에 문장을 둘 두지 않는다.
 */
export function removalReason(m: Messages, error: SourceRemovalError): string {
  if (error === "last-source" || error === "importing" || error === "stale-approval") return m.sources.removal.reasons[error];
  return accessErrorMessage(m, error);
}
