import { isDeepStrictEqual } from "node:util";
import { hasActiveImport } from "./plan";

/** 연결 열 전부가 든다 — 다운로드 동안 재연결(GitHub 재설치·GitLab 다른 OWNER의 재연결)이 끼면 `superseded`다. */
export type ImportSettings = {
  repoHost: string; repositoryId: string | null; installationId: string | null; gitlabConnectionId: string | null;
  repoOwner: string; repoName: string; baseBranch: string;
  adapterName: string | null; pathTemplate: string | null; baseLocale: string | null;
  nested: boolean | null; nestedByPath: unknown;
};
export type ImportApplyInput = {
  now: Date; token: string; currentToken: string | null; startedAt: Date | null;
  capturedRevision: number; currentRevision: number;
  authorized: boolean; archived: boolean;
  capturedSettings: ImportSettings; currentSettings: ImportSettings;
};

export function planImportApply(input: ImportApplyInput) {
  if (input.currentToken !== input.token || !hasActiveImport(input.startedAt, input.now) || !input.authorized || input.archived) {
    return { ok: false, reason: "lease-lost" } as const;
  }
  if (input.currentRevision !== input.capturedRevision || !isDeepStrictEqual(input.capturedSettings, input.currentSettings)) {
    return { ok: false, reason: "superseded" } as const;
  }
  return { ok: true } as const;
}
