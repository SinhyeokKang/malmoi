import { PublicDoc } from "@/components/public-doc";
import { readSession } from "@/lib/auth/read-session";
import { m } from "@/lib/i18n";

/**
 * 도움말. 본문은 `m.publicDocs.docs`이고 수·이름은 정본 상수와 대조된다(`docs-content.test.tsx`).
 * `/privacy`와 같은 껍데기(DESIGN §6.61)를 쓴다 — 내용이 갈려도 그릇은 공유한다.
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
