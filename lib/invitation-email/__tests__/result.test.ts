import { describe, expect, it } from "vitest";

import { judgeBatchResponse } from "../result";

/**
 * Resend `/emails/batch` 응답 판정 (design §4). **요청 단위** 셋 중 하나다.
 *
 * - accepted: 2xx이고 보낸 수만큼의 유효 id 목록을 확인했다.
 * - rejected: 공급자가 요청을 명시적으로 거부했다(4xx) — 보내지 않았다고 믿어도 된다.
 * - unknown: timeout·네트워크·5xx·해석 불가/불완전 — 일부가 나갔을 수 있다. 성공 수를 추정하지 않는다.
 */

const ids = (n: number) => ({ data: Array.from({ length: n }, (_, i) => ({ id: `id_${i}` })) });

describe("judgeBatchResponse — accepted", () => {
  it("200과 보낸 수만큼의 id면 accepted다", () => {
    expect(judgeBatchResponse({ kind: "http", status: 200, body: ids(3) }, 3)).toBe("accepted");
  });

  it("다른 2xx도 id 목록이 맞으면 accepted다", () => {
    expect(judgeBatchResponse({ kind: "http", status: 201, body: ids(1) }, 1)).toBe("accepted");
  });
});

describe("judgeBatchResponse — unknown (성공으로 숨기지 않는다)", () => {
  it("id가 모자라면 unknown이다", () => {
    expect(judgeBatchResponse({ kind: "http", status: 200, body: ids(2) }, 3)).toBe("unknown");
  });

  it("id가 넘쳐도 unknown이다", () => {
    expect(judgeBatchResponse({ kind: "http", status: 200, body: ids(4) }, 3)).toBe("unknown");
  });

  it("id가 빈 문자열이거나 문자열이 아니면 unknown이다", () => {
    expect(judgeBatchResponse({ kind: "http", status: 200, body: { data: [{ id: "" }] } }, 1)).toBe("unknown");
    expect(judgeBatchResponse({ kind: "http", status: 200, body: { data: [{ id: 7 }] } }, 1)).toBe("unknown");
    expect(judgeBatchResponse({ kind: "http", status: 200, body: { data: [null] } }, 1)).toBe("unknown");
  });

  it("2xx에 errors가 비어 있지 않으면 unknown이다 — 일부만 접수됐을 수 있다", () => {
    expect(
      judgeBatchResponse(
        { kind: "http", status: 200, body: { ...ids(2), errors: [{ index: 2, message: "bad" }] } },
        2,
      ),
    ).toBe("unknown");
  });

  it("해석 불가 본문은 unknown이다", () => {
    expect(judgeBatchResponse({ kind: "http", status: 200, body: null }, 1)).toBe("unknown");
    expect(judgeBatchResponse({ kind: "http", status: 200, body: "ok" }, 1)).toBe("unknown");
    expect(judgeBatchResponse({ kind: "http", status: 200, body: { data: "x" } }, 1)).toBe("unknown");
  });

  it("5xx는 unknown이다", () => {
    expect(judgeBatchResponse({ kind: "http", status: 500, body: null }, 1)).toBe("unknown");
    expect(judgeBatchResponse({ kind: "http", status: 503, body: { message: "down" } }, 1)).toBe("unknown");
  });

  it("408은 요청 timeout이라 unknown이다", () => {
    expect(judgeBatchResponse({ kind: "http", status: 408, body: null }, 1)).toBe("unknown");
  });

  it("3xx·1xx 같은 예상 밖 상태는 unknown이다", () => {
    expect(judgeBatchResponse({ kind: "http", status: 302, body: null }, 1)).toBe("unknown");
  });

  it("timeout·네트워크 실패는 unknown이다", () => {
    expect(judgeBatchResponse({ kind: "failed" }, 1)).toBe("unknown");
  });
});

describe("judgeBatchResponse — rejected", () => {
  it.each([400, 401, 403, 409, 422, 429])("%i는 명시적 거부다", (status) => {
    expect(judgeBatchResponse({ kind: "http", status, body: { name: "x", message: "y" } }, 1)).toBe("rejected");
  });

  it("본문이 없어도 4xx면 rejected다", () => {
    expect(judgeBatchResponse({ kind: "http", status: 422, body: null }, 1)).toBe("rejected");
  });
});
