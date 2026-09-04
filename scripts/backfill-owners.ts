/**
 * 기존 `Project`에 OWNER를 채운다. **일회성이고, 인가 전환 앞의 필수 단계다.**
 *
 * ⚠️ 이걸 빠뜨린 채 tenant-auth §5(인가 전환)를 배포하면 **아무도 어느 프로젝트에도 못 들어간다** —
 * fail-closed라 그렇게 되는 것이 옳지만 복구가 SQL이다 (design §5 배포 순서 2).
 *
 * ⚠️ **`User`만 만들면 안 된다.** 이메일이 같은 `User`가 있고 그 provider의 `Account`가 없으면
 * Auth.js 어댑터가 첫 GitHub 로그인을 `OAuthAccountNotLinked`로 **거부한다**
 * (`@auth/core`의 handle-login). 그래서 `Account`까지 함께 만든다 — 그러면 로그인이 기존 User에 붙는다.
 *
 * 판정은 전부 `lib/auth/backfill.ts`가 한다(`pnpm test`가 고정). 이 파일은 I/O 껍데기다.
 *
 * ```
 * pnpm tsx scripts/backfill-owners.ts --owner-email <검증된 이메일> --owner-github-id <숫자 id>
 *                                     [--owner-name <이름>] [--target dev|prod] [--apply]
 * ```
 *
 * **기본은 dev이고 기본은 dry-run이다.** id·이메일은 `gh api user`로 얻는다 —
 * 이 스크립트는 GitHub을 부르지 않는다(네트워크 자격증명을 하나 더 요구하지 않으려는 것).
 *
 * ⚠️ **prod 시퀀스**: `pnpm db:deploy` → `pnpm db:status:prod` → 이 스크립트 `--target prod`
 * (dry-run 확인) → `--apply` → `/merge`. ①이 ③보다 먼저다 — backfill이 `ProjectMember` 테이블을 요구한다.
 *
 * ⚠️ **tenant-auth §8에서 이 파일과 `lib/auth/backfill.ts`를 지운다.** 일회성 코드가 남으면
 * 다음 사람이 그것을 정상 경로로 읽는다.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

import { PrismaClient } from "../generated/prisma/client";
import { backfillReport, planOwnerBackfill, resolveBackfillOptions } from "../lib/auth/backfill";
import { requireEnv } from "../lib/env";

// .env.local을 명시적으로 읽는다 — dotenv 기본값은 `.env`다 (`scripts/smoke-github.ts`와 같은 이유).
config({ path: ".env.local" });

async function main(): Promise<void> {
  const options = resolveBackfillOptions(process.argv.slice(2));

  // `lib/db.ts`를 쓰지 않는다 — 그 파일의 `server-only`가 tsx를 막고, 그쪽은 `DATABASE_URL`(6543)
  // 하나만 안다. 여기는 dev/prod 양쪽을 겨눠야 해서 URL을 직접 고른다.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv(options.envVar) }),
  });

  const mode = options.apply ? "APPLY" : "dry-run";
  console.log(`[backfill] target=${options.target} (${options.envVar}) mode=${mode}`);
  console.log(`[backfill] owner=${options.owner.email} github-id=${options.owner.githubId}`);

  try {
    // ⚠️ **"모든 DB 쿼리는 projectId로 좁힌다"(CLAUDE.md)의 의도적 예외다.** 그 규칙이 막는 것은
    // 테넌트 간 누출인데, 이 스크립트의 일 자체가 **전 프로젝트를 훑어 빠진 OWNER를 찾는 것**이라
    // 좁힐 대상이 없다. 사용자 요청 경로가 아니라 운영자가 손으로 돌리는 일회성 DML이고,
    // 결과는 화면이 아니라 stdout으로만 나간다. **이 패턴을 앱 코드로 복사하지 않는다.**
    const projects = await prisma.project.findMany({ select: { id: true, slug: true } });
    const members = await prisma.projectMember.findMany({ select: { projectId: true, role: true } });

    if (!options.apply) {
      // dry-run은 **User를 만들지 않으므로** 아직 userId가 없다. 계획을 세우는 데 필요한 것은
      // "OWNER가 없는 프로젝트가 어느 것인가"뿐이라 자리표시자를 넣는다.
      const planned = planOwnerBackfill({ projects, members, ownerUserId: "<dry-run>" });
      report(false, projects, planned.map((r) => r.projectId));
      return;
    }

    // upsert 셋을 한 트랜잭션으로 — 중간에 끊기면 `User`만 있고 `Account`가 없는 상태가 남고,
    // 그 상태가 정확히 첫 로그인을 `OAuthAccountNotLinked`로 거부하는 모양이다.
    const plannedIds = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: options.owner.email },
        create: { email: options.owner.email, name: options.owner.name ?? null },
        // 이름만 갱신한다 — 이메일은 키이고, 다른 컬럼을 덮으면 그 사이의 로그인이 쓴 값을 잃는다.
        update: options.owner.name === undefined ? {} : { name: options.owner.name },
        select: { id: true },
      });

      await tx.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: "github",
            providerAccountId: options.owner.githubId,
          },
        },
        create: {
          userId: user.id,
          type: "oauth",
          provider: "github",
          providerAccountId: options.owner.githubId,
        },
        // 토큰 컬럼은 건드리지 않는다 — 로그인이 채우는 값이고 여기서 비우면 지운 것이 된다.
        update: {},
      });

      const rows = planOwnerBackfill({ projects, members, ownerUserId: user.id });
      for (const row of rows) {
        // 멱등은 판정이 이미 보장하지만(있는 OWNER는 계획에 안 든다) upsert로 이중으로 막는다 —
        // 소유자가 이미 EDITOR로 들어 있는 프로젝트는 여기서 역할이 OWNER로 올라간다.
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: row.projectId, userId: row.userId } },
          create: row,
          update: { role: row.role },
        });
      }
      return rows.map((r) => r.projectId);
    });

    report(true, projects, plannedIds);
  } finally {
    await prisma.$disconnect();
  }
}

/** 문구 판정은 `backfillReport`가 한다(테스트가 고정) — 여기는 찍기만 한다. */
function report(
  apply: boolean,
  projects: readonly { id: string; slug: string }[],
  changed: readonly string[],
): void {
  const bySlug = new Map(projects.map((p) => [p.id, p.slug]));
  const lines = backfillReport({
    apply,
    projectCount: projects.length,
    changedSlugs: changed.map((id) => bySlug.get(id) ?? id),
  });
  for (const line of lines) console.log(`[backfill] ${line}`);
}

// 실패를 삼키지 않는다 — 종료 코드로 드러낸다.
main().catch((error: unknown) => {
  console.error(`[backfill] 실패: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
