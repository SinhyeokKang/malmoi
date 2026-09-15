import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Project, SyntaxKind } from "ts-morph";

const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
function directAssembly(source: string): string[] {
  const file = project.createSourceFile("actions.ts", source, { overwrite: true });
  const action = file.getFunction("runRepositoryImport");
  if (!action) return ["missing action"];
  return action.getDescendantsOfKind(SyntaxKind.CallExpression).map(call => call.getExpression().getText())
    .filter(name => ["buildPushPayload", "applyPush", "applyPushInTransaction"].includes(name));
}
it("Action은 페이로드 조립·저장을 직접 하지 않는다", () => {
  expect(directAssembly(readFileSync("app/(edit)/projects/actions.ts", "utf8"))).toEqual([]);
});
it("스캐너는 직접 조립 변형을 거부하고 공용 헬퍼 내부 재사용은 허용한다", () => {
  expect(directAssembly("export async function runRepositoryImport() { applyPush(); }")).toEqual(["applyPush"]);
  expect(directAssembly("function helper() { applyPush(); } export async function runRepositoryImport() { helper(); }")).toEqual([]);
});
