"use client";

import { RootFallback } from "@/components/root-fallback";
import { Button, ButtonLink } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { routes } from "@/lib/routes";

/**
 * 루트 오류 경계 (audit #17) — `(edit)` 그룹 밖 화면(`/invite`·`/signin`·`/signin/link`)의 예외가 여기 온다.
 * ⚠️ **`error.message`를 그리지 않는다** — 프로덕션에서는 요약된 문자열이고, 개발에서는 내부 사정(쿼리·경로)이다.
 */
/*
  ⚠️ **`reset`이 아니라 `retry`다** (Next 16.3 — `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`).
  `reset`은 다시 가져오지 않고 다시 그리기만 해서, 서버 렌더에서 난 오류는 같은 오류를 다시 낸다.
*/
export default function RootError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <RootFallback title={m.crash.title} description={m.crash.description}>
      <Button size="lg" variant="primary" className="w-full" onClick={() => retry()}>{m.common.retry}</Button>
      <ButtonLink size="lg" className="w-full" href={routes.projects()}>{m.notFound.action}</ButtonLink>
    </RootFallback>
  );
}
