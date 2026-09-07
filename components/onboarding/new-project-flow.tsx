"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { createProject, detectRepoFormats, runFirstIngest } from "@/app/(edit)/projects/actions";
import type { AdapterName } from "@/lib/adapters/types";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { connectErrorMessage, isConnectError } from "@/lib/github-connect/message";
import type { CandidateSummary } from "@/lib/onboarding/detect";
import { ingestHeadline, isOnboardError, onboardErrorMessage } from "@/lib/onboarding/message";
import { renderWorkflowYaml } from "@/lib/onboarding/workflow";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";
import { WorkflowBlock } from "./workflow-block";

/**
 * 온보딩 ②~⑥ (design §2). **한 라우트의 클라이언트 상태다** — 단계를 URL로 쪼개지 않는다:
 * 중간 상태를 서버에 저장하지 않으므로(§3.4) 새로고침하면 처음부터인데, 라우트를 쪼개면 그것이
 * "깨진 것"으로 보인다.
 *
 * ⚠️ **④가 지나면 행은 있다.** 그 뒤 새로고침·세션 만료로 ⑤⑥을 잃어도 프로젝트는 `/projects`에
 * "첫 적재 대기"로 보이고 설정 화면의 상태 섹션이 이어받는다 — **토큰 원문만 다시 못 본다.**
 *
 * ⚠️ **어댑터 내부 이름을 화면에 쓰지 않는다** (SAAS §3 · design §3.3). 라벨·경로 예시는 서버가
 * `formatLabel`로 만들어 내려준다 — 그 표를 클라이언트에 복사하면 두 벌이 된다. **`lib/onboarding/detect`를
 * 값으로 import하지 않는 이유도 그것이다**: 그 모듈은 어댑터 전부(ts-morph 포함)를 문다.
 *
 * ⚠️ **대기는 버튼 라벨 교체다** (DESIGN §6.4) — 옆 문구는 폭을 흔든다.
 */

/** 서버가 만들어 내려주는 리포 항목. `suggestedSlug`는 `normalizeProjectSlug`의 결과다. */
export type RepoOption = { owner: string; repo: string; fullName: string; suggestedSlug: string };

/** 수동 지정 셀렉트의 선택지. `formatLabel`(design §3.3 표)이 만든다. */
export type AdapterChoice = { adapter: AdapterName; label: string; example: string };

type Manual = { adapter: AdapterName; pathTemplate: string; baseLocale: string };

type Stage =
  | { name: "pick" }
  | { name: "chosen"; repo: RepoOption; candidates: CandidateSummary[] }
  | { name: "created"; slug: string; pushToken: string; yaml: string };

type Ingest =
  | { status: "running" }
  | { status: "done"; count: number; failed: number; errors: { path: string; message: string }[] }
  | { status: "failed"; error: string };

/**
 * DESIGN §6.4의 클래스. **포커스 링 셋은 여기 없다** — `components/__tests__/focus-ring.test.ts`가
 * 여는 태그의 **소스**를 훑으므로 상수에 숨기면 그 방어선이 이 파일을 못 본다. 컨트롤마다 리터럴로
 * 적는 것이 의도된 중복이다 (DESIGN §7: "표에서 클래스를 복사하면 이 셋이 딸려온다").
 */
const RING = "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none";
const TOOLBAR =
  "border-input hover:bg-accent h-8 shrink-0 rounded-md border px-3 text-xs font-medium disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:bg-transparent";
const PRIMARY =
  "bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70";
const FIELD = "border-input bg-background rounded-md border px-2 py-1 text-sm";

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
      {error !== null && <p className="text-destructive text-sm">{failureText(error)}</p>}

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
   * "탐지하는 중…"이 되어 사용자가 자기 선택을 화면에서 확인할 수 없다 (code-review 2026-09-07 🟡2).
   * DESIGN §6.4의 "라벨 교체"는 누른 버튼 하나를 가리킨다.
   */
  const [picking, setPicking] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const shown = needle === "" ? repos : repos.filter((r) => r.fullName.toLowerCase().includes(needle));

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">리포 고르기</h2>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="리포 이름으로 찾기"
        className={cn(FIELD, "h-8 w-full text-xs", "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none")}
      />
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-xs">그 이름을 가진 리포가 없어요.</p>
      ) : (
        <ul className="divide-border border-border divide-y rounded-md border">
          {shown.map((repo) => (
            <li key={repo.fullName} className="flex items-center gap-2 px-3 py-2">
              {/* owner/name은 식별자라 mono다 (DESIGN §4.1) */}
              <span className="text-mono min-w-0 flex-1 truncate">{repo.fullName}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setPicking(repo.fullName);
                  onPick(repo);
                }}
                className={cn(TOOLBAR, "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none")}
              >
                {pending && picking === repo.fullName ? "탐지하는 중…" : "고르기"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
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
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "text-muted-foreground hover:text-foreground text-xs underline",
            "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none",
          )}
        >
          다른 리포 고르기
        </button>
      </div>

      {candidates.length === 0 ? (
        <p className="text-destructive text-sm">
          로케일 파일을 찾지 못했어요 — 언어가 2개 이상인 로케일 파일이 필요해요. 아래에서 직접 지정해 주세요.
        </p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">번역 파일</legend>
          <ul className="divide-border border-border divide-y rounded-md border">
            {candidates.map((c, index) => (
              <li key={c.pathTemplate}>
                <label
                  className={cn(
                    "flex cursor-pointer items-baseline gap-2 px-3 py-2",
                    picked === index && "bg-muted font-medium",
                  )}
                >
                  <input
                    type="radio"
                    name="candidate"
                    checked={picked === index}
                    onChange={() => {
                      setPicked(index);
                      setBaseLocale(c.baseLocale);
                    }}
                    className={cn("mt-1", "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none")}
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block text-sm">{c.label}</span>
                    {/* 경로는 사용자가 자기 리포에서 확인할 수 있는 유일한 단서다 (design §3.3) */}
                    <span className="text-mono text-muted-foreground block truncate">{c.pathTemplate}</span>
                    <span className="text-muted-foreground block text-xs">
                      언어 {c.locales.length}개 ({c.locales.join(", ")}) ·{" "}
                      {c.keys.status === "counted" ? `키 ${c.keys.count}개` : "키 수 확인 실패"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            더 있을 수 있어요 — 찾는 파일이 없으면 아래에서 직접 지정해 주세요.
          </p>
        </fieldset>
      )}

      {candidate !== undefined && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">기준 언어</legend>
          <p className="text-muted-foreground text-xs">
            어떤 키가 존재하는지를 이 언어의 파일이 정해요. 틀리면 다른 언어에만 있는 키가 빠져요.
          </p>
          <div className="flex flex-wrap gap-3">
            {candidate.locales.map((code) => (
              <label key={code} className="flex items-baseline gap-1">
                <input
                  type="radio"
                  name="baseLocale"
                  checked={baseLocale === code}
                  onChange={() => setBaseLocale(code)}
                  className="focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none"
                />
                <span className="text-mono">{code}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* `no-candidates`면 펼친 채 첫 화면의 주 행동이다 — 그때는 이것이 유일한 길이다 (design §3.5) */}
      <details open={candidates.length === 0} className="border-border rounded-md border p-4">
        <summary className="cursor-pointer text-sm font-medium">찾는 파일이 없나요?</summary>
        <div className="space-y-2 pt-2">
          <label className="block space-y-1">
            <span className="text-muted-foreground block text-xs">파일 형식</span>
            <select
              value={manual.adapter}
              onChange={(e) => setManual({ ...manual, adapter: e.target.value as AdapterName })}
              className={cn(FIELD, "w-full", "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none")}
            >
              {adapters.map((choice) => (
                <option key={choice.adapter} value={choice.adapter}>
                  {choice.label} — {choice.example}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground block text-xs">
              경로 (<span className="text-mono">{"{locale}"}</span> 자리가 언어 자리예요)
            </span>
            <input
              type="text"
              value={manual.pathTemplate}
              onChange={(e) => setManual({ ...manual, pathTemplate: e.target.value })}
              onFocus={() => setPicked(null)}
              placeholder="src/locales/{locale}.json"
              className={cn(FIELD, "text-mono w-full", "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none")}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground block text-xs">기준 언어</span>
            <input
              type="text"
              value={manual.baseLocale}
              onChange={(e) => setManual({ ...manual, baseLocale: e.target.value })}
              onFocus={() => setPicked(null)}
              placeholder="en"
              className={cn(FIELD, "text-mono w-full", "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none")}
            />
          </label>
          <p className="text-muted-foreground text-xs">
            직접 지정하면 위의 후보 선택은 해제돼요. 그 경로에서 파일을 찾지 못하면 만들어지지 않아요.
          </p>
        </div>
      </details>

      <section className="border-border space-y-2 rounded-md border p-4">
        <h2 className="text-sm font-medium">이름과 주소</h2>
        <label className="block space-y-1">
          <span className="text-muted-foreground block text-xs">이름</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(FIELD, "w-full", "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none")}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-muted-foreground block text-xs">주소</span>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className={cn(FIELD, "text-mono w-full", "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none")}
          />
        </label>
        <p className="text-muted-foreground text-xs">
          <span className="text-mono">mal-moi.com/projects/{slug || "…"}</span> 로 열려요. 번역 결과는 리포의{" "}
          {/* 브랜치 이름의 정본은 `syncBranchFor`다 — 여기 있는 것은 그 규칙의 설명이다 */}
          <span className="text-mono">l10n/sync-{slug || "…"}</span> 브랜치로 PR이 열려요.{" "}
          <strong>주소는 나중에 바꿀 수 없어요.</strong>
        </p>
        <button
          type="button"
          disabled={pending || !ready}
          onClick={submit}
          className={cn(PRIMARY, "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none")}
        >
          {pending ? "만드는 중…" : "프로젝트 만들기"}
        </button>
      </section>
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
      <section className="border-border space-y-2 rounded-md border p-4">
        <h2 className="text-sm font-medium">push 토큰</h2>
        <p className="text-muted-foreground text-xs">
          리포의 Actions secret <span className="text-mono">PUSH_TOKEN</span>에 넣어 주세요.{" "}
          <strong>이 화면을 벗어나면 다시 볼 수 없어요.</strong> 잃어버리면 설정에서 재발급할 수 있어요.
        </p>
        <div className="flex items-center gap-2">
          <code className="text-mono bg-muted min-w-0 flex-1 truncate rounded px-2 py-1">{pushToken}</code>
          <CopyButton value={pushToken} label="토큰 복사" />
        </div>
      </section>

      <section className="border-border space-y-2 rounded-md border p-4">
        <h2 className="text-sm font-medium">워크플로</h2>
        <WorkflowBlock yaml={yaml} />
      </section>

      <section className="border-border space-y-2 rounded-md border p-4">
        <h2 className="text-sm font-medium">첫 적재</h2>
        {ingest === null || ingest.status === "running" ? (
          <p className="text-muted-foreground text-xs">적재하는 중…</p>
        ) : ingest.status === "failed" ? (
          <div className="space-y-2">
            <p className="text-destructive text-xs">{failureText(ingest.error)}</p>
            <button
              type="button"
              onClick={onRetry}
              className={cn(TOOLBAR, "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none")}
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* 불변식 9 — 0건이 아니면 성공 문구를 그대로 쓰지 않는다 */}
            <p className="text-sm">{ingestHeadline(ingest.count, ingest.failed)}</p>
            {/* 같은 파일에 에러가 둘 나올 수 있어 index를 섞는다 — 표시 전용 목록이다 */}
            {ingest.errors.slice(0, 5).map((e, index) => (
              <p key={`${e.path}\u0000${index}`} className="text-muted-foreground text-xs">
                <span className="text-mono">{e.path}</span> — {e.message}
              </p>
            ))}
            <p className="text-muted-foreground text-xs">
              코드 참조는 CI가 처음 push한 뒤에 채워져요. 지금부터 번역을 편집할 수 있어요.
            </p>
            <Link
              href={`/projects/${slug}/translations`}
              className={cn(
                "inline-block",
                PRIMARY,
                "focus-visible:ring-ring focus-visible:ring-[3px] focus-visible:outline-none",
              )}
            >
              번역 시작하기
            </Link>
          </div>
        )}
      </section>
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
  return "진행하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}
