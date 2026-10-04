// @vitest-environment jsdom
import { en } from "@/messages/en";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ts } from "ts-morph";
import { describe, expect, it } from "vitest";

import { walkFiles } from "@/lib/cli/walk";

import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { STATE, stateLabel, type StateKey } from "@/lib/status/canon";

import { render } from "./helpers/dom";

/**
 * **상태 배지는 상태 키 하나만 받는다** (DESIGN §2.4 · ux-drift-unify T11) — variant와 낱말이 `STATE`에서 온다.
 * 호출부가 variant를 고르는 자리가 사라지는 것이 요지라, 기대값을 손으로 적지 않고 같은 표에서 뽑은 `Badge`와 비교한다.
 */
describe("StatusBadge", () => {
  const keys = Object.keys(STATE) as StateKey[];

  it("표의 키를 전부 돈다", () => {
    expect(keys.length).toBeGreaterThan(10);
  });

  it.each(keys)("%s → STATE의 variant + 낱말", async (key) => {
    const shown = (await render(<StatusBadge state={key} />)).container.firstElementChild!;
    const expected = (await render(<Badge variant={STATE[key].variant}>{stateLabel(en, key)}</Badge>)).container.firstElementChild!;
    expect(shown.className).toBe(expected.className);
    expect(shown.textContent).toBe(stateLabel(en, key));
  });

  it("className은 배치만 덧댄다 — variant 면은 그대로다", async () => {
    const shown = (await render(<StatusBadge state="syncFailed" className="shrink-0" />)).container.firstElementChild!;
    expect(shown.className).toContain("shrink-0");
    expect(shown.className).toContain("bg-destructive/8");
  });

  /**
   * **사라진 언어도 `soft-red` 하나다** (D3②) — 면 없는 붉은 글자 `danger`는 소비자가 로케일 배지 하나라 지웠다.
   * `soft-red`에는 글리프 간격이 없다 — 배지 안에 글리프를 넣지 않는다(§2.4).
   */
  it("Badge에 danger variant가 없고, soft-red에 글리프 간격이 없다", async () => {
    // @ts-expect-error — D3②로 지운 variant다. 되살리면 이 줄이 typecheck에서 red다.
    const gone = (await render(<Badge variant="danger">x</Badge>)).container.firstElementChild!;
    expect(gone.className).not.toContain("text-destructive");
    const missing = (await render(<Badge variant="soft-red">x</Badge>)).container.firstElementChild!;
    expect(missing.className).not.toContain("gap-1.5");
  });
});

/**
 * **상태 배지의 색은 `STATE` 표 하나가 든다** (search-ux-unify C5·D6 — 보관 배지가 검색·스위처·`/projects`에서 세 모양이었다).
 * `components/**` 전수다: `<StatusBadge>`의 `className`(조건부·`cn(...)` 안 문자열까지)에 색 클래스가 0이고 — 동적 `state`
 * (`CHIP_STATE[...]`)도 같은 스캔에 든다 — 보관 낱말을 원시 `<Badge>`로 그리는 곳이 0이다. `className`은 배치(`shrink-0`·바깥 여백)만이다.
 * ⚠️ **안쪽 가로 여백(`px-*`)도 덧칠 0이다**(search-ux-polish O8) — 칩은 `Badge` 기본 `px-1.5` 한 형이다. 스위처·`/projects`만
 * `px-2`를 덧대 같은 보관 칩이 화면마다 폭이 갈렸다.
 */
const NON_COLOR_TEXT = /^(?:xs|sm|base|lg|[2-9]?xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/;
const NON_COLOR_BORDER = /^(?:\d+|[xytblrse](?:-\d+)?|solid|dashed|dotted|double|hidden|none|collapse|separate)$/;
function colorClasses(className: string): string[] {
  return className.split(/\s+/).filter(Boolean).filter(raw => {
    const token = raw.split(":").at(-1)!.replace(/^!/, "");
    const match = /^(text|bg|border|ring|fill|stroke|outline|decoration)-(.+)$/.exec(token);
    if (!match) return false;
    const [, kind, rest] = match as unknown as [string, string, string];
    if (kind === "text") return !NON_COLOR_TEXT.test(rest) && !/^\[[\d.]+(?:px|rem|em)\]$/.test(rest);
    if (kind === "border" || kind === "outline") return !NON_COLOR_BORDER.test(rest);
    if (kind === "ring") return !/^(?:\d+|inset|offset-\d+)$/.test(rest);
    return true;
  });
}
function literals(node: ts.Node): string[] {
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.flatMap(span => [...literals(span.expression), span.literal.text])];
  const found: string[] = [];
  ts.forEachChild(node, child => { found.push(...literals(child)); });
  return found;
}
function statusSites(path: string, code: string): { badges: string[]; paddings: string[]; rawArchived: string[] } {
  const file = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const badges: string[] = [];
  const paddings: string[] = [];
  const rawArchived: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(file);
      if (tag === "StatusBadge") {
        const className = node.attributes.properties.filter(ts.isJsxAttribute).find(attr => attr.name.getText(file) === "className")?.initializer;
        const colors = className === undefined ? [] : literals(className).flatMap(colorClasses);
        if (colors.length > 0) badges.push(`${path}: ${colors.join(" ")}`);
        const padding = className === undefined ? [] : literals(className).flatMap(text => text.split(/\s+/)).filter(token => /^px-/.test(token.split(":").at(-1)!.replace(/^!/, "")));
        if (padding.length > 0) paddings.push(`${path}: ${padding.join(" ")}`);
      }
      if (tag === "Badge" && ts.isJsxOpeningElement(node) && /\bm\.projects\.(?:status\.)?archived\b/.test(node.parent.getText(file))) rawArchived.push(path);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { badges, paddings, rawArchived };
}

describe("상태 배지의 색은 표가 든다 — components 전수", () => {
  const files = walkFiles("components").filter(path => /\.tsx$/.test(path) && !path.includes("__tests__")).map(path => `components/${path}`);
  const sites = files.map(path => statusSites(path, readFileSync(join(process.cwd(), path), "utf8")));

  it("스캔이 실제 소비처를 본다", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.filter(path => readFileSync(join(process.cwd(), path), "utf8").includes("<StatusBadge")).length).toBeGreaterThanOrEqual(10);
  });

  it("<StatusBadge>의 className에 색 클래스가 없다(조건부·동적 state 포함)", () => {
    expect(sites.flatMap(site => site.badges)).toEqual([]);
  });

  it("<StatusBadge>의 className에 안쪽 가로 여백(px-*)이 없다 — Badge 기본 px-1.5 한 형(O8)", () => {
    expect(sites.flatMap(site => site.paddings)).toEqual([]);
  });

  it("보관 낱말을 원시 <Badge>로 그리는 곳이 없다", () => {
    expect(sites.flatMap(site => site.rawArchived)).toEqual([]);
  });

  it("검사기가 조건부·cn·템플릿 안의 색과 원시 보관 배지를 잡고 배치는 통과시킨다", () => {
    const fixture = (jsx: string) => statusSites("components/x.tsx", `export const X = () => ${jsx};`);
    expect(fixture('<StatusBadge state={CHIP_STATE[s]} className={cn("shrink-0", s === "archived" && "text-gray-dim")} />').badges).toHaveLength(1);
    expect(fixture('<StatusBadge state="archived" className="shrink-0 hover:bg-muted" />').badges).toHaveLength(1);
    expect(fixture('<StatusBadge state="archived" className={`ml-2 ${x ? "border-red-500" : ""}`} />').badges).toHaveLength(1);
    expect(fixture('<StatusBadge state="archived" className="shrink-0 ml-2 text-xs align-middle border-0" />').badges).toEqual([]);
    expect(fixture('<StatusBadge state="archived" className="shrink-0 ml-2 mr-1.5 align-middle" />').paddings).toEqual([]);
    expect(fixture('<StatusBadge state="archived" className="shrink-0 px-2" />').paddings).toHaveLength(1);
    expect(fixture('<StatusBadge state={CHIP_STATE[s]} className={cn("shrink-0", wide && "sm:px-3")} />').paddings).toHaveLength(1);
    expect(fixture("<Badge>{m.projects.archived}</Badge>").rawArchived).toHaveLength(1);
    expect(fixture("<Badge variant=\"soft-neutral\">{m.projects.status.archived}</Badge>").rawArchived).toHaveLength(1);
    expect(fixture("<Badge>{m.projects.status.active}</Badge>").rawArchived).toEqual([]);
  });

  it("보관의 정본 모양은 soft-neutral이다(D6)", () => {
    expect(STATE.archived.variant).toBe("soft-neutral");
  });
});

// 타입 계약: 상태 낱말·모양을 호출부에서 덮어쓸 통로가 없어야 한다.
function rejectedStatusProps() {
  // @ts-expect-error — 상태는 variant를 받지 않는다.
  return <StatusBadge state="synced" variant="soft-red" />;
}
function rejectedStatusLabel() {
  // @ts-expect-error — 상태는 임의 라벨을 받지 않는다.
  return <StatusBadge state="synced" label="Different" />;
}
void rejectedStatusProps;
void rejectedStatusLabel;
