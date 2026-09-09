import { ExternalLink } from "lucide-react";
import { redirect } from "next/navigation";

import { GithubAccount, ReauthorizePrompt } from "@/components/github-account";
import { CopyButton } from "@/components/onboarding/copy-button";
import { FirstIngestRetry } from "@/components/onboarding/first-ingest-retry";
import { PushTokenPanel } from "@/components/onboarding/push-token-panel";
import { WorkflowBlock } from "@/components/onboarding/workflow-block";
import { ReconnectButton } from "@/components/reconnect-button";
import { RepositoryForm } from "@/components/settings/repository-form";
import { Alert } from "@/components/ui/alert";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { requireProjectAccess } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { probeRepo } from "@/lib/github";
import { planConnectionHealth, type ConnectionHealth } from "@/lib/github-connect/health";
import { logFailure } from "@/lib/github-connect/log";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { ensureUserToken } from "@/lib/github-connect/token-store";
import { getViewer } from "@/lib/github-connect/user";
import { m } from "@/lib/i18n";
import { basePending } from "@/lib/onboarding/base-pending";
import { planProjectReadiness } from "@/lib/onboarding/readiness";
import { baseLocaleLine, renderWorkflowYaml } from "@/lib/onboarding/workflow";
import { routes } from "@/lib/routes";

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
  searchParams: Promise<{ e?: string }>;
}) {
  const { slug } = await params;
  const { projectId, userId } = await requireProjectAccess({ slug, permission: "project:settings" });

  // callback이 실패 사유를 여기로 보낸다. 주소창 값이라 판정 함수로 거른다 — 모르는 값은 무시.
  const { e } = await searchParams;
  const notice = isConnectError(e) ? connectErrorMessage(e) : null;

  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      repoOwner: true,
      repoName: true,
      installationId: true,
      // 상태 블록과 워크플로 YAML의 재료 (SaaS 5단계 — design §3.7·§7).
      lastCommitSha: true,
      baseBranch: true,
      adapterName: true,
      baseLocale: true,
      // 기준 로케일 변경의 선언 — 대기 Alert의 조건과 워크플로 YAML의 `base-locale:`이 이 값을 읽는다 (6b-3).
      declaredBaseLocale: true,
      // ⚠️ **살아 있는 것만 고를 수 있다** — orphaned 로케일을 base로 세우면 다음 push가 키 0개를 낸다.
      locales: { where: { orphaned: false }, select: { code: true }, orderBy: { code: "asc" } },
    },
  });
  // 인가는 지났는데 행이 없다 — 그 사이에 지워진 경우다. 빈 화면 대신 `requireProjectAccess`의 not-found와
  // 같은 곳으로 보낸다 (문구가 존재 여부를 말하지 않는다).
  if (project === null) redirect(`${routes.projects()}?e=not-found`);

  const [health, account] = await Promise.all([loadHealth(project), loadAccount(prisma, userId)]);
  const readiness = planProjectReadiness(project);

  return (
    <>
      {/* 페이지 수준 거부는 **global Alert**다 — top bar 아래 전폭 (DESIGN §6.4). */}
      {notice !== null && (
        <div className="px-6 pt-6">
          <Alert variant="danger">{notice}</Alert>
        </div>
      )}
      <main className="mx-auto w-full max-w-4xl space-y-6 px-6 py-6">
        <div className="space-y-3">
          <Breadcrumb
            items={[
              { label: project.name, href: routes.translations(slug) },
              { label: m.settings.title },
            ]}
          />
          <h1 className="text-base font-medium">{m.settings.title}</h1>
        </div>

        <Card title={m.settings.repository.title} description={m.settings.repository.description}>
          {/* owner/name은 식별자라 mono다 (DESIGN §4.1) */}
          <p className="text-mono bg-muted inline-block rounded px-2 py-1">
            {project.repoOwner}/{project.repoName}
          </p>
          <HealthRow health={health} slug={slug} appSlug={optionalEnv("GITHUB_APP_SLUG")} />
          {/*
            기준 브랜치·기준 로케일 (6b-3 — design §3.13). ⚠️ **readiness 분기 밖이다** — 안에 두면
            첫 적재가 끝나는 순간 `revalidatePath`가 폼을 언마운트해 방금 받은 저장 결과가 사라진다
            (POSTMORTEM 2026-09-07, `FirstIngestRetry`와 같은 축).
          */}
          <RepositoryForm
            slug={slug}
            baseBranch={project.baseBranch}
            baseLocale={project.baseLocale}
            locales={project.locales.map((l) => l.code)}
          />
          <BasePendingAlert declared={project.declaredBaseLocale} baseLocale={project.baseLocale} />
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
      </main>
    </>
  );
}

/** App 토큰 쪽. 실패해도 계정 블록을 막지 않는다. */
async function loadHealth(project: {
  repoOwner: string;
  repoName: string;
  installationId: string | null;
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

/** 사용자 토큰 쪽. 실패해도 건강성 블록을 막지 않는다. */
async function loadAccount(
  prisma: ReturnType<typeof getPrisma>,
  userId: string,
): Promise<{ status: "ok"; login: string | null } | { status: "reauthorize" } | { status: "unavailable" }> {
  // ⚠️ **세션 사용자의 행만 본다.** `where`에 `userId`가 없으면 아무의 연결이나 집어 남의 GitHub
  // 핸들을 화면에 띄운다 — 조회를 인가된 주체로 좁히는 것은 `projectId` 규칙과 같은 축이다.
  const token = await ensureUserToken(prisma, userId, new Date());
  if (token.status === "not-connected") return { status: "ok", login: null };
  if (token.status === "reauthorize") return { status: "reauthorize" };
  if (token.status === "unavailable") return { status: "unavailable" };

  try {
    const viewer = await getViewer(token.accessToken);
    return { status: "ok", login: viewer.login };
  } catch (error) {
    // 401이면 인가가 철회된 것이고, 그 밖은 일시 장애다 — 둘을 가르는 것은 다음 호출이 한다.
    logFailure("viewer", error);
    return { status: "unavailable" };
  }
}

/** §3.3 표 그대로 여섯 갈래. **DESIGN §6.2 밖의 raw 색을 늘리지 않는다.** */
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
                  className="inline-flex items-baseline gap-1 text-blue-600 underline"
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
    default:
      // 조회 실패를 "제거됨"으로 접지 않는다 (design §3.3) — 그러면 사용자가 멀쩡한 설치를 다시 만든다.
      return <p className="text-muted-foreground text-xs">{m.settings.repository.health.unknown}</p>;
  }
}

/**
 * 기준 로케일 변경 대기 Alert (6b-3 — design §3.13). **조건은 `basePending` 하나다** — 저장 직후만이
 * 아니라 대기 중 상시로 뜬다.
 *
 * ⚠️ **파일 전체를 다시 보이지 않는다.** 아래 워크플로 블록이 이미 선언을 반영한 YAML을 통째로
 * 내므로(`workflowYaml`), 여기서 같은 것을 또 내면 한 화면에 저장할 파일이 둘로 보인다. 필요한
 * 것은 **고칠 한 줄**이고 그것을 복사할 수 있으면 된다 — 줄의 정본은 `baseLocaleLine`이다.
 */
function BasePendingAlert({ declared, baseLocale }: { declared: string | null; baseLocale: string | null }) {
  if (!basePending({ baseLocale, declaredBaseLocale: declared }) || declared === null) return null;
  const line = baseLocaleLine(declared);
  return (
    <Alert variant="warning" title={m.settings.repository.pending.title}>
      <p>{m.settings.repository.pending.body(<span className="text-mono">.github/workflows/l10n.yml</span>)}</p>
      {/* ⚠️ 여러 줄일 수 있는 코드는 값 칩이 아니라 `<pre>`다 (DESIGN §6.4). */}
      <pre className="text-mono bg-muted mt-2 overflow-x-auto rounded-md p-3">{line}</pre>
      <p className="mt-2">
        <CopyButton value={line} label={m.settings.repository.pending.copy} />
      </p>
    </Alert>
  );
}

/**
 * 복사용 워크플로 YAML. **`ts-dict`만 어댑터를 고정한다** — 그 포맷은 자동 탐지에 참여하지 않으므로
 * (ADAPTER-COVERAGE 판정 ③) 고정하지 않으면 CI가 "로케일 파일을 못 찾았다"로 끝난다. 나머지는
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
