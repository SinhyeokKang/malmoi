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
 *
 * ⚠️ **같은 오류의 다른 모양도 센다**(2026-10-13 R-X1이 첫 판정의 사각으로 찾았다): 삼항·논리식 안의 함수
 * (`busy ? e => … : onClick`) · 같은 파일이 만든 함수를 이름으로 넘김 · spread 객체에 실린 핸들러 · `ref` 콜백.
 * 조건부로만 함수를 만드는 프리미티브(`busy`·`blocked`)는 `GUARDED_SITES`가 판정 결과를 정확히 고정하고, 서버 호출부가
 * 그 조건 prop을 넘기지 않는지를 함께 센다 — 서버 페이지에 `<ButtonLink busy>`가 생기는 순간 red다.
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
/** 핸들러·ref 콜백 prop의 여는 자리 — 값 식 전체는 `braceBody`로 꺼내 본다(삼항·논리식 안의 함수까지). */
const HANDLER_PROP = /\b(on[A-Z][A-Za-z]*|ref)=\{/g;
const FUNCTION_EXPR = /=>|\bfunction\b/;
const OBJECT_HANDLER = /\bon[A-Z][A-Za-z]*\s*:\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/;

/** `code[open]`이 `{`일 때 짝 맞는 `}`까지의 본문 — 문자열 안 중괄호는 세지 않는 근사다(이 검사에 충분하다). */
function braceBody(code: string, open: number): string {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return code.slice(open + 1, i);
  }
  return code.slice(open + 1);
}

/** 이 파일이 **스스로 만든** 함수 이름 — 이것을 핸들러로 넘기면 인라인과 같다(소비자가 넘긴 prop 통과와 다르다). */
function localFunctionNames(code: string): Set<string> {
  const names = new Set<string>();
  for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/g)) names.add(m[1] ?? "");
  for (const m of code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1] ?? "");
  return names;
}

/** spread가 싣는 객체 본문 — 인라인 객체(`{...{ … }}`)와 같은 파일의 `const 이름 = { … }`. */
function spreadBodies(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/\{\s*\.\.\.\s*(\{|[A-Za-z_$][\w$]*)/g)) {
    if (m[1] === "{") out.push(braceBody(code, (m.index ?? 0) + m[0].length - 1));
    else {
      const decl = new RegExp(String.raw`\b(?:const|let|var)\s+${m[1]}\s*(?::[^=]+)?=\s*\{`).exec(code);
      if (decl !== null) out.push(braceBody(code, decl.index + decl[0].length - 1));
    }
  }
  return out;
}

/** 서버 렌더 그래프에 들어가면 안 되는 것 — 인라인 핸들러 prop(삼항·이름·spread·ref 콜백 포함)과 훅 호출. */
export function clientOnlyFindings(source: string): string[] {
  const code = stripComments(source);
  const direct = [...code.matchAll(INLINE_HANDLER)];
  const directAt = new Set(direct.map((m) => m.index));
  const local = localFunctionNames(code);
  const found = direct.map((m) => m[0].replace(/\s+/g, " "));
  for (const m of code.matchAll(HANDLER_PROP)) {
    if (directAt.has(m.index)) continue;
    const body = braceBody(code, (m.index ?? 0) + m[0].length - 1).trim();
    if (FUNCTION_EXPR.test(body)) found.push(`${m[1]}={${body.replace(/\s+/g, " ").slice(0, 40)}}`);
    else if (local.has(body)) found.push(`${m[1]}={${body}}`);
  }
  for (const body of spreadBodies(code)) {
    const hit = OBJECT_HANDLER.exec(body);
    if (hit !== null) found.push(`{...${hit[0].replace(/\s+/g, " ")}}`);
  }
  return [...found, ...[...code.matchAll(HOOK_CALL)].map((m) => m[0].replace(/\s+/g, " "))];
}

/** 위험 prop 가드 — 이 태그를 서버가 렌더할 때 이 prop을 넘기면(spread 포함) 프리미티브가 인라인 핸들러를 만든다. */
type CallerGuard = { tags: readonly string[]; props: readonly string[] };

/** 서버 호출부가 가드된 프리미티브에 위험 prop을 넘기는 자리. `{false}` 리터럴은 세지 않고, spread는 무엇을 싣는지 모르니 센다. */
export function guardedCallerFindings(source: string, guard: CallerGuard): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  for (const m of code.matchAll(new RegExp(String.raw`<(${guard.tags.join("|")})(?=[\s/>])`, "g"))) {
    let attrs = "";
    for (let i = (m.index ?? 0) + m[0].length; i < code.length; i++) {
      const c = code[i];
      if (c === "{") {
        const body = braceBody(code, i);
        attrs += body.trim() === "false" ? "{false}" : body.trimStart().startsWith("...") ? "{...}" : "{}";
        i += body.length + 1;
      } else if (c === ">") break;
      else attrs += c;
    }
    if (attrs.includes("{...}")) found.push(`<${m[1]} {...}>`);
    for (const prop of guard.props) {
      const hit = new RegExp(String.raw`(?:^|\s)${prop}(=\{false\})?(?=[\s=/]|$)`).exec(attrs);
      if (hit !== null && hit[1] === undefined) found.push(`<${m[1]} ${prop}>`);
    }
  }
  return found;
}

/**
 * **알고 받아들인 자리** — 프리미티브가 조건부로 인라인 핸들러를 만들지만, 그 조건 prop을 서버 호출부가 넘기지 않는 한
 * 서버 렌더에서 함수가 생기지 않는다. 그래서 파일의 판정 결과를 **정확히** 고정하고(새 자리가 생기면 red), 서버 그래프의
 * 모든 호출부가 그 prop을 넘기지 않는지를 함께 센다(새 서버 호출부가 넘기면 red). 2026-10-13 R-X1·POSTMORTEM.
 */
const GUARDED_SITES: Record<string, { findings: readonly string[]; guard: CallerGuard }> = {
  // `busy`면 클릭·내부 이동을 막는 인라인 핸들러가 생긴다 — 서버 호출부(랜딩 GitHub 링크·Logs 상세 Open 등)는 `busy`를 넘기지 않는다.
  "components/ui/button.tsx": {
    findings: [
      "onClick={busy ? event => event.preventDefault() :}",
      "onClick={busy ? event => { if (!newTab && (!targe}",
      "onNavigate={busy ? event => event.preventDefault() :}",
    ],
    guard: { tags: ["Button", "ButtonLink"], props: ["busy"] },
  },
  // `disabled`·`aria-disabled`면 이동·클릭을 막는 인라인 핸들러가 생긴다 — 서버 호출부(Inbox·Home attention·Logs 행)는 둘 다 넘기지 않는다.
  "components/ui/list-row.tsx": {
    findings: [
      // Link 갈래 · button 갈래 — 판정 문자열이 40자에서 잘려 둘이 같다(개수가 고정이다).
      "onClick={blocked ? event => event.preventDefault(}",
      "onClick={blocked ? event => event.preventDefault(}",
    ],
    guard: { tags: ["ListRow"], props: ["disabled", "aria-disabled"] },
  },
};

/**
 * 가드된 태그에 spread를 넘기는 서버 호출부 중 **무엇을 싣는지 타입이 고정된** 것 — spread 원천의 반환 타입을 함께 센다.
 * 원천이 위험 prop을 싣게 바뀌면 그 검사가 red다.
 */
const TYPED_SPREADS: Record<string, { source: string; returns: RegExp }> = {
  // `attentionRowSlots`의 `{ href, ...slots }` — 반환 타입이 href·icon·title·description·aside뿐이다.
  "components/inbox/inbox-list.tsx": { source: "components/inbox/row-slots.tsx", returns: /export function attentionRowSlots\([\s\S]*?\):\s*(\{[^}]*\})/ },
  "components/home/attention-card.tsx": { source: "components/inbox/row-slots.tsx", returns: /export function attentionRowSlots\([\s\S]*?\):\s*(\{[^}]*\})/ },
};

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

  it("서버가 렌더하는 `.tsx`에 인라인 핸들러·훅 호출이 없다 — 가드된 자리는 고정된 그 자리뿐이다", () => {
    const offenders: Record<string, string[]> = {};
    for (const [file, used] of GRAPH) {
      if (!file.endsWith(".tsx")) continue;
      const safe = SERVER_SAFE_EXPORTS[relative(ROOT, file)];
      if (safe !== undefined && [...used].every((name) => safe.includes(name))) continue;
      const found = clientOnlyFindings(readFileSync(file, "utf8"));
      const pinned = GUARDED_SITES[relative(ROOT, file)];
      if (pinned !== undefined) expect(found, relative(ROOT, file)).toEqual(pinned.findings);
      else if (found.length > 0) offenders[relative(ROOT, file)] = found;
    }
    expect(offenders).toEqual({});
  });

  it("가드된 자리는 실제로 그래프에 있고, 서버 호출부 누구도 위험 prop을 넘기지 않는다", () => {
    const callers: Record<string, string[]> = {};
    for (const [site, { guard }] of Object.entries(GUARDED_SITES)) {
      expect(GRAPH.has(join(ROOT, site)), site).toBe(true);
      for (const file of GRAPH.keys()) {
        if (!file.endsWith(".tsx") || relative(ROOT, file) === site) continue;
        const typed = TYPED_SPREADS[relative(ROOT, file)];
        const found = guardedCallerFindings(readFileSync(file, "utf8"), guard).filter((hit) => typed === undefined || !hit.endsWith(" {...}>"));
        if (typed !== undefined) {
          const returns = typed.returns.exec(readFileSync(join(ROOT, typed.source), "utf8"))?.[1];
          expect(returns, `${typed.source} 반환 타입`).toBeDefined();
          for (const prop of guard.props) expect(returns, `${relative(ROOT, file)}의 spread가 ${prop}를 실을 수 있다`).not.toMatch(new RegExp(String.raw`\b${prop}\??:`));
        }
        if (found.length > 0) callers[relative(ROOT, file)] = [...(callers[relative(ROOT, file)] ?? []), ...found];
      }
    }
    expect(callers).toEqual({});
  });
});
