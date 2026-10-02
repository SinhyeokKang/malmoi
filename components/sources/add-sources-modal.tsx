"use client";

import { unstable_rethrow } from "next/navigation";
import { useEffect, useState, useTransition, type RefObject } from "react";
import { addSurfaces, confirmManualFormat, detectRepoFormats, loadCandidateSample } from "@/app/(edit)/projects/actions";
import { startGithubConnect } from "@/app/(edit)/projects/[slug]/settings/actions";
import { FilesStep, failedPreview, samplePreview, type ManualEntry, type PreviewState } from "@/components/onboarding/steps/files";
import { failureText } from "@/components/onboarding/failure";
import { useCommitWait } from "@/components/commit-wait";
import { SlowNotice } from "@/components/slow-notice";
import { OnboardingModal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { m } from "@/lib/i18n";
import { planAddBlock } from "@/lib/sources/add-block";
import type { CandidateSummary } from "@/lib/onboarding/detect";
import type { AdapterChoice } from "@/lib/onboarding/types";
import { planSurfaceSelection } from "@/lib/onboarding/select-surfaces";
import { planAddSources, type SurfaceAdded } from "@/lib/surfaces/plan-add";

export function AddSourcesModal({ open, onClose, onAdded, returnFocusRef, slug, owner, repo, branch, existing, adapters, server }: {
  open: boolean; onClose: () => void; onAdded: (results: SurfaceAdded[]) => void; returnFocusRef: RefObject<HTMLButtonElement | null>;
  slug: string; owner: string; repo: string; branch: string; existing: readonly { pathTemplate: string | null }[]; adapters: AdapterChoice[];
  /** 서버가 렌더할 때마다 새 객체가 되는 prop — 추가 뒤 닫기를 재검증 트리 커밋까지 미룬다(`useCommitWait`). */
  server: unknown;
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
  const [transitioning, run] = useTransition();
  /**
   * ⚠️ **추가는 `run(async …)` 밖에서 돈다** (malmoi#107 · ARCHITECTURE §3) — 첫 적재까지 도는 긴 Action이라 async transition으로
   * 감싸면 그동안의 내비게이션이 전부 얽혔다. 수동 대기 + 커밋 대기다. 수동 확인·GitHub 연결은 짧아 그대로 둔다.
   */
  const [adding, setAdding] = useState(false);
  const commit = useCommitWait(server);
  const pending = transitioning || adding || commit.waiting;
  /**
   * ⚠️ **대기 하나를 버튼 셋이 나눠 쓴다** — [Add]·수동 [Confirm]·GitHub 연결. 스피너는 누른 쪽에만 선다 (audit-ux #26 —
   * `profile-picture.tsx`가 경고한 함정). 막는 것은 여전히 `pending` 하나다.
   */
  const [operation, setOperation] = useState<"add" | "manual" | "connect">("add");
  /**
   * 추가 결과 — **닫기와 결과 배너를 재검증 커밋 뒤로 미룬다** (audit-ux #12). `await` 직후 부르면 모달이 닫히고 배너가 선 뒤에야
   * 목록이 바뀌었다. 콜백은 transition이 미룰 수 없으므로 커밋된 상태를 effect가 받아 부른다.
   */
  const [added, setAdded] = useState<SurfaceAdded[] | null>(null);
  useEffect(() => {
    if (added === null || adding || commit.waiting) return;
    setAdded(null); onAdded(added); onClose();
  }, [added, adding, commit.waiting, onAdded, onClose]);
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
    if (cached) { setPreview(samplePreview(cached)); return; }
    let active = true; setPreview({ status: "loading" });
    void loadCandidateSample({ owner, repo, ref: branch, ...candidate, locale }).then(result => {
      if (active) setPreview(result.ok ? { status: "ready", rows: result.rows, total: result.total } : failedPreview(result.error));
    }).catch(() => { if (active) setPreview({ status: "unavailable" }); });
    return () => { active = false; };
  }, [open, candidate, locale, owner, repo, branch]);

  const connect = [error, detectError, manualError].find(e => e === "reauthorize" || e === "not-connected");
  /*
    ⚠️ **꺼진 두 버튼은 `aria-disabled`다** (audit #37 — DESIGN §6.65). 진짜 `disabled`는 포커스를 못 받아 describedby의
    사유(`selectHelp` · `manualReason`)가 닿을 길이 없었다. ⚠️ **진행 중은 `loading`이 아니라 `busy`다** (B5 리뷰 r1) — 한 버튼에
    `loading`(진짜 `disabled`)과 `aria-disabled`를 겸하지 않는다(DESIGN §6.65). 사유는 둘 다 **보이는 글자**다.
  */
  // ⚠️ 사유는 꺼진 동안만 서고, 막은 갈래를 말한다 (malmoi#93) — 켜진 버튼이 옛 문장을 describedby로 들고 있었다.
  const addReason = planAddBlock({ detecting, detectError: !!detectError, formats: selection.formats, conflicts: selection.conflicts.length });
  const addBlocked = addReason !== null;
  const manualBlocked = !manual.pathTemplate.trim() || !manual.baseLocale.trim();
  return <OnboardingModal open={open} closeDisabled={pending} onClose={() => { if (!pending) onClose(); }} returnFocusRef={returnFocusRef}
    title={m.settings.sources.add} description={m.settings.sources.description} bodyScroll="hidden"
    panelClassName="h-[min(680px,calc(100svh-var(--spacing-modal-gutter)))] min-h-0" actions={<>
      <Button size="lg" disabled={pending} onClick={onClose}>{m.surfaces.cancel}</Button>
      <Button spinnerSize="sm" size="lg" data-add-sources variant="primary" busy={pending && operation === "add"} aria-disabled={addBlocked || pending || undefined} aria-describedby={addBlocked ? "add-source-help" : undefined} onClick={() => {
        if (addBlocked) return;
        const plan = planAddSources({ picked: candidates.filter((_, i) => checked.has(i)), existing });
        if (!plan.ok || plan.add.length === 0 || pending) return;
        setError(undefined); setManualError(undefined); setUnknown(false); setConflicts([]); setOperation("add");
        setAdding(true);
        void (async () => {
          try {
            const result = await addSurfaces({ slug, picks: plan.add.map(c => ({ adapter: c.adapter, pathTemplate: c.pathTemplate, baseLocale: bases[candidates.indexOf(c)] ?? c.baseLocale })) });
            if (result.ok) { setAdded(result.results); commit.wait(); }
            else { setError(result.error); setConflicts(result.conflicts ?? []); }
          } catch { setUnknown(true); }
          setAdding(false);
        })();
      }}>{m.settings.sources.confirm}</Button>
    </>} notice={addReason !== null ? <span id="add-source-help" className="text-muted-foreground text-xs">{addReason}</span>
      /* 추가는 첫 적재까지 돈다 (audit-ux #23) — 큰 리포면 버튼 스피너 하나로 30초를 넘긴다. */
      : pending && operation === "add" ? <SlowNotice active /> : undefined}>
    {error && <Alert variant="danger"><p>{m.settings.sources.nothingAdded}</p><p>{error === "repo-replaced" ? m.settings.repository.health["repo-replaced"] : error === "path-conflict" ? m.surfaces.conflict : error === "ingest-failed" ? m.surfaces.failed : failureText(error)}</p>{conflicts.map(c => <p key={c.path}>{c.path} · {c.surfaceSlugs.join(", ")}</p>)}</Alert>}
    {manualError && <Alert variant="danger">{failureText(manualError)}</Alert>}
    {unknown && <Alert variant="warning">{m.settings.sources.unknown}</Alert>}
    {/* ⚠️ 성공은 GitHub으로 가는 redirect라 되던진다 (audit-ux #14) — 그 밖의 throw는 거부와 같은 자리로 접는다. */}
    {connect && <Button spinnerSize="sm" disabled={pending && operation !== "connect"} loading={pending && operation === "connect"} onClick={() => { setOperation("connect"); run(async () => {
      try { const result = await startGithubConnect({ slug, returnTo: "add-surface" }); if (!result.ok) setError(result.error); }
      catch (thrown) { unstable_rethrow(thrown); setError("unavailable"); }
    }); }}>{connect === "reauthorize" ? m.newProject.empty.connect.reauthorize : m.newProject.empty.connect.action}</Button>}
    <div className="flex min-h-0 flex-1">
      <FilesStep pending={pending} previewNone={m.settings.sources.previewNone} state={{ detecting, detectError, candidates, picked, locale, preview, manual, manualMatched: false, adapters, repoLabel: `${owner}/${repo}`, branch, banner: null }}
        selection={{ checked, locked, conflicts: selection.conflicts, onToggle: index => setChecked(previous => { const next = new Set(previous); if (next.has(index)) next.delete(index); else next.add(index); return next; }) }}
        onPick={index => { setPicked(index); setLocale(candidates[index]?.baseLocale ?? ""); }} onLocale={setLocale}
        onManual={value => { setPicked(null); setManual(value); setManualError(undefined); }} onRetry={() => setRevision(v => v + 1)} />
    </div>
    <div className="flex shrink-0 items-center gap-3">
      {picked === null && !detecting && <Button spinnerSize="sm" busy={pending && operation === "manual"} aria-disabled={manualBlocked || pending || undefined} aria-describedby={manualBlocked ? "add-source-manual-reason" : undefined} onClick={() => { if (manualBlocked || pending) return; setOperation("manual"); run(async () => {
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
        <SelectTrigger width={160}  aria-label={m.surfaces.baseLocale}><SelectValue /></SelectTrigger>
        <SelectContent>{candidate.locales.map(code => <SelectItem disabled={pending || locked.has(picked!)} key={code} value={code}>{code}</SelectItem>)}</SelectContent>
      </Select></>}
    </div>
  </OnboardingModal>;
}
