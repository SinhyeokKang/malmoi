import { PrismaClient } from "../generated/prisma/client";
import { credentialCommand, credentialTarget } from "../lib/credentials/command";
import { convertCredentials } from "../lib/credentials/conversion";
import { loadLocalEnv, scriptPrisma } from "./local";
loadLocalEnv();
let prisma: PrismaClient | undefined;
try {
  const options = credentialCommand(process.argv.slice(2));
  const { target, url } = credentialTarget();
  prisma = scriptPrisma(url);
  const counts = await convertCredentials(prisma, options);
  console.log(JSON.stringify({ target, mode: options.mode, ...counts }));
} catch {
  console.error("credential-conversion-failed: keep traffic blocked; no values logged");
  process.exitCode = 1;
} finally {
  try { await prisma?.$disconnect(); } catch { process.exitCode = 1; }
}
