import { readFileSync } from "node:fs";
import { ts } from "ts-morph";
import { describe, expect, it } from "vitest";
import { walkFiles } from "@/lib/cli/walk";

// One production walker and table; each integration group appends its own rule.
type Source = { path: string; code: string };
type Rule = { primitive: string; retired: string[]; paths: string[]; handCopy: (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, file: ts.SourceFile) => boolean; bad: string; good: string; minimum: number };
const classes = (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, file: ts.SourceFile) => node.attributes.properties.filter(ts.isJsxAttribute).find(a => a.name.getText(file) === "className")?.initializer?.getText(file) ?? "";
const RULES: Rule[] = [
  { primitive: "Card", retired: ["PanelCard", "RowCard", "PanelRows", "RowCardList", "RowCardItem"], paths: [], minimum: 20,
    handCopy: () => false,
    bad: 'import { RowCard as Local } from "@/components/ui/row-card"; export const Demo = () => <Local title="Title">Body</Local>;',
    good: 'import { Card } from "@/components/ui/card"; export const Demo = () => <Card title="Title">Body</Card>;' },
  { primitive: "EmptyState", retired: ["EmptyRowCard"], paths: ["components/projects/empty-projects.tsx", "components/onboarding/steps/repo.tsx", "app/(edit)/projects/[slug]/logs/page.tsx"], minimum: 15,
    handCopy: (node, file) => /icon=\{SearchX\}/.test(node.getText(file)),
    bad: 'import { EmptyRowCard as Blank } from "@/components/ui/row-card"; export const Demo = () => <Blank title="Empty" />;',
    good: 'import { EmptyState } from "@/components/ui/empty-state"; export const Demo = () => <EmptyState placement="inset" title="Empty" />;' },
  { primitive: "ListRow", retired: ["PanelRow", "ListItemButton"], paths: ["components/logs/event-row.tsx", "components/home/attention-card.tsx", "components/projects/project-list.tsx", "components/settings/ci-card.tsx", "components/sources/sources-screen.tsx", "components/sources/source-detail-modal.tsx"], minimum: 10,
    handCopy: (node, file) => /^(?:a|button|div|Link|Button)$/.test(node.tagName.getText(file)) && /\bpy-row-y\b/.test(classes(node, file)) && /\b(?:items-center|justify-start)\b/.test(classes(node, file)),
    bad: 'export const Demo = () => <button className="flex items-center gap-3 px-4 py-row-y">Row</button>;',
    good: 'import { ListRow } from "@/components/ui/list-row"; export const Demo = () => <ListRow as="button">Row</ListRow>;' },
  { primitive: "Fact", retired: [], paths: ["components/home/meta-column.tsx", "components/mcp/token-card.tsx", "components/mcp/connected-apps-card.tsx", "components/logs/event-detail.tsx", "components/sources/source-detail-modal.tsx"], minimum: 5,
    handCopy: (node, file) => /^(?:dt|th|TableHead)$/.test(node.tagName.getText(file)),
    bad: 'export const Demo = () => <dl><dt className="text-muted-foreground text-xs">Label</dt><dd>Value</dd></dl>;',
    good: 'import { Fact } from "@/components/ui/facts"; export const Demo = () => <dl><Fact label="Label">Value</Fact></dl>;' },
];

function scan(source: Source, rule: Rule): string[] {
  const file = ts.createSourceFile(source.path, source.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const aliases = new Map<string, string>();
  const namespaces = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !/(?:^@\/components\/ui\/|(?:\.\/|\.\.\/).*(?:card|list-item|list-row))/.test(statement.moduleSpecifier.text)) continue;
    const clause = statement.importClause?.namedBindings;
    if (clause && ts.isNamedImports(clause)) for (const item of clause.elements) {
      const name = (item.propertyName ?? item.name).text; aliases.set(item.name.text, name);
      if (rule.retired.includes(name)) hits.push(`import:${name}`);
    }
    if (clause && ts.isNamespaceImport(clause)) namespaces.add(clause.name.text);
  }
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && rule.retired.includes(node.name.text) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) hits.push(`export:${node.name.text}`);
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) for (const item of node.exportClause.elements) if (rule.retired.includes((item.propertyName ?? item.name).text)) hits.push(`export:${item.name.text}`);
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(file);
      const name = aliases.get(tag) ?? (tag.includes(".") && namespaces.has(tag.split(".")[0]!) ? tag.split(".")[1]! : tag);
      if (rule.retired.includes(name)) hits.push(`jsx:${name}`);
      if (rule.paths.includes(source.path) && rule.handCopy(node, file)) hits.push(`copy:${tag}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return hits;
}

const sources = ["components", "app"].flatMap(root => walkFiles(root).map(path => `${root}/${path}`)).filter(path => /\.[jt]sx?$/.test(path) && !path.includes("__tests__")).map(path => ({ path, code: readFileSync(path, "utf8") }));

describe.each(RULES)("$primitive production contract", rule => {
  it("has no retired bindings or owned hand copies", () => {
    expect(sources.length).toBeGreaterThan(220);
    const consumers = sources.filter(s => !s.path.startsWith("components/ui/") && new RegExp(`\\b(?:${rule.primitive}${rule.primitive === "Card" ? "|CardRows|CardList" : rule.primitive === "EmptyState" ? "|NoMatch" : ""})\\b`).test(s.code));
    expect(consumers.length).toBeGreaterThanOrEqual(rule.minimum);
    expect(sources.flatMap(s => scan(s, rule).map(hit => `${s.path}:${hit}`))).toEqual([]);
  });
  it("detects a real hand copy on its current path and permits the replacement", () => {
    const path = rule.paths[0] ?? "components/members/member-list.tsx";
    expect(scan({ path, code: rule.bad }, rule).length).toBeGreaterThan(0);
    expect(scan({ path, code: rule.good }, rule)).toEqual([]);
    expect(scan({ path, code: `// ${rule.bad}\nconst note = ${JSON.stringify(rule.bad)};` }, rule)).toEqual([]);
  });
  it("tracks renamed imports and namespace members", () => {
    for (const retired of rule.retired) {
      expect(scan({ path: "components/example.tsx", code: `import { ${retired} as Alias } from "@/components/ui/row-card"; const view = <Alias />;` }, rule)).toContain(`jsx:${retired}`);
      expect(scan({ path: "components/example.tsx", code: `import * as UI from "@/components/ui/row-card"; const view = <UI.${retired} />;` }, rule)).toContain(`jsx:${retired}`);
    }
  });
});
