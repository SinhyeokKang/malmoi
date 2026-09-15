import { isDeepStrictEqual } from "node:util";
import { hasActiveImport } from "./plan";

export type ImportSettings = {
  repositoryId: string | null; installationId: string | null;
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
