import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * **`pnpm preflight` — self-hosted 기동 진입** (self-hosting design §2). 순수 판정(`lib/deployment/preflight.ts`)에 실제 디렉터리 probe를
 * 물리고, 실패면 **이름과 사유 코드만** 찍고 exit 1이다. 컨테이너가 이 종료 코드로 web을 띄우지 않는다.
 *
 * 실제로 띄워 잰다 — `@/` 별칭 때문에 tsx로 돌아야 하고(B1 인계), 그 배선이 깨지면 소스 검사로는 안 보인다.
 */

const dir = mkdtempSync(join(tmpdir(), "preflight-entry-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const VALID: Record<string, string> = {
  MALMOI_ORIGIN: "https://malmoi.example.com",
  MALMOI_UPLOAD_DIR: dir,
  MALMOI_PRIVACY_URL: "https://example.com/privacy",
  AUTH_URL: "https://malmoi.example.com",
  AUTH_TRUST_HOST: "true",
  AUTH_SECRET: "SENTINEL-1",
  AUTH_GITHUB_ID: "SENTINEL-2",
  AUTH_GITHUB_SECRET: "SENTINEL-3",
  AUTH_GOOGLE_ID: "SENTINEL-4",
  AUTH_GOOGLE_SECRET: "SENTINEL-5",
  APP_SIGNING_SECRET: "SENTINEL-6",
  DATABASE_URL: "postgresql://malmoi_app:SENTINEL-7@postgres:5432/malmoi",
  GITHUB_APP_ID: "123456",
  GITHUB_APP_PRIVATE_KEY: "SENTINEL-8",
  GITHUB_APP_CLIENT_ID: "SENTINEL-9",
  GITHUB_APP_CLIENT_SECRET: "SENTINEL-10",
  GITHUB_APP_SLUG: "malmoi-acme",
  CRON_SECRET: "SENTINEL-11",
  TOKEN_ENCRYPTION_KEYS: "SENTINEL-12",
  TOKEN_ENCRYPTION_ACTIVE_KEY_ID: "k1",
  PII_ENCRYPTION_KEYS: "SENTINEL-13",
  PII_ENCRYPTION_ACTIVE_KEY_ID: "p1",
  EMAIL_LOOKUP_KEY: "SENTINEL-14",
  EMAIL_LOOKUP_KEY_ID: "l1",
  RESEND_API_KEY: "re_SENTINEL-15",
  INVITATION_EMAIL_FROM: "Acme <invite@mail.example.com>",
};

/** 부모 env를 물려주지 않는다 — 셸 값이 판정에 섞이면 사례가 공허하다. PATH·HOME은 pnpm·tsx를 찾는 데만 쓴다. */
function run(env: Record<string, string>) {
  const result = spawnSync("pnpm", ["--silent", "preflight"], { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env }, encoding: "utf8", timeout: 60_000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("pnpm preflight", () => {
  it("전부 맞으면 exit 0", () => {
    const { status, stdout } = run(VALID);
    expect(status).toBe(0);
    expect(stdout).toContain("preflight: ok");
  }, 60_000);

  it("실패면 exit 1이고 이름·사유 코드만 찍는다 — 값은 없다", () => {
    const { status, stdout, stderr } = run({ ...VALID, AUTH_SECRET: "", RESEND_API_KEY: "SENTINEL-bad-key", MALMOI_UPLOAD_DIR: join(dir, "missing"), AUTH_URL: "https://other.example.com" });
    expect(status).toBe(1);
    const lines = stderr.trim().split("\n");
    expect(lines).toEqual(expect.arrayContaining([
      "preflight: AUTH_SECRET missing",
      "preflight: RESEND_API_KEY invalid-format",
      "preflight: MALMOI_UPLOAD_DIR not-found",
      "preflight: AUTH_URL auth-url-mismatch",
    ]));
    expect(`${stdout}${stderr}`).not.toMatch(/SENTINEL|other\.example\.com|preflight-entry-/);
  }, 60_000);

  it("MALMOI_ORIGIN이 없으면(hosted 설정) 기동을 막는다", () => {
    const { status, stderr } = run({ ...VALID, MALMOI_ORIGIN: "" });
    expect(status).toBe(1);
    expect(stderr).toContain("preflight: MALMOI_ORIGIN missing");
  }, 60_000);
});
