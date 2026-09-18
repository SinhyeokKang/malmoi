import { expect, it, vi } from "vitest";

import type { GitClient } from "@/lib/pull/client";
import { loadRemoteSignals, type RemoteTarget } from "../remote";

/**
 * **보관 제외 전부를 처리하되 동시에 도는 프로젝트는 셋까지**.
 *
 * ⚠️ **`slice(0, 3)`이 아니다.** 3은 동시 작업 수이고, 앞의 셋만 조회한다는 뜻이 아니다 — 넷째부터
 * 띠가 영영 안 뜨면 그 프로젝트는 화면에서 조용한 것과 구별되지 않는다.
 *
 * ⚠️ **실제 시간 대기를 쓰지 않는다.** 제어 가능한 promise로 "지금 몇 개가 떠 있나"를 직접 잰다 —
 * `setTimeout`으로 재면 느린 기계에서 깜빡인다.
 */

const target = (over: Partial<RemoteTarget> = {}): RemoteTarget => ({
  projectId: "p1",
  repoOwner: "o",
  repoName: "r",
  installationId: "1",
  repositoryId: "9001",
  baseBranch: "release",
  lastPrUrl: "https://github.com/o/r/pull/142",
  surfaces: [{ lastCommitSha: "a".repeat(40), adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", storedLocales: ["en", "ko"] }],
  archived: false,
  ...over,
});

/** 호출을 세는 fake. **클라이언트 생성은 신호 조회와 따로 센다** (토큰 발급·리포 확인이 그 안이다). */
function fakes(over: Partial<GitClient> = {}) {
  const counts = { created: 0, compare: 0, pr: 0 };
  const client = {
    async compareToBase() {
      counts.compare += 1;
      return { ahead: true, files: [{ filename: "i18n/ko.json" }] };
    },
    async isPullRequestOpen() {
      counts.pr += 1;
      return true;
    },
    ...over,
  } as unknown as GitClient;
  const createClient = vi.fn(async () => {
    counts.created += 1;
    return client;
  });
  return { counts, createClient, client };
}

it("보관 제외 10개를 전부 처리한다 — 신호 조회가 20회다", async () => {
  const targets = Array.from({ length: 10 }, (_, i) => target({ projectId: `p${i}` }));
  const { counts, createClient } = fakes();

  const got = await loadRemoteSignals(targets, { createClient });

  expect(got.size).toBe(10);
  expect(counts.compare).toBe(10);
  expect(counts.pr).toBe(10);
  // 클라이언트 생성은 별도 집계다 — 프로젝트당 하나이고 두 신호가 공유한다.
  expect(counts.created).toBe(10);
});

it("동시에 도는 프로젝트가 셋을 넘지 않고, 하나가 끝나면 바로 다음을 당긴다", async () => {
  const targets = Array.from({ length: 7 }, (_, i) => target({ projectId: `p${i}` }));
  const gates: (() => void)[] = [];
  let running = 0;
  let peak = 0;

  const createClient = async () =>
    ({
      async compareToBase() {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise<void>((resolve) => gates.push(resolve));
        running -= 1;
        return { ahead: false, files: [] };
      },
      async isPullRequestOpen() {
        return false;
      },
    }) as unknown as GitClient;

  const pending = loadRemoteSignals(targets, { createClient });

  // 큐가 채워질 때까지 마이크로태스크를 흘린다 — 타이머를 쓰지 않는다.
  const settle = async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  };
  await settle();
  expect(peak).toBe(3);
  expect(gates).toHaveLength(3);

  // **하나만** 풀어도 다음 작업이 시작된다 — 묶음 전체를 기다리지 않는다.
  gates.shift()?.();
  await settle();
  expect(gates).toHaveLength(3);
  expect(peak).toBe(3);

  while (gates.length > 0) {
    gates.shift()?.();
    await settle();
  }
  expect((await pending).size).toBe(7);
  expect(peak).toBe(3);
});

it("하나가 실패해도 나머지를 끝까지 처리하고, 그 행은 두 띠만 잃는다", async () => {
  const targets = [target({ projectId: "p0" }), target({ projectId: "p1" }), target({ projectId: "p2" })];
  const createClient = vi.fn(async (t: RemoteTarget) => {
    if (t.projectId === "p1") throw new Error("installation revoked");
    return {
      async compareToBase() {
        return { ahead: true, files: [{ filename: "i18n/ko.json" }] };
      },
      async isPullRequestOpen() {
        return true;
      },
    } as unknown as GitClient;
  });

  const got = await loadRemoteSignals(targets, { createClient });

  expect(got.get("p1")).toEqual({ openPr: null, repoAheadFiles: 0 });
  for (const id of ["p0", "p2"]) {
    expect(got.get(id)).toEqual({ openPr: { number: 142, url: "https://github.com/o/r/pull/142" }, repoAheadFiles: 1, repoAheadFrom: "a".repeat(40) });
  }
});

/** 부분 실패도 둘 다 뺀다 — 실패를 성공처럼 그리지 않는다. */
it("PR 조회만 실패해도 compare 결과를 쓰지 않는다", async () => {
  const { createClient } = fakes({
    async isPullRequestOpen() {
      throw new Error("not found");
    },
  });
  const got = await loadRemoteSignals([target()], { createClient });
  expect(got.get("p1")).toEqual({ openPr: null, repoAheadFiles: 0 });
});

it("완료 순서가 결과 매핑을 바꾸지 않는다", async () => {
  const targets = [target({ projectId: "slow" }), target({ projectId: "fast", lastPrUrl: "https://github.com/o/r/pull/7" })];
  const createClient = async (t: RemoteTarget) =>
    ({
      async compareToBase() {
        if (t.projectId === "slow") await Promise.resolve();
        return { ahead: false, files: [] };
      },
      async isPullRequestOpen() {
        return true;
      },
    }) as unknown as GitClient;

  const got = await loadRemoteSignals(targets, { createClient });

  expect(got.get("slow")?.openPr?.number).toBe(142);
  expect(got.get("fast")?.openPr?.number).toBe(7);
});

it.each([
  ["보관", { archived: true }],
  ["설치 ID 없음", { installationId: null }],
  ["리포 id 없음", { repositoryId: null }],
  ["신호 입력 없음", { surfaces: [], lastPrUrl: null }],
])("%s이면 요청이 0이다 — 클라이언트도 만들지 않는다", async (_label, over) => {
  const { counts, createClient } = fakes();
  const got = await loadRemoteSignals([target(over)], { createClient });

  expect(counts).toEqual({ created: 0, compare: 0, pr: 0 });
  // 행 자체는 목록에서 사라지지 않는다 — DB 상태로 표시된다.
  expect(got.get("p1")).toEqual({ openPr: null, repoAheadFiles: 0 });
});

it("마지막 커밋이 없으면 compare만 건너뛴다", async () => {
  const { counts, createClient } = fakes();
  const got = await loadRemoteSignals([target({ surfaces: [] })], { createClient });
  expect(counts).toMatchObject({ compare: 0, pr: 1 });
  expect(got.get("p1")?.openPr?.number).toBe(142);
});

it("PR 번호를 못 읽으면 PR 조회만 건너뛴다", async () => {
  const { counts, createClient } = fakes();
  await loadRemoteSignals([target({ lastPrUrl: "https://github.com/o/r/issues/3" })], { createClient });
  expect(counts).toMatchObject({ compare: 1, pr: 0 });
});

/** 닫힌 PR에 "머지해서 끝내세요"를 띄우지 않는다. */
it("PR이 닫혀 있으면 띠를 만들지 않는다", async () => {
  const { createClient } = fakes({
    async isPullRequestOpen() {
      return false;
    },
  });
  expect((await loadRemoteSignals([target()], { createClient })).get("p1")?.openPr).toBeNull();
});

/** base가 앞서지 않았으면 파일을 세지 않는다. */
it("앞서지 않은 base는 0이다", async () => {
  const { createClient } = fakes({
    async compareToBase() {
      return { ahead: false, files: [{ filename: "i18n/ko.json" }] };
    },
  });
  expect((await loadRemoteSignals([target()], { createClient })).get("p1")?.repoAheadFiles).toBe(0);
});

it("대상이 없으면 빈 Map이다", async () => {
  const { counts, createClient } = fakes();
  expect((await loadRemoteSignals([], { createClient })).size).toBe(0);
  expect(counts.created).toBe(0);
});

it("한 신호가 거부돼도 다른 신호가 끝날 때까지 워커 자리를 유지한다", async () => {
  const gates: (() => void)[] = [];
  const createClient = vi.fn(async () => ({
    async compareToBase() {
      await new Promise<void>((resolve) => gates.push(resolve));
      return { ahead: false, files: [] };
    },
    async isPullRequestOpen() { throw new Error("PR unavailable"); },
  }) as unknown as GitClient);
  const pending = loadRemoteSignals(
    Array.from({ length: 7 }, (_, i) => target({ projectId: `p${i}` })),
    { createClient },
  );
  const settle = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };
  await settle();
  const initial = createClient.mock.calls.length;
  gates.shift()?.();
  await settle();
  const afterOne = createClient.mock.calls.length;
  while (gates.length > 0) { gates.shift()?.(); await settle(); }
  await pending;
  expect(initial).toBe(3);
  expect(afterOne).toBe(4);
  expect(createClient).toHaveBeenCalledTimes(7);
});

/**
 * ⚠️ **try/catch는 에러만 값으로 접고 지연은 못 접는다** (2026-09-13 리뷰). GitHub이 응답을 영영
 * 안 주면 `signalsFor`의 catch에 닿지 않아 페이지가 그대로 매달리고, 이 화면은 로그인 직후의
 * 착지점이라 그 매달림이 곧 빈 화면이다.
 *
 * ⚠️ **실제 시간을 기다리지 않는다** — 가짜 타이머로 마감만 당긴다.
 */
it("응답이 영영 안 오면 마감에서 신호 없이 돌려준다", async () => {
  vi.useFakeTimers();
  try {
    const hang = () => new Promise<never>(() => {});
    const createClient = async () =>
      ({ compareToBase: hang, isPullRequestOpen: hang }) as unknown as GitClient;

    const pending = loadRemoteSignals([target(), target({ projectId: "p2" })], { createClient });
    await vi.advanceTimersByTimeAsync(8_000);

    const got = await pending;
    // 행은 목록에 남고 두 띠만 빠진다 — 지연도 실패와 같은 갈래다.
    expect(got.get("p1")).toEqual({ openPr: null, repoAheadFiles: 0 });
    expect(got.get("p2")).toEqual({ openPr: null, repoAheadFiles: 0 });
  } finally {
    vi.useRealTimers();
  }
});

/** ⚠️ **타이머를 안 끄면 그 핸들이 이벤트 루프를 붙잡아 정상 경로가 마감만큼 늦게 끝난다.** */
it("정상 완료는 마감을 기다리지 않는다", async () => {
  vi.useFakeTimers();
  try {
    const { createClient } = fakes();
    // 타이머를 전혀 당기지 않아도 끝나야 한다.
    const got = await loadRemoteSignals([target()], { createClient });
    expect(got.get("p1")?.repoAheadFiles).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
