import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** 파일 내용은 내보내지 않는다. 읽기에 필요한 포맷만 서명한다. */
const Confirmation = z.object({
  userId: z.string(), repositoryId: z.string(), installationId: z.string(), ref: z.string(), headSha: z.string(),
  format: z.object({ adapter: z.string(), pathTemplate: z.string(), locales: z.array(z.string()) }),
  issuedAt: z.number(),
});
type SampleConfirmation = z.infer<typeof Confirmation>;
type Context = Omit<SampleConfirmation, "format" | "issuedAt">;
/** ⚠️ v2부터 수명이 있다 — 라벨을 올려 `issuedAt` 없이 발급된 v1 토큰을 모양이 아니라 서명에서 거부한다. */
const LABEL = "malmoi:onboarding-sample:v2";

/** 탐지 화면을 연 채 고민하는 시간은 덮고, 흘러나간 토큰이 오래 살지 않을 만큼 짧다 (sec-audit-3 결정 F). */
export const SAMPLE_CONFIRMATION_TTL_MS = 30 * 60 * 1000;

function signature(encoded: string, secret: string): Buffer {
  if (secret === "") throw new Error("Sample confirmation requires APP_SIGNING_SECRET");
  return createHmac("sha256", secret).update(`${LABEL}.${encoded}`).digest();
}

export function signSampleConfirmation(input: Omit<SampleConfirmation, "issuedAt">, secret: string, now: Date): string {
  const encoded = Buffer.from(JSON.stringify(Confirmation.parse({ ...input, issuedAt: now.getTime() }))).toString("base64url");
  return `${encoded}.${signature(encoded, secret).toString("base64url")}`;
}

/** 현재 인가·스냅샷과 서명을 모두 대조한다. 재사용은 같은 head에서, TTL 안에서만 허용한다. */
export function verifySampleConfirmation(token: string, context: Context, secret: string, now: Date): SampleConfirmation["format"] | null {
  if (secret === "") throw new Error("Sample confirmation requires APP_SIGNING_SECRET");
  if (token.length > 65_536) return null;
  const [encoded, signed, extra] = token.split(".");
  if (!encoded || !signed || extra !== undefined || !/^[A-Za-z0-9_-]{43}$/.test(signed)) return null;
  const actual = Buffer.from(signed, "base64url");
  const expected = signature(encoded, secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const result = Confirmation.safeParse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    if (!result.success) return null;
    const data = result.data;
    if (data.userId !== context.userId || data.repositoryId !== context.repositoryId ||
        data.installationId !== context.installationId || data.ref !== context.ref || data.headSha !== context.headSha) return null;
    // 미래 시각도 거부한다 — 서명이 맞는 한 우리 서버가 만든 값이라, 미래면 시계가 틀렸거나 키가 새었다.
    const age = now.getTime() - data.issuedAt;
    if (age < 0 || age > SAMPLE_CONFIRMATION_TTL_MS) return null;
    return data.format;
  } catch {
    return null;
  }
}
