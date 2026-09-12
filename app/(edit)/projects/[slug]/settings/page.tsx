import { ExternalLink } from "lucide-react";
import { redirect } from "next/navigation";

import { GithubAccount, ReauthorizePrompt } from "@/components/github-account";
import { CopyButton } from "@/components/onboarding/copy-button";
import { FirstIngestRetry } from "@/components/onboarding/first-ingest-retry";
import { PushTokenPanel } from "@/components/onboarding/push-token-panel";
import { WorkflowBlock } from "@/components/onboarding/workflow-block";
import { ReconnectButton } from "@/components/reconnect-button";
import { RepositoryForm } from "@/components/settings/repository-form";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ArchiveCard } from "@/components/settings/archive-card";
import { requireProjectAccess } from "@/lib/auth/session";
import { createGitClient } from "@/lib/github";
import { syncBranchFor } from "@/lib/pull/trigger";
import { getPrisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { probeRepo } from "@/lib/github";
import { loadAccountView } from "@/lib/github-connect/account-view";
import { planConnectionHealth, type ConnectionHealth } from "@/lib/github-connect/health";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
// ⚠️ **필드와 대기 Alert는 6b-5가 `/locales`로 옮겼지만 이 조건은 남는다** — 아래 `workflowYaml`이
// 대기 중 `base-locale:`을 박고, 그 줄이 없으면 CI가 옛 base를 계속 보내 변경이 영영 안 일어난다.
import { basePending } from "@/lib/onboarding/base-pending";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { renderWorkflowYaml } from "@/lib/onboarding/workflow";
import { routes } from "@/lib/routes";
import { firstQueryValues, type Raw } from "@/lib/search-params";

/**
 * 프로젝트 설정 — settings-block 넷 + 계정 (DESIGN §6.6). 기준 브랜치·기준 로케일 필드는 **6b**다.
 *
 * ⚠️ **최상단에서 `requireProjectAccess`를 던진다.** 조건부 렌더는 차단이 아니다 — App Router가
 * 레이아웃과 페이지를 병렬로 렌더해 페이지가 이미 실행되고 RSC 페이로드에 데이터가 실린다
 * (POSTMORTEM 2026-08-31, 실측 1.3MB).
 *
 * ⚠️ **블록이 독립적으로 실패한다.** 건강성은 App 설치 토큰, 계정은 사용자 토큰이라 한쪽 API가 죽어도
 * 다른 쪽은 그려야 한다 — 하나로 묶으면 GitHub 장애에 화면이 통째로 빈다. 각 블록이 자기 오류를
 * in-block `Alert danger`로 내고, 페이지 수준 거부(`?e=`)만 global `Alert`다 (DESIGN §6.6).
 */

/**
 * ⚠️ **Server Action은 자기를 부른 페이지 세그먼트의 `maxDuration`을 쓴다** (`app/api/*`의 값이 아니다 —
 * design §2). 이 화면의 [Run first import]가 `runFirstIngest`를 부르고 그것은 로케일 파일 수만큼 blob을
 * 받으므로, 기본 제한으로는 큰 리포에서 응답 도중 잘린다.
 */
export const maxDuration = 60;

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Raw<"e">>;
}) {
  const { slug } = await params;
  const { projectId, userId } = await requireProjectAccess({ slug, permission: "project:settings" });

  // callback이 실패 사유를 여기로 보낸다. 주소창 값이라 판정 함수로 거른다 — 모르는 값은 무시.
  const { e } = firstQueryValues(await searchParams);
  const notice = isConnectError(e) ? connectErrorMessage(e) : null;

  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      repoOwner: true,
      repoName: true,
      installationId: true,
      repositoryId: true,
      // 상태 블록과 워크플로 YAML의 재료 (SaaS 5단계 — design §3.7·§7).
      lastCommitSha: true,
      baseBranch: true,
      adapterName: true,
      baseLocale: true,
      // 기준 로케일 변경의 선언 — 워크플로 YAML의 `base-locale:`이 이 값을 읽는다 (6b-3).
      declaredBaseLocale: true,
      // 보관 카드 (7단계). ⚠️ **이 화면만 보관된 프로젝트를 연다** — `project:settings`가 그 갈래를
      // 통과하는 유일한 permission이고, 그것이 되돌리는 길이다.
      archivedAt: true,
      /**
       * ⚠️ **로케일 목록을 읽지 않는다.** 6b-3이 여기서 셀렉트 항목으로 썼지만 6b-5가 그 필드를
       * `/projects/:slug/locales`로 옮겼고, 남겨 두면 **아무 데도 안 쓰이는 행을 매 렌더에 읽는다.**
       * 이 화면이 선언 컬럼에 대해 하는 일은 워크플로 YAML에 한 줄을 박는 것뿐이다.
       */
    },
  });
  // 인가는 지났는데 행이 없다 — 그 사이에 지워진 경우다. 빈 화면 대신 `requireProjectAccess`의 not-found와
  // 같은 곳으로 보낸다 (문구가 존재 여부를 말하지 않는다).
  if (project === null) redirect(`${routes.projects()}?e=not-found`);

  // ⚠️ **계정 상태는 `/account`와 같은 함수가 낸다** (6b-4) — 사본을 두면 두 화면이 갈린다.
  const [health, account, openPrUrl] = await Promise.all([
    loadHealth(project),
    loadAccountView(prisma, userId),
    loadOpenPrUrl(slug, project),
  ]);
  const readiness = planProjectReadiness(project);

  return (
    <>
      {/*
        ⚠️ **머리와 본문이 형제다** — 머리는 고정, 본문만 스크롤한다 (`content-panel.tsx`).
        `max-w-4xl`은 **안쪽 래퍼**가 든다: `PanelBody`에 직접 주면 스크롤 컨테이너가 좁아져
        스크롤바가 패널 가장자리가 아니라 콘텐츠 옆에 생긴다.
      */}
      <PanelHeader>
        <div className="mx-auto w-full max-w-4xl space-y-3 px-6 pt-6 pb-3">
          {/*
            페이지 수준 거부는 **global Alert**다 (DESIGN §6.4).
            ⚠️ **머리에 있으므로 스크롤하지 않는다** — 거부 사유가 화면 밖으로 밀려나면 사용자는
            버튼이 안 눌린 것으로 본다 (POSTMORTEM 2026-09-06).
          */}
          {notice !== null && <Alert variant="danger">{notice}</Alert>}
          {/* ⚠️ **breadcrumb이 없다** (8-4 spec Q5) — 프로젝트 하위 화면 다섯에서 함께 지웠다.
              위로 가는 길은 사이드바가 든다(프로젝트 구역 여섯이 항상 보인다). */}
          <h1 className="flex min-h-9 items-center text-xl font-medium">{m.common.nav.projectSettings}</h1>
        </div>
      </PanelHeader>

      <PanelBody>
        <div className="mx-auto w-full max-w-4xl space-y-6 px-6 pt-3 pb-8">
          <Card title={m.settings.repository.title} description={m.settings.repository.description}>
            {/* owner/name은 식별자라 mono다 (DESIGN §4.1) */}
            <p className="text-mono bg-muted inline-block rounded px-2 py-1">
              {project.repoOwner}/{project.repoName}
            </p>
            <HealthRow health={health} slug={slug} appSlug={optionalEnv("GITHUB_APP_SLUG")} />
            {/*
              기준 브랜치 (6b-3 — design §3.13). ⚠️ **readiness 분기 밖이다** — 안에 두면 첫 적재가
              끝나는 순간 `revalidatePath`가 폼을 언마운트해 방금 받은 저장 결과가 사라진다
              (POSTMORTEM 2026-09-07, `FirstIngestRetry`와 같은 축).

              ⚠️ **기준 언어 필드와 대기 Alert는 여기 없다** — 6b-5가 `/projects/:slug/locales`로 옮겼다
              (PRODUCT §7.7 결정 4). 로케일 목록과 base 지정이 한 화면에 있어야 orphaned 로케일의 사유를
              말할 자리가 생긴다. 이 화면은 그 선언을 **읽기만** 한다(아래 워크플로 YAML).
            */}
            <RepositoryForm slug={slug} baseBranch={project.baseBranch} />
          </Card>

          <Card title={m.settings.status.title}>
            {/* 가장 흔한 상태가 가장 조용해야 한다 (DESIGN §6.1) — 초록도 배지도 늘리지 않는다. */}
            <p className="text-muted-foreground text-xs">
              {readiness === "ready"
                ? m.settings.status.ready
                : readiness === "setup"
                  ? m.settings.status.setup
                  : m.settings.status.awaiting}
            </p>
            {/*
              ⚠️ **`FirstIngestRetry`를 readiness 분기 밖에 둔다.** 성공하면 `revalidatePath`가 이 블록을 다시
              렌더하고 readiness가 `ready`로 바뀌는데, 그때 컴포넌트가 분기와 함께 사라지면 방금 받은 결과
              문구도 사라진다 — 부분 실패의 "N couldn't be read"가 아무에게도 닿지 않는다(불변식 9).
              같은 자리에 남겨 두면 클라이언트 상태가 서버 재렌더를 넘어간다 (POSTMORTEM 2026-09-07).
            */}
            <FirstIngestRetry slug={slug} canRun={readiness === "awaiting_first_sync"} />
          </Card>

          <Card title={m.settings.token.title}>
            <PushTokenPanel slug={slug} />
          </Card>

          <Card title={m.settings.workflow.title}>
            <WorkflowBlock yaml={workflowYaml(slug, project)} />
          </Card>

          <Card title={m.settings.account.title}>
            {account.status === "reauthorize" ? (
              <ReauthorizePrompt slug={slug} />
            ) : account.status === "unavailable" ? (
              <p className="text-muted-foreground text-xs">{m.settings.account.unavailable}</p>
            ) : (
              <GithubAccount slug={slug} login={account.login} />
            )}
          </Card>

          {/*
            보관 (7단계 — design §6.2). **맨 아래이고 readiness 분기 밖의 형제다** — 첫 적재가 실패한
            프로젝트도 멈출 수 있어야 하고, 분기 안에 두면 그 상태에서 카드가 사라진다.
          */}
          <Card title={m.archive.title} description={m.archive.description}>
            <ArchiveCard
              slug={slug}
              name={project.name}
              archived={project.archivedAt !== null}
              openPrUrl={openPrUrl}
            />
          </Card>
        </div>
      </PanelBody>
    </>
  );
}

/** App 토큰 쪽. 실패해도 계정 블록을 막지 않는다. */
async function loadHealth(project: {
  repoOwner: string;
  repoName: string;
  installationId: string | null;
  repositoryId: string | null;
}): Promise<ConnectionHealth> {
  // ⚠️ 저장된 설치가 없으면 probe 결과가 판정을 바꾸지 못한다(`planConnectionHealth`가 그때
  // `not-connected`를 준다) — 부르면 App JWT 조회와 토큰 발급 두 번이 헛돈다. 지금 프로덕션의
  // `skillflo`가 그 상태다.
  if (project.installationId === null) return { status: "not-connected" };

  // ⚠️ try로 감싸지 않는다. `probeRepo`는 GitHub 실패를 값(`error` → `unknown`)으로 주고, 던지는 것은
  // 환경변수 누락뿐이다 — 그것까지 `unknown`("잠시 뒤 다시")으로 접으면 설정 오류가 영원히 일시 장애로
  // 보인다 (code-review 2026-09-07 🟡1). "블록의 독립 실패"는 GitHub 장애에 대한 것이지 설정 오류가 아니다.
  const probe = await probeRepo(project.repoOwner, project.repoName);
  return planConnectionHealth({ project, probe });
}

/** §3.3 표 + 리포 정체성 한 갈래 = 일곱. **DESIGN §6.2 밖의 raw 색을 늘리지 않는다.** */
function HealthRow({
  health,
  slug,
  appSlug,
}: {
  health: ConnectionHealth;
  slug: string;
  appSlug: string | undefined;
}) {
  const installUrl = appSlug === undefined ? null : `https://github.com/apps/${appSlug}/installations/new`;

  switch (health.status) {
    case "ok":
      // 가장 흔한 상태가 가장 조용해야 한다 (DESIGN §6.1) — 초록을 늘리지 않는다.
      return <p className="text-muted-foreground text-xs">{m.settings.repository.health.ok}</p>;
    case "not-connected":
      return (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">{m.settings.repository.health["not-connected"]}</p>
          <ReconnectButton slug={slug} label={m.settings.repository.connect} />
        </div>
      );
    case "app-uninstalled":
      return (
        <div className="space-y-2">
          <Alert variant="danger">
            <p>{m.settings.repository.health["app-uninstalled"]}</p>
            {installUrl !== null && (
              <p className="mt-1">
                <a
                  href={installUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-baseline gap-1 text-blue-600"
                >
                  {m.settings.repository.health.install}
                  <ExternalLink className="size-3" aria-hidden />
                </a>{" "}
                — {m.settings.repository.health.installHint}
              </p>
            )}
          </Alert>
          <ReconnectButton slug={slug} label={m.settings.repository.reconnect} />
        </div>
      );
    case "installation-changed":
      return (
        <div className="space-y-2">
          <Alert variant="danger">{m.settings.repository.health["installation-changed"]}</Alert>
          <ReconnectButton slug={slug} label={m.settings.repository.reconnect} />
        </div>
      );
    case "repo-moved":
      return (
        <div className="space-y-2">
          <Alert variant="warning">
            {m.settings.repository.health.moved(<span className="text-mono">{health.fullName}</span>)}
          </Alert>
          <ReconnectButton slug={slug} label={m.settings.repository.reconnect} />
        </div>
      );
    case "repo-replaced":
      // ⚠️ **[다시 연결]이 없다** — 리포는 생성 시점에 고정이고 `connectRepository`가 다른 id로의
      // 재고정을 `repo-forbidden`으로 거부한다 (sec-audit-2 발견 34). 눌러도 실패할 버튼을 주면
      // 사용자는 자기가 뭘 잘못했는지 찾는 데 시간을 쓴다.
      return <Alert variant="danger">{m.settings.repository.health["repo-replaced"]}</Alert>;
    default:
      // 조회 실패를 "제거됨"으로 접지 않는다 (design §3.3) — 그러면 사용자가 멀쩡한 설치를 다시 만든다.
      return <p className="text-muted-foreground text-xs">{m.settings.repository.health.unknown}</p>;
  }
}


/**
 * 복사용 워크플로 YAML. **`ts-dict`만 어댑터를 고정한다** — 그 포맷은 자동 탐지에 참여하지 않으므로
 * (ARCHITECTURE §1.9 판정 ③) 고정하지 않으면 CI가 "로케일 파일을 못 찾았다"로 끝난다. 나머지는
 * 탐지가 같은 답을 내므로 고정할 이유가 없다 (design §7).
 *
 * ⚠️ **대기 중에는 `base-locale:`을 무조건 박는다** (6b-3). 그 줄이 없으면 CI가 탐지 1순위를
 * 보내는데 그것은 옛 base라 `checkFormat`이 통과시키고, 사용자가 원한 변경은 **영영 일어나지
 * 않는다** — 조용하다. 그래서 선언이 있으면 어댑터와 무관하게 고정한다.
 */
function workflowYaml(
  slug: string,
  project: {
    baseBranch: string;
    adapterName: string | null;
    baseLocale: string | null;
    declaredBaseLocale: string | null;
  },
): string {
  const pending = basePending({
    baseLocale: project.baseLocale,
    declaredBaseLocale: project.declaredBaseLocale,
  });
  const baseLocale = pending ? project.declaredBaseLocale : project.adapterName === "ts-dict" ? project.baseLocale : null;
  // 두 호출로 가른다 — 스프레드로 합치면 `adapter`가 `string`으로 넓어져 인자 타입과 어긋난다.
  if (baseLocale === null) {
    return renderWorkflowYaml({ slug, baseBranch: project.baseBranch });
  }
  if (project.adapterName !== "ts-dict") {
    return renderWorkflowYaml({ slug, baseBranch: project.baseBranch, baseLocale });
  }
  return renderWorkflowYaml({ slug, baseBranch: project.baseBranch, adapter: "ts-dict", baseLocale });
}


/**
 * 열린 sync PR 하나. **보관 확인 Dialog가 그것을 링크로 싣는다** — 보관은 PR을 닫지 않으므로
 * (PRODUCT §7.9) 사람이 알고 판단해야 한다.
 *
 * ⚠️ **실패를 `null`("없다")로 접지 않는다** — `undefined`가 "확인하지 못했다"이고 화면이 그것을
 * 다른 문장으로 말한다 (POSTMORTEM 2026-09-03: 실패한 PR 조회를 "PR 없음"으로 읽어 경고가 사라졌다).
 *
 * ⚠️ **호출을 하나만 한다.** 설정 화면은 이미 App 토큰으로 건강성을 묻고 있고, 여기서 목록을 훑거나
 * 재시도하면 그 화면 하나가 GitHub 왕복 여럿이 된다.
 */
async function loadOpenPrUrl(
  slug: string,
  project: {
    repoOwner: string;
    repoName: string;
    baseBranch: string;
    installationId: string | null;
    repositoryId: string | null;
    archivedAt: Date | null;
  },
): Promise<string | null | undefined> {
  // ⚠️ **이미 보관됐으면 묻지 않는다** — 그 상태의 카드는 [Restore project] 하나이고 Dialog가 없다.
  // 쓰이지 않는 값을 위해 왕복을 하나 늘리는 셈이고, `createGitClient`는 호출마다 설치 토큰을 새로 뽑는다.
  if (project.archivedAt !== null) return null;
  if (project.installationId === null) return null;
  if (project.repositoryId === null) return undefined;
  try {
    const client = await createGitClient(project.repoOwner, project.repoName, project.installationId, project.repositoryId);
    return await client.findOpenPrUrl(`${project.repoOwner}:${syncBranchFor(slug)}`, project.baseBranch);
  } catch {
    return undefined;
  }
}
