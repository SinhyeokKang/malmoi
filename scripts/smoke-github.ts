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
import { createGitClient } from "../lib/github";
import { formatFromProject, resolveLocalePaths } from "../lib/pull/plan";

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
      select: { code: true },
    });

    console.log(`프로젝트: ${project.slug} → ${project.repoOwner}/${project.repoName}@${project.baseBranch}`);
    console.log(`어댑터: ${project.adapterName} (${project.pathTemplate})`);
    console.log(`로케일: ${locales.map((l) => l.code).join(", ")} (base ${project.baseLocale})`);

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
    const { layout, writeStrategy } = adapterFor(format);
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

    // 수술적 치환 어댑터는 write에 원본이 필요하다. 실제로 읽히는지 첫 파일로 확인한다.
    // ⚠️ `layout`이 아니라 `writeStrategy`다 — yaml-catalog·code-dict가 per-locale + surgical이다.
    const first = paths[0];
    if (writeStrategy === "surgical" && first !== undefined) {
      const blob = tree.find((t) => t.path === first.path);
      if (blob) {
        const text = await client.getBlobText(blob.sha);
        console.log(`\n원본 읽기 확인: ${first.path} — ${text.split("\n").length}줄`);
      }
    }

    // `l10n/sync`의 부재는 정상이다 — 첫 실행 경로(createRef)를 태운다.
    const syncSha = await client.getRefSha("heads/l10n/sync");
    console.log(`\nl10n/sync: ${syncSha ?? "없음 (첫 실행 경로)"}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("실패:", error instanceof Error ? error.message : error);
  // ⚠️ process.exit()을 쓰지 않는다 — 파이프로 나가는 stdout이 잘린다 (POSTMORTEM 2026-08-31).
  process.exitCode = 1;
});
