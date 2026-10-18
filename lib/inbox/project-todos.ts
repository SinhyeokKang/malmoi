import { canPerform, type Role } from "@/lib/auth/permission";
import type { AttentionItem } from "@/lib/home/attention";
// ⚠️ 타입만 문다 — `lib/locales/todo.ts`는 게이트 모듈을 값으로 물어 클라이언트 그래프에 들어가면 안 된다(Inbox 섬이 이 파일을 문다).
import type { LanguageTodo } from "@/lib/locales/todo";
import type { ProjectStatus } from "@/lib/projects/list";

/** 목록 집계는 검토 시각을 읽지 않는다. 모르는 시각을 만들지 않고 Inbox의 실제 시각도 보존한다. */
export type ProjectAttention = Exclude<AttentionItem, { kind: "review" }>
  | (Omit<Extract<AttentionItem, { kind: "review" }>, "at"> & { at: Date | null });
type ProjectTask =
  | { kind: "needs_reconnect"; at: Date | null }
  | { kind: "setup"; at: Date }
  | { kind: "unsent"; at: Date | null; count: number; surfaceSlug: string }
  /** 언어 변경만 아직 Publish되지 않았다(language-request-todo). `held`는 CI 적재 게이트(`planLocaleImportGate`)의 결론이다. */
  | ({ kind: "language_unsent" } & LanguageTodo);
export type ProjectTodo = (ProjectAttention | ProjectTask) & { ownerRetries: boolean };
export type ProjectTodoInput<T extends ProjectAttention = ProjectAttention> = {
  status: ProjectStatus; role: Role; createdAt: Date;
  connectionPinned: boolean; gitlabTokenExpiresAt: Date | null;
  /** 작업 언어로 거른 Attention 재료. Inbox는 collectAttention, 목록은 기존 집계에서 만든다. */
  attention: readonly T[];
  unsent: { count: number; surfaceSlug: string; at: Date | null } | null;
  /** 언어 변경 작업 — 서버 로더가 `languageTodo`로 접어 넘긴다. */
  language: LanguageTodo | null;
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
  // 역할로 거르지 않는다 — Publish가 `translation:write`라 두 역할 모두의 일이다. 끊긴 프로젝트에서도 미발송처럼 선다(design D7).
  if (input.language !== null && input.language.count > 0) items.push({ kind: "language_unsent", ...input.language, ownerRetries: false });
  return items;
}
