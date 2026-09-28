"use client";

import { useState } from "react";

import { CopyButton } from "@/components/onboarding/copy-button";
import { WorkflowBlock } from "@/components/onboarding/workflow-block";
import { RowCard } from "@/components/ui/row-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { m } from "@/lib/i18n";
import { CONNECT_CLIENTS, connectSnippet, type ConnectClient } from "@/lib/mcp/snippets";

/**
 * Connect 카드 (핸드오프 `1a`–`1c` 아래 카드 · §7). **토큰 유무와 무관하게 선다** — 조각이 값이 아니라 `$MALMOI_TOKEN` 참조라
 * 토큰이 없어도 미리 붙여 둘 수 있다.
 *
 * ⚠️ **구획 둘 사이 선이 `#f0f0f0`이다**(`border-divider`) — 두 항목이 아니라 한 카드의 두 구획이다.
 * ⚠️ **스니펫은 `WorkflowBlock` 형이다 — 공개 문서의 `CodeBlock`이 아니다**(파일명 바 40은 원고용). 그래서 mono 자리가 늘지 않는다
 * (`<pre>` 둘 — DESIGN §4.1 · `surface-rules.test.ts`). 경로는 sans 평문에 색만 올린다.
 * ⚠️ 탭은 새로고침에 남기지 않는다(핸드오프 §9 — 클라이언트 상태).
 */
export function ConnectCard({ serverUrl }: { serverUrl: string }) {
  const [client, setClient] = useState<ConnectClient>("claude-code");
  const snippet = connectSnippet(client, serverUrl);
  return (
    <RowCard title={m.mcpConnector.connect.title}>
      <div className="border-foreground/[0.06] border-t px-4 py-3.5">
        <div className="grid grid-cols-[120px_1fr] items-center gap-3">
          <span className="text-xs text-neutral-400">{m.mcpConnector.connect.serverUrl}</span>
          <div className="flex items-center gap-2">
            {/* ⚠️ `<code>`는 preflight가 mono를 깐다 — sans를 명시한다(mono는 `<pre>`뿐). 칩은 필드와 같은 형 36 · radius 10. */}
            <code data-server-url className="border-input bg-muted flex h-9 min-w-0 flex-1 items-center truncate rounded-md border px-2.5 font-sans text-sm">
              {serverUrl}
            </code>
            <CopyButton value={serverUrl} />
          </div>
        </div>
      </div>
      <div className="border-foreground/[0.06] flex flex-col gap-4 border-t p-4">
        <SegmentedControl
          label={m.mcpConnector.connect.agent}
          value={client}
          options={CONNECT_CLIENTS.map((value) => ({ value, label: m.mcpConnector.connect.clients[value] }))}
          onChange={setClient}
        />
        <WorkflowBlock
          yaml={snippet.body}
          saveAs={m.mcpConnector.connect.addTo(<span className="text-foreground">{snippet.path}</span>)}
          copyLabel={m.common.copy}
        />
      </div>
    </RowCard>
  );
}
