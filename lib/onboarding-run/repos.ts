import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Subject } from "@/lib/auth/subject";
import { APP_ACCOUNT_PROVIDER } from "@/lib/github-connect/account-link";
import { logFailure } from "@/lib/github-connect/log";
import { planPending } from "@/lib/github-connect/pending";
import { ensureUserToken } from "@/lib/github-connect/token-store";
import { type InstallationRepo, listInstallationRepos, listUserInstallationRecords } from "@/lib/github-connect/user";
import { PROJECT_LIMIT } from "@/lib/onboarding/create-plan";
import { isOperatorUser } from "@/lib/operator/user";

import { listFailure, type OnboardFailure } from "./access";

/**
 * 프로젝트 상한이 세는 행 — **①의 안내 · 생성 선조회 · 잠금 안 재집계가 같은 조건**이어야 한다. 하나만 좁히면
 * 앞이 통과시킨 것을 뒤가 거부한다.
 * ⚠️ **OWNER 행만 센다** — 멤버십 전체를 세면 EDITOR로 초대만 받은 사람이 하나도 못 만든다 (PRODUCT §4.2).
 * ⚠️ **보관은 슬롯을 비운다** (ARCHITECTURE §5.6.4) — 삭제가 비범위라 그것이 슬롯을 되찾는 유일한 길이다.
 */
export function ownedActiveProjects(userId: string) {
  return { userId, role: "OWNER" as const, project: { archivedAt: null } };
}

/** ①의 리포 행. `pushedAt`은 "이 리포가 아직 살아 있는가"를 말한다 — 목록이 길수록 그 신호가 는다. */
export type ConnectableRepo = { owner: string; repo: string; fullName: string; pushedAt: string | null };
/**
 * ⚠️ **`pending`(설치 요청 대기)은 거부가 아니라 플래그다** — `OnboardError` union에 넣으면 `?e=`를 지나 ①
 * danger 배너 후보가 된다(`lib/github-connect/pending.ts`). 대기를 말할 수 있는 갈래 셋에만 선다.
 */
export type ConnectableReposResult =
  | { ok: true; repos: ConnectableRepo[]; pending: boolean }
  | { ok: false; error: WaitableEmpty; pending: boolean }
  | { ok: false; error: Exclude<OnboardFailure, WaitableEmpty> };
/** 대기를 말할 수 있는 빈 상태 — 장애·토큰 상태는 기록과 무관하다. */
type WaitableEmpty = "no-installations" | "no-repos";
/** ⚠️ **빈 상태 둘이 따로 선다** — `!==` 좁히기는 판별자가 단일 리터럴인 갈래만 지운다. */
type RepoListing =
  | { ok: true; repos: ConnectableRepo[] }
  | { ok: false; error: "no-installations" }
  | { ok: false; error: "no-repos" }
  | { ok: false; error: Exclude<OnboardFailure, WaitableEmpty> };

/**
 * 내 설치가 덮는 리포 목록 (화면 ②). **표시용이지만 인가 근거와 같은 목록이다** — `createProject`가
 * 제출 시점에 이것을 다시 부르고, 여기서 본 것을 믿지 않는다 (ARCHITECTURE §6.00 ③).
 *
 * ⚠️ **빈 상태 둘을 가른다** (§3.12): 설치가 0개(`no-installations`)와 설치에 선택된 리포가
 * 0개(`no-repos`)는 사용자가 할 일이 다르다 — App 설치 대 설치 설정에서 리포 추가.
 */
export async function listRepositories(prisma: PrismaClient, subject: Subject): Promise<ConnectableReposResult> {
  const { userId } = subject;
  /**
   * ⚠️ **상한은 ① 진입에서 말한다** (launch-readiness L2.6) — 전에는 ③ 끝의 [Create project]에서야 거부돼, 리포·파일·
   * 이름을 다 고른 뒤에 막혔다. 연결보다 먼저다: 상한이면 GitHub을 읽을 이유가 없다. 판정의 정본은 여전히
   * `createProject`의 잠금 안 재집계이고, 이것은 안내다.
   * 운영자는 면제된다 — 생성 코어와 같은 판정이고, 상한에 닿았을 때만 조회한다. 그 조회가 던지면 같은 `unavailable`이다.
   */
  try {
    if (
      (await prisma.projectMember.count({ where: ownedActiveProjects(userId) })) >= PROJECT_LIMIT &&
      !(await isOperatorUser(prisma, userId))
    ) {
      return { ok: false, error: "limit-reached" };
    }
  } catch (error) {
    logFailure("onboard-repos", error);
    return { ok: false, error: "unavailable" };
  }
  const token = await ensureUserToken(prisma, userId, new Date());
  if (token.status !== "ok") return { ok: false, error: token.status };

  /**
   * 설치 요청 기록 (install-and-connect). ⚠️ **조회가 던지면 `unavailable`이다** — 장애를 "대기 없음"으로
   * 위장하면 요청자가 설치 화면을 보고 링크를 다시 눌러 요청이 한 번 더 간다.
   */
  let requestedAt: Date | null;
  try {
    const row = await prisma.account.findFirst({
      where: { userId, provider: APP_ACCOUNT_PROVIDER },
      select: { installRequestedAt: true },
    });
    requestedAt = row?.installRequestedAt ?? null;
  } catch (error) {
    logFailure("onboard-repos", error);
    return { ok: false, error: "unavailable" };
  }

  let installations: readonly { id: string; createdAt: Date }[];
  try {
    // ⚠️ **전 페이지를 읽는다** — 31번째 설치가 빠지면 정당한 리포가 목록에 없다 (`user.ts`).
    installations = await listUserInstallationRecords(token.accessToken);
  } catch (error) {
    return listFailure([error]);
  }

  const listed = await listReposOf(token.accessToken, installations.map((i) => i.id));
  if (!listed.ok && listed.error !== "no-installations" && listed.error !== "no-repos") return listed;

  const { pending, clearRequest } = planPending({ listResult: listed.ok ? { ok: true } : listed, requestedAt, installations });
  if (clearRequest) {
    /**
     * 승인됐다 — 기록을 지운다. RSC 로더 안의 조건부 쓰기이고 전례가 있다(`ensureUserToken`의 토큰 회전).
     * ⚠️ **읽은 값과 같을 때만 지운다** — GitHub 목록 조회(수백 ms~수 초) 사이에 다른 탭의 callback이 새 요청을
     * 심었으면 그것은 이 승인과 무관하다. 지우면 그 대기가 사라져 사용자가 설치를 다시 눌러 요청이 한 번 더 간다.
     * 실패해도 목록은 보인다 — 다음 조회가 다시 지운다.
     */
    try {
      await prisma.account.updateMany({
        where: { userId, provider: APP_ACCOUNT_PROVIDER, installRequestedAt: requestedAt },
        data: { installRequestedAt: null },
      });
    } catch (error) {
      logFailure("onboard-repos", error);
    }
  }
  return { ...listed, pending };
}

/** 설치들 → 리포 목록. 설치 0개와 리포 0개를 가른다 (§3.12). */
async function listReposOf(
  accessToken: string,
  installations: readonly string[],
): Promise<RepoListing> {
  if (installations.length === 0) return { ok: false, error: "no-installations" };

  /**
   * ⚠️ **설치 하나의 실패가 나머지를 막지 않는다** (code-review 2026-09-07 🟡2). 일시중지된 설치는
   * 403을 주고 그건 영구 상태다 — `Promise.all`로 묶어 통째로 `unavailable`로 접으면 정상 설치의
   * 리포도 못 고르고 화면은 "잠시 뒤 다시"를 말한다. `/api/pull`이 프로젝트별로 감싸 한 실패가
   * 순회를 멈추지 않게 한 것과 같은 판단이다 (ARCHITECTURE §3.05).
   */
  const settled = await Promise.all(
    installations.map((id) =>
      listInstallationRepos(accessToken, id).then(
        (repos): { repos: readonly InstallationRepo[] } => ({ repos }),
        (error: unknown): { error: unknown } => ({ error }),
      ),
    ),
  );
  const failures = settled.flatMap((r) => ("error" in r ? [r.error] : []));
  /**
   * 같은 리포가 두 설치에 걸릴 수 있다 — 목록에 두 번 보이지 않게 접는다.
   *
   * ⚠️ **`[...new Set(rows)].sort()`로 돌아가지 않는다.** 원소가 객체가 되면 `Set`은 참조로 비교해
   * 중복을 못 접고, 기본 `.sort()`는 전부 `"[object Object]"`로 비교해 **정렬이 조용히 사라진다** —
   * `tsc`가 못 보는 부류다. 키는 `fullName`이고 비교자를 명시한다.
   */
  const byName = new Map<string, { fullName: string; pushedAt: string | null }>();
  for (const r of settled) if ("repos" in r) for (const row of r.repos) byName.set(row.fullName, row);
  const rows = [...byName.values()].sort((a, b) => (a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : 0));

  // 하나도 못 읽었는데 실패가 있었다면 빈 목록은 "리포가 없다"가 아니다 — 장애를 거부로 위장하지 않는다.
  if (rows.length === 0 && failures.length > 0) return listFailure(failures);
  // 일부만 실패했으면 원인은 로그에만 남는다 — 화면은 읽어낸 목록으로 진행한다.
  for (const error of failures) logFailure("onboard-repos", error);

  if (rows.length === 0) return { ok: false, error: "no-repos" };

  return {
    ok: true,
    repos: rows.flatMap(({ fullName, pushedAt }) => {
      const [owner, repo] = fullName.split("/");
      // `owner/name`이 아닌 응답은 이해하지 못한 것이다 — 화면에 반쪽 값을 보내지 않는다.
      return owner === undefined || repo === undefined || owner === "" || repo === ""
        ? []
        : [{ owner, repo, fullName, pushedAt }];
    }),
  };
}
