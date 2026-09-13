import "server-only";

import { isAdapterName } from "@/lib/adapters";
import { createGitClient } from "@/lib/github";
import type { GitClient } from "@/lib/pull/client";
import { changedLocaleFileCount, pullNumberFrom } from "./remote-plan";

/**
 * 목록의 **원격 신호 둘** — 열린 PR과 base 드리프트 (projects-list design §3.4).
 *
 * ⚠️ **자격증명은 installation 토큰이다** (`createGitClient`). user-to-server 토큰을 쓰지 않는다 —
 * 경계가 셋이고 섞지 않는다 (ARCHITECTURE §0 불변식 6, `credential-separation.test.ts`가 상시로 센다).
 *
 * ⚠️ **실패는 값으로 흐른다.** 이 호출은 **행동을 권하는 부가 정보**이고, GitHub이 느린 날에도
 * `/projects`가 로그인 직후의 착지점이라는 사실은 안 바뀐다. 실패하면 두 띠만 빠지고 목록은
 * DB만으로 완성된다 — 다만 **실패를 성공처럼 그리지도 않는다**: 둘 다 안 그린다.
 *
 * ⚠️ **보관 제외 전부를 처리한다.** `slice(0, 3)`이 아니다 — 3은 **동시에 도는 프로젝트 수**이고,
 * 하나가 끝나면 바로 다음을 시작한다(3개 묶음 전체를 기다리지 않는다).
 */

/** 한 프로젝트의 원격 조회 입력. **인가된 멤버십에서만 만든다.** */
export type RemoteTarget = {
  /** 결과를 되돌려 붙이는 키 — 서버 내부 id다. */
  projectId: string;
  repoOwner: string;
  repoName: string;
  installationId: string | null;
  /** ⚠️ **리포의 정체성은 이름이 아니라 id다** (불변식 11). null이면 호출 자체를 건너뛴다. */
  repositoryId: string | null;
  baseBranch: string;
  lastCommitSha: string | null;
  lastPrUrl: string | null;
  adapterName: string | null;
  pathTemplate: string | null;
  /** **전체 저장 로케일**(orphaned 포함) — 탐지 정규식이 거르는 코드의 경로를 지킨다 (§3.4). */
  storedLocales: readonly string[];
  archived: boolean;
};

export type RemoteSignals = { openPr: { number: number; url: string } | null; repoAheadFiles: number };

const NONE: RemoteSignals = { openPr: null, repoAheadFiles: 0 };

/** 동시에 도는 **프로젝트** 수. 전체 요청 수도, 처리할 프로젝트 수도 아니다 (design ⊕). */
const CONCURRENCY = 3;

/**
 * 전체 조회의 **마감 시각**.
 *
 * ⚠️ **try/catch는 에러만 값으로 접고 지연은 못 접는다.** GitHub이 응답을 영영 안 주면
 * `signalsFor`의 catch에 닿지 않으므로 페이지가 그대로 매달리고, 이 화면은 로그인 직후의
 * 착지점이라 그 매달림이 곧 빈 화면이다 (design §7.5의 "GitHub이 실패해도 목록이 뜬다"를
 * **지연**까지 넓힌 것).
 *
 * ⚠️ **넘긴 요청을 취소하지는 않는다** — octokit에 그 손잡이가 없다. 페이지가 안 기다릴 뿐이고,
 * 남은 작업은 자기 속도로 끝나며 그 결과는 버려진다.
 */
const DEADLINE_MS = 8_000;

export async function loadRemoteSignals(
  targets: readonly RemoteTarget[],
  options: {
    /** 테스트가 fake를 넘긴다. 기본은 installation 토큰 클라이언트다. */
    createClient?: (target: RemoteTarget) => Promise<GitClient>;
  } = {},
): Promise<Map<string, RemoteSignals>> {
  const createClient =
    options.createClient ??
    ((target: RemoteTarget) =>
      createGitClient(target.repoOwner, target.repoName, target.installationId ?? "", target.repositoryId ?? ""));

  const signals = await withDeadline(
    mapWithLimit(targets, CONCURRENCY, (target) => signalsFor(target, createClient)),
  );
  // 완료 순서가 결과 매핑을 바꾸지 않는다 — 인덱스로 되돌려 붙인다.
  // 마감에 걸렸으면 `signals`가 비어 모든 행이 "신호 없음"이 된다 — 실패와 같은 갈래다.
  return new Map(targets.map((target, index) => [target.projectId, signals[index] ?? NONE]));
}

async function signalsFor(
  target: RemoteTarget,
  createClient: (target: RemoteTarget) => Promise<GitClient>,
): Promise<RemoteSignals> {
  // 보관은 멈춘 것이다 — 멈춘 프로젝트에 원격을 물을 이유가 없다.
  if (target.archived) return NONE;
  // 설치나 리포 id가 없으면 클라이언트를 만들 수 없다. 행은 목록에 남고 DB 상태로 표시된다.
  if (target.installationId === null || target.repositoryId === null) return NONE;

  const pullNumber = pullNumberFrom(target.lastPrUrl);
  const format =
    target.lastCommitSha !== null && target.adapterName !== null && target.pathTemplate !== null && isAdapterName(target.adapterName)
      ? { adapter: target.adapterName, pathTemplate: target.pathTemplate, storedLocales: target.storedLocales }
      : null;
  // **두 신호 모두 입력이 없으면 요청이 0이다** — 클라이언트도 만들지 않는다(토큰 발급 왕복이 따라온다).
  if (format === null && pullNumber === null) return NONE;

  try {
    // 프로젝트당 클라이언트 하나를 두 신호가 공유한다 — 토큰 발급·리포 확인도 이 작업 안이다.
    const client = await createClient(target);
    // 프로젝트 **안에서는** 병렬이다. 바깥의 제한은 프로젝트 수이지 요청 수가 아니다.
    const [compared, opened] = await Promise.allSettled([
      format === null || target.lastCommitSha === null ? null : client.compareToBase(target.lastCommitSha, target.baseBranch),
      pullNumber === null ? null : client.isPullRequestOpen(pullNumber),
    ]);
    // 한쪽이 실패해도 나머지 요청이 끝나야 워커 자리를 반납한다 — Promise.all은 먼저 거부된다.
    if (compared.status === "rejected" || opened.status === "rejected") return NONE;
    const compare = compared.value;
    const open = opened.value;
    return {
      openPr: open === true && pullNumber !== null && target.lastPrUrl !== null ? { number: pullNumber, url: target.lastPrUrl } : null,
      // base가 앞서지 않았으면 파일을 세지 않는다 — 같은 커밋에서 갈라진 변경은 이 띠가 말할 것이 아니다.
      repoAheadFiles: compare !== null && compare.ahead && format !== null ? changedLocaleFileCount(format, compare.files) : 0,
    };
  } catch {
    /**
     * ⚠️ **불변식 9와 충돌하지 않는다** — "버린 값을 성공으로 숨기지 않는다"는 **sync 결과**에 대한
     * 것이고, 여기서 생략되는 것은 판정이 아니라 표시다. 다른 띠(발송·검토)는 DB만으로 선다.
     */
    return NONE;
  }
}

/** 마감을 넘기면 빈 배열로 접는다. `signalsFor`가 던지지 않으므로 race가 거부될 일은 없다. */
async function withDeadline(work: Promise<RemoteSignals[]>): Promise<RemoteSignals[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<RemoteSignals[]>((resolve) => {
    timer = setTimeout(() => resolve([]), DEADLINE_MS);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    // ⚠️ 타이머를 안 끄면 그 핸들이 이벤트 루프를 붙잡아 함수가 마감만큼 늦게 끝난다.
    clearTimeout(timer);
  }
}

/**
 * **워커 풀** — 동시에 `limit`개만 돌고, 하나가 끝나면 그 자리에서 다음을 당긴다.
 *
 * ⚠️ **`slice`로 묶어 `Promise.all`을 돌리지 않는다.** 그러면 묶음 안의 가장 느린 하나가 끝날 때까지
 * 나머지 두 자리가 논다 — 목록이 통째로 그 하나를 기다리게 된다.
 *
 * ⚠️ **라이브러리를 더하지 않는다** (design ⊕). 요구가 "동시 n개"뿐이고 그것이 이 열 줄이다.
 */
async function mapWithLimit<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) return;
      out[index] = await run(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
