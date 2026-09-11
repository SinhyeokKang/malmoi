"use client";

import { Plus, Search } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

import { createProject, detectRepoFormats, runFirstIngest } from "@/app/(edit)/projects/actions";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormGroup } from "@/components/ui/form-group";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import type { Adapter, AdapterError, AdapterName } from "@/lib/adapters/types";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import { m } from "@/lib/i18n";
import { adapterErrorMessage } from "@/lib/i18n/adapter-errors";
import type { CandidateSummary } from "@/lib/onboarding/detect";
import { ingestHeadline, isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";
import { renderWorkflowYaml } from "@/lib/onboarding/workflow";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";
import { WorkflowBlock } from "./workflow-block";

/**
 * 온보딩 ②~⑥ (design §2). **한 라우트의 클라이언트 상태다** — 단계를 URL로 쪼개지 않는다:
 * 중간 상태를 서버에 저장하지 않으므로(§3.4) 새로고침하면 처음부터인데, 라우트를 쪼개면 그것이
 * "깨진 것"으로 보인다.
 *
 * ⚠️ **④가 지나면 행은 있다.** 그 뒤 새로고침·세션 만료로 ⑤⑥을 잃어도 프로젝트는 `/projects`에
 * "Waiting for first import"로 보이고 설정 화면의 상태 블록이 이어받는다 — **토큰 원문만 다시 못 본다.**
 *
 * ⚠️ **어댑터 내부 이름을 화면에 쓰지 않는다** (SAAS §3 · design §3.3). 라벨·경로 예시는 서버가
 * `formatLabel`로 만들어 내려준다 — 그 표를 클라이언트에 복사하면 두 벌이 된다. **`lib/onboarding/detect`를
 * 값으로 import하지 않는 이유도 그것이다**: 그 모듈은 어댑터 전부(ts-morph 포함)를 문다.
 *
 * ⚠️ **대기는 버튼 라벨 교체다** (DESIGN §6.4) — 옆 문구는 폭을 흔든다.
 */

/** 서버가 만들어 내려주는 리포 항목. `suggestedSlug`는 `normalizeProjectSlug`의 결과다. */
export type RepoOption = { owner: string; repo: string; fullName: string; suggestedSlug: string };

/**
 * 수동 지정 셀렉트의 선택지. `formatLabel`(design §3.3 표)이 만든다.
 *
 * ⚠️ **`layout`은 서버가 `Adapter.layout`에서 그대로 내려준다** — 이 파일이 `lib/adapters`를 값으로
 * 읽으면 ts-morph가 클라이언트 번들에 들어온다 (POSTMORTEM 2026-09-07, `client-graph.test.ts`).
 */
export type AdapterChoice = { adapter: AdapterName; layout: Adapter["layout"]; label: string; example: string };

/**
 * Path 힌트의 갈래 — 사전에 layout 전부가 있는지를 **여기서** 닫는다 (`lib/auth/message.ts`와 같은 관용구:
 * 사전은 잎이라 `satisfies`를 못 걸고 소비자가 건다).
 */
const PATH_HINTS = m.newProject.files.manual.pathHint satisfies Record<
  Adapter["layout"],
  (token: ReactNode) => ReactNode
>;

type Manual = { adapter: AdapterName; pathTemplate: string; baseLocale: string };

type Stage =
  | { name: "pick" }
  | { name: "chosen"; repo: RepoOption; candidates: CandidateSummary[] }
  | { name: "created"; slug: string; pushToken: string; yaml: string };

type Ingest =
  | { status: "running" }
  | { status: "done"; count: number; failed: number; errors: AdapterError[] }
  | { status: "failed"; error: string };

export function NewProjectFlow({ repos, adapters }: { repos: RepoOption[]; adapters: AdapterChoice[] }) {
  const [stage, setStage] = useState<Stage>({ name: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [ingest, setIngest] = useState<Ingest | null>(null);

  function detect(repo: RepoOption) {
    setError(null);
    startTransition(async () => {
      const result = await detectRepoFormats({ owner: repo.owner, repo: repo.repo });
      /**
       * 후보가 0개여도 화면을 넘긴다 — 수동 지정이 유일한 길이고 그것을 펼쳐 보여야 한다 (design §3.5).
       * ⚠️ **그때 `setError`를 하지 않는다**: 다음 화면이 같은 사실을 이유 문구와 함께 말하므로
       * 페이지 배너까지 세우면 사용자가 오류 둘로 읽는다 (code-review 2026-09-07 🟡1).
       */
      if (result.ok) {
        setStage({ name: "chosen", repo, candidates: result.candidates });
        return;
      }
      if (result.error === "no-candidates") {
        setStage({ name: "chosen", repo, candidates: [] });
        return;
      }
      setError(result.error);
    });
  }

  function create(input: {
    repo: RepoOption;
    adapter: AdapterName;
    pathTemplate: string;
    baseLocale: string;
    slug: string;
    name: string;
    manual: boolean;
  }) {
    setError(null);
    startTransition(async () => {
      const result = await createProject({
        owner: input.repo.owner,
        repo: input.repo.repo,
        adapter: input.adapter,
        pathTemplate: input.pathTemplate,
        baseLocale: input.baseLocale,
        slug: input.slug,
        name: input.name,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStage({
        name: "created",
        slug: result.slug,
        pushToken: result.pushToken,
        // 수동 지정만 어댑터·기준 언어를 YAML에 고정한다 — 자동 후보는 탐지가 같은 답을 낸다 (design §7).
        yaml: renderWorkflowYaml({
          slug: result.slug,
          baseBranch: result.baseBranch,
          ...(input.manual ? { adapter: input.adapter, baseLocale: input.baseLocale } : {}),
        }),
      });
      startIngest(result.slug);
    });
  }

  function startIngest(slug: string) {
    setIngest({ status: "running" });
    void runFirstIngest({ slug }).then(
      (result) =>
        setIngest(
          result.ok
            ? { status: "done", count: result.count, failed: result.failed, errors: result.errors }
            : { status: "failed", error: result.error },
        ),
      // 던지는 경로는 직렬화 실패·네트워크뿐이다. 화면이 멈춰 있으면 사용자가 무엇을 기다리는지 모른다.
      () => setIngest({ status: "failed", error: "unavailable" }),
    );
  }

  return (
    <div className="space-y-4">
      {error !== null && <Alert variant="danger">{failureText(error)}</Alert>}

      {stage.name === "pick" && <RepoPicker repos={repos} pending={pending} onPick={detect} />}

      {stage.name === "chosen" && (
        <ConfirmStep
          repo={stage.repo}
          candidates={stage.candidates}
          adapters={adapters}
          pending={pending}
          onBack={() => {
            setError(null);
            setStage({ name: "pick" });
          }}
          onCreate={create}
        />
      )}

      {stage.name === "created" && (
        <Result
          slug={stage.slug}
          pushToken={stage.pushToken}
          yaml={stage.yaml}
          ingest={ingest}
          onRetry={() => startIngest(stage.slug)}
        />
      )}
    </div>
  );
}

/** ② 리포 고르기. 목록이 길 수 있어 텍스트 필터를 둔다 — 페이지네이션은 넣지 않는다. */
function RepoPicker({
  repos,
  pending,
  onPick,
}: {
  repos: RepoOption[];
  pending: boolean;
  onPick: (repo: RepoOption) => void;
}) {
  const [query, setQuery] = useState("");
  /**
   * ⚠️ **어느 행을 눌렀는지 기억한다.** `pending` 하나로 모든 행의 라벨을 교체하면 12개가 동시에
   * "Detecting…"이 되어 사용자가 자기 선택을 화면에서 확인할 수 없다 (code-review 2026-09-07 🟡2).
   * DESIGN §6.4의 "라벨 교체"는 누른 버튼 하나를 가리킨다.
   */
  const [picking, setPicking] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const shown = needle === "" ? repos : repos.filter((r) => r.fullName.toLowerCase().includes(needle));

  return (
    <Card title={m.newProject.repo.title}>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-2 left-2 size-4" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={m.newProject.repo.search}
          aria-label={m.newProject.repo.search}
          className="w-full pl-8"
        />
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-xs">{m.newProject.repo.none}</p>
      ) : (
        <ul className="divide-border border-border divide-y rounded-md border">
          {shown.map((repo) => (
            <li key={repo.fullName} className="flex items-center gap-2 px-3 py-2">
              {/* owner/name은 식별자라 mono다 (DESIGN §4.1) */}
              <span className="text-mono min-w-0 flex-1 truncate">{repo.fullName}</span>
              <Button
                loading={pending && picking === repo.fullName}
                disabled={pending}
                onClick={() => {
                  setPicking(repo.fullName);
                  onPick(repo);
                }}
              >
                {m.newProject.repo.pick}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * ③④ 후보 확정 + 이름·주소. **하나의 폼이다** — 후보를 고르면 기준 언어 라디오가 그 후보의
 * 로케일로 바뀌고, 그 아래에서 바로 확정한다.
 */
function ConfirmStep({
  repo,
  candidates,
  adapters,
  pending,
  onBack,
  onCreate,
}: {
  repo: RepoOption;
  candidates: CandidateSummary[];
  adapters: AdapterChoice[];
  pending: boolean;
  onBack: () => void;
  onCreate: (input: {
    repo: RepoOption;
    adapter: AdapterName;
    pathTemplate: string;
    baseLocale: string;
    slug: string;
    name: string;
    manual: boolean;
  }) => void;
}) {
  const [picked, setPicked] = useState<number | null>(candidates.length > 0 ? 0 : null);
  const [baseLocale, setBaseLocale] = useState(candidates[0]?.baseLocale ?? "");
  const [manual, setManual] = useState<Manual>({
    adapter: adapters[0]?.adapter ?? "json-catalog",
    pathTemplate: "",
    baseLocale: "",
  });
  const [name, setName] = useState(repo.repo);
  const [slug, setSlug] = useState(repo.suggestedSlug);

  // 셀렉트의 선택지가 `adapters` 그 배열이라 못 찾을 수 없다 — 폴백은 타입을 닫기 위한 것이다.
  const manualChoice = adapters.find((c) => c.adapter === manual.adapter);
  const candidate = picked === null ? undefined : candidates[picked];
  const usingManual = candidate === undefined;
  const ready = usingManual
    ? manual.pathTemplate.trim() !== "" && manual.baseLocale.trim() !== ""
    : baseLocale !== "";

  function submit() {
    if (candidate !== undefined) {
      onCreate({ repo, adapter: candidate.adapter, pathTemplate: candidate.pathTemplate, baseLocale, slug, name, manual: false });
      return;
    }
    onCreate({
      repo,
      adapter: manual.adapter,
      pathTemplate: manual.pathTemplate.trim(),
      baseLocale: manual.baseLocale.trim(),
      slug,
      name,
      manual: true,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <span className="text-mono bg-muted rounded px-2 py-1">{repo.fullName}</span>
        {/* muted 표면 옆이라 링에 offset을 덧댄다 (DESIGN §7) */}
        <Button variant="ghost" size="sm" onClick={onBack} className="focus-visible:ring-offset-1">
          {m.newProject.repo.other}
        </Button>
      </div>

      <Card title={m.newProject.files.title}>
        {candidates.length === 0 ? (
          <Alert variant="info">
            {/* 사유는 판정층 문구를 쓴다 — 두 벌이면 같은 상태가 화면마다 다르게 읽힌다 (리뷰 ⚪10) */}
            {onboardErrorMessage("no-candidates")}
          </Alert>
        ) : (
          <>
            <ul className="divide-border border-border divide-y rounded-md border">
              {candidates.map((c, index) => (
                // 선택 행은 `bg-muted font-medium`이다 (DESIGN §6.7). `Radio`가 자기 `<label>`을 드므로
                // 여기서 또 감싸지 않는다 — 중첩 라벨은 클릭 대상이 둘로 갈린다.
                <li key={c.pathTemplate} className={cn("px-3 py-2", picked === index && "bg-muted font-medium")}>
                  <Radio
                    name="candidate"
                    checked={picked === index}
                    onChange={() => {
                      setPicked(index);
                      setBaseLocale(c.baseLocale);
                    }}
                    label={
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block">{c.label}</span>
                        {/* 경로는 사용자가 자기 리포에서 확인할 수 있는 유일한 단서다 (design §3.3) */}
                        <span className="text-mono text-muted-foreground block truncate">{c.pathTemplate}</span>
                        <span className="text-muted-foreground block text-xs">
                          {m.newProject.files.summary(
                            c.locales,
                            c.keys.status === "counted"
                              ? m.newProject.files.keys(c.keys.count)
                              : onboardErrorMessage("key-count-failed"),
                          )}
                        </span>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">{m.newProject.files.more}</p>
          </>
        )}

        {candidate !== undefined && (
          <fieldset className="space-y-2 pt-2">
            <legend className="text-sm font-medium">{m.newProject.baseLocale.title}</legend>
            <p className="text-muted-foreground text-xs">{m.newProject.baseLocale.hint}</p>
            <div className="flex flex-wrap gap-3">
              {candidate.locales.map((code) => (
                <Radio
                  key={code}
                  name="baseLocale"
                  checked={baseLocale === code}
                  onChange={() => setBaseLocale(code)}
                  label={<span>{code}</span>}
                />
              ))}
            </div>
          </fieldset>
        )}

        {/* `no-candidates`면 펼친 채 첫 화면의 주 행동이다 — 그때는 이것이 유일한 길이다 (design §3.5) */}
        <details open={candidates.length === 0} className="border-border rounded-md border p-4">
          <summary className="cursor-pointer text-sm font-medium">{m.newProject.files.manual.summary}</summary>
          <div className="space-y-3 pt-3">
            <FormGroup label={m.newProject.files.manual.format} htmlFor="manual-format">
              <Select
                id="manual-format"
                value={manual.adapter}
                onChange={(e) => setManual({ ...manual, adapter: e.target.value as AdapterName })}
                className="w-full"
              >
                {adapters.map((choice) => (
                  <option key={choice.adapter} value={choice.adapter}>
                    {choice.label} — {choice.example}
                  </option>
                ))}
              </Select>
            </FormGroup>
            <FormGroup
              label={m.newProject.files.manual.path}
              htmlFor="manual-path"
              help={PATH_HINTS[manualChoice?.layout ?? "per-locale"](
                <span className="text-mono">{manualChoice?.layout === "multi-locale" ? "*" : "{locale}"}</span>,
              )}
            >
              <Input
                id="manual-path"
                value={manual.pathTemplate}
                onChange={(e) => setManual({ ...manual, pathTemplate: e.target.value })}
                onFocus={() => setPicked(null)}
                placeholder={manualChoice?.example ?? "src/locales/{locale}.json"}
                className="text-mono w-full"
              />
            </FormGroup>
            <FormGroup label={m.newProject.files.manual.baseLocale} htmlFor="manual-base">
              <Input
                id="manual-base"
                value={manual.baseLocale}
                onChange={(e) => setManual({ ...manual, baseLocale: e.target.value })}
                onFocus={() => setPicked(null)}
                placeholder="en"
                className="text-mono w-full"
              />
            </FormGroup>
            {/* ⚠️ 이 문장은 **블록 전체**를 설명한다 — 필드의 `help`로 매달면 그 필드의 설명으로 읽힌다 */}
            <p className="text-muted-foreground text-xs">{m.newProject.files.manual.hint}</p>
          </div>
        </details>
      </Card>

      <Card title={m.newProject.naming.title}>
        <FormGroup label={m.newProject.naming.name} htmlFor="project-name">
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full"
          />
        </FormGroup>
        <FormGroup
          label={m.newProject.naming.slug}
          htmlFor="project-slug"
          help={m.newProject.naming.hint(
            <span className="text-mono">mal-moi.com/projects/{slug || "…"}</span>,
            // 브랜치 이름의 정본은 `syncBranchFor`다 — 여기 있는 것은 그 규칙의 설명이다
            <span className="text-mono">l10n/sync-{slug || "…"}</span>,
          )}
        >
          <Input
            id="project-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="text-mono w-full"
          />
        </FormGroup>
        <Button
          variant="primary"
          disabled={!ready}
          loading={pending}
          onClick={submit}
        >
          <Plus aria-hidden />
          {m.newProject.naming.create}
        </Button>
      </Card>
    </div>
  );
}

/** ⑤⑥ 토큰·워크플로 + 첫 적재. **토큰 원문은 이 화면에서만 보인다** (design §3.13). */
function Result({
  slug,
  pushToken,
  yaml,
  ingest,
  onRetry,
}: {
  slug: string;
  pushToken: string;
  yaml: string;
  ingest: Ingest | null;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card title={m.newProject.result.token.title}>
        <p className="text-muted-foreground text-xs">
          {m.newProject.result.token.description(<span className="text-mono">PUSH_TOKEN</span>)}
        </p>
        <div className="flex items-center gap-2">
          <code className="text-mono bg-muted min-w-0 flex-1 truncate rounded px-2 py-1">{pushToken}</code>
          <CopyButton value={pushToken} />
        </div>
      </Card>

      <Card title={m.settings.workflow.title}>
        <WorkflowBlock yaml={yaml} />
      </Card>

      <Card title={m.newProject.result.ingest.title}>
        {ingest === null || ingest.status === "running" ? (
          <p className="text-muted-foreground text-xs">{m.newProject.result.ingest.running}</p>
        ) : ingest.status === "failed" ? (
          <div className="space-y-2">
            <Alert variant="danger">{failureText(ingest.error)}</Alert>
            <Button onClick={onRetry}>{m.newProject.result.ingest.retry}</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* 불변식 9 — 0건이 아니면 성공 문구를 그대로 쓰지 않는다 */}
            <Alert variant={ingest.failed === 0 ? "success" : "warning"}>
              <p>{ingestHeadline(ingest.count, ingest.failed)}</p>
              {/* 같은 파일에 에러가 둘 나올 수 있어 index를 섞는다 — 표시 전용 목록이다 */}
              {ingest.errors.slice(0, 5).map((e, index) => (
                <div key={`${index} ${e.path}`} className="text-xs">
                  {m.newProject.result.ingest.couldNotRead(e.path)}
                  {/* 진단은 접어 둔다 — 코드는 사전이 문장으로 내고 파서 원문은 그 뒤에 붙는다 (6b-1) */}
                  <details className="mt-0.5">
                    <summary className="cursor-pointer">{m.newProject.result.ingest.diagnostics}</summary>
                    {/* ⚠️ `detail`이 여러 줄일 수 있다 — YAML 파서가 캐럿 다이어그램을 넣는다. `text-mono`엔
                        `white-space`가 없어 기본값이 개행을 공백으로 접고 캐럿이 가리킬 열을 잃는다 */}
                    <span className="text-mono whitespace-pre-wrap">{adapterErrorMessage(e)}</span>
                  </details>
                </div>
              ))}
            </Alert>
            <p className="text-muted-foreground text-xs">{m.newProject.result.ingest.refsHint}</p>
            <ButtonLink variant="primary" href={routes.translations(slug)}>
              {m.newProject.result.ingest.open}
            </ButtonLink>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * 세 union을 다 읽는다 — Action이 `OnboardError`를, callback 경유가 `ConnectError`를, 인가가
 * `AccessError`를 낸다. **한쪽만 보면 그 사유가 통째로 무음이다** (POSTMORTEM 2026-09-06).
 * 모르는 값에 던지지 않는다: Action이 갈래를 늘려도 화면이 죽지 않아야 한다.
 */
function failureText(error: string): string {
  if (isOnboardError(error)) return onboardErrorMessage(error);
  if (isConnectError(error)) return connectErrorMessage(error);
  if (isAccessError(error)) return accessErrorMessage(error);
  return m.newProject.result.failed;
}
