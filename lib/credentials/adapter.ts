import "server-only";
import { credentialIO } from "./access";
import { randomUUID } from "node:crypto";
import { safePrismaAdapter } from "@/lib/auth/safe-adapter";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import type { PrismaClient } from "@/generated/prisma/client";
import { hashSessionToken, isSessionValid } from "./crypto";
import { decodeUser, encodeUserFields, verifyLookupEmail } from "./records";
import { lookupEmail } from "./storage";

export function credentialAdapter(prisma: PrismaClient, now: () => Date = () => new Date()): Adapter {
  const base = safePrismaAdapter(prisma, now);
  const restore = (row: Awaited<ReturnType<typeof prisma.user.findUnique>>): AdapterUser | null => row === null ? null : decodeUser(row);
  const adapter: Adapter = {
    ...base,
    async createUser(user) {
      const id = randomUUID();
      const fields = encodeUserFields(id, user);
      const row = await prisma.user.create({ data: { id, emailVerified: user.emailVerified, ...fields, email: fields.email! } });
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
