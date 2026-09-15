"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { adapterErrorMessage } from "@/lib/i18n/adapter-errors";
import { summarizeImport, type RepositoryImportOutcome, type RepositoryImportError, type SurfaceImportReason } from "@/lib/import/result";
import { onboardErrorMessage, isOnboardError } from "@/lib/onboarding/message";
import { importFailureMessage, isImportFailureCode } from "@/lib/projects/import-failure";

function reasonMessage(reason: RepositoryImportError | SurfaceImportReason): string {
  if (Object.hasOwn(m.repositorySync.errors, reason)) return m.repositorySync.errors[reason as keyof typeof m.repositorySync.errors];
  if (isAccessError(reason)) return accessErrorMessage(reason);
  if (isOnboardError(reason)) return onboardErrorMessage(reason);
  if (isConnectError(reason)) return connectErrorMessage(reason);
  if (isImportFailureCode(reason)) return importFailureMessage(reason);
  return m.projects.importFailure.importFailed;
}

/** Raw outcomes live in the stable Home host, never inside the action trigger. */
export function SyncResult({ outcome, onRetry }: { outcome: RepositoryImportOutcome | null; onRetry?: () => void }) {
  if (outcome === null) return null;
  if (!outcome.ok) return <Alert variant="danger" title={m.repositorySync.failedTitle}>{reasonMessage(outcome.error)}</Alert>;
  const summary = summarizeImport(outcome.surfaces);
  const replaced = summary.imported + summary.partial > 0;
  const base = replaced ? m.repositorySync.completed(summary.keys) : m.repositorySync.failedTitle;
  const title = summary.unreadable.length ? m.repositorySync.withIssue(base, m.repositorySync.unreadable(summary.unreadable.length)) :
    summary.superseded.length + summary.invalidFormat.length ? m.repositorySync.withIssue(base, m.repositorySync.notReplaced(summary.superseded.length + summary.invalidFormat.length)) : base;
  const retry = summary.unreadable.length + summary.superseded.length > 0;
  const partialFailures = outcome.surfaces.filter(surface => surface.status === "partial").reduce((sum, surface) => sum + surface.failed, 0);
  return <Alert variant={summary.tone} role="status" title={title}
    actions={retry && onRetry ? <Button onClick={onRetry}>{m.common.retry}</Button> : undefined}>
    {summary.unreadable.length > 0 && summary.superseded.length + summary.invalidFormat.length > 0 &&
      <p>{m.repositorySync.notReplaced(summary.superseded.length + summary.invalidFormat.length)}</p>}
    {partialFailures > 0 && <p>{m.repositorySync.partial(partialFailures)}</p>}
    <ul className="space-y-2">
      {[...outcome.surfaces].sort((a, b) => a.surfaceSlug < b.surfaceSlug ? -1 : a.surfaceSlug > b.surfaceSlug ? 1 : 0).map(surface =>
        <li key={surface.surfaceSlug} data-reason={surface.reason ?? undefined}>
          <span className="font-medium">{surface.surfaceSlug}</span>
          {surface.reason !== null && <p>{reasonMessage(surface.reason)}</p>}
          {surface.errors.map((error, index) => <p key={index} data-error-code={error.code} className="whitespace-pre-wrap break-words">{error.path}: {adapterErrorMessage(error)}</p>)}
        </li>)}
    </ul>
    <p className="mt-2">{m.repositorySync.refsHint}</p>
  </Alert>;
}
