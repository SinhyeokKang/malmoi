"use client";

import { ExternalLink, FolderGit2, Link2, Search } from "lucide-react";
import { useState } from "react";

import { ConnectGithubButton } from "@/components/onboarding/connect-github";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormGroup } from "@/components/ui/form-group";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/lib/i18n";
import type { BranchChoice } from "@/lib/onboarding/branch";
import { onboardErrorMessage } from "@/lib/onboarding/message";
import type { RepoOption } from "@/lib/onboarding/types";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

import { failureText } from "../failure";

/**
 * ① 리포와 브랜치 (new-project-modal design §4).
 *
 * ⚠️ **막힘 상태 셋(예외 A·B·C)이 여기 있다.** 전에는 `/projects/new`가 라우트라 그 갈래마다 따로
 * 반환했는데, 모달이 되면서 같은 자리에 선다 — 그것이 `new/layout.tsx`를 지울 수 있게 한 이관이다.
 *
 * ⚠️ **예외 B′(검색 0건)를 예외 B(설치에 리포 없음)와 가른다.** 요구하는 일이 다르다: 검색어를
 * 지워라 / 설치에 리포를 넣어라 (DESIGN §6.7).
 */
export type RepoStepState = {
  repos: RepoOption[] | undefined;
  listError: string | undefined;
  installUrl: string | null;
  /** 서버가 만든 "지금" — 클라이언트에서 만들면 hydration이 어긋난다 (`lib/relative-time.ts`). */
  now: string;
  selected: string | undefined;
  branch: BranchChoice | undefined;
  branchLoading: boolean;
  branchValue: string;
  accessError: string | undefined;
  banner: string | null;
};

export function RepoStep({
  state,
  onSelect,
  onBranchChange,
}: {
  state: RepoStepState;
  onSelect: (repo: RepoOption) => void;
  onBranchChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const { repos, listError, installUrl, now, selected } = state;

  if (listError !== undefined) return <Blocked error={listError} installUrl={installUrl} />;

  // ① 로딩 — 스켈레톤 **셋**. 개수는 실제보다 적게 둔다: 몇 개가 올지를 예고하는 것이 아니다.
  if (repos === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <ul className="divide-border border-border divide-y overflow-hidden rounded-lg border" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-2.5 px-3 py-3.5">
              <Skeleton className="size-7 rounded-sm" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-72" />
              </div>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">{m.newProject.repo.loading}</p>
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const shown = needle === "" ? repos : repos.filter((r) => r.fullName.toLowerCase().includes(needle));

  return (
    <div className="flex flex-col gap-4">
      {state.banner !== null && <Alert variant="danger">{failureText(state.banner)}</Alert>}

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={m.newProject.repo.search}
        aria-label={m.newProject.repo.search}
        className="w-full"
      />

      {shown.length === 0 ? (
        <EmptyState
          icon={Search}
          className="py-6"
          title={m.newProject.repo.searchEmpty(query.trim())}
          action={
            <Button variant="default" onClick={() => setQuery("")}>
              {m.newProject.repo.clearSearch}
            </Button>
          }
        />
      ) : (
        <ul className="divide-border-subtle border-border divide-y overflow-hidden rounded-lg border">
          {shown.map((repo) => {
            const active = selected === repo.fullName;
            return (
              <li key={repo.fullName} className={cn("px-3 py-2.5", active && "bg-muted")}>
                <Radio
                  name="repo"
                  checked={active}
                  onChange={() => onSelect(repo)}
                  label={
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{repo.repo}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {repo.owner}
                        {repo.pushedAt !== null && ` · ${m.newProject.repo.pushedAt(relativeTime(new Date(repo.pushedAt), new Date(now)))}`}
                      </span>
                    </span>
                  }
                />
                {active && <BranchRow state={state} onChange={onBranchChange} />}
              </li>
            );
          })}
        </ul>
      )}

      {installUrl !== null && (
        <p className="text-muted-foreground text-xs">
          {m.newProject.repo.notListed}{" "}
          <a href={installUrl} target="_blank" rel="noreferrer" className="inline-flex items-baseline gap-1 text-blue-600">
            {m.newProject.empty.addRepos}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </p>
      )}
    </div>
  );
}

/**
 * 고른 행 아래로 펼쳐지는 브랜치 줄.
 *
 * ⚠️ **조회 실패를 "브랜치가 없다"로 읽지 않는다** (POSTMORTEM 2026-09-03) — `fixed` 갈래는 읽기
 * 전용 default branch이고 캡션이 그 사실을 말한다. **[Next]는 그대로 활성이다.**
 */
function BranchRow({ state, onChange }: { state: RepoStepState; onChange: (value: string) => void }) {
  if (state.accessError !== undefined) {
    return (
      <div className="pt-2 pl-6">
        <Alert variant="danger">{failureText(state.accessError)}</Alert>
      </div>
    );
  }
  if (state.branchLoading || state.branch === undefined) {
    return (
      <div className="pt-2 pl-6">
        <Skeleton className="h-9 w-64" />
      </div>
    );
  }

  const { branch } = state;
  return (
    <div className="pt-2 pl-6">
      <FormGroup
        label={m.newProject.repo.branch}
        htmlFor="repo-branch"
        help={
          branch.mode === "fixed"
            ? m.newProject.repo.branchDefault
            : branch.mode === "input"
              ? m.newProject.repo.branchTooMany
              : m.newProject.repo.branchHelp
        }
      >
        {branch.mode === "select" ? (
          <Select id="repo-branch" value={state.branchValue} onChange={(e) => onChange(e.target.value)} className="w-full max-w-sm">
            {branch.names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        ) : branch.mode === "input" ? (
          <Input
            id="repo-branch"
            value={state.branchValue}
            onChange={(e) => onChange(e.target.value)}
            className="text-mono w-full max-w-sm"
          />
        ) : (
          <p className="text-mono text-sm">{state.branchValue}</p>
        )}
      </FormGroup>
    </div>
  );
}

/**
 * 예외 A·B·C — 연결 전 / 설치 없음 / 리포 없음. **셋이 사용자에게 요구하는 일이 다르다**: 계정
 * 연결 · App 설치 · 설치 설정에서 리포 추가. 하나로 접으면 무엇을 해야 하는지 알 수 없다.
 */
function Blocked({ error, installUrl }: { error: string; installUrl: string | null }) {
  if (error === "not-connected" || error === "reauthorize") {
    return (
      <EmptyState
        icon={Link2}
        className="py-6"
        title={m.newProject.empty.connect.title}
        description={m.newProject.empty.connect.description}
        action={
          <ConnectGithubButton
            dest="new"
            label={error === "not-connected" ? m.newProject.empty.connect.action : m.newProject.empty.connect.reauthorize}
          />
        }
      />
    );
  }

  if (error === "no-installations" || error === "no-repos") {
    return (
      <EmptyState
        icon={FolderGit2}
        className="py-6"
        /**
         * ⚠️ **제목에 판정층 문구를 넣지 않는다** (code-review 2026-09-08). `onboardErrorMessage`는
         * "무엇이 없다 + 무엇을 하라"의 두 문장이고, 빈 상태의 제목은 마침표 없는 짧은 구다.
         */
        title={error === "no-installations" ? m.newProject.empty.noInstallations : m.newProject.empty.noRepos}
        description={
          <>
            {onboardErrorMessage(error)}{" "}
            {installUrl === null ? (
              m.newProject.empty.noLink
            ) : (
              <>
                <a href={installUrl} target="_blank" rel="noreferrer" className="inline-flex items-baseline gap-1 text-blue-600">
                  {error === "no-installations" ? m.newProject.empty.install : m.newProject.empty.addRepos}
                  <ExternalLink className="size-3" aria-hidden />
                </a>{" "}
                — {m.newProject.empty.afterInstall}
              </>
            )}
          </>
        }
      />
    );
  }

  return (
    <Alert variant="danger" title={m.newProject.empty.listFailed}>
      {failureText(error)}
    </Alert>
  );
}
