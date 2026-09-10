import { Lexer, Parser } from "yaml";

export class IngestBudgetError extends Error {
  constructor() { super("repository import exceeds resource limits"); this.name = "IngestBudgetError"; }
}
function fail(_reason: string): never { throw new IngestBudgetError(); }
const MAX_FILES = 200;
const MAX_FILE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 10_000_000;
export function checkDownloadBudget(paths: readonly string[], files: readonly { path: string; size?: number }[]): void {
  if (paths.length > MAX_FILES) fail("too many locale files");
  const sizes = new Map(files.map(file => [file.path, file.size]));
  let total = 0;
  for (const path of paths) {
    const size = sizes.get(path);
    if (size === undefined || !Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) fail("locale file size unavailable or excessive");
    total += size;
    if (total > MAX_TOTAL_BYTES) fail("locale download budget exceeded");
  }
}
export function checkContentBudget(path: string, content: string, total: number): number {
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_FILE_BYTES || total + bytes > MAX_TOTAL_BYTES) fail("locale content budget exceeded");
  // Bound YAML composition before its recursive AST builder runs. The CST parser exposes
  // its construction stack; using real tokens preserves plain and block scalar semantics.
  if (/\.ya?ml$/.test(path)) {
    const parser = new Parser();
    for (const lexeme of new Lexer().lex(content)) {
      for (const _token of parser.next(lexeme)) { /* Consume incremental CST output. */ }
      const depth = parser.stack.filter(token =>
        token.type === "block-map" || token.type === "block-seq" || token.type === "flow-collection"
      ).length;
      if (depth > 100) fail("locale YAML nesting budget exceeded");
    }
    return total + bytes;
  }
  // JSON/code literals: ignore quoted text and comments when counting delimiters.
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  const json = path.endsWith(".json");
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; i++; } continue; }
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
    } else if (char === '"' || (!json && (char === "'" || char === "`"))) quote = char;
    else if (!json && char === "/" && next === "/") lineComment = true;
    else if (!json && char === "/" && next === "*") { blockComment = true; i++; }
    else if (char === "{" || char === "[" || (!json && char === "(")) {
      if (++depth > 100) fail("locale nesting budget exceeded");
    } else if (char === "}" || char === "]" || (!json && char === ")")) depth = Math.max(0, depth - 1);
  }
  return total + bytes;
}
