import { m } from "@/lib/i18n";

/**
 * **상태 톤·낱말의 코드판 정본** (DESIGN §2.4 · ux-drift-unify §3.6). 같은 상태는 형태(배지·Alert·띠·아이콘 칸)가 달라도 톤과 낱말이 같다 —
 * 화면은 상태 키만 넘기고 프리미티브(`StatusBadge`·`IconTile`·`BannerLine`·`Alert`)가 그것을 클래스로 옮긴다.
 *
 * ⚠️ **잎이다 — 사전(`lib/i18n`)만 문다.** 클라이언트가 값으로 읽으므로 Prisma·`lib/keys/query.ts` 그래프를 물면
 * `client-graph.test.ts`가 red다(POSTMORTEM 2026-09-07의 7.2MB 청크). ⚠️ **`lib/`는 Tailwind를 모른다** — 클래스는 `components/ui/`가 든다.
 * ⚠️ **소비자가 있는 키만 둔다** — 2026-10-01(ux-drift-unify T29)에 소비자 0이던 `sent`·`superseded`·`unavailable`을 걷었다(Logs 결과 칩·
 *   `Unavailable` 글자는 각자 사전 값을 직접 든다). 그 밖의 상태(셀 `needsReview`·`untranslated`, 초대 `expired` 등)도 소비자가 생길 때 올린다.
 * ⚠️ DESIGN 표와의 행 수 대조 테스트는 없다 — 빠진 키는 `Record<StateKey, …>`가 컴파일에서 막는다. 이 표와 §2.4가 어긋나면 둘을 함께 고친다.
 */

/** `EventTone`(`lib/events/view.ts`)과 같은 어휘다 — Badge variant 이름이 아니라 뜻이다. `lib/tone.ts`의 `Tone`(아바타 색)과 다른 것이다. */
export type StateTone = "success" | "muted" | "warning" | "danger";

/**
 * 배지 variant — `components/ui/badge.tsx`의 이름과 같다(타입 대조는 테스트). **행이 variant를 직접 든다** — 무색이 둘이라서다:
 * `muted`(글자만 — Superseded·Unavailable, 지금 이 표에 행은 없다) · `neutral`(면 — Unsent 등, Q3). `danger` 톤은 언제나 `missing`(붉은 면)이다(D3②).
 */
export type StateVariant = "success" | "warning" | "missing" | "neutral" | "muted";

export type StateKey =
  | "synced" | "syncing" | "notSyncedYet"
  | "syncFailed" | "partiallySynced" | "held" | "unsent"
  | "prOpen" | "connected" | "notConnected" | "disconnected" | "wrongRepository" | "couldNotCheck"
  | "archived" | "setup" | "active";

/** `label`은 사전 값을 가리킨다 — 새 문자열을 만들지 않는다(테스트가 사전 전수와 대조한다). */
export const STATE: Readonly<Record<StateKey, { tone: StateTone; variant: StateVariant; label: string }>> = {
  synced: { tone: "success", variant: "success", label: m.settings.sources.imported },
  syncing: { tone: "muted", variant: "neutral", label: m.settings.sources.importing },
  notSyncedYet: { tone: "muted", variant: "neutral", label: m.settings.sources.notImported },
  // 첫·마지막 실패 모두 같은 낱말이다(§2.4).
  syncFailed: { tone: "danger", variant: "missing", label: m.settings.sources.failedAfter },
  // 데이터는 들어갔다 — 어느 화면에서도 빨강·"failed"로 말하지 않는다(🔴 A1).
  partiallySynced: { tone: "warning", variant: "warning", label: m.logs.status.partial },
  held: { tone: "warning", variant: "warning", label: m.logs.status.deferred },
  // 정상 작업 흐름이라 면만 있는 무색이다(Q3) — 손 조립 알약을 쓰지 않는다.
  unsent: { tone: "muted", variant: "neutral", label: m.translations.workspace.list.notSent },
  prOpen: { tone: "muted", variant: "neutral", label: m.translations.publish.prState },
  // Settings 연결 행(`ok`·`repo-moved`) — 배지와 아이콘 칸이 같은 초록이다(§2.4 연결 행).
  connected: { tone: "success", variant: "success", label: m.settings.repository.health.ok },
  notConnected: { tone: "muted", variant: "neutral", label: m.settings.repository.notConnected },
  // 끊김은 셋이다 — App 제거 · 설치 교체 · 설치는 있고 리포 id가 없음(`unpinned`, D1).
  disconnected: { tone: "warning", variant: "warning", label: m.settings.repository.disconnected },
  wrongRepository: { tone: "danger", variant: "missing", label: m.settings.repository.wrongRepository },
  couldNotCheck: { tone: "warning", variant: "warning", label: m.settings.repository.unknown },
  archived: { tone: "muted", variant: "neutral", label: m.projects.status.archived },
  setup: { tone: "muted", variant: "neutral", label: m.projects.status.setup },
  // 목록은 훑어보는 화면이라 정상도 색을 든다(DESIGN §6.63의 예외).
  active: { tone: "success", variant: "success", label: m.projects.status.active },
};
