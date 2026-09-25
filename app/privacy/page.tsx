import { PrivacyDoc } from "@/components/privacy/privacy-doc";
import { PublicShell } from "@/components/public-shell/public-shell";
import { publicCta } from "@/lib/auth/landing";
import { readSession } from "@/lib/auth/read-session";

/**
 * **공개 셸 안의 방침** (시안 `Landing.dc.html` 1e, DESIGN §6.616) — 랜딩 푸터의 `Privacy Policy`가 셸 밖으로
 * 떨어지지 않는다. ⚠️ **route group 레이아웃으로 묶지 않는다** — 페이지마다 셸을 그려야 이동 때 스크롤러가 다시 마운트된다.
 *
 * ⚠️ **본문은 사전에 있다** (`messages/en.tsx`의 `publicDocs.privacy`) — 고치면 `effectiveDate`를 같이 옮기고
 * `lib/privacy/__tests__/policy-gate.test.tsx`가 개정 이력을 요구한다.
 * 로그인 화면 푸터가 이 경로를 가리키므로 **라우트를 먼저 딴다** — `lib/routes.ts`에 등재만 하고
 * 페이지를 안 만들면 404를 가리키는 생성기가 되고, 죽은 링크 검사의 접두 규칙이 그것을 통과시켜
 * 못 잡는다.
 *
 * ⚠️ **인가를 지나지 않는다** — 공개 문서라 로그인 없이 읽혀야 한다(`entry-points.test.ts`의
 * `EXEMPT`에 이름으로 등재). 같은 이유로 middleware matcher에도 없다. 세션을 읽는 것은 **헤더 primary
 * 하나 때문이고 차단이 아니다** — 로그인이면 `Open Malmoi`, 아니면(장애 포함) `Get started`(`publicCta`).
 */
export default async function Privacy() {
  const session = await readSession();

  return (
    <PublicShell cta={publicCta(session.status)}>
      <PrivacyDoc />
    </PublicShell>
  );
}
