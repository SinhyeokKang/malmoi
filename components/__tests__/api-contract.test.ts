import { readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import { ts } from "ts-morph";
import { describe, expect, it } from "vitest";

import { walkFiles } from "@/lib/cli/walk";

/** component-unify design §3 / §5.2. Entries are debts, never path-wide exemptions.
 * Remove a row with its owning task: both new violations and obsolete exemptions fail.
 * This is a naming/source contract; T5 owns behavior, including busy vs loading.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RULES = ["state", "variant", "hue", "size", "width", "progress", "slots", "rest", "data-tone", "aria", "className"] as const;
type Rule = (typeof RULES)[number];
type Violation = { rule: Rule; path: string; symbol: string; detail: string; count: number };
type Debt = Violation & { task: string };
type Source = { path: string; code: string };
type Component = { name: string; node: ts.Node; props: Map<string, ts.TypeNode | undefined> };

function visit(node: ts.Node, fn: (node: ts.Node) => void): void {
  fn(node);
  ts.forEachChild(node, child => visit(child, fn));
}
const nameOf = (node: ts.PropertyName | ts.BindingName): string =>
  ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : node.getText();
const exported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
const parse = ({ path, code }: Source): ts.SourceFile => ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function components(file: ts.SourceFile, publicOnly = true): Component[] {
  const aliases = new Map<string, ts.TypeNode>();
  const publicNames = new Set<string>();
  for (const statement of file.statements) {
    if (ts.isTypeAliasDeclaration(statement)) aliases.set(statement.name.text, statement.type);
    if (ts.isInterfaceDeclaration(statement)) aliases.set(statement.name.text, ts.factory.createTypeLiteralNode(statement.members));
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const item of statement.exportClause.elements) publicNames.add((item.propertyName ?? item.name).text);
    }
  }
  const propsOf = (type: ts.TypeNode | undefined, seen = new Set<string>()): Map<string, ts.TypeNode | undefined> => {
    const out = new Map<string, ts.TypeNode | undefined>();
    if (!type) return out;
    if (ts.isTypeLiteralNode(type)) {
      for (const prop of type.members) if (ts.isPropertySignature(prop)) out.set(nameOf(prop.name), prop.type);
    } else if (ts.isIntersectionTypeNode(type) || ts.isUnionTypeNode(type)) {
      for (const part of type.types) for (const [key, value] of propsOf(part, seen)) out.set(key, value);
    } else if (ts.isParenthesizedTypeNode(type)) {
      return propsOf(type.type, seen);
    } else if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && !seen.has(type.typeName.text)) {
      const name = type.typeName.text;
      return propsOf(aliases.get(name), new Set([...seen, name]));
    }
    return out;
  };
  const out: Component[] = [];
  const add = (name: string, node: ts.FunctionLikeDeclaration): void => {
    if (!/^[A-Z]/.test(name)) return;
    const parameter = node.parameters[0];
    const props = propsOf(parameter?.type);
    if (parameter && ts.isObjectBindingPattern(parameter.name)) {
      for (const prop of parameter.name.elements) {
        if (!prop.dotDotDotToken) {
          const key = nameOf(prop.propertyName ?? prop.name);
          if (!props.has(key)) props.set(key, undefined);
        }
      }
    }
    out.push({ name, node, props });
  };
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && (!publicOnly || exported(statement) || publicNames.has(statement.name.text))) add(statement.name.text, statement);
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer && (!publicOnly || exported(statement) || publicNames.has(declaration.name.text)) &&
        (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) add(declaration.name.text, declaration.initializer);
    }
    // Content records are public slots too, even when nested in an options prop.
    if (ts.isTypeAliasDeclaration(statement) && exported(statement) && /Content$/.test(statement.name.text)) {
      out.push({ name: statement.name.text, node: statement, props: propsOf(statement.type) });
    }
  }
  return out;
}

/** Returned outer elements, excluding nested callback returns and decorative descendants. */
function roots(node: ts.Node): (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] {
  const out: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
  const expression = (value: ts.Node): void => {
    if (ts.isJsxElement(value)) out.push(value.openingElement);
    else if (ts.isJsxSelfClosingElement(value)) out.push(value);
    else if (ts.isParenthesizedExpression(value)) expression(value.expression);
    else if (ts.isConditionalExpression(value)) { expression(value.whenTrue); expression(value.whenFalse); }
  };
  const walk = (part: ts.Node): void => {
    if (part !== node && ts.isFunctionLike(part)) return;
    if (ts.isReturnStatement(part) && part.expression) expression(part.expression);
    ts.forEachChild(part, walk);
  };
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) expression(node.body);
  else walk(node);
  return out;
}

function scan(sources: readonly Source[], restDemand: readonly { path: string; symbol: string }[] = []): Violation[] {
  const files = new Map(sources.map(source => [source.path, parse(source)]));
  const hits: Violation[] = [];
  const add = (rule: Rule, path: string, symbol: string, detail: string): void => { hits.push({ rule, path, symbol, detail, count: 1 }); };
  const resolve = (from: string, module: string): string | undefined => {
    const stem = module.startsWith("@/") ? module.slice(2) : module.startsWith(".") ? posix.normalize(join(dirname(from), module)) : undefined;
    if (stem === undefined) return undefined;
    return [stem, `${stem}.tsx`, `${stem}.ts`, `${stem}/index.tsx`, `${stem}/index.ts`].find(path => files.has(path));
  };
  // Resolve named, namespace, alias and barrel imports without matching JSX text.
  const origin = (path: string, symbol: string, seen = new Set<string>()): { path: string; symbol: string } => {
    const key = `${path}:${symbol}`;
    if (seen.has(key)) return { path, symbol };
    const next = new Set([...seen, key]);
    const file = files.get(path);
    if (file) for (const statement of file.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const target = resolve(path, statement.moduleSpecifier.text);
      if (!target) continue;
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        const item = statement.exportClause.elements.find(item => item.name.text === symbol);
        if (item) return origin(target, (item.propertyName ?? item.name).text, next);
      } else if (!statement.exportClause) {
        const candidate = files.get(target);
        if (candidate && components(candidate).some(component => component.name === symbol)) return origin(target, symbol, next);
      }
    }
    return { path, symbol };
  };
  for (const [path, file] of files) {
    const imports = new Map<string, { path: string; symbol: string }>();
    const spinnerImports = new Set<string>();
    const constants = new Map<string, ts.Expression>();
    const typeAliases = new Map<string, ts.TypeNode>();
    visit(file, node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) constants.set(node.name.text, node.initializer);
      if (ts.isBindingElement(node) && ts.isIdentifier(node.name) && node.initializer) constants.set(node.name.text, node.initializer);
      if (ts.isTypeAliasDeclaration(node)) typeAliases.set(node.name.text, node.type);
    });
    for (const statement of file.statements) if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const named = statement.importClause?.namedBindings;
      if (statement.moduleSpecifier.text === "lucide-react" && named && ts.isNamedImports(named)) {
        for (const item of named.elements) if ((item.propertyName ?? item.name).text === "Loader2") spinnerImports.add(item.name.text);
      }
      const target = resolve(path, statement.moduleSpecifier.text);
      if (!target) continue;
      const binding = statement.importClause?.namedBindings;
      if (binding && ts.isNamedImports(binding)) for (const item of binding.elements) {
        const imported = origin(target, (item.propertyName ?? item.name).text);
        imports.set(item.name.text, imported);
        if (["lib/tone.ts", "lib/hue.ts", "components/ui/tone.ts"].includes(imported.path) && ["Tone", "TONES", "toneOf", "toneFill"].includes(imported.symbol)) add("hue", path, `import:${item.name.text}`, imported.symbol);
      }
      if (binding && ts.isNamespaceImport(binding)) {
        // Qualified JSX is resolved on demand below.
        imports.set(binding.name.text, { path: target, symbol: "*" });
      }
    }
    const unwrap = (value: ts.Expression): ts.Expression => {
      while (ts.isAsExpression(value) || ts.isTypeAssertionExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value)) value = value.expression;
      return value;
    };
    // Only local literal aliases and the observed keyof typeof object-table shape.
    // No external typechecker, arbitrary type operators or compiler framework.
    const axisValues = (type: ts.TypeNode, seen = new Set<string>()): (string | number)[] => {
      if (ts.isLiteralTypeNode(type)) {
        if (ts.isStringLiteral(type.literal)) return [type.literal.text];
        if (ts.isNumericLiteral(type.literal)) return [Number(type.literal.text)];
      }
      if (ts.isUnionTypeNode(type)) return type.types.flatMap(part => axisValues(part, seen));
      if (ts.isParenthesizedTypeNode(type)) return axisValues(type.type, seen);
      if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && !seen.has(type.typeName.text)) {
        const alias = typeAliases.get(type.typeName.text);
        return alias ? axisValues(alias, new Set([...seen, type.typeName.text])) : [];
      }
      if (ts.isTypeOperatorNode(type) && type.operator === ts.SyntaxKind.KeyOfKeyword && ts.isTypeQueryNode(type.type) && ts.isIdentifier(type.type.exprName)) {
        const value = constants.get(type.type.exprName.text);
        const table = value && unwrap(value);
        if (table && ts.isObjectLiteralExpression(table)) return table.properties.flatMap(property => {
          if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return [];
          return [ts.isNumericLiteral(property.name) ? Number(property.name.text) : nameOf(property.name)];
        });
      }
      return [];
    };
    const valueName = (value: ts.Node | undefined, seen = new Set<string>()): string | undefined => {
      if (!value) return undefined;
      if (ts.isJsxExpression(value)) return valueName(value.expression, seen);
      if (ts.isIdentifier(value)) {
        if (seen.has(value.text)) return undefined;
        const constant = constants.get(value.text);
        if (constant) return valueName(constant, new Set([...seen, value.text]));
        const binding = imports.get(value.text);
        if (binding?.path === "lib/i18n/index.ts" && binding.symbol === "m") return "m";
        return value.text;
      }
      if (ts.isPropertyAccessExpression(value)) {
        const base = valueName(value.expression, seen);
        return base ? `${base}.${value.name.text}` : undefined;
      }
      if (ts.isParenthesizedExpression(value) || ts.isAsExpression(value) || ts.isSatisfiesExpression(value)) return valueName(value.expression, seen);
      return undefined;
    };
    const stateTone = (type: ts.TypeNode): boolean => {
      const values = axisValues(type);
      return values.length > 0 ? values.every(value => typeof value === "string" && ["muted", "success", "warning", "danger"].includes(value)) :
        ts.isTypeReferenceNode(type) && type.typeName.getText(file) === "StateTone";
    };
    const strings = (node: ts.Node | undefined, seen = new Set<string>()): string[] => {
      if (!node) return [];
      if (ts.isStringLiteralLike(node)) return [node.text];
      if (ts.isIdentifier(node)) {
        if (seen.has(node.text)) return [];
        return strings(constants.get(node.text), new Set([...seen, node.text]));
      }
      // Only expressions: do not treat callback bodies, comments or property names as classes.
      if (ts.isCallExpression(node)) return node.arguments.flatMap(arg => strings(arg, seen));
      if (ts.isConditionalExpression(node)) return [...strings(node.whenTrue, seen), ...strings(node.whenFalse, seen)];
      if (ts.isBinaryExpression(node)) return [...strings(node.left, seen), ...strings(node.right, seen)];
      if (ts.isParenthesizedExpression(node) || ts.isJsxExpression(node)) return strings(node.expression, seen);
      if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.flatMap(span => [...strings(span.expression, seen), span.literal.text])];
      return [];
    };
    const api = path.startsWith("components/ui/") || path === "components/search-input.tsx";
    const definitions = components(file);
    if (api) for (const component of definitions) {
      const { name, props, node } = component;
      for (const [prop, type] of props) {
        if (prop === "statusTone") add("state", path, name, prop);
        if (["footer", "headerAction", "subtitle", "secondary", "detail", "glyph", "leading"].includes(prop)) add("slots", path, name, prop);
        if (prop !== "className" && /ClassName$/.test(prop)) add("className", path, name, prop);
        if (["describedBy", "labelledBy", "ariaDescribedBy", "ariaLabelledBy"].includes(prop)) add("aria", path, name, prop);
        if (/^(?:nextPending|isBusy|isLoading|pending)$/.test(prop)) add("progress", path, name, prop);
        if (prop === "text" && name === "SkeletonLine") add("size", path, name, "text");
        if (prop === "size" && name !== "Avatar" && type) for (const value of axisValues(type)) {
          if (typeof value === "number") add("size", path, name, `numeric size:${value}`);
          else if (!["xs", "sm", "md", "lg", "icon-xs", "icon-sm", "icon-md", "icon-lg"].includes(value)) add("size", path, name, `size:${value}`);
        }
        if (prop === "spinnerSize" && type) for (const value of axisValues(type)) {
          if (!["sm", "md"].includes(String(value))) add("size", path, name, `spinnerSize:${value}`);
        }
        if (prop === "width" && type) for (const value of axisValues(type)) {
          if (![132, 160, 168, 192, 220, 240, 256, 320, "full"].includes(value)) add("width", path, name, `width:${value}`);
        }
        if (prop === "tone" && type) {
          if (!stateTone(type)) add("state", path, name, "tone is not StateTone");
        }
      }
      if (props.has("tone")) {
        const marked = roots(node).some(root => root.attributes.properties.some(part => ts.isJsxAttribute(part) && part.name.getText(file) === "data-tone"));
        if (!marked) add("data-tone", path, name, "missing data-tone");
      }
      if (["Input", "SelectTrigger", "SearchInput"].includes(name) && !props.has("width")) add("width", path, name, "missing width prop");
      if (name === "FormGroup") {
        // Bare children cannot receive generated -error/-help ids. Behavioral wiring
        // (merging existing ids / choosing help vs error) remains a render contract.
        visit(node, part => {
          if (ts.isJsxExpression(part) && part.expression && ts.isIdentifier(part.expression) && part.expression.text === "children") add("aria", path, name, "unconnected children");
        });
      }
      if (restDemand.some(demand => demand.path === path && demand.symbol === name)) {
        const forwards = roots(node).some(root => root.attributes.properties.some(ts.isJsxSpreadAttribute));
        if (!forwards) add("rest", path, name, "consumer needs root data-* forwarding");
      }
    }
    // A local state wrapper (the live Note) is still a state entry point, even
    // though its other screen-specific props are outside the primitive API scan.
    if (!api) for (const component of components(file, false)) {
      const type = component.props.get("tone");
      if (!type) continue;
      const toneReferences = new Set(["tone"]);
      const node = component.node;
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
        const parameter = node.parameters[0];
        if (parameter && ts.isIdentifier(parameter.name)) toneReferences.add(`${parameter.name.text}.tone`);
        if (parameter && ts.isObjectBindingPattern(parameter.name)) for (const binding of parameter.name.elements) {
          if (nameOf(binding.propertyName ?? binding.name) === "tone") toneReferences.add(nameOf(binding.name));
        }
      }
      // The live adapter forwards tone through one conditional, possibly via a
      // local alias. Inspect returned branches, not unrelated conditional inputs.
      const forwardsTone = (value: ts.Node | undefined, seen = new Set<string>()): boolean => {
        if (!value) return false;
        if (toneReferences.has(valueName(value) ?? "")) return true;
        if (ts.isJsxExpression(value) || ts.isParenthesizedExpression(value) || ts.isAsExpression(value) || ts.isSatisfiesExpression(value)) return forwardsTone(value.expression, seen);
        if (ts.isConditionalExpression(value)) return forwardsTone(value.whenTrue, seen) || forwardsTone(value.whenFalse, seen);
        if (ts.isIdentifier(value) && !seen.has(value.text)) return forwardsTone(constants.get(value.text), new Set([...seen, value.text]));
        return false;
      };
      let wrapper = false;
      visit(component.node, part => {
        if (!ts.isJsxOpeningElement(part) && !ts.isJsxSelfClosingElement(part)) return;
        const binding = imports.get(part.tagName.getText(file));
        if (binding?.path !== "components/ui/alert.tsx" || binding.symbol !== "Alert") return;
        const variant = part.attributes.properties.find((attr): attr is ts.JsxAttribute => ts.isJsxAttribute(attr) && attr.name.getText(file) === "variant");
        if (forwardsTone(variant?.initializer)) wrapper = true;
      });
      if (wrapper && !stateTone(type)) add("state", path, component.name, "tone is not StateTone");
    }
    visit(file, node => {
      if (ts.isConditionalExpression(node)) {
        let spinner = false;
        visit(node.whenTrue, part => { if ((ts.isJsxSelfClosingElement(part) || ts.isJsxOpeningElement(part)) && spinnerImports.has(part.tagName.getText(file))) spinner = true; });
        visit(node.whenFalse, part => { if ((ts.isJsxSelfClosingElement(part) || ts.isJsxOpeningElement(part)) && spinnerImports.has(part.tagName.getText(file))) spinner = true; });
        if (spinner) {
          let parent: ts.Node | undefined = node.parent;
          let menuItem = false;
          while (parent && !ts.isFunctionLike(parent)) {
            if (ts.isJsxElement(parent)) {
              const imported = imports.get(parent.openingElement.tagName.getText(file));
              // An actual DropdownMenuItem has its own pending semantics (T6 coordinator
              // decision); this excludes the control, never the whole user-menu file.
              menuItem = imported?.path === "components/ui/dropdown-menu.tsx" && imported.symbol === "DropdownMenuItem";
              break;
            }
            parent = parent.parent;
          }
          if (!menuItem) {
            let owner: ts.Node | undefined = node.parent;
            while (owner && !ts.isFunctionLike(owner)) owner = owner.parent;
            const symbol = owner && ts.isFunctionDeclaration(owner) && owner.name ? owner.name.text : "glyph replacement";
            add("progress", path, symbol, "manual pending glyph replacement");
          }
        }
      }
      // Inspect cva's axis records and the canon's type, never words in comments.
      if (api && ts.isPropertyAssignment(node) && ["variant", "size"].includes(nameOf(node.name)) && ts.isObjectLiteralExpression(node.initializer) &&
        ts.isObjectLiteralExpression(node.parent) && ts.isPropertyAssignment(node.parent.parent) && nameOf(node.parent.parent.name) === "variants") {
        const axis = nameOf(node.name);
        let parent: ts.Node | undefined = node;
        while (parent && !ts.isVariableDeclaration(parent)) parent = parent.parent;
        const symbol = parent && ts.isVariableDeclaration(parent) ? nameOf(parent.name) : "cva";
        for (const property of node.initializer.properties) if (ts.isPropertyAssignment(property)) {
          const value = nameOf(property.name);
          if (axis === "variant" && symbol === "badge" && ["muted", "neutral", "success", "warning", "missing"].includes(value)) add("variant", path, symbol, value);
          if (axis === "size" && !["xs", "sm", "md", "lg", "icon-xs", "icon-sm", "icon-md", "icon-lg"].includes(value)) add("size", path, symbol, value);
        }
      }
      if (path === "lib/status/canon.ts" && ts.isTypeAliasDeclaration(node) && node.name.text === "StateVariant") visit(node.type, part => {
        if (ts.isStringLiteral(part) && ["muted", "neutral", "success", "warning", "missing"].includes(part.text)) add("variant", path, "StateVariant", part.text);
      });
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /(?:^@\/|\/|^)lib\/tone$/.test(node.moduleSpecifier.text)) add("hue", path, "import", "lib/tone");
      if (["lib/tone.ts", "lib/hue.ts", "components/ui/tone.ts"].includes(path) && (ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name && exported(node) && ["toneOf", "toneFill", "Tone"].includes(node.name.text)) add("hue", path, node.name.text, "avatar hue name");
      if (["lib/tone.ts", "lib/hue.ts"].includes(path) && ts.isVariableStatement(node) && exported(node)) for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === "TONES") add("hue", path, "TONES", "avatar hue name");
      }
      if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
      const local = node.tagName.getText(file);
      const [namespace, member] = local.split(".");
      const imported = imports.get(local) ?? (namespace && member && imports.get(namespace)?.symbol === "*" ? origin(imports.get(namespace)!.path, member) : undefined);
      const symbol = imported?.symbol ?? local;
      const primitive = imported?.path.startsWith("components/ui/") || imported?.path === "components/search-input.tsx";
      const attr = (name: string): ts.JsxAttribute | undefined => node.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(file) === name);
      const classes = strings(attr("className")?.initializer).flatMap(value => value.split(/\s+/)).filter(Boolean);
      const panelClasses = strings(attr("panelClassName")?.initializer).flatMap(value => value.split(/\s+/)).filter(Boolean);
      const inputClasses = symbol === "SearchInput" && primitive ? strings(attr("inputClassName")?.initializer).flatMap(value => value.split(/\s+/)).filter(Boolean) : [];
      for (const token of [...classes, ...panelClasses]) if (/^\[&_\.animate-spin\]:size-/.test(token)) add("size", path, symbol, token);
      if (primitive) {
        for (const token of inputClasses) if (/(?:^|:)(?:w|min-w|max-w)-/.test(token)) add("width", path, symbol, `inputClassName:${token}`);
        const width = attr("width")?.initializer;
        if (width) {
          const value = ts.isStringLiteral(width) ? width.text : ts.isJsxExpression(width) && width.expression && ts.isNumericLiteral(width.expression) ? Number(width.expression.text) : undefined;
          if (value !== undefined && ![132, 160, 168, 192, 220, 240, 256, 320, "full"].includes(value)) add("width", path, symbol, `width:${value}`);
        }
        if (!path.startsWith("components/ui/") && ["Input", "SelectTrigger", "SearchInput"].includes(symbol)) for (const token of classes) {
          if (/(?:^|:)(?:w|min-w|max-w)-/.test(token)) add("width", path, symbol, token);
          if (symbol === "Input" && /(?:^|:)(?:h-\d|text-xs|border-0)/.test(token)) add("size", path, symbol, token);
        }
        if (["Button", "ButtonLink"].includes(symbol)) for (const token of classes) {
          if (/(?:^|:)size-(?:6|7|8|9)$/.test(token)) add("size", path, symbol, token);
        }
      }
      if (primitive && ["Button", "ButtonLink"].includes(symbol) && ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)) {
        for (const child of node.parent.children) if (ts.isJsxExpression(child) && child.expression && ts.isBinaryExpression(child.expression) &&
          child.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && ts.isPrefixUnaryExpression(child.expression.left) &&
          /pending/i.test(child.expression.left.operand.getText(file))) add("progress", path, symbol, "pending glyph guard");
      }
      // A second tone -> Badge mapping outside the canon is a state entry point.
      if (symbol === "Badge" && primitive && attr("variant")) {
        const initializer = attr("variant")!.initializer;
        if (initializer && ts.isJsxExpression(initializer) && initializer.expression && ts.isElementAccessExpression(initializer.expression) &&
          path !== "lib/status/canon.ts") add("state", path, "Badge", "tone mapping outside canon");
      }
      if (symbol === "Badge" && primitive && ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)) {
        // Proven state labels from S6 inventory. Appearance/count/locale/role labels
        // do not become states merely because the Badge has a colored preset.
        const stateLabels = new Set(["mcpConnector.token.expired", "logs.archived.badge", "sources.waiting", "sources.missingRepo"]);
        for (const child of node.parent.children) {
          const label = valueName(child);
          if (label?.startsWith("m.") && stateLabels.has(label.slice(2))) add("state", path, "Badge", `direct state:${label.slice(2)}`);
        }
      }
    });
  }
  const grouped = new Map<string, Violation>();
  for (const hit of hits) {
    const key = JSON.stringify([hit.rule, hit.path, hit.symbol, hit.detail]);
    const previous = grouped.get(key);
    grouped.set(key, { ...hit, count: (previous?.count ?? 0) + 1 });
  }
  return [...grouped.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

const SOURCES = ["app", "components", "lib"].flatMap(dir => walkFiles(join(ROOT, dir))
  .filter(path => /\.tsx?$/.test(path) && !path.split("/").includes("__tests__") && !/\.(?:test|integration)\./.test(path))
  .map(path => ({ path: `${dir}/${path}`, code: readFileSync(join(ROOT, dir, path), "utf8") })));

// No data-* only wrapper consumer was found (design §3/S5). Do not manufacture rest debt.
const REST_DEMAND: readonly { path: string; symbol: string }[] = [];
// Update only the affected cells when resolving debt, alongside its exact allowlist rows.
const CARDINALITY: Record<Rule, { rows: number; occurrences: number }> = {
  state: { rows: 0, occurrences: 0 }, variant: { rows: 0, occurrences: 0 },
  hue: { rows: 0, occurrences: 0 }, size: { rows: 6, occurrences: 6 },
  width: { rows: 36, occurrences: 42 }, progress: { rows: 7, occurrences: 7 },
  slots: { rows: 8, occurrences: 8 }, rest: { rows: 0, occurrences: 0 },
  "data-tone": { rows: 1, occurrences: 1 }, aria: { rows: 3, occurrences: 3 },
  className: { rows: 4, occurrences: 4 },
};
const ALLOWLIST: Debt[] = [
  { rule: "progress", path: "components/projects/new-project-button.tsx", symbol: "NewProjectButton", detail: "manual pending glyph replacement", count: 1, task: "T15" },
  { rule: "progress", path: "components/shell/new-project-icon.tsx", symbol: "NewProjectIcon", detail: "manual pending glyph replacement", count: 1, task: "T15" },
  { rule: "progress", path: "components/logs/row-chevron.tsx", symbol: "RowChevron", detail: "manual pending glyph replacement", count: 1, task: "T16" },
  { rule: "aria", path: "components/ui/form-group.tsx", symbol: "FormGroup", detail: "unconnected children", count: 1, task: "T11" },
  { rule: "aria", path: "components/ui/row-card.tsx", symbol: "RowCardList", detail: "labelledBy", count: 1, task: "T11" },
  { rule: "aria", path: "components/ui/segmented-control.tsx", symbol: "SegmentedControl", detail: "describedBy", count: 1, task: "T11" },
  { rule: "className", path: "components/search-input.tsx", symbol: "SearchInput", detail: "inputClassName", count: 1, task: "T10" },
  { rule: "className", path: "components/ui/image-tile.tsx", symbol: "ImageTile", detail: "fallbackClassName", count: 1, task: "T11" },
  { rule: "className", path: "components/ui/modal.tsx", symbol: "OnboardingModal", detail: "panelClassName", count: 1, task: "T11" },
  { rule: "className", path: "components/ui/radio.tsx", symbol: "Radio", detail: "labelClassName", count: 1, task: "T11" },
  { rule: "data-tone", path: "components/ui/row-card.tsx", symbol: "BannerLine", detail: "missing data-tone", count: 1, task: "T11" },
  { rule: "progress", path: "components/home/sync-button.tsx", symbol: "Button", detail: "pending glyph guard", count: 1, task: "T11" },
  { rule: "progress", path: "components/reconnect-button.tsx", symbol: "Button", detail: "pending glyph guard", count: 1, task: "T11" },
  { rule: "progress", path: "components/submit-button.tsx", symbol: "Button", detail: "pending glyph guard", count: 1, task: "T11" },
  { rule: "progress", path: "components/ui/modal.tsx", symbol: "OnboardingModal", detail: "nextPending", count: 1, task: "T11" },
  { rule: "size", path: "components/shell/project-switcher.tsx", symbol: "Input", detail: "border-0", count: 1, task: "T19a" },
  { rule: "size", path: "components/shell/project-switcher.tsx", symbol: "Input", detail: "h-8", count: 1, task: "T19a" },
  { rule: "size", path: "components/translations/workspace/locale-panel.tsx", symbol: "Input", detail: "h-7", count: 1, task: "T19a" },
  { rule: "size", path: "components/translations/workspace/locale-panel.tsx", symbol: "Input", detail: "text-xs", count: 1, task: "T19a" },
  { rule: "size", path: "components/translations/workspace/tree-panel.tsx", symbol: "Input", detail: "h-8", count: 1, task: "T19a" },
  { rule: "size", path: "components/translations/workspace/tree-panel.tsx", symbol: "Input", detail: "text-xs", count: 1, task: "T19a" },
  { rule: "slots", path: "components/ui/dialog.tsx", symbol: "DialogContent", detail: "footer", count: 1, task: "T11" },
  { rule: "slots", path: "components/ui/entity-card.tsx", symbol: "EntityCard", detail: "secondary", count: 1, task: "T11" },
  { rule: "slots", path: "components/ui/modal.tsx", symbol: "OnboardingModal", detail: "footer", count: 1, task: "T11" },
  { rule: "slots", path: "components/ui/modal.tsx", symbol: "OnboardingModal", detail: "headerAction", count: 1, task: "T14" },
  { rule: "slots", path: "components/ui/panel-card.tsx", symbol: "PanelCard", detail: "subtitle", count: 1, task: "T11" },
  { rule: "slots", path: "components/ui/panel-card.tsx", symbol: "PanelRow", detail: "detail", count: 1, task: "T11" },
  { rule: "slots", path: "components/ui/panel-card.tsx", symbol: "PanelRow", detail: "glyph", count: 1, task: "T11" },
  { rule: "slots", path: "components/ui/segmented-control.tsx", symbol: "SegmentContent", detail: "leading", count: 1, task: "T11" },
  { rule: "width", path: "app/(edit)/account/page.tsx", symbol: "Input", detail: "w-80", count: 1, task: "T10" },
  { rule: "width", path: "components/account/profile-name-form.tsx", symbol: "Input", detail: "w-80", count: 1, task: "T10" },
  { rule: "width", path: "components/logs/log-filters.tsx", symbol: "Input", detail: "w-full", count: 2, task: "T10" },
  { rule: "width", path: "components/logs/log-filters.tsx", symbol: "SearchInput", detail: "inputClassName:w-80", count: 1, task: "T10" },
  { rule: "width", path: "components/members/invite-modal.tsx", symbol: "Input", detail: "min-w-0", count: 1, task: "T10" },
  { rule: "width", path: "components/members/invite-modal.tsx", symbol: "SelectTrigger", detail: "w-[168px]", count: 1, task: "T10" },
  { rule: "width", path: "components/members/member-list.tsx", symbol: "SelectTrigger", detail: "w-[132px]", count: 1, task: "T10" },
  { rule: "width", path: "components/onboarding/steps/files.tsx", symbol: "Input", detail: "w-full", count: 2, task: "T10" },
  { rule: "width", path: "components/onboarding/steps/files.tsx", symbol: "SelectTrigger", detail: "w-48", count: 1, task: "T10" },
  { rule: "width", path: "components/onboarding/steps/files.tsx", symbol: "SelectTrigger", detail: "w-full", count: 1, task: "T10" },
  { rule: "width", path: "components/onboarding/steps/naming.tsx", symbol: "Input", detail: "w-full", count: 2, task: "T10" },
  { rule: "width", path: "components/onboarding/steps/naming.tsx", symbol: "SelectTrigger", detail: "max-w-sm", count: 1, task: "T10" },
  { rule: "width", path: "components/onboarding/steps/naming.tsx", symbol: "SelectTrigger", detail: "w-full", count: 1, task: "T10" },
  { rule: "width", path: "components/onboarding/steps/repo.tsx", symbol: "Input", detail: "w-[220px]", count: 1, task: "T10" },
  { rule: "width", path: "components/onboarding/steps/repo.tsx", symbol: "Input", detail: "w-full", count: 1, task: "T10" },
  { rule: "width", path: "components/onboarding/steps/repo.tsx", symbol: "SelectTrigger", detail: "w-[220px]", count: 1, task: "T10" },
  { rule: "width", path: "components/search-input.tsx", symbol: "Input", detail: "w-64", count: 1, task: "T10" },
  { rule: "width", path: "components/search-input.tsx", symbol: "SearchInput", detail: "missing width prop", count: 1, task: "T10" },
  { rule: "width", path: "components/settings/general-card.tsx", symbol: "Input", detail: "@max-form:min-w-0", count: 2, task: "T10" },
  { rule: "width", path: "components/settings/general-card.tsx", symbol: "Input", detail: "max-w-full", count: 2, task: "T10" },
  { rule: "width", path: "components/settings/general-card.tsx", symbol: "Input", detail: "w-[320px]", count: 2, task: "T10" },
  { rule: "width", path: "components/settings/repository-form.tsx", symbol: "Input", detail: "@max-form:min-w-0", count: 1, task: "T10" },
  { rule: "width", path: "components/settings/repository-form.tsx", symbol: "Input", detail: "max-w-full", count: 1, task: "T10" },
  { rule: "width", path: "components/settings/repository-form.tsx", symbol: "Input", detail: "w-60", count: 1, task: "T10" },
  { rule: "width", path: "components/settings/repository-form.tsx", symbol: "SelectTrigger", detail: "@max-form:min-w-0", count: 1, task: "T10" },
  { rule: "width", path: "components/settings/repository-form.tsx", symbol: "SelectTrigger", detail: "max-w-full", count: 1, task: "T10" },
  { rule: "width", path: "components/settings/repository-form.tsx", symbol: "SelectTrigger", detail: "w-60", count: 1, task: "T10" },
  { rule: "width", path: "components/shell/project-switcher.tsx", symbol: "Input", detail: "min-w-0", count: 1, task: "T10" },
  { rule: "width", path: "components/sources/add-sources-modal.tsx", symbol: "SelectTrigger", detail: "w-40", count: 1, task: "T10" },
  { rule: "width", path: "components/sources/base-language-form.tsx", symbol: "SelectTrigger", detail: "w-40", count: 1, task: "T10" },
  { rule: "width", path: "components/surface-selector.tsx", symbol: "SelectTrigger", detail: "w-48", count: 1, task: "T10" },
  { rule: "width", path: "components/translations/workspace/locale-panel.tsx", symbol: "Input", detail: "w-48", count: 1, task: "T10" },
  { rule: "width", path: "components/translations/workspace/tree-panel.tsx", symbol: "Input", detail: "w-full", count: 1, task: "T10" },
  { rule: "width", path: "components/translations/workspace/workspace.tsx", symbol: "SearchInput", detail: "inputClassName:w-80", count: 1, task: "T10" },
  { rule: "width", path: "components/ui/input.tsx", symbol: "Input", detail: "missing width prop", count: 1, task: "T10" },
  { rule: "width", path: "components/ui/select.tsx", symbol: "SelectTrigger", detail: "missing width prop", count: 1, task: "T10" },
];

function differences(actual: readonly Violation[], allowed: readonly Debt[]): { unknown: Violation[]; stale: Debt[] } {
  const key = (row: Violation): string => JSON.stringify([row.rule, row.path, row.symbol, row.detail, row.count]);
  return { unknown: actual.filter(row => !allowed.some(debt => key(debt) === key(row))), stale: allowed.filter(debt => !actual.some(row => key(debt) === key(row))) };
}

describe("primitive API contract — design §3", () => {
  it("permits exactly the live debts, with exact occurrence counts and resolution owners", () => {
    const live = scan(SOURCES, REST_DEMAND);
    expect(differences(live, ALLOWLIST)).toEqual({ unknown: [], stale: [] });
    expect(new Set(ALLOWLIST.map(row => JSON.stringify([row.rule, row.path, row.symbol, row.detail]))).size).toBe(ALLOWLIST.length);
    expect(ALLOWLIST.every(row => /^T\d+[a-f]?$/.test(row.task) && row.count > 0)).toBe(true);
    for (const rule of RULES) {
      for (const inventory of [live, ALLOWLIST]) {
        const rows = inventory.filter(row => row.rule === rule);
        expect({ rows: rows.length, occurrences: rows.reduce((sum, row) => sum + row.count, 0) }, rule).toEqual(CARDINALITY[rule]);
      }
    }
  });

  it("T7 leaves no component result-label or tone mapping copies", () => {
    const copies: string[] = [];
    for (const source of SOURCES.filter(source => source.path.startsWith("components/"))) {
      visit(parse(source), node => {
        // Imported original identifiers also catch aliased ResultBadge consumers.
        if (ts.isIdentifier(node) && ["ResultBadge", "surfaceWord"].includes(node.text)) copies.push(`${source.path}:${node.text}`);
      });
    }
    expect(copies).toEqual([]);
    expect(scan(SOURCES).filter(row => row.rule === "state" || row.rule === "variant")).toEqual([]);
    expect(ALLOWLIST.filter(row => row.task === "T7")).toEqual([]);
  });

  it("T9 크기 부채는 없고 이후 Input 필드 크기 부채만 남는다", () => {
    const remaining = scan(SOURCES).filter(row => row.rule === "size");
    expect(remaining.every(row => row.symbol === "Input")).toBe(true);
    expect(remaining).toHaveLength(6);
    expect(ALLOWLIST.filter(row => row.task === "T9")).toEqual([]);
  });

  it("현재 Alert 경로의 옛 크기 이름과 새 이름을 정확히 구분한다", () => {
    const bad = source('const alert = cva("flex", {variants: {size: {default: "p-4", compact: "p-3"}}});', "components/ui/alert.tsx");
    const good = source('const alert = cva("flex", {variants: {size: {md: "p-4", sm: "p-3"}}});', "components/ui/alert.tsx");
    expect(scan([bad])).toEqual([
      { rule: "size", path: "components/ui/alert.tsx", symbol: "alert", detail: "compact", count: 1 },
      { rule: "size", path: "components/ui/alert.tsx", symbol: "alert", detail: "default", count: 1 },
    ]);
    expect(scan([good])).toEqual([]);
  });

  it("현재 SkeletonLine 경로의 필수 text와 필수 size를 정확히 구분한다", () => {
    const bad = source('export function SkeletonLine({text}: {text: "text-xs" | "text-sm" | "text-base" | "text-lg"}) {return <div className={text}/>;}', "components/ui/skeleton.tsx");
    const good = source('export function SkeletonLine({size}: {size: "xs" | "sm" | "md" | "lg"}) {return <div/>;}', "components/ui/skeleton.tsx");
    expect(scan([bad])).toEqual([{ rule: "size", path: "components/ui/skeleton.tsx", symbol: "SkeletonLine", detail: "text", count: 1 }]);
    expect(scan([good])).toEqual([]);
  });

  it("조상과 패널의 스피너 selector도 부채로 잡는다", () => {
    const bad = source('export function Screen() {return <><div className="[&_.animate-spin]:size-3.5"/><fieldset className="[&_.animate-spin]:size-3.5"/><Modal panelClassName="[&_.animate-spin]:size-3.5"/></>;}', "components/canary.tsx");
    const good = source('export function Screen() {return <Button spinnerSize="sm"/>;}', "components/canary.tsx");
    expect(scan([bad]).filter(row => row.rule === "size")).toHaveLength(3);
    expect(scan([good]).filter(row => row.rule === "size")).toEqual([]);
  });

  it("scans the production tree, never comments or test fixtures", () => {
    expect(SOURCES.length).toBeGreaterThan(300);
    expect(SOURCES.every(source => !source.path.includes("__tests__") && !/\.(test|integration)\./.test(source.path))).toBe(true);
    expect(scan([{ path: "components/ui/canary.tsx", code: '// export function Fake({statusTone}) {}\n/* <Button className="[&_.animate-spin]:size-3.5" /> */\nexport function Valid({className}: {className?: string}) { return <span className={className}/>; }' }])).toEqual([]);
  });

  const source = (code: string, path = "components/ui/canary.tsx"): Source => ({ path, code });
  it("rejects legacy hue exports and aliased imports on the renamed leaf", () => {
    const rows = scan([
      source('export type Tone = "rose"; export const TONES = ["rose"]; export function toneOf() { return "rose"; }', "lib/hue.ts"),
      source('import {toneOf as shade} from "@/lib/hue"; export const selected = shade();', "components/canary.tsx"),
    ]);
    expect(rows.filter(row => row.rule === "hue")).toHaveLength(4);
    expect(rows.some(row => row.symbol === "import:shade" && row.detail === "toneOf")).toBe(true);
  });

  const button = source('export function Button({children}: {children?: ReactNode}) { return <button>{children}</button>; }', "components/ui/button.tsx");
  const input = source('export function Input(props: {width?: 132 | 160 | 168 | 192 | 220 | 240 | 256 | 320 | "full"}) { return <input {...props}/>; }', "components/ui/input.tsx");
  const canaries: { rule: Rule; bad: Source[]; good: Source[]; demand?: { path: string; symbol: string }[] }[] = [
    { rule: "state", bad: [source('export function Row({statusTone}: {statusTone?: StateTone}) { return <span/>; }')], good: [source('export function StatusBadge({state}: {state: StateKey}) { return <span/>; }')] },
    { rule: "variant", bad: [source('const badge = cva("", {variants: {variant: {muted: "text-muted-foreground"}}});')], good: [source('const badge = cva("", {variants: {variant: {text: "text-muted-foreground", "soft-neutral": "bg-foreground/5"}}}); const alert = cva("", {variants: {variant: {info: "bg-blue-50"}}});')] },
    { rule: "hue", bad: [source('export type Tone = "rose"; export const TONES = ["rose"]; export function toneOf() { return "rose"; }', "lib/tone.ts")], good: [source('export type Hue = "rose"; export const HUES = ["rose"]; export function hueOf() { return "rose"; }', "lib/hue.ts"), source('export const TONES = {success: "muted"};', "lib/events/view.ts")] },
    { rule: "size", bad: [button, source('import {Button as Control} from "@/components/ui/button"; const OLD = "size-7 [&_.animate-spin]:size-3.5"; export function Screen() { return <Control\n className={cn("px-0", OLD)}\n/>; }', "components/canary.tsx"), source('export function Tile({size}: {size: 28}) {return <span/>;}')], good: [button, source('import {Button as Control} from "@/components/ui/button"; export function Screen() {return <Control size="icon-sm" spinnerSize="sm" className="ml-2"/>;}', "components/canary.tsx"), source('export function Avatar({size}: {size: 24 | 32 | 56}) {return <span/>;}')] },
    { rule: "width", bad: [input, source('import {Input as Field} from "@/components/ui/input"; const WIDTH = "@max-form:min-w-0 w-80"; export function Screen() {return <Field\n className={cn(WIDTH, enabled && "max-w-full")}\n onChange={e => update(e.target.value)}/>;}', "components/canary.tsx")], good: [input, source('import {Input as Field} from "@/components/ui/input"; export function Screen() {return <div className="max-w-full"><Field width={320} className="ml-2 flex-1"/></div>;}', "components/canary.tsx")] },
    { rule: "progress", bad: [button, source('import {Button as Control} from "@/components/ui/button"; export function Screen() {return <Control busy={pending}>{!pending && <Icon/>}Save</Control>;}', "components/canary.tsx"), source('export function Modal({nextPending}: {nextPending?: boolean}) {return <div/>;}')], good: [button, source('import {Button as Control} from "@/components/ui/button"; export function Screen() {return <><Control busy={pending}><Icon/>Save</Control><Control loading={pending}>Loading</Control></>;}', "components/canary.tsx")] },
    { rule: "slots", bad: [source('type Props = {subtitle?: ReactNode; headerAction?: ReactNode; detail?: ReactNode; glyph?: ReactNode; secondary?: ReactNode; footer?: ReactNode; leading?: ReactNode}; const Card = (props: Props) => <section/>; export {Card};')], good: [source('export function Card(props: {action?: ReactNode; actions?: ReactNode; description?: ReactNode; count?: number; countLabel?: string; badge?: ReactNode; notice?: ReactNode; icon?: ReactNode}) {return <section/>;}')] },
    { rule: "rest", bad: [source('export function Leaf({children, ...props}: Props) {return <span><b {...props}>{children}</b></span>;}')], good: [source('export function Leaf({children, ...props}: Props) {return <span {...props}>{children}</span>;}')], demand: [{ path: "components/ui/canary.tsx", symbol: "Leaf" }] },
    { rule: "data-tone", bad: [source('export function Note({tone}: {tone: StateTone}) {return <p><span data-tone={tone}/></p>;}')], good: [source('export function Note({tone}: {tone: StateTone}) {return <p data-tone={tone}/>;} export function Plain() {return <p/>;}')] },
    { rule: "aria", bad: [source('interface Props {describedBy?: string; labelledBy?: string} export function Group(props: Props) {return <div/>;} export function FormGroup({children}: {children: ReactNode}) {return <div>{children}</div>;}')], good: [source('export function Group(props: {"aria-describedby"?: string; "aria-labelledby"?: string}) {return <div {...props}/>;} export function FormGroup({children}: {children: ReactNode}) {return <div>{cloneElement(children, {"aria-describedby": "field-help"})}</div>;}')] },
    { rule: "className", bad: [source('type Props = {panelClassName?: string; labelClassName?: string; fallbackClassName?: string; inputClassName?: string}; export const Card = (props: Props) => <section/>;')], good: [source('export const Card = (props: {className?: string}) => <section {...props}/>;')] },
  ];

  it.each(canaries)("detects $rule violations and accepts the compliant counterpart", ({ rule, bad, good, demand }) => {
    const counts: Record<Rule, number> = { state: 1, variant: 1, hue: 3, size: 3, width: 3, progress: 2, slots: 7, rest: 1, "data-tone": 1, aria: 3, className: 4 };
    expect(scan(bad, demand).filter(row => row.rule === rule).reduce((sum, row) => sum + row.count, 0)).toBe(counts[rule]);
    expect(scan(good, demand).filter(row => row.rule === rule)).toEqual([]);
  });

  it("covers every §3 row, including zero live rest demand", () => {
    expect(canaries.map(row => row.rule).sort()).toEqual([...RULES].sort());
    expect(REST_DEMAND).toEqual([]);
    expect(ALLOWLIST.filter(row => row.rule === "rest")).toEqual([]);
  });

  it("fails unknown debt, stale debt and changed occurrence counts", () => {
    const live: Violation = { rule: "slots", path: "components/ui/canary.tsx", symbol: "Card", detail: "subtitle", count: 1 };
    const debt: Debt = { ...live, task: "T11" };
    expect(differences([live], [])).toEqual({ unknown: [live], stale: [] });
    expect(differences([], [debt])).toEqual({ unknown: [], stale: [debt] });
    expect(differences([{ ...live, count: 2 }], [debt])).toEqual({ unknown: [{ ...live, count: 2 }], stale: [debt] });
    expect(differences([live], [debt])).toEqual({ unknown: [], stale: [] });
  });

  it("resolves namespace, barrel and re-export aliases, including two identical sites", () => {
    const fixtures = [input, source('export {Input as Renamed} from "./input";', "components/ui/fields.tsx"), source('import * as Fields from "@/components/ui/fields"; export function Screen() {return <><Fields.Renamed className="w-full"/><Fields.Renamed className="w-full"/></>;}', "components/canary.tsx")];
    expect(scan(fixtures).filter(row => row.rule === "width")).toEqual([{ rule: "width", path: "components/canary.tsx", symbol: "Input", detail: "w-full", count: 2 }]);
  });

  it("rejects indexed Badge tone mappings but preserves StatusBadge and Alert info", () => {
    const badge = source('export function Badge(props: Props) {return <span/>;}', "components/ui/badge.tsx");
    expect(scan([badge, source('import {Badge as Pill} from "@/components/ui/badge"; export function Result({status}) {return <Pill variant={VARIANTS[status]}/>;}', "components/result.tsx")]).filter(row => row.rule === "state")).toHaveLength(1);
    expect(scan([badge, source('import {Badge} from "./badge"; export function StatusBadge({state}: {state: StateKey}) {const row = STATE[state]; return <Badge variant={row.variant}/>;}', "components/ui/status-badge.tsx")])).toEqual([]);
  });

  it("rejects unsupported width and spinner size without inventing new sizes", () => {
    expect(scan([input, source('import {Input} from "@/components/ui/input"; const Screen = () => <Input width={999}/>;', "components/canary.tsx")]).filter(row => row.rule === "width")).toHaveLength(1);
    expect(scan([source('export function Button(props: {spinnerSize?: "tiny"}) {return <button/>;}')]).filter(row => row.rule === "size")).toHaveLength(1);
  });

  it("detects manual pending glyphs while preserving DropdownMenuItem semantics only", () => {
    const menu = source('export const DropdownMenuItem = Primitive.Item;', "components/ui/dropdown-menu.tsx");
    const bad = source('import {Loader2 as Spinner, Plus} from "lucide-react"; export function NewProjectIcon() {const {pending} = useLinkStatus(); return pending ? <Spinner/> : <Plus/>;}', "components/canary.tsx");
    const good = source('import {DropdownMenuItem as Item} from "@/components/ui/dropdown-menu"; import {Loader2 as Spinner, LogOut} from "lucide-react"; export function SignOutItem() {return <Item disabled={pending} aria-busy={pending}>{pending ? <Spinner/> : <LogOut/>}</Item>;}', "components/canary.tsx");
    expect(scan([bad]).filter(row => row.rule === "progress")).toEqual([{ rule: "progress", path: bad.path, symbol: "NewProjectIcon", detail: "manual pending glyph replacement", count: 1 }]);
    expect(scan([menu, good]).filter(row => row.rule === "progress")).toEqual([]);
    expect(scan([menu, source(`${good.code}\nexport function Another() {return pending ? <Spinner/> : <LogOut/>;}`, good.path)]).filter(row => row.rule === "progress")).toHaveLength(1);
  });

  it("detects the six reviewed state shapes, including the local Note", () => {
    const badge = source('export function Badge(props: Props) {return <span/>;}', "components/ui/badge.tsx");
    const alert = source('export function Alert(props: Props) {return <div/>;}', "components/ui/alert.tsx");
    const render = (label: string, path: string): Source => source(`import {Badge} from "@/components/ui/badge"; export function Screen() {return <Badge variant="warning">{m.${label}}</Badge>;}`, path);
    const fixtures = [badge, alert,
      source('import {Alert} from "@/components/ui/alert"; function Note({tone}: {tone: "danger" | "neutral"}) {return <Alert variant={tone}/>;}', "components/logs/event-detail.tsx"),
      render("mcpConnector.token.expired", "components/mcp/token-card.tsx"),
      render("mcpConnector.token.expired", "components/mcp/connected-apps-card.tsx"),
      render("logs.archived.badge", "components/logs/log-filters.tsx"),
      source('import {Badge} from "@/components/ui/badge"; export function Screen() {return <><Badge variant="warning">{m.sources.waiting}</Badge><Badge variant="missing">{m.sources.missingRepo}</Badge></>;}', "components/sources/source-detail-modal.tsx"),
    ];
    expect(scan(fixtures).filter(row => row.rule === "state")).toEqual([
      { rule: "state", path: "components/logs/event-detail.tsx", symbol: "Note", detail: "tone is not StateTone", count: 1 },
      { rule: "state", path: "components/logs/log-filters.tsx", symbol: "Badge", detail: "direct state:logs.archived.badge", count: 1 },
      { rule: "state", path: "components/mcp/connected-apps-card.tsx", symbol: "Badge", detail: "direct state:mcpConnector.token.expired", count: 1 },
      { rule: "state", path: "components/mcp/token-card.tsx", symbol: "Badge", detail: "direct state:mcpConnector.token.expired", count: 1 },
      { rule: "state", path: "components/sources/source-detail-modal.tsx", symbol: "Badge", detail: "direct state:sources.missingRepo", count: 1 },
      { rule: "state", path: "components/sources/source-detail-modal.tsx", symbol: "Badge", detail: "direct state:sources.waiting", count: 1 },
    ]);
  });

  it("resolves state label and local Note aliases without treating appearance badges as state", () => {
    const badge = source('export function Badge(props: Props) {return <span/>;}', "components/ui/badge.tsx");
    const alert = source('export function Alert(props: Props) {return <div/>;}', "components/ui/alert.tsx");
    const dictionary = source('export const m = {};', "lib/i18n/index.ts");
    const bad = source('import {Badge as Pill} from "@/components/ui/badge"; import {m as words} from "@/lib/i18n"; const LABEL = words.mcpConnector.token.expired; export function Screen() {return <Pill\n variant="warning">{LABEL}</Pill>;}', "components/canary.tsx");
    const local = (tone: string): Source => source(`import {Alert as Message} from "@/components/ui/alert"; type Tone = "danger" | "${tone}"; function Note({tone: statusTone}: {tone: Tone}) {const variant = statusTone; return <Message variant={variant}/>;}`, "components/canary.tsx");
    expect(scan([badge, dictionary, bad]).filter(row => row.rule === "state")).toEqual([{ rule: "state", path: bad.path, symbol: "Badge", detail: "direct state:mcpConnector.token.expired", count: 1 }]);
    expect(scan([alert, local("neutral")]).filter(row => row.rule === "state")).toHaveLength(1);
    expect(scan([alert, local("muted")]).filter(row => row.rule === "state")).toEqual([]);
    const good = source('import {Badge as Pill} from "@/components/ui/badge"; export function Screen() {return <><Pill variant="neutral">{m.locales.base}</Pill><Pill variant="neutral">You</Pill><Pill variant="neutral">Most keys</Pill><Pill variant="warning">{count}</Pill><Pill variant="neutral">{roleWord(role)}</Pill><Pill variant="neutral">{eventKindWord(row)}</Pill><Pill variant={orphaned ? "missing" : "neutral"}><LocaleFlag code={code}/><span>{code}</span>{orphaned && <span className="sr-only">{m.locales.orphaned.badge}</span>}</Pill></>;}', "components/canary.tsx");
    expect(scan([badge, good]).filter(row => row.rule === "state")).toEqual([]);
    // Adding a state label to the same screen cannot hide behind its valid appearance badges.
    expect(scan([badge, dictionary, source(`${good.code}\nconst STATE_LABEL = m.sources.waiting; export function Other() {return <Pill variant="warning">{STATE_LABEL}</Pill>;}`, good.path)]).filter(row => row.rule === "state")).toHaveLength(1);
  });

  it("guards Note tone vocabulary through its conditional Alert adapter", () => {
    const alert = source('export function Alert(props: Props) {return <div/>;}', "components/ui/alert.tsx");
    const local = (tone: string, alias: boolean): Source => source(alias
      ? `import {Alert as Message} from "@/components/ui/alert"; function Note({tone: statusTone, width}: {tone: "danger" | "${tone}"; width: "wide"}) {const variant = statusTone === "muted" ? "neutral" : statusTone; return <Message variant={variant} size="sm" live="off"/>;}`
      : `import {Alert} from "@/components/ui/alert"; function Note({tone}: {tone: "danger" | "${tone}"}) {return <Alert variant={tone === "muted" ? "neutral" : tone} size="sm" live="off"/>;}`, "components/canary.tsx");
    for (const alias of [false, true]) {
      expect(scan([alert, local("neutral", alias)])).toEqual([{ rule: "state", path: "components/canary.tsx", symbol: "Note", detail: "tone is not StateTone", count: 1 }]);
      expect(scan([alert, local("muted", alias)])).toEqual([]);
    }
    const unrelated = source('import {Alert} from "@/components/ui/alert"; function Detail({tone, enabled}: {tone: "neutral"; enabled: boolean}) {return <><span>{tone}</span><Alert variant={enabled ? "neutral" : "danger"}/></>;}', "components/canary.tsx");
    expect(scan([alert, unrelated])).toEqual([]);
  });

  it("checks local size aliases and keyof typeof tables, including numeric keys", () => {
    const code = (table: string): Source => source(`const SIZE = ${table} as const; type LocalSize = keyof typeof SIZE; type PublicSize = LocalSize; export function IconTile({size}: {size: PublicSize}) {return <span/>;}`);
    expect(scan([code('{sm: "size-7", lg: "size-10"}')]).filter(row => row.rule === "size")).toEqual([]);
    expect(scan([code('{sm: "size-7", tiny: "size-3", 28: "size-7"}')]).filter(row => row.rule === "size")).toEqual([
      { rule: "size", path: "components/ui/canary.tsx", symbol: "IconTile", detail: "numeric size:28", count: 1 },
      { rule: "size", path: "components/ui/canary.tsx", symbol: "IconTile", detail: "size:tiny", count: 1 },
    ]);
    expect(scan([source('type Size = "sm" | "tiny"; export function Tile(props: {size: Size}) {return <span/>;}')]).filter(row => row.rule === "size")).toHaveLength(1);
    expect(scan([source('type Width = 320 | 999; type Spinner = "sm" | "tiny"; export function Input(props: {width: Width; spinnerSize: Spinner}) {return <input/>;}')]).filter(row => row.rule === "width" || row.rule === "size")).toHaveLength(2);
    expect(scan([source('type Width = 320 | "full"; type Spinner = "sm" | "md"; export function Input(props: {width: Width; spinnerSize: Spinner}) {return <input/>;}')])).toEqual([]);
  });
});
