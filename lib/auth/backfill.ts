import { flagValue, hasFlag } from "../cli/args";
import { fail } from "../failure";
import { normalizeEmail } from "./email";
import type { Role } from "./permission";

/**
 * 기존 `Project`에 OWNER를 채우는 **일회성** 판정 (design §5 배포 순서 2).
 *
 * ⚠️ 이 backfill을 빠뜨린 채 인가 전환을 배포하면 **아무도 어느 프로젝트에도 못 들어간다** —
 * fail-closed라 그렇게 되는 것이 옳지만 복구가 SQL이다.
 *
 * **멱등성이 여기서 결정된다.** 스크립트를 두 번 돌려 행 수를 세는 수동 확인 대신 `pnpm test`가
 * 판정한다 — 스크립트는 이 결과를 upsert하는 I/O 껍데기다.
 *
 * ⚠️ **인가 전환이 끝나면 이 파일과 스크립트를 지운다** (tasks §8). 일회성 코드가 남으면
 * 다음 사람이 그것을 정상 경로로 읽는다.
 */

export type BackfillRow = { projectId: string; userId: string; role: "OWNER" };

/**
 * @param members 판정에 필요한 것만 받는다 — "이 프로젝트에 OWNER가 있나"뿐이라 `userId`가 없다.
 *
 * **소유자가 이미 EDITOR로 들어 있는 프로젝트에도 행을 낸다.** `@@unique([projectId, userId])`가
 * 있으므로 스크립트의 upsert가 역할을 OWNER로 올린다 — OWNER 없는 프로젝트를 남기는 것보다 낫다.
 */
export function planOwnerBackfill(input: {
  projects: readonly { id: string }[];
  members: readonly { projectId: string; role: Role }[];
  ownerUserId: string;
}): BackfillRow[] {
  const { projects, members, ownerUserId } = input;

  // ⚠️ **빈 결과로 접지 않고 던진다.** 빈 배열을 내면 스크립트가 "채울 프로젝트가 없다"로 읽고
  // 성공을 보고한다 — POSTMORTEM 2026-09-03의 "실패한 조회를 없음으로 읽었다"와 같은 모양이다.
  // 더 나쁜 것은 스크립트가 `User`까지 upsert한다는 것이다: 빈 id가 통과하면 **빈 id의 User가
  // 모든 프로젝트의 OWNER가 된다.** `gh api user`가 실패한 채 넘어오는 경로가 실재한다.
  // `syncBranchFor`(lib/pull/trigger.ts)가 같은 이유로 값 대신 던진다.
  if (ownerUserId.trim() === "") fail("backfill 소유자의 User id가 비어 있다");

  const owned = new Set(members.filter((m) => m.role === "OWNER").map((m) => m.projectId));

  // 입력 순서를 그대로 따른다 — 같은 입력이 같은 순서를 내야 dry-run 출력을 사람이 대조할 수 있다.
  return projects
    .filter((p) => !owned.has(p.id))
    .map((p) => ({ projectId: p.id, userId: ownerUserId, role: "OWNER" as const }));
}

/** 어느 DB를 겨누는가. **기본은 dev이고, prod는 명시해야 간다.** */
export type BackfillTarget = "dev" | "prod";

export type BackfillOptions = {
  target: BackfillTarget;
  /** 접속 URL이 들어 있는 환경변수 이름. 값은 껍데기가 읽는다(모듈 최상위 평가 금지). */
  envVar: "DIRECT_URL" | "DIRECT_URL_PROD";
  /** false면 만들 행을 출력만 한다. */
  apply: boolean;
  owner: { email: string; githubId: string; name: string | undefined };
};

/**
 * 스크립트 인자 → 실행 계획. **이 판정이 틀리면 프로덕션 DB에 쓴다.**
 *
 * ⚠️ **위험한 쪽은 전부 명시를 요구한다**: 기본이 dev이고 기본이 dry-run이다. 모르는 `--target`은
 * **던진다** — 조용히 dev로 떨어뜨리면 "prod에 돌렸다고 믿었는데 안 돌아간" 상태가 되고, 그건
 * 실패를 "해당 없음"으로 읽는 것과 같다 (POSTMORTEM 2026-09-03).
 *
 * ⚠️ **prod는 `DIRECT_URL_PROD`(5432 session)다.** 런타임 URL(`DATABASE_URL_PROD`)은 **존재하지
 * 않는다** — 로컬 코드가 프로덕션을 가리킬 길을 열지 않는 규칙이고(CLAUDE.md), backfill은 런타임이
 * 아니라 마이그레이션과 같은 성질의 일회성 DML이라 이 예외가 성립한다.
 *
 * @param argv `process.argv.slice(2)`.
 */
export function resolveBackfillOptions(argv: readonly string[]): BackfillOptions {
  const rawTarget = hasFlag(argv, "--target") ? flagValue(argv, "--target") : "dev";
  if (rawTarget !== "dev" && rawTarget !== "prod") {
    fail(`--target은 dev 또는 prod다: ${JSON.stringify(rawTarget)}`);
  }

  const email = normalizeEmail(flagValue(argv, "--owner-email") ?? "");
  // 빈 값으로 User를 만들면 그 행이 전 프로젝트의 OWNER가 되고 되돌리는 경로가 SQL뿐이다.
  if (email === "") fail("--owner-email이 필요하다 (gh api user의 검증된 이메일)");

  const githubId = (flagValue(argv, "--owner-github-id") ?? "").trim();
  // 숫자만 받는다 — 핸들(`SinhyeokKang`)을 넘기는 실수가 흔하고, 그러면 Account가 엉뚱한
  // providerAccountId로 만들어져 첫 로그인이 OAuthAccountNotLinked가 된다.
  if (!/^[0-9]+$/.test(githubId)) {
    fail(`--owner-github-id는 GitHub 숫자 id다 (핸들이 아니다): ${JSON.stringify(githubId)}`);
  }

  const name = flagValue(argv, "--owner-name");

  return {
    target: rawTarget,
    envVar: rawTarget === "prod" ? "DIRECT_URL_PROD" : "DIRECT_URL",
    apply: hasFlag(argv, "--apply"),
    owner: { email, githubId, name },
  };
}
