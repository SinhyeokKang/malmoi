import { describe, expect, it } from "vitest";
import { isLoginAllowed, parseAllowedLogins } from "../allow";

describe("parseAllowedLogins — 목록 파싱", () => {
  it("쉼표로 나누고 앞뒤 공백을 제거한다", () => {
    expect(parseAllowedLogins("alice, bob ,carol")).toEqual(["alice", "bob", "carol"]);
  });

  it("소문자로 정규화한다 (GitHub 핸들은 대소문자를 구분하지 않는다)", () => {
    expect(parseAllowedLogins("Alice,BOB")).toEqual(["alice", "bob"]);
  });

  it("빈 항목을 버린다 — 빈 문자열이 목록에 들어가면 빈 login을 통과시키는 구멍이 된다", () => {
    expect(parseAllowedLogins("a, ,b,,")).toEqual(["a", "b"]);
  });

  it("undefined·빈 문자열·공백만이면 빈 목록", () => {
    expect(parseAllowedLogins(undefined)).toEqual([]);
    expect(parseAllowedLogins("")).toEqual([]);
    expect(parseAllowedLogins("   ")).toEqual([]);
    expect(parseAllowedLogins(",,, ,")).toEqual([]);
  });

  it("중복을 접는다", () => {
    expect(parseAllowedLogins("a,A, a ")).toEqual(["a"]);
  });
});

describe("isLoginAllowed — fail-closed", () => {
  it("목록이 비면 아무도 통과하지 못한다 (설정 누락이 전면 공개가 되지 않는다)", () => {
    expect(isLoginAllowed("alice", [])).toBe(false);
    expect(isLoginAllowed("alice", parseAllowedLogins(undefined))).toBe(false);
    expect(isLoginAllowed("alice", parseAllowedLogins(""))).toBe(false);
  });

  it("목록에 있으면 통과", () => {
    expect(isLoginAllowed("alice", ["alice", "bob"])).toBe(true);
  });

  it("목록에 없으면 거부", () => {
    expect(isLoginAllowed("carol", ["alice", "bob"])).toBe(false);
  });

  it("대소문자를 무시한다", () => {
    expect(isLoginAllowed("ALICE", ["alice"])).toBe(true);
    expect(isLoginAllowed("alice", parseAllowedLogins("ALICE"))).toBe(true);
  });

  it("앞뒤 공백이 붙은 login도 정규화해 비교한다", () => {
    expect(isLoginAllowed(" alice ", ["alice"])).toBe(true);
  });

  it("빈 login·undefined·null은 거부한다 — provider가 핸들을 안 줄 수도 있다", () => {
    expect(isLoginAllowed("", ["alice"])).toBe(false);
    expect(isLoginAllowed("   ", ["alice"])).toBe(false);
    expect(isLoginAllowed(undefined, ["alice"])).toBe(false);
    expect(isLoginAllowed(null, ["alice"])).toBe(false);
  });

  it("빈 login은 목록에 빈 항목이 있어도 거부한다 (파싱이 걸러도 이중으로 막는다)", () => {
    // parseAllowedLogins가 빈 항목을 버리지만, 목록을 직접 만든 경우도 막아야 한다.
    expect(isLoginAllowed("", ["", "alice"])).toBe(false);
  });

  it("부분 일치를 통과시키지 않는다", () => {
    expect(isLoginAllowed("alice2", ["alice"])).toBe(false);
    expect(isLoginAllowed("ali", ["alice"])).toBe(false);
  });
});
