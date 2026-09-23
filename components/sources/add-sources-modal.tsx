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
  /**
   * 수동 경로 확인의 거부 (audit #23). ⚠️ **`error`와 가른다** — 그쪽 Alert는 "Nothing was added. Your selection is still
   * here."로 시작하는데, 확인은 추가가 아니고 선택을 건드리지도 않는다. 같은 칸에 두면 일어나지 않은 실패를 읽힌다.
   */
  const [manualError, setManualError] = useState<string>();
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

  const connect = [error, detectError, manualError].find(e => e === "reauthorize" || e === "not-connected");
  /*
    ⚠️ **꺼진 두 버튼은 `aria-disabled`다** (audit #37 — DESIGN §6.65). 진짜 `disabled`는 포커스를 못 받아 describedby의
    사유(`selectHelp` · `manualReason`)가 닿을 길이 없었다. ⚠️ **진행 중은 `loading`이 아니라 `busy`다** (B5 리뷰 r1) — 한 버튼에
    `loading`(진짜 `disabled`)과 `aria-disabled`를 겸하지 않는다(DESIGN §6.65). 사유는 둘 다 **보이는 글자**다.
  */
  const addBlocked = detecting || !!detectError || selection.formats.length === 0 || selection.conflicts.length > 0 || selection.formats.some(f => !f.baseLocale);
  const manualBlocked = !manual.pathTemplate.trim() || !manual.baseLocale.trim();
  return <OnboardingModal open={open} closeDisabled={pending} onClose={() => { if (!pending) onClose(); }} returnFocusRef={returnFocusRef}
    title={m.settings.sources.add} description={m.settings.sources.description} bodyScroll="hidden"
    panelClassName="[&_.animate-spin]:size-3.5 h-[min(680px,calc(100svh-96px))] min-h-0" actions={<>
      <Button size="lg" disabled={pending} onClick={onClose}>{m.surfaces.cancel}</Button>
      <Button size="lg" data-add-sources variant="primary" busy={pending} aria-disabled={addBlocked || undefined} aria-describedby="add-source-help" onClick={() => {
        if (addBlocked) return;
        const plan = planAddSources({ picked: candidates.filter((_, i) => checked.has(i)), existing });
        if (!plan.ok || plan.add.length === 0 || pending) return;
        setError(undefined); setManualError(undefined); setUnknown(false); setConflicts([]);
        run(async () => {
          try {
            const result = await addSurfaces({ slug, picks: plan.add.map(c => ({ adapter: c.adapter, pathTemplate: c.pathTemplate, baseLocale: bases[candidates.indexOf(c)] ?? c.baseLocale })) });
            if (result.ok) { onAdded(result.results); onClose(); }
            else { setError(result.error); setConflicts(result.conflicts ?? []); }
          } catch { setUnknown(true); }
        });
      }}>{m.settings.sources.confirm}</Button>
    </>} footer={<span id="add-source-help" className="text-muted-foreground text-xs">{m.settings.sources.selectHelp}</span>}>
    {error && <Alert variant="danger"><p>{m.settings.sources.nothingAdded}</p><p>{error === "repo-replaced" ? m.settings.repository.health["repo-replaced"] : error === "path-conflict" ? m.surfaces.conflict : error === "ingest-failed" ? m.surfaces.failed : failureText(error)}</p>{conflicts.map(c => <p key={c.path}>{c.path} · {c.surfaceSlugs.join(", ")}</p>)}</Alert>}
    {manualError && <Alert variant="danger">{failureText(manualError)}</Alert>}
    {unknown && <Alert variant="warning">{m.settings.sources.unknown}</Alert>}
    {connect && <Button disabled={pending} onClick={() => run(async () => { const result = await startGithubConnect({ slug, returnTo: "add-surface" }); if (!result.ok) setError(result.error); })}>{connect === "reauthorize" ? m.newProject.empty.connect.reauthorize : m.newProject.empty.connect.action}</Button>}
    <div className="flex min-h-0 flex-1">
      <FilesStep pending={pending} state={{ detecting, detectError, candidates, picked, locale, preview, manual, manualMatched: false, adapters, repoLabel: `${owner}/${repo}`, branch, banner: null }}
        selection={{ checked, locked, conflicts: selection.conflicts, onToggle: index => setChecked(previous => { const next = new Set(previous); if (next.has(index)) next.delete(index); else next.add(index); return next; }) }}
        onPick={index => { setPicked(index); setLocale(candidates[index]?.baseLocale ?? ""); }} onLocale={setLocale}
        onManual={value => { setPicked(null); setManual(value); }} onRetry={() => setRevision(v => v + 1)} />
    </div>
    <div className="flex shrink-0 items-center gap-3">
      {picked === null && !detecting && <Button busy={pending} aria-disabled={manualBlocked || undefined} aria-describedby={manualBlocked ? "add-source-manual-reason" : undefined} onClick={() => { if (!manualBlocked) run(async () => {
        setManualError(undefined);
        try {
          const result = await confirmManualFormat({ owner, repo, ref: branch, ...manual });
          if (!result.ok) { setManualError(result.error); return; }
          const found = candidates.findIndex(c => c.pathTemplate === result.candidate.pathTemplate);
          const index = found < 0 ? candidates.length : found;
          if (found < 0) setCandidates([...candidates, result.candidate]);
          else if (!locked.has(found)) setCandidates(candidates.map((candidate, i) => i === found ? result.candidate : candidate));
          setPicked(index); setLocale(result.candidate.baseLocale); setBases(previous => ({ ...previous, [index]: result.candidate.baseLocale }));
          setChecked(previous => new Set([...previous, index]));
        } catch { setManualError("unavailable"); }
      }); }}>{m.surfaces.confirm}</Button>}
      {picked === null && !detecting && manualBlocked && <span id="add-source-manual-reason" className="text-muted-foreground text-xs">{m.settings.sources.manualReason}</span>}
      {candidate && <><span className="text-muted-foreground text-xs">{m.surfaces.baseLocale}</span><Select disabled={pending || locked.has(picked!)} value={bases[picked!] ?? candidate.baseLocale} onValueChange={value => { if (!pending && !locked.has(picked!)) setBases(previous => ({ ...previous, [picked!]: value })); }}>
        <SelectTrigger className="w-40" aria-label={m.surfaces.baseLocale}><SelectValue /></SelectTrigger>
        <SelectContent>{candidate.locales.map(code => <SelectItem disabled={pending || locked.has(picked!)} key={code} value={code}>{code}</SelectItem>)}</SelectContent>
      </Select></>}
    </div>
  </OnboardingModal>;
}
