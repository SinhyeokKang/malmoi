import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **시각 체계를 소스 전수로 센다** (audit B6 — #43~#50).
 *
 * ⚠️ **전부 값은 맞고 표현만 어긋나는 부류다** — 렌더 테스트가 green인 채 raw 색·임의 크기·손 재구현이
 * 쌓였고 DESIGN §6.2의 등재 목록은 그 사이 실물과 갈라졌다. 문서가 "왜"를, 이 파일이 "지금 어디에"를
 * 든다(`surface-rules.test.ts`의 mono 목록과 같은 분업). **자리를 늘리려면 둘을 함께 고친다.**
 *
 * ⚠️ **파일 목록을 손으로 적지 않는다** — 새 화면은 목록 밖에서 태어난다. 허용은 값→파일로만 적는다.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SKIP = new Set(["__tests__", "node_modules"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

/** ⚠️ 주석을 벗기고 센다 — 규칙을 설명하는 주석이 자기가 금지하는 클래스를 이름으로 적는다. */
const bare = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const ALL_SOURCES = ["app", "components", "lib", "messages"]
  .flatMap((dir) => sourceFiles(join(ROOT, dir)))
  .map((file) => ({ path: relative(ROOT, file), source: bare(readFileSync(file, "utf8")) }));
const SOURCES = ALL_SOURCES.filter(({ path }) => /^(?:app|components)\//.test(path));

const read = (path: string): string => bare(readFileSync(join(ROOT, path), "utf8"));

/** 파일별로 패턴이 잡힌 토큰을 모은다. */
function hits(pattern: RegExp, sources = SOURCES): { path: string; token: string }[] {
  return sources.flatMap(({ path, source }) => [...source.matchAll(pattern)].map((match) => ({ path, token: match[0] })));
}

const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RAW_COLOR = new RegExp(
  `(?<![\\w-])(?:[a-z-]+:)*(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|inset-ring|fill|stroke|from|to|via|outline|divide|shadow|inset-shadow|drop-shadow|text-shadow|decoration|placeholder|caret|accent)-(?:white|black|(?:${PALETTE})-\\d{2,3})(?:\\/(?:\\[[^\\]]+\\]|\\d+))?(?![\\w-])`,
  "g",
);
/**
 * **유틸 이름 밖의 팔레트 철자** — 임의값 `bg-[var(--color-amber-500)]` · v4 괄호 `text-(--color-amber-700)` · 인라인 `style`의
 * `var(--color-amber-700)`은 `RAW_COLOR`가 못 본다(color-scheme RA 🟡1). 셋 다 팔레트 변수 이름을 지나므로 그 이름 하나를 센다.
 * ⚠️ 팔레트 변수를 가리키는 유일한 자리는 `app/globals.css`의 `:root` 라이트 값이고, CSS라 `ALL_SOURCES`(`.ts`·`.tsx`) 밖이다.
 */
const PALETTE_VAR = new RegExp(`--color-(?:white|black|(?:${PALETTE})-\\d{2,3})(?![\\w-])`, "g");
/** 변형 접두(`hover:` 등)는 같은 색이다 — 값으로 센다. */
const colorValue = (token: string): string => token.replace(/^(?:[a-z-]+:)+/, "");

/**
 * `<Button …>`·`<ButtonLink …>` 여는 태그를 통째로 떼어낸다 — 중괄호 깊이·따옴표를 보며 **깊이 0의 `>`**까지
 * (`focus-ring.test.ts`의 `openingTag`와 같은 방법). 정규식 `[^>]*`는 `onClick={() => …}`의 화살표에서 끊긴다.
 */
function openingTags(source: string, names: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(new RegExp(`<(?:${names})\\b`, "g"))) {
    let depth = 0;
    let quote: string | null = null;
    for (let i = match.index; i < source.length; i++) {
      const c = source[i];
      if (quote !== null) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) { out.push(source.slice(match.index, i + 1)); break; }
    }
  }
  return out;
}

const buttonTags = (source: string): string[] => openingTags(source, "Button|ButtonLink|CopyButton");

/** 넷째 높이 `h-8` · 임의 radius · `size="sm"` 위의 다른 radius — 덮은 className 문자열을 돌려준다. */
function buttonOverrides(source: string): string[] {
  return buttonTags(source).flatMap((tag) => {
    const cls = tag.match(/className="([^"]*)"/)?.[1];
    if (cls === undefined) return [];
    if (/(?<![\w-])(?:h-8|rounded-\[[^\]]*\])(?![\w-])/.test(cls)) return [cls];
    return /size="sm"/.test(tag) && /(?<![\w-])rounded-(?!full)[\w-]+/.test(cls) ? [cls] : [];
  });
}

/**
 * **색 리터럴이 서도 되는 자리는 남의 자산뿐이다** (DESIGN §6.2 · color-scheme spec 완료 조건 2) — Google 로고 4색 ·
 * OpenAI 로고의 흰 판(두 테마 같은 판 — `brand-logo.tsx`, color-scheme design §3.5) · 초대 메일(라이트 고정, 메일 클라이언트는 우리 CSS를 모른다).
 * 늘리려면 §6.2와 이 목록을 함께 고친다.
 */
const COLOR_LITERAL_OWNERS = (path: string): boolean =>
  path === "components/signin/brand-icons.tsx" || path === "components/mcp/brand-logo.tsx" || path.startsWith("lib/invitation-email/");
const COLOR_LITERAL = /(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|(?<![\w-])(?:rgba?|hsla?|oklch|oklab)\(/g;
const SCRIM_AS_FOREGROUND = /(?<![\w-])(?:[a-z-]+:)*bg-foreground\/(?:32|40)(?![\w-])/g;
const DARK_VARIANT = /(?<![\w-])(?:[a-z-]+:)*dark:[\w[-]/g;

/**
 * **색은 의미 토큰이 든다 — raw 팔레트 클래스는 0곳이다** (color-scheme Phase 1, 2026-10-05 · DESIGN §6.2).
 *
 * ⚠️ 2026-10-05까지는 `REGISTERED`가 raw 값 → 쓰는 파일을 손으로 들었다. 이름이 값(`amber-800`)이라 다크 값을 걸 자리가 없었고,
 * Phase 1이 전부 `app/globals.css`의 `:root` 토큰으로 옮겨 표가 비었다. 새 색이 필요하면 raw를 쓰지 말고 토큰을 하나 더한다.
 */
describe("raw 색은 0곳이다 — 색은 의미 토큰이 든다 (audit #43·#44 · color-scheme)", () => {
  /** ⚠️ 실제 소스의 정답이 0이므로 개수 하한이 아니라 픽스처로 검사 자체가 찾는지 본다(POSTMORTEM 2026-09-07 — 패턴 오류가 "안전"으로 읽혔다). */
  it("검사가 실제로 raw 색을 찾는다 (카나리아)", () => {
    const fixture = '<span className="bg-amber-100/80 hover:text-white border-t-red-700/[0.14] bg-success-soft text-on-hue bg-hue-amber" />';
    expect(hits(RAW_COLOR, [{ path: "components/canary.tsx", source: fixture }]).map(({ token }) => colorValue(token))).toEqual(["bg-amber-100/80", "text-white", "border-t-red-700/[0.14]"]);
  });

  /** 입구를 하나씩 먹인다 — 색을 받는 접두마다 한 토큰. 정규식의 접두 목록과 따로 적어야 빠진 접두가 드러난다. */
  it.each([
    "bg-amber-500", "text-amber-500", "border-amber-500", "border-x-amber-500", "border-y-amber-500", "border-t-amber-500", "border-r-amber-500",
    "border-b-amber-500", "border-l-amber-500", "border-s-amber-500", "border-e-amber-500", "ring-amber-500", "ring-offset-white", "inset-ring-amber-500",
    "fill-amber-500", "stroke-amber-500", "from-amber-500", "to-amber-500", "via-amber-500", "outline-amber-500", "divide-amber-500", "shadow-black",
    "inset-shadow-amber-500", "drop-shadow-amber-500", "text-shadow-amber-500", "decoration-amber-500", "placeholder-amber-500", "caret-amber-500", "accent-amber-500",
  ])("카나리아 — `%s`를 잡는다", (token) => {
    expect(hits(RAW_COLOR, [{ path: "components/canary.tsx", source: `"focus:${token}/50"` }]).map(({ token: found }) => colorValue(found))).toEqual([`${token}/50`]);
  });

  it("유틸 이름 밖의 팔레트 철자(임의값·괄호·인라인 style)가 0곳이다", () => {
    expect(hits(PALETTE_VAR, ALL_SOURCES).map(({ path, token }) => `${path}: ${token}`)).toEqual([]);
  });

  it("카나리아 — 임의값·괄호·style의 팔레트 변수는 잡고 의미 토큰 변수는 놓아준다", () => {
    const fixture = '"bg-[var(--color-amber-500)] text-(--color-amber-700)" style={{ color: "var(--color-white)" }} "bg-(--color-warning-soft) text-[var(--color-hue-amber)] var(--color-link)"';
    expect(hits(PALETTE_VAR, [{ path: "components/canary.tsx", source: fixture }]).map(({ token }) => token)).toEqual(["--color-amber-500", "--color-amber-700", "--color-white"]);
  });

  it("app·components·lib·messages 생산 소스에 Tailwind raw 팔레트 클래스가 0곳이다", () => {
    expect(ALL_SOURCES.length).toBeGreaterThan(500);
    expect(hits(RAW_COLOR, ALL_SOURCES).map(({ path, token }) => `${path}: ${token}`)).toEqual([]);
  });

  it("색 리터럴(hex·`rgb(`·`hsl(`·`oklch(`)은 남의 자산 자리에만 선다", () => {
    expect(hits(COLOR_LITERAL, ALL_SOURCES.filter(({ path }) => COLOR_LITERAL_OWNERS(path))).length).toBeGreaterThan(4);
    expect(hits(COLOR_LITERAL, ALL_SOURCES.filter(({ path }) => !COLOR_LITERAL_OWNERS(path))).map(({ path, token }) => `${path}: ${token}`)).toEqual([]);
  });

  /** 에이전트 로고 파일은 통째로 허용된 자리가 아니다 — OpenAI 흰 판 하나뿐이다. 늘면 그 색이 왜 테마를 안 따르는지가 먼저다. */
  it("`brand-logo.tsx`의 색 리터럴은 OpenAI 흰 판 하나다", () => {
    expect(hits(COLOR_LITERAL, ALL_SOURCES.filter(({ path }) => path === "components/mcp/brand-logo.tsx")).map(({ token }) => token)).toEqual(["#ffffff"]);
  });

  it("색 리터럴 카나리아 — 잡을 것과 놓아줄 것", () => {
    const found = (source: string) => hits(COLOR_LITERAL, [{ path: "components/canary.tsx", source }]).map(({ token }) => token);
    expect(found('fill="#4285F4" style={{ color: "#fff", background: "rgba(0,0,0,.5)" }} stroke="hsl(0 0% 0%)" c="oklch(50% 0 0)"')).toEqual(["#4285F4", "#fff", "rgba(", "hsl(", "oklch("]);
    expect(found('href="/docs#publish" &#128; id-#ab12x color-mix(in oklab, var(--x) 5%, transparent)')).toEqual([]);
  });

  it("오버레이(어둡게 덮기)는 `scrim`이다 — `bg-foreground/32|40`이 0곳이다", () => {
    expect(hits(SCRIM_AS_FOREGROUND, [{ path: "components/canary.tsx", source: '"bg-foreground/40 data-[state=open]:bg-foreground/32"' }])).toHaveLength(2);
    expect(hits(SCRIM_AS_FOREGROUND, ALL_SOURCES).map(({ path, token }) => `${path}: ${token}`)).toEqual([]);
  });

  /** 테마는 토큰이 든다 — 컴포넌트가 `dark:`로 분기하면 다크 값의 집이 `globals.css`와 수십 파일로 갈린다(design §3.2). */
  it("`dark:` 변형이 0곳이다", () => {
    expect(hits(DARK_VARIANT, [{ path: "components/canary.tsx", source: '"dark:bg-background hover:dark:text-foreground dark:[&_a]:underline"' }])).toHaveLength(3);
    expect(hits(DARK_VARIANT, ALL_SOURCES).map(({ path, token }) => `${path}: ${token}`)).toEqual([]);
  });

  /**
   * 이력 날짜 카드는 셸 안 카드라 12다(4-Y2·5-Y11 — 16은 패널 하나뿐이다, DESIGN §5). 골격도 같은 값이어야 도착 순간 모서리가 안 튄다.
   * 머리↔첫 행은 헤더 급 선(`#f0f0f0`)이다(4-Y3 — 옛 `first:`는 카드의 첫 자식이 머리라 한 번도 걸리지 않았다).
   */
  it("이력 날짜 카드가 흰 토큰 · radius 12를 쓰고, 골격도 같다 (#43 · 4-Y2)", () => {
    const page = read("app/(edit)/projects/[slug]/logs/page.tsx");
    expect(page).toContain("rounded-lg border bg-background");
    expect(page).not.toContain("rounded-xl");
    expect(page).not.toContain("first:border-foreground/[0.06]");
    expect(page).toMatch(/first \? "border-foreground\/\[0\.06\] border-t" : "border-border border-t"/);
    const skeleton = read("app/(edit)/projects/[slug]/logs/loading.tsx");
    expect(skeleton).toContain("rounded-lg border");
    expect(skeleton).not.toContain("rounded-xl");
  });

  it("이력 상세 껍데기 높이는 `svh`다 — 1024 모달과 같은 단위 (3-Y6)", () => {
    const shell = read("components/logs/event-dialog.tsx");
    expect(shell).toContain("max-h-[calc(100svh-var(--spacing-modal-gutter))]");
    expect(shell).not.toContain("100vh");
  });

  /** 색 리터럴이 서도 되는 남의 자산 자리(`COLOR_LITERAL_OWNERS` — OpenAI 흰 판)만 뺀다 — 허용 목록은 하나다. */
  it("임의값 안에 hex·rgba를 쓰지 않는다 — 토큰의 알파로 접는다", () => {
    expect(hits(/[\w:-]+-\[[^\]\s]*(?:rgba?\(|#[0-9a-fA-F]{3,8})[^\]\s]*\]/g, SOURCES.filter(({ path }) => !COLOR_LITERAL_OWNERS(path))).map(({ path, token }) => `${path}: ${token}`)).toEqual([]);
  });
});

/**
 * **떠 있는 패널은 윤곽 선을 든다** (color-scheme design §2.2 · §3.8). 다크에서 scrim이 덮은 바탕(약 `#0e0e0e`)과 모달 면(`#171717`)이
 * 약 1.07:1이고 `shadow-medium`은 안 보인다 — 층을 만드는 것은 면 단계 + `border`다. Dialog는 이미 들었고 LargeModal이 맞췄다.
 */
describe("모달 패널 윤곽", () => {
  const panel = (path: string, name: string) => new RegExp(`${name} =\\s*"([^"]*)"`).exec(read(path))?.[1]?.split(" ") ?? [];

  it("LargeModal 패널이 `border border-border`를 든다 — Dialog와 같다", () => {
    expect(panel("components/ui/large-modal.tsx", "LARGE_MODAL_PANEL")).toEqual(expect.arrayContaining(["border", "border-border"]));
    expect(read("components/ui/dialog.tsx")).toMatch(/"bg-background border-border [^"]*"[\s\S]{0,80}"shadow-medium rounded-lg border"/);
  });
});

describe("글자 크기·자간·radius는 스케일이 든다 (audit #45·#46·#47)", () => {
  it("임의 글자 크기 `text-[Npx]`가 0이다", () => {
    expect(hits(/(?<![\w-])(?:[a-z-]+:)*text-\[\d+(?:\.\d+)?px\]/g).map(({ path, token }) => `${path}: ${token}`)).toEqual([]);
  });

  /** 크기 토큰과 같은 자간은 접는다. 공개 문서 표의 0.015em은 text-xs/sm의 0.02em과 달라 보존한다(T1). */
  it("`tracking-*`는 공개 문서 표의 별도 값 하나뿐이다", () => {
    const found = hits(/(?<![\w-])tracking-[\w[\].-]+/g, ALL_SOURCES);
    const byFile: Record<string, number> = {};
    for (const { path } of found) byFile[path] = (byFile[path] ?? 0) + 1;
    expect(byFile).toEqual({
      "components/public-doc-table.tsx": 1,
    });
  });

  it("`rounded-[10px]`가 0이다 — `rounded-md`가 같은 값이다", () => {
    expect(hits(/rounded-\[10px\]/g).map(({ path }) => path)).toEqual([]);
  });

  /**
   * Button은 `size`가 radius와 높이를 든다(§5 · §6.4). 호출부가 덮으면 같은 크기 버튼이 모서리 둘·높이 넷으로 갈린다.
   *
   * ⚠️ **행 전체가 버튼인 자리는 밖이다** — 사이드바·설정 행·Sources 행의 `h-auto`·`rounded-none|sm`은 §8이 적은
   * 높이 덮기다. 여기서 막는 것은 **버튼 모양 그대로 크기만 바꾼** 부류다: 넷째 높이 `h-8`, 임의 radius, 그리고
   * `size="sm"`(8) 위에 다른 radius를 얹는 것.
   */
  it("Button 호출부가 radius·높이를 덮지 않는다", () => {
    const opening = SOURCES.flatMap(({ path, source }) => buttonOverrides(source).map((cls) => `${path}: ${cls}`));
    expect(opening).toEqual([]);
  });

  /** ⚠️ 스캐너가 실제로 잡는지 — r1 전의 `[^>]*?`는 `onClick={() => …}`의 `>`에서 멈춰 CopyLink를 통째로 놓쳤다. */
  it("카나리아 — CopyLink에 `h-8`을 얹으면 잡는다", () => {
    const path = "components/translations/workspace/locale-panel.tsx";
    const source = SOURCES.find((entry) => entry.path === path)?.source ?? "";
    expect(buttonOverrides(source)).toEqual([]);
    const mutated = source.replace('<CopyButton value={url}', '<CopyButton className="h-8" value={url}');
    expect(mutated).not.toBe(source);
    expect(buttonOverrides(mutated)).toEqual(["h-8"]);
  });

  it("리터럴 Button 여는 태그를 전부 읽는다 — `=>`나 className 뒤의 `size`에서 끊기지 않는다", () => {
    const tags = SOURCES.flatMap(({ source }) => buttonTags(source));
    expect(tags.length).toBeGreaterThan(100);
    const copy = SOURCES.find((entry) => entry.path === "components/translations/workspace/locale-panel.tsx")?.source ?? "";
    expect(buttonTags(copy).some(tag => tag.includes("CopyButton"))).toBe(true);
    const fixture = '<Button onClick={() => navigator.clipboard.writeText(value)} className="h-8" size="sm">Copy</Button>';
    expect(buttonOverrides(fixture)).toEqual(["h-8"]);
  });
});

describe("아이콘은 §6.8의 넷(16·14·12·20)이다 (audit #48)", () => {
  it("임의 크기 `size-[Npx]`가 0이다", () => {
    expect(hits(/(?<![\w-])size-\[\d+(?:\.\d+)?px\]/g).map(({ path, token }) => `${path}: ${token}`)).toEqual([]);
  });

  /**
   * 아이콘 색은 상속이 기본이고, 예외는 **한 단계 아래 글리프**(§6.8 "형")와 Alert·EmptyState·PR 글리프다.
   * 그 밖의 색상(hue)을 아이콘에 주지 않는다 — 색만으로 말하는 글리프가 생긴다.
   */
  it("아이콘에 붙는 색은 무채 계단·destructive·PR 초록·warning 글리프뿐이다", () => {
    // `text-warning-foreground`는 §2.4 글리프 열의 warning 글리프다(Publish Held back 목록 머리, 2026-10-01 1-Y5).
    const ALLOWED = new Set(["text-muted-foreground", "text-foreground", "text-destructive", "text-gray-light", "text-gray-dim", "text-gray-strong", "text-success-foreground", "text-warning-foreground"]);
    const icons = SOURCES.flatMap(({ path, source }) => {
      const names = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)].flatMap((match) => (match[1] ?? "").split(",").map((name) => name.trim()).filter(Boolean));
      // ⚠️ `className={cn(…)}`·템플릿 리터럴도 읽는다 — 여는 태그 안의 문자열 조각을 전부 모은다.
      return names.length === 0 ? [] : openingTags(source, names.join("|")).flatMap((tag) =>
        [...tag.matchAll(/"([^"]*)"|`([^`]*)`/g)].flatMap((match) => (match[1] ?? match[2] ?? "").split(/\s+/))
          .filter((token) => /^text-(?!xs|sm|base|lg|xl|\d|left|right|center|\[)/.test(token)).map((token) => ({ path, token })));
    });
    expect(icons.length).toBeGreaterThan(10);
    expect(icons.filter(({ token }) => !ALLOWED.has(token)).map(({ path, token }) => `${path}: ${token}`)).toEqual([]);
  });
});

describe("프리미티브를 손으로 다시 만들지 않는다 (audit #49)", () => {
  it("펄스 블록은 `Skeleton` 하나가 든다", () => {
    expect(hits(/animate-pulse/g).map(({ path }) => path)).toEqual(["components/ui/skeleton.tsx"]);
  });

  it("회색 알약은 `Badge`가 든다 — 카운트 pill·Archived", () => {
    const pill = /rounded-full px-(?:1\.5|2) py-0\.5 text-xs font-medium/;
    expect(SOURCES.filter(({ path, source }) => path !== "components/ui/badge.tsx" && pill.test(source)).map(({ path }) => path)).toEqual([]);
  });

  it("필터 트리거 둘의 hover가 `default` 버튼과 같다", () => {
    for (const path of ["components/logs/log-filters.tsx", "components/translations/workspace/filter-menu.tsx"]) {
      expect(read(path)).toContain("<DropdownMenuTrigger asChild>");
      expect(read(path)).toContain("<FieldTrigger");
      const trigger = read("components/ui/field-trigger.tsx");
      expect(trigger, path).toContain("hover:bg-primary-foreground");
      expect(trigger.match(/(?<![\w:-])hover:bg-accent/g), path).toBeNull();
    }
  });

  it("안내 상자는 `Alert`가 든다 — 이력 보관 안내·상세 노트·Sync 확인 경고", () => {
    // 상시 안내는 `Alert neutral`이다. 실패 노트는 `danger`이되 live가 꺼져 있다(B6 r1 — `logs-events.test.tsx`가 센다).
    expect(read("components/logs/event-detail.tsx")).toMatch(/function Note\b[^]*?<Alert\b[^>]*\bsize="sm"\s+live="off">/);
    expect(read("app/(edit)/projects/[slug]/logs/page.tsx")).toMatch(/<Alert\s+variant="neutral"[\s\S]{0,400}\{m\.logs\.archived\.restoreLine/);
    expect(read("components/home/sync-button.tsx")).toMatch(/<Alert id=\{warningId\} variant="warning" size="sm">/);
  });

  it("경고·안내 상자를 손으로 그리지 않는다 — Alert의 배경 넷이 그 파일 밖에 서지 않는다", () => {
    const box = /(?<![\w-])bg-(?:warning|danger|success|info)-surface(?![\w/-])[^"]*(?:rounded|p-\d)|(?:rounded|p-\d)[^"]*(?<![\w-])bg-(?:warning|danger|success|info)-surface(?![\w/-])/;
    expect(box.test('"bg-warning-surface rounded-lg p-4"')).toBe(true);
    expect(SOURCES.filter(({ path, source }) => path !== "components/ui/alert.tsx" && box.test(source)).map(({ path }) => path)).toEqual([]);
  });
});

describe("같은 행동은 같은 variant다 (audit #50)", () => {
  it("연결 해제 트리거가 전부 `danger`다", () => {
    const github = read("components/github-account.tsx").match(/<DialogTrigger asChild>\s*(?:\{\}\s*)?<Button variant="(\w+)"/)?.[1];
    expect(github).toBe("danger");
    const methods = [...read("components/account/login-methods.tsx").matchAll(/<Button variant="(\w+)" aria-label=\{m\.link\.methods\.disconnectLabel/g)].map((match) => match[1]);
    expect(methods).toEqual(["danger", "danger"]);
  });

  it("페이지의 유일한 출구인 Retry가 전부 primary다", () => {
    for (const path of ["app/(edit)/error.tsx", "app/(edit)/projects/[slug]/logs/error.tsx"]) {
      expect(read(path), path).toContain("<ErrorState");
      expect(read(path), path).toContain("retry={retry}");
    }
    expect(read("app/error.tsx")).toMatch(/<Button\b[^>]*variant="primary"/);
    expect(read("components/ui/error-state.tsx")).toMatch(/<Button\b[^>]*variant="primary"[^>]*onClick=\{\(\) => retry\(\)\}/);
  });

  it("Clear filters는 primary가 아니고 `RotateCcw`를 든다", () => {
    const sites = [
      { path: "components/logs/log-filters.tsx", label: "m.logs.filters.clear" },
      { path: "app/(edit)/projects/[slug]/logs/page.tsx", label: "m.logs.filters.clear" },
      { path: "components/translations/workspace/workspace.tsx", label: "w.filters.clear" },
    ];
    for (const { path, label } of sites) {
      const source = read(path);
      const at = source.indexOf(`{${label}}`);
      expect(at, path).toBeGreaterThan(0);
      const opening = source.slice(source.lastIndexOf("<Button", at) === -1 ? 0 : Math.max(source.lastIndexOf("<Button", at), source.lastIndexOf("<ButtonLink", at)), at);
      expect(opening, path).not.toContain('variant="primary"');
      expect(source.slice(at - 200, at + 120), path).toContain("<RotateCcw");
    }
  });

  /**
   * **`RotateCcw`는 Clear filters의 글리프 하나다** (ux-drift-unify 5-W2) — Retry(Sync 결과)·토큰 재발급도 같은 글리프를 들어 "되돌리기"와
   * "다시 하기"·"새로 만들기"가 한 모양이었다. Sync의 [Try again]은 Sync의 글리프(`ArrowDownToLine`)를, 재발급은 MCP Rotate처럼 글리프 없이 선다.
   */
  it("`RotateCcw`를 그리는 자리는 Clear filters뿐이다", () => {
    const CLEAR = ["app/(edit)/projects/[slug]/logs/page.tsx", "components/logs/log-filters.tsx", "components/projects/empty-projects.tsx", "components/translations/workspace/workspace.tsx"];
    const drawn = SOURCES.filter(({ source }) => source.includes("<RotateCcw")).map(({ path }) => path).sort();
    expect(drawn).toEqual(CLEAR);
  });
});

/**
 * **24px(`text-2xl`) 이상은 weight 600이다** (2026-09-26 사용자 — DESIGN §4). 그 아래 제목·라벨은 500, 나머지 400.
 *
 * ⚠️ **클래스 문자열 하나 단위로 센다** — 크기와 weight가 같은 리터럴에 서야 한다(`cn("text-2xl font-medium", …)`도 한 리터럴이다).
 * 역방향도 건다 — 600이 24px 아래로 번지면 "크면 600"이 "아무 데나 600"이 된다.
 */
describe("24px 이상은 600, 600은 24px 이상에만", () => {
  const BIG = /(?<![\w-])(?:[a-z-]+:)*text-(?:[2-9]xl|\[(?:2[4-9]|[3-9]\d|\d{3,})px\])(?![\w-])/;
  const SEMIBOLD = /(?<![\w-])(?:[a-z-]+:)*font-semibold(?![\w-])/;
  const literals = (source: string): string[] =>
    [...source.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((match) => match[1] ?? match[2] ?? "");
  const found = SOURCES.flatMap(({ path, source }) => literals(source).map((cls) => ({ path, cls })));

  it("카나리아 — 두 방향이 실제로 잡힌다", () => {
    expect(BIG.test("m-0 text-2xl font-medium") && !SEMIBOLD.test("m-0 text-2xl font-medium")).toBe(true);
    expect(BIG.test("text-xl font-semibold")).toBe(false);
    expect(BIG.test("md:text-[32px]")).toBe(true);
    expect(found.filter(({ cls }) => BIG.test(cls)).length).toBeGreaterThan(5);
  });

  it("24px 이상 크기를 든 클래스 문자열은 `font-semibold`를 함께 든다", () => {
    const stray = found.filter(({ cls }) => BIG.test(cls) && !SEMIBOLD.test(cls));
    expect(stray.map(({ path, cls }) => `${path}: ${cls}`)).toEqual([]);
  });

  it("`font-semibold`는 24px 이상 크기와만 선다", () => {
    const stray = found.filter(({ cls }) => SEMIBOLD.test(cls) && !BIG.test(cls));
    expect(stray.map(({ path, cls }) => `${path}: ${cls}`)).toEqual([]);
  });
});

/** 같은 유틸·알파의 두 철자만 막는다. 짝 없는 /5·/6은 허용한다(T1, Y-a). */
describe("알파 면·선의 철자", () => {
  const duplicates = (source: string): string[] => {
    const bracketed = new Set([...source.matchAll(/\b((?:bg|border(?:-[tblrxy])?|ring|text|fill|stroke)-foreground)\/\[(0\.\d+)\]/g)]
      .map((match) => `${match[1]}/${Number(match[2])}`));
    return [...source.matchAll(/\b((?:bg|border(?:-[tblrxy])?|ring|text|fill|stroke)-foreground)\/(\d+)\b/g)]
      .filter((match) => bracketed.has(`${match[1]}/${Number(match[2]) / 100}`)).map((match) => match[0]);
  };

  it("같은 값의 두 알파 철자가 공존하지 않는다", () => {
    expect(duplicates(ALL_SOURCES.map(({ source }) => source).join("\n"))).toEqual([]);
  });

  it("두 철자 재도입을 잡고 짝 없는 /5·/6은 허용한다 (카나리아)", () => {
    const real = SOURCES.find(({ path }) => path === "components/shell/sidebar.tsx")?.source ?? "";
    expect(real).toContain("hover:bg-foreground/[0.03]");
    expect(duplicates(`${real} hover:bg-foreground/3`)).toEqual(["bg-foreground/3"]);
    expect(duplicates("ring-foreground/6 ring-foreground/[0.06] border-foreground/2 border-foreground/[0.02]")).toHaveLength(2);
    expect(duplicates("bg-foreground/7 bg-foreground/[0.07]")).toEqual(["bg-foreground/7"]);
    expect(duplicates("bg-foreground/5 ring-foreground/6 bg-foreground/32 bg-foreground/[0.07]")).toEqual([]);
    expect(SOURCES.length).toBeGreaterThan(200);
  });
});

describe("T1 동치 철자와 값 보존 예외", () => {
  const OBSOLETE = /leading-\[1\.5\]|\[overflow-wrap:anywhere\]/g;
  const byFile = (pattern: RegExp): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const { path } of hits(pattern, ALL_SOURCES)) counts[path] = (counts[path] ?? 0) + 1;
    return counts;
  };

  it("동치인 옛 행간·줄바꿈 철자가 전수에서 0이다", () => {
    expect(hits(OBSOLETE, ALL_SOURCES)).toEqual([]);
    expect(ALL_SOURCES.length).toBeGreaterThan(500);
  });

  it("실제 소비자에 옛 철자를 되살리면 잡는다 (카나리아)", () => {
    const toc = read("components/public-doc-toc.tsx");
    const row = read("components/logs/event-row.tsx");
    expect(toc).toContain("leading-normal");
    expect(row).toContain("wrap-anywhere");
    expect(toc.replace("leading-normal", "leading-[1.5]").match(OBSOLETE)).toEqual(["leading-[1.5]"]);
    expect(row.replace("wrap-anywhere", "[overflow-wrap:anywhere]").match(OBSOLETE)).toEqual(["[overflow-wrap:anywhere]"]);
    expect("leading-[1.6] wrap-anywhere leading-normal".match(OBSOLETE)).toBeNull();
  });

  it("불투명 divider와 다른 알파 선은 기존 위치·수만 보존한다", () => {
    expect(byFile(/\b(?:border(?:-[tblrxy])?|ring)-foreground\/\[0\.06\]/g)).toEqual({
      "app/(edit)/projects/(list)/loading.tsx": 1,
      "app/(edit)/projects/[slug]/logs/loading.tsx": 1,
      "app/(edit)/projects/[slug]/logs/page.tsx": 1,
      "app/(edit)/projects/[slug]/members/loading.tsx": 2,
      "components/landing/mockup/publish.tsx": 1,
      "components/publish-button.tsx": 1,
      "components/ui/row-card.tsx": 1,
    });
  });

  it("4px와 rem은 조건부 동치라 기존 4px 한 곳을 보존한다", () => {
    expect(byFile(/rounded-\[4px\]/g)).toEqual({ "app/(edit)/projects/(list)/loading.tsx": 1 });
  });

  it("tracking 재도입과 값 보존 예외 추가가 스캐너에 잡힌다 (카나리아)", () => {
    const candidates = ["text-xs tracking-[0.02em]", "rounded-[4px]", "border-foreground/[0.06] ring-foreground/[0.06]"];
    const pattern = /tracking-\[[^\]]+\]|rounded-\[4px\]|\b(?:border|ring)-foreground\/\[0\.06\]/g;
    expect(candidates.map((source) => hits(pattern, [{ path: "lib/canary.ts", source }]).length)).toEqual([1, 1, 2]);
  });
});

/**
 * **후보 행의 `IconTile`은 면만 덮는다** (ux-drift-unify T23 — IconTile 색 덮기 잔여). 글리프 색은 `tone`(상태 칸) 아니면 기본 muted 하나다 —
 * 꺼진 Scope 행의 `text-gray-dim` 칸은 같은 행 라벨이 이미 꺼짐을 말했다. 면(`bg-muted`·`bg-background` — 선택 면)은 T28 허용 목록이다.
 */
describe("후보 행 IconTile의 덮기", () => {
  const FILES = ["components/onboarding/steps/naming.tsx", "components/onboarding/steps/files.tsx", "components/onboarding/steps/repo.tsx", "components/mcp/token-grant-fields.tsx"];
  const tokens = (path: string) => openingTags(read(path), "IconTile").flatMap((tag) =>
    [...tag.matchAll(/"([^"]*)"/g)].flatMap((match) => (match[1] ?? "").split(/\s+/)).filter((token) => /^(?:text|bg)-/.test(token)));
  it.each(FILES)("%s — 면 색만 덮는다", (path) => {
    const found = tokens(path);
    expect(found.length).toBeGreaterThan(0);
    expect(found.filter((token) => token !== "bg-muted" && token !== "bg-background")).toEqual([]);
  });
  /** 꺼진 Scope 행의 칸은 형제 라디오와 같은 `opacity-50`으로 물러난다(r1) — 글자색을 덮지 않고 칸째 흐리게 해 라벨보다 진해지지 않는다. */
  it("꺼진 Scope 행의 칸은 형제 라디오와 같이 흐리다", () => {
    const source = read("components/mcp/token-grant-fields.tsx");
    const row = source.slice(source.indexOf("function ScopeRow"));
    expect(read("components/ui/radio.tsx")).toContain("aria-disabled:opacity-50");
    expect(row).toContain("opacity-50");
    expect(openingTags(row, "IconTile").join(" ")).toContain("opacity-50");
  });
});

/**
 * **화면 간 불변식 — 톤·낱말·동작을 소스 전수로 센다** (ux-drift-unify T28). 규칙마다 지금 위반 목록을 먼저 세고, 해소되지 않는 것만 사유와
 * 함께 허용 목록에 둔다. 각 규칙은 **메모리 카나리아**(실제 소스를 메모리에서 위반으로 바꿔 red)와 **스캔 대상 수 하한**을 든다 —
 * 스캐너가 아무것도 못 읽어도 "0건"은 green이기 때문이다(POSTMORTEM 2026-09-14).
 *
 * | 규칙 | 착수 때 위반 | 해소 |
 * |---|---|---|
 * | `ExternalLink` import 0 | `repository-card.tsx:4` | T22 |
 * | `ui/` 밖 `animate-spin` 0(`[&_.animate-spin]` 선택자 제외) | 11곳 | T13·T17·T20·T22·T23, 남은 일곱은 `SPINNER_ALLOWED` |
 * | 셸 안 카드 `rounded-xl` 0 | Logs 날짜 카드 | T21 — 16은 패널·1024 모달뿐(`PANEL_16`) |
 * | `"partial-import"` 비교는 `import-failure.ts` 안에서만 | `sources-screen.tsx:103` 등 | T7·T17 |
 * | `IconTile`에 상태 색 덮기 0 | 4곳 + `token-grant-fields.tsx:173` | T17·T18·T21·T23 — 면 색(`bg-muted`·`bg-background`)은 허용 |
 * | `TriangleAlert`는 danger 옆에 서지 않는다 | 0 | T17·T18(선제 고정) |
 *
 * `push-token-panel`의 `[&_.animate-spin]` 선택자는 T22·T23에서 사라졌다(글리프 없는 트리거 + `busy`).
 */
describe("화면 간 불변식 — grep 규칙 (T28)", () => {
  const LIB = sourceFiles(join(ROOT, "lib")).map((file) => ({ path: relative(ROOT, file), source: bare(readFileSync(file, "utf8")) }));
  const real = (path: string) => [...SOURCES, ...LIB].find((entry) => entry.path === path)?.source ?? "";

  it("스캔 대상이 실제로 읽힌다 (하한)", () => {
    expect(SOURCES.length).toBeGreaterThan(200);
    expect(LIB.length).toBeGreaterThan(300);
  });

  /**
   * **IME 조합 판정식은 `lib/keyboard.ts`에만, 조합 상태 추적은 `components/ui/use-ime-guard.ts`에만 선다** (search-ux-unify C9·D11).
   * 판정식이 여덟 곳에 손으로 있었고 둘은 `isComposing` 하나만 봤다 — Safari 확정 Enter(`keyCode` 229)가 저장·이동이 된다.
   */
  describe("IME 판정식·조합 추적은 각자 한 곳이다 (search-ux-unify C9)", () => {
    // 속성 읽기 자체를 센다(R-B2 🟡2) — `||`·`&&`가 붙어야 걸리면 막으려던 그 형(`isComposing` 단독)과 역순(`229 === e.keyCode`)이 샌다.
    const FORMULA = /\.isComposing\b|\b229\b/;
    const TRACKING = /["']composition(?:start|end)["']|onComposition(?:Start|End)\s*(?:=\s*\{\s*(?:\(|function|async)|:\s*\()/;
    const offenders = (entries: { path: string; source: string }[], pattern: RegExp, home: string) =>
      entries.filter(({ path, source }) => path !== home && pattern.test(source)).map(({ path }) => path);

    it("판정식은 lib/keyboard.ts 밖에 0곳이다", () => {
      expect(FORMULA.test(real("lib/keyboard.ts"))).toBe(true);
      expect(offenders([...SOURCES, ...LIB], FORMULA, "lib/keyboard.ts")).toEqual([]);
    });

    it("조합 추적은 use-ime-guard.ts 밖에 0곳이다 — Content는 훅의 핸들러를 달기만 한다", () => {
      expect(TRACKING.test(real("components/ui/use-ime-guard.ts"))).toBe(true);
      expect(offenders([...SOURCES, ...LIB], TRACKING, "components/ui/use-ime-guard.ts")).toEqual([]);
    });

    it.each([
      ["if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;", FORMULA, true],
      ["if (!e.isComposing && e.keyCode !== 229) submit();", FORMULA, true],
      ["if (event.nativeEvent.isComposing) return;", FORMULA, true],
      ["if (229 === e.keyCode) return;", FORMULA, true],
      ["if (isImeComposing(event.nativeEvent)) return;", FORMULA, false],
      ["const command = keyEditCommand(event.nativeEvent);", FORMULA, false],
      ["<div onCompositionStart={() => { composing.current = true; }} />", TRACKING, true],
      ["input.addEventListener(\"compositionend\", done);", TRACKING, true],
      ["<Content onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd} />", TRACKING, false],
    ] as const)("카나리아 %s", (source, pattern, hit) => {
      expect(offenders([{ path: "components/x.tsx", source }], pattern, "lib/keyboard.ts").length > 0).toBe(hit);
    });
  });

  describe("`ExternalLink` 글리프를 쓰지 않는다 — 나가는 신호는 색과 새 탭이 든다 (DESIGN §6.8 · 3-Y9)", () => {
    const LUCIDE = /import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g;
    const imports = (source: string) => [...source.matchAll(LUCIDE)].flatMap((match) => (match[1] ?? "").split(",").map((name) => name.trim()));
    const offenders = (entries: { path: string; source: string }[]) => entries.filter(({ source }) => imports(source).includes("ExternalLink")).map(({ path }) => path);

    it("0곳이다", () => {
      expect(SOURCES.filter(({ source }) => imports(source).length > 0).length).toBeGreaterThan(50);
      expect(offenders(SOURCES)).toEqual([]);
    });

    it("카나리아 — repository-card의 lucide import에 되살리면 잡는다", () => {
      const path = "components/settings/repository-card.tsx";
      const source = real(path);
      const mutated = source.replace(/import\s*\{([^}]*\}\s*from\s*"lucide-react")/, "import { ExternalLink,$1");
      expect(mutated).not.toBe(source);
      expect(offenders([{ path, source }])).toEqual([]);
      expect(offenders([{ path, source: mutated }])).toEqual([path]);
    });
  });

  describe("`ui/` 밖 수제 스피너는 허용 목록뿐이다 — 버튼 안 진행은 `Button busy`·`loading`이 든다 (3-⚪13 · 5-Y14)", () => {
    /** `[&_.animate-spin]:size-3.5`는 `Button`이 그린 스피너의 크기를 맞추는 선택자다 — 스피너를 새로 그리지 않는다. */
    const SPIN = /(?<!\[&_\.)animate-spin/g;
    /**
     * ⚠️ **`Button`/`ButtonLink`의 `busy`·`loading`으로 옮길 수 없는 일곱이다** — 사유가 사라지면 걷는다.
     */
    const SPINNER_ALLOWED: Record<string, { count: number; why: string }> = {
      // 도는 동안에도 눌러 진행 모달을 다시 연다(`launch`) — `busy`·`loading`은 클릭을 막는다. 둘째는 버튼이 아니라 진행 목록의 머리다.
      "components/publish-button.tsx": { count: 2, why: "clickable while pending · progress list" },
      // `DropdownMenuItem`이다 — `Button`이 아니라 메뉴 항목 형(focus-ring 게이트가 raw `<button>`을 막는다).
      "components/shell/user-menu.tsx": { count: 1, why: "menu item" },
      // Inbox `Try again` — `SignOutItem`과 같은 형(메뉴 항목이 닫히지 않고 disabled + 글리프 교체, 시안 D6).
      "components/shell/attention-inbox.tsx": { count: 1, why: "menu item" },
      // 서버 헤더의 `Link` 안 `useLinkStatus` 조각 — `ButtonLink`에는 `loading`이 없고 링크 자손에서만 값이 난다.
      // `buttonClass`를 입은 `Link` + `useTransition` — `ButtonLink`는 `loading`·`onNavigate`를 받지 않는다.
      // 행 끝 chevron 자리 교체 — 버튼이 아니다(행 전체가 `Link`).
      // 상태 칸(`IconTile`) 안 글리프 교체 — 버튼이 아니다.
      "components/sources/source-detail-modal.tsx": { count: 1, why: "status tile glyph" },
    };
    const byFile = (entries: { path: string; source: string }[]) => {
      const out: Record<string, number> = {};
      for (const { path, source } of entries) {
        if (path.startsWith("components/ui/")) continue;
        const n = [...source.matchAll(SPIN)].length;
        if (n > 0) out[path] = n;
      }
      return out;
    };

    it("허용 목록과 정확히 같다 — 새 자리도, 사라진 자리도 red", () => {
      expect(byFile(SOURCES)).toEqual(Object.fromEntries(Object.entries(SPINNER_ALLOWED).map(([path, { count }]) => [path, count])));
    });

    it("선택자 `[&_.animate-spin]`은 세지 않고, `Button` 자신의 스피너는 센다 (카나리아)", () => {
      expect([..."[&_.animate-spin]:size-3.5".matchAll(SPIN)]).toHaveLength(0);
      expect([...real("components/ui/button.tsx").matchAll(SPIN)]).toHaveLength(2);
      expect([...real("components/ui/link-progress.tsx").matchAll(SPIN)]).toHaveLength(1);
      const path = "components/home/sync-button.tsx";
      const source = real(path);
      expect(byFile([{ path, source }])).toEqual({});
      const mutated = source.replace("{m.repositorySync.sendFirst}", '<Loader2 className="size-4 animate-spin" aria-hidden />{m.repositorySync.sendFirst}');
      expect(mutated).not.toBe(source);
      expect(byFile([{ path, source: mutated }])).toEqual({ [path]: 1 });
    });
  });

  describe("radius 16(`rounded-xl`)은 패널과 1024 모달뿐이다 — 셸 안 카드는 12 (DESIGN §5 · 4-Y2)", () => {
    /** 패널(셸 `main`·공개 셸·로그인 두 판)과 1024 모달 둘, 그리고 그것을 정적으로 복제한 랜딩 목업 둘과 바깥24/베젤8에 맞춘 화면16. */
    const PANEL_16 = [
      "components/landing/mockup/app-frame.tsx",
      "components/landing/mockup/publish.tsx",
      "components/landing/stage.tsx",
      "components/public-shell/public-shell.tsx",
      "components/shell/content-panel.tsx",
      "components/signin/auth-layout.tsx",
      "components/ui/large-modal.tsx",
    ];
    const files = (entries: { path: string; source: string }[]) => entries.filter(({ source }) => /(?<![\w-])rounded-xl(?![\w-])/.test(source)).map(({ path }) => path).sort();

    it("등재된 여덟 파일뿐이다", () => {
      expect(files(SOURCES)).toEqual(PANEL_16);
    });

    it("카나리아 — Logs 날짜 카드를 16으로 되돌리면 잡는다", () => {
      const path = "app/(edit)/projects/[slug]/logs/page.tsx";
      const source = real(path);
      const mutated = source.replace("rounded-lg border bg-background", "rounded-xl border bg-background");
      expect(mutated).not.toBe(source);
      expect(files([{ path, source: mutated }])).toEqual([path]);
    });
  });

  describe("`partial-import`를 손으로 비교하지 않는다 — 일부 반영의 톤은 `importFailureTone` 하나가 든다 (🔴 A1 · 6-Y8)", () => {
    const COMPARE = /[!=]==\s*"partial-import"|"partial-import"\s*[!=]==/g;
    const offenders = (entries: { path: string; source: string }[]) =>
      entries.flatMap(({ path, source }) => [...source.matchAll(COMPARE)].map(() => path));

    it("`lib/projects/import-failure.ts` 한 줄뿐이다", () => {
      expect(offenders([...SOURCES, ...LIB])).toEqual(["lib/projects/import-failure.ts"]);
    });

    it("카나리아 — 대입·호출 인자는 놓아주고, 화면에서 비교하면 잡는다", () => {
      const path = "components/sources/sources-screen.tsx";
      const source = real(path);
      expect(offenders([{ path, source: 'failRun("partial-import"); x = y === 0 ? null : "partial-import"' }])).toEqual([]);
      const mutated = source.replace("const { tone } = planSurfaceImportStatus(source);", 'const tone = source.importError === "partial-import" ? "warning" : "danger";');
      expect(mutated).not.toBe(source);
      expect(offenders([{ path, source: mutated }])).toEqual([path]);
    });
  });

  describe("`IconTile`의 상태 색은 `tone`이 든다 — 호출부는 면만 덮는다 (1-R1 · 5-R1 · 5-Y6)", () => {
    const STATE_COLOR = /^(?:[a-z-]+:)*(?:text|bg|border|ring)-(?:green|emerald|amber|red|destructive|success|warning|danger)(?:-|$|\/)/;
    const tokens = (source: string) => openingTags(source, "IconTile").flatMap((tag) =>
      [...tag.matchAll(/"([^"]*)"|`([^`]*)`/g)].flatMap((match) => (match[1] ?? match[2] ?? "").split(/\s+/)));
    const offenders = (entries: { path: string; source: string }[]) =>
      entries.flatMap(({ path, source }) => tokens(source).filter((token) => STATE_COLOR.test(token)).map((token) => `${path}: ${token}`));

    it("0곳이다", () => {
      expect(SOURCES.reduce((n, { source }) => n + openingTags(source, "IconTile").length, 0)).toBeGreaterThan(15);
      expect(offenders(SOURCES)).toEqual([]);
    });

    it("카나리아 — 온보딩 후보 칸의 면을 호박으로 덮으면 잡는다", () => {
      const path = "components/onboarding/steps/naming.tsx";
      const source = real(path);
      const mutated = source.replace('className={active ? "bg-background" : "bg-muted"}', 'className={active ? "bg-background" : "bg-warning-soft text-warning-soft-foreground"}');
      expect(mutated).not.toBe(source);
      expect(offenders([{ path, source: mutated }])).toEqual([`${path}: bg-warning-soft`, `${path}: text-warning-soft-foreground`]);
    });
  });

  describe("`TriangleAlert`는 danger 옆에 서지 않는다 — 실패는 `CircleX` (DESIGN §2.4 글리프 열 · 5-Y4)", () => {
    /** 짝을 맺는 세 모양: 톤→글리프 표(`danger: X`) · 칸 객체(`{ icon: X, tone: "danger" }`) · 삼항(`=== "danger" ? X`). */
    const PAIRED = [
      /\bdanger\s*:\s*TriangleAlert\b/,
      /\bTriangleAlert\b[^{}\n]{0,40}\btone:\s*"danger"/,
      /\btone:\s*"danger"[^{}\n]{0,40}\bTriangleAlert\b/,
      /"danger"\s*\?\s*TriangleAlert\b/,
      /tone="danger"[^>]*>\s*<TriangleAlert\b/,
    ];
    const offenders = (entries: { path: string; source: string }[]) =>
      entries.filter(({ source }) => PAIRED.some((pattern) => pattern.test(source))).map(({ path }) => path);

    it("0곳이다", () => {
      expect(SOURCES.filter(({ source }) => /\bTriangleAlert\b/.test(source)).length).toBeGreaterThanOrEqual(4);
      expect(offenders(ALL_SOURCES)).toEqual([]);
    });

    it.each([
      ["components/ui/alert.tsx", "danger: CircleX", "danger: TriangleAlert"],
      ["lib/home/attention-view.ts", 'import_failed: { icon: CircleX, tone: "danger" }', 'import_failed: { icon: TriangleAlert, tone: "danger" }'],
      ["components/projects/project-list.tsx", '"danger" ? CircleX : TriangleAlert', '"danger" ? TriangleAlert : CircleX'],
    ])("카나리아 — %s의 실패 글리프를 삼각으로 바꾸면 잡는다", (path, from, to) => {
      const source = real(path);
      expect(offenders([{ path, source }])).toEqual([]);
      const mutated = source.replace(from, to);
      expect(mutated).not.toBe(source);
      expect(offenders([{ path, source: mutated }])).toEqual([path]);
    });
  });
});

/** T2의 없어진 철자만 센다. API 이름·이미지 sizes의 1280px·모달의 다른 640px는 범위 밖이다. */
const T2_RAW = /(?<![\w-])(?:bg|text|border(?:-[trblxyse])?|ring|fill|stroke|from|to|via|outline|divide|shadow|decoration|placeholder|caret|accent)-(?:blue-600|neutral-(?:300|400|600))(?![\w-])|leading-\[1\.(?:6|7|55)\]|py-\[13px\]|(?:gap|space-y)-\[3px\]|calc\(100(?:svh|%)-96px\)|@(?:max|min)-\[640px\]|min-w-\[1280px\]/g;

describe("T2 raw 소비자 전수 제거", () => {
  it("app/components/lib/messages 생산 소스에 이전 철자가 없다", () => {
    expect(hits(T2_RAW, ALL_SOURCES)).toEqual([]);
  });

  it("수정자와 별도 색 속성을 실제로 잡는다 (양성 카나리아)", () => {
    const samples = ["hover:text-blue-600", "border-t-neutral-300", "focus:placeholder-neutral-400", "caret-neutral-600", "accent-blue-600", "leading-[1.6]", "leading-[1.7]", "leading-[1.55]", "py-[13px]", "gap-[3px]", "space-y-[3px]", "h-[calc(100svh-96px)]", "w-[calc(100%-96px)]", "@max-[640px]:flex-wrap", "@min-[640px]:grid", "min-w-[1280px]"];
    for (const path of ["app/canary.tsx", "components/canary.tsx", "lib/canary.ts", "messages/canary.ts"]) {
      for (const source of samples) expect(hits(T2_RAW, [{ path, source }]), source).toHaveLength(1);
    }
    expect(hits(RAW_COLOR, [{ path: "lib/canary.ts", source: samples.slice(0, 5).join(" ") }])).toHaveLength(5);
  });

  it("새 토큰·범위 밖 값·T1 비동치 예외는 잡지 않는다 (음성 카나리아)", () => {
    expect("text-link text-gray-light text-gray-dim text-gray-strong leading-body leading-prose leading-translation py-row-y gap-copy-gap space-y-copy-gap h-[calc(100svh-var(--spacing-modal-gutter))] @max-form:flex-wrap @min-form:grid min-w-shell-min py-[11px] max-w-[1016px] max-w-[850px] border-foreground/[0.06] ring-foreground/[0.06] rounded-[4px] bg-foreground/7".match(T2_RAW)).toBeNull();
  });
});
