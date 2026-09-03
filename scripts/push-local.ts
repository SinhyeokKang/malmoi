#!/usr/bin/env tsx
/**
 * 적재 + 사용처 스캔 → `POST /api/push`. **TASK 7의 GitHub Actions가 할 일과 같은 순서다** —
 * 워크플로는 이 스크립트를 부르거나 같은 단계를 재현한다.
 *
 *   pnpm push:local <대상 디렉터리> [--url http://localhost:3000] [--wrapper <module>#<export>[()]]...
 *
 * 파일시스템·네트워크를 아는 층이다. 어댑터·스캐너·계획은 전부 순수 함수다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";

import { config } from "dotenv";

import { adapterFor, detectFormat, detectFormatWith, namespaceOf, type AdapterFile } from "../lib/adapters/index";
import { requireEnv } from "../lib/env";
import type { PushPayloadType } from "../lib/push/plan";
import {
  DEFAULT_WRAPPERS,
  parseWrapperSpec,
  scanSources,
  type SourceFileInput,
  type WrapperId,
} from "../lib/scan/index";

config({ path: ".env.local", quiet: true });

const TS_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const RAW_EXT = new Set([".html", ".htm", ".json"]);
const SKIP_DIR = new Set([
  "node_modules", ".git", "dist", "dist-e2e", "dist-log-viewer", "build", "out", ".next",
  "coverage", "generated", ".vercel", "playwright-report", "test-results",
]);

function walk(root: string, dir: string, paths: string[], sources: SourceFileInput[]): void {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIR.has(name) || name.startsWith(".")) continue;
      walk(root, full, paths, sources);
      continue;
    }
    const rel = relative(root, full).split(sep).join("/");
    paths.push(rel);
    const dot = name.lastIndexOf(".");
    const ext = dot === -1 ? "" : name.slice(dot);
    const kind = TS_EXT.has(ext) ? "ts" : RAW_EXT.has(ext) ? "raw" : undefined;
    if (kind) sources.push({ path: rel, code: readFileSync(full, "utf8"), kind });
  }
}

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
}

/** 값을 뒤에 하나 더 먹는 플래그. 대상 디렉터리를 고를 때 그 자리를 건너뛰어야 한다. */
const VALUE_FLAGS = new Set(["--url", "--wrapper", "--adapter", "--project"]);

/**
 * 플래그 값은 `--`로 시작하지 않는다. "플래그가 아닌 첫 인자"를 그대로 대상으로 삼으면
 * `pnpm push:local --wrapper @/i18n#t ./dir`이 래퍼 스펙을 디렉터리로 읽는다.
 */
function findTarget(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (VALUE_FLAGS.has(a)) {
      i++;
      continue;
    }
    if (!a.startsWith("--")) return a;
  }
  return undefined;
}

/** `--wrapper`는 여러 번 줄 수 있다 — 한 리포가 클라이언트·서버 두 형태를 함께 쓴다. */
function wrapperSpecs(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--wrapper") continue;
    const raw = argv[++i];
    if (raw) out.push(raw);
  }
  return out;
}

const target = findTarget(process.argv.slice(2));
if (!target) {
  console.error("사용법: pnpm push:local <대상 디렉터리> [--url ...] [--wrapper <module>#<export>[()]]... [--adapter <name>] [--project <slug>]");
  process.exit(2);
}
const baseUrl = arg("url", "http://localhost:3000");
const specs = wrapperSpecs(process.argv.slice(2));
const wrappers: readonly WrapperId[] = specs.length === 0 ? DEFAULT_WRAPPERS : specs.map((raw) => {
  const parsed = parseWrapperSpec(raw);
  if (!parsed) {
    console.error("--wrapper 형식: <module>#<export> 또는 <module>#<export>() (예: @/i18n#t, next-intl#useTranslations())");
    process.exit(2);
  }
  return parsed;
});

// 커밋 SHA는 대상 리포에서 읽는다 — permalink 기준이라 실제 값이어야 한다.
const commitSha = execFileSync("git", ["-C", target, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
// 커밋 **시각**은 역행 판정의 근거다 (ARCHITECTURE §5.5.5). `%cI`가 offset이 붙은 ISO 8601이다.
const commitAt = execFileSync("git", ["-C", target, "show", "-s", "--format=%cI", "HEAD"], { encoding: "utf8" }).trim();
// 서버와 같은 `.env.local`을 읽으므로 기본값은 항상 통과한다. `--project`로 덮으면
// 오배송 거부(409)를 로컬에서 실제로 확인할 수 있다.
//
// ⚠️ `arg("project", requireEnv(...))`로 쓰지 않는다 — **인자가 먼저 평가되므로** 플래그를
// 명시해도 환경변수가 없으면 죽는다. 없는 이유를 메시지가 가리키지 않아 진단이 오래 걸린다.
const projectSlug = arg("project", "") || requireEnv("ACTIVE_PROJECT_SLUG");

const paths: string[] = [];
const sources: SourceFileInput[] = [];
walk(target, target, paths, sources);

const probe = (p: string): string | undefined => {
  try {
    return readFileSync(join(target, p), "utf8");
  } catch {
    return undefined;
  }
};

// ── 적재 (키의 진실) ────────────────────────────────────────────────────────
// ⚠️ 한 리포에 포맷이 둘일 수 있다 — bugshot-2는 _locales(4키)와 ts-dict(903키)가 공존하고
// 탐지 우선순위가 작은 쪽을 고른다. `--adapter <name>`으로 지정하면 그게 이긴다.
const adapterArg = process.argv.indexOf("--adapter");
const adapterName = adapterArg === -1 ? undefined : process.argv[adapterArg + 1];
const format = adapterName === undefined
  ? detectFormat(paths, probe)
  : detectFormatWith(adapterName as never, paths, probe);
if (adapterName !== undefined && !format) {
  console.error(`--adapter ${adapterName}: 이 리포에서 해당 포맷을 찾지 못했다.`);
  process.exit(1);
}
if (!format) {
  console.error(`로케일 포맷을 찾지 못했다 (${paths.length}파일) — 연동 불가.`);
  process.exit(1);
}
const adapter = adapterFor(format);

// ⚠️ 파일 수집이 layout에 따라 갈린다 (lib/adapters/types.ts).
//   per-locale  — 로케일당 파일 하나: pathTemplate의 {locale}을 치환한다
//   multi-locale — 한 파일에 로케일 여러 개: 글롭이므로 디렉터리의 파일을 전부 넘긴다
const files: AdapterFile[] =
  adapter.layout === "per-locale"
    ? format.locales
        .map((l) => format.pathTemplate.replace("{locale}", l))
        .filter((p) => paths.includes(p))
        .map((p) => ({ path: p, content: probe(p) ?? "" }))
    : (() => {
        const dir = format.pathTemplate.slice(0, format.pathTemplate.lastIndexOf("/") + 1);
        return paths
          .filter((p) => p.startsWith(dir) && /\.tsx?$/.test(p) && !p.includes("/__tests__/"))
          .map((p) => ({ path: p, content: probe(p) ?? "" }));
      })();

const read = adapter.read(format, files);
if (read.errors.length) {
  console.error(`적재 에러 ${read.errors.length}건 — CI를 실패시킨다:`);
  for (const e of read.errors.slice(0, 10)) console.error(`  ${e.path}  ${e.message}`);
  process.exit(1);
}

const baseLocale = format.locales.includes("en") ? "en" : format.locales.slice().sort()[0];
if (baseLocale === undefined) {
  console.error("로케일이 없다 — 연동 불가.");
  process.exit(1);
}
const baseEntries = read.locales.find((l) => l.locale === baseLocale)?.entries ?? [];

// ── 사용처 (컨텍스트) — 실패가 경고다 ──────────────────────────────────────
const scan = scanSources(sources, wrappers);
const keySet = new Set(baseEntries.map((e) => e.key));
const refs = scan.refs
  .filter((r) => keySet.has(r.key))
  .flatMap((r) => r.refs.map((loc) => ({ key: r.key, path: loc.path, line: loc.line })));
// 로케일 파일에 없는 키를 코드가 참조하는 것도 경고다 (MVP §3.1 5단계).
const unknownRefs = scan.refs.filter((r) => !keySet.has(r.key)).length;

// ⚠️ **타입을 붙여둔다.** 예전엔 리터럴이라 `PushPayload`에 필수 필드가 늘어도 컴파일러가
// 침묵했고, 이 스크립트만 400을 받는 상태로 남았다 (§4b에서 실제로 밟았다).
const payload: PushPayloadType = {
  projectSlug,
  commitSha,
  commitAt,
  format: {
    adapter: format.adapter,
    pathTemplate: format.pathTemplate,
    nested: read.nested,
    baseLocale,
  },
  locales: format.locales,
  keys: baseEntries.map((e) => ({
    key: e.key,
    sourceText: e.message,
    namespace: namespaceOf(e.key),
    ...(e.description === undefined ? {} : { description: e.description }),
    // base 파일에서의 키 위치 → `StringKey.sortIndex`. **`e.order ? …`로 쓰면 0이 falsy라
    // 파일의 첫 키가 순서를 잃는다.** 없으면 안 싣는다 — 서버가 null로 남긴다.
    ...(e.order === undefined ? {} : { order: e.order }),
  })),
  // 리포 파일의 번역값 — 서버가 strict로 덮는다 (MVP §3.1).
  // **base 로케일도 보낸다** — base도 편집 가능하고 Translation 행을 가져야 한다 (§3.2).
  translations: read.locales.flatMap((l) =>
    l.entries.map((e) => ({
      locale: l.locale,
      key: e.key,
      value: e.message,
      // **그 로케일 파일이 실제로 갖고 있던** chrome 필드 → `Translation`의 두 컬럼.
      // 키 단위 `keys[].description`과 다른 것이다 — 합치면 base 값을 비-base에 복제하게 된다.
      ...(e.description === undefined ? {} : { description: e.description }),
      ...(e.placeholders === undefined ? {} : { placeholders: e.placeholders }),
    })),
  ),
  refs,
};

console.log(`대상:     ${target}`);
console.log(`커밋:     ${commitSha.slice(0, 8)}`);
console.log(`포맷:     ${format.adapter}${read.nested ? " (중첩)" : " (flat)"}  ${format.pathTemplate}`);
console.log(`로케일:   ${format.locales.slice().sort().join(", ")}  (base: ${baseLocale})`);
console.log(`키:       ${payload.keys.length} / 번역: ${payload.translations.length} / refs: ${payload.refs.length}`);
console.log(`경고:     스캔 ${scan.warnings.length}건 / 로케일 파일에 없는 참조 키 ${unknownRefs}개`);
console.log(`페이로드: ${(Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0)} KB`);

const token = process.env["PUSH_TOKEN"];
if (!token) {
  console.error("PUSH_TOKEN이 없다 — .env.local을 확인한다.");
  process.exit(1);
}

const res = await fetch(`${baseUrl}/api/push`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify(payload),
});
const text = await res.text();
console.log(`\nPOST ${baseUrl}/api/push → ${res.status}`);
console.log(text.slice(0, 800));
process.exitCode = res.ok ? 0 : 1;
