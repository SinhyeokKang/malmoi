import { PublicDoc } from "@/components/public-doc";
import { readSession } from "@/lib/auth/read-session";
import { m } from "@/lib/i18n";

/**
 * ⚠️ **본문이 아직 placeholder다** — 그릇만 §6.61로 섰고 내용은 launch-readiness L2.3이 쓴다.
 * `/privacy`와 같은 껍데기를 쓴다: 두 화면이 **지금은 같은 것이 사실**이라 사본을 만들지 않고,
 * 내용이 갈리는 시점에도 그릇은 공유한다.
 *
 * ⚠️ **인가를 지나지 않는다** — 공개 문서다 (`EXEMPT`에 등재). 세션은 복귀 링크 하나 때문에 읽는다.
 */
export default async function Docs() {
  const session = await readSession();

  return (
    <PublicDoc
      title={m.publicDocs.docs.title}
      intro={m.publicDocs.docs.intro}
      sections={m.publicDocs.docs.sections}
      signedIn={session.status === "ok"}
    />
  );
}
