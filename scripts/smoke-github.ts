/**
 * GitHub App 설정이 실제로 동작하는지 확인한다. **읽기만 한다.**
 *
 * `pnpm test` 밖에 두는 이유: 실 API를 부르므로 네트워크·자격증명이 없으면 실패하고, 그건
 * 테스트 스위트가 판정할 성질이 아니다. 대신 0단계(App 생성·설치·env·`Project` 컬럼) 설정이
 * 틀렸을 때 **어느 값이 틀렸는지**를 알려준다.
 *
 * 사용: `pnpm smoke:github [<project-slug>]`
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";
import { adapterFor } from "../lib/adapters/index";
import { requireEnv } from "../lib/env";
import { createGitClient, probeRepo } from "../lib/github";
import { formatFromProject, resolveLocalePaths } from "../lib/pull/plan";
import { syncBranchFor } from "../lib/pull/trigger";

// .env.local을 명시적으로 읽는다 — dotenv 기본값은 `.env`이고 이 프로젝트의 시크릿은
// Next.js 관례에 따라 `.env.local`에 있다. 경로를 안 주면 값이 undefined가 되고 원인을 오진한다.
config({ path: ".env.local" });

/**
 * `lib/db.ts`를 쓰지 않는다 — 그 파일의 `server-only`가 tsx 스크립트를 막는다
 * (ARCHITECTURE §5.5.4). 런타임 URL 규칙(6543 pooler + `?pgbouncer=true`)은 `DATABASE_URL`이
 * 그대로 들고 있으므로 여기서 재현할 것이 없다.
 */
function createPrisma(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv("DATABASE_URL") }),
  });
}

async function main(): Promise<void> {
  const slug = process.argv[2] ?? requireEnv("ACTIVE_PROJECT_SLUG");
  const prisma = createPrisma();

  try {
    const project = await prisma.project.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        repoOwner: true,
        repoName: true,
        baseBranch: true,
        installationId: true,
        adapterName: true,
        pathTemplate: true,
        nested: true,
        nestedByPath: true,
        baseLocale: true,
        lastCommitSha: true,
      },
    });
    if (!project) throw new Error(`프로젝트를 찾을 수 없다: ${slug}`);
    if (project.installationId === null) {
      throw new Error(`Project.installationId가 비어 있다 (${slug}) — App을 설치하고 값을 채운다`);
    }

    const locales = await prisma.locale.findMany({
      where: { projectId: project.id },
      select: { code: true, orphaned: true },
    });

    console.log(`프로젝트: ${project.slug} → ${project.repoOwner}/${project.repoName}@${project.baseBranch}`);
    console.log(`어댑터: ${project.adapterName} (${project.pathTemplate})`);
    // orphaned를 함께 찍는다 — pull이 그 로케일을 건너뛰는 이유가 로그에 없으면 오진한다.
    console.log(
      `로케일: ${locales.map((l) => `${l.code}${l.orphaned ? "(orphaned)" : ""}`).join(", ")} (base ${project.baseLocale})`,
    );

    // ⚠️ **I/O 껍데기에는 스모크를 만든다** (POSTMORTEM 2026-09-01 — 이중 인코딩의 조용한 404를
    // 잡은 것이 이것뿐이었다). `probeRepo`는 App JWT 조회 하나가 더 있어 단위 테스트가 원리적으로
    // 못 보는 층이고, 여기서 저장된 `installationId`와 실제 설치가 갈렸는지도 함께 드러난다.
    const probe = await probeRepo(project.repoOwner, project.repoName);
    if (probe.status === "ok") {
      const same = probe.installationId === project.installationId;
      console.log(
        `probeRepo: ok — ${probe.fullName} / installation ${probe.installationId}` +
          (same ? "" : ` ⚠️ DB=${project.installationId} (재연결 필요)`),
      );
    } else {
      // `not-installed`와 `error`를 가려 찍는다 — 접으면 장애가 "제거됨"으로 읽힌다 (design §3.3).
      console.log(`probeRepo: ${probe.status}`);
    }

    const client = await createGitClient(
      project.repoOwner,
      project.repoName,
      project.installationId,
    );

    const headSha = await client.getRefSha(`heads/${project.baseBranch}`);
    if (headSha === null) throw new Error(`base 브랜치가 없다: ${project.baseBranch}`);
    console.log(`\nbase head: ${headSha}`);
    if (project.lastCommitSha !== null) {
      const same = headSha === project.lastCommitSha;
      console.log(`lastCommitSha 일치: ${same ? "예" : `아니오 (DB=${project.lastCommitSha})`}`);
    }

    const tree = await client.getTree(headSha);
    console.log(`트리 blob: ${tree.length}개`);

    const format = formatFromProject(
      project,
      locales.map((l) => l.code),
    );
    const { layout } = adapterFor(format);
    const paths = resolveLocalePaths(
      format,
      layout,
      tree.map((t) => t.path),
    );
    console.log(`\n로케일 파일 ${paths.length}개 (${layout}):`);
    for (const p of paths) {
      const blob = tree.find((t) => t.path === p.path);
      console.log(`  ${p.path} ${blob ? blob.sha.slice(0, 8) : "(base에 없음 — 신규)"}`);
    }

    // **어댑터 종류와 무관하게 원본을 읽는다** — 수술적은 write에 필수이고, 재생성은 표현
    // (들여쓰기)을 거기서 읽는다. 실제로 읽히는지 첫 파일로 확인한다.
    const first = paths[0];
    if (first !== undefined) {
      const blob = tree.find((t) => t.path === first.path);
      if (blob) {
        const text = await client.getBlobText(blob.sha);
        console.log(`\n원본 읽기 확인: ${first.path} — ${text.split("\n").length}줄`);
      }
    }

    // sync 브랜치의 부재는 정상이다 — 첫 실행 경로(createRef)를 태운다. 이름은 프로젝트별이라 생성 함수로
    // 만든다 — 옛 상수 `l10n/sync`를 읽으면 항상 "없음"이다 (Codex 감사 2026-09-06 #8).
    const syncBranch = syncBranchFor(project.slug);
    const syncSha = await client.getRefSha(`heads/${syncBranch}`);
    console.log(`\n${syncBranch}: ${syncSha ?? "없음 (첫 실행 경로)"}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("실패:", error instanceof Error ? error.message : error);
  // ⚠️ process.exit()을 쓰지 않는다 — 파이프로 나가는 stdout이 잘린다 (POSTMORTEM 2026-08-31).
  process.exitCode = 1;
});
