import { STALE_AFTER_SECONDS, type SyncErrorCode } from "./plan";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/failure";

/*
  Publish 한 번의 로컬 수명 (ARCHITECTURE §5.6.2).

  ⚠️ **예산(240초)이 stale 창(`STALE_AFTER_SECONDS` 300초)보다 짧아야 한다.** self-hosted의 `next start`는 `maxDuration`을
  강제하지 않는다 — 플랫폼이 함수를 죽여 주지 않으면, 멈췄던 실행이 다음 실행이 창을 넘겨 시작한 뒤 깨어나 늦은 성공을
  쓴다. 예산이 먼저 새 전송과 늦은 DB 쓰기를 막아야 "끝난 실행은 되살아나지 않는다"가 플랫폼과 무관하게 선다.
*/
export const PUBLISH_BUDGET_MS = 240_000;
const RECOVERY_MS = STALE_AFTER_SECONDS * 1000;

/** 남은 예산 — 단조 시계(진입부터)와 실행권 `startedAt` 기준 벽시계 중 짧은 쪽. 잠금·토큰을 기다린 시간도 깎인다. */
export function publishExecutionWindow(input: { startedAt: Date; now: Date; elapsed: number }): number {
  return Math.max(0, Math.min(PUBLISH_BUDGET_MS - input.elapsed, PUBLISH_BUDGET_MS - (input.now.getTime() - input.startedAt.getTime())));
}

export function planPublishBarrier(run: { status: string; errorCode: string | null; startedAt: Date }, now: Date): "running" | "uncertain" | null {
  if (now.getTime() - run.startedAt.getTime() > RECOVERY_MS) return null;
  if (run.status === "RUNNING") return "running";
  return run.status === "FAILED" && run.errorCode === "execution-uncertain" ? "uncertain" : null;
}

/** 전체 이력에서 존재를 묻는다. 최신 성공이 앞선 미확정 실행을 가리지 않는다. */
export function uncertainPublishWhere(projectId: string, now: Date): Prisma.SyncRunWhereInput {
  return { projectId, status: "FAILED", errorCode: "execution-uncertain", startedAt: { gte: new Date(now.getTime() - RECOVERY_MS) } };
}

/** 리포에 쓰기 요청을 보낸 뒤의 실패는 원래 코드가 무엇이든 "결과 미확인"이다 — GitHub가 이미 받았을 수 있다. */
export function planPublishFailure(code: SyncErrorCode, mutationDispatched: boolean): SyncErrorCode {
  return mutationDispatched ? "execution-uncertain" : code;
}

export type PublishExecution = ReturnType<typeof createPublishExecution>;

/** 실행마다 하나. 단조 예산은 runSync 입구부터 세고 DB 잠금 획득 뒤 연장하지 않는다. */
export function createPublishExecution() {
  const began = performance.now();
  let startedAt = new Date();
  const controller = new AbortController();
  let mutationDispatched = false;
  const expired = () => new AppError("Publish execution has ended.");
  const remaining = () => publishExecutionWindow({ startedAt, now: new Date(), elapsed: performance.now() - began });
  const close = () => controller.abort();
  const check = () => {
    if (controller.signal.aborted || remaining() <= 0) { close(); throw expired(); }
  };
  return {
    get mutationDispatched() { return mutationDispatched; },
    bindStartedAt(at: Date) { startedAt = at; check(); },
    check,
    close,
    async run<T>(work: () => Promise<T>): Promise<T> {
      check();
      let rejectDeadline!: (error: Error) => void;
      const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
      const abort = () => rejectDeadline(expired());
      controller.signal.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(close, remaining());
      try {
        const result = await Promise.race([work(), deadline]);
        check();
        return result;
      }
      finally { clearTimeout(timer); controller.signal.removeEventListener("abort", abort); close(); }
    },
    fetch(fetcher: typeof fetch = globalThis.fetch): typeof fetch {
      return async (input, init) => {
        check();
        const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        const signal = requestSignal == null ? controller.signal : AbortSignal.any([controller.signal, requestSignal]);
        signal.throwIfAborted();
        // ⚠️ GET 밖의 요청은 전부 쓰기로 센다 — tree·commit 객체 생성처럼 리포에 안 보이는 POST도 포함한다.
        // 엔드포인트 목록으로 좁히면 새 쓰기 호출이 목록을 비켜 갈 때 미확인 실패가 확정 실패로 새므로 넓게 막는다.
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") mutationDispatched = true;
        const response = await fetcher(input, { ...init, signal });
        check();
        // 본문을 여기서 끝까지 읽는다 — 헤더만 받고 돌려주면 본문 읽기가 예산 밖에서 늘어진다. 로케일 파일 크기라 메모리는 문제가 안 된다.
        if (response.body === null) return response;
        const reader = response.body.getReader();
        const cancel = () => { void reader.cancel().catch(() => {}); };
        signal.addEventListener("abort", cancel, { once: true });
        try {
          const chunks: Uint8Array[] = [];
          for (;;) {
            const chunk = await reader.read();
            signal.throwIfAborted();
            check();
            if (chunk.done) break;
            chunks.push(chunk.value);
          }
          return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
        } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
      };
    },
  };
}
