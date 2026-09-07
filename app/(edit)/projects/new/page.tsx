import Link from "next/link";

import { ADAPTERS } from "@/lib/adapters";
import { requireUser } from "@/lib/auth/session";
import { optionalEnv } from "@/lib/env";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { formatLabel } from "@/lib/onboarding/detect";
import { isOnboardError, onboardErrorMessage, type OnboardError } from "@/lib/onboarding/message";
import { normalizeProjectSlug } from "@/lib/onboarding/slug";
import { ConnectGithubButton } from "@/components/onboarding/connect-github";
import { NewProjectFlow, type AdapterChoice, type RepoOption } from "@/components/onboarding/new-project-flow";

import { listConnectableRepos } from "../actions";

/**
 * 새 프로젝트 온보딩 (SaaS 5단계 — design §2). **①①'는 서버가 그리고 ②~⑥은 클라이언트 상태다** —
 * 첫 화면에 로딩 깜빡임을 두지 않으려고 리포 목록을 렌더에서 읽는다.
 *
 * ⚠️ **`maxDuration`이 여기 있어야 한다.** Server Action에는 `app/api/*`의 세그먼트 config가 붙지
 * 않고 Action은 **자기를 부른 페이지 세그먼트**의 값을 쓴다 — design §3.1·§4의 예산(blob ≤21,
 * 첫 적재는 로케일 파일 수)이 전부 이 60초를 전제로 세운 것이다.
 *
 * ⚠️ **최상단에서 `requireUser`를 던진다.** 조건부 렌더는 차단이 아니다 — App Router가 레이아웃과
 * 페이지를 병렬로 렌더해 페이지가 이미 실행된다 (POSTMORTEM 2026-08-31).
 *
 * ⚠️ **`?e=`를 두 union으로 읽는다.** callback이 `ConnectError`를 실어 보내고 Action은 `OnboardError`를
 * 낸다 — 한쪽만 보면 그 사유가 통째로 무음이고 사용자에게는 버튼이 안 눌린 것으로 보인다
 * (POSTMORTEM 2026-09-06 · `/projects`가 같은 함정을 밟았다).
 *
 * ⚠️ **어댑터 라벨 표는 서버가 만든다** (`formatLabel` — design §3.3). 클라이언트가 그 모듈을 값으로
 * import하면 어댑터 전부(ts-morph 포함)가 번들에 들어온다.
 */
export const maxDuration = 60;

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  await requireUser();

  // 주소창 값이라 판정 함수로 거른다 — 모르는 값은 무시한다.
  const { e } = await searchParams;
  const message = isOnboardError(e)
    ? onboardErrorMessage(e)
    : isConnectError(e)
      ? connectErrorMessage(e)
      : null;

  const listed = await listConnectableRepos();
  const adapters: AdapterChoice[] = ADAPTERS.map((adapter) => ({
    adapter: adapter.name,
    ...formatLabel(adapter.name),
  }));

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-medium">새 프로젝트</h1>
        <Link href="/projects" className="text-muted-foreground hover:text-foreground text-xs underline">
          ← 프로젝트
        </Link>
      </div>
      {message !== null && <p className="text-destructive text-sm">{message}</p>}

      {listed.ok ? (
        <NewProjectFlow
          repos={listed.repos.map(
            (repo): RepoOption => ({ ...repo, suggestedSlug: normalizeProjectSlug(repo.repo) }),
          )}
          adapters={adapters}
        />
      ) : (
        <EmptyState error={listed.error} />
      )}
    </main>
  );
}

/**
 * ①①' — 연결 전 / 설치 없음 / 리포 없음. **셋이 사용자에게 요구하는 일이 다르다**: 계정 연결 ·
 * App 설치 · 설치 설정에서 리포 추가. 하나로 접으면 무엇을 해야 하는지 알 수 없다 (design §3.12).
 *
 * `GITHUB_APP_SLUG`는 `optionalEnv`라 **없으면 링크가 조용히 사라진다** — 그때는 관리자에게
 * 요청하라고 말한다.
 */
function EmptyState({ error }: { error: string }) {
  const appSlug = optionalEnv("GITHUB_APP_SLUG");
  const installUrl = appSlug === undefined ? null : `https://github.com/apps/${appSlug}/installations/new`;

  if (error === "not-connected" || error === "reauthorize") {
    return (
      <section className="space-y-2">
        <p className="text-sm">
          {error === "not-connected"
            ? "먼저 GitHub 계정을 연결해 주세요."
            : "GitHub 인가가 만료됐어요 — 다시 연결해 주세요."}
        </p>
        <p className="text-muted-foreground text-xs">
          연결은 <strong>어느 리포에 App이 설치돼 있는지</strong>를 확인하는 데만 써요.
        </p>
        <ConnectGithubButton label={error === "not-connected" ? "GitHub 연결" : "GitHub 다시 연결"} />
      </section>
    );
  }

  if (error === "no-installations" || error === "no-repos") {
    return (
      <section className="space-y-2">
        <p className="text-sm">{onboardErrorMessage(error as OnboardError)}</p>
        {installUrl === null ? (
          <p className="text-muted-foreground text-xs">
            리포 관리자에게 말모이 App 설치를 요청해 주세요.
          </p>
        ) : (
          <p className="text-xs">
            <a href={installUrl} className="text-blue-600 underline">
              {error === "no-installations" ? "App 설치하기" : "설치에 리포 추가하기"}
            </a>
            <span className="text-muted-foreground"> — 끝낸 뒤 이 화면을 새로고침해 주세요.</span>
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <p className="text-destructive text-sm">
        {isOnboardError(error)
          ? onboardErrorMessage(error)
          : isConnectError(error)
            ? connectErrorMessage(error)
            : "리포 목록을 가져오지 못했어요."}
      </p>
      <p className="text-muted-foreground text-xs">잠시 뒤 이 화면을 새로고침해 주세요.</p>
    </section>
  );
}
