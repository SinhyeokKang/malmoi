import { readFileSync } from "node:fs";
import { ts } from "ts-morph";
import { expect, it } from "vitest";
import { walkFiles } from "@/lib/cli/walk";

// AST traversal ignores comment trivia, so quoted violations in comments do not count.
function violations(code: string): string[] {
  const source = ts.createSourceFile("search.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && /^(localStorage|sessionStorage)$/.test(node.text)) hits.push(node.text);
    if (ts.isPropertyAccessExpression(node) && node.expression.getText(source) === "document" && node.name.text === "cookie") hits.push("document.cookie");
    if (ts.isElementAccessExpression(node) && node.expression.getText(source) === "document" && node.argumentExpression && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === "cookie") hits.push("document.cookie");
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && /^(console|analytics)$/.test(node.expression.expression.getText(source))) hits.push("logging or analytics");
    ts.forEachChild(node, visit);
  };
  visit(source); return hits;
}
it("search does not collect queries or store them in browser persistence", () => {
  const paths = ["components/search", "lib/search"].flatMap(root => walkFiles(root).filter(p => /\.[jt]sx?$/.test(p) && !p.includes("__tests__")).map(p => `${root}/${p}`));
  expect(paths.filter(p => p.startsWith("components/search/")).length).toBeGreaterThanOrEqual(2);
  expect(paths.length).toBeGreaterThan(2);
  expect(paths.flatMap(path => violations(readFileSync(path, "utf8")).map(hit => `${path}: ${hit}`))).toEqual([]);
});
it("privacy detector ignores comments but catches planted storage, cookies and tracking", () => {
  expect(violations('// localStorage\n/* sessionStorage document.cookie */ const x = "localStorage";')).toEqual([]);
  for (const code of ['window.localStorage.setItem("q", q)', 'sessionStorage.q = q', 'document.cookie = q', 'document["cookie"] = q', 'console.log(q)', 'analytics.track(q)']) expect(violations(code).length).toBeGreaterThan(0);
});
