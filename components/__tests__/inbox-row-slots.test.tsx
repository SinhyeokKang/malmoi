// @vitest-environment jsdom
import { expect, it } from "vitest";

import { attentionRowSlots } from "@/components/inbox/row-slots";
import { ListRow } from "@/components/ui/list-row";
import { attentionHref, body, reconnectDestination, tail, title } from "@/lib/home/attention-view";
import type { InboxItem } from "@/lib/inbox/plan";
import { relativeTime } from "@/lib/relative-time";
import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render } from "./helpers/dom";

/**
 * inbox-page T3 — 드롭다운 · 페이지 · Home 카드가 나눠 쓰는 행 조각(D3). 그릇(`DropdownMenuRow`·`ListRow`)은 문맥별이고 슬롯은 한 함수다.
 * 권한은 여기서 판정하지 않는다 — `ownerRetries`는 호출부가 정해 넘기는 입력이다.
 */
const now = new Date("2026-10-05T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

type Input = InboxItem & { ownerRetries: boolean; unread?: boolean };
const failedAt = ago(12);
const failed: Input = { kind: "import_failed", at: failedAt, surfaceSlug: "web", reason: "parse-failed", ownerRetries: false };
const review: Input = { kind: "review", at: ago(180), surfaceSlug: "web", code: "ko", name: "Korean", count: 8, who: "Kim", ownerRetries: false };

const row = (item: Input, time: "narrow" | "long" = "long") =>
  render(<ListRow {...attentionRowSlots(en, "en", "acme", item, now, { time, reconnect: "settings" })} />);

it("href는 attentionHref와 같다", () => {
  expect(attentionRowSlots(en, "en", "acme", failed, now, { time: "long", reconnect: "settings" }).href).toBe(attentionHref("acme", failed, "settings"));
  expect(attentionRowSlots(en, "en", "acme", review, now, { time: "long", reconnect: "settings" }).href).toBe(attentionHref("acme", review, "settings"));
});

it("제목은 굵은 사실 + 근거 꼬리, 보조줄은 표면·로케일이다", async () => {
  const { container } = await row(review);
  expect(container.querySelector(".font-medium")!.textContent).toBe(body(en, review));
  expect(container.textContent).toContain(`${body(en, review)}${tail(en, review)}`);
  expect(container.textContent).toContain(title(en, review));
});

it("unread 항목만 점과 sr `Unread`를 가진다 — 점은 장식이다", async () => {
  const unread = (await row({ ...failed, unread: true })).container;
  expect(unread.querySelectorAll("[data-unread-dot]")).toHaveLength(1);
  expect(unread.querySelector("[data-unread-dot]")!.getAttribute("aria-hidden")).toBe("true");
  expect(unread.querySelector(".sr-only")!.textContent).toBe(en.inbox.unread);
  for (const item of [{ ...failed, unread: false }, failed]) {
    const read = (await row(item)).container;
    expect(read.querySelector("[data-unread-dot]")).toBeNull();
    expect(read.textContent).not.toContain(en.inbox.unread);
  }
});

it("ownerRetries가 참일 때만 Owner 안내 줄이 선다 — 슬롯은 권한을 다시 판정하지 않는다", async () => {
  expect((await row({ ...failed, ownerRetries: true })).container.textContent).toContain(en.projects.importFailure.ownerRetries);
  expect((await row(failed)).container.textContent).not.toContain(en.projects.importFailure.ownerRetries);
  // 종류가 import_failed가 아니어도 입력이 참이면 선다 — 판정은 호출부 몫이다.
  expect((await row({ ...review, ownerRetries: true })).container.textContent).toContain(en.projects.importFailure.ownerRetries);
});

it("보조줄도 안내도 없으면 description 슬롯이 비어 있다", () => {
  const setup: Input = { kind: "setup", at: ago(5), ownerRetries: false };
  expect(attentionRowSlots(en, "en", "acme", setup, now, { time: "long", reconnect: "settings" }).description).toBeUndefined();
  expect(attentionRowSlots(en, "en", "acme", { ...setup, ownerRetries: true }, now, { time: "long", reconnect: "settings" }).description).toBeDefined();
});

it("시각이 없으면 aside 슬롯이 비어 있다 — `Never`를 적지 않는다", () => {
  const unsent: Input = { kind: "unsent", at: null, count: 3, surfaceSlug: "web", ownerRetries: false };
  expect(attentionRowSlots(en, "en", "acme", unsent, now, { time: "narrow", reconnect: "settings" }).aside).toBeUndefined();
  expect(attentionRowSlots(en, "en", "acme", unsent, now, { time: "long", reconnect: "settings" }).aside).toBeUndefined();
});

it("time 인자가 시각의 형을 가른다 — narrow는 짧은 형, long은 긴 형", async () => {
  const narrow = (await row(failed, "narrow")).container.querySelector("span.shrink-0.text-xs")!.textContent;
  const long = (await row(failed, "long")).container.querySelector("span.shrink-0.text-xs")!.textContent;
  expect(narrow).toBe(relativeTime(failedAt, now, "en", { style: "narrow" }));
  expect(long).toBe(relativeTime(failedAt, now, "en"));
  expect(narrow).not.toBe(long);
});

it("화면 언어와 사전은 인자로 받는다", async () => {
  const { container } = await render(<ListRow {...attentionRowSlots(ko, "ko", "acme", { ...failed, unread: true }, now, { time: "long", reconnect: "settings" })} />);
  expect(container.textContent).toContain(body(ko, failed));
  expect(container.querySelector(".sr-only")!.textContent).toBe(ko.inbox.unread);
  expect(container.querySelector("span.shrink-0.text-xs")!.textContent).toBe(relativeTime(failedAt, now, "ko"));
});

// ── 재연결 항목 (project-row-redesign T8 · 시안 프레임 14) ─────────────────────────────

const reconnect: Input = { kind: "needs_reconnect", at: null, ownerRetries: false };

it("재연결 항목은 호박 IconTile + Unplug이고 보조줄이 없다", async () => {
  const { container } = await row(reconnect);
  expect(container.querySelector("svg.lucide-unplug")).not.toBeNull();
  expect(container.querySelector("[data-tone='warning']")).not.toBeNull();
  expect(title(en, reconnect)).toBe("");
  expect(attentionRowSlots(en, "en", "acme", reconnect, now, { time: "long", reconnect: "settings" }).description).toBeUndefined();
});

it.each([["en", en], ["ko", ko], ["es", es]] as const)("%s 재연결 본문 + 꼬리는 목록 띠의 끊김 문장 그대로다", (_ui, m) => {
  expect(`${body(m, reconnect)}${tail(m, reconnect)}`).toBe(m.projects.banner.needsReconnect);
  expect(body(m, reconnect).length).toBeGreaterThan(0);
  expect(tail(m, reconnect).length).toBeGreaterThan(0);
});

it("EDITOR 재연결 항목은 둘째 줄에 소유자 요청 문장이 선다 — 재시도 안내가 아니다", async () => {
  const text = (await row({ ...reconnect, ownerRetries: true })).container.textContent;
  expect(text).toContain(en.projects.banner.askOwner.reconnect);
  expect(text).not.toContain(en.projects.importFailure.ownerRetries);
  expect((await row(reconnect)).container.textContent).not.toContain(en.projects.banner.askOwner.reconnect);
});

it("재연결 목적지는 호출부가 정한 값이다 — OWNER Settings · EDITOR 프로젝트 Home", () => {
  expect(attentionRowSlots(en, "en", "acme", reconnect, now, { time: "long", reconnect: "settings" }).href).toBe("/projects/acme/settings");
  expect(attentionRowSlots(en, "en", "acme", reconnect, now, { time: "long", reconnect: "home" }).href).toBe("/projects/acme");
  expect(reconnectDestination("OWNER")).toBe("settings");
  expect(reconnectDestination("EDITOR")).toBe("home");
});

/**
 * **세 소비자(드롭다운 · `/inbox` · Home 카드)가 같은 출처의 목적지를 넘긴다** — Inbox 둘은 계획(`planInbox`)이 `reconnectDestination`으로 정한
 * 그룹 값을, Home 카드는 같은 함수를 자기 역할로 부른다. 소비자마다 역할을 다시 판정하면 같은 항목이 화면마다 다른 곳으로 간다.
 */
it("세 소비자가 같은 함수에서 재연결 목적지를 얻는다", () => {
  const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  expect(src("lib/inbox/plan.ts")).toContain("reconnect: reconnectDestination(project.role)");
  expect(src("components/inbox/inbox-list.tsx")).toContain('{ time: "long", reconnect: group.project.reconnect }');
  expect(src("components/shell/attention-inbox.tsx")).toContain("reconnect={group.project.reconnect}");
  expect(src("components/shell/attention-inbox.tsx")).toContain('{ time: "narrow", reconnect }');
  expect(src("components/home/attention-card.tsx")).toContain('{ time: "long", reconnect: reconnectDestination(role) }');
});

/** 배지 Action이 매 헤더에서 부르는 경로는 원격 신호(호스트 API)를 import하지 않는다 — 원격 셋은 목록 띠 전용이다. */
it("Inbox·배지 경로에 원격 신호 import가 0이다", () => {
  // 언어 변경 일괄 읽기(language-request-todo)도 배지 경로다 — DB만 읽는다.
  for (const rel of ["app/inbox/actions.ts", "lib/inbox/load.ts", "lib/inbox/plan.ts", "lib/inbox/project-todos.ts", "lib/locales/todo.ts", "lib/locales/work.ts"]) {
    const text = readFileSync(join(process.cwd(), rel), "utf8");
    expect(text, rel).not.toContain("loadRemoteSignals");
    expect(text, rel).not.toContain("@/lib/projects/remote");
  }
});

// ── 언어 변경 항목 (language-request-todo T7 · 시안 프레임 4·5·5b) ─────────────────────

const languageOpen: Input = { kind: "language_unsent", at: ago(120), count: 3, surfaceSlug: "web", held: false, ownerRetries: false };
const languageHeld: Input = { kind: "language_unsent", at: null, count: 2, surfaceSlug: "docs", held: true, ownerRetries: false };

it("언어 변경 항목은 muted IconTile + GitPullRequestArrow이고 보조줄은 대표 소스 slug다", async () => {
  for (const [item, slug] of [[languageOpen, "web"], [languageHeld, "docs"]] as const) {
    const { container } = await row(item);
    expect(container.querySelector("svg.lucide-git-pull-request-arrow")).not.toBeNull();
    expect(container.querySelector("[data-tone='muted']")).not.toBeNull();
    expect(container.textContent).toContain(slug);
  }
});

it("① 보류 아님 — 띠 문장을 통째로 굵게 쓰고 꼬리가 없다", async () => {
  const { container } = await row(languageOpen);
  expect(container.querySelector(".font-medium")!.textContent).toBe(en.projects.banner.languageChanges(3));
  expect(tail(en, languageOpen)).toBe("");
});

it.each([["en", en], ["ko", ko], ["es", es]] as const)("%s ② 보류 — 굵은 사실 + 꼬리이고 둘을 이으면 목록 띠 문장이다", async (_ui, m) => {
  expect(`${body(m, languageHeld)}${tail(m, languageHeld)}`).toBe(m.projects.banner.languageRemovalHeld);
  expect(body(m, languageHeld)).toBe(m.inbox.languageRemovalHeld.body);
  // 보류는 수를 말하지 않는다 — 제거가 여럿이어도 보류는 하나다.
  expect(body(m, languageHeld)).not.toMatch(/\d/);
});

it("② 항목의 굵은 조각은 본문이고 꼬리는 그 뒤에 이어진다", async () => {
  const { container } = await row(languageHeld);
  expect(container.querySelector(".font-medium")!.textContent).toBe(en.inbox.languageRemovalHeld.body);
  expect(container.textContent).toContain(en.projects.banner.languageRemovalHeld);
});

it("거둘 것만 남아 시각이 없는 항목은 시각 칸이 비고, 읽음이면 점이 없다(D11)", async () => {
  expect(attentionRowSlots(en, "en", "acme", languageHeld, now, { time: "long", reconnect: "settings" }).aside).toBeUndefined();
  expect((await row({ ...languageHeld, unread: false })).container.querySelector("[data-unread-dot]")).toBeNull();
});

it("목적지는 두 역할 모두 프로젝트 Home이다 — 소유자 안내 줄이 없다", async () => {
  for (const reconnect of ["settings", "home"] as const) {
    expect(attentionRowSlots(en, "en", "acme", languageOpen, now, { time: "long", reconnect }).href).toBe("/projects/acme");
  }
  const text = (await row(languageOpen)).container.textContent;
  expect(text).not.toContain(en.projects.banner.askOwner.reconnect);
  expect(text).not.toContain(en.projects.importFailure.ownerRetries);
});
