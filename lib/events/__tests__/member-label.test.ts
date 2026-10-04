import { describe, expect, it } from "vitest";

import { displayMemberPayload } from "@/lib/events/member-label";
import type { EventPayload } from "@/lib/events/payload";
import { en } from "@/messages/en";
import { es } from "@/messages/es";
import { ko } from "@/messages/ko";

const member = (targetLabel: string): EventPayload => ({ kind: "MEMBER", targetLabel, role: null });

describe("저장된 멤버 대체 라벨은 화면 언어로 그린다", () => {
  // 저장값은 en으로 굳는다(`member-label.ts`) — Logs가 읽을 때만 사전의 같은 키로 되돌린다.
  it("저장된 en 낱말 둘을 그 화면 언어의 낱말로 바꾼다", () => {
    expect(displayMemberPayload(ko, member(en.logs.trigger.removed))).toEqual(member(ko.logs.trigger.removed));
    expect(displayMemberPayload(ko, member(en.common.unreadable))).toEqual(member(ko.common.unreadable));
    expect(displayMemberPayload(es, member(en.logs.trigger.removed))).toEqual(member(es.logs.trigger.removed));
    expect(ko.logs.trigger.removed).not.toBe(en.logs.trigger.removed);
  });

  it("다른 targetLabel은 그대로 지나간다 — 마스킹 주소·en 화면", () => {
    expect(displayMemberPayload(ko, member("a**@example.com"))).toEqual(member("a**@example.com"));
    expect(displayMemberPayload(en, member(en.logs.trigger.removed))).toEqual(member(en.logs.trigger.removed));
  });

  it("MEMBER가 아닌 payload와 null은 건드리지 않는다", () => {
    const settings: EventPayload = { kind: "SETTINGS", field: "name", value: null };
    expect(displayMemberPayload(ko, settings)).toBe(settings);
    expect(displayMemberPayload(ko, null)).toBeNull();
  });
});
