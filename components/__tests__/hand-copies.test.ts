import { walkFiles } from "@/lib/cli/walk";
import { readFileSync } from "node:fs";
import { ts } from "ts-morph";
import { describe, expect, it } from "vitest";

// 소비자 사본과 퇴역 API를 한 워커·표에서 검사한다. 각 행의 실제 경로 카나리아가 검사기 삭제도 잡는다.
type Source = { path: string; code: string };
type Rule = { primitive: string; retired: string[]; retiredModules?: string[]; paths: string[]; handCopy: (node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, file: ts.SourceFile) => boolean; bad: string; good: string; minimum: number };
type Opening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
function classes(node: Opening, file: ts.SourceFile): string {
  const variables = new Map<string, ts.Expression>();
  const imported = new Map<string, string>();
  const collect = (part: ts.Node): void => {
    if (ts.isVariableDeclaration(part) && ts.isIdentifier(part.name) && part.initializer) variables.set(part.name.text, part.initializer);
    if (ts.isImportSpecifier(part)) imported.set(part.name.text, (part.propertyName ?? part.name).text);
    ts.forEachChild(part, collect);
  };
  collect(file);
  const read = (part: ts.Node | undefined, seen = new Set<string>()): string => {
    if (!part) return "";
    if (ts.isStringLiteralLike(part)) return part.text;
    if (ts.isJsxExpression(part)) return read(part.expression, seen);
    if (ts.isIdentifier(part)) {
      if (imported.get(part.text) === "DOC_LINK") return "#DOC_LINK";
      if (seen.has(part.text)) return "";
      return read(variables.get(part.text), new Set([...seen, part.text]));
    }
    if (ts.isCallExpression(part)) {
      const name = part.expression.getText(file);
      if (name === "buttonClass" || imported.get(name) === "buttonClass" || /\.buttonClass$/.test(name)) return "#buttonClass";
      return part.arguments.map(arg => read(arg, seen)).join(" ");
    }
    if (ts.isBinaryExpression(part)) return `${read(part.left, seen)} ${read(part.right, seen)}`;
    if (ts.isConditionalExpression(part)) return `${read(part.whenTrue, seen)} ${read(part.whenFalse, seen)}`;
    if (ts.isTemplateExpression(part)) return [part.head.text, ...part.templateSpans.flatMap(span => [read(span.expression, seen), span.literal.text])].join(" ");
    if (ts.isParenthesizedExpression(part) || ts.isAsExpression(part) || ts.isSatisfiesExpression(part)) return read(part.expression, seen);
    return "";
  };
  return read(node.attributes.properties.filter(ts.isJsxAttribute).find(attr => attr.name.getText(file) === "className")?.initializer);
}
function rawLink(node: Opening, file: ts.SourceFile): boolean {
  const tag = node.tagName.getText(file);
  if (tag === "a") return true;
  return file.statements.some(statement => ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === "next/link" && statement.importClause?.name?.text === tag);
}

// 이름을 바꾼 import·namespace도 같은 화면 컨트롤이다.
function canonicalTag(node: Opening, file: ts.SourceFile): string {
  const tag = node.tagName.getText(file);
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const binding = statement.importClause?.namedBindings;
    if (binding && ts.isNamedImports(binding)) {
      const item = binding.elements.find(item => item.name.text === tag);
      if (item) return (item.propertyName ?? item.name).text;
    }
    if (binding && ts.isNamespaceImport(binding) && tag.startsWith(`${binding.name.text}.`)) return tag.slice(binding.name.text.length + 1);
  }
  return tag;
}

const RETIRED_WIZARD_FOOTER = "export const Demo = () => (<div className=\"flex items-center gap-2\">\n              {showBack && (\n                <Button type=\"button\" size=\"lg\" onClick={onBack} disabled={busy}>\n                  {m.newProject.modal.back}\n                </Button>\n              )}\n              {/*\n                \u26a0\ufe0f **\ube44\ud65c\uc131 \ubaa8\uc591\uc744 \uaecd\ub370\uae30\uac00 \ub4e0\ub2e4** \u2014 \ud770 \ubc30\uacbd + border + muted \uae00\uc790 + `not-allowed`.\n                \ub2e8\uacc4\ub9c8\ub2e4 \ub2e4\uc2dc \ub9cc\ub4e4\uba74 \uac08\ub9b0\ub2e4.\n              */}\n              <Button\n                type=\"button\"\n                variant=\"primary\"\n                size=\"lg\"\n                onClick={onNext}\n                disabled={nextDisabled}\n                loading={busy}\n              >\n                {nextLabel ?? m.newProject.modal.next}\n                {nextArrow && <ArrowRight className=\"size-4\" aria-hidden />}\n              </Button>\n            </div>);";

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
{ primitive: "LargeModal", retired: ["OnboardingModal", "OnboardingModalProps"], paths: ["components/logs/event-dialog.tsx"], minimum: 7,
    handCopy: (node, file) => /Content$/.test(node.tagName.getText(file)) && /max-w-\[1024px\]/.test(classes(node, file)),
    bad: 'export const Demo = () => <Primitive.Content className="fixed max-w-[1024px] rounded-xl">Body</Primitive.Content>;',
    good: 'import { LARGE_MODAL_PANEL } from "@/components/ui/large-modal"; export const Demo = () => <Primitive.Content className={LARGE_MODAL_PANEL}>Body</Primitive.Content>;' },
{ primitive: "WizardFooter", retired: [], paths: ["components/onboarding/new-project.tsx"], minimum: 1,
    handCopy: (node, file) => node.tagName.getText(file) === "Button" && /size="lg"/.test(node.getText(file)) && /m\.(?:common|newProject\.modal)\.(?:back|next)/.test(node.parent.getText(file)),
    bad: RETIRED_WIZARD_FOOTER,
    good: 'import { WizardFooter } from "@/components/ui/wizard-footer"; export const Demo = () => <WizardFooter onNext={() => {}} />;' },
{ primitive: "ButtonLink", retired: [], paths: ["components/publish-button.tsx", "*"], minimum: 8,
    handCopy: (node, file) => rawLink(node, file) && /#buttonClass/.test(classes(node, file)),
    bad: 'import NextLink from "next/link"; import {buttonClass as style} from "@/components/ui/button"; const FOOTER_LINK = cn(style({variant: "default"}), "gap-2"); export const Demo = () => <NextLink\n href="/docs"\n className={FOOTER_LINK}>Docs</NextLink>;',
    good: 'import {ButtonLink} from "@/components/ui/button"; export const Demo = () => <ButtonLink href="/docs">Docs</ButtonLink>;' },
{ primitive: "Link", retired: ["DOC_LINK"], paths: ["components/docs/guide-markdown.tsx", "*"], minimum: 15,
    handCopy: (node, file) => rawLink(node, file) && /(?:^|\s)text-link(?:\s|$)|#DOC_LINK/.test(classes(node, file)),
    bad: 'import Alias from "next/link"; const BLUE = "text-link"; export const Demo = () => <Alias className={cn(BLUE, "ring-2")} href="/docs">Docs</Alias>;',
    good: 'import {Link} from "@/components/ui/link"; export const Demo = () => <><Link href="/docs">Docs</Link><span className="text-link">Color only</span></>;' },
{ primitive: "Popover", retired: ["TreeOverlay"], paths: ["components/translations/workspace/workspace.tsx"], minimum: 1,
    handCopy: (node, file) => node.tagName.getText(file) === "div" && /\babsolute\b/.test(classes(node, file)) && /\btop-14\b/.test(classes(node, file)) && /\bw-70\b/.test(classes(node, file)),
    bad: 'export const Demo = () => <div className="absolute top-14 left-3 w-70 shadow-md">Tree</div>;',
    good: 'import {Popover} from "@/components/ui/popover"; export const Demo = () => <Popover open id="tree" aria-label="Sources" anchor={ref} onOpenChange={change}>Tree</Popover>;' },
{ primitive: "Meter", retired: ["MeterBar"], paths: ["components/locale-meter.tsx", "components/sources/source-detail-modal.tsx"], minimum: 2,
    handCopy: (node, file) => /^(?:div|span)$/.test(node.tagName.getText(file)) && /\bh-1\b/.test(classes(node, file)) && /\brounded-full\b/.test(classes(node, file)),
    bad: 'export const Demo = () => <span aria-hidden className="flex h-1 rounded-full"><span style={{width: "40%"}} /></span>;',
    good: 'import {Meter} from "@/components/ui/meter"; export const Demo = () => <Meter done={40} review={0} />;' },
{ primitive: "ErrorState", retired: [], paths: ["app/(edit)/error.tsx", "app/(edit)/projects/[slug]/logs/error.tsx"], minimum: 2,
    handCopy: (node, file) => node.tagName.getText(file) === "EmptyState" && /icon=\{CircleX\}/.test(node.getText(file)),
    bad: 'export const Demo = () => <EmptyState icon={CircleX} title="Failed" action={<Button onClick={retry}>Retry</Button>} />;',
    good: 'import {ErrorState} from "@/components/ui/error-state"; export const Demo = () => <ErrorState title="Failed" retry={retry} retryLabel="Retry" />;' },
{ primitive: "SelectRow", retired: [], paths: ["components/onboarding/steps/repo.tsx", "components/onboarding/steps/naming.tsx", "components/onboarding/steps/files.tsx", "components/mcp/token-grant-fields.tsx"], minimum: 4,
    handCopy: (node, file) => /^(?:li|div)$/.test(canonicalTag(node, file)) && /border-t/.test(classes(node, file)) && /hover:bg-foreground/.test(classes(node, file)) || canonicalTag(node, file) === "span" && /size-4/.test(classes(node, file)) && /rounded-full/.test(classes(node, file)) && /border/.test(classes(node, file)),
    bad: 'export const Demo = () => <li className="border-t border-divider hover:bg-foreground/[0.03]"><Radio label="Repo" value="repo" /></li>;',
    good: 'import {SelectRow} from "@/components/ui/select-row"; export const Demo = () => <li><SelectRow input="radio" checked value="repo" label="Repo" /></li>;' },
{ primitive: "ProjectThumbnail", retired: [], retiredModules: ["@/components/projects/project-thumbnail"], paths: ["components/invite/project-card.tsx", "components/settings/general-card.tsx"], minimum: 7,
    handCopy: (node, file) => canonicalTag(node, file) === "ImageTile" && /hueFill/.test(node.getText(file)),
    bad: 'export const Demo = () => <ImageTile className="size-8 rounded-sm" fallback={<span className={hueFill(name)}><Box /></span>} />;',
    good: 'import {ProjectThumbnail} from "@/components/ui/project-thumbnail"; export const Demo = () => <ProjectThumbnail size="md" name={name} />;' },
{ primitive: "Skeleton", retired: ["SkeletonLine"], paths: [], minimum: 10,
    handCopy: () => false,
    bad: 'import {SkeletonLine as Line} from "@/components/ui/skeleton"; export const Demo = () => <Line size="xs" />;',
    good: 'import {Skeleton} from "@/components/ui/skeleton"; export const Demo = () => <Skeleton size="xs" />;' }
];

function scan(source: Source, rule: Rule): string[] {
  const file = ts.createSourceFile(source.path, source.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const aliases = new Map<string, string>();
  const namespaces = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !/(?:^@\/components\/|^\.\.?\/)/.test(statement.moduleSpecifier.text)) continue;
    if (rule.retiredModules?.includes(statement.moduleSpecifier.text)) hits.push(`module:${statement.moduleSpecifier.text}`);
    const clause = statement.importClause?.namedBindings;
    if (clause && ts.isNamedImports(clause)) for (const item of clause.elements) {
      const name = (item.propertyName ?? item.name).text; aliases.set(item.name.text, name);
      if (rule.retired.includes(name)) hits.push(`import:${name}`);
    }
    if (clause && ts.isNamespaceImport(clause)) namespaces.add(clause.name.text);
  }
  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && rule.retired.includes(declaration.name.text)) hits.push(`export:${declaration.name.text}`);
    }
    if ((ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) && rule.retired.includes(node.name.text) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) hits.push(`export:${node.name.text}`);
    if (ts.isFunctionDeclaration(node) && node.name && rule.retired.includes(node.name.text) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) hits.push(`export:${node.name.text}`);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && rule.retiredModules?.includes(node.moduleSpecifier.text)) hits.push(`module:${node.moduleSpecifier.text}`);
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) for (const item of node.exportClause.elements) if (rule.retired.includes((item.propertyName ?? item.name).text)) hits.push(`export:${item.name.text}`);
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(file);
      const name = aliases.get(tag) ?? (tag.includes(".") && namespaces.has(tag.split(".")[0]!) ? tag.split(".")[1]! : tag);
      if (rule.retired.includes(name)) hits.push(`jsx:${name}`);
      if ((rule.paths.includes(source.path) || rule.paths.includes("*") && !source.path.startsWith("components/ui/")) && rule.handCopy(node, file)) hits.push(`copy:${tag}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return hits;
}

const sources = ["components", "app", "messages"].flatMap(root => walkFiles(root).map(path => `${root}/${path}`)).filter(path => /\.[jt]sx?$/.test(path) && !path.includes("__tests__")).map(path => ({ path, code: readFileSync(path, "utf8") }));

describe.each(RULES)("$primitive production contract", rule => {
  it("fixtures have zero TSX parseDiagnostics", () => {
    for (const code of [rule.bad, rule.good]) {
      const parsed = ts.createSourceFile("fixture.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] };
      expect(parsed.parseDiagnostics).toEqual([]);
    }
  });
  it("has no retired bindings or owned hand copies", () => {
    expect(sources.length).toBeGreaterThan(220);
    const consumers = sources.filter(s => !s.path.startsWith("components/ui/") && new RegExp(`\\b(?:${rule.primitive}${rule.primitive === "Card" ? "|CardRows|CardList" : rule.primitive === "EmptyState" ? "|NoMatch" : ""})\\b`).test(s.code));
    expect(consumers.length).toBeGreaterThanOrEqual(rule.minimum);
    expect(sources.flatMap(s => scan(s, rule).map(hit => `${s.path}:${hit}`))).toEqual([]);
  });
  it("detects a synthetic canary on its current path and permits the replacement", () => {
    const path = rule.paths[0] ?? "components/members/member-list.tsx";
    expect(scan({ path, code: rule.bad }, rule).length).toBeGreaterThan(0);
    expect(scan({ path, code: rule.good }, rule)).toEqual([]);
    expect(scan({ path, code: `${rule.bad.split("\n").map(line => `// ${line}`).join("\n")}\nconst note = ${JSON.stringify(rule.bad)};` }, rule)).toEqual([]);
  });
  it("tracks moved module aliases, namespaces and reexports", () => {
    for (const module of rule.retiredModules ?? []) for (const code of [
      `import {${rule.primitive} as Local} from "${module}"; export const Demo = () => <Local />;`,
      `import * as UI from "${module}"; export const Demo = () => <UI.${rule.primitive} />;`,
      `export {${rule.primitive} as Local} from "${module}";`,
    ]) expect(scan({path: rule.paths[0] ?? "components/example.tsx", code}, rule)).toContain(`module:${module}`);
  });
  it("tracks renamed imports and namespace members", () => {
    for (const retired of rule.retired) {
      expect(scan({ path: "components/ui/example.tsx", code: `export const ${retired} = true;` }, rule)).toContain(`export:${retired}`);
      expect(scan({ path: "components/ui/example.tsx", code: `export type ${retired} = {};` }, rule)).toContain(`export:${retired}`);
      expect(scan({ path: "components/example.tsx", code: `import { ${retired} as Alias } from "@/components/ui/row-card"; const view = <Alias />;` }, rule)).toContain(`jsx:${retired}`);
      expect(scan({ path: "components/example.tsx", code: `import * as UI from "@/components/ui/row-card"; const view = <UI.${retired} />;` }, rule)).toContain(`jsx:${retired}`);
    }
  });
});

// 사전은 import 없는 데이터 잎이라 이 메일 링크 한 곳만 기존 PrivacyDoc의 조상 링을 받는다.
function dictionaryAnchors(source: Source): string[] {
  const file = ts.createSourceFile(source.path, source.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sites: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === "a") {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const href = attrs.find(a => a.name.getText(file) === "href")?.initializer;
      let parent: ts.Node | undefined = node.parent;
      const properties: string[] = []; let deletion = false; let firstBlock = false;
      while (parent) {
        if (ts.isPropertyAssignment(parent)) properties.push(parent.name.getText(file));
        if (ts.isObjectLiteralExpression(parent)) deletion ||= parent.properties.some(p => ts.isPropertyAssignment(p) && p.name.getText(file) === "id" && ts.isStringLiteral(p.initializer) && p.initializer.text === "deletion");
        if (ts.isArrayLiteralExpression(parent) && ts.isPropertyAssignment(parent.parent) && parent.parent.name.getText(file) === "blocks") firstBlock = parent.elements[0]?.getText(file).includes(node.getText(file)) ?? false;
        parent = parent.parent;
      }
      const expected = href && ts.isStringLiteral(href) && href.text === "mailto:ox501501@gmail.com" && attrs.length === 1 && ts.isJsxOpeningElement(node) && node.parent.children.map(child => child.getText(file)).join("").trim() === "ox501501@gmail.com";
      sites.push(expected && deletion && firstBlock && ["p", "blocks", "sections", "privacy", "publicDocs"].every(p => properties.includes(p)) ? "publicDocs.privacy.sections[deletion].blocks[0].p" : "unexpected anchor");
    }
    ts.forEachChild(node, visit);
  };
  visit(file); return sites;
}
function headerSite(code: string): string[] {
  const file = ts.createSourceFile("components/shell/header.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sites: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) && /className=\{PUBLIC_HEADER_LINK\}/.test(node.getText(file)) && /href=\{routes\.newProject\(\)\}/.test(node.getText(file))) {
      let parent: ts.Node | undefined = node.parent;
      while (parent && !ts.isFunctionDeclaration(parent)) parent = parent.parent;
      const owner = parent && ts.isFunctionDeclaration(parent) ? parent.name?.text : undefined;
      sites.push(owner === "Header" && node.parent.children.some(child => ts.isJsxSelfClosingElement(child) && child.tagName.getText(file) === "NewProjectIcon") ? "Header/new-project" : "unexpected header copy");
    }
    ts.forEachChild(node, visit);
  };
  visit(file); return sites;
}
it("the dictionary permits exactly the privacy/deletion mailto site, with no stale or extra sites", () => {
  expect(sources.filter(s => s.path.startsWith("messages/")).flatMap(s => dictionaryAnchors(s).map(site => `${s.path}:${site}`))).toEqual(["messages/en.tsx:publicDocs.privacy.sections[deletion].blocks[0].p"]);
  const code = 'const dictionary = {publicDocs:{privacy:{sections:[{id:"deletion",blocks:[{p:<a href="mailto:ox501501@gmail.com">ox501501@gmail.com</a>}]}]}}};';
  expect(dictionaryAnchors({path:"messages/en.tsx",code})).toEqual(["publicDocs.privacy.sections[deletion].blocks[0].p"]);
  expect(dictionaryAnchors({path:"messages/en.tsx",code:code.replace('id:"deletion"','id:"other"')})).toEqual(["unexpected anchor"]);
  expect(dictionaryAnchors({path:"messages/en.tsx",code:code+' const extra = <a href="/docs">Extra</a>;'})).toHaveLength(2);
  expect(dictionaryAnchors({path:"messages/en.tsx",code:'const dictionary = {};'})).toEqual([]);
});
it("the header retains its one exact navigation contract and rejects neighboring copies", () => {
  const actual = readFileSync("components/shell/header.tsx", "utf8");
  expect(headerSite(actual)).toEqual(["Header/new-project"]);
  expect(actual).not.toContain('"use client"');
  expect(headerSite(actual+' function Neighbor(){return <Link href={routes.newProject()} className={PUBLIC_HEADER_LINK}><NewProjectIcon /></Link>;}')).toEqual(["Header/new-project", "unexpected header copy"]);
  expect(headerSite(actual.replace('className={PUBLIC_HEADER_LINK}', 'className="text-link"'))).toEqual([]);
});



// base150d221c의 실제 퇴역 JSX·함수 조각이다. 래퍼만 파서용으로 덧붙인다.
const RETIRED_P3_SOURCES = [
{
    "primitive": "SelectRow",
    "path": "components/onboarding/steps/repo.tsx",
    "code": "const P3RetiredProbe = () => (<li\n                key={repo.fullName}\n                className={cn(\n                  index > 0 && \"border-t\",\n                  index > 0 && (active || prevActive ? \"border-border\" : \"border-divider\"),\n                  active ? \"bg-muted\" : \"hover:bg-foreground/[0.03]\",\n                )}\n              >\n                <div className=\"p-3\">\n                  <Radio\n                    value={repo.fullName}\n                    className=\"gap-3\"\n                    label={\n                      <>\n                        {/*\n                          ⚠️ **글리프에 톤 색을 주지 않는다** — 아직 프로젝트가 아니라 후보다\n                          (`/projects` 목록의 `hueFill`과 반대). 선택되면 **칩만** 흰색으로 뒤집혀\n                          muted 면 위에서 떠오른다.\n                        */}\n                        <IconTile size=\"lg\" className={active ? \"bg-background\" : \"bg-muted\"}>\n                          <FolderGit2 aria-hidden />\n                        </IconTile>\n                        <span className=\"flex min-w-0 flex-1 flex-col gap-0.5\">\n                          <span className=\"block truncate text-base font-medium\">{repo.repo}</span>\n                          {/*\n                            ⚠️ **선택 행에서 색이 바뀐다** — muted 면 위에서 `muted-foreground`는\n                            4.34:1로 AA 미달이다 (핸드오프 · DESIGN §2.2).\n                          */}\n                          <span className={cn(\"block truncate text-sm\", active ? \"text-foreground/60\" : \"text-muted-foreground\")}>\n                            {repo.owner}\n                            {repo.pushedAt !== null && ` · ${m.newProject.repo.pushedAt(relativeTime(new Date(repo.pushedAt), new Date(now)))}`}\n                          </span>\n                        </span>\n                      </>\n                    }\n                  />\n                </div>\n                {active && <BranchRow state={state} onChange={onBranchChange} />}\n              </li>);"
  },
{
    "primitive": "ProjectThumbnail",
    "path": "components/invite/project-card.tsx",
    "code": "const P3RetiredProbe = () => (<ImageTile\n        src={image}\n        className=\"flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm text-white\"\n        fallback={<span className={hueFill(name)}><Box className=\"size-4\" /></span>}\n      />);"
  },
{
    "primitive": "Skeleton",
    "path": "app/(edit)/account/loading.tsx",
    "code": "import { Skeleton, SkeletonLine } from \"@/components/ui/skeleton\";\nconst P3RetiredProbe = () => (<SkeletonLine size=\"lg\" className=\"w-32\" />);"
  }
];

it.each(RETIRED_P3_SOURCES)("$primitive actual retired base150 source is detected on $path", fixture => {
  const parsed = ts.createSourceFile(fixture.path, fixture.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] };
  expect(parsed.parseDiagnostics).toEqual([]);
  expect(scan(fixture, RULES.find(rule => rule.primitive === fixture.primitive)!).length).toBeGreaterThan(0);
});
