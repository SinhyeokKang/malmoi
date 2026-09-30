import { m } from "@/lib/i18n";

/**
 * **상태 톤·낱말의 코드판 정본** (DESIGN §2.4 · ux-drift-unify §3.6). 같은 상태는 형태(배지·Alert·띠·아이콘 칸)가 달라도 톤과 낱말이 같다 —
 * 화면은 상태 키만 넘기고 프리미티브(`StatusBadge`·`IconTile`·`BannerLine`·`Alert`)가 그것을 클래스로 옮긴다.
 *
 * ⚠️ **잎이다 — 사전(`lib/i18n`)만 문다.** 클라이언트가 값으로 읽으므로 Prisma·`lib/keys/query.ts` 그래프를 물면
 * `client-graph.test.ts`가 red다(POSTMORTEM 2026-09-07의 7.2MB 청크). ⚠️ **`lib/`는 Tailwind를 모른다** — 클래스는 `components/ui/`가 든다.
 * ⚠️ **U3(`StatusBadge`)·U5(교차 테스트)를 위해 미리 넣은 키가 있다** — 기능 종료 때 여전히 소비자가 없으면 뺀다. 그 밖의 상태
 *   (셀 `needsReview`·`untranslated`, 초대 `expired` 등)는 소비자가 생길 때 올린다.
 * ⚠️ DESIGN 표와의 행 수 대조 테스트는 없다 — 빠진 키는 `Record<StateKey, …>`가 컴파일에서 막는다. 이 표와 §2.4가 어긋나면 둘을 함께 고친다.
 */

/** `EventTone`(`lib/events/view.ts`)과 같은 어휘다 — Badge variant 이름이 아니라 뜻이다. `lib/tone.ts`의 `Tone`(아바타 색)과 다른 것이다. */
export type StateTone = "success" | "muted" | "warning" | "danger";

/**
 * 배지 variant — `components/ui/badge.tsx`의 이름과 같다(타입 대조는 테스트). **행이 variant를 직접 든다** — 무색이 둘이라서다:
 * `muted`(글자만 — Superseded·Unavailable) · `neutral`(면 — Unsent 등, Q3). `danger` 톤은 언제나 `missing`(붉은 면)이다(D3②).
 */
export type StateVariant = "success" | "warning" | "missing" | "neutral" | "muted";

export type StateKey =
  | "synced" | "sent" | "syncing" | "notSyncedYet" | "superseded"
  | "syncFailed" | "partiallySynced" | "held" | "unsent"
  | "prOpen" | "notConnected" | "disconnected" | "wrongRepository" | "couldNotCheck"
  | "unavailable" | "archived" | "setup" | "active";

/** `label`은 사전 값을 가리킨다 — 새 문자열을 만들지 않는다(테스트가 사전 전수와 대조한다). */
export const STATE: Readonly<Record<StateKey, { tone: StateTone; variant: StateVariant; label: string }>> = {
  synced: { tone: "success", variant: "success", label: m.settings.sources.imported },
  sent: { tone: "success", variant: "success", label: m.logs.status.succeeded },
  syncing: { tone: "muted", variant: "neutral", label: m.settings.sources.importing },
  notSyncedYet: { tone: "muted", variant: "neutral", label: m.settings.sources.notImported },
  superseded: { tone: "muted", variant: "muted", label: m.logs.status.superseded },
  // 첫·마지막 실패 모두 같은 낱말이다(§2.4).
  syncFailed: { tone: "danger", variant: "missing", label: m.settings.sources.failedAfter },
  // 데이터는 들어갔다 — 어느 화면에서도 빨강·"failed"로 말하지 않는다(🔴 A1).
  partiallySynced: { tone: "warning", variant: "warning", label: m.logs.status.partial },
  held: { tone: "warning", variant: "warning", label: m.logs.status.deferred },
  // 정상 작업 흐름이라 면만 있는 무색이다(Q3) — 손 조립 알약을 쓰지 않는다.
  unsent: { tone: "muted", variant: "neutral", label: m.translations.workspace.list.notSent },
  prOpen: { tone: "muted", variant: "neutral", label: m.translations.publish.prState },
  notConnected: { tone: "muted", variant: "neutral", label: m.settings.repository.notConnected },
  // 끊김은 셋이다 — App 제거 · 설치 교체 · 설치는 있고 리포 id가 없음(`unpinned`, D1).
  disconnected: { tone: "warning", variant: "warning", label: m.settings.repository.disconnected },
  wrongRepository: { tone: "danger", variant: "missing", label: m.settings.repository.wrongRepository },
  couldNotCheck: { tone: "warning", variant: "warning", label: m.settings.repository.unknown },
  // 못 읽은 값(복호화 실패) — 이름 하나다(Q5). 부재(`—`)와 가른다.
  unavailable: { tone: "muted", variant: "muted", label: m.common.unreadable },
  archived: { tone: "muted", variant: "neutral", label: m.projects.status.archived },
  setup: { tone: "muted", variant: "neutral", label: m.projects.status.setup },
  // 목록은 훑어보는 화면이라 정상도 색을 든다(DESIGN §6.63의 예외).
  active: { tone: "success", variant: "success", label: m.projects.status.active },
};
