import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * `PrismaAdapter`를 **두 자리에서만** 감싼다 (2026-09-10, sec-audit-2 발견 31·39).
 *
 * ⚠️ **Auth.js는 세션 만료를 OAuth callback 앞에서 보지 않는다.** `@auth/core`의 세션 경로
 * (`actions/session.js`)는 만료를 검사하고 지우지만, **callback 경로는 그것을 지나지 않는다** —
 * `callback/handle-login.js`가 쿠키의 토큰으로 `getSessionAndUser()`를 부르고 `expires`를 **읽지
 * 않은 채** 그 사용자를 "현재 사용자"로 세운 뒤, 미등록 OAuth 계정이면 그 User에 `linkAccount`한다.
 * 즉 **과거에 유출된 만료 세션 토큰을 수동 Cookie로 보내면 자기 OAuth 계정을 남의 User에 붙일 수
 * 있다.** 브라우저가 만료 쿠키를 지우는 것은 수동 전송을 막지 않고,
 * `allowDangerousEmailAccountLinking`을 끈 것도 이 분기를 막지 않는다 — 그 옵션이 통제하는 것은
 * **세션 없이 이메일 일치로 합치는** 다른 분기이고, 여기서는 이메일이 같을 필요조차 없다.
 *
 * 그래서 어댑터에서 막는다. 상위 라이브러리의 호출 순서를 우리가 바꿀 수 없으므로, **조회가
 * 만료된 행을 애초에 돌려주지 않는 것**이 유일하게 두 경로를 동시에 덮는 자리다.
 *
 * ⚠️ **`PrismaAdapter`를 통째로 다시 구현하지 않는다** — Auth.js 4테이블의 모양은 어댑터가 정하고
 * 컬럼 하나가 어긋나면 런타임에 던지는데 **타입 검사가 그것을 못 본다** (ARCHITECTURE §5.1).
 * 베이스를 펼치고 두 메서드만 덮는다.
 *
 * @param now 테스트가 만료 경계를 고정하려고 넘긴다 — 기본은 실제 시각이다.
 */
export function safePrismaAdapter(prisma: PrismaClient, now: () => Date = () => new Date()): Adapter {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    async getSessionAndUser(token) {
      const result = await base.getSessionAndUser!(token);
      if (result === null) return null;
      const cutoff = now();
      if (result.session.expires.getTime() > cutoff.getTime()) return result;
      // ⚠️ **지우는 조건에 만료를 다시 건다.** 조회와 삭제 사이에 그 세션이 갱신됐을 수 있고,
      // 토큰만 보고 지우면 방금 살아난 세션을 끊는다.
      await prisma.session.deleteMany({ where: { sessionToken: token, expires: { lte: cutoff } } });
      return null;
    },
    /**
     * ⚠️ **로그인 수단은 User당 하나다.** SAAS §5.5가 OAuth 계정 통합을 비범위로 두었는데, 그
     * 정책은 "첫 로그인"에만 서 있었다 — **로그인된 상태에서 provider를 추가하는 경로**는 위
     * callback 분기로 라이브러리 기본 동작에 열려 있었다. 여기서 거부해야 정책이 쓰기까지 닿는다.
     *
     * ⚠️ **토큰을 저장하지 않는다** (발견 39). 로그인용 `github`·`google`의 access/refresh/id 토큰은
     * 로그인 이후 한 번도 쓰이지 않는다 — 남겨 두면 DB 유출 시 노출 범위만 넓어진다. 실제로 쓰는
     * 것은 `github-app` 연결 토큰이고 그쪽은 이 어댑터를 지나지 않는다(`api/github/callback`).
     */
    async linkAccount(account) {
      if (account.provider !== "github" && account.provider !== "google") throw new Error("unsupported login provider");
      await prisma.$transaction(async (tx) => {
        // ⚠️ **첫 로그인도 직렬화한다** — 같은 User에 대한 callback 둘이 동시에 "계정 없음"을 보면
        // 둘 다 만들어져 정책이 쓰기에서 깨진다. `(provider, providerAccountId)` 유일 제약은
        // provider가 다르면 안 걸린다.
        await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${account.userId} FOR UPDATE`;
        const linked = await tx.account.findFirst({ where: { userId: account.userId, provider: { in: ["github", "google"] } }, select: { provider: true } });
        if (linked !== null) throw new Error("additional login accounts are disabled");
        await tx.account.create({ data: { userId: account.userId, type: account.type, provider: account.provider, providerAccountId: account.providerAccountId } });
      });
    },
  };
}
