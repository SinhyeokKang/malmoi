import "server-only";
import { credentialIO } from "./access";
import { randomUUID } from "node:crypto";
import { safePrismaAdapter } from "@/lib/auth/safe-adapter";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import type { PrismaClient } from "@/generated/prisma/client";
import { CredentialError, hashSessionToken, isSessionValid } from "./crypto";
import { decodeUser, encodeUserFields, verifyLookupEmail } from "./records";
import { lookupEmail } from "./storage";

export function credentialAdapter(prisma: PrismaClient, now: () => Date = () => new Date()): Adapter {
  const base = safePrismaAdapter(prisma, now);
  const restore = (row: Awaited<ReturnType<typeof prisma.user.findUnique>>): AdapterUser | null => row === null ? null : decodeUser(row);
  const adapter: Adapter = {
    ...base,
    async createUser(user) {
      // AAD가 행 id를 물으므로 id를 **먼저** 만든다 — DB 기본값에 맡기면 봉인 시점에 그 값이 없다.
      const id = randomUUID();
      const { email, emailLookup, ...rest } = encodeUserFields(id, user);
      /**
       * ⚠️ **여기가 `emailLookup`이 비지 않는다는 것을 보증하는 유일한 자리다.** R2가 그 컬럼에
       * NOT NULL을 걸지 않기로 했으므로(전환 도구가 `emailLookup: null`로 미변환 행을 집어야 한다 —
       * `20260910060000_finalize_credential_storage`의 주석) DB는 **유일성만** 막는다. 값이 빠진 행은
       * unique 인덱스에 안 걸려 **이메일로 영영 못 찾는 사용자**가 되고, 그 사람의 주소로 다시
       * 가입하면 중복 계정이 생긴다 — 조용하다.
       *
       * `encodeUserFields`는 email이 있으면 lookup도 반드시 내지만 타입이 그것을 못 말한다
       * (입력의 `email`이 optional이라 반환도 optional이다). 단언으로 지우지 않고 **센다**.
       */
      if (email === undefined || emailLookup === undefined) throw new CredentialError();
      const row = await prisma.user.create({ data: { id, emailVerified: user.emailVerified, ...rest, email, emailLookup } });
      return decodeUser(row);
    },
    async updateUser({ id, ...fields }) {
      const row = await prisma.user.update({ where: { id }, data: { ...encodeUserFields(id, fields), ...(fields.emailVerified !== undefined ? { emailVerified: fields.emailVerified } : {}) } });
      return decodeUser(row);
    },
    async getUser(id) { return restore(await prisma.user.findUnique({ where: { id } })); },
    async getUserByEmail(email) {
      const user = restore(await prisma.user.findUnique({ where: { emailLookup: lookupEmail(email) } }));
      if (user) verifyLookupEmail(user.email, email);
      return user;
    },
    async getUserByAccount(key) {
      const row = await prisma.account.findUnique({ where: { provider_providerAccountId: key }, include: { user: true } });
      return restore(row?.user ?? null);
    },
    async deleteUser(id) { return decodeUser(await prisma.user.delete({ where: { id } })); },
    async createSession(data) {
      const row = await prisma.session.create({ data: { ...data, sessionToken: hashSessionToken(data.sessionToken) } });
      return { ...row, sessionToken: data.sessionToken };
    },
    async getSessionAndUser(raw) {
      const row = await prisma.session.findUnique({ where: { sessionToken: hashSessionToken(raw) }, include: { user: true } });
      if (row === null) return null;
      const cutoff = now();
      if (!isSessionValid(row.expires, cutoff)) {
        await prisma.session.deleteMany({ where: { sessionToken: hashSessionToken(raw), expires: { lte: cutoff } } });
        return null;
      }
      const { user, ...session } = row;
      return { session: { ...session, sessionToken: raw }, user: decodeUser(user) };
    },
    async updateSession(data) {
      const sessionToken = hashSessionToken(data.sessionToken);
      const changed = await prisma.session.updateMany({ where: { sessionToken, expires: { gt: now() } }, data: { expires: data.expires } });
      if (!changed.count) return null;
      const row = await prisma.session.findUnique({ where: { sessionToken } });
      return row === null ? null : { ...row, sessionToken: data.sessionToken };
    },
    async deleteSession(raw) { await prisma.session.deleteMany({ where: { sessionToken: hashSessionToken(raw) } }); },
  };
  // Auth.js wraps adapter exceptions and can log their causes; sanitize before that boundary.
  return Object.fromEntries(Object.entries(adapter).map(([name, method]) => [name,
    typeof method === "function" ? (...args: unknown[]) => credentialIO(() => Promise.resolve(Reflect.apply(method, adapter, args))) : method,
  ])) as Adapter;
}
