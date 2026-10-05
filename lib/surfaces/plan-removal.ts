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
