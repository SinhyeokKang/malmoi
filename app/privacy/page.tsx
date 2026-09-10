import { PublicDoc } from "@/components/public-doc";
import { m } from "@/lib/i18n";

/**
 * ⚠️ **placeholder다** (8-1a). 로그인 화면 푸터가 이 경로를 가리키므로 **라우트를 먼저 딴다** —
 * `lib/routes.ts`에 등재만 하고 페이지를 안 만들면 404를 가리키는 생성기가 되고, 죽은 링크
 * 검사의 접두 규칙이 그것을 통과시켜 못 잡는다.
 *
 * ⚠️ **인가를 지나지 않는다** — 공개 문서라 로그인 없이 읽혀야 한다(`entry-points.test.ts`의
 * `EXEMPT`에 이름으로 등재). 같은 이유로 middleware matcher에도 없다.
 */
export default function Privacy() {
  return <PublicDoc title={m.publicDocs.privacy.title} body={m.publicDocs.privacy.body} />;
}
