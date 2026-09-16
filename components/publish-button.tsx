"use client";
import { flagFor } from "@/lib/keys/flag";
import { diffWords } from "@/lib/publish/words";
import { Send, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject, type ReactNode } from "react";
import { triggerPullAction } from "@/app/(edit)/actions";
import { loadPublishPreview } from "@/app/(edit)/publish-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { OnboardingModal } from "@/components/ui/modal";
import { m } from "@/lib/i18n";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { onboardErrorMessage, isOnboardError } from "@/lib/onboarding/message";
import type { PullOutcome } from "@/lib/pull/message";
import type { PublishModalState } from "@/lib/publish/preview";
import { planPublishButton, planPublishView } from "@/lib/publish/plan";
import { summarizeWarnings } from "@/lib/publish/warnings";

/** 조건부 모달이 아니라 무조건 렌더되는 호스트가 든다 — 닫기·refresh가 실행 결과를 지우면 안 된다. */
export function usePublish(slug: string) {
  const router = useRouter();
  const [state, setState] = useState<PublishModalState>({ kind: "preview-loading" });
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PullOutcome | null>(null);
  const current = useRef(state); current.current = state;
  const running = useRef(false);
  const generation = useRef(0);
  const host = useRef(0);
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    host.current++; generation.current++; running.current = false;
    setOpen(false); setPending(false); setResult(null); setState({ kind: "preview-loading" });
    return () => { host.current++; generation.current++; };
  }, [slug]);
  function close() { generation.current++; setOpen(false); }
  async function preview() {
    if (running.current) return;
    const request = ++generation.current;
    const loading = { kind: "preview-loading" } as const;
    current.current = loading; setState(loading); setOpen(true);
    try {
      const data = await loadPublishPreview({ slug });
      if (request !== generation.current) return;
      const next: PublishModalState = data ? { kind: "preview-ready", preview: data } : { kind: "preview-error" };
      current.current = next; setState(next);
    } catch {
      if (request === generation.current) { current.current = { kind: "preview-error" }; setState(current.current); }
    }
  }
  async function confirm() {
    if (running.current || current.current.kind !== "preview-ready") return;
    const owner = host.current;
    running.current = true; generation.current++; setPending(true);
    current.current = { kind: "running" }; setState(current.current);
    const next: PullOutcome = await triggerPullAction(slug).catch(() => ({ status: "failed", error: "unavailable", retryable: true, delivery: "unknown" }));
    if (owner !== host.current) return;
    running.current = false; setPending(false); setResult(next);
    current.current = { kind: "result", outcome: next }; setState(current.current);
    if (next.status !== "failed") router.refresh();
  }
  function showResult() { if (result) { generation.current++; setState({ kind: "result", outcome: result }); setOpen(true); } }
  function launch() { if (running.current) { setState({ kind: "running" }); setOpen(true); } else void preview(); }
  return { state, open, pending, result, triggerRef, close, preview, confirm, showResult, launch };
}
export type PublishController = ReturnType<typeof usePublish>;

export function PublishButton({ count, publish, disabled = false }: { count: number; publish: PublishController; disabled?: boolean }) {
  const plan = planPublishButton({ count, paused: disabled, otherPending: false, publishPending: publish.pending });
  return <div className="flex items-center gap-2">
    <span title={plan.hint}>
      <Button variant="primary" disabled={plan.disabled} onClick={event => { publish.triggerRef.current = event.currentTarget; publish.launch(); }}>
        {publish.pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {publish.pending ? m.translations.publish.publishing : m.translations.publish.button}
        {plan.badge !== null && <span className="bg-background/20 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-px text-xs">{plan.badge.toLocaleString("en-US")}</span>}
      </Button>
    </span>
    {!publish.pending && publish.result && <Button onClick={event => { publish.triggerRef.current = event.currentTarget; publish.showResult(); }}>{m.translations.publish.viewResult}</Button>}
  </div>;
}
const p = m.translations.publish;
function failureText(outcome: Extract<PullOutcome, { status: "failed" }>) {
  if (isAccessError(outcome.error)) return accessErrorMessage(outcome.error);
  if (isOnboardError(outcome.error)) return onboardErrorMessage(outcome.error);
  return outcome.error === "invalid input" ? accessErrorMessage("forbidden") : outcome.error;
}
function Progress() {
  const [stage, setStage] = useState(0);
  useEffect(() => { const a = setTimeout(() => setStage(1), 2500); const b = setTimeout(() => setStage(2), 6500); return () => { clearTimeout(a); clearTimeout(b); }; }, []);
  return <ol className="space-y-5 text-muted-foreground">{p.progress.map((text, i) => <li key={text} className="flex items-center gap-3">{i === stage && <LoaderCircle className="size-4 animate-spin" aria-hidden />}{text}</li>)}</ol>;
}
function DiffValue({ before, after }: { before: string | null; after: string }) {
  const diff = diffWords(before ?? "", after);
  return <div className="grid grid-cols-2 gap-3 whitespace-pre-wrap break-words">
    <div><span className="text-xs text-muted-foreground">{p.before}</span><p>{before === null ? p.absent : diff.before.map((part,i) => <span key={i} className={part.changed ? "bg-red-50 text-red-700" : undefined}>{part.text}</span>)}</p></div>
    <div><span className="text-xs text-muted-foreground">{p.after}</span><p>{diff.after.map((part,i) => <span key={i} className={part.changed ? "bg-green-50 text-green-700" : undefined}>{part.text}</span>)}</p></div>
  </div>;
}
function Warnings({ warnings }: { warnings: readonly string[] }) {
  if (!warnings.length) return null;
  return <section><h3 className="font-medium">{p.warnings(warnings.length)}</h3><p className="text-sm">{p.notWritten}</p>
    {summarizeWarnings(warnings).map((group,i) => <div key={i} className="mt-3"><p className="text-xs font-medium">{group.file}</p><ul>{group.messages.map((message,j) => <li key={j} className="whitespace-pre-wrap text-xs">{message}</li>)}</ul></div>)}
  </section>;
}
export function PublishModal({ slug, publish, fallbackFocusRef }: { slug: string; publish: PublishController; fallbackFocusRef: RefObject<HTMLElement | null> }) {
  const { state } = publish;
  let title: string; let body: ReactNode; let actions: ReactNode = null; let footer: ReactNode = null; let quiet = false; let narrow = false;
  switch (state.kind) {
    case "preview-loading": title = p.loading; body = <><p>{p.prUnknown}</p><div className="bg-muted h-40 animate-pulse rounded-lg" /></>; break;
    case "preview-error": title = p.previewFailed; body = <div className="border-divider rounded-lg border p-4">{p.previewFailedBody}</div>; footer = p.notStarted; actions = <Button onClick={() => void publish.preview()}>{p.retry}</Button>; break;
    case "preview-ready": {
      const data = state.preview;
      title = p.previewTitle(data.total); footer = p.summary(data.total);
      actions = <Button variant="primary" onClick={() => void publish.confirm()}>{p.confirm}</Button>;
      body = <><p className="text-sm">{data.openPr === undefined ? p.prUnknown : data.openPr === null ? p.prNone : p.overwrite(data.openPr.number)}</p>
        <div className="min-h-0 overflow-auto">{data.groups.map(group => <section key={`${group.surface}:${group.path}`}>
          <h3 className="bg-muted px-3 py-2 text-xs">{group.surface}: {group.path}</h3>
          <table className="w-full table-fixed text-sm"><thead><tr><th className="w-40 text-left">{p.key}</th><th className="w-20 text-left">{p.locale}</th><th className="text-left">{p.value}</th></tr></thead>
            <tbody>{group.rows.map(row => <tr key={`${row.keyId}:${row.localeCode}`} className={row.keySpan > 0 ? "border-divider border-t align-top" : "align-top"}>
              {row.keySpan > 0 && <td rowSpan={row.keySpan} className="break-words p-2">{row.key}</td>}
              <td className="p-2">{flagFor(row.localeCode) && <img src={`/flags/${flagFor(row.localeCode)}.svg`} alt="" className="mr-1 inline-block h-3 w-4" />}{row.localeCode}</td><td className="p-2"><DiffValue before={row.before} after={row.after} /><p className="mt-2 text-xs text-muted-foreground">{row.author}</p></td>
            </tr>)}</tbody></table></section>)}
          {data.truncated > 0 && <p className="mt-3 text-sm">{p.truncated(data.truncated)}</p>}
        </div></>; break;
    }
    case "running": title = p.publishing; body = <Progress />; footer = p.leave; break;
    case "result": {
      const outcome = state.outcome; const view = planPublishView(outcome);
      switch (view) {
        case "created": title = p.created; break;
        case "updated": title = p.updated; break;
        case "partial": title = p.partial; break;
        case "no-changes": title = p.noChanges; break;
        case "config-error": title = outcome.status === "failed" && !outcome.code ? failureText(outcome) : p.configError; break;
        case "transient-error": title = p.transientError; break;
        case "already-running": title = p.alreadyRunning; narrow = true; break;
        case "too-soon": title = p.tooSoon; narrow = true; break;
        default: { const exhaustive: never = view; return exhaustive; }
      }
      if (outcome.status === "failed") {
        footer = outcome.delivery === "not-started" ? p.notStarted : p.unknownDelivery;
        quiet = !narrow;
        body = narrow ? <p>{view === "already-running" ? p.alreadyRunningBody : p.tooSoonBody}</p> : <Alert variant="danger"><p>{failureText(outcome)}</p>{outcome.code && <p className="mt-2">{p.reference}: <code>{outcome.code}</code></p>}</Alert>;
        if (view === "transient-error") actions = <Button onClick={() => void publish.preview()}>{p.retry}</Button>;
        else if (view === "too-soon") actions = <Button onClick={() => void publish.preview()}>{p.wait(outcome.retryAfterSeconds ?? 0)}</Button>;
        else if (view === "config-error" && outcome.code) actions = <a href={`/projects/${slug}/settings`}>{p.settings}</a>;
        else if (outcome.error === "unauthorized") actions = <a href="/signin">{p.signIn}</a>;
      } else {
        body = <><p>{outcome.status === "committed" ? p.review : p.noChangesBody}</p>
          {outcome.status === "committed" && <><a className="text-blue-600" href={outcome.prUrl} target="_blank" rel="noreferrer">{p.viewLink} #{outcome.prUrl.split("/").at(-1)}</a><ul>{outcome.changed.map(path => <li key={path} className="text-xs">{path}</li>)}</ul>{outcome.pr === "updated" && <div className="border-divider rounded-lg border p-4 text-sm">{p.replaced}</div>}</>}
          <Warnings warnings={outcome.warnings ?? []} /></>;
      }
      break;
    }
    default: { const exhaustive: never = state; return exhaustive; }
  }
  return <OnboardingModal open={publish.open} onClose={publish.close} title={title} closeLabel={m.common.close}
    footer={footer} actions={actions} transitionKey={state.kind} quiet={quiet} returnFocusRef={publish.triggerRef} fallbackFocusRef={fallbackFocusRef}
    panelClassName={narrow ? "max-w-[512px] min-h-[min(320px,calc(100svh-96px))]" : "max-w-[736px] min-h-[min(560px,calc(100svh-96px))]"}
    bodyScroll={state.kind === "preview-ready" ? "hidden" : "auto"}>{body}</OnboardingModal>;
}
