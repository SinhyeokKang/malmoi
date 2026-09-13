"use server";

import { withConnectStart } from "@/lib/account-connect/http";
import { beginConnect } from "@/lib/account-connect/store";
import { connectCookie } from "@/lib/account-connect/policy";
import type { ConnectOutcome } from "@/lib/account-connect/plan";
import { clearAuthRoundtripCookies } from "@/lib/auth/roundtrip-cookies";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { requireUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { requestOrigin } from "@/lib/github-connect/origin";
import { routes } from "@/lib/routes";
import { revalidatePath } from "next/cache";
import { canUnlink, isLoginProvider, LOGIN_PROVIDERS, pickLoginAccount } from "@/lib/login-link/policy";
import { withRevocationStart } from "@/lib/session-revocation/http";
import { beginRevocation } from "@/lib/session-revocation/store";
import { revocationCookie } from "@/lib/session-revocation/policy";
import { decodeUser, encodeUserFields, readable } from "@/lib/credentials/records";
import { validatePiiReadKeys, validatePiiWriteKey } from "@/lib/credentials/storage";
import { planNameSave } from "@/lib/account/plan";
import { imageObjectKey, planImageDelete, planImageUpload, type UploadReject } from "@/lib/upload/image";
import { putImage, deleteImage } from "@/lib/upload/store";

type ImageResult = { ok: true } | { ok: false; reason: UploadReject | "unavailable" };

type NameResult = { ok: true } | { ok: false; reason: "empty" | "too-long" | "unavailable" };

/**
 * 표시 이름 저장 (account-settings 태스크 2).
 *
 * ⚠️⚠️ **`prisma.user.update({ data: { name } })`를 직접 쓰지 않는다.** `User.name`은 PII 봉투
 * 대상이라(`lib/credentials/storage.ts`의 `PiiContext` · `records.ts`의 `["name","image"]` 루프)
 * 평문을 넣으면 **다음 `decodeUser`가 `CredentialError`로 죽는다** — 그 사람의 로그인·멤버 조회가
 * 통째로 막힌다. `prisma/schema.prisma`가 그 사실을 말하지 않아 스키마만 읽고 구현하면 틀린다.
 *
 * ⚠️ **키 검증이 쓰기보다 앞이다** — 키가 없는 채로 `sealPii`에 들어가면 던지는 자리가 봉인
 * 한가운데라 사유가 `unavailable`로 뭉개진다 (POSTMORTEM 2026-09-13).
 */
export async function updateProfileName(raw: string): Promise<NameResult> {
  const { userId } = await requireUser();
  // 판정은 순수 함수가 한다 — Action이 유일한 방어선이 아니다.
  const plan = planNameSave(raw);
  if (!plan.ok) return plan;
  try {
    validatePiiWriteKey();
    await getPrisma().user.update({ where: { id: userId }, data: encodeUserFields(userId, { name: plan.name }) });
  } catch {
    // 사유에 이름을 싣지 않는다 — 로그가 PII를 나르면 봉투가 무의미해진다.
    console.error("Profile name update failed.", { userId });
    return { ok: false, reason: "unavailable" };
  }
  // 셸 아바타·사용자 메뉴가 같은 값을 읽는다 — 경로를 나열하면 다음 소비자가 조용히 빠진다.
  revalidatePath("/", "layout");
  return { ok: true };
}

async function cleanImage(url: string | null, userId: string): Promise<void> {
  const key = planImageDelete(url);
  if (key === null || !key.startsWith(`avatars/${userId}/`)) return;
  try { await deleteImage(key); }
  catch { console.warn("Profile image cleanup failed; an orphan may remain.", { userId }); }
}

export async function uploadProfileImage(form: FormData): Promise<ImageResult> {
  const { userId } = await requireUser();
  const file = form.get("image");
  if (!(file instanceof File)) return { ok: false, reason: "not-a-file" };
  let uploaded: string | null = null;
  let previous: string | null;
  let stage = "file-validation";
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const plan = planImageUpload(bytes);
    if (!plan.ok) return plan;
    stage = "pii-write-key";
    validatePiiWriteKey();
    const key = imageObjectKey(userId, plan.ext, randomBytes(24).toString("base64url"));
    // Network I/O stays outside the row lock and Prisma's transaction timeout.
    stage = "blob-upload";
    uploaded = await putImage(key, bytes, plan.ext);
    stage = "image-encryption";
    const image = encodeUserFields(userId, { image: uploaded });
    stage = "database-update";
    previous = await getPrisma().$transaction(async (tx) => {
      // Upload and delete serialize the read/write pair on the same user row.
      await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const row = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, image: true } });
      const prev = readable(() => decodeUser(row))?.image ?? null;
      await tx.user.update({ where: { id: userId }, data: image });
      return prev;
    });
  } catch {
    console.error("Profile image upload failed.", { stage, userId });
    await cleanImage(uploaded, userId);
    return { ok: false, reason: "unavailable" };
  }
  // Only clean the previous image after commit; rollback must leave its URL usable.
  await cleanImage(previous, userId);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteProfileImage(): Promise<ImageResult> {
  const { userId } = await requireUser();
  let previous: string | null;
  let stage = "pii-read-key";
  try {
    validatePiiReadKeys();
    stage = "database-update";
    previous = await getPrisma().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const row = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, image: true } });
      const prev = readable(() => decodeUser(row))?.image ?? null;
      await tx.user.update({ where: { id: userId }, data: encodeUserFields(userId, { image: null }) });
      return prev;
    });
  } catch {
    console.error("Profile image deletion failed.", { stage, userId });
    return { ok: false, reason: "unavailable" };
  }
  await cleanImage(previous, userId);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function startSessionRevocation(): Promise<{ error: "unavailable" }> {
  const { userId } = await requireUser();
  let destination: string;
  try {
    const h = await headers();
    const origin = requestOrigin({ host: h.get("host"), forwardedProto: h.get("x-forwarded-proto") });
    if (!origin) return { error: "unavailable" };
    // ⚠️ **버려진 병합 왕복을 먼저 지운다** — 남아 있으면 그쪽이 이 callback을 먹는다 (불변식 8c).
    await clearAuthRoundtripCookies();
    const jar = await cookies();
    const sessionToken = jar.get(origin.secure ? "__Secure-authjs.session-token" : "authjs.session-token")?.value;
    if (!sessionToken) return { error: "unavailable" };
    const prisma = getPrisma();
    const accounts = await prisma.account.findMany({ where: { userId, provider: { in: [...LOGIN_PROVIDERS] } }, select: { provider: true, providerAccountId: true } });
    /**
     * ⚠️ **`accounts.length !== 1`이던 자리다** (account-linking T6) — 화면에서 **먼저** 걸리는
     * 조건이라 store의 같은 판정보다 이쪽이 사용자에게 보인다. 확인 상대는 서버가 결정적으로
     * 고른다: 클라이언트가 고르게 하면 공격자가 확인 상대를 고른다.
     */
    const account = pickLoginAccount(accounts);
    if (account === null || !isLoginProvider(account.provider)) return { error: "unavailable" };
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

/**
 * 로그인 수단 해제 (account-linking T5).
 *
 * ⚠️ **`Account` PK가 `(provider, providerAccountId)`라 그 둘만으로 남의 행에 닿는다** —
 * 모든 조회·삭제에 `userId`를 함께 건다 (POSTMORTEM 2026-09-06).
 *
 * 붙이는 문은 finishLink와 finishConnect이고, 여기는 마지막 수단을 남기는 해제 경로다.
 */
export async function unlinkLoginMethod(provider: string): Promise<void> {
  const { userId } = await requireUser();
  let outcome: "disconnected" | "last-method" | "unavailable";
  try {
    outcome = await getPrisma().$transaction(async (tx) => {
      // 같은 사용자의 해제 둘이 동시에 오면 둘 다 "아직 둘이다"를 보고 마지막 수단까지 지운다.
      await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const accounts = await tx.account.findMany({
        where: { userId, provider: { in: [...LOGIN_PROVIDERS] } },
        select: { provider: true },
      });
      // 판정은 순수 함수가 한다 — Action이 유일한 방어선이 아니다.
      if (!canUnlink(accounts.map((a) => a.provider), provider)) return "last-method" as const;
      const removed = await tx.account.deleteMany({ where: { userId, provider } });
      return removed.count > 0 ? ("disconnected" as const) : ("unavailable" as const);
    });
  } catch {
    outcome = "unavailable";
  }
  // 셸의 사용자 메뉴까지 바뀔 수 있다 — 경로를 나열하면 다음에 생기는 소비자가 조용히 빠진다.
  revalidatePath("/", "layout");
  // Next의 redirect는 던진다 — 실패 처리 밖에 둔다.
  redirect(routes.account({ link: outcome }));
}

/** The live session replaces re-proving the existing method; the new provider still needs OAuth proof. */
export async function startLoginMethodConnect(provider: string): Promise<void> {
  const { userId } = await requireUser();
  let destination = routes.account({ connect: "failed" });
  let oauthStarted = false;
  let ready = false;
  let stage = "provider-check";
  try {
    if (isLoginProvider(provider)) {
      const prisma = getPrisma();
      const existing = await prisma.account.count({ where: { userId, provider } });
      if (existing > 0) destination = routes.account({ connect: "already-connected" });
      else {
        stage = "origin";
        const h = await headers();
        const origin = requestOrigin({ host: h.get("host"), forwardedProto: h.get("x-forwarded-proto") });
        if (origin) {
          stage = "cookies";
          await clearAuthRoundtripCookies();
          const jar = await cookies();
          const sessionToken = jar.get(origin.secure ? "__Secure-authjs.session-token" : "authjs.session-token")?.value;
          if (sessionToken) {
            oauthStarted = true;
            stage = "oauth";
            const url = await withConnectStart(origin.secure, () => signIn(provider, { redirect: false, redirectTo: routes.account({ connect: "expired" }) }, { prompt: "select_account" }));
            const state = new URL(url).searchParams.get("state");
            if (state) {
              stage = "challenge";
              const nonce = randomBytes(32).toString("base64url");
              const outcome = await beginConnect(prisma, { userId, provider, nonce, sessionToken, state });
              if (outcome === "ready") {
                stage = "nonce-cookie";
                const cookie = connectCookie(origin.secure);
                jar.set(cookie.name, nonce, cookie.options);
                destination = url;
                ready = true;
              } else destination = routes.account({ connect: outcome satisfies ConnectOutcome });
            }
          }
        }
      }
    }
  } catch {
    console.error("Account connect start failed.", { stage });
    destination = routes.account({ connect: "failed" });
  }
  // signIn writes state before the DB challenge exists. A failed start must not claim a later callback.
  if (oauthStarted && !ready) {
    try { await clearAuthRoundtripCookies(); } catch {
      console.error("Account connect start failed.", { stage: "cleanup" });
      destination = routes.account({ connect: "failed" });
    }
  }
  redirect(destination);
}
