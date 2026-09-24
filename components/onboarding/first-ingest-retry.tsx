"use client";

import { Play } from "lucide-react";
import { useState, useTransition } from "react";

import { runFirstIngest } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AdapterError } from "@/lib/adapters/types";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { adapterErrorMessage } from "@/lib/i18n/adapter-errors";
import { ingestHeadline, isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";

/**
 * 첫 적재 [다시 시도] — **온보딩 결과 화면과 같은 Action이다** (`runFirstIngest`, PRODUCT §7.4).
 * `retryFirstIngest`를 따로 두지 않는 이유는 판정(`awaiting_first_sync`가 아니면 `not-awaiting`)이
 * 한 자리에 있어야 하기 때문이다.
 *
 * ⚠️ **실패 사유는 이 호출의 반환값에만 있다.** 중간 상태를 저장하지 않으므로 화면을
 * 다시 열면 사유를 모른다 — 그래서 인라인으로 남기고 `revalidatePath`가 상태 텍스트를 갱신한다.
 *
 * ⚠️ **`canRun`이 false여도 이 컴포넌트는 마운트된 채 있어야 한다.** 성공하면 `revalidatePath`가
 * 서버를 다시 렌더해 상태가 `ready`로 바뀌는데, 그때 컴포넌트가 사라지면 **방금 받은 결과 문구가
 * 함께 사라진다** — 부분 실패(`failed > 0`)에서 "N couldn't be read"가 아무에게도 닿지 않는다
 * (불변식 9 · 실물 검증 2026-09-07). 같은 자리에 남아 있으면 클라이언트 상태가 재렌더를 넘어간다.
 */
export function FirstIngestRetry({ slug, canRun }: { slug: string; canRun: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { ok: true; text: string; failed: number; errors: AdapterError[] }
    | { ok: false; error: string }
    | null
  >(null);

  return (
    <div className="space-y-2">
      {canRun && (
        <Button
          loading={pending}
          onClick={() => {
            setResult(null);
            startTransition(async () => {
              const outcome = await runFirstIngest({ slug });
              setResult(
                outcome.ok
                  // 불변식 9 — 0건이 아니면 성공 문구를 그대로 쓰지 않는다.
                  ? {
                      ok: true,
                      text: ingestHeadline(outcome.count, outcome.failed, outcome.unmanaged),
                      // ⚠️ **tone도 `failed`가 정한다** — `errors.length`(상위 5건)로 고르면 진단 목록이
                      // 빈 부분 실패가 `success`로 그려진다 (code-review 2026-09-08 · 불변식 9).
                      failed: outcome.failed,
                      errors: outcome.errors,
                    }
                  : { ok: false, error: outcome.error },
              );
            });
          }}
        >
          <Play aria-hidden />
          {m.settings.status.run}
        </Button>
      )}
      {result !== null &&
        (result.ok ? (
          <Alert variant={result.failed === 0 ? "success" : "warning"}>
            <p>{result.text}</p>
            {/*
              ⚠️ **어느 파일을 못 읽었는지 함께 보인다** (2026-09-07 리뷰 ⚪12). 헤드라인은 개수만
              말하는데 그것만으로는 사용자가 할 일이 없다 — 온보딩 결과 화면과 같은 상위 5건이다.
              같은 파일에 에러가 둘 나올 수 있어 index를 섞는다(표시 전용 목록이다).
            */}
            {/* ⚠️ `<details>`는 블록이라 `<p>` 안에 넣지 않는다 — 파서가 `<p>`를 먼저 닫아 트리가 갈린다 */}
            {result.errors.slice(0, 5).map((e, index) => (
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
        ) : (
          <Alert variant="danger">{messageFor(result.error)}</Alert>
        ))}
    </div>
  );
}

function messageFor(error: string): string {
  if (isOnboardError(error)) return onboardErrorMessage(error);
  if (isAccessError(error)) return accessErrorMessage(error);
  return m.settings.status.failed;
}
