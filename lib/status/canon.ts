import { m } from "@/lib/i18n";

/**
 * **상태 톤·낱말의 코드판 정본** (DESIGN §2.4 · ux-drift-unify §3.6). 같은 상태는 형태(배지·Alert·띠·아이콘 칸)가 달라도 톤과 낱말이 같다 —
 * 화면은 상태 키만 넘기고 프리미티브(`StatusBadge`·`IconTile`·`BannerLine`·`Alert`)가 그것을 클래스로 옮긴다.
 *
 * ⚠️ **잎이다 — 사전(`lib/i18n`)만 문다.** 클라이언트가 값으로 읽으므로 Prisma·`lib/keys/query.ts` 그래프를 물면
 * `client-graph.test.ts`가 red다(POSTMORTEM 2026-09-07의 7.2MB 청크). ⚠️ **`lib/`는 Tailwind를 모른다** — 클래스는 `components/ui/`가 든다.
 * ⚠️ **소비자가 있는 키만 둔다.** Logs의 성공은 회색이며 실패 낱말은 Failed라 별도 키다 — 일반 Synced·Sync failed와 합치지 않는다.
 * ⚠️ DESIGN 표와의 행 수 대조 테스트는 없다 — 빠진 키는 `Record<StateKey, …>`가 컴파일에서 막는다. 이 표와 §2.4가 어긋나면 둘을 함께 고친다.
 */

/** `EventTone`(`lib/events/view.ts`)과 같은 어휘다 — Badge variant 이름이 아니라 뜻이다. `lib/tone.ts`의 `Tone`(아바타 색)과 다른 것이다. */
export type StateTone = "success" | "muted" | "warning" | "danger";

/**
 * 배지 variant — `components/ui/badge.tsx`의 이름과 같다(타입 대조는 테스트). **행이 variant를 직접 든다** — 무색이 둘이라서다:
 * `text`(글자만) · `soft-neutral`(면 — Unsent 등, Q3). `danger` 톤은 언제나 `soft-red`(붉은 면)이다(D3②).
 */
export type StateVariant = "soft-green" | "soft-amber" | "soft-red" | "soft-neutral" | "text";

export type StateKey =
  | "synced" | "syncing" | "notSyncedYet"
  | "syncFailed" | "partiallySynced" | "held" | "unsent"
  | "prOpen" | "connected" | "notConnected" | "disconnected" | "wrongRepository" | "couldNotCheck"
  | "archived" | "setup" | "active"
  | "logsSynced" | "logsSent" | "logsFailed" | "publishing" | "nothingToSend" | "heldBack" | "superseded" | "notStarted" | "upToDate"
  | "expired" | "waitingToApply" | "removedFromRepository";

/** `label`은 사전 값을 가리킨다 — 새 문자열을 만들지 않는다(테스트가 사전 전수와 대조한다). */
export const STATE: Readonly<Record<StateKey, { tone: StateTone; variant: StateVariant; label: string }>> = {
  synced: { tone: "success", variant: "soft-green", label: m.settings.sources.imported },
  syncing: { tone: "muted", variant: "soft-neutral", label: m.settings.sources.importing },
  notSyncedYet: { tone: "muted", variant: "soft-neutral", label: m.settings.sources.notImported },
  // 첫·마지막 실패 모두 같은 낱말이다(§2.4).
  syncFailed: { tone: "danger", variant: "soft-red", label: m.settings.sources.failedAfter },
  // 데이터는 들어갔다 — 어느 화면에서도 빨강·"failed"로 말하지 않는다(🔴 A1).
  partiallySynced: { tone: "warning", variant: "soft-amber", label: m.logs.status.partial },
  held: { tone: "warning", variant: "soft-amber", label: m.logs.status.deferred },
  // 정상 작업 흐름이라 면만 있는 무색이다(Q3) — 손 조립 알약을 쓰지 않는다.
  unsent: { tone: "muted", variant: "soft-neutral", label: m.translations.workspace.list.notSent },
  prOpen: { tone: "muted", variant: "soft-neutral", label: m.translations.publish.prState },
  // Settings 연결 행(`ok`·`repo-moved`) — 배지와 아이콘 칸이 같은 초록이다(§2.4 연결 행).
  connected: { tone: "success", variant: "soft-green", label: m.settings.repository.health.ok },
  notConnected: { tone: "muted", variant: "soft-neutral", label: m.settings.repository.notConnected },
  // 끊김은 셋이다 — App 제거 · 설치 교체 · 설치는 있고 리포 id가 없음(`unpinned`, D1).
  disconnected: { tone: "warning", variant: "soft-amber", label: m.settings.repository.disconnected },
  wrongRepository: { tone: "danger", variant: "soft-red", label: m.settings.repository.wrongRepository },
  couldNotCheck: { tone: "warning", variant: "soft-amber", label: m.settings.repository.unknown },
  archived: { tone: "muted", variant: "soft-neutral", label: m.projects.status.archived },
  setup: { tone: "muted", variant: "soft-neutral", label: m.projects.status.setup },
  // 목록은 훑어보는 화면이라 정상도 색을 든다(DESIGN §6.63의 예외).
  active: { tone: "success", variant: "soft-green", label: m.projects.status.active },
  // Logs·Recent logs는 이력이라 성공도 회색이다. 실패는 종류 배지가 앞에 서므로 "Failed"다.
  logsSynced: { tone: "muted", variant: "soft-neutral", label: m.logs.status.imported },
  logsSent: { tone: "muted", variant: "soft-neutral", label: m.logs.status.succeeded },
  logsFailed: { tone: "danger", variant: "soft-red", label: m.logs.status.failed },
  publishing: { tone: "muted", variant: "soft-neutral", label: m.logs.status.publishing },
  nothingToSend: { tone: "muted", variant: "soft-neutral", label: m.logs.status.skipped },
  heldBack: { tone: "warning", variant: "soft-amber", label: m.logs.status.notSent },
  superseded: { tone: "muted", variant: "soft-neutral", label: m.logs.status.superseded },
  notStarted: { tone: "warning", variant: "soft-amber", label: m.logs.status.notStarted },
  upToDate: { tone: "muted", variant: "soft-neutral", label: m.logs.status.upToDate },
  expired: { tone: "warning", variant: "soft-amber", label: m.mcpConnector.token.expired },
  waitingToApply: { tone: "warning", variant: "soft-amber", label: m.sources.waiting },
  removedFromRepository: { tone: "danger", variant: "soft-red", label: m.sources.missingRepo },
};
