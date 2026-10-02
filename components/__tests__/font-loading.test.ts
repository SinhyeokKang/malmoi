import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { ts } from "ts-morph";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const layoutText = readFileSync("app/layout.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const layout = ts.createSourceFile("layout.tsx", layoutText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const asset = "app/fonts/geist/Geist.woff2";
const system = '-apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

function nodes(predicate: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(layout);
  return found;
}

function fontOptions(): Record<string, string | boolean> {
  const imported = nodes(node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "next/font/local")[0] as ts.ImportDeclaration | undefined;
  expect(imported?.importClause?.name?.text).toBe("localFont");
  const declaration = nodes(node => ts.isVariableDeclaration(node) && node.name.getText(layout) === "geist")[0] as ts.VariableDeclaration | undefined;
  expect(declaration?.initializer && ts.isCallExpression(declaration.initializer)).toBe(true);
  const call = declaration!.initializer as ts.CallExpression;
  expect(call.expression.getText(layout)).toBe("localFont");
  const options = call.arguments[0];
  expect(options && ts.isObjectLiteralExpression(options)).toBe(true);
  return Object.fromEntries((options as ts.ObjectLiteralExpression).properties.map(property => {
    expect(ts.isPropertyAssignment(property)).toBe(true);
    const entry = property as ts.PropertyAssignment;
    const value = entry.initializer;
    expect(ts.isStringLiteral(value) || value.kind === ts.SyntaxKind.FalseKeyword || value.kind === ts.SyntaxKind.TrueKeyword).toBe(true);
    return [entry.name.getText(layout), ts.isStringLiteral(value) ? value.text : value.kind === ts.SyntaxKind.TrueKeyword];
  }));
}

describe("root fonts — Geist with Pretendard fallback", () => {
  it("uses Geist first, then the existing Pretendard and system stack without changing monospace", () => {
    const sans = /--font-sans:\s*([^;]+);/.exec(css)?.[1]?.replace(/\s+/g, " ").trim();
    expect(sans).toBe(`var(--font-geist), "Pretendard Variable", ${system}`);
    expect(/--font-mono:\s*([^;]+);/.exec(css)?.[1]?.trim()).toBe('ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace');
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-sans\)/);
  });

  it("binds the actual local loader variable on html and preserves self-hosted Pretendard subset loading", () => {
    const options = fontOptions();
    expect(options.variable).toBe("--font-geist");
    const html = nodes(node => ts.isJsxOpeningElement(node) && node.tagName.getText(layout) === "html")[0] as ts.JsxOpeningElement;
    const className = html.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(layout) === "className") as ts.JsxAttribute | undefined;
    expect(className?.initializer?.getText(layout)).toBe("{geist.variable}");
    const links = nodes(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(layout) === "link").map(node => node.getText(layout));
    expect(links.filter(link => link.includes('/fonts/pretendard/pretendardvariable-dynamic-subset.css') && link.includes('rel="stylesheet"'))).toHaveLength(1);
    const copy = readFileSync("scripts/copy-fonts.mjs", "utf8");
    expect(copy).toContain('node_modules/pretendard/dist/web/variable');
    expect(copy).toContain('public/fonts/pretendard');
    expect(copy).toContain('await cp(join(SRC, SUBSET_DIR), join(DEST, SUBSET_DIR), { recursive: true })');
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    expect(scripts.predev).toBe("node scripts/copy-fonts.mjs");
    expect(scripts.prebuild).toBe("node scripts/copy-fonts.mjs");
  });

  it("the installed Next loader emits this real WOFF2 with preload/swap and no implicit Arial ahead of Pretendard", async () => {
    const options = fontOptions();
    const emitted: { bytes: Buffer; ext: string; preload: boolean; fallback: boolean }[] = [];
    const loader = require("next/dist/compiled/@next/font/dist/local/loader").default;
    const result = await loader({
      functionName: "", variableName: "geist", data: [options],
      resolve: async (path: string) => resolve("app", path),
      loaderContext: { fs: { readFile: (path: string, callback: (error: Error | null, bytes: Buffer) => void) => { try { callback(null, readFileSync(path)); } catch (error) { callback(error as Error, Buffer.alloc(0)); } } } },
      emitFontFile: (bytes: Buffer, ext: string, preload: boolean, fallback: boolean) => { emitted.push({ bytes, ext, preload, fallback }); return "/_next/static/media/fixture.woff2"; },
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.bytes).toEqual(readFileSync(asset));
    expect(emitted[0]).toMatchObject({ ext: "woff2", preload: true, fallback: false });
    expect(result.css).toContain('url(/_next/static/media/fixture.woff2) format(\'woff2\')');
    expect(result.css).toContain("font-display: swap");
    expect(result.css).toContain("font-weight: 100 900");
    expect(result.variable).toBe("--font-geist");
    expect(result.adjustFontFallback).toBeUndefined();
    expect(result.fallbackFonts).toBeUndefined();
  });

  it("ships the pinned licensed Geist variable asset with Latin/numbers and no Hangul so glyph fallback can reach Pretendard", () => {
    const bytes = readFileSync(asset);
    expect(bytes.subarray(0, 4).toString()).toBe("wOF2");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("2ffebe993e969069a9789d15164b7715d42491b5835516c5e3b935d5f81b05f1");
    const imported = require("next/dist/compiled/@next/font/dist/fontkit");
    const font = (imported.default?.default ?? imported.default ?? imported)(bytes);
    expect(font.familyName).toBe("Geist");
    expect(font.variationAxes.wght).toMatchObject({ min: 100, max: 900 });
    for (const character of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") expect(font.hasGlyphForCodePoint(character.codePointAt(0))).toBe(true);
    expect(font.characterSet.filter((point: number) => (point >= 0x1100 && point <= 0x11ff) || (point >= 0x3130 && point <= 0x318f) || (point >= 0xac00 && point <= 0xd7a3))).toEqual([]);
    expect(readFileSync("app/fonts/geist/LICENSE.txt", "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });
});
