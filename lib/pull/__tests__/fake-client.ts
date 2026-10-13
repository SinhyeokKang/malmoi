import { createHash } from "node:crypto";
import type { GitClient, GitTreeBlob } from "../client";

/**
 * 테스트용 `GitClient`. **`.test.ts`가 아니라 vitest의 include에 걸리지 않는다**
 * (`**\/__tests__/**\/*.test.{ts,tsx}`) — 도구이므로 그 자체가 테스트 스위트는 아니다.
 *
 * 이 파일이 존재하는 이유는 하나다: **호출을 세는 것.** ARCHITECTURE §2의 1층 스킵("편집이 없으면 GitHub
 * API를 한 번도 부르지 않는다")을 판정할 다른 방법이 없다 — 실물로는 계측이 안 된다.
 */

export type FakeCall = { method: keyof GitClient; args: unknown[] };

/**
 * 경계(`GitClient`)의 메서드를 읽기와 쓰기로 **빠짐없이** 가른다 — "쓰기 0회"·"첫 쓰기는 무효화 뒤" 단언이 이 목록 하나를 쓴다.
 * ⚠️ 이름을 문자열로 손에 들면 메서드가 사라지거나 바뀌어도 typecheck가 못 보고 단언이 공허해진다(gitlab-repositories R-A 🔴1 —
 * 삭제된 `createTree`…`updateRefForce`가 목록에 남아 스냅샷 커밋을 쓰기로 세지 않았다). 아래 `satisfies`가 없는 키를, `Unclassified`가
 * 어느 쪽에도 없는 새 키를 red로 만든다.
 */
export const GIT_READS = ["getRefSha", "getTree", "getBlobText", "findOpenPr", "compareToBase", "isPullRequestOpen"] as const satisfies readonly (keyof GitClient)[];
export const GIT_MUTATIONS = ["publishSnapshot", "resetSyncBranch", "closePr", "createPr", "updatePrTitle", "updatePrBase"] as const satisfies readonly (keyof GitClient)[];
type Unclassified = Exclude<keyof GitClient, (typeof GIT_READS)[number] | (typeof GIT_MUTATIONS)[number]>;
const everyMethodClassified: [Unclassified] extends [never] ? true : Unclassified = true;
void everyMethodClassified;

export function isGitMutation(method: keyof GitClient): boolean {
  return (GIT_MUTATIONS as readonly string[]).includes(method);
}

export type FakeGitOptions = {
  /** ref → 커밋 SHA. 없는 ref는 `null`이 되어 첫 실행 경로를 태운다. */
  refSha?: Record<string, string>;
  /** 커밋 SHA → 트리. 주입되지 않은 커밋을 요구하면 던진다. */
  tree?: Record<string, (GitTreeBlob & { mode?: string })[]>;
  /** blob SHA → 내용. 주입되지 않은 SHA를 요구하면 던진다. */
  blobs?: Record<string, string>;
  /** 열린 PR. 없으면 `null`이 되어 생성 경로를 태운다. `title`은 마커 유무 판정의 입력이다. */
  openPr?: { url: string; number: number; title: string; base?: string };
  /**
   * 이 메서드가 호출되면 던진다. 실패 후 상태(`lastPulledAt` 미갱신)를 검증하는 입력이다.
   * 객체로 주면 `nth`번째 호출(1부터)만 던지고, `status`가 있으면 그 HTTP 상태를 실은 오류다(`httpStatus`가 읽는다) — 분류기가 상태로 가르는 경로의 입력이다.
   */
  failOn?: keyof GitClient | { method: keyof GitClient; nth?: number; status?: number };
  /** `isPullRequestOpen`의 답. PR 번호 → 열림. 없는 번호는 닫힘(`false`)이다. */
  prOpen?: Record<number, boolean>;
};

export function createFakeGitClient(opts: FakeGitOptions): {
  client: GitClient;
  calls: FakeCall[];
} {
  const calls: FakeCall[] = [];

  const failure = typeof opts.failOn === "string" ? { method: opts.failOn } : opts.failOn;

  /** 실패한 호출도 기록에 남긴다 — 어디까지 갔는지 봐야 실패 지점을 판정할 수 있다. */
  function record(method: keyof GitClient, args: unknown[]): void {
    calls.push({ method, args });
    if (failure?.method !== method) return;
    if (failure.nth !== undefined && calls.filter(call => call.method === method).length !== failure.nth) return;
    throw Object.assign(new Error(`fake 실패 주입: ${method}`), failure.status === undefined ? {} : { status: failure.status });
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
      return tree.map(entry => ({ mode: "100644", ...entry }));
    },
    async getBlobText(sha) {
      record("getBlobText", [sha]);
      const text = opts.blobs?.[sha];
      if (text === undefined) throw new Error(`fake에 주입되지 않은 blob: ${sha}`);
      return text;
    },
    async publishSnapshot(input) {
      record("publishSnapshot", [input]);
      return fakeSha("commit", JSON.stringify(input));
    },
    async resetSyncBranch(branch, baseSha) {
      record("resetSyncBranch", [branch, baseSha]);
    },
    async findOpenPr(branch) {
      record("findOpenPr", [branch]);
      // base를 안 주면 테스트 프로젝트의 기본 base(`dev`)다 — 어긋남 경로는 명시할 때만 탄다.
      return opts.openPr === undefined ? null : { ...opts.openPr, base: opts.openPr.base ?? "dev" };
    },
    async createPr(headBranch, baseBranch, title, body) {
      record("createPr", [headBranch, baseBranch, title, body]);
      return `https://github.com/fake/repo/pull/1`;
    },
    async updatePrTitle(pullNumber, title) {
      record("updatePrTitle", [pullNumber, title]);
    },
    async updatePrBase(pullNumber, base) {
      record("updatePrBase", [pullNumber, base]);
    },
    async closePr(pullNumber, comment) {
      record("closePr", [pullNumber, comment]);
    },
    // 목록 전용 둘. pull은 안 쓰지만 같은 인터페이스라 여기도 구현한다.
    async compareToBase(baseSha, branch) {
      record("compareToBase", [baseSha, branch]);
      return { ahead: false, files: [] };
    },
    async isPullRequestOpen(pullNumber) {
      record("isPullRequestOpen", [pullNumber]);
      return opts.prOpen?.[pullNumber] ?? false;
    },
  };

  return { client, calls };
}
