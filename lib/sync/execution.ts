import { STALE_AFTER_SECONDS, type SyncErrorCode } from "./plan";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/failure";

export const PUBLISH_BUDGET_MS = 240_000;
const RECOVERY_MS = STALE_AFTER_SECONDS * 1000;

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
        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") mutationDispatched = true;
        const response = await fetcher(input, { ...init, signal });
        check();
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
