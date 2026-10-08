import type { AttentionItem } from "@/lib/home/attention";
import { compare } from "@/lib/home/attention-view";
import { canPerform, type Role } from "@/lib/auth/permission";
import type { ProjectStatus } from "@/lib/projects/list";

export type InboxItem = AttentionItem
  | { kind: "setup"; at: Date }
  | { kind: "unsent"; at: Date | null; count: number; surfaceSlug: string };
export type InboxProject = {
  slug: string; name: string; image: string | null; role: Role; status: ProjectStatus;
  createdAt: Date; attention: readonly AttentionItem[];
  unsent: { count: number; surfaceSlug: string; at: Date | null } | null;
};
export type InboxPlan = {
  groups: { project: { slug: string; name: string; image: string | null }; items: (InboxItem & { unread: boolean; ownerRetries: boolean })[] }[];
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
  const rank = (item: InboxItem) => item.kind === "setup" ? 0 : item.kind === "unsent" ? 1 : 2;
  const delta = rank(a) - rank(b);
  if (delta !== 0) return delta;
  if (a.kind === "setup" || a.kind === "unsent" || b.kind === "setup" || b.kind === "unsent") return 0;
  return compare(a, b);
}

export function planInbox(input: { projects: readonly InboxProject[]; seenAt: Date | null }): InboxPlan {
  let unread = 0;
  const groups: InboxPlan["groups"] = input.projects.flatMap(project => {
    const items: InboxItem[] = [...project.attention];
    if (project.status === "setup" && canPerform(project.role, "project:settings")) items.push({ kind: "setup", at: project.createdAt });
    if (project.unsent !== null && project.unsent.count > 0) items.push({ kind: "unsent", ...project.unsent });
    if (items.length === 0) return [];
    return [{
      project: { slug: project.slug, name: project.name, image: project.image },
      items: items.sort(compareItems).map(item => {
        const fresh = isUnread(item.kind, item.at, input.seenAt);
        if (fresh) unread++;
        return { ...item, unread: fresh, ownerRetries: item.kind === "import_failed" && !canPerform(project.role, "project:settings") };
      }),
    }];
  });
  groups.sort((a, b) => {
    const left = a.items[0]?.at?.getTime() ?? -Infinity;
    const right = b.items[0]?.at?.getTime() ?? -Infinity;
    if (left !== right) return left > right ? -1 : 1;
    return a.project.slug === b.project.slug ? 0 : a.project.slug < b.project.slug ? -1 : 1;
  });
  return { groups, unread };
}
