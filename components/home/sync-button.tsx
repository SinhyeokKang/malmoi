"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { checkOpenPullRequest, runRepositoryImport } from "@/app/(edit)/projects/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { m } from "@/lib/i18n";
import { planImportConfirmation, type OpenImportPr } from "@/lib/import/confirm";
import type { RepositoryImportOutcome } from "@/lib/import/result";
import { routes } from "@/lib/routes";

/** The Home host owns the raw result across router.refresh(). Visual comparison belongs to project-home. */
export function SyncButton({ slug, role, unsent, onResult, open, onOpenChange, fallbackFocusRef }: {
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  open: boolean; onOpenChange: (open: boolean) => void;
  slug: string; role: "OWNER" | "EDITOR"; unsent: number;
  onResult: (outcome: RepositoryImportOutcome) => void;
}) {
  const router = useRouter();
  const triggerId = useId();
  const [pending, setPending] = useState(false);
  const [openPr, setOpenPr] = useState<OpenImportPr>(undefined);
  const request = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    const id = ++request.current;
    setOpenPr(undefined);
    if (!open || role !== "OWNER") return;
    if (busy.current) { onOpenChange(false); return; }
    void checkOpenPullRequest({ slug }).then(
      value => { if (request.current === id) setOpenPr(value); },
      () => { if (request.current === id) setOpenPr(undefined); },
    );
    return () => { request.current++; };
  }, [open, slug, role]); // onOpenChange only closes an externally reopened pending dialog.
  const plan = planImportConfirmation({ unsent, openPr });
  function changeOpen(next: boolean) {
    if (next && busy.current) return;
    onOpenChange(next);
  }
  async function confirm() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    changeOpen(false);
    let outcome: RepositoryImportOutcome;
    try { outcome = await runRepositoryImport({ slug }); }
    catch { outcome = { ok: false, error: "ingest-failed" }; }
    busy.current = false;
    setPending(false);
    onResult(outcome);
    router.refresh();
  }
  if (role !== "OWNER") return null;
  return <Dialog open={open && !pending} onOpenChange={changeOpen}>
    <DialogTrigger asChild>
      <Button id={triggerId} aria-disabled={pending} onClick={event => { if (busy.current) event.preventDefault(); }}
        className="aria-disabled:border-border aria-disabled:text-muted-foreground aria-disabled:cursor-not-allowed">
        {pending && <Loader2 className="animate-spin" aria-hidden />}{m.repositorySync.action}
      </Button>
    </DialogTrigger>
    {pending && <span className="sr-only" role="status">{m.repositorySync.pending}</span>}
    <DialogContent onCloseAutoFocus={event => {
      if (!document.getElementById(triggerId) && fallbackFocusRef?.current) {
        event.preventDefault();
        fallbackFocusRef.current.focus();
      }
    }} title={m.repositorySync.title} description={m.repositorySync.body} footer={<>
      <DialogClose asChild><Button>{m.common.cancel}</Button></DialogClose>
      <Button variant="danger" onClick={() => void confirm()}>{m.repositorySync.confirm}</Button>
    </>}>
      <div aria-live="polite" className="space-y-2 text-xs">
        {plan.recommendSend && <><p>{m.repositorySync.unsent(unsent)}</p>
          <Link href={routes.translations(slug)} className="text-blue-600 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none">{m.repositorySync.sendFirst}</Link></>}
        {openPr === undefined ? <p>{m.repositorySync.prUnknown}</p> : openPr !== null ?
          <a href={openPr.url} target="_blank" rel="noreferrer" className="text-blue-600 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none">{m.repositorySync.openPr(openPr.number)}</a> : null}
        {plan.atRisk && <p>{m.repositorySync.mergeHint}</p>}
      </div>
      <p className="text-muted-foreground text-xs">{m.repositorySync.refsHint}</p>
    </DialogContent>
  </Dialog>;
}
