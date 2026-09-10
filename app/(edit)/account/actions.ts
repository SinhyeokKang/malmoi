"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { requestOrigin } from "@/lib/github-connect/origin";
import { routes } from "@/lib/routes";
import { withRevocationStart } from "@/lib/session-revocation/http";
import { beginRevocation } from "@/lib/session-revocation/store";
import { revocationCookie } from "@/lib/session-revocation/policy";

export async function startSessionRevocation(): Promise<{ error: "unavailable" }> {
  const { userId } = await requireUser();
  let destination: string;
  try {
    const h = await headers();
    const origin = requestOrigin({ host: h.get("host"), forwardedProto: h.get("x-forwarded-proto") });
    if (!origin) return { error: "unavailable" };
    const jar = await cookies();
    const sessionToken = jar.get(origin.secure ? "__Secure-authjs.session-token" : "authjs.session-token")?.value;
    if (!sessionToken) return { error: "unavailable" };
    const prisma = getPrisma();
    const accounts = await prisma.account.findMany({ where: { userId, provider: { in: ["github", "google"] } }, select: { provider: true, providerAccountId: true } });
    const account = accounts[0];
    if (accounts.length !== 1 || !account || (account.provider !== "github" && account.provider !== "google")) return { error: "unavailable" };
    destination = await withRevocationStart(origin.secure, () => signIn(account.provider, { redirect: false, redirectTo: routes.account({ sessionRevocation: "expired" }) }, { prompt: "select_account" }));
    const state = new URL(destination).searchParams.get("state");
    if (!state) return { error: "unavailable" };
    const nonce = randomBytes(32).toString("base64url");
    const result = await beginRevocation(prisma, { userId, nonce, sessionToken, state, ...account });
    if (result !== "ready") return { error: "unavailable" };
    const cookie = revocationCookie(origin.secure);
    jar.set(cookie.name, nonce, cookie.options);
  } catch { return { error: "unavailable" }; }
  // Next's redirect throws; keep it outside the failure handler.
  redirect(destination);
}
