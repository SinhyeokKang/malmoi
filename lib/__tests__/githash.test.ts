import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { blobSha } from "../githash";

// 골든 값의 출처는 `git hash-object --stdin` 실측이다(추측한 값이 아니다).
// blobSha의 목적은 GitHub API 호출을 건너뛰는 것이므로, git이 계산하는 값과
// 한 비트라도 다르면 변경 감지가 전부 오작동한다 — ARCHITECTURE §2.
const GOLDEN: ReadonlyArray<readonly [label: string, content: string, sha: string]> = [
  ["빈 문자열", "", "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"],
  ["ASCII", "hello", "b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0"],
  // 문자 5개지만 UTF-8 15바이트 — content.length를 쓰면 여기서 깨진다.
  ["한글", "안녕하세요", "4906665c42a49f927995c3db6fc3531df8577c21"],
  // 문자 1개(서로게이트 페어)지만 4바이트.
  ["이모지", "🎉", "d70585e234260b981a1a0f365753e0bbf77e792f"],
];

describe("blobSha — git hash-object와 일치한다", () => {
  for (const [label, content, sha] of GOLDEN) {
    it(`${label}: 골든 값과 일치`, () => {
      expect(blobSha(content)).toBe(sha);
    });
  }

  it("실제 messages.json 형태(끝 개행 1개 포함)도 일치", () => {
    const content = '{\n  "greeting": {\n    "message": "안녕하세요"\n  }\n}\n';
    expect(blobSha(content)).toBe("2e9ea72037593be3b069cae3b66f3e3359160c46");
  });
});

describe("blobSha — UTF-8 바이트 길이를 쓴다", () => {
  it("한글은 문자 수와 바이트 수가 다르고, 바이트 수 쪽이 맞다", () => {
    const content = "안녕하세요";
    expect(content.length).toBe(5);
    expect(Buffer.byteLength(content, "utf8")).toBe(15);
    // 문자 수(5)로 헤더를 만들면 아래 골든과 달라진다.
    expect(blobSha(content)).toBe("4906665c42a49f927995c3db6fc3531df8577c21");
  });

  it("이모지도 마찬가지 (서로게이트 페어)", () => {
    const content = "🎉";
    expect(content.length).toBe(2);
    expect(Buffer.byteLength(content, "utf8")).toBe(4);
    expect(blobSha(content)).toBe("d70585e234260b981a1a0f365753e0bbf77e792f");
  });
});

describe("blobSha — 형식", () => {
  it("소문자 hex 40자를 돌려준다", () => {
    expect(blobSha("anything")).toMatch(/^[0-9a-f]{40}$/);
  });

  it("같은 입력은 같은 값 (결정적)", () => {
    expect(blobSha("안녕 hello 🎉")).toBe(blobSha("안녕 hello 🎉"));
  });

  it("한 바이트만 달라도 값이 달라진다", () => {
    expect(blobSha("a")).not.toBe(blobSha("b"));
  });
});

// 골든 값이 박제되면 git 동작이 바뀌어도 테스트는 계속 통과한다.
// 이 테스트만이 골든 자체를 실측과 재대조해, 위 5건이 낡았는지 알려준다.
describe("blobSha — 골든 값 자체가 git 실측과 여전히 일치하는지 (자기검증 앵커)", () => {
  const hashObject = (content: string) =>
    execFileSync("git", ["hash-object", "--stdin"], { input: content, encoding: "utf8" }).trim();

  for (const [label, content, sha] of GOLDEN) {
    it(`${label}: 박아둔 골든이 git 실측과 같다`, () => {
      expect(hashObject(content)).toBe(sha);
    });
  }
});
