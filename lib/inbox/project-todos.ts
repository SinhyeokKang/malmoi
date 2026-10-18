import { canPerform, type Role } from "@/lib/auth/permission";
import type { AttentionItem } from "@/lib/home/attention";
import type { ProjectStatus } from "@/lib/projects/list";

/** 목록 집계는 검토 시각을 읽지 않는다. 모르는 시각을 만들지 않고 Inbox의 실제 시각도 보존한다. */
export type ProjectAttention = Exclude<AttentionItem, { kind: "review" }>
  | (Omit<Extract<AttentionItem, { kind: "review" }>, "at"> & { at: Date | null });
type ProjectTask =
  | { kind: "needs_reconnect"; at: Date | null }
  | { kind: "setup"; at: Date }
  | { kind: "unsent"; at: Date | null; count: number; surfaceSlug: string };
export type ProjectTodo = (ProjectAttention | ProjectTask) & { ownerRetries: boolean };
export type ProjectTodoInput<T extends ProjectAttention = ProjectAttention> = {
  status: ProjectStatus; role: Role; createdAt: Date;
  connectionPinned: boolean; gitlabTokenExpiresAt: Date | null;
  /** 작업 언어로 거른 Attention 재료. Inbox는 collectAttention, 목록은 기존 집계에서 만든다. */
  attention: readonly T[];
  unsent: { count: number; surfaceSlug: string; at: Date | null } | null;
};

/** DB 할 일만 모은다. 원격 신호와 행의 우선순위는 planProjectRow가 맡는다. */
export function projectTodos<T extends ProjectAttention>(input: ProjectTodoInput<T>): ((T | ProjectTask) & { ownerRetries: boolean })[] {
  if (input.status === "archived") return [];
  const ownerRetries = !canPerform(input.role, "project:settings");
  const items: ((T | ProjectTask) & { ownerRetries: boolean })[] = input.attention.map(item => ({
    ...item, ownerRetries: item.kind === "import_failed" && ownerRetries,
  }));
  if (input.status === "needs_reconnect") items.push({ kind: "needs_reconnect",
    at: input.connectionPinned ? input.gitlabTokenExpiresAt : null, ownerRetries });
  if (input.status === "setup" && !ownerRetries) items.push({ kind: "setup", at: input.createdAt, ownerRetries: false });
  if (input.unsent !== null && input.unsent.count > 0) items.push({ kind: "unsent", ...input.unsent, ownerRetries: false });
  return items;
}
