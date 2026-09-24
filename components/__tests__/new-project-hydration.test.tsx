// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/projects/new",
}));
vi.mock("@/app/(edit)/projects/actions", () => ({}));

import { NewProject } from "@/components/onboarding/new-project";
import { ProjectList } from "@/components/projects/project-list";
import type { ProjectListRow } from "@/lib/keys/query";

/**
 * **`/projects/new` 전체 로드의 본문이 하이드레이션에서 어긋나지 않는다** (malmoi#105 조사).
 *
 * 증상은 SSR 목록 → 하이드레이션 순간 목록 골격 ~1초 → 목록 + 모달이었다. React 19는 Suspense 경계 안에서 불일치가 나면
 * 그 경계를 **클라이언트 렌더**로 바꾸고, 그 렌더가 청크를 기다리면 가장 가까운 폴백(`(list)/loading.tsx`)이 선다 — 그
 * 가설을 여기서 배제한다. 경계 안의 클라이언트 두 개(U4가 클라이언트로 바꾼 `ProjectList` · 모달의 Suspense 폴백인 `NewProject`)를
 * 서버 문자열로 그린 뒤 같은 값으로 `hydrateRoot`하고 `onRecoverableError`를 센다.
 *
 * ⚠️ **"0건"만 단언하지 않는다** (POSTMORTEM 2026-09-14) — 같은 탐침이 의도적 불일치를 잡는지 짝으로 잰다.
 */
const BASE: ProjectListRow = {
  image: null, slug: "admin-console", name: "admin-console", role: "OWNER", installationId: "i",
  surfaces: [{ archivedAt: null, lastCommitSha: "s" }], archivedAt: null, repoOwner: "day1company", repoName: "admin-console",
  repositoryId: "9001", memberCount: 6, baseBranch: "main", lastPrUrl: null, reviewSurfaceSlug: null, unsentSurfaceSlug: null,
  repoAheadFrom: null, meters: [], review: 0, unsent: 0, openPr: null, repoAheadFiles: 0, importError: null, importing: false,
};

async function hydrate(server: React.ReactElement, client: React.ReactElement): Promise<unknown[]> {
  const host = document.createElement("div");
  host.innerHTML = renderToString(server);
  document.body.appendChild(host);
  const errors: unknown[] = [];
  await act(async () => {
    hydrateRoot(host, client, { onRecoverableError: (error) => errors.push(error) });
  });
  return errors;
}

afterEach(() => {
  document.body.innerHTML = "";
});

it("목록 + 모달 폴백을 서버와 같은 값으로 hydrate하면 복구 오류가 0이다", async () => {
  const body = (
    <main>
      <ProjectList all={[BASE, { ...BASE, slug: "old", name: "old", archivedAt: new Date("2026-09-01T00:00:00Z") }]} />
      <NewProject repos={undefined} listError={undefined} adapters={[]} installUrl={null} now="2026-09-25T00:00:00.000Z"
        initialError={undefined} backQuery={{}} closeMode="list" />
    </main>
  );
  expect((await hydrate(body, body)).map(String)).toEqual([]);
});

it("짝 — 같은 탐침이 의도적 불일치는 잡는다", async () => {
  const errors = await hydrate(<main><ProjectList all={[BASE]} /></main>, <main><ProjectList all={[{ ...BASE, name: "renamed" }]} /></main>);
  expect(errors.length).toBeGreaterThan(0);
});
