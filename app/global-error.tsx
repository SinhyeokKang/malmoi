"use client";

import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";

/**
 * 루트 레이아웃까지 죽었을 때 (audit #17). **루트 레이아웃을 대신하므로 `<html>`·`<body>`를 스스로 든다.**
 *
 * ⚠️ **맨 HTML이다 — 전역 스타일을 읽지 않는다.** 이 문서는 `globals.css`를 포함하지 않고(Next 16 문서), 읽으려면 그 import가
 * 클라이언트 그래프에 들어간다(`client-graph.test.ts`의 허용 목록 밖). 레이아웃이 죽은 마지막 자리라 **읽히는 문장과 누를 버튼**이
 * 전부이고, 모양은 브라우저 기본값이다(버튼 클래스도 스타일시트가 없어 먹지 않는다) — 스타일을 되살리려고 무게를 더하면 이 화면이 다시 던질 표면이 커진다.
 * ⚠️ 출구가 [Try again] 하나다 — 레이아웃이 죽은 상태에서 다른 라우트로 가도 같은 레이아웃을 지난다.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>{m.crash.title}</h1>
          <p>{m.crash.description}</p>
          {/* 프리미티브를 지난다(`focus-ring.test.ts`) — 스타일은 안 붙어도 포커스 규약의 소유자는 한 곳이다. */}
          <Button type="button" onClick={() => retry()}>{m.common.retry}</Button>
        </main>
      </body>
    </html>
  );
}
