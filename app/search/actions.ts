"use server";

import { readSession } from "@/lib/auth/read-session";
import { getPrisma } from "@/lib/db";
import { loadMemberships } from "@/lib/keys/query";
import { searchKeys } from "@/lib/keys/search";
import type { KeyHit } from "@/lib/search/key-href";
import { toNavProjects, type NavProject } from "@/lib/shell/nav";

type Failure = { ok: false; error: "unauthorized" | "unavailable" };
export type KeySearchResult = { ok: true; hits: KeyHit[] } | Failure;
export type SearchMembershipsResult = { ok: true; memberships: NavProject[] } | Failure;

/** 검색 중 만료는 redirect가 아니라 Dialog 안의 실패 상태다. 질의는 로그에 남기지 않는다. */
export async function searchKeysAction(q: unknown, activeSlug: unknown): Promise<KeySearchResult> {
  if (typeof q !== "string") return { ok: true, hits: [] };
  const session = await readSession();
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  try {
    return { ok: true, hits: await searchKeys(getPrisma(), { userId: session.userId, q, activeSlug: typeof activeSlug === "string" ? activeSlug : null }) };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

/** 공개 셸도 열 때마다 현재 멤버십을 받되, 앱 셸과 같은 필드만 브라우저에 보낸다. */
export async function loadSearchMembershipsAction(): Promise<SearchMembershipsResult> {
  const session = await readSession();
  if (session.status === "none") return { ok: false, error: "unauthorized" };
  if (session.status === "unavailable") return { ok: false, error: "unavailable" };
  try {
    return { ok: true, memberships: toNavProjects(await loadMemberships(getPrisma(), session.userId)) };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
