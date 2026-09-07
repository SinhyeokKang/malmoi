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

export type ProjectSeed = {
  id: string;
  slug: string;
  name?: string;
  installationId?: string | null;
  lastCommitSha?: string | null;
  /** 프로젝트별 push 토큰의 sha256 — `@unique`(NULL 여럿 허용)를 `create`가 흉내낸다. */
  pushTokenHash?: string | null;
};
export type MemberSeed = { projectId: string; userId: string; role: Role };
export type UserSeed = { id: string; email: string; name?: string | null };
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
  lastCommitSha: null as string | null,
  lastCommitAt: null as Date | null,
  lastPulledAt: null as Date | null,
  pushTokenHash: null as string | null,
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
};

export function createHarness(seed: Seed = {}) {
  const seededProjects = seed.projects ?? [{ id: "p1", slug: "acme", name: "Acme" }];
  /**
   * ⚠️ **프로젝트 행이 가변이다** (2026-09-06). 전에는 `project.update`가 `async () => ({})`라
   * 아무것도 바꾸지 않았고, 그러면 "인가된 projectId에만 저장한다"를 검사하는 테스트가 **항상 거부하는
   * Action에도 통과한다** — 거부만 보는 검증의 함정이다 (POSTMORTEM 2026-09-06). `FORMAT`을 행마다
   * 복제해 두고 update가 그것을 갱신한다.
   */
  const projects = seededProjects.map((p) => ({ ...FORMAT, ...p }));
  const accounts = (seed.accounts ?? []).map((a) => ({
    access_token: "token", refresh_token: "refresh", expires_at: null as number | null, ...a,
  }));
  const members = seed.members ?? [];
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
      // `pushTokenHash`는 null을 매치하지 않는다 — 미발급 프로젝트가 인증에 걸리면 fail-open이다 (design §3.8).
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

  const findManyMembers = vi.fn(async (args: { where: { projectId?: string; userId?: string } }) =>
    members.filter(
      (m) =>
        (args.where.projectId === undefined || m.projectId === args.where.projectId) &&
        (args.where.userId === undefined || m.userId === args.where.userId),
    ),
  );

  const createMember = vi.fn(async (args: { data: MemberSeed }) => {
    // 스키마의 `@@unique([projectId, userId])`를 흉내낸다 — 안 하면 가짜가 실제보다 관대해지고,
    // 그 차이가 곧 "테스트는 통과하는데 프로덕션은 던진다"가 된다.
    const clash = members.some(
      (m) => m.projectId === args.data.projectId && m.userId === args.data.userId,
    );
    if (clash) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    members.push(args.data);
    return args.data;
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

  const findInvitation = vi.fn(
    async (args: { where: { tokenHash?: string; id?: string } }) =>
      invitations.find(
        (i) =>
          (args.where.tokenHash !== undefined && i.tokenHash === args.where.tokenHash) ||
          (args.where.id !== undefined && i.id === args.where.id),
      ) ?? null,
  );

  const createInvitationRow = vi.fn(async (args: { data: Omit<InvitationSeed, "id"> }) => {
    const row: InvitationSeed = { id: `inv-${invitations.length + 1}`, ...args.data };
    invitations.push(row);
    return row;
  });

  /** 단일 사용의 근거다 — 두 번째 수락은 `acceptedAt: null` 조건에 걸려 count 0이 된다. */
  const updateManyInvitations = vi.fn(
    async (args: {
      where: { id?: string; projectId?: string; email?: string; acceptedAt?: null; expiresAt?: { gt: Date } };
      data: { acceptedAt?: Date; expiresAt?: Date };
    }) => {
      const matched = invitations.filter(
        (i) =>
          (args.where.id === undefined || i.id === args.where.id) &&
          (args.where.projectId === undefined || i.projectId === args.where.projectId) &&
          (args.where.email === undefined || i.email === args.where.email) &&
          (args.where.acceptedAt === undefined || i.acceptedAt === null) &&
          (args.where.expiresAt === undefined || i.expiresAt.getTime() > args.where.expiresAt.gt.getTime()),
      );
      for (const row of matched) Object.assign(row, args.data);
      return { count: matched.length };
    },
  );

  // `projectId`(마지막 OWNER 보호)와 `userId`(사용자당 프로젝트 3개 제한 — OWNER 행만 센다) 둘 다 받는다.
  const countMembers = vi.fn(async (args: { where: { projectId?: string; userId?: string; role?: Role } }) =>
    members.filter(
      (m) =>
        (args.where.projectId === undefined || m.projectId === args.where.projectId) &&
        (args.where.userId === undefined || m.userId === args.where.userId) &&
        (args.where.role === undefined || m.role === args.where.role),
    ).length,
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
  const createProject = vi.fn(async (args: { data: ProjectSeed & Record<string, unknown> }) => {
    const hash = args.data.pushTokenHash ?? null;
    const clash = projects.some(
      (p) => p.slug === args.data.slug || p.id === args.data.id || (hash !== null && p.pushTokenHash === hash),
    );
    if (clash) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const row = { ...FORMAT, ...args.data, pushTokenHash: hash };
    projects.push(row);
    return row;
  });

  /** pull 순회용. `where`는 `installationId: { not: null }`·`lastCommitSha: { not: null }` 모양만 받는다. */
  const findManyProjects = vi.fn(
    async (args: { where?: Record<string, { not: null } | string | null>; orderBy?: unknown } = {}) =>
      projects.filter((p) =>
        Object.entries(args.where ?? {}).every(([k, v]) => {
          const value = (p as Record<string, unknown>)[k];
          return v !== null && typeof v === "object" && "not" in v ? value !== v.not : value === v;
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

  /** `SELECT … FOR UPDATE` 같은 잠금 SQL. 메모리 DB는 잠글 것이 없다 — 호출 인자만 남긴다. */
  const executeRaw = vi.fn(async (_strings: TemplateStringsArray, ..._values: unknown[]) => 0);

  const findUser = vi.fn(
    async (args: { where: { id?: string; email?: string } }) =>
      users.find(
        (u) =>
          (args.where.id !== undefined && u.id === args.where.id) ||
          (args.where.email !== undefined && u.email === args.where.email),
      ) ?? null,
  );

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
    };
    try {
      return await fn(prisma);
    } catch (error) {
      restore(members, saved.members);
      restore(invitations, saved.invitations);
      restore(translations, saved.translations);
      restore(projects, saved.projects);
      restore(accounts, saved.accounts);
      throw error;
    }
  };

  const prisma = {
    $transaction,
    $executeRaw: executeRaw,
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
    },
    stringKey: {
      findFirst: async ({ where }: { where: { id: string; projectId: string } }) =>
        keys.find((k) => k.id === where.id && k.projectId === where.projectId) ?? null,
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
    spies: {
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
      findUser,
    },
  };
}

/** `vi.mock("@/auth", ...)`가 읽는 세션 값. `null`이면 비로그인이다. */
export function sessionFor(userId: string | null): { user: { id: string } } | null {
  return userId === null ? null : { user: { id: userId } };
}
