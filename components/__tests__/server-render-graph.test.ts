import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **서버 컴포넌트가 렌더하는 그래프에 인라인 이벤트 핸들러·클라이언트 훅이 없다.**
 *
 * 2026-10-12에 실제로 밟았다: `components/ui/input.tsx`(`"use client"` 없음)에 `onPointerDown`·`onBlur` 인라인
 * 핸들러가 들어갔고, 서버 컴포넌트 `/account` 페이지의 readOnly `Input`이 그것을 RSC로 렌더해
 * `Event handlers cannot be passed to Client Component props`로 error boundary에 떨어졌다.
 *
 * ⚠️ **typecheck·`pnpm build`가 통과한다.** RSC 직렬화 오류는 그 경로를 **실제로 렌더할 때만** 난다 — `next build`는
 * 동적 페이지(세션을 읽는 `/account`)를 프리렌더하지 않으므로 빌드 중에 그 트리를 한 번도 그리지 않는다. jsdom 테스트도
 * RSC 경계를 모른다(그냥 클라이언트 React로 그린다). 그래서 이 부류는 소스 그래프로 센다(`client-graph`의 거울).
 *
 * 검사 방식: `app/**`의 비-`"use client"` 파일에서 시작해 값 import를 따라가되 `"use client"`·`"use server"` 파일에서
 * 멈춘다(그 너머는 클라이언트 참조·Action 스텁이다). 닿은 `.tsx`마다 **인라인 함수 핸들러**(`onX={(…) => …}`)와
 * **`useX(` 훅 호출**이 0이어야 한다. 소비자가 넘긴 핸들러를 그대로 내리는 `onClick={onClick}`은 세지 않는다 — 서버
 * 렌더에선 그 값이 `undefined`이고, 서버가 함수를 넘기면 그쪽 호출부가 이미 같은 오류다.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

function typeOnly(clause: string): boolean {
  if (/^\s*type\s/.test(clause)) return true;
  const braces = /\{([\s\S]*)\}/.exec(clause);
  if (braces === null || /^\s*$/.test(braces[1] ?? "")) return false;
  const named = (braces[1] ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
  const hasValue = named.some((s) => !s.startsWith("type "));
  const hasDefaultOrNamespace = /^[^{]*[A-Za-z_$]/.test(clause.split("{")[0] ?? "");
  return !hasValue && !hasDefaultOrNamespace;
}

/** 값 import 하나 — 이름은 `{ … }` 안의 값 이름이고, 기본·네임스페이스·재수출 `*`는 `"*"`로 센다(전부를 쓴다고 본다). */
type ValueImport = { specifier: string; names: string[] };

function importedNames(clause: string): string[] {
  const braces = /\{([\s\S]*)\}/.exec(clause);
  const named = (braces?.[1] ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "" && !s.startsWith("type "))
    .map((s) => s.split(/\s+as\s+/)[0] ?? s);
  const head = braces === null ? clause : clause.slice(0, braces.index);
  return /[A-Za-z_$*]/.test(head.replace(/^\s*export\s*/, "")) ? [...named, "*"] : named;
}

function valueImports(source: string): ValueImport[] {
  const code = stripComments(source);
  const out: ValueImport[] = [];
  for (const m of code.matchAll(/^\s*import\s+([\s\S]*?)from\s*["']([^"']+)["']/gm)) {
    if (!typeOnly(m[1] ?? "")) out.push({ specifier: m[2] ?? "", names: importedNames(m[1] ?? "") });
  }
  for (const m of code.matchAll(/^\s*export\s+((?:\*|\{[\s\S]*?\})\s*)from\s*["']([^"']+)["']/gm)) {
    if (!typeOnly(m[1] ?? "")) out.push({ specifier: m[2] ?? "", names: importedNames(m[1] ?? "") });
  }
  return out;
}

function resolveModule(from: string, specifier: string): string | null {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return null;
  const base = specifier.startsWith("@/") ? join(ROOT, specifier.slice(2)) : join(from, "..", specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // 다음 후보를 본다.
    }
  }
  return null;
}

const directive = (source: string) => /^["'](use client|use server)["']/.exec(source.trimStart())?.[1] ?? null;

/** 서버 렌더 진입점에서 `"use client"`·`"use server"` 경계 전까지 닿는 파일과, 각 파일을 서버 쪽이 값으로 읽은 이름. */
function serverGraph(entries: string[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const queue: { file: string; names: string[] }[] = entries.map((file) => ({ file, names: ["*"] }));
  const boundary = new Map<string, boolean>();
  const isBoundary = (file: string) => {
    if (!boundary.has(file)) boundary.set(file, directive(readFileSync(file, "utf8")) !== null);
    return boundary.get(file) === true;
  };
  while (queue.length > 0) {
    const next = queue.pop();
    if (next === undefined || isBoundary(next.file)) continue;
    const used = graph.get(next.file);
    for (const name of next.names) used?.add(name);
    if (used !== undefined) continue;
    graph.set(next.file, new Set(next.names));
    for (const { specifier, names } of valueImports(readFileSync(next.file, "utf8"))) {
      const resolved = resolveModule(next.file, specifier);
      if (resolved !== null) queue.push({ file: resolved, names });
    }
  }
  return graph;
}

/**
 * 판정은 파일 단위라, **클라이언트 소비자용 컴포넌트와 서버가 쓰는 잎 조각이 한 파일에 같이 사는** 모듈은 여기서 푼다.
 * 서버 쪽 import가 이 이름들만 읽는 한 핸들러를 가진 컴포넌트는 서버에서 렌더되지 않는다 — 다른 이름을 읽으면 red다.
 */
const SERVER_SAFE_EXPORTS: Record<string, readonly string[]> = {
  // Home 골격(`(home)/loading.tsx`)이 세그먼트 라벨 조각만 그린다. `SegmentedControl` 본체는 클라이언트 소비자 둘뿐이다.
  "components/ui/segmented-control.tsx": ["SegmentBody"],
};

const INLINE_HANDLER = /\bon[A-Z][A-Za-z]*=\{\s*(?:async\b|function\b|\(|[A-Za-z_$][\w$]*\s*=>)/g;
const HOOK_CALL = /\buse[A-Z][\w$]*\s*\(/g;

/** 서버 렌더 그래프에 들어가면 안 되는 것 — 인라인 핸들러 prop과 훅 호출. */
export function clientOnlyFindings(source: string): string[] {
  const code = stripComments(source);
  return [...code.matchAll(INLINE_HANDLER), ...code.matchAll(HOOK_CALL)].map((m) => m[0].replace(/\s+/g, " "));
}

const ENTRIES = sourceFiles(join(ROOT, "app"));
const GRAPH = serverGraph(ENTRIES);

describe("서버 렌더 그래프", () => {
  it("판정이 인라인 핸들러·훅을 잡고 prop 통과는 세지 않는다", () => {
    expect(clientOnlyFindings(`<input onBlur={(e) => f(e)} onClick={onClick} />`)).toEqual(["onBlur={("]);
    expect(clientOnlyFindings(`<a onClick={async () => x()} onFocus={e => y(e)} />`)).toHaveLength(2);
    expect(clientOnlyFindings(`const [a] = useState(0); // useEffect(\n/* useRef( */`)).toEqual(["useState("]);
  });

  // R-X1(2026-10-13)이 실험으로 찾은 사각 넷 — 같은 직렬화 오류를 내지만 첫 판정은 green이었다.
  it("삼항·논리식 안에서 만든 핸들러도 잡는다", () => {
    expect(clientOnlyFindings(`<button onClick={busy ? event => event.preventDefault() : onClick} />`)).toHaveLength(1);
    expect(clientOnlyFindings(`<Link onNavigate={busy ? (e) => e.preventDefault() : onNavigate} />`)).toHaveLength(1);
    expect(clientOnlyFindings(`<a onClick={blocked && function (e) { e.preventDefault(); }} />`)).toHaveLength(1);
    expect(clientOnlyFindings(`<a onClick={busy ? onBusy : onClick} />`)).toEqual([]);
  });

  it("같은 파일에서 만든 함수를 이름으로 넘겨도 잡는다 — 소비자가 넘긴 prop 통과는 세지 않는다", () => {
    expect(clientOnlyFindings(`const handle = (e) => f(e);\n<a onClick={handle} />`)).toHaveLength(1);
    expect(clientOnlyFindings(`function handle(e) { f(e); }\n<a onClick={handle} />`)).toHaveLength(1);
    expect(clientOnlyFindings(`export function Row({ onClick }) { return <a onClick={onClick} />; }`)).toEqual([]);
  });

  it("spread로 실은 핸들러와 ref 콜백도 잡는다", () => {
    expect(clientOnlyFindings(`const shared = { onClick: (e) => f(e) };\n<a {...shared} />`)).toHaveLength(1);
    expect(clientOnlyFindings(`<a {...{ onFocus: () => g() }} />`)).toHaveLength(1);
    expect(clientOnlyFindings(`<input ref={(el) => el?.focus()} />`)).toHaveLength(1);
    expect(clientOnlyFindings(`<input ref={ref} />`)).toEqual([]);
  });

  it("허용 목록의 위험 prop을 서버 호출부가 넘기면 잡는다 — 넘기지 않거나 `{false}`면 세지 않는다", () => {
    const guard = { tags: ["Button", "ButtonLink"], props: ["busy"] };
    expect(guardedCallerFindings(`<ButtonLink external busy href="/x">Go</ButtonLink>`, guard)).toHaveLength(1);
    expect(guardedCallerFindings(`<Button\n  busy={pending}\n  size="lg">Save</Button>`, guard)).toHaveLength(1);
    expect(guardedCallerFindings(`<Button busy={false}>Save</Button>`, guard)).toEqual([]);
    expect(guardedCallerFindings(`<Button disabled onClick={x}>Save</Button>`, guard)).toEqual([]);
    expect(guardedCallerFindings(`<ButtonGroup busy />`, guard)).toEqual([]);
    expect(guardedCallerFindings(`<Button {...props}>Save</Button>`, guard)).toHaveLength(1);
  });

  it("`/account` 페이지가 그래프에 있고 `components/ui/input.tsx`까지 닿는지 본다 — 스캐너가 조용히 0건이 되지 않는다", () => {
    const rel = new Set([...GRAPH.keys()].map((f) => relative(ROOT, f)));
    expect(rel.has("app/(edit)/account/page.tsx")).toBe(true);
    // input.tsx가 "use client"면 경계라 그래프에 없고, 아니면 그래프에 있어야 한다.
    const input = join(ROOT, "components/ui/input.tsx");
    expect(directive(readFileSync(input, "utf8")) === "use client" || rel.has("components/ui/input.tsx")).toBe(true);
  });

  it("예외 모듈은 실제로 그래프에 있다 — 낡은 예외가 남지 않는다", () => {
    for (const file of Object.keys(SERVER_SAFE_EXPORTS)) expect(GRAPH.has(join(ROOT, file))).toBe(true);
  });

  it("서버가 렌더하는 `.tsx`에 인라인 핸들러·훅 호출이 없다", () => {
    const offenders: Record<string, string[]> = {};
    for (const [file, used] of GRAPH) {
      if (!file.endsWith(".tsx")) continue;
      const safe = SERVER_SAFE_EXPORTS[relative(ROOT, file)];
      if (safe !== undefined && [...used].every((name) => safe.includes(name))) continue;
      const found = clientOnlyFindings(readFileSync(file, "utf8"));
      if (found.length > 0) offenders[relative(ROOT, file)] = found;
    }
    expect(offenders).toEqual({});
  });
});
