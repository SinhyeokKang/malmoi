import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InvitationEmailConfig } from "../config";
import { readInvitationEmailConfigFromEnv, sendInvitationEmails } from "../send";

/**
 * Resend `/emails/batch` 한 번 (design §4). **자동 재시도 0회, 10초 timeout, 요청 UUID 멱등 키.**
 *
 * ⚠️ **로그에 주소·토큰·API 키가 없다** — 로그는 단계와 정규화한 결과만 허용한다.
 */

const config: Extract<InvitationEmailConfig, { status: "ready" }> = {
  status: "ready",
  apiKey: "re_secret_key",
  from: "malmoi <invite@notify.mal-moi.com>",
  origin: "https://mal-moi.com",
};
const messages = [
  { to: "a@x.com", token: "tok_a" },
  { to: "b@x.com", token: "tok_b" },
];

const fetchMock = vi.fn();
let logs: string[];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  logs = [];
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ok = (n: number) =>
  new Response(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ id: `id_${i}` })) }), { status: 200 });

function lastRequest(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url: call[0], init: call[1] };
}

describe("sendInvitationEmails — 요청 모양", () => {
  it("batch 엔드포인트에 POST 한 번이다", async () => {
    fetchMock.mockResolvedValueOnce(ok(2));
    await sendInvitationEmails(config, messages);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastRequest().url).toBe("https://api.resend.com/emails/batch");
    expect(lastRequest().init.method).toBe("POST");
  });

  it("본문은 개인별 메시지 배열이다 — 한 메시지에 수신자 한 명, 자기 링크 한 줄", async () => {
    fetchMock.mockResolvedValueOnce(ok(2));
    await sendInvitationEmails(config, messages);
    expect(JSON.parse(String(lastRequest().init.body))).toEqual([
      { from: config.from, to: ["a@x.com"], subject: "You're invited to Malmoi", text: "https://mal-moi.com/invite/tok_a", html: expect.stringContaining("https://mal-moi.com/invite/tok_a") },
      { from: config.from, to: ["b@x.com"], subject: "You're invited to Malmoi", text: "https://mal-moi.com/invite/tok_b", html: expect.stringContaining("https://mal-moi.com/invite/tok_b") },
    ]);
  });

  it("Bearer 키와 요청마다 새 UUID 멱등 키를 싣는다", async () => {
    fetchMock.mockResolvedValue(ok(2));
    await sendInvitationEmails(config, messages);
    const first = new Headers(lastRequest().init.headers);
    await sendInvitationEmails(config, messages);
    const second = new Headers(lastRequest().init.headers);
    expect(first.get("authorization")).toBe("Bearer re_secret_key");
    expect(first.get("content-type")).toBe("application/json");
    expect(first.get("idempotency-key")).toMatch(/^invitation-batch\/[0-9a-f-]{36}$/);
    expect(second.get("idempotency-key")).not.toBe(first.get("idempotency-key"));
  });

  it("timeout 신호를 건다", async () => {
    fetchMock.mockResolvedValueOnce(ok(2));
    await sendInvitationEmails(config, messages);
    expect(lastRequest().init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("sendInvitationEmails — 결과 판정 (던지지 않는다)", () => {
  it("전체 id 목록이면 accepted다", async () => {
    fetchMock.mockResolvedValueOnce(ok(2));
    await expect(sendInvitationEmails(config, messages)).resolves.toBe("accepted");
  });

  it("명시적 거부(422)는 rejected다", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ name: "validation_error", message: "a@x.com is bad" }), { status: 422 }));
    await expect(sendInvitationEmails(config, messages)).resolves.toBe("rejected");
  });

  it("5xx는 unknown이다", async () => {
    fetchMock.mockResolvedValueOnce(new Response("upstream", { status: 502 }));
    await expect(sendInvitationEmails(config, messages)).resolves.toBe("unknown");
  });

  it("id가 모자란 2xx는 unknown이다", async () => {
    fetchMock.mockResolvedValueOnce(ok(1));
    await expect(sendInvitationEmails(config, messages)).resolves.toBe("unknown");
  });

  it("JSON이 아닌 2xx 본문은 unknown이다", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    await expect(sendInvitationEmails(config, messages)).resolves.toBe("unknown");
  });

  it("timeout·네트워크 오류는 unknown이다", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"));
    await expect(sendInvitationEmails(config, messages)).resolves.toBe("unknown");
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(sendInvitationEmails(config, messages)).resolves.toBe("unknown");
  });

  it("자동 재시도하지 않는다", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
    await sendInvitationEmails(config, messages);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendInvitationEmails — 로그에 원문이 없다", () => {
  it.each([
    ["rejected", () => new Response(JSON.stringify({ message: "a@x.com tok_a" }), { status: 422 })],
    ["5xx", () => new Response("a@x.com tok_a re_secret_key", { status: 500 })],
    ["throw", () => Promise.reject(new TypeError("fetch failed for a@x.com tok_a"))],
  ])("%s 경로의 로그에 주소·토큰·키·공급자 원문이 없다", async (_name, response) => {
    fetchMock.mockImplementationOnce(response);
    await sendInvitationEmails(config, messages);
    const all = logs.join("\n");
    for (const secret of ["a@x.com", "b@x.com", "tok_a", "tok_b", "re_secret_key", "https://mal-moi.com/invite"]) {
      expect(all).not.toContain(secret);
    }
  });

  it("실패는 한 줄 남긴다 — 원인을 볼 곳이 서버 로그뿐이다", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));
    await sendInvitationEmails(config, messages);
    expect(logs.join("\n")).toMatch(/invite-email/);
  });
});

describe("readInvitationEmailConfigFromEnv — process.env를 lib/env로 읽는다", () => {
  const names = ["RESEND_API_KEY", "INVITATION_EMAIL_FROM", "INVITATION_EMAIL_ORIGIN", "VERCEL_ENV"] as const;
  const saved: Partial<Record<(typeof names)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const name of names) saved[name] = process.env[name];
  });
  afterEach(() => {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it("값이 다 있으면 ready다", () => {
    process.env.RESEND_API_KEY = "re_k";
    process.env.INVITATION_EMAIL_FROM = "invite@notify.mal-moi.com";
    process.env.INVITATION_EMAIL_ORIGIN = "https://dev.mal-moi.com";
    process.env.VERCEL_ENV = "preview";
    expect(readInvitationEmailConfigFromEnv()).toEqual({
      status: "ready",
      apiKey: "re_k",
      from: "invite@notify.mal-moi.com",
      origin: "https://dev.mal-moi.com",
    });
  });

  it("없으면 던지지 않고 unavailable이다", () => {
    for (const name of names) delete process.env[name];
    expect(readInvitationEmailConfigFromEnv()).toEqual({ status: "unavailable", reason: "missing" });
  });
});
