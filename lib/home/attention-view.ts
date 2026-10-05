import { CircleX, Eye, Languages, TriangleAlert, CircleDashed, GitPullRequestArrow } from "lucide-react";
import type { ComponentType } from "react";
import type { Messages } from "@/lib/i18n";
import type { AttentionItem } from "./attention";
import type { InboxItem } from "@/lib/inbox/plan";
import { importFailureTone } from "@/lib/projects/import-failure";
import { ALL_NAMESPACES, routes, bannerTranslationsHref } from "@/lib/routes";
import type { StateTone } from "@/lib/status/canon";

const TILE: Record<InboxItem["kind"], { icon: ComponentType<{ className?: string }>; tone: StateTone }> = {
  // 실패는 어디서나 붉은 면 + `CircleX`다(DESIGN §2.4 글리프 열 — `TriangleAlert`는 danger 옆에 서지 않는다, 5-Y4).
  import_failed: { icon: CircleX, tone: "danger" },
  // 검토 대기는 호박 + `Eye`다 — 같은 Home의 카운트 카드·목록 띠와 같은 글리프(5-Y5).
  review: { icon: Eye, tone: "warning" },
  never_filled: { icon: Languages, tone: "muted" },
  setup: { icon: CircleDashed, tone: "muted" },
  unsent: { icon: GitPullRequestArrow, tone: "muted" },
};

/** 일부 반영은 경고 칸 + `TriangleAlert`다 — 실패 원을 빌리지 않는다(🔴 A2 · §2.4 글리프 열). */
const PARTIAL_TILE = { icon: TriangleAlert, tone: "warning" } as const;

export function attentionHref(slug: string, item: InboxItem): string {
  if (item.kind === "setup") return routes.settings(slug);
  if (item.kind === "unsent") return bannerTranslationsHref(slug, item.surfaceSlug, "unsent");
  return item.kind === "import_failed"
      ? routes.sources(slug)
      : routes.surfaceTranslations(slug, item.surfaceSlug, item.kind === "review"
          // 그 로케일의 검토 대기 — 상세 언어를 그 로케일로 좁힌다(translation-rework T12).
          ? { ns: ALL_NAMESPACES, state: "review", language: item.code }
          // 그 로케일이 비어 있는 키 — `Incomplete` + 상세 언어 그 로케일이다(translation-tree-range — `Untranslated in` 목록 필터가 사라졌다).
          // 다른 로케일만 빈 키가 섞이는 것은 사용자가 수용한 대가다(spec "잃는 것").
          : { ns: ALL_NAMESPACES, completion: "incomplete", language: item.code });
}

export function attentionTile(item: InboxItem) {
  return item.kind === "import_failed" && importFailureTone(item.reason) === "warning" ? PARTIAL_TILE : TILE[item.kind];
}

export function title(m: Messages, item: InboxItem): string {
  if (item.kind === "setup") return "";
  if (item.kind === "unsent") return item.surfaceSlug;
  if (item.kind === "import_failed") return m.home.attention.importFailed.title(item.surfaceSlug);
  const label = item.kind === "review" ? m.home.attention.review : m.home.attention.neverFilled;
  return label.title(item.surfaceSlug, item.name);
}

export function body(m: Messages, item: InboxItem): string {
  if (item.kind === "setup") return m.projects.banner.setup;
  if (item.kind === "unsent") return m.projects.banner.unsent(item.count);
  // 일부만 반영된 표면은 실패 문장을 빌리지 않는다(DESIGN §2.4 — 데이터는 들어갔다).
  if (item.kind === "import_failed") return importFailureTone(item.reason) === "warning" ? m.home.attention.partial.body : m.home.attention.importFailed.body;
  if (item.kind === "review") return m.home.attention.review.body(item.count);
  return m.home.attention.neverFilled.body(item.name);
}

/**
 * ⚠️ **꼬리 절이 통째로 빠지는 갈래가 있다** (DESIGN §6.64) — 이름을 못 찾으면
 * `8 cells are waiting for review.`로 끝난다. `who`가 `null`인지가 그 판정이고, 그 `null`은
 * `actorLabel`이 아니라 **`actors` 맵의 키 존재**에서 왔다.
 */
export function tail(m: Messages, item: InboxItem): string {
  if (item.kind === "setup" || item.kind === "unsent") return "";
  if (item.kind === "import_failed") return importFailureTone(item.reason) === "warning" ? m.home.attention.partial.tail : m.home.attention.importFailed.tail;
  if (item.kind === "review") return item.who === null ? "." : m.home.attention.review.tail(item.who);
  return m.home.attention.neverFilled.tail(item.keys);
}


/**
 * ⚠️ **시각이 없는 항목은 가장 오래된 것이다** (ARCHITECTURE §5). 에러는 있는데 `lastImportFailedAt`이
 * `null`인 행은 마이그레이션 이전 행뿐이고, 임의 위치를 주면 배포 직후 목록이 흔들린다.
 *
 * ⚠️ **`localeCompare`를 쓰지 않는다** — 로케일 설정에 따라 답이 달라져 같은 DB 상태가 다른 화면을
 * 낸다. export 정렬과 같은 규칙이다 (ARCHITECTURE §1.1).
 */
export function compare(a: AttentionItem, b: AttentionItem): number {
  // 시각 없는 항목끼리는 아래 보조 키로 갈린다 — 뺄셈으로 접으면 `-Infinity - -Infinity`가 NaN이다.
  if (a.at === null || b.at === null) {
    if (a.at !== b.at) return a.at === null ? 1 : -1;
  } else if (a.at.getTime() !== b.at.getTime()) {
    return b.at.getTime() - a.at.getTime();
  }
  if (a.surfaceSlug !== b.surfaceSlug) return a.surfaceSlug < b.surfaceSlug ? -1 : 1;
  // 파서 실패에는 로케일이 없다 — 빈 문자열이 같은 표면의 로케일 항목들보다 앞에 온다.
  const code = (item: AttentionItem): string => ("code" in item ? item.code : "");
  return code(a) === code(b) ? 0 : code(a) < code(b) ? -1 : 1;
}
