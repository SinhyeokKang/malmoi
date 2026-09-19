import { PublicDoc } from "@/components/public-doc";
import { readSession } from "@/lib/auth/read-session";
import { m } from "@/lib/i18n";

/**
 * ⚠️ **본문은 사전에 있다** (`messages/en.tsx`의 `publicDocs.privacy`) — 고치면 개정 이력에 행이
 * 하나 늘어야 `lib/privacy/__tests__`가 green이 된다.
 * 로그인 화면 푸터가 이 경로를 가리키므로 **라우트를 먼저 딴다** — `lib/routes.ts`에 등재만 하고
 * 페이지를 안 만들면 404를 가리키는 생성기가 되고, 죽은 링크 검사의 접두 규칙이 그것을 통과시켜
 * 못 잡는다.
 *
 * ⚠️ **인가를 지나지 않는다** — 공개 문서라 로그인 없이 읽혀야 한다(`entry-points.test.ts`의
 * `EXEMPT`에 이름으로 등재). 같은 이유로 middleware matcher에도 없다. 세션을 읽는 것은 **복귀 링크
 * 하나 때문이고 차단이 아니다**(DESIGN §6.61).
 */
export default async function Privacy() {
  const session = await readSession();

  return (
    <PublicDoc
      title={m.publicDocs.privacy.title}
      effectiveDate={m.publicDocs.privacy.effectiveDate}
      intro={m.publicDocs.privacy.intro}
      sections={m.publicDocs.privacy.sections}
      signedIn={session.status === "ok"}
    />
  );
}
