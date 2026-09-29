"use client";

import { Info } from "lucide-react";
import { useId, useState } from "react";

import { CopyButton } from "@/components/onboarding/copy-button";
import { WorkflowBlock } from "@/components/onboarding/workflow-block";
import { RowCard } from "@/components/ui/row-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { m } from "@/lib/i18n";
import { BROWSER_CLIENTS, CONNECT_CLIENTS, CONNECT_METHODS, connectSnippet, SERVER_KEY, type BrowserClient, type ConnectClient, type ConnectMethod } from "@/lib/mcp/snippets";

/**
 * Connect 카드 (mcp-connector 핸드오프 `1a`–`1c` 아래 카드 · §7 · mcp-oauth 핸드오프 §7.4). **토큰 유무와 무관하게 선다** — 브라우저 방식은 비밀값이
 * 없고, 토큰 방식 조각은 값이 아니라 `$MALMOI_TOKEN` 참조라 토큰이 없어도 미리 붙여 둘 수 있다.
 *
 * ⚠️ **방식이 먼저다**(기본 `Sign in with browser`) — 두 방식을 한 조각에 섞지 않는다. 방식을 바꾸면 클라이언트는 Claude Code로 돌아간다
 * (목록이 방식마다 다르다: 브라우저는 claude.ai, 토큰은 Cursor).
 * ⚠️ **구획 둘 사이 선이 `#f0f0f0`이다**(`border-divider`) — 두 항목이 아니라 한 카드의 두 구획이다.
 * ⚠️ **스니펫은 `WorkflowBlock` 형이다 — 공개 문서의 `CodeBlock`이 아니다**(파일명 바 40은 원고용). 그래서 mono 자리가 늘지 않는다
 * (`<pre>` 둘 — DESIGN §4.1 · `surface-rules.test.ts`). 경로는 sans 평문에 색만 올린다.
 * ⚠️ 탭은 새로고침에 남기지 않는다(핸드오프 §9 — 클라이언트 상태).
 */
export function ConnectCard({ serverUrl }: { serverUrl: string }) {
  const [method, setMethod] = useState<ConnectMethod>("browser");
  const [client, setClient] = useState<ConnectClient | BrowserClient>("claude-code");
  const helpId = useId();
  const clients: readonly (ConnectClient | BrowserClient)[] = method === "browser" ? BROWSER_CLIENTS : CONNECT_CLIENTS;

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
        <div className="flex flex-col gap-2">
          <SegmentedControl
            label={m.mcpConnector.connect.method}
            value={method}
            options={CONNECT_METHODS.map((value) => ({ value, label: m.mcpConnector.connect.methods[value] }))}
            onChange={(next) => {
              setMethod(next);
              setClient("claude-code");
            }}
            describedBy={helpId}
            className="w-[360px]"
          />
          <p id={helpId} className="text-muted-foreground text-xs leading-[1.6]">
            {method === "browser" ? m.mcpConnector.connect.browserHelp : m.mcpConnector.connect.tokenHelp}
          </p>
        </div>
        <SegmentedControl
          label={m.mcpConnector.connect.agent}
          value={client}
          options={clients.map((value) => ({ value, label: m.mcpConnector.connect.clients[value] }))}
          onChange={setClient}
        />
        {client === "claude-ai" ? (
          // claude.ai는 설정 파일이 아니라 웹 화면이다 — 조각 없이 단계 셋(핸드오프 `2b`).
          <ol data-connect-steps className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-[1.6]">
            {m.mcpConnector.connect.claudeAiSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : (
          <Snippet client={client} method={method} serverUrl={serverUrl} />
        )}
      </div>
    </RowCard>
  );
}

function Snippet({ client, method, serverUrl }: { client: ConnectClient; method: ConnectMethod; serverUrl: string }) {
  const snippet = connectSnippet(client, serverUrl, method);
  const oauthClient = method === "browser" && (client === "claude-code" || client === "codex") ? client : null;
  return (
    <>
      <WorkflowBlock
        yaml={snippet.body}
        saveAs={m.mcpConnector.connect.addTo(<span className="text-foreground">{snippet.path}</span>)}
        copyLabel={m.common.copy}
      />
      {oauthClient !== null && (
        <div data-connect-then className="flex flex-col gap-3">
          <p className="text-sm leading-[1.6]">{m.mcpConnector.connect.then[oauthClient](SERVER_KEY)}</p>
          <p className="text-muted-foreground flex gap-2 text-xs leading-[1.6]">
            <Info className="mt-[3px] size-3.5 shrink-0" aria-hidden />
            <span>{m.mcpConnector.connect.switchFromToken[oauthClient]}</span>
          </p>
        </div>
      )}
    </>
  );
}
