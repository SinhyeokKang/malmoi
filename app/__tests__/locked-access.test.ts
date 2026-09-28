import { fileURLToPath } from "node:url";

import { Node, Project, SyntaxKind, type SourceFile } from "ts-morph";
import { describe, expect, it } from "vitest";

/**
 * **잠금 안 인가 재확인이 쓰기 트랜잭션마다 있는지 소스에서 센다** (감사 #9·#10·#26 — ARCHITECTURE §5.6.4).
 *
 * 진입점의 `getProjectAccess`는 잠금 전 1회라 대기 중 제거·강등·보관을 못 본다. 쓰는 트랜잭션이
 * `lockProjectAccess`를 부르는지를 **AST로** 센다 — 문자열 검색은 줄 끝 주석을 호출로 오인한다(감사 #80).
 * 호출은 `$transaction` 콜백 **안**이어야 한다: 밖에서 부르면 잠금이 그 트랜잭션에 걸리지 않는다.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true });

/** `파일#함수` — 인가를 다시 봐야 하는 쓰기의 **트랜잭션을 여는 자리**다. Action이 lib에 위임하면 lib 함수를 적는다. */
const SITES = [
  // changeMember · revokeInvitation (MCP change_member · revoke_invitation)
  "lib/auth/members.ts#changeMemberRole",
  "lib/auth/members.ts#revokePendingInvitation",
  // rotatePushToken (MCP rotate_push_token)
  "lib/onboarding-run/rotate-token.ts#rotateToken",
  // archiveProject · unarchiveProject (MCP archive_project · unarchive_project)
  "lib/projects/archive.ts#runArchive",
  "lib/projects/archive.ts#runUnarchive",
  // createInvitations · resendInvitation
  "lib/invitation-email/issue.ts#issueInvitations",
  "lib/invitation-email/issue.ts#reissueInvitation",
  // runFirstIngest
  "lib/onboarding/ingest.ts#ingestFirstSnapshot",
  "app/(edit)/projects/[slug]/settings/actions.ts#connectRepository",
  // updateRepositorySettings · updateProjectName (MCP update_project)
  "lib/settings/update.ts#changeBaseBranch",
  "lib/settings/update.ts#renameProject",
  "app/(edit)/projects/[slug]/settings/actions.ts#uploadProjectImage",
  "app/(edit)/projects/[slug]/settings/actions.ts#deleteProjectImage",
  // updateBaseLocale (MCP set_base_locale)
  "lib/sources/base-locale.ts#declareBaseLocale",
  // saveTranslationKey
  "lib/keys/save-key.ts#applyKeySave",
  // MCP set_translations — 배치 한 번에 잠금 한 번
  "lib/keys/save-key.ts#applyKeySaveBatch",
  // triggerPullAction (manual) — cron은 사람이 없어 requestedBy가 null이다
  "lib/sync/run.ts#startRun",
];

/**
 * **MCP 도구가 닿는 잠금 자리** (mcp-connector design §1.25). 잠금 안 재판정이 토큰까지 다시 읽으려면 호출에 `tokenId`가 실려야 한다 —
 * 빠지면 대기 중 폐기·재발급된 토큰의 쓰기가 멤버십 판정만 지나 커밋된다. 위 `SITES`의 부분집합이고, 도구가 늘면 같이 늘린다.
 */
const TOKEN_SITES = [
  "lib/auth/members.ts#changeMemberRole",
  "lib/auth/members.ts#revokePendingInvitation",
  "lib/projects/archive.ts#runArchive",
  "lib/projects/archive.ts#runUnarchive",
  "lib/invitation-email/issue.ts#issueInvitations",
  "lib/settings/update.ts#changeBaseBranch",
  "lib/settings/update.ts#renameProject",
  "lib/sources/base-locale.ts#declareBaseLocale",
  "lib/keys/save-key.ts#applyKeySave",
  "lib/keys/save-key.ts#applyKeySaveBatch",
  "lib/sync/run.ts#startRun",
  "lib/onboarding-run/rotate-token.ts#rotateToken",
];

/**
 * **raw `FOR UPDATE`로 잠그는 MCP 쓰기** — `lockProjectAccess`를 안 지나므로 잠금 직후 `lockApiToken(tx, { tokenId, … })`을 직접 부른다.
 * 수동 Sync 실행권 · Revert · 소스 추가 · 프로젝트 생성.
 */
const RAW_TOKEN_SITES = [
  "lib/import/run.ts#acquire",
  "lib/keys/revert.ts#executeKeyRevert",
  "lib/surfaces/create.ts#addSurfacesFromSnapshot",
  // 프로젝트 생성 — 잠글 프로젝트가 없어 User 행을 잠근다
  "lib/onboarding-run/create.ts#createProjectFromRepo",
];

function source(path: string): SourceFile {
  return project.getSourceFile(`${ROOT}${path}`) ?? project.addSourceFileAtPath(`${ROOT}${path}`);
}

/** 함수 안에서 `$transaction(...)` 콜백 안에 있는 `callee(...)` 호출 수. */
function lockedCalls(file: SourceFile, name: string, callee = "lockProjectAccess"): number {
  const fn = file.getFunction(name);
  if (fn === undefined) throw new Error(`${file.getBaseName()}#${name} not found`);
  return fn.getDescendantsOfKind(SyntaxKind.CallExpression).filter(call => {
    if (call.getExpression().getText() !== callee) return false;
    return call.getAncestors().some(a => Node.isCallExpression(a) && a.getExpression().getText().endsWith(".$transaction"));
  }).length;
}

/** 함수 안 `callee(tx, { … })` 호출 중 둘째 인자 객체에 `tokenId` 속성이 **없는** 것의 수. */
function callsWithoutToken(file: SourceFile, name: string, callee = "lockProjectAccess"): number {
  const fn = file.getFunction(name);
  if (fn === undefined) throw new Error(`${file.getBaseName()}#${name} not found`);
  return fn.getDescendantsOfKind(SyntaxKind.CallExpression).filter(call => {
    if (call.getExpression().getText() !== callee) return false;
    const arg = call.getArguments()[1];
    return !(arg !== undefined && Node.isObjectLiteralExpression(arg) && arg.getProperty("tokenId") !== undefined);
  }).length;
}

describe("잠금 안 인가 재확인", () => {
  it.each(SITES)("%s", site => {
    const [path, name] = site.split("#") as [string, string];
    expect(lockedCalls(source(path), name)).toBeGreaterThan(0);
  });

  it.each(TOKEN_SITES)("%s는 잠금에 tokenId를 싣는다", site => {
    const [path, name] = site.split("#") as [string, string];
    expect(TOKEN_SITES.every(s => SITES.includes(s))).toBe(true);
    expect(lockedCalls(source(path), name)).toBeGreaterThan(0);
    expect(callsWithoutToken(source(path), name)).toBe(0);
  });

  it.each(RAW_TOKEN_SITES)("%s는 잠금 tx 안에서 lockApiToken에 tokenId를 싣는다", site => {
    const [path, name] = site.split("#") as [string, string];
    expect(lockedCalls(source(path), name, "lockApiToken")).toBeGreaterThan(0);
    expect(callsWithoutToken(source(path), name, "lockApiToken")).toBe(0);
  });

  it("tokenId 검출기가 빠진 호출을 센다 — 단축 속성·대입 속성은 실린 것이다", () => {
    const file = project.createSourceFile(`${ROOT}.scratch/locked-token-fixture.ts`, [
      "async function missing(tx: any) { return lockProjectAccess(tx, { projectId: 'p' }); }",
      "async function short(tx: any, tokenId: string) { return lockProjectAccess(tx, { projectId: 'p', tokenId }); }",
      "async function assigned(tx: any, s: any) { return lockProjectAccess(tx, { projectId: 'p', tokenId: s.tokenId }); }",
      "declare function lockProjectAccess(tx: unknown, input: unknown): unknown;",
    ].join("\n"), { overwrite: true });
    expect(callsWithoutToken(file, "missing")).toBe(1);
    expect(callsWithoutToken(file, "short")).toBe(0);
    expect(callsWithoutToken(file, "assigned")).toBe(0);
  });

  // 검출기가 0을 낼 수 있어야 위의 N>0이 의미를 갖는다 (POSTMORTEM 2026-09-14).
  it("주석 속 이름·트랜잭션 밖 호출은 세지 않는다", () => {
    const file = project.createSourceFile(`${ROOT}.scratch/locked-access-fixture.ts`, [
      "async function inComment(prisma: any) { return prisma.$transaction(async (tx: any) => { tx.x(); }); } // lockProjectAccess(tx)",
      "async function outside(prisma: any, tx: any) { await lockProjectAccess(tx); return prisma.$transaction(async () => 1); }",
      "async function inside(prisma: any) { return prisma.$transaction(async (tx: any) => lockProjectAccess(tx)); }",
      "declare function lockProjectAccess(tx: unknown): unknown;",
    ].join("\n"), { overwrite: true });
    expect(lockedCalls(file, "inComment")).toBe(0);
    expect(lockedCalls(file, "outside")).toBe(0);
    expect(lockedCalls(file, "inside")).toBe(1);
  });
});
