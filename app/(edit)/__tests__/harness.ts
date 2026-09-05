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

export type ProjectSeed = { id: string; slug: string; name?: string };
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
  lastPulledAt: null as Date | null,
};

export type Seed = {
  projects?: ProjectSeed[];
  members?: MemberSeed[];
  users?: UserSeed[];
  invitations?: InvitationSeed[];
  keys?: KeySeed[];
  locales?: LocaleSeed[];
  translations?: TranslationSeed[];
};

export function createHarness(seed: Seed = {}) {
  const projects = seed.projects ?? [{ id: "p1", slug: "acme", name: "Acme" }];
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
      where: { slug?: string; id?: string };
      select?: { locales?: { where?: { orphaned?: boolean } } };
    }) => {
      const found = projects.find(
        (p) =>
          (args.where.slug !== undefined && p.slug === args.where.slug) ||
          (args.where.id !== undefined && p.id === args.where.id),
      );
      if (found === undefined) return null;
      const onlyLive = args.select?.locales?.where?.orphaned === false;
      return {
        ...FORMAT,
        id: found.id,
        slug: found.slug,
        name: found.name ?? found.slug,
        locales: locales
          .filter((l) => l.projectId === found.id && (onlyLive ? l.orphaned !== true : true))
          .map((l) => ({ code: l.code, isBase: l.isBase ?? false })),
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
    async (args: { where: { tokenHash: string } }) =>
      invitations.find((i) => i.tokenHash === args.where.tokenHash) ?? null,
  );

  const createInvitationRow = vi.fn(async (args: { data: Omit<InvitationSeed, "id"> }) => {
    const row: InvitationSeed = { id: `inv-${invitations.length + 1}`, ...args.data };
    invitations.push(row);
    return row;
  });

  /** 단일 사용의 근거다 — 두 번째 수락은 `acceptedAt: null` 조건에 걸려 count 0이 된다. */
  const updateManyInvitations = vi.fn(
    async (args: {
      where: { id?: string; projectId?: string; email?: string; acceptedAt?: null };
      data: { acceptedAt?: Date; expiresAt?: Date };
    }) => {
      const matched = invitations.filter(
        (i) =>
          (args.where.id === undefined || i.id === args.where.id) &&
          (args.where.projectId === undefined || i.projectId === args.where.projectId) &&
          (args.where.email === undefined || i.email === args.where.email) &&
          (args.where.acceptedAt === undefined || i.acceptedAt === null),
      );
      for (const row of matched) Object.assign(row, args.data);
      return { count: matched.length };
    },
  );

  const findUser = vi.fn(
    async (args: { where: { id?: string; email?: string } }) =>
      users.find(
        (u) =>
          (args.where.id !== undefined && u.id === args.where.id) ||
          (args.where.email !== undefined && u.email === args.where.email),
      ) ?? null,
  );

  const prisma = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    project: { findUnique: findProject, update: async () => ({}) },
    projectMember: {
      findUnique: findMember,
      findMany: findManyMembers,
      create: createMember,
      update: updateMember,
      delete: deleteMember,
    },
    projectInvitation: {
      findUnique: findInvitation,
      create: createInvitationRow,
      updateMany: updateManyInvitations,
    },
    user: { findUnique: findUser },
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
    spies: {
      findProject,
      findMember,
      findManyMembers,
      createMember,
      updateMember,
      deleteMember,
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
