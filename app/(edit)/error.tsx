"use client";

import { ErrorState } from "@/components/ui/error-state";




import { m } from "@/lib/i18n";
import { ContentPanel, PanelBody } from "@/components/shell/content-panel";

/*
  ⚠️ **`reset`이 아니라 `retry`다** (audit-ux #11 — 루트 `app/error.tsx`와 같은 형, Next 16.3). `reset`은 다시 그리기만
  하고 다시 가져오지 않아, `[slug]` 아래 Members·Sources·Settings·Translations의 서버 오류가 재시도 뒤에도 그대로 났다.
  ⚠️ **Logs 경계(`logs/error.tsx`)와 같은 형이다** (ux-drift-unify 4-Y18) — 옛 판은 제목·글리프 없는 danger Alert라 같은 "불러오지 못했다"가
  두 모양이었다. 무엇이 실패했는지 모르므로 문구는 루트 경계와 같은 `crash`다.
*/
export default function PageError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ContentPanel>
      {/* 세로 중앙은 `flex-1`이 든다 — 셸 안 not-found 둘·`ProjectArchived`와 같은 형(malmoi#162). */}
      <PanelBody className="flex flex-col">
        <div className="flex flex-1 items-center justify-center">
          <ErrorState title={m.crash.title} description={m.crash.description} retry={retry} retryLabel={m.common.retry} />
        </div>
      </PanelBody>
    </ContentPanel>
  );
}
