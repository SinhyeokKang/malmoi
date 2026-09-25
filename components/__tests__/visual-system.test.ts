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
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** ⚠️ 주석을 벗기고 센다 — 규칙을 설명하는 주석이 자기가 금지하는 클래스를 이름으로 적는다. */
const bare = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const SOURCES = ["app", "components"]
  .flatMap((dir) => sourceFiles(join(ROOT, dir)))
  .map((file) => ({ path: relative(ROOT, file), source: bare(readFileSync(file, "utf8")) }));

const read = (path: string): string => bare(readFileSync(join(ROOT, path), "utf8"));

/** 파일별로 패턴이 잡힌 토큰을 모은다. */
function hits(pattern: RegExp): { path: string; token: string }[] {
  return SOURCES.flatMap(({ path, source }) => [...source.matchAll(pattern)].map((match) => ({ path, token: match[0] })));
}

const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RAW_COLOR = new RegExp(
  `(?<![\\w-])(?:[a-z-]+:)*(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|shadow|decoration)-(?:white|black|(?:${PALETTE})-\\d{2,3})(?:\\/(?:\\[[^\\]]+\\]|\\d+))?(?![\\w-])`,
  "g",
);
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

const buttonTags = (source: string): string[] => openingTags(source, "Button|ButtonLink");

/** 넷째 높이 `h-8` · 임의 radius · `size="sm"` 위의 다른 radius — 덮은 className 문자열을 돌려준다. */
function buttonOverrides(source: string): string[] {
  return buttonTags(source).flatMap((tag) => {
    const cls = tag.match(/className="([^"]*)"/)?.[1];
    if (cls === undefined) return [];
    if (/(?<![\w-])(?:h-8|rounded-\[[^\]]*\])(?![\w-])/.test(cls)) return [cls];
    return /size="sm"/.test(tag) && /(?<![\w-])rounded-(?!full)[\w-]+/.test(cls) ? [cls] : [];
  });
}

const TONE_FILES = ["components/ui/tone.ts"];
const GLYPH = ["components/logs/glyph.tsx"];

/**
 * **DESIGN §6.2 등재 목록의 실물** — 값 → 쓰는 파일. 여기 없는 값·파일은 red다.
 *
 * ⚠️ 값의 **근거**는 §6.2가 든다. 이 표는 그것이 지금 어디에 서 있는지만 센다.
 */
const REGISTERED: Record<string, string[]> = {
  // amber — 경고 축 (§6.2 "새 raw 색을 늘리지 않는다")
  "bg-amber-100/80": ["components/home/attention-card.tsx", "components/ui/badge.tsx"],
  "text-amber-800": ["components/home/attention-card.tsx", "components/projects/project-list.tsx", "components/ui/badge.tsx"],
  "bg-amber-50": ["components/home/sync-button.tsx", "components/ui/alert.tsx", ...GLYPH],
  "border-amber-200": ["components/home/sync-button.tsx", "components/ui/alert.tsx"],
  "text-amber-900": ["components/home/sync-button.tsx", "components/ui/alert.tsx"],
  "bg-amber-500": ["components/locale-meter.tsx", "components/sources/source-detail-modal.tsx"],
  // B6 — 기준 언어 대기 테두리. `border-destructive/50`(오류)의 짝이다.
  "border-amber-500/50": ["components/sources/base-language-form.tsx"],
  // 카운트 카드 글리프 + 번역 작업 화면의 상태 글자(B6 등재) + 활동 칩
  "text-amber-700": [
    "components/home/count-cards.tsx",
    "components/landing/mockup/translations.tsx",
    "components/translations/workspace/key-list.tsx",
    "components/translations/workspace/locale-panel.tsx",
    "components/translations/workspace/workspace.tsx",
    ...GLYPH,
  ],
  // 초록 — `Active` 배지 · diff
  "bg-green-100/80": ["components/ui/badge.tsx"],
  "text-green-800": ["components/landing/mockup/publish.tsx", "components/publish-button.tsx", "components/ui/badge.tsx"],
  "bg-green-800/[0.16]": ["components/landing/mockup/publish.tsx", "components/publish-button.tsx"],
  // 빨강 — diff · missing 알약 · 사라짐 띠 · 임포트 실패 띠
  "text-red-700": ["components/landing/mockup/publish.tsx", "components/publish-button.tsx", "components/sources/source-detail-modal.tsx", "components/ui/badge.tsx", ...GLYPH],
  "bg-red-700/[0.14]": ["components/landing/mockup/publish.tsx", "components/publish-button.tsx"],
  "bg-red-700/10": ["components/ui/badge.tsx"],
  "text-red-800": ["components/projects/project-list.tsx"],
  // blue-600 — 링크 색 (§6.3) · 검색 일치 구간
  "text-blue-600": [
    "app/signin/page.tsx",
    "components/home/count-cards.tsx",
    "components/home/meta-column.tsx",
    "components/home/sync-button.tsx",
    "components/logs/event-detail.tsx",
    "components/logs/event-row.tsx",
    "components/onboarding/steps/repo.tsx",
    "components/projects/empty-projects.tsx",
    "components/projects/project-list.tsx",
    "components/public-doc.tsx",
    "components/publish-button.tsx",
    "components/settings/archive-card.tsx",
    "components/settings/ci-card.tsx",
    "components/settings/repository-card.tsx",
    "components/sources/source-detail-modal.tsx",
    "components/sources/sources-screen.tsx",
    "components/translations/workspace/locale-panel.tsx",
    "components/translations/workspace/workspace.tsx",
    "components/ui/button.tsx",
  ],
  "bg-blue-600/[0.14]": ["components/projects/project-list.tsx"],
  // neutral 계단 — 300 · 400 · 600 · 50 (§6.2)
  "border-neutral-300": ["components/landing/mockup/translations.tsx", "components/translations/workspace/locale-panel.tsx", "components/ui/checkbox.tsx", "components/ui/radio.tsx"],
  "text-neutral-300": ["components/members/role-chip.tsx"],
  "text-neutral-400": [
    "app/(edit)/account/page.tsx",
    "components/home/attention-card.tsx",
    "components/home/count-cards.tsx",
    "components/home/meta-column.tsx",
    "components/landing/mockup/translations.tsx",
    "components/logs/event-detail.tsx",
    "components/members/member-row.tsx",
    "components/projects/project-list.tsx",
    "components/settings/general-card.tsx",
    "components/sources/source-detail-modal.tsx",
    "components/sources/sources-screen.tsx",
    "components/translations/workspace/locale-panel.tsx",
    "components/translations/workspace/tree-panel.tsx",
  ],
  "text-neutral-600": [
    "components/home/sync-button.tsx",
    // 랜딩 목업은 번역 작업 화면의 정적 복제라 그 화면의 색을 그대로 쓴다(새 값 0).
    "components/landing/mockup/translations.tsx",
    "components/projects/project-list.tsx",
    "components/sources/source-detail-modal.tsx",
    "components/sources/sources-archived.tsx",
    "components/sources/sources-screen.tsx",
    "components/translations/workspace/key-list.tsx",
    "components/translations/workspace/locale-panel.tsx",
    "components/translations/workspace/tree-panel.tsx",
    "components/translations/workspace/workspace.tsx",
    "components/ui/row-card.tsx",
  ],
  "bg-neutral-50": ["components/logs/event-detail.tsx"],
  // 흑백 둘 (§6.2 "흑백 둘과 남의 자산은 이 규칙 밖이다")
  "bg-white": ["components/signin/auth-layout.tsx"],
  "text-white": ["components/invite/project-card.tsx", "components/projects/project-thumbnail.tsx", "components/settings/general-card.tsx", "components/ui/avatar.tsx"],
  // tone 여덟 (`-600`)
  ...Object.fromEntries(["rose", "orange", "amber", "emerald", "teal", "sky", "indigo", "fuchsia"].map((tone) => [`bg-${tone}-600`, TONE_FILES])),
  // 활동 글리프 칩 일곱 (§6.68)
  ...Object.fromEntries(
    ["bg-emerald-50", "text-emerald-700", "bg-red-50", "bg-slate-100", "text-slate-600", "bg-blue-50", "text-blue-700", "bg-teal-50", "text-teal-700", "bg-violet-50", "text-violet-700"].map((value) => [value, GLYPH]),
  ),
};

describe("raw 색은 §6.2 등재 목록 안에만 선다 (audit #43·#44)", () => {
  const found = hits(RAW_COLOR).map(({ path, token }) => ({ path, value: colorValue(token) }));

  it("검사가 실제로 raw 색을 찾는다 (카나리아)", () => {
    expect(found.length).toBeGreaterThan(50);
  });

  it("등재되지 않은 값·자리가 없다", () => {
    const stray = found.filter(({ path, value }) => !(Object.hasOwn(REGISTERED, value) && REGISTERED[value]?.includes(path)));
    expect(stray.map(({ path, value }) => `${path}: ${value}`)).toEqual([]);
  });

  it("등재된 자리가 전부 실재한다 — 소비자가 0이 된 줄은 목록에서 걷는다", () => {
    const seen = new Set(found.map(({ path, value }) => `${path}: ${value}`));
    const stale = Object.entries(REGISTERED).flatMap(([value, paths]) => paths.map((path) => `${path}: ${value}`)).filter((key) => !seen.has(key));
    expect(stale).toEqual([]);
  });

  it("이력 날짜 카드가 흰 토큰을 쓴다 (#43)", () => {
    expect(read("app/(edit)/projects/[slug]/logs/page.tsx")).toContain("rounded-xl border bg-background");
  });

  it("임의값 안에 hex·rgba를 쓰지 않는다 — 토큰의 알파로 접는다", () => {
    expect(hits(/[\w:-]+-\[[^\]\s]*(?:rgba?\(|#[0-9a-fA-F]{3,8})[^\]\s]*\]/g).map(({ path, token }) => `${path}: ${token}`)).toEqual([]);
  });
});

describe("글자 크기·자간·radius는 스케일이 든다 (audit #45·#46·#47)", () => {
  it("임의 글자 크기 `text-[Npx]`가 0이다", () => {
    expect(hits(/(?<![\w-])(?:[a-z-]+:)*text-\[\d+(?:\.\d+)?px\]/g).map(({ path, token }) => `${path}: ${token}`)).toEqual([]);
  });

  /**
   * ⚠️ **남은 여덟은 §6.67의 예외다** — 계정 라벨 셋 · 공유 `PanelCard` 넷 · 모달 제목 하나. 번역 작업 화면의
   * 스물하나는 크기 토큰과 같은 값을 되적거나(`text-xs tracking-[0.02em]`) 토큰 값을 덮었다(`text-sm tracking-[0.015em]`).
   */
  it("`tracking-*`가 §6.67의 여덟뿐이다", () => {
    const found = hits(/(?<![\w-])tracking-[\w[\].-]+/g);
    const byFile: Record<string, number> = {};
    for (const { path } of found) byFile[path] = (byFile[path] ?? 0) + 1;
    expect(byFile).toEqual({ "app/(edit)/account/page.tsx": 3, "components/ui/panel-card.tsx": 4, "components/ui/modal.tsx": 1 });
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
    const mutated = source.replace('className="h-7 min-w-7 gap-1 px-1.5"', 'className="h-8 min-w-7 gap-1 px-1.5"');
    expect(mutated).not.toBe(source);
    expect(buttonOverrides(mutated)).toEqual(["h-8 min-w-7 gap-1 px-1.5"]);
  });

  it("리터럴 Button 여는 태그를 전부 읽는다 — `=>`나 className 뒤의 `size`에서 끊기지 않는다", () => {
    const tags = SOURCES.flatMap(({ source }) => buttonTags(source));
    expect(tags.length).toBeGreaterThan(100);
    const copy = SOURCES.find((entry) => entry.path === "components/translations/workspace/locale-panel.tsx")?.source ?? "";
    expect(buttonTags(copy).some((tag) => tag.includes('size="sm"') && tag.includes("h-7 min-w-7"))).toBe(true);
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
  it("아이콘에 붙는 색은 무채 계단·destructive·PR 초록뿐이다", () => {
    const ALLOWED = new Set(["text-muted-foreground", "text-foreground", "text-destructive", "text-neutral-300", "text-neutral-400", "text-neutral-600", "text-green-800"]);
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
      const trigger = read(path).match(/<DropdownMenuTrigger[\s\S]*?>/)?.[0] ?? "";
      expect(trigger, path).toContain("hover:bg-primary-foreground");
      expect(trigger, path).not.toContain("hover:bg-accent");
    }
  });

  it("안내 상자는 `Alert`가 든다 — 이력 보관 안내·상세 노트", () => {
    // 상시 안내는 `Alert info`다. 실패 노트는 live 의미를 피하려고 Alert가 아니다(B6 r1 — `logs-events.test.tsx`가 센다).
    expect(read("components/logs/event-detail.tsx")).toMatch(/function Note\b[^]*?<Alert variant="info">/);
    expect(read("app/(edit)/projects/[slug]/logs/page.tsx")).toMatch(/<Alert\s+variant="info"[\s\S]{0,400}\{m\.logs\.archived\.restoreLine/);
  });
});

describe("같은 행동은 같은 variant다 (audit #50)", () => {
  it("연결 해제 트리거가 전부 `danger`다", () => {
    const github = read("components/github-account.tsx").match(/<DialogTrigger asChild>\s*(?:\{\}\s*)?<Button variant="(\w+)"/)?.[1];
    expect(github).toBe("danger");
    const methods = [...read("components/account/login-methods.tsx").matchAll(/<Button variant="(\w+)" aria-label=\{m\.link\.methods\.disconnectLabel/g)].map((match) => match[1]);
    expect(methods).toEqual(["danger", "danger"]);
  });

  it("페이지의 유일한 출구인 Retry가 전부 `primary`다", () => {
    for (const path of ["app/error.tsx", "app/(edit)/error.tsx", "app/(edit)/projects/[slug]/logs/error.tsx"]) {
      const retry = read(path).match(/<Button\b[^>]*variant="(\w+)"[^>]*onClick=\{(?:reset|\(\) => retry\(\))\}/)?.[1];
      expect(retry, path).toBe("primary");
    }
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
});
