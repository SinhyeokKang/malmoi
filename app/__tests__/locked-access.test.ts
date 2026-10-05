import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
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
  // removeSource (MCP remove_source)
  "lib/surfaces/remove.ts#removeSurface",
  // saveTranslationKey
  "lib/keys/save-key.ts#applyKeySave",
  // MCP set_translations — 배치 한 번에 잠금 한 번
  "lib/keys/save-key.ts#applyKeySaveBatch",
  // triggerPullAction (manual) — cron은 사람이 없어 requestedBy가 null이다
  "lib/sync/run.ts#startRun",
];

/**
 * **MCP 도구가 닿는 잠금 자리** (mcp-connector design §1.25). 잠금 안 재판정이 토큰까지 다시 읽으려면 호출에 `credential`이 실려야 한다 —
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
  "lib/surfaces/remove.ts#removeSurface",
  "lib/keys/save-key.ts#applyKeySave",
  "lib/keys/save-key.ts#applyKeySaveBatch",
  "lib/sync/run.ts#startRun",
  "lib/onboarding-run/rotate-token.ts#rotateToken",
];

/**
 * **raw `FOR UPDATE`로 잠그는 MCP 쓰기** — `lockProjectAccess`를 안 지나므로 잠금 직후 `lockCredential(tx, { credential, … })`을 직접 부른다.
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

/** 함수 안 `callee(tx, { … })` 호출 중 둘째 인자 객체에 `credential` 속성이 **없는** 것의 수. */
function callsWithoutToken(file: SourceFile, name: string, callee = "lockProjectAccess"): number {
  const fn = file.getFunction(name);
  if (fn === undefined) throw new Error(`${file.getBaseName()}#${name} not found`);
  return fn.getDescendantsOfKind(SyntaxKind.CallExpression).filter(call => {
    if (call.getExpression().getText() !== callee) return false;
    const arg = call.getArguments()[1];
    return !(arg !== undefined && Node.isObjectLiteralExpression(arg) && arg.getProperty("credential") !== undefined);
  }).length;
}

/**
 * **주체를 받은 함수는 `credential`을 버리지 못한다** (mcp-connector r2). 잠금 자리 입력의 `credential`은 필수 키라 **빠뜨리면** 컴파일
 * 에러지만, 리터럴 `credential: undefined`는 타입을 지난다 — 주체(`subject`)를 받은 코어가 그렇게 쓰면 MCP 토큰의 잠금 뒤 재판정이 조용히
 * 사라진다. 세션·cron 전용 경로(주체를 안 받는다)만 `undefined`를 명시한다.
 */
function droppedTokens(file: SourceFile): string[] {
  return file.getFunctions().filter(fn => fn.getParameters().some(p => p.getName() === "subject")).flatMap(fn =>
    fn.getDescendantsOfKind(SyntaxKind.PropertyAssignment)
      .filter(p => p.getName() === "credential" && p.getInitializer()?.getText() === "undefined")
      .map(() => `${file.getBaseName()}#${fn.getName() ?? "?"}`));
}

function libSources(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    if (entry === "__tests__") return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return libSources(full);
    return entry.endsWith(".ts") ? [full] : [];
  });
}

describe("잠금 안 인가 재확인", () => {
  it.each(SITES)("%s", site => {
    const [path, name] = site.split("#") as [string, string];
    expect(lockedCalls(source(path), name)).toBeGreaterThan(0);
  });

  it.each(TOKEN_SITES)("%s는 잠금에 credential을 싣는다", site => {
    const [path, name] = site.split("#") as [string, string];
    expect(TOKEN_SITES.every(s => SITES.includes(s))).toBe(true);
    expect(lockedCalls(source(path), name)).toBeGreaterThan(0);
    expect(callsWithoutToken(source(path), name)).toBe(0);
  });

  it.each(RAW_TOKEN_SITES)("%s는 잠금 tx 안에서 lockCredential에 credential을 싣는다", site => {
    const [path, name] = site.split("#") as [string, string];
    expect(lockedCalls(source(path), name, "lockCredential")).toBeGreaterThan(0);
    expect(callsWithoutToken(source(path), name, "lockCredential")).toBe(0);
  });

  it("주체를 받은 lib 함수가 credential을 리터럴 undefined로 버리지 않는다", () => {
    const files = libSources(`${ROOT}lib`);
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap(path => droppedTokens(source(path.slice(ROOT.length))))).toEqual([]);
  });

  it("버린 credential 검출기가 주체 함수의 리터럴 undefined만 잡는다", () => {
    const file = project.createSourceFile(`${ROOT}.scratch/dropped-token-fixture.ts`, [
      "function dropped(subject: any) { return lock({ userId: subject.userId, credential: undefined }); }",
      "function passed(subject: any) { return lock({ userId: subject.userId, credential: subject.credential }); }",
      "function session(userId: string) { return lock({ userId, credential: undefined }); }",
      "declare function lock(input: unknown): unknown;",
    ].join("\n"), { overwrite: true });
    expect(droppedTokens(file)).toEqual(["dropped-token-fixture.ts#dropped"]);
  });

  it("credential 검출기가 빠진 호출을 센다 — 단축 속성·대입 속성은 실린 것이다", () => {
    const file = project.createSourceFile(`${ROOT}.scratch/locked-token-fixture.ts`, [
      "async function missing(tx: any) { return lockProjectAccess(tx, { projectId: 'p' }); }",
      "async function short(tx: any, credential: string) { return lockProjectAccess(tx, { projectId: 'p', credential }); }",
      "async function assigned(tx: any, s: any) { return lockProjectAccess(tx, { projectId: 'p', credential: s.credential }); }",
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
