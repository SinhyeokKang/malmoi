import { encodeUserFields, encodeInvitationEmail, decodeInvitation } from "@/lib/credentials/records";
import { lookupEmail } from "@/lib/credentials/storage";
import { vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/lib/auth/permission";

/**
 * 편집·인가 Action 테스트가 공유하는 메모리 DB.
 *
 * **한 벌만 둔다.** 흐름 테스트(`edit-flow`)와 인가 테스트가 각자 가짜를 들면 같은 저장 경로를
 * 서로 다른 모양으로 흉내 내게 되고, 그 차이가 곧 "테스트는 통과하는데 프로덕션은 다르다"가 된다
 * (`lib/survey/json-shape.ts`가 스캐너를 프로덕션에서 import하는 것과 같은 이유).
 *
 * 저장과 조회가 **같은 상태**를 본다 — 홉 사이에서 값이 사라지면 red다.
 */

// Seeds remain readable for authorization scenarios; delegate boundaries use encrypted rows.
function storedUser(user: UserSeed) {
  return { ...user, ...encodeUserFields(user.id, { name: user.name ?? null, ...(user.email === null ? {} : { email: user.email }) }) };
}
function storedInvitation(row: InvitationSeed) { return { ...row, ...encodeInvitationEmail(row.id, row.projectId, row.email) }; }

export type ProjectSeed = {
  id: string;
  slug: string;
  name?: string;
  installationId?: string | null;
  /**
   * ⚠️ **시드 프로젝트는 기본이 "적재 완료"다** (2026-09-07, T6). 번역 Action이 `planProjectReadiness`를
   * 지나므로 `null`이면 `not-ready`로 거부된다 — 편집 흐름 테스트가 보려는 것은 그것이 아니다.
   * 첫 적재 전 상태를 보려면 **명시적으로 `null`을 준다**. `project.create`는 반대다: 스키마의 기본값이
   * `null`이라 새 행은 `awaiting_first_sync`로 태어난다.
   */
  lastCommitSha?: string | null;
  /** 역행 409 판정의 비교 대상 — T3 테스트가 시드로 넣는다. */
  lastCommitAt?: Date | null;
  /** 기준 로케일 — `planBaseLocaleChange`의 `current`다 (6b-3). */
  baseLocale?: string | null;
  /** 기준 로케일 변경의 선언. `basePending`이 이것과 `baseLocale`을 견준다 (6b-3). */
  declaredBaseLocale?: string | null;
  /** 프로젝트별 push 토큰의 sha256 — `@unique`(NULL 여럿 허용)를 `create`가 흉내낸다. */
  pushTokenHash?: string | null;
  /** 보관 시각 (7단계). 값이 있으면 `planProjectAccess`가 `project:settings` 외 전부를 거부한다. */
  archivedAt?: Date | null;
};

/**
 * `SyncRun` 행 (7단계). **게이트가 이 두 조회에 걸려 있다** — `RUNNING` 최신 하나와
 * settled(`SUCCEEDED`|`SKIPPED`) 최신 하나.
 */
export type SyncRunSeed = {
  id: string;
  projectId: string;
  status: "RUNNING" | "SUCCEEDED" | "SKIPPED" | "FAILED";
  trigger?: "MANUAL" | "CRON";
  requestedBy?: string | null;
  startedAt: Date;
  finishedAt?: Date | null;
  errorCode?: string | null;
  prUrl?: string | null;
  changed?: number | null;
  warnings?: number;
};
/**
 * ⚠️ **`createdAt`이 optional이다** — 스키마가 `@default(now())`이므로 실 호출은 안 넘긴다. 시드가 안 주면
 * 결정적인 기준 시각을 준다: `loadMembers`가 "Joined …"를 내고 정렬 키로도 쓰므로, `undefined`를 두면
 * 정렬이 구현 정의가 되고 가짜가 실제보다 **관대**해진다 (하네스 자기검사 — POSTMORTEM 2026-09-06).
 */
export type MemberSeed = { projectId: string; userId: string; role: Role; createdAt?: Date };
/** ⚠️ `email`이 nullable이다 — 스키마가 그렇고(OAuth provider가 주소를 안 줄 수 있다), 페이크가
 *  스키마보다 좁으면 "이메일 없는 멤버" 갈래를 테스트가 만들 수 없다 (하네스 자기검사 — POSTMORTEM 2026-09-06). */
export type UserSeed = { id: string; email: string | null; name?: string | null };
export type InvitationSeed = {
  id: string;
  projectId: string;
  email: string;
  role: Role;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  invitedBy: string;
};

export type KeySeed = {
  id: string;
  projectId: string;
  key: string;
  sourceText: string;
  description: string | null;
  sortIndex: number | null;
  orphaned: boolean;
};

export type TranslationSeed = {
  keyId: string;
  localeCode: string;
  value: string;
  description: string | null;
  placeholders: unknown;
  needsReview: boolean;
  updatedBy: string | null;
  updatedAt: Date;
};

export type LocaleSeed = { projectId: string; code: string; isBase?: boolean; orphaned?: boolean };

/** `Account(provider: "github-app")`. 로그인용 `github` 행과 같은 테이블이라 provider로 갈린다. */
export type AccountSeed = {
  userId: string;
  provider: string;
  providerAccountId: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: number | null;
};

/** `loadPullState`가 읽는 포맷 컬럼들. 프로젝트마다 같아도 되는 값이다. */
const FORMAT = {
  repoOwner: "o",
  repoName: "r",
  baseBranch: "main",
  installationId: "1",
  adapterName: "json-catalog",
  pathTemplate: "i18n/{locale}.json",
  nested: false,
  nestedByPath: null,
  baseLocale: "en",
  /** 기준 로케일 변경의 선언 — 기본은 "대기 없음"이다 (`basePending`). 6b-3 테스트가 시드로 넣는다. */
  declaredBaseLocale: null as string | null,
  lastCommitSha: null as string | null,
  lastCommitAt: null as Date | null,
  lastPulledAt: null as Date | null,
  pushTokenHash: null as string | null,
  /**
   * ⚠️ **기본값이 null이 아니다** (7단계). "실패한 sync가 마지막 성공을 안 덮는다"(완료 조건 2)를
   * 재려면 덮일 값이 **있어야** 한다 — null이면 그 단언이 `undefined === undefined`로 항상 참이다.
   */
  lastPublishedAt: new Date("2026-09-01T00:00:00Z") as Date | null,
  lastPrUrl: "https://github.com/o/r/pull/7" as string | null,
  archivedAt: null as Date | null,
};

export type Seed = {
  projects?: ProjectSeed[];
  accounts?: AccountSeed[];
  members?: MemberSeed[];
  users?: UserSeed[];
  invitations?: InvitationSeed[];
  keys?: KeySeed[];
  locales?: LocaleSeed[];
  translations?: TranslationSeed[];
  syncRuns?: SyncRunSeed[];
};

/** 시드 프로젝트의 기본 `lastCommitSha` — "첫 적재가 끝났다"의 증거다 (`ProjectSeed` 주석). */
const SEEDED_SHA = "a".repeat(40);

export function createHarness(seed: Seed = {}) {
  const seededProjects = seed.projects ?? [{ id: "p1", slug: "acme", name: "Acme" }];
  /**
   * ⚠️ **프로젝트 행이 가변이다** (2026-09-06). 전에는 `project.update`가 `async () => ({})`라
   * 아무것도 바꾸지 않았고, 그러면 "인가된 projectId에만 저장한다"를 검사하는 테스트가 **항상 거부하는
   * Action에도 통과한다** — 거부만 보는 검증의 함정이다 (POSTMORTEM 2026-09-06). `FORMAT`을 행마다
   * 복제해 두고 update가 그것을 갱신한다.
   */
  const projects = seededProjects.map((p) => ({ ...FORMAT, lastCommitSha: SEEDED_SHA, ...p }));
  const accounts = (seed.accounts ?? []).map((a) => ({
    access_token: "token", refresh_token: "refresh", expires_at: null as number | null, ...a,
  }));
  // 시드가 `createdAt`을 안 주면 결정적인 값을 심는다 — 정렬·표시가 이 컬럼을 읽는다.
  const members = (seed.members ?? []).map((m, i) => ({
    createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
    ...m,
  }));
  const users = seed.users ?? [];
  const invitations = seed.invitations ?? [];
  const keys = seed.keys ?? [
    { id: "k-greet", projectId: "p1", key: "a.greet", sourceText: "Hello", description: null, sortIndex: 0, orphaned: false },
    { id: "k-bye", projectId: "p1", key: "a.bye", sourceText: "Bye", description: null, sortIndex: 1, orphaned: false },
  ];
  const locales = seed.locales ?? [
    { projectId: "p1", code: "en", isBase: true, orphaned: false },
    { projectId: "p1", code: "ko", isBase: false, orphaned: false },
  ];
  const translations = seed.translations ?? [];
  // 스키마 기본값을 시드가 안 준 자리에 채운다 — 가짜가 실제보다 좁으면 호출부의 null 처리가 검증되지 않는다.
  const syncRuns = (seed.syncRuns ?? []).map((r) => ({
    trigger: "MANUAL" as const,
    requestedBy: null as string | null,
    finishedAt: null as Date | null,
    errorCode: null as string | null,
    prUrl: null as string | null,
    changed: null as number | null,
    warnings: 0,
    ...r,
  }));

  // 저장마다 시각이 앞으로 간다 — pull의 1층 스킵 판정이 이 값 하나에 걸려 있다.
  let now = new Date("2026-09-03T00:00:00Z");
  const tick = () => {
    now = new Date(now.getTime() + 1000);
    return now;
  };

  const findProject = vi.fn(
    async (args: {
      where: { slug?: string; id?: string; pushTokenHash?: string | null };
      select?: { locales?: { where?: { orphaned?: boolean } } };
    }) => {
      // 실 Prisma는 unique where의 null을 PrismaClientValidationError로 거부한다 — 가짜도 던진다. 조용히 null을
      // 돌려주면 "미발급 프로젝트가 인증에 걸리는" fail-open을 테스트가 못 본다 (design §3.8).
      if ("pushTokenHash" in args.where && typeof args.where.pushTokenHash !== "string") {
        throw new Error("Argument `pushTokenHash` must not be null");
      }
      const found = projects.find(
        (p) =>
          (args.where.slug !== undefined && p.slug === args.where.slug) ||
          (args.where.id !== undefined && p.id === args.where.id) ||
          (typeof args.where.pushTokenHash === "string" && p.pushTokenHash === args.where.pushTokenHash),
      );
      if (found === undefined) return null;
      const onlyLive = args.select?.locales?.where?.orphaned === false;
      return {
        ...found,
        id: found.id,
        slug: found.slug,
        name: found.name ?? found.slug,
        locales: locales
          .filter((l) => l.projectId === found.id && (onlyLive ? l.orphaned !== true : true))
          .map((l) => ({ code: l.code, name: l.code, isBase: l.isBase ?? false, orphaned: l.orphaned ?? false })),
      };
    },
  );

  const findMember = vi.fn(
    async (args: { where: { projectId_userId: { projectId: string; userId: string } } }) => {
      const { projectId, userId } = args.where.projectId_userId;
      return members.find((m) => m.projectId === projectId && m.userId === userId) ?? null;
    },
  );

  /**
   * ⚠️ **`select`에 `project` 관계가 오면 그것을 붙여 준다** (`loadMemberships`). 안 붙이면 호출부가
   * `r.project.slug`에서 터지는데, 그건 가짜가 실제보다 **좁아서** 나는 실패라 프로덕션 신호가 아니다.
   * 반대로 아무 때나 붙이면 가짜가 실제보다 **관대**해진다 — 그래서 요청했을 때만 붙인다.
   */
  const findManyMembers = vi.fn(
    async (args: {
      where: { projectId?: string; userId?: string };
      select?: { role?: true; projectId?: true; userId?: true; createdAt?: true; project?: unknown; user?: unknown };
      orderBy?: { project?: { slug?: "asc" | "desc" }; createdAt?: "asc" | "desc" };
    }) => {
      const rows = members.filter(
        (m) =>
          (args.where.projectId === undefined || m.projectId === args.where.projectId) &&
          (args.where.userId === undefined || m.userId === args.where.userId),
      );

      // **정렬을 투영보다 먼저** 한다 — 뒤에 하면 `select` 결과에 정렬 키가 없어 원본 행을 따로 들고
      // 다녀야 하고, 그 임시 필드가 곧 "관대한 가짜"가 된다.
      const direction = args.orderBy?.project?.slug;
      const byCreated = args.orderBy?.createdAt;
      const sorted =
        direction !== undefined
          ? rows.slice().sort((a, b) => {
              const av = projects.find((p) => p.id === a.projectId)?.slug ?? "";
              const bv = projects.find((p) => p.id === b.projectId)?.slug ?? "";
              return direction === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
            })
          : byCreated !== undefined
            ? rows
                .slice()
                .sort(
                  (a, b) =>
                    (byCreated === "asc" ? 1 : -1) * (a.createdAt.getTime() - b.createdAt.getTime()),
                )
            : rows;
      /**
       * ⚠️ **`select`가 있으면 그 필드만 낸다** (2026-09-08 code-review 🟡6). 실제 Prisma가 그렇다 —
       * 원본 필드를 함께 내면 가짜가 실제보다 **관대**해져서, 호출부가 select 안 한 필드를 읽어도
       * 테스트는 green이고 프로덕션만 `undefined`가 된다 (POSTMORTEM 2026-09-05와 같은 형).
       */
      return sorted.map((m) => {
        if (args.select === undefined) return m;
        const projected: Record<string, unknown> = {};
        if (args.select.role === true) projected["role"] = m.role;
        if (args.select.projectId === true) projected["projectId"] = m.projectId;
        if (args.select.userId === true) projected["userId"] = m.userId;
        if (args.select.createdAt === true) projected["createdAt"] = m.createdAt;
        // 멤버 표가 이름·이메일을 보이므로 `user` 관계를 요청할 수 있다. **없는 사용자면 null이다** —
        // 시드가 사용자를 안 준 채 멤버를 만들 수 있고, 그때 가짜가 빈 객체를 내면 호출부의 null 처리가 검증되지 않는다.
        if (args.select.user !== undefined) {
          const user = users.find((u) => u.id === m.userId);
          projected["user"] = user === undefined ? null : storedUser(user);
        }
        if (args.select.project !== undefined) {
          const project = projects.find((p) => p.id === m.projectId);
          projected["project"] = {
            slug: project?.slug ?? "",
            name: project?.name ?? project?.slug ?? "",
            installationId: project?.installationId ?? null,
            lastCommitSha: project?.lastCommitSha ?? null,
          };
        }
        return projected as unknown as typeof m;
      });
    },
  );
  const createMember = vi.fn(async (args: { data: MemberSeed }) => {
    // 스키마의 `@@unique([projectId, userId])`를 흉내낸다 — 안 하면 가짜가 실제보다 관대해지고,
    // 그 차이가 곧 "테스트는 통과하는데 프로덕션은 던진다"가 된다.
    const clash = members.some(
      (m) => m.projectId === args.data.projectId && m.userId === args.data.userId,
    );
    if (clash) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    // 실 호출은 `createdAt`을 안 넘긴다 (`@default(now())`) — 가짜가 그 자리를 채워야 행 모양이 균일하고
    // `orderBy: { createdAt }`가 `undefined`를 비교하지 않는다.
    const row = { createdAt: new Date(), ...args.data };
    members.push(row);
    return row;
  });

  const updateMember = vi.fn(
    async (args: {
      where: { projectId_userId: { projectId: string; userId: string } };
      data: { role: Role };
    }) => {
      const { projectId, userId } = args.where.projectId_userId;
      const row = members.find((m) => m.projectId === projectId && m.userId === userId);
      if (row === undefined) throw new Error("member not found");
      row.role = args.data.role;
      return row;
    },
  );

  const deleteManyMembers = vi.fn(
    async (args: { where: { projectId: string; userId: string } }) => {
      const before = members.length;
      for (let i = members.length - 1; i >= 0; i -= 1) {
        const m = members[i];
        if (m !== undefined && m.projectId === args.where.projectId && m.userId === args.where.userId) {
          members.splice(i, 1);
        }
      }
      return { count: before - members.length };
    },
  );

  const updateManyMembers = vi.fn(
    async (args: { where: { projectId: string; userId: string }; data: { role: Role } }) => {
      const matched = members.filter(
        (m) => m.projectId === args.where.projectId && m.userId === args.where.userId,
      );
      for (const m of matched) m.role = args.data.role;
      return { count: matched.length };
    },
  );

  const deleteMember = vi.fn(
    async (args: { where: { projectId_userId: { projectId: string; userId: string } } }) => {
      const { projectId, userId } = args.where.projectId_userId;
      const at = members.findIndex((m) => m.projectId === projectId && m.userId === userId);
      if (at === -1) throw new Error("member not found");
      const [removed] = members.splice(at, 1);
      return removed;
    },
  );

  const findInvitation = vi.fn(async (args: { where: { tokenHash?: string; id?: string } }) => {
    const row = invitations.find(i =>
      (args.where.tokenHash !== undefined && i.tokenHash === args.where.tokenHash) ||
      (args.where.id !== undefined && i.id === args.where.id));
    return row ? storedInvitation(row) : null;
  });
  const createInvitationRow = vi.fn(async (args: { data: InvitationSeed & { emailLookup: string } }) => {
    const row = decodeInvitation(args.data);
    invitations.push(row);
    return args.data;
  });

  /** 단일 사용의 근거다 — 두 번째 수락은 `acceptedAt: null` 조건에 걸려 count 0이 된다. */
  const updateManyInvitations = vi.fn(
    async (args: {
      where: { id?: string; projectId?: string; email?: string; emailLookup?: string; acceptedAt?: null; expiresAt?: { gt: Date; equals?: Date } };
      data: { acceptedAt?: Date; expiresAt?: Date };
    }) => {
      const matched = invitations.filter(
        (i) =>
          (args.where.id === undefined || i.id === args.where.id) &&
          (args.where.projectId === undefined || i.projectId === args.where.projectId) &&
          (args.where.email === undefined || i.email === args.where.email) &&
          (args.where.emailLookup === undefined || lookupEmail(i.email, i.projectId) === args.where.emailLookup) &&
          (args.where.acceptedAt === undefined || i.acceptedAt === null) &&
          (args.where.expiresAt === undefined || (i.expiresAt.getTime() > args.where.expiresAt.gt.getTime() && (args.where.expiresAt.equals === undefined || i.expiresAt.getTime() === args.where.expiresAt.equals.getTime()))),
      );
      for (const row of matched) Object.assign(row, args.data);
      return { count: matched.length };
    },
  );

  // `projectId`(마지막 OWNER 보호)와 `userId`(사용자당 프로젝트 3개 제한 — OWNER 행만 센다) 둘 다 받는다.
  /**
   * ⚠️ **`project: { archivedAt: null }`을 실제로 본다** (7단계). 무시하면 "보관이 `PROJECT_LIMIT`
   * 슬롯을 비운다"(design 결정 10)가 **무엇을 넣어도 통과한다** — 가짜가 실제보다 관대한 부류다
   * (POSTMORTEM 2026-09-06 하네스 자기검사).
   */
  const countMembers = vi.fn(
    async (args: {
      where: { projectId?: string; userId?: string; role?: Role; project?: { archivedAt?: Date | null } };
    }) =>
      members.filter((m) => {
        if (args.where.projectId !== undefined && m.projectId !== args.where.projectId) return false;
        if (args.where.userId !== undefined && m.userId !== args.where.userId) return false;
        if (args.where.role !== undefined && m.role !== args.where.role) return false;
        if (args.where.project?.archivedAt !== undefined) {
          const project = projects.find((p) => p.id === m.projectId);
          if ((project?.archivedAt ?? null) !== args.where.project.archivedAt) return false;
        }
        return true;
      }).length,
  );

  const updateProject = vi.fn(
    async (args: { where: { id?: string; slug?: string }; data: Record<string, unknown> }) => {
      const row = projects.find(
        (p) =>
          (args.where.id !== undefined && p.id === args.where.id) ||
          (args.where.slug !== undefined && p.slug === args.where.slug),
      );
      // 없는 행을 조용히 통과시키지 않는다 — 실 Prisma는 P2025로 던진다.
      if (row === undefined) throw Object.assign(new Error("Record to update not found"), { code: "P2025" });
      Object.assign(row, args.data);
      return row;
    },
  );

  /**
   * 온보딩의 `createProject`가 부른다. 스키마의 `slug @unique`·`pushTokenHash @unique`를 흉내낸다 — 안 하면
   * slug 충돌·토큰 조회 경로를 **재현할 수조차 없다** (POSTMORTEM 2026-09-05). NULL은 unique에 걸리지 않는다.
   */
  const createProject = vi.fn(async (args: { data: Omit<ProjectSeed, "id"> & { id?: string } & Record<string, unknown> }) => {
    // `id @default(cuid())` — 실 호출은 id를 생략한다. 가짜가 undefined를 저장하면 이어지는 `projectMember.create({ projectId })`도
    // undefined가 되고 `findMember`의 대조가 `undefined === undefined`로 항상 참이다 (code-review 2026-09-07 🟡1).
    const id = args.data.id ?? `p-${projects.length + 1}`;
    const hash = args.data.pushTokenHash ?? null;
    const clash = projects.some(
      (p) => p.slug === args.data.slug || p.id === id || (hash !== null && p.pushTokenHash === hash),
    );
    if (clash) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const row = { ...FORMAT, ...args.data, id, pushTokenHash: hash };
    projects.push(row);
    return row;
  });

  /**
   * pull 순회용. `where`는 등호와 `{ not: X }`만 받는다 — 다른 연산자는 **던진다.** 조용히 빈 배열을 내면 순회
   * 테스트가 "프로젝트 0개"로 통과한다 (fake-client의 "주입 안 된 요청엔 던진다"와 같은 방침).
   */
  const findManyProjects = vi.fn(
    async (args: { where?: Record<string, unknown>; orderBy?: unknown } = {}) =>
      projects.filter((p) =>
        Object.entries(args.where ?? {}).every(([k, v]) => {
          const value = (p as Record<string, unknown>)[k];
          if (v === null || typeof v !== "object") return value === v;
          const keys = Object.keys(v);
          if (keys.length === 1 && keys[0] === "not") return value !== (v as { not: unknown }).not;
          throw new Error(`harness findMany: 지원하지 않는 where 연산자 ${k}: ${JSON.stringify(v)}`);
        }),
      ),
  );

  /** `Account`의 unique는 `@@id([provider, providerAccountId])` 하나뿐 — userId로는 findFirst다. */
  const findAccountUnique = vi.fn(
    async (args: { where: { provider_providerAccountId: { provider: string; providerAccountId: string } } }) => {
      const { provider, providerAccountId } = args.where.provider_providerAccountId;
      return accounts.find((a) => a.provider === provider && a.providerAccountId === providerAccountId) ?? null;
    },
  );

  const findAccountFirst = vi.fn(
    async (args: { where: { userId?: string; provider?: string } }) =>
      accounts.find(
        (a) =>
          (args.where.userId === undefined || a.userId === args.where.userId) &&
          (args.where.provider === undefined || a.provider === args.where.provider),
      ) ?? null,
  );

  const createAccount = vi.fn(async (args: { data: AccountSeed }) => {
    // 스키마의 복합 PK를 흉내낸다 — 안 하면 가짜가 실제보다 관대해 P2002 경로를 볼 수 없다.
    const clash = accounts.some(
      (a) => a.provider === args.data.provider && a.providerAccountId === args.data.providerAccountId,
    );
    if (clash) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const row = { access_token: "token", refresh_token: "refresh", expires_at: null as number | null, ...args.data };
    accounts.push(row);
    return row;
  });

  const updateAccount = vi.fn(
    async (args: {
      where: { provider_providerAccountId: { provider: string; providerAccountId: string } };
      data: Record<string, unknown>;
    }) => {
      const { provider, providerAccountId } = args.where.provider_providerAccountId;
      const row = accounts.find((a) => a.provider === provider && a.providerAccountId === providerAccountId);
      if (row === undefined) throw Object.assign(new Error("Record to update not found"), { code: "P2025" });
      Object.assign(row, args.data);
      return row;
    },
  );

  const updateManyAccounts = vi.fn(
    async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const matched = accounts.filter((a) =>
        Object.entries(args.where).every(([k, v]) => (a as Record<string, unknown>)[k] === v),
      );
      for (const row of matched) Object.assign(row, args.data);
      return { count: matched.length };
    },
  );

  const deleteAccount = vi.fn(
    async (args: { where: { provider_providerAccountId: { provider: string; providerAccountId: string } } }) => {
      const { provider, providerAccountId } = args.where.provider_providerAccountId;
      const at = accounts.findIndex((a) => a.provider === provider && a.providerAccountId === providerAccountId);
      if (at === -1) throw Object.assign(new Error("Record to delete does not exist"), { code: "P2025" });
      const [removed] = accounts.splice(at, 1);
      return removed;
    },
  );

  /**
   * ⚠️ **`userId`를 실제로 본다** (sec-audit 발견 15). 페이크가 그 조건을 무시하면 "남의 행이 남는다"는
   * 테스트가 무엇을 넣어도 통과한다 — 페이크가 스키마보다 느슨한 부류다 (POSTMORTEM 2026-09-06).
   */
  const deleteManyAccounts = vi.fn(async (args: { where: { userId: string; provider: string } }) => {
    const before = accounts.length;
    for (let i = accounts.length - 1; i >= 0; i -= 1) {
      const row = accounts[i]!;
      if (row.userId === args.where.userId && row.provider === args.where.provider) accounts.splice(i, 1);
    }
    return { count: before - accounts.length };
  });

  /** `SELECT … FOR UPDATE` 같은 잠금 SQL. 메모리 DB는 잠글 것이 없다 — 호출 인자만 남긴다. */
  const executeRaw = vi.fn(async (_strings: TemplateStringsArray, ..._values: unknown[]) => 0);

  const findUser = vi.fn(async (args: { where: { id?: string; emailLookup?: string } }) => {
    const row = users.find(u => (args.where.id !== undefined && u.id === args.where.id) ||
      (args.where.emailLookup !== undefined && u.email !== null && lookupEmail(u.email) === args.where.emailLookup));
    return row ? storedUser(row) : null;
  });

  /**
   * 트랜잭션 — **콜백이 던지면 되돌린다.** 실 DB는 롤백하는데 가짜가 안 하면 "판정 뒤 되돌린다"는
   * 코드(`changeMember`의 OWNER 재집계)를 재현할 수 없다 (POSTMORTEM 2026-09-05 — 가짜가 실제보다
   * 관대하면 결함을 볼 수조차 없다). 배열을 제자리에서 되돌린다 — 테스트가 같은 참조를 들고 있다.
   */
  const snapshot = <T extends object>(rows: T[]) => rows.map((r) => ({ ...r }));
  const restore = <T extends object>(rows: T[], snap: T[]) => rows.splice(0, rows.length, ...snap);
  const $transaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
    const saved = {
      members: snapshot(members),
      invitations: snapshot(invitations),
      translations: snapshot(translations),
      projects: snapshot(projects),
      accounts: snapshot(accounts),
      // ⚠️ **빠뜨리면 롤백 테스트가 공허하다** — 트랜잭션 안에서 만든 `RUNNING` 행이 예외 뒤에도
      // 남아 있는데 아무도 그것을 보지 않게 된다 (7단계).
      syncRuns: snapshot(syncRuns),
    };
    try {
      return await fn(prisma);
    } catch (error) {
      restore(members, saved.members);
      restore(invitations, saved.invitations);
      restore(translations, saved.translations);
      restore(projects, saved.projects);
      restore(accounts, saved.accounts);
      restore(syncRuns, saved.syncRuns);
      throw error;
    }
  };

  /**
   * ⚠️ **`acceptedAt: null`과 `expiresAt.gt`를 둘 다 본다** — 실제 술어가 그렇다
   * (`acceptedAt IS NULL AND expiresAt > now()`). 한쪽만 보는 가짜는 수락된 초대나 만료된 초대를
   * 목록에 남기고, 그게 "대기 중"으로 보이면 OWNER가 없는 링크를 기다린다.
   */
  const findManyInvitations = vi.fn(
    async (args: {
      where: { projectId: string; acceptedAt?: null; expiresAt?: { gt: Date; equals?: Date } };
      orderBy?: { email?: "asc" | "desc" };
    }) => {
      const rows = invitations.filter(
        (i) =>
          i.projectId === args.where.projectId &&
          (args.where.acceptedAt === undefined || i.acceptedAt === null) &&
          (args.where.expiresAt === undefined || (i.expiresAt.getTime() > args.where.expiresAt.gt.getTime() && (args.where.expiresAt.equals === undefined || i.expiresAt.getTime() === args.where.expiresAt.equals.getTime()))),
      );
      const sorted =
        args.orderBy?.email === undefined
          ? rows
          : rows.slice().sort((a, b) => (args.orderBy?.email === "desc" ? -1 : 1) * a.email.localeCompare(b.email));
      // `invitedByUser` 관계는 요청했을 때만 붙인다 — 아무 때나 붙이면 가짜가 실제보다 관대해진다.
      return sorted.map((i) => ({ ...storedInvitation(i), invitedByUser: (() => { const u = users.find(u => u.id === i.invitedBy); return u ? storedUser(u) : null; })() }));
    },
  );

  /**
   * `SyncRun` 델리게이트 (7단계).
   *
   * ⚠️ **`where.projectId`를 실제로 본다.** 무시하면 "다른 프로젝트의 실행이 내 것을 막지 않는다"가
   * **무엇을 넣어도 통과한다** — 게이트 전체가 그 좁힘 위에 서 있으므로 그때 이 하네스는 테넌트
   * 경계를 검사하지 못하는 것이 아니라 **검사한다고 거짓말한다** (POSTMORTEM 2026-09-06).
   */
  let syncRunSeq = 0;
  const createSyncRun = vi.fn(
    async (args: {
      data: {
        projectId: string;
        status: SyncRunSeed["status"];
        trigger: "MANUAL" | "CRON";
        requestedBy?: string | null;
      };
      select?: Record<string, true>;
    }) => {
      syncRunSeq += 1;
      const row = {
        id: `sr-${syncRunSeq}`,
        requestedBy: null as string | null,
        // 실제 컬럼이 `@default(now())`다 — 가짜가 안 채우면 `startedAt`이 undefined인 행이 생기고
        // stale 판정이 그 위에서 조용히 통과한다.
        //
        // ⚠️ **`tick()`이 아니라 벽시계다.** 하네스의 `tick`은 2026-09-03에서 출발하는 자체 시계인데,
        // 게이트는 `new Date()`와 이 값을 견준다 — 둘이 갈리면 방금 만든 행이 **며칠 전 것으로 보여
        // 곧바로 stale로 닫힌다.** 실제 DB의 `now()`도 앱과 같은 벽시계다.
        startedAt: new Date(),
        finishedAt: null as Date | null,
        errorCode: null as string | null,
        prUrl: null as string | null,
        changed: null as number | null,
        warnings: 0,
        ...args.data,
      };
      syncRuns.push(row);
      return projectFields(row, args.select);
    },
  );

  /** `status`는 등호와 `{ in: [...] }` 둘만 받는다 — 모르는 연산자는 던진다(조용한 빈 결과 금지). */
  const matchesSyncRun = (
    row: (typeof syncRuns)[number],
    where: { projectId: string; status?: unknown; startedAt?: { lt?: Date } },
  ): boolean => {
    if (row.projectId !== where.projectId) return false;
    if (where.status !== undefined) {
      if (typeof where.status === "string") {
        if (row.status !== where.status) return false;
      } else if (where.status !== null && typeof where.status === "object" && "in" in where.status) {
        const wanted = (where.status as { in: readonly string[] }).in;
        if (!wanted.includes(row.status)) return false;
      } else {
        throw new Error(`harness syncRun: 지원하지 않는 status 연산자 ${JSON.stringify(where.status)}`);
      }
    }
    if (where.startedAt?.lt !== undefined && !(row.startedAt.getTime() < where.startedAt.lt.getTime())) {
      return false;
    }
    return true;
  };

  const sortSyncRuns = (rows: typeof syncRuns, direction: "asc" | "desc" | undefined) =>
    direction === undefined
      ? rows
      : rows
          .slice()
          .sort((a, b) => (direction === "asc" ? 1 : -1) * (a.startedAt.getTime() - b.startedAt.getTime()));

  /** ⚠️ **`select`가 있으면 그 필드만 낸다** — 원본을 통째로 내면 가짜가 실제보다 관대해진다. */
  const projectFields = <T extends object>(row: T, select: Record<string, true> | undefined) => {
    if (select === undefined) return row;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select)) out[key] = (row as Record<string, unknown>)[key];
    return out;
  };

  const findFirstSyncRun = vi.fn(
    async (args: {
      where: { projectId: string; status?: unknown; startedAt?: { lt?: Date } };
      orderBy?: { startedAt?: "asc" | "desc" };
      select?: Record<string, true>;
    }) => {
      const row = sortSyncRuns(
        syncRuns.filter((r) => matchesSyncRun(r, args.where)),
        args.orderBy?.startedAt,
      )[0];
      return row === undefined ? null : projectFields(row, args.select);
    },
  );

  const findManySyncRuns = vi.fn(
    async (args: {
      where: { projectId: string; status?: unknown; startedAt?: { lt?: Date } };
      orderBy?: { startedAt?: "asc" | "desc" };
      take?: number;
      select?: Record<string, true>;
    }) => {
      const rows = sortSyncRuns(syncRuns.filter((r) => matchesSyncRun(r, args.where)), args.orderBy?.startedAt);
      const page = args.take === undefined ? rows : rows.slice(0, args.take);
      return page.map((r) => projectFields(r, args.select));
    },
  );

  /** ⚠️ `where`에 `projectId`가 함께 온다 — id를 알아도 남의 테넌트 행을 못 닫는다 (`revokeInvitation` 선례). */
  const updateSyncRun = vi.fn(
    async (args: { where: { id: string }; data: Record<string, unknown>; select?: Record<string, true> }) => {
      const row = syncRuns.find((r) => r.id === args.where.id);
      // 실 Prisma는 없는 행에 P2025로 던진다 — 조용히 넘기면 "행을 닫는다"가 검증되지 않는다.
      if (row === undefined) throw Object.assign(new Error("Record to update not found"), { code: "P2025" });
      Object.assign(row, args.data);
      return row;
    },
  );

  const updateManySyncRuns = vi.fn(
    async (args: {
      where: { projectId: string; status?: unknown; startedAt?: { lt?: Date } };
      data: Record<string, unknown>;
    }) => {
      const rows = syncRuns.filter((r) => matchesSyncRun(r, args.where));
      for (const row of rows) Object.assign(row, args.data);
      return { count: rows.length };
    },
  );

  const prisma = {
    $transaction,
    $executeRaw: executeRaw,
    syncRun: {
      create: createSyncRun,
      findFirst: findFirstSyncRun,
      findMany: findManySyncRuns,
      update: updateSyncRun,
      updateMany: updateManySyncRuns,
    },
    project: { findUnique: findProject, findMany: findManyProjects, create: createProject, update: updateProject },
    projectMember: {
      findUnique: findMember,
      findMany: findManyMembers,
      count: countMembers,
      create: createMember,
      update: updateMember,
      delete: deleteMember,
      deleteMany: deleteManyMembers,
      updateMany: updateManyMembers,
    },
    projectInvitation: {
      findUnique: findInvitation,
      findMany: findManyInvitations,
      create: createInvitationRow,
      updateMany: updateManyInvitations,
    },
    user: { findUnique: findUser },
    account: {
      findUnique: findAccountUnique,
      findFirst: findAccountFirst,
      create: createAccount,
      update: updateAccount,
      updateMany: updateManyAccounts,
      delete: deleteAccount,
      deleteMany: deleteManyAccounts,
    },
    stringKey: {
      findFirst: async ({ where }: { where: { id: string; projectId: string } }) =>
        keys.find((k) => k.id === where.id && k.projectId === where.projectId) ?? null,
      /**
       * 로케일별 진행률의 **분모** (6b-5). ⚠️ **`orphaned`를 실제로 본다** — 무시하면 코드에서
       * 사라진 키가 분모에 남아 진행률이 영구히 100%에 못 닿고, 그건 페이크가 스키마보다 느슨해
       * 아무 값이나 맞는 것처럼 보이는 부류다 (POSTMORTEM 2026-09-06 하네스 자기검사).
       */
      count: async ({ where }: { where: { projectId: string; orphaned?: boolean } }) =>
        keys.filter(
          (k) =>
            k.projectId === where.projectId &&
            (where.orphaned === undefined || (k.orphaned ?? false) === where.orphaned),
        ).length,
      findMany: async ({ where }: { where: { projectId: string } }) =>
        keys
          .filter((k) => k.projectId === where.projectId)
          .slice()
          .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
          .map((k) => ({
            ...k,
            translations: translations
              .filter((t) => t.keyId === k.id)
              .map((t) => ({
                localeCode: t.localeCode,
                value: t.value,
                description: t.description,
                placeholders: t.placeholders ?? null,
              })),
          })),
    },
    locale: {
      findUnique: async ({
        where,
      }: {
        where: { projectId_code: { projectId: string; code: string } };
      }) => {
        const row = locales.find(
          (l) =>
            l.projectId === where.projectId_code.projectId && l.code === where.projectId_code.code,
        );
        return row === undefined ? null : { code: row.code, orphaned: row.orphaned ?? false };
      },
    },
    translation: {
      findUnique: async ({
        where,
      }: {
        where: { keyId_localeCode: { keyId: string; localeCode: string } };
      }) =>
        translations.find(
          (t) =>
            t.keyId === where.keyId_localeCode.keyId &&
            t.localeCode === where.keyId_localeCode.localeCode,
        ) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { keyId_localeCode: { keyId: string; localeCode: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const at = tick();
        const found = translations.find(
          (t) =>
            t.keyId === where.keyId_localeCode.keyId &&
            t.localeCode === where.keyId_localeCode.localeCode,
        );
        if (found) {
          Object.assign(found, update, { updatedAt: at });
          return found;
        }
        const row = {
          keyId: where.keyId_localeCode.keyId,
          localeCode: where.keyId_localeCode.localeCode,
          value: "",
          description: null,
          placeholders: null,
          needsReview: false,
          updatedBy: null,
          ...create,
          updatedAt: at,
        } as TranslationSeed;
        translations.push(row);
        return row;
      },
      /**
       * ⚠️ **`projectId`로 좁힌다.** 시드의 번역 행은 `keyId`만 들지만 실제 테이블에는 `projectId`
       * 컬럼이 있다 — 키를 통해 되짚어 **같은 좁힘**을 흉내 낸다. 안 하면 `countUnpublished`의
       * 테넌트 좁힘을 이 하네스로는 판정할 수 없다 (POSTMORTEM 2026-09-06 하네스 자기검사).
       */
      count: async ({
        where,
      }: {
        where: {
          projectId: string;
          updatedBy?: { not: null };
          updatedAt?: { gt: Date };
        };
      }) => {
        const ids = new Set(keys.filter((k) => k.projectId === where.projectId).map((k) => k.id));
        return translations.filter((t) => {
          if (!ids.has(t.keyId)) return false;
          if (where.updatedBy !== undefined && t.updatedBy === null) return false;
          if (where.updatedAt !== undefined && !(t.updatedAt > where.updatedAt.gt)) return false;
          return true;
        }).length;
      },
      /**
       * 진행률의 **분자** (6b-5). 값이 있는 셀만 `{ localeCode, needsReview }`로 준다.
       *
       * ⚠️ **필터 둘을 실제로 적용한다.** `value: { not: "" }`를 무시하면 빈 값이 번역으로 세지고
       * (편집 UI에서 값을 지우면 빈 문자열 행이 남는다), `stringKey.orphaned`를 무시하면 죽은 키의
       * 번역이 분자에 들어가 **분모보다 커진다.** 둘 중 하나만 빠져도 이 집계 테스트가 통과하면서
       * 프로덕션에서 틀린 숫자를 낸다.
       */
      findMany: async ({
        where,
        select,
      }: {
        where: {
          projectId: string;
          value?: { not: string };
          stringKey?: { orphaned?: boolean };
        };
        select?: { localeCode?: boolean; needsReview?: boolean };
      }) => {
        const live = new Map(keys.filter((k) => k.projectId === where.projectId).map((k) => [k.id, k]));
        const rows = translations.filter((t) => {
          const key = live.get(t.keyId);
          if (key === undefined) return false;
          if (where.value !== undefined && t.value === where.value.not) return false;
          const wantOrphaned = where.stringKey?.orphaned;
          if (wantOrphaned !== undefined && (key.orphaned ?? false) !== wantOrphaned) return false;
          return true;
        });
        // ⚠️ `select` 밖의 필드를 흘리지 않는다 — 하네스가 관대하면 화면이 안 받은 값을 쓰게 된다.
        if (select === undefined) return rows;
        return rows.map((t) => ({
          ...(select.localeCode === true ? { localeCode: t.localeCode } : {}),
          ...(select.needsReview === true ? { needsReview: t.needsReview } : {}),
        }));
      },
      aggregate: async ({ where }: { where: { projectId: string } }) => {
        const ids = new Set(keys.filter((k) => k.projectId === where.projectId).map((k) => k.id));
        const rows = translations.filter((t) => ids.has(t.keyId));
        const max = rows.reduce<Date | null>(
          (m, t) => (m === null || t.updatedAt > m ? t.updatedAt : m),
          null,
        );
        return { _max: { updatedAt: max } };
      },
    },
  };

  return {
    prisma: prisma as unknown as PrismaClient,
    projects,
    members,
    users,
    invitations,
    keys,
    locales,
    translations,
    accounts,
    syncRuns,
    spies: {
      createSyncRun,
      findFirstSyncRun,
      findManySyncRuns,
      updateSyncRun,
      updateManySyncRuns,
      findProject,
      findManyProjects,
      createProject,
      updateProject,
      findAccountUnique,
      findAccountFirst,
      createAccount,
      updateAccount,
      updateManyAccounts,
      deleteAccount,
      deleteManyAccounts,
      findMember,
      findManyMembers,
      createMember,
      updateMember,
      deleteMember,
      deleteManyMembers,
      updateManyMembers,
      countMembers,
      executeRaw,
      findInvitation,
      createInvitationRow,
      updateManyInvitations,
      findManyInvitations,
      findUser,
    },
  };
}

/** `vi.mock("@/auth", ...)`가 읽는 세션 값. `null`이면 비로그인이다. */
export function sessionFor(userId: string | null): { user: { id: string } } | null {
  return userId === null ? null : { user: { id: userId } };
}
