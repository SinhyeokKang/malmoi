/**
 * MCP 도구 카탈로그 (mcp-connector design §2 — PRODUCT §4.3 ⑤의 개방 조건이던 "도구 목록과 쓰기 범위"). `tools/list`가 **이 배열
 * 순서로** 등록된다 — SDK가 등록 순서를 그대로 내보내므로(design §1.1 실측) 여기가 순서의 정본이다. 두 CLI가 화면에서 이름순으로
 * 다시 정렬하는 것은 클라이언트 쪽 일이다.
 *
 * ⚠️ **잎 데이터 모듈이다** — 소비자는 서버 쪽 둘(`lib/mcp/server.ts`·`lib/mcp/tools/access.ts`)이고 `/mcp` 화면은 읽지
 * 않는다. 그래도 값 import를 두지 않는 이유: 도구 구현(`lib/mcp/tools/*`) → 카탈로그 방향이 뒤집히면 순환이 된다. 서버 전용 표시도 붙이지 않는다 — 순수 판정·테스트가 바로 import한다.
 * 그래서 `Permission`·`TokenGrant`도 문자열로 다시 적는다 — 어휘가 셋·넷이라 복제 비용보다 그래프를 비워 두는 쪽이 싸다.
 *
 * **역할 조건과 토큰 grant 조건은 별개 필드다** — 역할의 permission을 grant로 자동 복제하지 않는다(tasks T6). `rolePermission: null`은
 * 프로젝트 역할이 없는 동작(계정 조회·생성 준비), `tokenGrant: null`은 grant 없는 토큰도 되는 동작이다.
 */

type RolePermission = "translation:write" | "project:settings" | "member:manage";
type Grant = RolePermission | "project:create";

export type ToolRequirement = { rolePermission: RolePermission | null; tokenGrant: Grant | null };

export type ToolSpec = {
  name: string;
  /** MCP 클라이언트가 확인창을 띄우는 근거다 — 인가 조건이 아니다. */
  annotations: { readOnlyHint: boolean; destructiveHint: boolean };
  /** 입력이 신규 리포(`{ owner, repo }`)인지 기존 프로젝트(`{ slug }`)인지로 조건이 갈리는 도구는 둘을 따로 든다(design §2.1). */
  access: ToolRequirement | { newProject: ToolRequirement; existingProject: ToolRequirement };
};

const READ = { readOnlyHint: true, destructiveHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true } as const;

const req = (rolePermission: RolePermission | null, tokenGrant: Grant | null): ToolRequirement => ({ rolePermission, tokenGrant });

const CATALOG: readonly ToolSpec[] = [
  // 읽기 16 — grant 없는 토큰은 내 프로젝트 안의 데이터를 읽는다. GitHub 계정 열거·파일 다운로드만 grant를 요구한다.
  { name: "whoami", annotations: READ, access: req(null, null) },
  { name: "list_projects", annotations: READ, access: req(null, null) },
  { name: "get_project", annotations: READ, access: req("translation:write", null) },
  { name: "list_repositories", annotations: READ, access: req(null, "project:create") },
  // 기존 프로젝트의 브랜치 목록은 PRODUCT §3의 읽기 예외다(검수 K).
  { name: "list_branches", annotations: READ, access: { newProject: req(null, "project:create"), existingProject: req("project:settings", null) } },
  { name: "detect_formats", annotations: READ, access: { newProject: req(null, "project:create"), existingProject: req("project:settings", "project:settings") } },
  { name: "list_keys", annotations: READ, access: req("translation:write", null) },
  { name: "get_key", annotations: READ, access: req("translation:write", null) },
  { name: "preview_publish", annotations: READ, access: req("translation:write", null) },
  { name: "preview_sync", annotations: READ, access: req("project:settings", null) },
  { name: "preview_revert", annotations: READ, access: req("project:settings", null) },
  { name: "preview_source_removal", annotations: READ, access: req("project:settings", null) },
  { name: "list_events", annotations: READ, access: req("translation:write", null) },
  { name: "get_workflow", annotations: READ, access: req("project:settings", null) },
  { name: "list_members", annotations: READ, access: req("translation:write", null) },
  // 공개 가이드 원고 — 프로젝트 입력이 없어 역할·grant 둘 다 없다(`whoami`와 같다).
  { name: "read_docs", annotations: READ, access: req(null, null) },
  // 쓰기 15 — 역할과 grant 둘 다 요구한다. `project:create`만 프로젝트 역할이 없다.
  { name: "create_project", annotations: WRITE, access: req(null, "project:create") },
  { name: "add_sources", annotations: WRITE, access: req("project:settings", "project:settings") },
  { name: "set_translations", annotations: WRITE, access: req("translation:write", "translation:write") },
  { name: "publish", annotations: WRITE, access: req("translation:write", "translation:write") },
  { name: "sync_repository", annotations: DESTRUCTIVE, access: req("project:settings", "project:settings") },
  { name: "revert_to_last_sent", annotations: DESTRUCTIVE, access: req("project:settings", "project:settings") },
  { name: "update_project", annotations: WRITE, access: req("project:settings", "project:settings") },
  { name: "set_base_locale", annotations: WRITE, access: req("project:settings", "project:settings") },
  // 편집 폐기는 재추가 때 일어나지만 승인은 여기서 받는다 — 확인창 근거로 destructive다(`sync_repository`와 같다).
  { name: "remove_source", annotations: DESTRUCTIVE, access: req("project:settings", "project:settings") },
  { name: "rotate_push_token", annotations: DESTRUCTIVE, access: req("project:settings", "project:settings") },
  { name: "invite_members", annotations: WRITE, access: req("member:manage", "member:manage") },
  { name: "revoke_invitation", annotations: DESTRUCTIVE, access: req("member:manage", "member:manage") },
  { name: "change_member", annotations: DESTRUCTIVE, access: req("member:manage", "member:manage") },
  { name: "archive_project", annotations: DESTRUCTIVE, access: req("project:settings", "project:settings") },
  { name: "unarchive_project", annotations: WRITE, access: req("project:settings", "project:settings") },
];

export function toolCatalog(): readonly ToolSpec[] {
  return CATALOG;
}
