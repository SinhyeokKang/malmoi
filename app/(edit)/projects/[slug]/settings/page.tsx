import { redirect } from "next/navigation";

import { GithubAccount, ReauthorizePrompt } from "@/components/github-account";
import { FirstIngestRetry } from "@/components/onboarding/first-ingest-retry";
import { PushTokenPanel } from "@/components/onboarding/push-token-panel";
import { WorkflowBlock } from "@/components/onboarding/workflow-block";
import { ReconnectButton } from "@/components/reconnect-button";
import { RepositoryForm } from "@/components/settings/repository-form";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArchiveCard } from "@/components/settings/archive-card";
import { requireProjectAccess } from "@/lib/auth/session";
import { loadOpenPrUrl } from "@/lib/projects/open-pr";
import { getPrisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { loadConnectionHealth } from "@/lib/github";
import { loadAccountView } from "@/lib/github-connect/account-view";
import type { ConnectionHealth } from "@/lib/github-connect/health";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { importFailureMessage, isImportFailureCode } from "@/lib/projects/import-status";
import { failing } from "@/lib/projects/list";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { renderProjectWorkflowYaml, workflowSurfaceOf } from "@/lib/onboarding/workflow";
import { installationSettingsUrl } from "@/lib/github-connect/installation-url";
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
 * ARCHITECTURE §3.1). 이 화면의 [Run first import]가 `runFirstIngest`를 부르고 그것은 로케일 파일 수만큼 blob을
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
      // 상태 블록과 워크플로 YAML의 재료 (SaaS 5단계 — PRODUCT §7.5 · DESIGN §6.6).
      // ⚠️ **활성 표면 전부다.** 워크플로 파일은 표면마다 step 하나를 들고, 그것을 다시 볼 자리가
      // 이 화면뿐이다 — Add surface 결과 화면은 새로고침 한 번에 사라진다.
      surfaces: { where: { archivedAt: null }, orderBy: { slug: "asc" } },
      baseBranch: true,
      // 기준 로케일 변경의 선언 — 워크플로 YAML의 `base-locale:`이 이 값을 읽는다 (6b-3).
      /**
       * 마지막 임포트가 남긴 실패 (PRODUCT §7.8). **코드 하나이고 이력이 아니다** —
       * 파서 원문은 저장되지 않으므로 이 화면이 보여줄 수 있는 것은 사유 문장과 복구 안내뿐이고,
       * 상세 진단은 대상 리포의 Actions 로그에 있다.
       */
      /**
       * ⚠️ **목록과 같은 술어를 써야 한다** (`failing`). 이 컬럼을 안 읽으면 [다시 시도]를 누른
       * 직후의 화면이 목록은 "Importing", 여기는 빨간 실패 Alert가 되어 **같은 두 컬럼에서 정반대
       * 사실**을 말한다.
       */
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
    loadConnectionHealth(project),
    loadAccountView(prisma, userId),
    loadOpenPrUrl(slug, project),
  ]);
  const readiness = planProjectReadiness(project);
  /**
   * ⚠️ **DB 컬럼의 문자열이라 판정 함수로 거른다** — 모르는 값은 무시한다. 직접 인덱싱하면
   * `Object.prototype`에서 찾아진 값이 문장 자리에 온다 (POSTMORTEM 2026-09-08).
   */
  const stored = project.surfaces.map(s => s.lastImportError).find(isImportFailureCode) ?? null;
  // 돌고 있는 실행이 있으면 남아 있는 코드는 **이전 실행의 것**이다 — 목록과 같은 판정을 쓴다.
  const importFailure = failing({ importError: stored, importing: project.surfaces.some(s => s.lastImportStartedAt !== null) })
    ? stored
    : null;

  return (
    <>
      {/*
        ⚠️ **머리와 본문이 형제다** — 머리는 고정, 본문만 스크롤한다 (`content-panel.tsx`).
        여백·폭 등급·머리 아래 선은 **프리미티브가 든다**(기본 등급이 `limited` = `max-w-4xl`) —
        화면이 다시 정하면 그 값이 두 번 적용된다.
      */}
      <PanelHeader>
        {/*
          페이지 수준 거부는 **global Alert**다 (DESIGN §6.4).
          ⚠️ **머리에 있으므로 스크롤하지 않는다** — 거부 사유가 화면 밖으로 밀려나면 사용자는
          버튼이 안 눌린 것으로 본다 (POSTMORTEM 2026-09-06).
        */}
        {notice !== null && <Alert variant="danger">{notice}</Alert>}
        {/* ⚠️ **breadcrumb이 없다** (8-4 — DESIGN §0) — 프로젝트 하위 화면 다섯에서 함께 지웠다.
            위로 가는 길은 사이드바가 든다(프로젝트 구역 여섯이 항상 보인다). */}
        <h1 className="flex min-h-9 items-center text-lg font-medium">{m.common.nav.projectSettings}</h1>
      </PanelHeader>

      <PanelBody className="space-y-6">
        <Card title={m.settings.repository.title} description={m.settings.repository.description}>
          {/* owner/name은 식별자라 mono다 (DESIGN §4.1) */}
          <p className="text-mono bg-muted inline-block rounded px-2 py-1">
            {project.repoOwner}/{project.repoName}
          </p>
          <HealthRow health={health} slug={slug} appSlug={optionalEnv("GITHUB_APP_SLUG")} />
          {/*
            기준 브랜치 (6b-3 — DESIGN §6.6). ⚠️ **readiness 분기 밖이다** — 안에 두면 첫 적재가
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
          {/*
            ⚠️ **in-block `Alert`다** — 페이지 수준 거부가 아니라 이 블록의 사실이고, 머리로 올리면
            "설정을 열 수 없다"와 같은 층으로 읽힌다 (DESIGN §6.6).

            ⚠️ **`FirstIngestRetry` 위에 선다** — 사유를 읽기 전에 버튼부터 보이면 같은 실패를 그대로
            다시 돌린다. 첫 적재 전이면 그 버튼이 복구 경로이고, 이미 적재된 뒤면 그 버튼은
            `not-awaiting`이라 고칠 자리가 대상 리포의 CI다 — 문구가 그것을 가른다.
          */}
          {importFailure !== null && (
            <Alert variant="danger">
              {importFailureMessage(importFailure)}{" "}
              {readiness === "awaiting_first_sync"
                ? m.settings.status.importRetry
                : m.settings.status.importRerun}
            </Alert>
          )}
          <FirstIngestRetry slug={slug} canRun={readiness === "awaiting_first_sync"} />
        </Card>

        <Card title={m.surfaces.title}>
          <div className="space-y-3">
            {project.surfaces.map(surface => <div key={surface.id} className="flex items-center justify-between gap-3">
              <ButtonLink variant="link" className="text-mono" href={routes.surfaceTranslations(slug, surface.slug)}>{surface.pathTemplate ?? surface.slug}</ButtonLink>
            </div>)}
            {project.archivedAt === null && <ButtonLink href={routes.addSurface(slug)}>{m.surfaces.add}</ButtonLink>}
          </div>
        </Card>

        <Card title={m.settings.token.title}>
          <PushTokenPanel slug={slug} />
        </Card>

        <Card title={m.settings.workflow.title}>
          {project.surfaces.length > 0 && <WorkflowBlock yaml={renderProjectWorkflowYaml({
            slug, baseBranch: project.baseBranch, surfaces: project.surfaces.map(workflowSurfaceOf),
          })} />}
          {/*
            ⚠️ **훅 안내가 여기 산다** (2026-09-13). 온보딩 ④는 아직 CI를 한 번도 안 돌린 자리라
            참조가 0인지 알 수 없다 — 이 화면은 그것을 이미 볼 수 있다.
          */}
          <p className="text-muted-foreground mt-2 text-xs leading-[1.6]">
            {m.settings.workflow.hookHint(
              <span className="text-mono">useTranslations()</span>,
              <span className="text-mono">wrapper</span>,
              <span className="text-mono">docs/ACTIONS.md</span>,
            )}
          </p>
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
          보관 (7단계 — DESIGN §6.6). **맨 아래이고 readiness 분기 밖의 형제다** — 첫 적재가 실패한
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
      </PanelBody>
    </>
  );
}

/** App 토큰 쪽. 실패해도 계정 블록을 막지 않는다. */
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
  const installUrl = installationSettingsUrl(appSlug);

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
                  className="text-blue-600"
                >
                  {m.settings.repository.health.install}
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
      // 조회 실패를 "제거됨"으로 접지 않는다 (DESIGN §6.2) — 그러면 사용자가 멀쩡한 설치를 다시 만든다.
      return <p className="text-muted-foreground text-xs">{m.settings.repository.health.unknown}</p>;
  }
}


