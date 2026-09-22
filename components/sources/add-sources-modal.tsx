"use client";

import { useEffect, useState, useTransition, type RefObject } from "react";
import { addSurfaces, confirmManualFormat, detectRepoFormats, loadCandidateSample } from "@/app/(edit)/projects/actions";
import { startGithubConnect } from "@/app/(edit)/projects/[slug]/settings/actions";
import { FilesStep, type ManualEntry, type PreviewState } from "@/components/onboarding/steps/files";
import { failureText } from "@/components/onboarding/failure";
import { OnboardingModal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { m } from "@/lib/i18n";
import type { CandidateSummary } from "@/lib/onboarding/detect";
import type { AdapterChoice } from "@/lib/onboarding/types";
import { planSurfaceSelection } from "@/lib/onboarding/select-surfaces";
import { planAddSources, type SurfaceAdded } from "@/lib/surfaces/plan-add";

export function AddSourcesModal({ open, onClose, onAdded, returnFocusRef, slug, owner, repo, branch, existing, adapters }: {
  open: boolean; onClose: () => void; onAdded: (results: SurfaceAdded[]) => void; returnFocusRef: RefObject<HTMLButtonElement | null>;
  slug: string; owner: string; repo: string; branch: string; existing: readonly { pathTemplate: string | null }[]; adapters: AdapterChoice[];
}) {
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [bases, setBases] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<number | null>(null);
  const [locale, setLocale] = useState("");
  const [preview, setPreview] = useState<PreviewState>({ status: "loading" });
  const [detecting, setDetecting] = useState(true);
  const [detectError, setDetectError] = useState<string>();
  const [error, setError] = useState<string>();
  const [unknown, setUnknown] = useState(false);
  const [conflicts, setConflicts] = useState<{ path: string; surfaceSlugs: string[] }[]>([]);
  const [manual, setManual] = useState<ManualEntry>({ adapter: adapters[0]?.adapter ?? "json-catalog", pathTemplate: "", baseLocale: "" });
  const [pending, run] = useTransition();
  const [revision, setRevision] = useState(0);
  const candidate = picked === null ? undefined : candidates[picked];
  const locked = new Set(candidates.flatMap((c, index) => existing.some(s => s.pathTemplate === c.pathTemplate) ? [index] : []));
  const selection = planSurfaceSelection(candidates, new Set([...checked].filter(i => !locked.has(i))), bases);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setDetecting(true); setDetectError(undefined); setError(undefined); setUnknown(false);
    void detectRepoFormats({ owner, repo, ref: branch }).then(result => {
      if (!active) return;
      const next = result.ok ? result.candidates : [];
      setCandidates(next); setChecked(new Set()); setBases(Object.fromEntries(next.map((c, i) => [i, c.baseLocale])));
      setPicked(next.length ? 0 : null); setLocale(next[0]?.baseLocale ?? "");
      setDetectError(!result.ok && result.error !== "no-candidates" ? result.error : undefined);
    }).catch(() => { if (active) setDetectError("unavailable"); }).finally(() => { if (active) setDetecting(false); });
    return () => { active = false; };
  }, [open, revision, owner, repo, branch]);
  useEffect(() => {
    if (!open || !candidate || !locale) return;
    const cached = candidate.samples.find(s => s.locale === locale);
    if (cached) { setPreview({ status: "ready", rows: cached.rows, total: cached.total }); return; }
    let active = true; setPreview({ status: "loading" });
    void loadCandidateSample({ owner, repo, ref: branch, ...candidate, locale }).then(result => {
      if (active) setPreview(result.ok ? { status: "ready", rows: result.rows, total: result.total } : { status: "unavailable" });
    }).catch(() => { if (active) setPreview({ status: "unavailable" }); });
    return () => { active = false; };
  }, [open, candidate, locale, owner, repo, branch]);

  const connect = [error, detectError].find(e => e === "reauthorize" || e === "not-connected");
  return <OnboardingModal open={open} closeDisabled={pending} onClose={() => { if (!pending) onClose(); }} returnFocusRef={returnFocusRef}
    title={m.settings.sources.add} description={m.settings.sources.description} bodyScroll="hidden"
    panelClassName="[&_.animate-spin]:size-3.5 h-[min(680px,calc(100svh-96px))] min-h-0" actions={<>
      <Button size="lg" disabled={pending} onClick={onClose}>{m.surfaces.cancel}</Button>
      <Button size="lg" data-add-sources variant="primary" loading={pending} aria-busy={pending} disabled={detecting || !!detectError || selection.formats.length === 0 || selection.conflicts.length > 0 || selection.formats.some(f => !f.baseLocale)} aria-describedby="add-source-help" onClick={() => {
        const plan = planAddSources({ picked: candidates.filter((_, i) => checked.has(i)), existing });
        if (!plan.ok || plan.add.length === 0 || pending) return;
        setError(undefined); setUnknown(false); setConflicts([]);
        run(async () => {
          try {
            const result = await addSurfaces({ slug, picks: plan.add.map(c => ({ adapter: c.adapter, pathTemplate: c.pathTemplate, baseLocale: bases[candidates.indexOf(c)] ?? c.baseLocale })) });
            if (result.ok) { onAdded(result.results); onClose(); }
            else { setError(result.error); setConflicts(result.conflicts ?? []); }
          } catch { setUnknown(true); }
        });
      }}>{m.settings.sources.add}</Button>
    </>} footer={<span id="add-source-help" className="text-muted-foreground text-xs">{m.settings.sources.selectHelp}</span>}>
    {error && <Alert variant="danger"><p>{m.settings.sources.nothingAdded}</p><p>{error === "repo-replaced" ? m.settings.repository.health["repo-replaced"] : error === "path-conflict" ? m.surfaces.conflict : error === "ingest-failed" ? m.surfaces.failed : failureText(error)}</p>{conflicts.map(c => <p key={c.path} className="text-mono">{c.path} · {c.surfaceSlugs.join(", ")}</p>)}</Alert>}
    {unknown && <Alert variant="warning">{m.settings.sources.unknown}</Alert>}
    {connect && <Button disabled={pending} onClick={() => run(async () => { const result = await startGithubConnect({ slug, returnTo: "add-surface" }); if (!result.ok) setError(result.error); })}>{connect === "reauthorize" ? m.newProject.empty.connect.reauthorize : m.newProject.empty.connect.action}</Button>}
    <div className="flex min-h-0 flex-1">
      <FilesStep pending={pending} state={{ detecting, detectError, candidates, picked, locale, preview, manual, manualMatched: false, adapters, repoLabel: `${owner}/${repo}`, branch, banner: null }}
        selection={{ checked, locked, conflicts: selection.conflicts, onToggle: index => setChecked(previous => { const next = new Set(previous); if (next.has(index)) next.delete(index); else next.add(index); return next; }) }}
        onPick={index => { setPicked(index); setLocale(candidates[index]?.baseLocale ?? ""); }} onLocale={setLocale}
        onManual={value => { setPicked(null); setManual(value); }} onRetry={() => setRevision(v => v + 1)} />
    </div>
    <div className="flex shrink-0 items-center gap-3">
      {picked === null && !detecting && <Button loading={pending} aria-busy={pending} disabled={!manual.pathTemplate.trim() || !manual.baseLocale.trim()} onClick={() => run(async () => {
        setError(undefined);
        try {
          const result = await confirmManualFormat({ owner, repo, ref: branch, ...manual });
          if (!result.ok) { setError(result.error); return; }
          const found = candidates.findIndex(c => c.pathTemplate === result.candidate.pathTemplate);
          const index = found < 0 ? candidates.length : found;
          if (found < 0) setCandidates([...candidates, result.candidate]);
          else if (!locked.has(found)) setCandidates(candidates.map((candidate, i) => i === found ? result.candidate : candidate));
          setPicked(index); setLocale(result.candidate.baseLocale); setBases(previous => ({ ...previous, [index]: result.candidate.baseLocale }));
          setChecked(previous => new Set([...previous, index]));
        } catch { setError("unavailable"); }
      })}>{m.surfaces.confirm}</Button>}
      {candidate && <><span className="text-muted-foreground text-xs">{m.surfaces.baseLocale}</span><Select disabled={pending || locked.has(picked!)} value={bases[picked!] ?? candidate.baseLocale} onValueChange={value => { if (!pending && !locked.has(picked!)) setBases(previous => ({ ...previous, [picked!]: value })); }}>
        <SelectTrigger className="w-40" aria-label={m.surfaces.baseLocale}><SelectValue /></SelectTrigger>
        <SelectContent>{candidate.locales.map(code => <SelectItem disabled={pending || locked.has(picked!)} key={code} value={code}>{code}</SelectItem>)}</SelectContent>
      </Select></>}
    </div>
  </OnboardingModal>;
}
