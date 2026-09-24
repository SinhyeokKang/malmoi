import { describe, expect, it } from "vitest";

import { readBoundedText } from "../bounded-body";

/**
 * **외부 진입점의 본문 상한** (audit #76). `request.json()`·`text()`는 끝까지 읽은 뒤에야 크기를 알 수 있어,
 * 인증된 호출자 하나가 함수 메모리를 채울 수 있었다. 선언된 길이는 읽기 전에, 선언이 없거나 거짓인 스트림은
 * 읽는 도중에 끊는다.
 */
function streamed(chunks: string[], headers: Record<string, string> = {}): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request("http://localhost/api/push", { method: "POST", headers, body, duplex: "half" } as RequestInit);
}

describe("readBoundedText", () => {
  it("상한 안의 본문은 그대로 돌려준다 — 경계값 포함", async () => {
    expect(await readBoundedText(new Request("http://localhost", { method: "POST", body: "abcd" }), 4)).toBe("abcd");
    expect(await readBoundedText(streamed(["ab", "cd"]), 4)).toBe("abcd");
  });

  it("멀티바이트는 문자가 아니라 바이트로 잰다", async () => {
    // "가"는 UTF-8로 3바이트다 — 두 글자 6바이트.
    expect(await readBoundedText(new Request("http://localhost", { method: "POST", body: "가가" }), 6)).toBe("가가");
    expect(await readBoundedText(new Request("http://localhost", { method: "POST", body: "가가" }), 5)).toBeNull();
  });

  it("선언된 길이가 상한을 넘으면 본문을 읽지 않고 거부한다", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { pulled += 1; controller.enqueue(new Uint8Array(1)); controller.close(); } });
    const request = new Request("http://localhost", { method: "POST", headers: { "content-length": "5" }, body, duplex: "half" } as RequestInit);
    expect(await readBoundedText(request, 4)).toBeNull();
    // 생성자가 첫 pull을 미리 부를 수 있다 — 0이 아니라 "끝까지 읽지 않았다"를 잰다.
    expect(pulled).toBeLessThanOrEqual(1);
  });

  it("길이 선언이 없거나 거짓인 스트림은 읽는 도중에 끊는다", async () => {
    expect(await readBoundedText(streamed(["abc", "de"]), 4)).toBeNull();
    expect(await readBoundedText(streamed(["abc", "de"], { "content-length": "1" }), 4)).toBeNull();
  });

  it("본문이 없으면 빈 문자열이다 — JSON 파싱이 400을 낸다", async () => {
    expect(await readBoundedText(new Request("http://localhost", { method: "POST" }), 4)).toBe("");
  });
});
