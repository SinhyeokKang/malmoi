"use client";

import { CopyButton } from "../copy-button";
import { m } from "@/lib/i18n";

import { WorkflowBlock } from "../workflow-block";

/** ④는 프로젝트와 모든 첫 적재가 커밋된 뒤에만 열린다. */
export function ResultStep({ pushToken, yaml }: { pushToken: string; yaml: string }) {
  return (
    /* ⚠️ **본문이 스크롤하지 않는다** — 껍데기가 `bodyScroll="hidden"`이고 YAML 블록이 자기 스크롤을 든다. */
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <section className="flex shrink-0 flex-col gap-2">
        <p className="text-sm font-medium">{m.newProject.result.token.title}</p>
        {/*
          ⚠️ **값 칩이 필드와 같은 형이다** — 높이 36 · radius 10 · border · 안쪽 여백 10 (핸드오프 1d).
          ⚠️ **mono는 YAML 블록 하나뿐이다** — 토큰 칩도 sans다 (DESIGN §4.1). `<code>`는 preflight가
          mono를 깔아서 `font-sans`를 명시한다.
        */}
        <div className="flex items-center gap-2">
          <code className="border-input bg-muted flex h-9 min-w-0 flex-1 items-center truncate rounded-md border px-2.5 font-sans text-xs">
            {pushToken}
          </code>
          <CopyButton value={pushToken} />
        </div>
        {/* ⚠️ `PUSH_TOKEN`은 색만 올린다 (1d). */}
        <p className="text-muted-foreground text-xs leading-[1.7]">
          {m.newProject.result.token.description(<span className="text-foreground">PUSH_TOKEN</span>)}
        </p>
      </section>

      {/* ⚠️ **워크플로 블록이 남은 높이를 먹는다** — 그래서 토큰 칩이 늘 화면에 남는다. */}
      <WorkflowBlock
        yaml={yaml}
        saveAs={
          <>
            {m.newProject.result.workflow.saveAs}{" "}
            <span className="text-foreground">.github/workflows/malmoi-i18n.yml</span>
          </>
        }
        copyLabel={m.common.copy}
      />

      <p className="text-muted-foreground shrink-0 text-xs leading-[1.6]">{m.newProject.result.ingest.refsHint}</p>
    </div>
  );
}
