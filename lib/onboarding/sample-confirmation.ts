import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** 파일 내용은 내보내지 않는다. 읽기에 필요한 포맷만 서명한다. */
const Confirmation = z.object({
  userId: z.string(), repositoryId: z.string(), installationId: z.string(), ref: z.string(), headSha: z.string(),
  format: z.object({ adapter: z.string(), pathTemplate: z.string(), locales: z.array(z.string()) }),
});
type SampleConfirmation = z.infer<typeof Confirmation>;
type Context = Omit<SampleConfirmation, "format">;
const LABEL = "malmoi:onboarding-sample:v1";

function signature(encoded: string, secret: string): Buffer {
  if (secret === "") throw new Error("Sample confirmation requires AUTH_SECRET");
  return createHmac("sha256", secret).update(`${LABEL}.${encoded}`).digest();
}

export function signSampleConfirmation(input: SampleConfirmation, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(Confirmation.parse(input))).toString("base64url");
  return `${encoded}.${signature(encoded, secret).toString("base64url")}`;
}

/** 현재 인가·스냅샷과 서명을 모두 대조한다. 재사용은 같은 head에서만 허용한다. */
export function verifySampleConfirmation(token: string, context: Context, secret: string): SampleConfirmation["format"] | null {
  if (secret === "") throw new Error("Sample confirmation requires AUTH_SECRET");
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
    return data.format;
  } catch {
    return null;
  }
}
