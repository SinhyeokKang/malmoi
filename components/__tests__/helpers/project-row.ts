import type { ProjectTodo } from "@/lib/inbox/project-todos";
import type { ProjectListRow } from "@/lib/keys/query";
import { planProjectRow } from "@/lib/projects/list";

/** 목록 행 픽스처 — 서버가 싣는 판정(`plan`)과 메타 넷은 비워 두고 `planned`가 채운다. */
export type RowFixture = Omit<ProjectListRow, "plan" | "sourceCount" | "keyCount" | "languageCount" | "lastSync">
  & Partial<Pick<ProjectListRow, "sourceCount" | "keyCount" | "languageCount" | "lastSync">>;

/**
 * 서버 조립(`assembleProjectListRows`)처럼 판정을 싣는다 — 픽스처의 사건 필드(`unsent`·`review`)에서 DB 할 일을 만들고 `planProjectRow`를 지난다.
 * 화면은 판정하지 않으므로, 픽스처가 판정을 손으로 적으면 테스트가 화면이 아니라 픽스처를 재게 된다.
 */
export function planned(row: RowFixture, extra: readonly ProjectTodo[] = []): ProjectListRow {
  const todos: ProjectTodo[] = [
    ...(row.unsent > 0 ? [{ kind: "unsent" as const, at: null, count: row.unsent, surfaceSlug: row.unsentSurfaceSlug ?? "default", ownerRetries: false }] : []),
    ...(row.review > 0 ? [{ kind: "review" as const, at: null, surfaceSlug: row.reviewSurfaceSlug ?? "default", code: "ko", name: "Korean", count: row.review, who: null, ownerRetries: false }] : []),
    ...extra,
  ];
  return { sourceCount: 1, keyCount: 0, languageCount: 0, lastSync: null, ...row, plan: planProjectRow(row, todos) };
}
