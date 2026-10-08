// @vitest-environment jsdom
import { expect, it } from "vitest";

import { attentionRowSlots } from "@/components/inbox/row-slots";
import { ListRow } from "@/components/ui/list-row";
import { attentionHref, body, tail, title } from "@/lib/home/attention-view";
import type { InboxItem } from "@/lib/inbox/plan";
import { relativeTime } from "@/lib/relative-time";
import { en } from "@/messages/en";
import { ko } from "@/messages/ko";

import { render } from "./helpers/dom";

/**
 * inbox-page T3 — 드롭다운 · 페이지 · Home 카드가 나눠 쓰는 행 조각(D3). 그릇(`DropdownMenuRow`·`ListRow`)은 문맥별이고 슬롯은 한 함수다.
 * 권한은 여기서 판정하지 않는다 — `ownerRetries`는 호출부가 정해 넘기는 입력이다.
 */
const now = new Date("2026-10-05T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

type Input = InboxItem & { ownerRetries: boolean; unread?: boolean };
const failed: Input = { kind: "import_failed", at: ago(12), surfaceSlug: "web", reason: "parse-failed", ownerRetries: false };
const review: Input = { kind: "review", at: ago(180), surfaceSlug: "web", code: "ko", name: "Korean", count: 8, who: "Kim", ownerRetries: false };

const row = (item: Input, time: "narrow" | "long" = "long") =>
  render(<ListRow {...attentionRowSlots(en, "en", "acme", item, now, { time })} />);

it("href는 attentionHref와 같다", () => {
  expect(attentionRowSlots(en, "en", "acme", failed, now, { time: "long" }).href).toBe(attentionHref("acme", failed));
  expect(attentionRowSlots(en, "en", "acme", review, now, { time: "long" }).href).toBe(attentionHref("acme", review));
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
  expect(attentionRowSlots(en, "en", "acme", setup, now, { time: "long" }).description).toBeUndefined();
  expect(attentionRowSlots(en, "en", "acme", { ...setup, ownerRetries: true }, now, { time: "long" }).description).toBeDefined();
});

it("시각이 없으면 aside 슬롯이 비어 있다 — `Never`를 적지 않는다", () => {
  const unsent: Input = { kind: "unsent", at: null, count: 3, surfaceSlug: "web", ownerRetries: false };
  expect(attentionRowSlots(en, "en", "acme", unsent, now, { time: "narrow" }).aside).toBeUndefined();
  expect(attentionRowSlots(en, "en", "acme", unsent, now, { time: "long" }).aside).toBeUndefined();
});

it("time 인자가 시각의 형을 가른다 — narrow는 짧은 형, long은 긴 형", async () => {
  const narrow = (await row(failed, "narrow")).container.querySelector(".shrink-0")!.textContent;
  const long = (await row(failed, "long")).container.querySelector(".shrink-0")!.textContent;
  expect(narrow).toBe(relativeTime(failed.at, now, "en", { style: "narrow" }));
  expect(long).toBe(relativeTime(failed.at, now, "en"));
  expect(narrow).not.toBe(long);
});

it("화면 언어와 사전은 인자로 받는다", async () => {
  const { container } = await render(<ListRow {...attentionRowSlots(ko, "ko", "acme", { ...failed, unread: true }, now, { time: "long" })} />);
  expect(container.textContent).toContain(body(ko, failed));
  expect(container.querySelector(".sr-only")!.textContent).toBe(ko.inbox.unread);
  expect(container.querySelector(".shrink-0")!.textContent).toBe(relativeTime(failed.at, now, "ko"));
});
