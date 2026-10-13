import { describe, expect, it } from "vitest";
import { httpStatus } from "@/lib/failure";
import { createFakeGitClient } from "./fake-client";

/**
 * fake 자체의 계약을 박는다. **2단계 오케스트레이션 테스트 전부가 이 도구에 의존하고**,
 * ARCHITECTURE §2의 1층 스킵("편집이 없으면 GitHub API를 한 번도 부르지 않는다")의 판정 수단이 여기다.
 * 도구가 조용히 틀리면 그 위의 검증이 전부 가짜가 된다.
 */

describe("createFakeGitClient — 호출 기록", () => {
  it("아무것도 부르지 않으면 calls가 비어 있다 — 이게 \"API 0회\"의 판정 방법이다", () => {
    const { calls } = createFakeGitClient({});
    expect(calls).toEqual([]);
  });

  it("부른 메서드를 순서대로 기록한다", async () => {
    const { client, calls } = createFakeGitClient({
      refSha: { "heads/dev": "basehead" },
      tree: { basehead: [{ path: "i18n/ko.json", sha: "blob1" }] },
    });

    await client.getRefSha("heads/dev");
    await client.getTree("basehead");

    expect(calls.map((c) => c.method)).toEqual(["getRefSha", "getTree"]);
  });

  it("인자를 함께 기록한다 — 어느 브랜치를 봤는지 검증해야 한다", async () => {
    const { client, calls } = createFakeGitClient({ refSha: { "heads/dev": "x" } });
    await client.getRefSha("heads/dev");
    expect(calls[0]?.args).toEqual(["heads/dev"]);
  });

  it("같은 메서드를 두 번 부르면 두 건으로 기록된다 — 카운트가 목적이다", async () => {
    const { client, calls } = createFakeGitClient({ blobs: { a: "A", b: "B" } });
    await client.getBlobText("a");
    await client.getBlobText("b");
    expect(calls.filter((c) => c.method === "getBlobText")).toHaveLength(2);
  });
});

describe("createFakeGitClient — 응답 주입", () => {
  it("주입한 ref SHA를 돌려준다", async () => {
    const { client } = createFakeGitClient({ refSha: { "heads/dev": "basehead" } });
    await expect(client.getRefSha("heads/dev")).resolves.toBe("basehead");
  });

  it("주입되지 않은 브랜치는 null이다 — 첫 실행 경로(POST /git/refs)를 태우는 입력이다", async () => {
    const { client } = createFakeGitClient({ refSha: {} });
    await expect(client.getRefSha("heads/malmoi-i18n/sync")).resolves.toBeNull();
  });

  it("주입한 트리를 돌려준다", async () => {
    const tree = [{ path: "i18n/ko.json", sha: "blob1", mode: "100644" }];
    const { client } = createFakeGitClient({ tree: { basehead: tree } });
    await expect(client.getTree("basehead")).resolves.toEqual(tree);
  });

  it("주입한 blob 내용을 돌려준다", async () => {
    const { client } = createFakeGitClient({ blobs: { blob1: '{\n  "a": "안녕"\n}\n' } });
    await expect(client.getBlobText("blob1")).resolves.toBe('{\n  "a": "안녕"\n}\n');
  });

  it("주입하지 않은 blob을 요구하면 던진다 — undefined를 조용히 넘기면 진단이 어렵다", async () => {
    const { client } = createFakeGitClient({ blobs: {} });
    await expect(client.getBlobText("없는sha")).rejects.toThrow(/없는sha/);
  });

  it("주입하지 않은 트리를 요구하면 던진다", async () => {
    const { client } = createFakeGitClient({});
    await expect(client.getTree("없는커밋")).rejects.toThrow(/없는커밋/);
  });
});

describe("createFakeGitClient — 쓰기 경로", () => {
  const snapshot = { branch: "malmoi-i18n/sync", baseSha: "basehead", changes: [{ path: "i18n/ko.json", content: "x", inBase: true }], summary: "1 file" };

  it("publishSnapshot이 받은 입력을 기록하고 결정적인 커밋 SHA를 준다 — 같은 입력의 재실행 비교가 성립한다", async () => {
    const { client, calls } = createFakeGitClient({});
    const first = await client.publishSnapshot(snapshot);
    expect(calls.find((c) => c.method === "publishSnapshot")?.args[0]).toEqual(snapshot);
    await expect(createFakeGitClient({}).client.publishSnapshot(snapshot)).resolves.toBe(first);
  });

  it("주입한 실패를 던진다 — lastPulledAt 미갱신을 검증하려면 실패를 만들 수 있어야 한다", async () => {
    const { client } = createFakeGitClient({ failOn: "publishSnapshot" });
    await expect(client.publishSnapshot(snapshot)).rejects.toThrow(/publishSnapshot/);
  });

  it("실패한 호출도 기록에 남는다 — 어디까지 갔는지 봐야 한다", async () => {
    const { client, calls } = createFakeGitClient({ failOn: "publishSnapshot" });
    await expect(client.publishSnapshot(snapshot)).rejects.toThrow();
    expect(calls.map((c) => c.method)).toEqual(["publishSnapshot"]);
  });

  it("N번째 호출만 실패시킬 수 있다 — 앞선 호출은 성공한다", async () => {
    const { client } = createFakeGitClient({ failOn: { method: "getRefSha", nth: 2 }, refSha: { "heads/dev": "h" } });
    await expect(client.getRefSha("heads/dev")).resolves.toBe("h");
    await expect(client.getRefSha("heads/dev")).rejects.toThrow(/getRefSha/);
    await expect(client.getRefSha("heads/dev")).resolves.toBe("h");
  });

  it("상태 코드를 실은 실패를 만든다 — 분류기(`httpStatus`)가 그 상태를 읽는다", async () => {
    const { client } = createFakeGitClient({ failOn: { method: "findOpenPr", status: 429 } });
    const error = await client.findOpenPr("malmoi-i18n/sync").catch((caught: unknown) => caught);
    expect(httpStatus(error)).toBe(429);
  });

  it("resetSyncBranch는 브랜치와 base를 기록한다", async () => {
    const { client, calls } = createFakeGitClient({});
    await client.resetSyncBranch("malmoi-i18n/sync", "basehead");
    expect(calls).toEqual([{ method: "resetSyncBranch", args: ["malmoi-i18n/sync", "basehead"] }]);
  });
});

describe("createFakeGitClient — PR", () => {
  it("열린 PR이 있으면 URL·번호·제목을 준다", async () => {
    const pr = { url: "https://github.com/o/r/pull/1", number: 1, title: "t", base: "main" };
    const { client } = createFakeGitClient({ openPr: pr });
    await expect(client.findOpenPr("malmoi-i18n/sync")).resolves.toEqual(pr);
  });

  it("열린 PR이 없으면 null이다 — 생성 경로를 태우는 입력이다", async () => {
    const { client } = createFakeGitClient({});
    await expect(client.findOpenPr("malmoi-i18n/sync")).resolves.toBeNull();
  });

  it("createPr이 URL을 돌려주고 호출이 기록된다", async () => {
    const { client, calls } = createFakeGitClient({});
    const url = await client.createPr("malmoi-i18n/sync", "dev", "제목", "본문");
    expect(url).toMatch(/^https:\/\//);
    expect(calls.map((c) => c.method)).toContain("createPr");
  });
});

describe("createFakeGitClient — PR 열림", () => {
  it("지정한 PR 번호만 열려 있다 — 없는 번호는 닫힘이다", async () => {
    const { client } = createFakeGitClient({ prOpen: { 7: true } });
    await expect(client.isPullRequestOpen(7)).resolves.toBe(true);
    await expect(client.isPullRequestOpen(8)).resolves.toBe(false);
  });
});
