import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **`prisma/schema.prisma`가 Auth.js 어댑터의 계약을 지키는지 텍스트로 대조한다.**
 *
 * ⚠️ **타입 검사는 이 계약을 전혀 검증하지 못한다** (2026-09-05 실측). `@auth/prisma-adapter`의
 * 시그니처는 `PrismaAdapter(prisma: PrismaClient)`인데 그 `PrismaClient`는 `@prisma/client`에서
 * 오고, 그 패키지는 `.prisma/client/default`를 re-export한다 — Prisma 7의 `prisma-client` 생성기는
 * 그 경로를 만들지 않는다(우리 산출물은 `generated/prisma`다). `skipLibCheck: true`가 그 해결
 * 실패를 삼켜서 파라미터가 사실상 `any`가 되고, **`PrismaAdapter({ nope: true })`도 컴파일된다.**
 *
 * 이건 POSTMORTEM 2026-08-31(「외부 계약 페이로드를 리터럴로 조립해 필수 필드가 늘어도 컴파일러가
 * 침묵했다」)과 같은 모양이다 — 계약의 **생산자 쪽만 끊겨 있다.** 거기서 얻은 규칙("생산자에도
 * 타입을 붙인다")을 여기서는 쓸 수 없으므로(남의 패키지다) **텍스트 대조가 대신 선다.**
 *
 * 필드 목록의 출처는 둘 다 실물이다:
 * - `node_modules/@auth/prisma-adapter/index.js` — 어떤 델리게이트와 `where` 키를 부르는가
 * - `@auth/core/adapters.d.ts`의 ERD 주석 — 각 모델이 갖는 컬럼
 */

const SCHEMA = readFileSync(fileURLToPath(new URL("../schema.prisma", import.meta.url)), "utf8");
const ADAPTER_SOURCE = readFileSync(
  fileURLToPath(new URL("../../node_modules/@auth/prisma-adapter/index.js", import.meta.url)),
  "utf8",
);

/** `model X { ... }` 블록의 본문. 중첩 블록이 없는 형식이라 줄 단위로 자른다. */
function block(kind: "model" | "enum", name: string): string {
  const lines = SCHEMA.split("\n");
  const start = lines.findIndex((l) => l.trimStart().startsWith(`${kind} ${name} {`));
  if (start === -1) throw new Error(`${kind} ${name} 블록이 schema.prisma에 없다`);
  const end = lines.findIndex((l, i) => i > start && l.trimStart().startsWith("}"));
  if (end === -1) throw new Error(`${kind} ${name} 블록이 닫히지 않았다`);
  return lines.slice(start + 1, end).join("\n");
}

/** 블록 본문에서 필드 이름만. 주석·블록 속성(`@@`)은 뺀다. */
function fieldNames(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("//") && !l.startsWith("///") && !l.startsWith("@@"))
    .map((l) => l.split(/\s+/)[0] ?? "")
    .filter((n) => n !== "");
}

describe("Auth.js 어댑터 계약 — 모델과 컬럼", () => {
  it("네 모델이 있다 (Authenticator는 WebAuthn 전용이라 만들지 않는다)", () => {
    for (const model of ["User", "Account", "Session", "VerificationToken"]) {
      expect(() => block("model", model)).not.toThrow();
    }
    expect(SCHEMA).not.toContain("model Authenticator");
  });

  it("User가 ERD의 다섯 컬럼을 갖는다", () => {
    const names = fieldNames(block("model", "User"));
    for (const f of ["id", "name", "email", "emailVerified", "image"]) {
      expect(names).toContain(f);
    }
  });

  it("Account가 OAuth 응답 컬럼을 전부 갖는다 — 하나라도 없으면 linkAccount가 런타임에 던진다", () => {
    const names = fieldNames(block("model", "Account"));
    for (const f of [
      "userId",
      "type",
      "provider",
      "providerAccountId",
      "refresh_token",
      "access_token",
      "expires_at",
      "token_type",
      "scope",
      "id_token",
      "session_state",
    ]) {
      expect(names).toContain(f);
    }
  });

  it("Session이 sessionToken·userId·expires를 갖는다", () => {
    const names = fieldNames(block("model", "Session"));
    for (const f of ["sessionToken", "userId", "expires"]) expect(names).toContain(f);
  });

  it("VerificationToken이 identifier·token·expires를 갖는다", () => {
    const names = fieldNames(block("model", "VerificationToken"));
    for (const f of ["identifier", "token", "expires"]) expect(names).toContain(f);
  });
});

describe("Auth.js 어댑터 계약 — where가 요구하는 unique", () => {
  it("credential adapter가 emailLookup unique로 조회하며 email은 암호문이다", () => {
    const adapter = readFileSync(fileURLToPath(new URL("../../lib/credentials/adapter.ts", import.meta.url)), "utf8");
    expect(adapter).toContain("emailLookup: lookupEmail(email)");
    expect(adapter).not.toMatch(/where:\s*\{\s*email\s*[:}]/);
    for (const method of ["createUser", "updateUser", "getUser", "getUserByEmail", "getUserByAccount", "getSessionAndUser", "deleteUser"]) expect(adapter).toContain(`async ${method}(`);
    expect(block("model", "User")).toMatch(/^\s*emailLookup\s+String\?.*@unique/m);
    expect(block("model", "User")).not.toMatch(/^\s*email\s+String.*@unique/m);
  });

  it("getUserByAccount가 where:{provider_providerAccountId}라 Account에 복합 키가 있다", () => {
    expect(ADAPTER_SOURCE).toContain("where: { provider_providerAccountId }");
    expect(block("model", "Account")).toMatch(/@@(id|unique)\(\[provider, providerAccountId\]\)/);
  });

  it("getSessionAndUser가 where:{sessionToken}이라 Session.sessionToken이 unique다", () => {
    expect(ADAPTER_SOURCE).toContain("where: { sessionToken }");
    expect(block("model", "Session")).toMatch(/^\s*sessionToken\s+String.*@unique/m);
  });

  it("useVerificationToken이 where:{identifier_token}이라 복합 unique가 있다", () => {
    expect(ADAPTER_SOURCE).toContain("where: { identifier_token }");
    expect(block("model", "VerificationToken")).toContain("@@unique([identifier, token])");
  });

  it("include:{user:true}를 쓰므로 Account·Session에 user 관계가 있다", () => {
    expect(ADAPTER_SOURCE).toContain("include: { user: true }");
    expect(block("model", "Account")).toMatch(/user\s+User\s+@relation/);
    expect(block("model", "Session")).toMatch(/user\s+User\s+@relation/);
  });

  it("어댑터가 부르는 델리게이트가 전부 스키마에 있다 — 버전이 올라 모델이 늘면 red가 된다", () => {
    // WebAuthn(`authenticator`)만 의도적 제외다. 우리는 그 provider를 쓰지 않으므로 그 네 메서드가
    // 호출될 경로가 없다 — SAAS §6의 11테이블 셈도 그 모델을 빼고 있다.
    const excluded = new Set(["authenticator"]);
    const used = new Set(
      [...ADAPTER_SOURCE.matchAll(/\bp\.([a-zA-Z]+)\./g)].map((m) => m[1] ?? ""),
    );
    const missing = [...used]
      .filter((d) => !excluded.has(d))
      .filter((d) => !SCHEMA.includes(`model ${d.charAt(0).toUpperCase()}${d.slice(1)} {`));
    expect(missing).toEqual([]);
  });
});

describe("onDelete — Auth.js 내부는 Cascade, 우리 데이터는 Restrict", () => {
  it("Account·Session의 user 관계가 Cascade다 — deleteUser가 그것을 전제한다", () => {
    // 어댑터의 `deleteUser`는 `p.user.delete`만 부른다. Restrict면 Account·Session이 남은 User를
    // 지울 수 없어 그 메서드가 항상 실패한다.
    expect(ADAPTER_SOURCE).toContain("deleteUser: (id) => p.user.delete({ where: { id } })");
    expect(block("model", "Account")).toContain("onDelete: Cascade");
    expect(block("model", "Session")).toContain("onDelete: Cascade");
  });

  it("ProjectMember·ProjectInvitation의 관계는 Restrict다 — 우리 데이터는 조용히 사라지지 않는다", () => {
    // 기존 Project 관계 전부가 Restrict인 것과 같은 근거 (ARCHITECTURE §5).
    for (const model of ["ProjectMember", "ProjectInvitation"]) {
      const body = block("model", model);
      expect(body).not.toContain("onDelete: Cascade");
      expect(body.match(/onDelete: Restrict/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("테넌트 모델 — ProjectMember · ProjectInvitation", () => {
  it("Role enum이 둘뿐이다 (MVP §7 '세밀한 권한'이 유지된다)", () => {
    const body = block("enum", "Role");
    expect(fieldNames(body).sort()).toEqual(["EDITOR", "OWNER"]);
  });

  it("ProjectMember가 한 프로젝트에 사용자당 한 행이다", () => {
    const body = block("model", "ProjectMember");
    for (const f of ["projectId", "userId", "role", "createdAt", "updatedAt"]) {
      expect(fieldNames(body)).toContain(f);
    }
    expect(body).toContain("@@unique([projectId, userId])");
  });

  it("ProjectInvitation의 tokenHash가 unique다 — 링크로 행을 찾는 유일한 키다", () => {
    const body = block("model", "ProjectInvitation");
    for (const f of ["projectId", "email", "role", "tokenHash", "expiresAt", "acceptedAt", "invitedBy"]) {
      expect(fieldNames(body)).toContain(f);
    }
    expect(body).toMatch(/^\s*tokenHash\s+String.*@unique/m);
  });

  it("ProjectInvitation의 (projectId, email)이 **unique가 아니다** — 재초대를 막으면 안 된다", () => {
    // acceptedAt을 남기는 설계라 수락·만료된 행이 이메일을 점유한다. 멤버를 뺐다가 다시 부르는
    // 정상 경로가 unique 위반이 된다 (design §5). 판정은 planInvitationAccept가 한다.
    const body = block("model", "ProjectInvitation");
    expect(body).toContain("@@index([projectId, emailLookup])");
    expect(body).not.toContain("@@unique([projectId, emailLookup])");
  });

  it("인덱스가 projectId 선두다 (ARCHITECTURE §5 — 모든 조회가 프로젝트로 먼저 좁혀진다)", () => {
    for (const model of ["ProjectMember", "ProjectInvitation"]) {
      for (const m of block("model", model).matchAll(/@@(?:index|unique)\(\[([^\]]+)\]\)/g)) {
        expect((m[1] ?? "").split(",")[0]?.trim()).toBe("projectId");
      }
    }
  });
});

describe("additive — 기존 다섯 모델이 그대로다", () => {
  it("PoC의 다섯 모델이 남아 있다", () => {
    for (const model of ["Project", "Locale", "StringKey", "KeyRef", "Translation"]) {
      expect(() => block("model", model)).not.toThrow();
    }
  });

  it("Translation.updatedBy가 여전히 nullable String이다 — 담는 값만 User.id로 바뀐다", () => {
    expect(block("model", "Translation")).toMatch(/^\s*updatedBy\s+String\?/m);
  });
});
