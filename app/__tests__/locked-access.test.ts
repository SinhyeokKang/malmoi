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
  "app/(edit)/projects/actions.ts#changeMember",
  "app/(edit)/projects/actions.ts#revokeInvitation",
  "app/(edit)/projects/actions.ts#rotatePushToken",
  "app/(edit)/projects/actions.ts#archiveProject",
  "app/(edit)/projects/actions.ts#unarchiveProject",
  // createInvitations · resendInvitation
  "lib/invitation-email/issue.ts#issueInvitations",
  "lib/invitation-email/issue.ts#reissueInvitation",
  // runFirstIngest
  "lib/onboarding/ingest.ts#ingestFirstSnapshot",
  "app/(edit)/projects/[slug]/settings/actions.ts#connectRepository",
  "app/(edit)/projects/[slug]/settings/actions.ts#updateRepositorySettings",
  "app/(edit)/projects/[slug]/settings/actions.ts#updateProjectName",
  "app/(edit)/projects/[slug]/settings/actions.ts#uploadProjectImage",
  "app/(edit)/projects/[slug]/settings/actions.ts#deleteProjectImage",
  "app/(edit)/projects/[slug]/sources/actions.ts#updateBaseLocale",
  // saveTranslationKey
  "lib/keys/save-key.ts#applyKeySave",
  // triggerPullAction (manual) — cron은 사람이 없어 requestedBy가 null이다
  "lib/sync/run.ts#startRun",
];

function source(path: string): SourceFile {
  return project.getSourceFile(`${ROOT}${path}`) ?? project.addSourceFileAtPath(`${ROOT}${path}`);
}

/** 함수 안에서 `$transaction(...)` 콜백 안에 있는 `lockProjectAccess(...)` 호출 수. */
function lockedCalls(file: SourceFile, name: string): number {
  const fn = file.getFunction(name);
  if (fn === undefined) throw new Error(`${file.getBaseName()}#${name} not found`);
  return fn.getDescendantsOfKind(SyntaxKind.CallExpression).filter(call => {
    if (call.getExpression().getText() !== "lockProjectAccess") return false;
    return call.getAncestors().some(a => Node.isCallExpression(a) && a.getExpression().getText().endsWith(".$transaction"));
  }).length;
}

describe("잠금 안 인가 재확인", () => {
  it.each(SITES)("%s", site => {
    const [path, name] = site.split("#") as [string, string];
    expect(lockedCalls(source(path), name)).toBeGreaterThan(0);
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
