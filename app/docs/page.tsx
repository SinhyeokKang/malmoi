import { PublicDoc } from "@/components/public-doc";
import { m } from "@/lib/i18n";

/**
 * ⚠️ **placeholder다** (8-1a) — `/privacy`와 같은 껍데기를 쓴다. 두 화면이 **지금은 같은 것이
 * 사실**이라 사본을 만들지 않고, 내용이 갈리는 시점에 각자 갖는다.
 *
 * ⚠️ **인가를 지나지 않는다** — 공개 문서다 (`EXEMPT`에 등재).
 */
export default function Docs() {
  return <PublicDoc title={m.publicDocs.docs.title} body={m.publicDocs.docs.body} />;
}
