"use client";

import { useEffect, useState, useTransition } from "react";
import { addSurface, confirmManualFormat, detectRepoFormats, loadCandidateSample,
  type AddSurfaceResult, type DetectResult } from "@/app/(edit)/projects/actions";
import { startGithubConnect } from "@/app/(edit)/projects/[slug]/settings/actions";
import { PanelBody, PanelHeader } from "@/components/shell/content-panel";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { m } from "@/lib/i18n";
import { ingestHeadline } from "@/lib/onboarding/message";
import type { CandidateSummary } from "@/lib/onboarding/detect";
import type { AdapterChoice } from "@/lib/onboarding/types";
import { routes } from "@/lib/routes";
import { failureText } from "./failure";
import { FilesStep, type ManualEntry, type PreviewState } from "./steps/files";
import { WorkflowBlock } from "./workflow-block";

export function AddSurface({ slug, owner, repo, branch, adapters, initial, initialError }: {
  slug: string; owner: string; repo: string; branch: string; adapters: AdapterChoice[];
  initial: DetectResult; initialError?: string;
}) {
  const [candidates, setCandidates] = useState(initial.ok ? initial.candidates : []);
  const [picked, setPicked] = useState<number | null>(initial.ok && initial.candidates.length ? 0 : null);
  const [detectError, setDetectError] = useState<string | undefined>(!initial.ok && initial.error !== "no-candidates" ? initial.error : undefined);
  const [manual, setManual] = useState<ManualEntry>({ adapter: adapters[0]?.adapter ?? "json-catalog", pathTemplate: "", baseLocale: "" });
  const [manualCandidate, setManualCandidate] = useState<CandidateSummary>();
  const candidate = picked === null ? manualCandidate : candidates[picked];
  const [locale, setLocale] = useState(candidate?.baseLocale ?? "");
  const [baseLocale, setBaseLocale] = useState(candidate?.baseLocale ?? "");
  const [preview, setPreview] = useState<PreviewState>({ status: "loading" });
  const [error, setError] = useState<string | undefined>(initialError);
  const [result, setResult] = useState<Extract<AddSurfaceResult, { ok: true }>>();
  const [conflicts, setConflicts] = useState<{ path: string; surfaceSlugs: string[] }[]>([]);
  const [pending, startTransition] = useTransition();

  // 후보·언어가 바뀐 뒤 늦게 도착한 응답은 새 미리보기를 덮지 못한다.
  useEffect(() => {
    if (candidate === undefined || locale === "") return;
    const cached = candidate.samples.find(s => s.locale === locale);
    if (cached) { setPreview({ status: "ready", rows: cached.rows, total: cached.total }); return; }
    let active = true;
    setPreview({ status: "loading" });
    void loadCandidateSample({ owner, repo, ref: branch, ...candidate, locale }).then(value => {
      if (active) setPreview(value.ok ? { status: "ready", rows: value.rows, total: value.total } : { status: "unavailable" });
    }).catch(() => { if (active) setPreview({ status: "unavailable" }); });
    return () => { active = false; };
  }, [candidate, locale, owner, repo, branch]);

  function choose(index: number) {
    setPicked(index); setError(undefined); setConflicts([]);
    const next = candidates[index];
    setLocale(next?.baseLocale ?? ""); setBaseLocale(next?.baseLocale ?? "");
  }
  function checkManual() {
    startTransition(async () => {
      setError(undefined);
      try {
        const checked = await confirmManualFormat({ owner, repo, ref: branch, ...manual });
        if (!checked.ok) { setError(checked.error); return; }
        setManualCandidate(checked.candidate); setLocale(checked.candidate.baseLocale); setBaseLocale(checked.candidate.baseLocale);
      } catch { setError("unavailable"); }
    });
  }
  function retry() {
    startTransition(async () => {
      try {
        const detected = await detectRepoFormats({ owner, repo, ref: branch });
        setCandidates(detected.ok ? detected.candidates : []);
        setPicked(detected.ok && detected.candidates.length ? 0 : null);
        setLocale(detected.ok ? detected.candidates[0]?.baseLocale ?? "" : "");
        setBaseLocale(detected.ok ? detected.candidates[0]?.baseLocale ?? "" : "");
        setManualCandidate(undefined);
        setDetectError(!detected.ok && detected.error !== "no-candidates" ? detected.error : undefined);
      } catch { setDetectError("unavailable"); }
    });
  }
  // ⚠️ **라벨을 거부 사유가 정한다** — 두 문장이 서로 다른 버튼 이름을 지시하므로 하나로 고정하면
  // 한쪽은 없는 버튼을 가리킨다 (`steps/repo.tsx`가 같은 자리에서 같은 쌍을 든다).
  const connectFor = [error, detectError].find(value => value === "reauthorize" || value === "not-connected");
  const connectLabel = connectFor === "reauthorize" ? m.newProject.empty.connect.reauthorize : m.newProject.empty.connect.action;
  return <>
    <PanelHeader width="fluid" description={m.surfaces.description}>
      <h1 className="text-lg font-medium">{m.surfaces.add}</h1>
    </PanelHeader>
    <PanelBody width="fluid" className="flex min-h-0 flex-1 flex-col gap-4">
      {result ? <div className="space-y-4">
        {result.failed > 0 ? <Alert variant="warning" role="status">{ingestHeadline(result.count, result.failed)}</Alert>
          : <p>{ingestHeadline(result.count, 0)}</p>}
        <WorkflowBlock yaml={result.yaml} saveAs={m.surfaces.workflow} />
        <div className="flex gap-2">
          <ButtonLink href={routes.surfaceTranslations(slug, result.surfaceSlug)} variant="primary">{m.surfaces.open}</ButtonLink>
          <ButtonLink href={routes.settings(slug)}>{m.surfaces.settings}</ButtonLink>
        </div>
      </div> : <>
        {error && <Alert variant="danger">{error === "repo-replaced" ? m.settings.repository.health["repo-replaced"] : error === "ingest-failed" ? m.surfaces.failed : error === "path-conflict" ? m.surfaces.conflict : failureText(error)}
          {conflicts.map(c => <p key={c.path}>{c.path} · {c.surfaceSlugs.join(", ")}</p>)}
        </Alert>}
        {connectFor && <Button loading={pending} onClick={() => startTransition(async () => {
          const connected = await startGithubConnect({ slug, returnTo: "add-surface" });
          if (!connected.ok) setError(connected.error);
        })}>{connectLabel}</Button>}
        <fieldset disabled={pending} className="flex min-h-0 flex-1 gap-4">
          <FilesStep state={{ detecting: false, detectError, candidates, picked, locale, preview, manual,
            manualCandidate, manualMatched: manualCandidate !== undefined, adapters, repoLabel: `${owner}/${repo}`, branch, banner: null }}
            onPick={choose} onLocale={setLocale} onRetry={retry}
            onManual={value => { setPicked(null); setManual(value); setManualCandidate(undefined); setError(undefined); }} />
        </fieldset>
        <div className="flex shrink-0 items-center gap-3">
          {picked === null && <Button disabled={pending || !manual.pathTemplate.trim() || !manual.baseLocale.trim()} onClick={checkManual}>{m.surfaces.confirm}</Button>}
          {candidate && <Select value={baseLocale} onValueChange={setBaseLocale} disabled={pending}>
            <SelectTrigger className="w-40" aria-label={m.surfaces.baseLocale}><SelectValue /></SelectTrigger>
            <SelectContent>{candidate.locales.map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent>
          </Select>}
          <Button data-add-surface variant="primary" loading={pending} disabled={!candidate || !baseLocale || !!detectError}
            onClick={() => startTransition(async () => {
              if (!candidate) return;
              setError(undefined); setConflicts([]);
              try {
                const added = await addSurface({ slug, adapter: candidate.adapter, pathTemplate: candidate.pathTemplate, baseLocale });
                if (added.ok) setResult(added);
                else { setError(added.error); setConflicts(added.conflicts ?? []); }
              } catch { setError("unavailable"); }
            })}>{m.surfaces.add}</Button>
          <ButtonLink href={routes.settings(slug)}>{m.surfaces.cancel}</ButtonLink>
        </div>
      </>}
    </PanelBody>
  </>;
}
