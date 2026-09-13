import { createHash } from "node:crypto";
import type { GitClient, GitTreeBlob } from "../client";
import type { CommitPayload, TreePayload } from "../payload";

/**
 * 테스트용 `GitClient`. **`.test.ts`가 아니라 vitest의 include에 걸리지 않는다**
 * (`**\/__tests__/**\/*.test.{ts,tsx}`) — 도구이므로 그 자체가 테스트 스위트는 아니다.
 *
 * 이 파일이 존재하는 이유는 하나다: **호출을 세는 것.** spec 완료 조건 4("편집이 없으면 GitHub
 * API를 한 번도 부르지 않는다")를 판정할 다른 방법이 없다 — 실물로는 계측이 안 된다.
 */

export type FakeCall = { method: keyof GitClient; args: unknown[] };

export type FakeGitOptions = {
  /** ref → 커밋 SHA. 없는 ref는 `null`이 되어 첫 실행 경로를 태운다. */
  refSha?: Record<string, string>;
  /** 커밋 SHA → 트리. 주입되지 않은 커밋을 요구하면 던진다. */
  tree?: Record<string, GitTreeBlob[]>;
  /** blob SHA → 내용. 주입되지 않은 SHA를 요구하면 던진다. */
  blobs?: Record<string, string>;
  /** 열린 PR의 URL. 없으면 `null`이 되어 생성 경로를 태운다. */
  openPrUrl?: string;
  /** 이 메서드가 호출되면 던진다. 실패 후 상태(`lastPulledAt` 미갱신)를 검증하는 입력이다. */
  failOn?: keyof GitClient;
};

export function createFakeGitClient(opts: FakeGitOptions): {
  client: GitClient;
  calls: FakeCall[];
} {
  const calls: FakeCall[] = [];

  /** 실패한 호출도 기록에 남긴다 — 어디까지 갔는지 봐야 실패 지점을 판정할 수 있다. */
  function record(method: keyof GitClient, args: unknown[]): void {
    calls.push({ method, args });
    if (opts.failOn === method) throw new Error(`fake 실패 주입: ${method}`);
  }

  /** 같은 내용 → 같은 가짜 SHA. 실제 blob SHA와 다르지만 결정적이어야 재실행 비교가 성립한다. */
  const fakeSha = (kind: string, seed: string) =>
    `${kind}-${createHash("sha1").update(seed).digest("hex").slice(0, 12)}`;

  const client: GitClient = {
    async getRefSha(ref) {
      record("getRefSha", [ref]);
      return opts.refSha?.[ref] ?? null;
    },
    async getTree(commitSha) {
      record("getTree", [commitSha]);
      const tree = opts.tree?.[commitSha];
      if (tree === undefined) throw new Error(`fake에 주입되지 않은 트리: ${commitSha}`);
      return tree;
    },
    async getBlobText(sha) {
      record("getBlobText", [sha]);
      const text = opts.blobs?.[sha];
      if (text === undefined) throw new Error(`fake에 주입되지 않은 blob: ${sha}`);
      return text;
    },
    async createTree(payload: TreePayload) {
      record("createTree", [payload]);
      return fakeSha("tree", JSON.stringify(payload));
    },
    async createCommit(payload: CommitPayload) {
      record("createCommit", [payload]);
      return fakeSha("commit", JSON.stringify(payload));
    },
    async createRef(branch, sha) {
      record("createRef", [branch, sha]);
    },
    async updateRefForce(branch, sha) {
      record("updateRefForce", [branch, sha]);
    },
    async findOpenPrUrl(head, base) {
      record("findOpenPrUrl", [head, base]);
      return opts.openPrUrl ?? null;
    },
    async createPr(headBranch, baseBranch, title, body) {
      record("createPr", [headBranch, baseBranch, title, body]);
      return `https://github.com/fake/repo/pull/1`;
    },
    // 목록 전용 둘 (projects-list §3.4). pull은 안 쓰지만 같은 인터페이스라 여기도 구현한다.
    async compareToBase(baseSha, branch) {
      record("compareToBase", [baseSha, branch]);
      return { ahead: false, files: [] };
    },
    async isPullRequestOpen(pullNumber) {
      record("isPullRequestOpen", [pullNumber]);
      return false;
    },
  };

  return { client, calls };
}
