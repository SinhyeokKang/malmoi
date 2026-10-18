import type { AttentionItem } from "@/lib/home/attention";
import { compare, reconnectDestination, type ReconnectDestination } from "@/lib/home/attention-view";
import type { Role } from "@/lib/auth/permission";
import type { LanguageTodo } from "@/lib/locales/todo";
import { projectTodos } from "./project-todos";
import type { ProjectStatus } from "@/lib/projects/list";

export type InboxItem = AttentionItem
  /** 연결이 끊긴 프로젝트 — `at`은 GitLab 토큰 만료일이고, 연결 고정이 빠진 행은 언제 끊겼는지 몰라 `null`이다(그룹 안 맨 뒤 · 안 읽음으로 세지 않는다). */
  | { kind: "needs_reconnect"; at: Date | null }
  | { kind: "setup"; at: Date }
  | { kind: "unsent"; at: Date | null; count: number; surfaceSlug: string }
  /** 언어 변경만 남았다 — 거둘 것만 남으면 요청 행이 없어 `at`이 `null`이다(그룹 안 맨 뒤 · 워터마크가 있으면 읽음). */
  | ({ kind: "language_unsent" } & LanguageTodo);
export type InboxProject = {
  slug: string; name: string; image: string | null; role: Role; status: ProjectStatus;
  connectionPinned: boolean; gitlabTokenExpiresAt: Date | null;
  createdAt: Date; attention: readonly AttentionItem[];
  unsent: { count: number; surfaceSlug: string; at: Date | null } | null;
  language: LanguageTodo | null;
};
export type InboxPlan = {
  groups: {
    /** `reconnect`는 재연결 항목의 목적지 — 역할을 아는 이 계획이 정하고 행 조각은 받기만 한다(`attentionHref`). */
    project: { slug: string; name: string; image: string | null; reconnect: ReconnectDestination };
    items: (InboxItem & { unread: boolean; ownerRetries: boolean })[];
  }[];
  unread: number;
};

export function isUnread(kind: InboxItem["kind"], at: Date | null, seenAt: Date | null): boolean {
  // push도 검토 셀 updatedAt을 바꾸므로 새 검토 시각이라고 말할 수 없다.
  return kind !== "review" && (seenAt === null || (at !== null && at > seenAt));
}
/**
 * 클라이언트가 보낸 열람 시각은 `toISOString()` 형만 받는다 — `Date.parse`의 비ISO 해석은 구현 정의라 서버마다 갈린다.
 * 미래는 서버 시각으로 자른다: 아직 보지 않은 항목을 읽음으로 만들지 못하게. 과거 위조는 자기 항목을 일찍 읽음 처리할 뿐이다.
 */
export function clampSeenAt(input: unknown, now: Date): Date | null {
  if (typeof input !== "string") return null;
  const at = new Date(input);
  if (Number.isNaN(at.getTime()) || at.toISOString() !== input) return null;
  return at > now ? new Date(now) : at;
}
export function badgeLabel(n: number): string | null {
  return n === 0 ? null : n > 9 ? "9+" : String(n);
}

function compareItems(a: InboxItem, b: InboxItem): number {
  if (a.at === null || b.at === null) {
    if (a.at !== b.at) return a.at === null ? 1 : -1;
  } else if (a.at.getTime() !== b.at.getTime()) return b.at.getTime() - a.at.getTime();
  // 프로젝트 단위 항목(끊김·설정)이 먼저다 — 표면·로케일이 없어 아래 보조 키가 없다.
  // 언어 변경은 미발송과 같은 급이다 — 같은 [Publish]가 보내는 프로젝트 단위 일이다.
  const rank = (item: InboxItem) => item.kind === "needs_reconnect" || item.kind === "setup" ? 0 : item.kind === "unsent" || item.kind === "language_unsent" ? 1 : 2;
  const delta = rank(a) - rank(b);
  if (delta !== 0) return delta;
  if (a.kind === "needs_reconnect" || a.kind === "setup" || a.kind === "unsent" || a.kind === "language_unsent"
    || b.kind === "needs_reconnect" || b.kind === "setup" || b.kind === "unsent" || b.kind === "language_unsent") return 0;
  return compare(a, b);
}

export function planInbox(input: { projects: readonly InboxProject[]; seenAt: Date | null }): InboxPlan {
  let unread = 0;
  const groups: InboxPlan["groups"] = input.projects.flatMap(project => {
    // 행 띠와 같은 DB 할 일 판정이다(project-row-redesign 완료 조건 6). 원격 신호는 여기 없다 — 배지가 매 헤더에서 불린다.
    const items = projectTodos(project);
    if (items.length === 0) return [];
    return [{
      project: { slug: project.slug, name: project.name, image: project.image, reconnect: reconnectDestination(project.role) },
      items: items.sort(compareItems).map(item => {
        const fresh = isUnread(item.kind, item.at, input.seenAt);
        if (fresh) unread++;
        return { ...item, unread: fresh };
      }),
    }];
  });
  // 안 읽은 항목이 있는 묶음이 먼저다 — 최신 항목이 검토(늘 읽음)인 묶음이 안 읽은 실패보다 위에 서지 않게.
  groups.sort((a, b) => {
    const unreadDelta = Number(b.items.some(item => item.unread)) - Number(a.items.some(item => item.unread));
    if (unreadDelta !== 0) return unreadDelta;
    const left = a.items[0]?.at?.getTime() ?? -Infinity;
    const right = b.items[0]?.at?.getTime() ?? -Infinity;
    if (left !== right) return left > right ? -1 : 1;
    return a.project.slug === b.project.slug ? 0 : a.project.slug < b.project.slug ? -1 : 1;
  });
  return { groups, unread };
}
