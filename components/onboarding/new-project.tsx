"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  createProject,
  confirmManualFormat,
  detectRepoFormats,
  listRepoBranches,
  loadCandidateSample,
} from "@/app/(edit)/projects/actions";
import { m } from "@/lib/i18n";
import { ingestHeadline } from "@/lib/onboarding/message";
import { planBranchChoice, type BranchChoice } from "@/lib/onboarding/branch";
import type { CandidateSummary } from "@/lib/onboarding/detect";
import { nextEnabled, type NextState, type Step } from "@/lib/onboarding/next-enabled";
import { planSurfaceSelection } from "@/lib/onboarding/select-surfaces";
import { suggestAlternateSlug } from "@/lib/onboarding/slug";
import type { AdapterChoice, RepoOption } from "@/lib/onboarding/types";
import { routes } from "@/lib/routes";

import { Alert } from "@/components/ui/alert";
import { adapterErrorMessage } from "@/lib/i18n/adapter-errors";
import type { CreateProjectResult } from "@/app/(edit)/projects/actions";
import { failureText, isAccessLost } from "./failure";
import { OnboardingModal } from "./modal";
import { FilesStep, type ManualEntry, type PreviewState } from "./steps/files";
import { NamingStep } from "./steps/naming";
import { RepoStep } from "./steps/repo";
import { ResultStep } from "./steps/result";

/**
 * 새 프로젝트 온보딩 모달의 **상태 컨테이너** (DESIGN §6.7).
 *
 * ⚠️ **중간 상태를 서버에 저장하지 않는다.** 새로고침하면 ①부터다 — 그래서 ④를 지난 뒤에는
 * "프로젝트 행이 이미 있다"를 문구가 말한다.
 *
 * ⚠️ **캐시 키가 `${owner}/${repo}@${ref}` + 후보 index + locale이다.** 모달은 단계가 껍데기를
 * 공유하므로 [Back]으로 돌아가도 상태가 **살아남는다** — 전에는 `ConfirmStep`이 언마운트돼 stale이
 * 원리적으로 안 생겼다. 리포·브랜치 변경과 재탐지는 체크·기준 언어를 초기화한다. 상세 전환과 체크 해제는
 * 기준 언어를 보존한다. **[Back]은 리포 검색어를 남긴다**(컨테이너가 소유한다).
 * 수동 지정 키에는 adapter·pathTemplate도 들어간다 — 같은 언어라도 다른 파일의 검증은 무효다.
 */
export function NewProject({
  repos,
  listError,
  adapters,
  installUrl,
  pending: installPending = false,
  now,
  initialError,
  backQuery,
  closeMode,
}: {
  repos: RepoOption[] | undefined;
  listError: string | undefined;
  adapters: AdapterChoice[];
  installUrl: string | null;
  /** 설치 요청이 조직 관리자의 승인을 기다린다 (`listConnectableRepos`). 거부가 아니라 배너로 서지 않는다. */
  pending?: boolean;
  /** 서버가 한 번 만든 "지금" — 클라이언트에서 만들면 hydration이 어긋난다. */
  now: string;
  /** `?e=` — callback이 실어 보낸 사유. ① 본문 맨 위 배너로 선다. */
  initialError: string | undefined;
  backQuery: { q?: string };
  /** 경로가 문맥을 지정한다 — 인터셉트 뒤의 목록은 보존하고 딥링크는 목록 주소로 복귀한다. */
  closeMode: "back" | "list";
}) {
  const router = useRouter();
  // 같은 리포·후보로 돌아와도 이전 요청과 구별해야 하므로 값 비교 대신 세대를 센다.
  const repoRequest = useRef(0);
  const detectRequest = useRef(0);
  const sampleGeneration = useRef(0);
  const [step, setStep] = useState<Step>(1);
  const [pending, startTransition] = useTransition();
  const [accessLost, setAccessLost] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(initialError ?? null);
  const [announce, setAnnounce] = useState<string | undefined>(undefined);

  // ① 리포·브랜치
  const [repoQuery, setRepoQuery] = useState("");
  const [repo, setRepo] = useState<RepoOption | undefined>(undefined);
  const [branch, setBranch] = useState<BranchChoice | undefined>(undefined);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchValue, setBranchValue] = useState("");
  const [accessError, setAccessError] = useState<string | undefined>(undefined);

  // ② 후보·미리보기
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | undefined>(undefined);
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [detail, setDetail] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [baseLocales, setBaseLocales] = useState<Record<number, string>>({});
  const [locale, setLocale] = useState("");
  const [manualCandidate, setManualCandidate] = useState<CandidateSummary | undefined>(undefined);
  const [samples, setSamples] = useState<Record<string, PreviewState>>({});
  /**
   * 수동 확인의 거부 사유 (malmoi#99). ⚠️ **미리보기 상태에 접지 않는다** — 후보 0개 화면은 미리보기가 비어 있어
   * `unavailable`이 그려지지 않고, 그러면 거부가 "Nothing to preview yet"과 꺼진 Next만 남긴다.
   */
  const [manualError, setManualError] = useState<string | undefined>(undefined);
  const [manual, setManual] = useState<ManualEntry>({
    adapter: adapters[0]?.adapter ?? "json-catalog",
    pathTemplate: "",
    baseLocale: "",
  });

  // ③ 이름·주소·기준 언어
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [baseLocale, setBaseLocale] = useState("");
  const [slugTaken, setSlugTaken] = useState(false);
  /**
   * `slug-taken` 뒤 포커스를 주소 입력으로 (사전 "예외 G", launch-readiness L2.6). ⚠️ **잠금이 풀린 커밋에서 옮긴다** —
   * 거부가 온 시점엔 아직 `pending`이라 입력이 `disabled`이고 `focus()`가 조용히 무시된다. 그 사이 포커스는
   * 꺼진 [Create project]에서 `body`로 떨어져 있다.
   */
  const focusSlug = useRef(false);
  useEffect(() => {
    if (!focusSlug.current || pending || !slugTaken) return;
    focusSlug.current = false;
    document.getElementById("project-slug")?.focus();
  }, [pending, slugTaken]);

  // ④ 결과
  const [created, setCreated] = useState<Extract<CreateProjectResult, { ok: true }> | undefined>(undefined);
  const [creationFailure, setCreationFailure] = useState<Extract<CreateProjectResult, { ok: false }> | "unknown" | null>(null);

  const candidate = detail === null ? undefined : candidates[detail];
  const usingManual = candidates.length === 0 || candidate === undefined;
  const pathTemplate = candidate?.pathTemplate ?? manual.pathTemplate.trim();
  /** 미리보기가 매칭을 확인해 준 것이 곧 수동 지정의 검증이다 (예외 E). */
  const manualMatched = manualCandidate !== undefined && samples[sampleKey(manual.baseLocale.trim())]?.status === "ready";

  const selection = planSurfaceSelection(candidates, checked, baseLocales);
  const selectedCandidates = candidates.flatMap((item, index) => checked.has(index) ? [{ item, index }] : []);
  const chosenCandidate = usingManual ? manualCandidate : selectedCandidates[0]?.item;
  const chosenBase = usingManual ? baseLocale : baseLocales[selectedCandidates[0]?.index ?? -1] ?? "";
  const validBases = usingManual ? manualMatched && !!manualCandidate?.locales.includes(baseLocale)
    : selectedCandidates.length > 0 && selectedCandidates.every(({ item, index }) => item.locales.includes(baseLocales[index] ?? ""));

  const state: NextState = {
    sessionExpired: accessLost !== null || (banner !== null && isAccessLost(banner)),
    repoSelected: repo !== undefined && !branchLoading && repo.fullName.toLowerCase().includes(repoQuery.trim().toLowerCase()),
    repoAccessDenied: accessError !== undefined,
    repoListLoading: repos === undefined && listError === undefined,
    detecting,
    detectFailed: detectError !== undefined,
    candidateSelected: selection.formats.length > 0 && selection.conflicts.length === 0,
    manualEntry: usingManual,
    manualMatched,
    name,
    slug,
    baseLocale: validBases ? chosenBase : "",
    slugTaken,
  };

  function sampleKey(code: string): string {
    return JSON.stringify([repo?.fullName, branchValue, detail, candidate?.adapter ?? manual.adapter, pathTemplate, code]);
  }

  /** ① 리포 선택 — 브랜치 목록을 받고 그 자리에서 펼친다. 실패는 ①을 막지 않는다 (예외 D). */
  function selectRepo(next: RepoOption) {
    const request = ++repoRequest.current;
    // 리포 한 곳의 거부가 다른 리포까지 막지는 않는다. 계정·세션 거부는 유지한다.
    if (accessLost !== "unauthorized" && accessLost !== "reauthorize" && accessLost !== "not-connected") {
      setAccessLost(null);
      setBanner(null);
    }
    setBranchValue("");
    setRepo(next);
    setAccessError(undefined);
    setBranch(undefined);
    setBranchLoading(true);
    // 리포가 바뀌면 ②③이 통째로 무효다 — 옛 후보의 값이 남으면 다른 리포의 결정이 된다.
    resetDownstream();
    void listRepoBranches({ owner: next.owner, repo: next.repo }).then(
      (result) => {
        if (request !== repoRequest.current) return;
        setBranchLoading(false);
        if (!result.ok) {
          // `unavailable`은 목록 조회만 실패한 것이다 — default branch 하나로 접고 계속 간다.
          if (result.error === "unavailable" && result.defaultBranch !== undefined) {
            const fallback = planBranchChoice({ names: undefined, defaultBranch: result.defaultBranch });
            setBranch(fallback);
            setBranchValue(fallback.selected);
            return;
          }
          if (isAccessLost(result.error)) setAccessLost(result.error);
          setAccessError(result.error);
          return;
        }
        const choice = planBranchChoice(result);
        setBranch(choice);
        setBranchValue(choice.selected);
      },
      () => {
        if (request !== repoRequest.current) return;
        setBranchLoading(false);
        setAccessError("unavailable");
      },
    );
  }

  function resetDownstream() {
    detectRequest.current += 1;
    sampleGeneration.current += 1;
    setDetecting(false);
    setCandidates([]);
    setChecked(new Set());
    setBaseLocales({});
    setManualCandidate(undefined);
    setDetail(null);
    setLocale("");
    setSamples({});
    setDetectError(undefined);
    setBaseLocale("");
    setName("");
    setSlug("");
    setSlugTaken(false);
  }

  /** ①→② — **먼저 넘어간 뒤** 그 안이 스켈레톤으로 찬다 (DESIGN §6.7). */
  function detect() {
    if (repo === undefined) return;
    const request = ++detectRequest.current;
    sampleGeneration.current += 1;
    setCandidates([]);
    setChecked(new Set());
    setBaseLocales({});
    setManualCandidate(undefined);
    setDetail(null);
    setSamples({});
    setStep(2);
    setDetecting(true);
    setDetectError(undefined);
    setBanner(null);
    void detectRepoFormats({ owner: repo.owner, repo: repo.repo, ref: branchValue || undefined }).then(
      (result) => {
        if (request !== detectRequest.current) return;
        setDetecting(false);
        /**
         * 후보가 0개여도 ②로 간다 — 수동 지정이 유일한 길이고 그것을 펼쳐 보여야 한다.
         * ⚠️ **그때 배너를 세우지 않는다**: 그 화면이 같은 사실을 제목과 폼으로 말하므로 배너까지
         * 세우면 사용자가 오류 둘로 읽는다 (code-review 2026-09-07 🟡1).
         */
        if (result.ok) {
          setCandidates(result.candidates);
          setChecked(new Set(result.candidates.length ? [0] : []));
          setBaseLocales(Object.fromEntries(result.candidates.map((item, index) => [index, item.baseLocale])));
          applyCandidate(result.candidates, 0);
          return;
        }
        if (result.error === "no-candidates") return;
        if (isAccessLost(result.error)) setAccessLost(result.error);
        setDetectError(result.error);
      },
      () => {
        if (request !== detectRequest.current) return;
        setDetecting(false);
        setDetectError("unavailable");
      },
    );
  }

  function applyCandidate(list: CandidateSummary[], index: number) {
    const chosen = list[index];
    if (chosen === undefined) return;
    sampleGeneration.current += 1;
    setDetail(index);
    setLocale(chosen.baseLocale);
    setSlugTaken(false);
    setSamples(
      Object.fromEntries(
        chosen.samples.map((s) => [
          JSON.stringify([repo?.fullName, branchValue, index, chosen.adapter, chosen.pathTemplate, s.locale]),
          { status: "ready", rows: s.rows, total: s.total } as PreviewState,
        ]),
      ),
    );
  }

  /** ②의 언어 전환 — detect가 든 셋 밖은 누를 때 받는다 (DESIGN §6.7). */
  function chooseLocale(code: string) {
    setLocale(code);
    const key = sampleKey(code);
    if (samples[key] !== undefined || repo === undefined) return;
    const generation = sampleGeneration.current;
    setSamples((prev) => ({ ...prev, [key]: { status: "loading" } }));
    void loadCandidateSample({
      owner: repo.owner,
      repo: repo.repo,
      ref: branchValue,
      adapter: candidate?.adapter ?? manual.adapter,
      pathTemplate,
      locale: code,
      confirmation: candidate?.confirmation ?? manualCandidate?.confirmation,
    }).then(
      (result) => {
        if (generation !== sampleGeneration.current) return;
        if (!result.ok && isAccessLost(result.error)) {
          setAccessLost(result.error);
          setBanner(result.error);
        }
        if (result.ok) {
          const update = (item: CandidateSummary): CandidateSummary => ({
            ...item,
            samples: [...item.samples.filter((sample) => sample.locale !== code), { locale: code, rows: result.rows, total: result.total }],
          });
          if (detail === null) setManualCandidate((prev) => prev === undefined ? prev : update(prev));
          else setCandidates((prev) => prev.map((item, index) => index === detail ? update(item) : item));
        }
        setAnnounce(result.ok ? undefined : m.newProject.files.preview.unavailable);
        setSamples((prev) => ({
          ...prev,
          // ⚠️ **실패를 빈 결과로 위장하지 않는다** — 빈 언어(빈 칸)와 화면에서 갈린다.
          [key]: result.ok ? { status: "ready", rows: result.rows, total: result.total } : { status: "unavailable" },
        }));
      },
      () => {
        if (generation === sampleGeneration.current) {
          setSamples((prev) => ({ ...prev, [key]: { status: "unavailable" } }));
        }
      },
    );
  }

  /** 수동 지정은 경로를 칠 때마다 그 매칭이 곧 검증이다 (예외 E). */
  function changeManual(next: ManualEntry) {
    sampleGeneration.current += 1;
    setSamples({});
    setManualCandidate(undefined);
    setManual(next);
    setName("");
    setSlug("");
    setSlugTaken(false);
    setDetail(null);
    setLocale(next.baseLocale.trim());
    setBaseLocale(next.baseLocale.trim());
  }

  useEffect(() => {
    if (step !== 2 || !usingManual || repo === undefined) return;
    // 이전 입력의 사유는 새 입력의 판정이 아니다 — 입력을 비운 경우에도 걷는다.
    setManualError(undefined);
    const code = manual.baseLocale.trim();
    const template = manual.pathTemplate.trim();
    if (code === "" || template === "") return;
    const key = JSON.stringify([repo.fullName, branchValue, null, manual.adapter, template, code]);
    let active = true;
    const timer = setTimeout(() => {
      setSamples((prev) => ({ ...prev, [key]: { status: "loading" } }));
      void confirmManualFormat({
        owner: repo.owner, repo: repo.repo, ref: branchValue,
        adapter: manual.adapter, pathTemplate: template, baseLocale: code,
      }).then(
        (result) => {
          if (!active) return;
          if (!result.ok && isAccessLost(result.error)) {
            setAccessLost(result.error);
            setBanner(result.error);
          }
          if (result.ok) {
            setManualCandidate(result.candidate);
            setBaseLocale((prev) => prev || result.candidate.baseLocale);
            setLocale((prev) => prev || code);
            setSamples(Object.fromEntries(result.candidate.samples.map((sample) => [
              JSON.stringify([repo.fullName, branchValue, null, manual.adapter, template, sample.locale]),
              { status: "ready", rows: sample.rows, total: sample.total } as PreviewState,
            ])));
          } else {
            setSamples((prev) => ({ ...prev, [key]: { status: "unavailable" } }));
            if (!isAccessLost(result.error)) setManualError(result.error);
          }
        },
        () => {
          if (!active) return;
          setSamples((prev) => ({ ...prev, [key]: { status: "unavailable" } }));
          setManualError("unavailable");
        },
      );
    }, 400);
    // 입력 변경·Back 뒤 도착한 응답은 새 입력의 검증 근거가 아니다.
    return () => { active = false; clearTimeout(timer); };
  }, [step, usingManual, repo, branchValue, manual.adapter, manual.pathTemplate, manual.baseLocale]);

  /** ②→③ — 이름·주소의 **제안**을 채운다. 지우는 선행 상태가 없다 (DESIGN §6.7). */
  function toNaming() {
    if (repo === undefined) return;
    if (name === "") setName(repo.repo);
    if (slug === "") setSlug(repo.suggestedSlug);
    setStep(3);
  }

  /** ③→④ — **예외 I가 ③에 머문다**: 실패하면 넘어가지 않고 입력이 전부 남는다. */
  function create() {
    if (repo === undefined) return;
    if (pending || !validBases || (!usingManual && selection.conflicts.length > 0)) return;
    setBanner(null);
    setCreationFailure(null);
    startTransition(async () => {
      let result: CreateProjectResult;
      try { result = await createProject({
        owner: repo.owner,
        repo: repo.repo,
        manual: usingManual,
        surfaces: usingManual ? [{ adapter: manual.adapter, pathTemplate: manual.pathTemplate.trim(), baseLocale }] : selection.formats,
        slug,
        name,
        baseBranch: branchValue,
      }); } catch {
        setCreationFailure("unknown");
        return;
      }
      if (!result.ok) {
        if (isAccessLost(result.error)) setAccessLost(result.error);
        if (result.error === "slug-taken") {
          focusSlug.current = true;
          setSlugTaken(true);
          return;
        }
        setCreationFailure(result);
        return;
      }
      setCreated(result);
      setAnnounce(m.newProject.imported(result.count, 0));
      setStep(4);
    });
  }

  function close() {
    if (closeMode === "back") router.back();
    else router.replace(routes.projects(backQuery));
  }

  const titles = {
    1: m.newProject.steps.repo.title,
    2: candidates.length === 0 && !detecting ? m.newProject.steps.files.emptyTitle : m.newProject.steps.files.title,
    3: m.newProject.steps.naming.title,
    4: m.newProject.steps.result.title,
  } as const;

  const repoLabel = repo?.fullName ?? "";
  const descriptions = {
    1: m.newProject.steps.repo.description,
    2: detecting
      ? m.newProject.steps.files.loading(repoLabel, branchValue)
      : candidates.length === 0
        ? m.newProject.steps.files.emptyDescription(repoLabel, branchValue)
        : m.newProject.steps.files.description(candidates.length, repoLabel, branchValue),
    3: m.newProject.steps.naming.description,
    4: created === undefined ? m.newProject.steps.result.description
      : `${ingestHeadline(created.count, 0)} ${m.newProject.steps.result.description}`,
  } as const;

  return (
    <OnboardingModal
      open
      title={titles[step]}
      description={descriptions[step]}
      step={step}
      announce={announce}
      nextLabel={step === 3 ? m.newProject.naming.create : step === 4 ? m.newProject.result.ingest.open : undefined}
      nextArrow={step !== 3 && step !== 4}
      nextDisabled={!nextEnabled(step, state)}
      // ⚠️ **③→④만 [Next]가 로딩이다** — 예외 I가 ③에 머물러야 하므로 미리 넘어갈 수 없다.
      // 나머지 전이는 "다음 단계 안의 스켈레톤"이 규칙이다 (DESIGN §6.7).
      nextPending={step === 3 && pending}
      showBack={step === 2 || step === 3}
      bodyDirection={step === 2 ? "row" : "column"}
      bodyScroll={step === 2 || step === 4 ? "hidden" : "auto"}
      onBack={() => {
        if (!accessLost) setBanner(null);
        setCreationFailure(null);
        if (step === 2) {
          detectRequest.current += 1;
          sampleGeneration.current += 1;
          setDetecting(false);
          setSamples((prev) => Object.fromEntries(Object.entries(prev).filter(([, value]) => value.status !== "loading")));
        }
        setStep(step === 3 ? 2 : 1);
      }}
      onNext={() => {
        if (step === 1) detect();
        else if (step === 2) toNaming();
        else if (step === 3) create();
        else router.push(routes.translations(created?.slug ?? ""));
      }}
      // ⚠️ **생성 중에는 닫히지 않는다** (audit #13) — 닫아도 `createProject`는 계속 돌고, ④의 일회용 push 토큰을
      // 볼 자리가 경고 없이 사라진다 (DESIGN §6.4). ×·Esc·배경이 전부 이 한 값을 지난다.
      closeDisabled={pending}
      onClose={close}
    >
      {step === 1 && (
        <RepoStep
          state={{
            repos,
            query: repoQuery,
            listError,
            installUrl,
            backQuery,
            now,
            selected: repo?.fullName,
            branch,
            branchLoading,
            branchValue,
            accessError,
            banner: accessLost ?? banner,
            pending: installPending,
          }}
          onAnnounce={setAnnounce}
          onQueryChange={setRepoQuery}
          onSelect={selectRepo}
          onBranchChange={(value) => {
            setBranchValue(value);
            resetDownstream();
          }}
        />
      )}

      {step === 2 && (
        <FilesStep
          state={{
            detecting,
            detectError,
            candidates,
            picked: detail,
            locale,
            preview: samples[sampleKey(locale)] ?? { status: "loading" },
            manual,
            manualCandidate,
            manualMatched,
            manualError,
            adapters,
            repoLabel,
            branch: branchValue,
            banner: accessLost ?? banner,
          }}
          selection={{ checked, conflicts: selection.conflicts, onToggle: index => {
            setChecked(previous => {
              const next = new Set(previous);
              if (next.has(index)) next.delete(index); else next.add(index);
              return next;
            });
          } }}
          onPick={(index) => applyCandidate(candidates, index)}
          onLocale={chooseLocale}
          onManual={changeManual}
          onRetry={detect}
        />
      )}

      {step === 3 && (
        <fieldset disabled={pending} className="contents">
          {pending && <p role="status" className="text-muted-foreground text-sm">{m.newProject.naming.creating}</p>}
          {creationFailure !== null && <Alert variant="danger">
            {creationFailure === "unknown" ? m.newProject.naming.resultUnknown : <>
              <p>{m.newProject.naming.nothingCreated} {creationFailure.error === "path-conflict" ? m.newProject.files.conflicts : failureText(creationFailure.error)}</p>
              {creationFailure.surface && <>
                <p>{m.newProject.naming.failedSurface(creationFailure.surface.pathTemplate, creationFailure.surface.failed)}</p>
                {creationFailure.surface.errors.slice(0, 5).map((error, index) => <p key={index} className="whitespace-pre-wrap text-xs">{adapterErrorMessage(error)}</p>)}
              </>}
              {creationFailure.conflicts?.map(conflict => <p key={conflict.path}>{conflict.path}</p>)}
            </>}
          </Alert>}
          <NamingStep
            disabled={pending}
            surfaces={!usingManual && selectedCandidates.length > 1 ? selectedCandidates.map(({ item, index }) => ({
              pathTemplate: item.pathTemplate, locales: item.locales, baseLocale: baseLocales[index] ?? "",
              keyCounts: Object.fromEntries(item.samples.map(sample => [sample.locale, sample.total])),
            })) : undefined}
            onBaseLocale={(index, value) => {
              const selected = selectedCandidates[index];
              if (selected) setBaseLocales(previous => ({ ...previous, [selected.index]: value }));
            }}
            state={{
              name,
              slug,
              baseLocale: chosenBase,
              locales: chosenCandidate?.locales ?? [],
              keyCounts: Object.fromEntries(
                (chosenCandidate?.samples ?? []).map((s) => [s.locale, s.total] as const),
              ),
              slugTakenAlt: suggestAlternateSlug(slug),
              slugTaken,
              // ③의 info가 "무엇을 읽는가"를 말한다 — 표면이 여럿이면 그 경로도 전부 들어야 한다.
              pathTemplate: usingManual ? pathTemplate
                : selectedCandidates.map(({ item }) => item.pathTemplate).join(", ") || pathTemplate,
              branch: branchValue,
              banner: accessLost ?? banner,
            }}
            onChange={(next) => {
              if (next.name !== undefined) setName(next.name);
              if (next.slug !== undefined) setSlug(next.slug);
              if (next.baseLocale !== undefined) {
                if (usingManual) setBaseLocale(next.baseLocale);
                else {
                  const selected = selectedCandidates[0];
                  if (selected) setBaseLocales(previous => ({ ...previous, [selected.index]: next.baseLocale! }));
                }
              }
              if (next.slugTaken === false) setSlugTaken(false);
            }}
          />
        </fieldset>
      )}

      {step === 4 && created !== undefined && (
        <ResultStep
          pushToken={created.pushToken}
          yaml={created.yaml}
        />
      )}
    </OnboardingModal>
  );
}
