/** C단계 검증용 임시 도구. lib/db.ts가 server-only라 스크립트에서 못 열어 클라이언트를 직접 만든다. */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
export function client(): PrismaClient {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL 없음");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
