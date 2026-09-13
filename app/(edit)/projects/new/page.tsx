import { Suspense } from "react";

import { NewProject } from "@/components/onboarding/new-project";
import { ProjectList } from "@/components/projects/project-list";
import { ContentPanel } from "@/components/shell/content-panel";
import { ADAPTERS } from "@/lib/adapters";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { optionalEnv } from "@/lib/env";
import { loadProjectList } from "@/lib/keys/query";
import { formatLabel } from "@/lib/onboarding/detect";
import { normalizeProjectSlug } from "@/lib/onboarding/slug";
import type { AdapterChoice, RepoOption } from "@/lib/onboarding/types";
import { firstQueryValues, type Raw } from "@/lib/search-params";

import { listConnectableRepos } from "../actions";

/**
 * 새 프로젝트 온보딩 — **`/projects` 위의 모달 딥링크**다 (new-project-modal §1).
 *
 * ⚠️ **목록을 뒤에 그린다.** 그래서 이 라우트가 `loadProjectList`를 한 번 더 돈다 — 지금은 안 도는
 * 조회 하나가 느는 대가로 새로고침·공유·뒤로가기가 **구조로** 성립한다. `?q=`도 함께 받으므로
 * 열기 직전과 같은 목록이 뒤에 남고, 닫으면 그 값을 들고 `/projects`로 돌아간다.
 *
 * ⚠️ **`maxDuration`이 여기 있어야 한다.** Server Action에는 `app/api/*`의 세그먼트 config가 붙지
 * 않고 Action은 **자기를 부른 페이지 세그먼트**의 값을 쓴다 — design §3.1·§4의 예산(blob ≤21,
 * 첫 적재는 로케일 파일 수)이 전부 이 60초를 전제로 세운 것이다.
 *
 * ⚠️ **최상단에서 `requireUser`를 던진다.** 조건부 렌더는 차단이 아니다 — App Router가 레이아웃과
 * 페이지를 병렬로 렌더해 페이지가 이미 실행된다 (POSTMORTEM 2026-08-31).
 *
 * ⚠️ **`layout.tsx`가 없다.** 전에는 그 파일이 `<ContentPanel>`을 들었는데, 갈래 넷이 모달 안으로
 * 들어가면서 존재 이유(*"갈래마다 따로 반환하므로"*)가 사라졌다. 남긴 채 페이지에도 넣으면
 * `shell-layout.test.ts`가 2를 세어 red다.
 *
 * ⚠️ **어댑터 라벨 표는 서버가 만든다** (`formatLabel` — design §3.3). 클라이언트가 그 모듈을 값으로
 * import하면 어댑터 전부(ts-morph 포함)가 번들에 들어온다.
 */
export const maxDuration = 60;

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<Raw<"e" | "q">>;
}) {
  const { userId } = await requireUser();

  const { e, q } = firstQueryValues(await searchParams);

  const all = await loadProjectList(getPrisma(), userId);
  // ⚠️ `layout`은 **어댑터에서 그대로** 온다 — 수동 지정의 Path 힌트·예시가 이 값으로 갈리므로
  // 리터럴로 적으면 어댑터를 더할 때 화면이 조용히 틀린 안내를 한다.
  const adapters: AdapterChoice[] = ADAPTERS.map((adapter) => ({
    adapter: adapter.name,
    layout: adapter.layout,
    ...formatLabel(adapter.name),
  }));

  return (
    <ContentPanel>
      <ProjectList all={all} q={q} />
      {/*
        ⚠️ **리포 목록을 `<Suspense>`로 감싼다.** 안 그러면 §4의 "① 로딩" 행도
        `newProject.repo.loading` 키도 **도달 불가**다 — 페이지가 목록을 기다리느라 모달 자체가
        늦게 뜬다 (POSTMORTEM 2026-09-08).
      */}
      <Suspense
        fallback={
          <NewProject
            repos={undefined}
            listError={undefined}
            adapters={adapters}
            installUrl={installUrl()}
            now={new Date().toISOString()}
            initialError={e}
            backQuery={{ q }}
          />
        }
      >
        <RepoLoader adapters={adapters} initialError={e} backQuery={{ q }} />
      </Suspense>
    </ContentPanel>
  );
}

async function RepoLoader({
  adapters,
  initialError,
  backQuery,
}: {
  adapters: AdapterChoice[];
  initialError: string | undefined;
  backQuery: { q?: string };
}) {
  const listed = await listConnectableRepos();

  return (
    <NewProject
      repos={
        listed.ok
          ? listed.repos.map((repo): RepoOption => ({ ...repo, suggestedSlug: normalizeProjectSlug(repo.repo) }))
          : undefined
      }
      listError={listed.ok ? undefined : listed.error}
      adapters={adapters}
      installUrl={installUrl()}
      /** ⚠️ **"지금"을 서버가 한 번 만든다** — 클라이언트에서 만들면 hydration이 어긋난다. */
      now={new Date().toISOString()}
      initialError={initialError}
      backQuery={backQuery}
    />
  );
}

/**
 * `GITHUB_APP_SLUG`는 `optionalEnv`라 **없으면 링크가 조용히 사라진다** — 그때는 관리자에게
 * 요청하라고 화면이 말한다.
 */
function installUrl(): string | null {
  const appSlug = optionalEnv("GITHUB_APP_SLUG");
  return appSlug === undefined ? null : `https://github.com/apps/${appSlug}/installations/new`;
}
