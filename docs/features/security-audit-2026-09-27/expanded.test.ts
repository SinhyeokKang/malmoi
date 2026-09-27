import { afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { runInNewContext } from "node:vm";
import { normalizeImage } from "@/lib/upload/normalize";
import { codeDict, jsonCatalog, yamlCatalog } from "@/lib/adapters";
import { checkContentBudget } from "@/lib/onboarding/budget";

afterEach(() => vi.restoreAllMocks());

it("strips appended active content from a valid PNG", async () => {
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "red" } }).png().toBuffer();
  const marker = "<script>globalThis.securityAuditCanary = 927</script>";
  const result = await normalizeImage(Buffer.concat([png, Buffer.from(marker)]));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  expect(Buffer.from(result.bytes).includes(Buffer.from(marker))).toBe(false);
  expect((await sharp(result.bytes).metadata()).format).toBe("webp");
});

it("rejects truncated PNGs before storage", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: "blue" } }).png().toBuffer();
  for (const length of [8, 16, 24, 32, 48]) {
    expect((await normalizeImage(png.subarray(0, length))).ok).toBe(false);
  }
});

it.each([
  'export default { ok: "safe", bad: (() => { globalThis.securityAuditCanary = 927; return "bad"; })() };',
  'export default { ok: "safe", get bad() { globalThis.securityAuditCanary = 927; return "bad"; } };',
  'globalThis.securityAuditCanary = 927; export default { ok: "safe" };',
  'export default { ok: "safe", bad: `${globalThis.securityAuditCanary = 927}` };',
])("parses repository code without executing it: %s", (content) => {
  const globals = globalThis as unknown as Record<string, unknown>;
  delete globals.securityAuditCanary;
  const result = codeDict.read({ adapter: "code-dict", pathTemplate: "locales/{locale}.ts", locales: ["en"] }, [{ path: "locales/en.ts", content }]);
  expect(result.locales.flatMap(locale => locale.entries)).toContainEqual(expect.objectContaining({ key: "ok", message: "safe" }));
  expect(globals.securityAuditCanary).toBeUndefined();
});

it("does not pollute object prototypes from JSON repository keys", () => {
  jsonCatalog.read({ adapter: "json-catalog", pathTemplate: "locales/{locale}.json", locales: ["en"] }, [{ path: "locales/en.json", content: '{"__proto__":{"securityAuditCanary":"927"},"constructor":{"prototype":{"securityAuditCanary":"927"}},"ok":"safe"}' }]);
  expect(({} as Record<string, unknown>).securityAuditCanary).toBeUndefined();
});

it.each(["json", "ts", "yaml"])("rejects excessive %s nesting before adapter parsing", (extension) => {
  const content = extension === "yaml" ? "a: " + "[".repeat(101) + "0" + "]".repeat(101) : "[".repeat(101) + "0" + "]".repeat(101);
  expect(() => checkContentBudget(`en.${extension}`, content, 0)).toThrow("resource limits");
});

it("does not expand recursive YAML aliases into translation keys", () => {
  const result = yamlCatalog.read({ adapter: "yaml-catalog", pathTemplate: "locales/{locale}.yml", locales: ["en"] }, [{ path: "locales/en.yml", content: "root: &root\n  child: *root\n" }]);
  expect(result.locales.flatMap(locale => locale.entries)).toEqual([]);
});

it.each(["'", '"', "`"])("does not execute hostile translations in %s-delimited JavaScript exports", (quote) => {
  const content = `export default { ok: ${quote}safe${quote} };`;
  const message = "'; globalThis.securityAuditCanary = 927; //\n\"; `${globalThis.securityAuditCanary = 927}`\\";
  const output = codeDict.write({ adapter: "code-dict", pathTemplate: "locales/{locale}.js", locales: ["en"], currentFiles: [{ path: "locales/en.js", content }] }, { locale: "en", entries: [{ key: "ok", message }] });
  expect(output).not.toBeNull();
  const context: Record<string, unknown> = {};
  runInNewContext(output!.replace("export default", "globalThis.result ="), context, { timeout: 1000 });
  expect(context.securityAuditCanary).toBeUndefined();
  // Template literals are deliberately unmanaged by this adapter.
  expect(context.result).toEqual({ ok: quote === "`" ? "safe" : message });
});
