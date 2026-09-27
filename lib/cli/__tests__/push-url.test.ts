import { describe, expect, it } from "vitest";
import { isAllowedPushUrl } from "../push-url";

/**
 * `push-local`의 `--url`은 `PUSH_TOKEN`(프로젝트 토큰 원문)을 Bearer로 싣는다 — 평문 http면 경로 위의
 * 누구나 토큰을 읽는다 (sec-audit-3 #10). 로컬 개발 서버만 http를 허용한다.
 */
describe("isAllowedPushUrl", () => {
  it("https는 호스트와 무관하게 통과한다", () => {
    expect(isAllowedPushUrl("https://mal-moi.com")).toBe(true);
    expect(isAllowedPushUrl("https://dev.mal-moi.com/")).toBe(true);
    expect(isAllowedPushUrl("HTTPS://example.com:8443/base")).toBe(true);
  });

  it("http는 루프백 셋에서만 통과한다", () => {
    expect(isAllowedPushUrl("http://localhost:3000")).toBe(true);
    expect(isAllowedPushUrl("http://LOCALHOST:3000/")).toBe(true);
    expect(isAllowedPushUrl("http://127.0.0.1:3000")).toBe(true);
    expect(isAllowedPushUrl("http://[::1]:3000")).toBe(true);
  });

  it("URL이 루프백으로 정규화하는 IPv4 표기는 통과한다", () => {
    expect(isAllowedPushUrl("http://127.1:3000")).toBe(true);
    expect(isAllowedPushUrl("http://0x7f.0.0.1:3000")).toBe(true);
  });

  it("끝 점 호스트·IPv4 매핑 IPv6는 거부한다 — 정규화된 값이 셋과 정확히 같아야 한다", () => {
    expect(isAllowedPushUrl("http://localhost.:3000")).toBe(false);
    expect(isAllowedPushUrl("http://[::ffff:127.0.0.1]:3000")).toBe(false);
  });

  it("그 밖의 http는 거부한다 — 루프백 이름을 앞에 붙인 호스트도", () => {
    expect(isAllowedPushUrl("http://example.com")).toBe(false);
    expect(isAllowedPushUrl("http://mal-moi.com")).toBe(false);
    expect(isAllowedPushUrl("http://localhost.example.com:3000")).toBe(false);
    expect(isAllowedPushUrl("http://127.0.0.1.nip.io")).toBe(false);
    expect(isAllowedPushUrl("http://192.168.0.10:3000")).toBe(false);
  });

  it("URL이 아니거나 다른 스킴이면 거부한다", () => {
    expect(isAllowedPushUrl("")).toBe(false);
    expect(isAllowedPushUrl("localhost:3000")).toBe(false);
    expect(isAllowedPushUrl("mal-moi.com")).toBe(false);
    expect(isAllowedPushUrl("ftp://localhost")).toBe(false);
    expect(isAllowedPushUrl("ws://localhost:3000")).toBe(false);
  });
});
