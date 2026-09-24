import type { SummaryQueue } from "@/lib/projects/list";

import type { HomeState } from "./state";
import type { SyncTime } from "./sync-time";

/**
 * 카운트 카드 넷 (캔버스 `2a` · DESIGN §6.64).
 *
 * ⚠️ **값도 제목도 글리프도 새로 만들지 않는다.** 목록 화면이 같은 넷을 같은 순서·같은 라벨·같은
 * 색으로 이미 그리고, 수는 `summaryQueue`가 낸다 — 여기서 새로 정하는 것은 **보조 줄**과 **0 갈래**
 * 둘뿐이다. 넷째 집계 경로를 만들면 미발송 술어가 네 벌이 된다 (CLAUDE.md).
 */

/** 순서가 파이프라인이다 — 유입 → 번역 → 검토 → 발송. 목록 화면의 띠와 같은 순서다. */
export const CARD_KEYS = ["newFromGithub", "toTranslate", "toReview", "toSend"] as const;

export type CardKey = (typeof CARD_KEYS)[number];

/**
 * 카드가 가리키는 번역 화면의 상태 어휘 (PRODUCT §7.7). **`CardKey`와 1:1이지만 이름이 다르다** —
 * URL은 사용자가 읽는 자리라 화면의 낱말(`untranslated`)을 쓰고, 코드 쪽 키는 목록 화면과
 * 공유하는 사전 키(`toTranslate`)를 따른다.
 */
export const CARD_STATE: Record<CardKey, "new" | "untranslated" | "review" | "unsent"> = {
  newFromGithub: "new",
  toTranslate: "untranslated",
  toReview: "review",
  toSend: "unsent",
};

/**
 * 보조 줄 — **그 수의 단위와 기준**을 말한다. 문장이 아니라 **갈래와 재료**를 낸다: 문구의 소유자는
 * `messages/en.tsx`이고, 여기서 문자열을 만들면 화면 문구가 두 곳에 산다.
 */
export type CardSubline =
  | { kind: "synced"; at: Date | null }
  | { kind: "acrossSurfaces"; surfaces: number }
  | { kind: "reviewByLocale"; locales: readonly { code: string; count: number }[] }
  | { kind: "allFilled"; keys: number }
  | { kind: "nothingPending" }
  | { kind: "lastGoodSync"; at: Date | null }
  | { kind: "asOf"; at: Date | null }
  | { kind: "asOfLastSync" }
  | { kind: "pausedCannotSend" }
  | { kind: "frozenAtArchive" }
  | { kind: "neverSent" }
  /** 보낼 편집이 있어 CI 자동 적재가 보류 중이다 (DESIGN §6.64). 보류는 저장되는 상태가 아니라 pending > 0에서 파생된다. */
  | { kind: "repositoryUpdatesPaused" };

export type HomeCard = {
  key: CardKey;
  value: number;
  /**
   * ⚠️ **첫 칸만 keys다.** 새 키의 빈 칸은 `New`에도 `To translate`에도 세므로 넷이
   * 같은 모집단의 네 구간이 **아니고**, 그 사실을 화면에서 말하는 자리가 이 단위 하나다.
   */
  unit: "keys" | "cells";
  /**
   * ⚠️ **목록 화면의 띠와 다른 규칙이다** (DESIGN §6.63). 저쪽은 라벨이 이미 muted라 글리프가 그 색을
   * 상속하지만, 카드는 수치가 크고 기본색이 `#0a0a0a`라 0을 흐리는 규칙이 새로 필요하다.
   */
  muted: boolean;
  /** 파랑 다섯 자리 중 하나가 첫 칸이다 (DESIGN §6.2). amber는 `To review` 글리프다. */
  tone: "accent" | "warning" | null;
  subline: CardSubline;
};

export function countCards(input: {
  state: HomeState;
  counts: SummaryQueue;
  /** 미보관 표면 수. 하나면 `across n surfaces`가 정보가 아니라 소음이다. */
  surfaces: number;
  /** 살아 있는 키 수 — `To translate`가 0일 때 "무엇이 다 찼나"의 분모다. */
  keys: number;
  /**
   * 표면별 `lastImportedAt`(마지막 성공 적재)의 최댓값 — `lastSyncTime`. 첫 Sync 전에는 `null`이고,
   * 시각 컬럼 이전의 성공이면 `"unrecorded"`다 (malmoi#81).
   */
  lastSyncAt: SyncTime;
  /** 검토 대기의 로케일별 분해 — `8 cells · 5 en, 3 ja`의 뒤쪽이다. */
  reviewByLocale: readonly { code: string; count: number }[];
}): HomeCard[] {
  const { counts } = input;
  return CARD_KEYS.map((key) => ({
    key,
    value: counts[key],
    unit: key === "newFromGithub" ? ("keys" as const) : ("cells" as const),
    // 값이 0이면 수치·글리프가 함께 흐려진다 — 색도 같이 빠진다(흐린 파랑은 두 규칙의 충돌이다).
    muted: counts[key] === 0,
    tone: counts[key] === 0 ? null : key === "newFromGithub" ? ("accent" as const) : key === "toReview" ? ("warning" as const) : null,
    subline: sublineFor(key, input),
  }));
}

/**
 * ⚠️ **상태의 보조 줄이 0 갈래를 이긴다.** 미연결에서 `To review 0`에 `nothing pending`을 붙이면
 * 거짓이다 — 그 수는 마지막 Sync 시점의 것이고 지금의 관측이 아니다.
 */
function sublineFor(key: CardKey, input: Parameters<typeof countCards>[0]): CardSubline {
  const { state, counts, lastSyncAt } = input;

  if (key === "newFromGithub") {
    // 시각이 기록되지 않은 성공 — "not synced yet"도 지어낸 시각도 아니다. 시각 없는 문장으로 말한다 (malmoi#81).
    if (lastSyncAt === "unrecorded") return state === "archived" ? { kind: "frozenAtArchive" } : { kind: "asOfLastSync" };
    if (state === "import_failed") return { kind: "lastGoodSync", at: lastSyncAt };
    if (state === "not_connected") return { kind: "asOf", at: lastSyncAt };
    /**
     * ⚠️ **보관에서는 첫 칸도 상태를 말한다** (2026-09-15 리뷰 🟡5). 이 칸의 값은 보관된 프로젝트에서
     * 0이 되는데(raw 집계가 SQL에서 보관을 거른다 — `page.tsx`), `synced 6 days ago`를 붙이면 그
     * 0이 **지금 관측한 값**처럼 읽힌다. 나머지 셋이 `frozen at archive`·`never sent`라고 말하는
     * 화면에서 첫 칸만 현재형이면 그 수를 믿게 된다.
     */
    if (state === "archived") return { kind: "frozenAtArchive" };
    return { kind: "synced", at: lastSyncAt };
  }

  if (state === "not_connected") return key === "toSend" ? { kind: "pausedCannotSend" } : { kind: "asOfLastSync" };
  /**
   * ⚠️ **`never sent`는 프로젝트가 아니라 그 칸들에 대한 말이다.** 보관된 프로젝트의 미발송 칸은
   * 영영 안 나가므로, 프로젝트가 전에 Publish한 적이 있어도 이 문장은 참이다 — 마지막 Publish
   * 시각을 대신 적으면 "보내는 중"으로 읽힌다.
   */
  if (state === "archived") return key === "toSend" ? { kind: "neverSent" } : { kind: "frozenAtArchive" };

  if (key === "toTranslate") {
    return counts.toTranslate === 0 ? { kind: "allFilled", keys: input.keys } : { kind: "acrossSurfaces", surfaces: input.surfaces };
  }
  if (key === "toReview") {
    return counts.toReview === 0 ? { kind: "nothingPending" } : { kind: "reviewByLocale", locales: input.reviewByLocale };
  }
  if (counts.toSend === 0) return { kind: "nothingPending" };
  /*
    ⚠️ **마지막 Publish 시각보다 이 사실이 앞선다** (DESIGN §6.64). 보낼 편집이 있으면 리포의 새 키·삭제가 앱에 안
    들어오고, 그것을 OWNER가 아는 자리가 이 줄이다. 넷째 전폭 배너를 두지 않는다 — 상시 상태에 배너를 두면 Home의 배너 0개 전제가 깨진다.
  */
  return { kind: "repositoryUpdatesPaused" };
}
