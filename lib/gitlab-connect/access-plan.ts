import { z } from "zod";

import { classifyGitLabFailure } from "@/lib/gitlab/transport";

import type { RemoteResult } from "./verify";

/**
 * **호출자의 GitLab 리포 권한 판정** (design §3 `checkRepoAccess` · tasks §2 B2). 입력은 호출자 PAT로 읽은
 * `GET /projects/<id>/members/all/<호출자 GitLab user id>` — 상속·공유 그룹을 포함한 **유효 권한**이다(`GET /projects/:id`의 `permissions`는
 * 그룹 상속을 `project_access: null`로 줘서 틀린다).
 *
 * 쓰기 = Maintainer(40) 이상 · 읽기 = Reporter(20) 이상(Guest는 private 코드를 못 읽는다) · 404 = 멤버 아님(거부). ①의 목록 필터
 * `min_access_level=40`과 기준이 같다.
 *
 * ⚠️ **access level이 없으면 거부가 아니라 `unavailable`이다** — 모양이 다른 응답을 "권한 없음"으로 읽으면 있는 권한을 없다고 믿는다
 * (POSTMORTEM 2026-09-03). ⚠️ 401은 `reconnect`다 — `unavailable`로 접지 않는다(POSTMORTEM 2026-09-19).
 */
export const MAINTAINER = 40;
export const REPORTER = 20;

const Member = z.object({ access_level: z.number().int(), state: z.string().optional(), membership_state: z.string().optional() });

/** 대기·차단이 아닌 멤버 상태 — 실측 응답은 `state`·`membership_state` 둘 다 `active`다. 필드가 없으면 판정하지 않는다(옛 인스턴스). */
const ACTIVE = new Set(["active"]);

export type MemberAccessVerdict = "ok" | "read-only" | "forbidden" | "reconnect" | "unavailable";

export function planMemberAccess(result: RemoteResult, requirePush: boolean): MemberAccessVerdict {
  return planLevel(result, requirePush ? MAINTAINER : null);
}

/** sync 브랜치 push·MR 생성 — Developer(30)면 된다(보호되지 않은 브랜치). */
export const DEVELOPER = 30;

/**
 * **프로젝트가 참조하는 연결의 토큰 주인**이 지금 그 리포에 쓸 수 있나 (R-C Astra 🟡1). 입력은 그 연결의 PAT로 읽은
 * `members/all/<토큰 주인 GitLab user id>`(상속 포함 유효 권한)다 — 호출자의 PAT·권한이 아니다.
 * 기준이 생성·재연결(`planMemberAccess(…, true)` — Maintainer)과 다르다: 주인이 Developer로 강등돼도 보호되지 않은 sync 브랜치 push·MR은 계속 된다
 * (design §2 사례 표). Reporter 이하는 읽기만 된다 — `read-only`(Publish·no-changes 정리를 막는다, 수동 Sync는 읽기라 막지 않는다).
 */
export function planConnectionPushAccess(result: RemoteResult): MemberAccessVerdict {
  return planLevel(result, DEVELOPER);
}

function planLevel(result: RemoteResult, writeLevel: number | null): MemberAccessVerdict {
  if (!result.ok) {
    const failure = classifyGitLabFailure(result.error);
    if (failure === "reauthorize" || failure === "scope-missing") return "reconnect";
    // 404 = 멤버 아님 · 403 = 프로젝트를 볼 수 없다. 둘 다 "이 사람은 이 리포에 닿지 않는다"이다.
    if (failure === "not-found" || failure === "forbidden") return "forbidden";
    return "unavailable";
  }
  const parsed = Member.safeParse(result.body);
  if (!parsed.success) return "unavailable";
  // ⚠️ 초대 수락·승인 대기(`awaiting`)·차단 멤버도 `access_level`이 실린다 — 대기를 통과시키면 쓰기가 늦게 403/404로 드러난다(R-B ⚪3).
  const { state, membership_state } = parsed.data;
  if ((state !== undefined && !ACTIVE.has(state)) || (membership_state !== undefined && !ACTIVE.has(membership_state))) return "forbidden";
  const level = parsed.data.access_level;
  if (level < REPORTER) return "forbidden";
  if (writeLevel !== null && level < writeLevel) return "read-only";
  return "ok";
}

const ProjectMeta = z.object({
  id: z.number().int().positive(),
  path_with_namespace: z.string().min(1),
  default_branch: z.string().nullable().optional(),
  archived: z.boolean(),
  repository_object_format: z.string().optional(),
});

export type ProjectMetaVerdict =
  | { status: "ok"; repositoryId: string; owner: string; name: string; defaultBranch: string; archived: boolean }
  | { status: "unsupported" | "forbidden" | "reconnect" | "unavailable" };

/**
 * `GET /projects/<id>` → 주소·기본 브랜치·보관·object format. **필요한 필드만 읽는다** — 응답에 `runners_token`이 실린다(design §2 실측 표).
 *
 * ⚠️ 응답 id가 요청한 id와 다르면 `unavailable`이다(숫자 id로 불렀으니 동어반복이어야 한다 — 다르면 무엇을 연결할지 모른다).
 * `path_with_namespace`의 마지막 조각이 path, 앞이 namespace 전체(`group/subgroup`)다.
 */
export function planProjectMeta(result: RemoteResult, repositoryId: string): ProjectMetaVerdict {
  if (!result.ok) {
    const failure = classifyGitLabFailure(result.error);
    if (failure === "reauthorize" || failure === "scope-missing") return { status: "reconnect" };
    if (failure === "not-found" || failure === "forbidden") return { status: "forbidden" };
    return { status: "unavailable" };
  }
  const parsed = ProjectMeta.safeParse(result.body);
  if (!parsed.success || String(parsed.data.id) !== repositoryId) return { status: "unavailable" };
  const meta = parsed.data;
  // 형식이 없으면 sha1이다(필드가 생기기 전 인스턴스). sha1이 아니면 blob id가 로컬 `git hash-object`와 다르다(spec §5).
  if ((meta.repository_object_format ?? "sha1") !== "sha1") return { status: "unsupported" };
  const slash = meta.path_with_namespace.lastIndexOf("/");
  if (slash <= 0 || slash === meta.path_with_namespace.length - 1) return { status: "unavailable" };
  // 빈 리포는 기본 브랜치가 없다 — 적재할 파일도 없으니 `main`으로 둔다(①에서 브랜치를 고른다).
  return {
    status: "ok",
    repositoryId,
    owner: meta.path_with_namespace.slice(0, slash),
    name: meta.path_with_namespace.slice(slash + 1),
    defaultBranch: meta.default_branch ?? "main",
    archived: meta.archived,
  };
}
