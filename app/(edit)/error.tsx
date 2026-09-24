"use client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { ContentPanel, PanelBody } from "@/components/shell/content-panel";

/*
  ⚠️ **`reset`이 아니라 `retry`다** (audit-ux #11 — 루트 `app/error.tsx`와 같은 형, Next 16.3). `reset`은 다시 그리기만
  하고 다시 가져오지 않아, `[slug]` 아래 Members·Sources·Settings·Translations의 서버 오류가 재시도 뒤에도 그대로 났다.
*/
export default function PageError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ContentPanel>
      <PanelBody>
        <div className="space-y-4">
          <Alert variant="danger">{m.errors.access.unavailable}</Alert>
          <Button type="button" variant="primary" onClick={() => retry()}>{m.common.retry}</Button>
        </div>
      </PanelBody>
    </ContentPanel>
  );
}
