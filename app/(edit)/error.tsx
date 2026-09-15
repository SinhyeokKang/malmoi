"use client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/lib/i18n";
import { ContentPanel, PanelBody } from "@/components/shell/content-panel";

export default function PageError({ reset }: { reset: () => void }) {
  return (
    <ContentPanel>
      <PanelBody>
        <div className="space-y-4">
          <Alert variant="danger">{m.errors.access.unavailable}</Alert>
          <Button type="button" onClick={reset}>{m.common.retry}</Button>
        </div>
      </PanelBody>
    </ContentPanel>
  );
}
