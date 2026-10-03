import { existsSync, readFileSync } from "node:fs";
import { ts } from "ts-morph";
import { describe, expect, it } from "vitest";

function parsed(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

describe("T3 미사용 프리미티브/API 제거", () => {
  it("Breadcrumb 모듈이 없다", () => {
    expect(existsSync("components/ui/breadcrumb.tsx")).toBe(false);
  });

  // `SegmentBody`는 `Tabs`가 같은 칸 몸통을 쓰려고 export한다(project-card-tabs).
  it("segment 모듈의 실제 사용 함수·content 타입만 남는다", () => {
    const source = parsed("components/ui/segmented-control.tsx");
    const exported = source.statements.filter((node) => ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
    expect(exported.filter(ts.isFunctionDeclaration).map((node) => node.name?.text)).toEqual(["SegmentBody", "SegmentedControl"]);
    expect(exported.filter(ts.isTypeAliasDeclaration).map((node) => node.name.text)).toEqual(["SegmentContent"]);
  });

  it("Avatar의 선언·구조 분해에 shape 축이 없다", () => {
    const avatar = parsed("components/ui/avatar.tsx").statements.filter(ts.isFunctionDeclaration).find((node) => node.name?.text === "Avatar");
    expect(avatar).toBeDefined();
    const parameter = avatar!.parameters[0]!;
    expect(ts.isObjectBindingPattern(parameter.name)).toBe(true);
    expect(ts.isTypeLiteralNode(parameter.type!)).toBe(true);
    expect((parameter.name as ts.ObjectBindingPattern).elements.map((node) => node.name.getText())).not.toContain("shape");
    expect((parameter.type as ts.TypeLiteralNode).members.map((node) => node.name?.getText())).not.toContain("shape");
  });
});
