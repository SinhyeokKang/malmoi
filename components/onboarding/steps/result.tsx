"use client";

import { SecretField } from "@/components/ui/secret-field";
import { useMessages } from "@/components/i18n/messages-provider";

import { WorkflowBlock } from "../workflow-block";

/** ④는 프로젝트와 모든 첫 적재가 커밋된 뒤에만 열린다. */
export function ResultStep({ pushToken, yaml }: { pushToken: string; yaml: string }) {
  const m = useMessages();
  return (
    /* ⚠️ **본문이 스크롤하지 않는다** — 껍데기가 `bodyScroll="hidden"`이고 YAML 블록이 자기 스크롤을 든다. */
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <section className="flex shrink-0 flex-col gap-2">
        <p className="text-sm font-medium">{m.newProject.result.token.title}</p>
        <SecretField value={pushToken} label={m.newProject.result.token.title} />
        {/* ⚠️ `PUSH_TOKEN`은 색만 올린다 (1d). */}
        <p className="text-muted-foreground text-xs leading-prose">
          {m.newProject.result.token.description(<span className="text-foreground">PUSH_TOKEN</span>)}
        </p>
      </section>

      {/* ⚠️ **워크플로 블록이 남은 높이를 먹는다** — 그래서 토큰 칩이 늘 화면에 남는다. */}
      <WorkflowBlock m={m} yaml={yaml} />

      <p className="text-muted-foreground shrink-0 text-xs leading-body">{m.newProject.result.ingest.refsHint}</p>
    </div>
  );
}
