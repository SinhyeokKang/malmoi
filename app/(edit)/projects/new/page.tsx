// ⚠️ `lucide-react` 1.x에 브랜드 아이콘이 없다 — `Github`을 import하면 빌드가 죽는다 (DESIGN §6.8)
import { ExternalLink, FolderGit2, Link2 } from "lucide-react";

import { ConnectGithubButton } from "@/components/onboarding/connect-github";
import { NewProjectFlow, type AdapterChoice, type RepoOption } from "@/components/onboarding/new-project-flow";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { ADAPTERS } from "@/lib/adapters";
import { requireUser } from "@/lib/auth/session";
import { optionalEnv } from "@/lib/env";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { formatLabel } from "@/lib/onboarding/detect";
import { isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";
import { normalizeProjectSlug } from "@/lib/onboarding/slug";
import { routes } from "@/lib/routes";

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
  // ⚠️ `layout`은 **어댑터에서 그대로** 온다 — 수동 지정의 Path 힌트·예시가 이 값으로 갈리므로
  // 리터럴로 적으면 어댑터를 더할 때 화면이 조용히 틀린 안내를 한다. 클라이언트는 `lib/adapters`를
  // 값으로 읽을 수 없다(ts-morph가 번들에 들어온다 — POSTMORTEM 2026-09-07).
  const adapters: AdapterChoice[] = ADAPTERS.map((adapter) => ({
    adapter: adapter.name,
    layout: adapter.layout,
    ...formatLabel(adapter.name),
  }));

  return (
    <>
      {/*
        ⚠️ **머리와 본문이 형제다** — 머리는 고정, 본문만 스크롤한다 (`content-panel.tsx`).
        `max-w-4xl`은 **안쪽 래퍼**가 든다: `PanelBody`에 직접 주면 스크롤 컨테이너가 좁아져
        스크롤바가 패널 가장자리가 아니라 콘텐츠 옆에 생긴다.

        ⚠️ **거부 `Alert`가 머리에 있다** — 페이지 수준 거부는 스크롤해서 찾을 것이 아니다.
      */}
      <PanelHeader>
        <div className="mx-auto w-full max-w-4xl space-y-3 px-6 pt-6 pb-3">
          {/* 페이지 수준 거부는 **global Alert**다 — 머리 맨 위 전폭 (DESIGN §6.4). */}
          {message !== null && <Alert variant="danger">{message}</Alert>}
          <Breadcrumb
            items={[{ label: m.common.nav.projects, href: routes.projects() }, { label: m.common.nav.newProject }]}
          />
          <h1 className="flex min-h-9 items-center text-xl font-medium">{m.common.nav.newProject}</h1>
        </div>
      </PanelHeader>

      <PanelBody>
        <div className="mx-auto w-full max-w-4xl space-y-6 px-6 pt-3 pb-8">
          {listed.ok ? (
            <NewProjectFlow
              repos={listed.repos.map(
                (repo): RepoOption => ({ ...repo, suggestedSlug: normalizeProjectSlug(repo.repo) }),
              )}
              adapters={adapters}
            />
          ) : (
            <Blocked error={listed.error} />
          )}
        </div>
      </PanelBody>
    </>
  );
}

/**
 * ①①' — 연결 전 / 설치 없음 / 리포 없음. **셋이 사용자에게 요구하는 일이 다르다**: 계정 연결 ·
 * App 설치 · 설치 설정에서 리포 추가. 하나로 접으면 무엇을 해야 하는지 알 수 없다 (design §3.12).
 *
 * `GITHUB_APP_SLUG`는 `optionalEnv`라 **없으면 링크가 조용히 사라진다** — 그때는 관리자에게
 * 요청하라고 말한다.
 */
function Blocked({ error }: { error: string }) {
  const appSlug = optionalEnv("GITHUB_APP_SLUG");
  const installUrl = appSlug === undefined ? null : `https://github.com/apps/${appSlug}/installations/new`;

  if (error === "not-connected" || error === "reauthorize") {
    return (
      <EmptyState
        icon={Link2}
        title={m.newProject.empty.connect.title}
        description={m.newProject.empty.connect.description}
        action={
          <ConnectGithubButton
            dest="new"
            label={
              error === "not-connected"
                ? m.newProject.empty.connect.action
                : m.newProject.empty.connect.reauthorize
            }
          />
        }
      />
    );
  }

  if (error === "no-installations" || error === "no-repos") {
    return (
      <EmptyState
        icon={FolderGit2}
        /**
         * ⚠️ **제목에 판정층 문구를 넣지 않는다** (code-review 2026-09-08). `onboardErrorMessage`는
         * "무엇이 없다 + 무엇을 하라"의 두 문장이고, 빈 상태의 제목은 마침표 없는 짧은 구다
         * (DESIGN §6.4·§10). 사유는 설명이 들고, 그 아래 링크가 행동이다.
         */
        title={
          error === "no-installations" ? m.newProject.empty.noInstallations : m.newProject.empty.noRepos
        }
        description={
          <>
            {/* 가드를 지난 값이라 단언하지 않는다 — 분기에 새 문자열을 더해도 컴파일러가 잡는다 */}
            {onboardErrorMessage(error)}{" "}
            {installUrl === null ? (
              m.newProject.empty.noLink
            ) : (
              <>
                <a
                  href={installUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-baseline gap-1 text-blue-600"
                >
                  {error === "no-installations" ? m.newProject.empty.install : m.newProject.empty.addRepos}
                  <ExternalLink className="size-3" aria-hidden />
                </a>{" "}
                — {m.newProject.empty.afterInstall}
              </>
            )}
          </>
        }
      />
    );
  }

  return (
    <Alert variant="danger" title={m.newProject.empty.listFailed}>
      {isOnboardError(error)
        ? onboardErrorMessage(error)
        : isConnectError(error)
          ? connectErrorMessage(error)
          : m.newProject.empty.retryHint}
    </Alert>
  );
}
