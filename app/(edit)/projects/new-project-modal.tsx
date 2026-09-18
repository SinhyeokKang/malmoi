import "server-only";

import { Suspense } from "react";
import { NewProject } from "@/components/onboarding/new-project";
import { ADAPTERS } from "@/lib/adapters";
import { optionalEnv } from "@/lib/env";
import { installationSettingsUrl } from "@/lib/github-connect/installation-url";
import { formatLabel } from "@/lib/onboarding/detect";
import { normalizeProjectSlug } from "@/lib/onboarding/slug";
import type { AdapterChoice, RepoOption } from "@/lib/onboarding/types";

import { listConnectableRepos } from "./actions";

/** 두 진입점이 인가한 뒤 사용한다. 배경 목록을 읽지 않아 인터셉트가 원격 집계를 다시 기다리지 않는다. */
export function NewProjectModal({ initialError, backQuery, closeMode }: {
  initialError: string | undefined;
  backQuery: { q?: string };
  closeMode: "back" | "list";
}) {
  // 어댑터 그래프는 서버에 남겨야 클라이언트 번들로 파서가 따라오지 않는다.
  const adapters: AdapterChoice[] = ADAPTERS.map((adapter) => ({
    adapter: adapter.name, layout: adapter.layout, ...formatLabel(adapter.name),
  }));
  return (
    // 리포 조회가 끝나기 전에 껍데기와 로딩 상태를 보내야 모달이 네트워크 대기 뒤에 뜨지 않는다.
    <Suspense fallback={
      <NewProject repos={undefined} listError={undefined} adapters={adapters}
        installUrl={installUrl()} now={new Date().toISOString()}
        initialError={initialError} backQuery={backQuery} closeMode={closeMode} />
    }>
      <RepoLoader adapters={adapters} initialError={initialError} backQuery={backQuery} closeMode={closeMode} />
    </Suspense>
  );
}

async function RepoLoader({
  adapters,
  initialError,
  backQuery,
  closeMode,
}: {
  adapters: AdapterChoice[];
  initialError: string | undefined;
  backQuery: { q?: string };
  closeMode: "back" | "list";
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
      pending={"pending" in listed && listed.pending}
      adapters={adapters}
      installUrl={installUrl()}
      /** ⚠️ **"지금"을 서버가 한 번 만든다** — 클라이언트에서 만들면 hydration이 어긋난다. */
      now={new Date().toISOString()}
      initialError={initialError}
      backQuery={backQuery}
      closeMode={closeMode}
    />
  );
}

/**
 * 설치 **설정** 주소. `GITHUB_APP_SLUG`는 `optionalEnv`라 **없으면 `null`이고**, 그때 ①은 설치 버튼을 세우지
 * 않고 관리자에게 요청하라고 말한다 — 세우면 시작 Action이 항상 `unavailable`로 실패한다.
 */
function installUrl(): string | null {
  return installationSettingsUrl(optionalEnv("GITHUB_APP_SLUG"));
}
