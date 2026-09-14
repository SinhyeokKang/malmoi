"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CopyButton } from "../copy-button";
import { m } from "@/lib/i18n";
import { adapterErrorMessage } from "@/lib/i18n/adapter-errors";
import type { AdapterError } from "@/lib/adapters/types";
import { ingestHeadline } from "@/lib/onboarding/message";

import { WorkflowBlock } from "../workflow-block";
import { failureText } from "../failure";

/**
 * ④ 토큰·워크플로 + 첫 적재. **토큰 원문은 이 화면에서만 보인다** (design §3.13).
 *
 * ⚠️ **적재가 도는 동안에도 토큰·YAML이 보이고 [Start translating]이 눌린다.** 비활성이면 토큰을
 * 이미 옮긴 사용자가 60초를 갇힌다.
 *
 * ⚠️ **적재 생존을 약속하지 않는다** (design §1.4) — 닫으면 끝까지 안 돌 수 있고, 그 대신 복구
 * 경로 둘(`first-ingest-retry` · `rotatePushToken`)이 실재한다는 사실을 help 줄이 말한다.
 */
export type Ingest =
  | { status: "running" }
  | { status: "done"; count: number; failed: number; errors: AdapterError[] }
  | { status: "failed"; error: string };

export function ResultStep({
  pushToken,
  yaml,
  pathTemplate,
  branch,
  ingest,
  onRetry,
}: {
  pushToken: string;
  yaml: string;
  pathTemplate: string;
  branch: string;
  ingest: Ingest | null;
  onRetry: () => void;
}) {
  return (
    /* ⚠️ **본문이 스크롤하지 않는다** — 껍데기가 `bodyScroll="hidden"`이고 YAML 블록이 자기 스크롤을 든다. */
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <section className="flex shrink-0 flex-col gap-2">
        <p className="text-sm font-medium">{m.newProject.result.token.title}</p>
        {/*
          ⚠️ **값 칩이 필드와 같은 형이다** — 높이 36 · radius 10 · border · 안쪽 여백 10 (핸드오프 1d).
          토큰은 사람이 그대로 옮겨 적는 값이라 여기와 YAML **둘만** mono다.
        */}
        <div className="flex items-center gap-2">
          <code className="text-mono border-input bg-muted flex h-9 min-w-0 flex-1 items-center truncate rounded-md border px-2.5">
            {pushToken}
          </code>
          <CopyButton value={pushToken} />
        </div>
        {/* ⚠️ `PUSH_TOKEN`은 **읽는 값**이라 mono가 아니다 — 색만 올린다 (1d). */}
        <p className="text-muted-foreground text-xs leading-[1.7]">
          {m.newProject.result.token.description(<span className="text-foreground">PUSH_TOKEN</span>)}
        </p>
      </section>

      {/*
        ⚠️ **tone을 `failed`가 정한다** — 0건이 아니면 성공 문구를 그대로 쓰지 않는다 (불변식 9).

        ⚠️ **성공한 적재에는 그릇이 없다** (핸드오프 1d). 결과는 모달의 **설명 줄**이 말하고, 본문에
        `Alert`를 세우는 것은 적재 중·부분 실패·실패 셋뿐이다 — 가장 흔한 상태가 가장 조용하다.
      */}
      {ingest === null || ingest.status === "running" ? (
        // ⚠️ `Alert`의 `role="alert"`는 `danger`일 때만 붙는다 — 적재 중은 `role="status"`다.
        <Alert variant="info" role="status">
          {m.newProject.result.ingest.importing(pathTemplate, branch)}
        </Alert>
      ) : ingest.status === "failed" ? (
        <div className="flex flex-col gap-2">
          <Alert variant="danger">{failureText(ingest.error, true)}</Alert>
          <p className="text-muted-foreground text-xs">{m.newProject.result.ingest.failedHint}</p>
          <div>
            <Button variant="default" onClick={onRetry}>
              {m.newProject.result.ingest.retry}
            </Button>
          </div>
        </div>
      ) : ingest.failed === 0 ? null : (
        <Alert variant="warning">
          <p>{ingestHeadline(ingest.count, ingest.failed)}</p>
          {/* 같은 파일에 에러가 둘 나올 수 있어 index를 섞는다 — 표시 전용 목록이다 */}
          {ingest.errors.slice(0, 5).map((e, index) => (
            <div key={`${index} ${e.path}`} className="text-xs">
              {m.newProject.result.ingest.couldNotRead(e.path)}
              {/* 진단은 접어 둔다 — 코드는 사전이 문장으로 내고 파서 원문은 그 뒤에 붙는다 (6b-1) */}
              <details className="mt-0.5">
                <summary className="cursor-pointer">{m.newProject.result.ingest.diagnostics}</summary>
                {/* ⚠️ `detail`이 여러 줄일 수 있다 — YAML 파서가 캐럿 다이어그램을 넣는다. `text-mono`엔
                    `white-space`가 없어 기본값이 개행을 공백으로 접고 캐럿이 가리킬 열을 잃는다 */}
                <span className="text-mono whitespace-pre-wrap">{adapterErrorMessage(e)}</span>
              </details>
            </div>
          ))}
        </Alert>
      )}

      {/* ⚠️ **워크플로 블록이 남은 높이를 먹는다** — 그래서 토큰 칩이 늘 화면에 남는다. */}
      <WorkflowBlock
        yaml={yaml}
        saveAs={
          <>
            {m.newProject.result.workflow.saveAs}{" "}
            <span className="text-mono text-foreground">.github/workflows/malmoi-i18n.yml</span>
          </>
        }
        copyLabel={m.common.copy}
      />

      <p className="text-muted-foreground shrink-0 text-xs leading-[1.6]">{m.newProject.result.ingest.refsHint}</p>
      {/*
        ⚠️ **"닫아도 된다"를 성공 화면이 말하지 않는다** (2026-09-13 사용자 — 핸드오프 1d의 `<pre>`
        아래는 한 줄뿐이다). 적재 생존을 약속하지 않는다는 판정(결정 ⑩)은 그대로지만, **그 말이
        필요한 시점은 적재가 실패했을 때**이고 그 자리에는 `ingest.failedHint`가 이미 서 있다 —
        성공 화면에서 미리 말하면 방금 된 일을 의심하게 만든다.
        [Start translating]은 **껍데기의 [Next]**다 — 바닥 버튼을 단계가 다시 그리지 않는다.
      */}
    </div>
  );
}
