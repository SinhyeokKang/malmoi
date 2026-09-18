"use client";

import { FolderGit2, GitBranch, Search } from "lucide-react";

import { GithubIcon } from "@/components/signin/brand-icons";
import { ConnectGithubButton } from "@/components/onboarding/connect-github";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { m } from "@/lib/i18n";
import type { BranchChoice } from "@/lib/onboarding/branch";
import { onboardErrorMessage } from "@/lib/onboarding/message";
import type { RepoOption } from "@/lib/onboarding/types";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

import { failureText } from "../failure";

/**
 * ① 리포와 브랜치 (DESIGN §6.7).
 *
 * ⚠️ **막힘 상태 셋(예외 A·B·C)이 여기 있다.** 전에는 `/projects/new`가 라우트라 그 갈래마다 따로
 * 반환했는데, 모달이 되면서 같은 자리에 선다 — 그것이 `new/layout.tsx`를 지울 수 있게 한 이관이다.
 *
 * ⚠️ **예외 B′(검색 0건)를 예외 B(설치에 리포 없음)와 가른다.** 요구하는 일이 다르다: 검색어를
 * 지워라 / 설치에 리포를 넣어라 (DESIGN §6.7).
 */
export type RepoStepState = {
  repos: RepoOption[] | undefined;
  query: string;
  listError: string | undefined;
  installUrl: string | null;
  /** 연결 왕복 뒤 되돌아올 목록 상태 — 없으면 돌아온 사용자가 다른 목록을 뒤에 두게 된다. */
  backQuery: { filter?: string; q?: string };
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
  onQueryChange,
  onBranchChange,
}: {
  state: RepoStepState;
  onSelect: (repo: RepoOption) => void;
  onQueryChange: (query: string) => void;
  onBranchChange: (value: string) => void;
}) {
  const { repos, query, listError, installUrl, now, selected } = state;

  if (listError !== undefined) return <Blocked error={listError} installUrl={installUrl} back={state.backQuery} />;

  // ① 로딩 — 스켈레톤 **셋**. 개수는 실제보다 적게 둔다: 몇 개가 올지를 예고하는 것이 아니다.
  if (repos === undefined) {
    return (
      <div className="flex flex-col gap-3">
        {/*
          ⚠️ **행의 형이 실물과 같아야 한다** — 디바이더 색·행 padding·칩 자리가 어긋나면 목록이
          도착하는 순간 레이아웃이 움직인다(핸드오프: "다 차고 나서 레이아웃이 움직이지 않아야 한다").
        */}
        <ul className="divide-divider border-border divide-y overflow-hidden rounded-md border" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="size-10 rounded-md" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3.5 w-72" />
              </div>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs leading-[1.6]">{m.newProject.repo.loading}</p>
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const shown = needle === "" ? repos : repos.filter((r) => r.fullName.toLowerCase().includes(needle));

  return (
    /*
      ⚠️ **루트가 `flex-1`이다** (2026-09-13 사용자 실물). 검색 0건이 남은 높이의 **중앙**에 서려면
      그 높이가 여기서 내려와야 한다 — 없으면 빈 상태가 검색 필드 바로 아래 붙고 그 밑이 통째로 빈다.
      ⚠️ **`min-h-0`은 주지 않는다**: 자식이 전부 `shrink-0`이라 `min-height:auto`가 내용 높이를
      지켜야 목록이 길 때 본문(`overflow-y-auto`)이 그것을 스크롤한다.
    */
    <div className="flex flex-1 flex-col gap-4">
      {state.banner !== null && <Alert variant="danger">{failureText(state.banner)}</Alert>}

      {/*
        ⚠️ **`SearchInput`을 쓰지 않는다** — 그 프리미티브는 Enter 제출형이고 폭을 `w-64`로 못 박았다
        ("폭을 인자로 열면 툴바마다 검색창이 달라진다"). 여기는 입력 중 즉시 거르는 폭 100% 필드라
        계약이 다르다. **글리프 자리잡기 관용구만 그 파일에서 그대로 가져온다.**
      */}
      <div className="relative shrink-0">
        <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" aria-hidden />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={m.newProject.repo.search}
          aria-label={m.newProject.repo.search}
          className="w-full pr-2.5 pl-8"
        />
      </div>

      {shown.length === 0 ? (
        /*
          ⚠️ **설치 힌트가 이 안으로 들어온다** (2026-09-13 ego 실측). 밖에 형제로 두면 빈 상태의
          `flex-1`이 남은 높이를 먹어 **힌트만 모달 바닥으로 200px 넘게 밀려** 고아로 뜬다 —
          "리포가 안 보이면 설치에 추가하라"는 지금 화면의 두 번째 출구라 블록에 붙어야 한다.
        */
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <EmptyState
            icon={Search}
            title={m.newProject.repo.searchEmpty(query.trim())}
            action={
              <Button variant="default" onClick={() => onQueryChange("")}>
                {m.newProject.repo.clearSearch}
              </Button>
            }
          />
          <InstallHint installUrl={installUrl} />
        </div>
      ) : (
        /*
          ⚠️ **`asChild`를 쓰지 않는다** (2026-09-13 리뷰). `<ul>`에 얹으면 Radix가 그 태그의 role을
          `radiogroup`으로 **덮어써서** `<li>`들이 부모 list를 잃은 고아 listitem이 된다("list, N items"
          안내가 사라지고 axe가 `aria-required-children`으로 잡는다). Root가 div 한 겹을 세우면
          라디오는 여전히 그 후손이라 소유되고, **리스트와 radiogroup이 둘 다 산다.**
        */
        <RadioGroup
          className="shrink-0"
          aria-label={m.newProject.repo.list}
          value={selected ?? ""}
          onValueChange={(fullName) => {
            const picked = shown.find((r) => r.fullName === fullName);
            if (picked !== undefined) onSelect(picked);
          }}
        >
        <ul className="border-border overflow-hidden rounded-md border">
          {shown.map((repo, index) => {
            const active = selected === repo.fullName;
            /*
              ⚠️ **`divide-y`가 아니다** — 구분선 색이 두 벌이기 때문이다: **선택 행(muted 면)에 접한
              경계는 `border`(#e5e5e5)**이고 비선택끼리는 한 단계 연한 `divider`(#f0f0f0)다. 한 값으로
              두면 muted 면의 위아래 가장자리가 면 안에서 풀린다 (핸드오프 1a).
            */
            const prevActive = index > 0 && selected === shown[index - 1]?.fullName;
            return (
              /*
                ⚠️ **padding이 `<li>`가 아니라 안쪽 둘에 붙는다** — 브랜치 줄의 `border-top`이 행 끝까지
                가야 하는데, `<li>`가 padding을 들면 그 선이 좌우로 12씩 들여써진다.
              */
              <li
                key={repo.fullName}
                className={cn(
                  index > 0 && "border-t",
                  index > 0 && (active || prevActive ? "border-border" : "border-divider"),
                  active ? "bg-muted" : "hover:bg-foreground/3",
                )}
              >
                <div className="p-3">
                  <Radio
                    value={repo.fullName}
                    labelClassName="gap-3"
                    label={
                      <>
                        {/*
                          ⚠️ **글리프에 톤 색을 주지 않는다** — 아직 프로젝트가 아니라 후보다
                          (`/projects` 목록의 `toneFill`과 반대). 선택되면 **칩만** 흰색으로 뒤집혀
                          muted 면 위에서 떠오른다.
                        */}
                        <span
                          className={cn(
                            "flex size-10 shrink-0 items-center justify-center rounded-md",
                            active ? "bg-background" : "bg-muted",
                          )}
                        >
                          <FolderGit2 className="text-muted-foreground size-5" aria-hidden />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="block truncate text-base font-medium">{repo.repo}</span>
                          {/*
                            ⚠️ **선택 행에서 색이 바뀐다** — muted 면 위에서 `muted-foreground`는
                            4.34:1로 AA 미달이다 (핸드오프 · DESIGN §2.2).
                          */}
                          <span className={cn("block truncate text-sm", active ? "text-foreground/60" : "text-muted-foreground")}>
                            {repo.owner}
                            {repo.pushedAt !== null && ` · ${m.newProject.repo.pushedAt(relativeTime(new Date(repo.pushedAt), new Date(now)))}`}
                          </span>
                        </span>
                      </>
                    }
                  />
                </div>
                {active && <BranchRow state={state} onChange={onBranchChange} />}
              </li>
            );
          })}
        </ul>
        </RadioGroup>
      )}

      {shown.length > 0 && <InstallHint installUrl={installUrl} />}
    </div>
  );
}

/** 목록에 없는 리포로 가는 길 — 목록 아래, 검색 0건에서는 빈 상태 블록 아래. `GITHUB_APP_SLUG`가 없으면 사라진다. */
function InstallHint({ installUrl }: { installUrl: string | null }) {
  if (installUrl === null) return null;
  return (
    <p className="text-muted-foreground shrink-0 text-xs leading-[1.6]">
      {m.newProject.repo.notListed}{" "}
      <a href={installUrl} target="_blank" rel="noreferrer" className="text-blue-600">
        {m.newProject.empty.addRepos}
      </a>
    </p>
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
      <BranchShell>
        <Alert variant="danger">{failureText(state.accessError)}</Alert>
      </BranchShell>
    );
  }
  if (state.branchLoading || state.branch === undefined) {
    return (
      <BranchShell>
        <BranchLabel />
        <Skeleton className="h-9 w-[220px] shrink-0 rounded-md" />
      </BranchShell>
    );
  }

  const { branch } = state;
  const help =
    branch.mode === "fixed"
      ? m.newProject.repo.branchDefault
      : branch.mode === "input"
        ? m.newProject.repo.branchTooMany
        : m.newProject.repo.branchHelp;

  return (
    /* 라벨·컨트롤·설명이 **한 줄**이다 — 세로로 쌓으면 행 하나가 세 줄이 되어 목록의 리듬이 깨진다. */
    <BranchShell>
      <BranchLabel htmlFor={branch.mode === "fixed" ? undefined : "repo-branch"} />
      <>
        {branch.mode === "select" ? (
          <Select value={state.branchValue} onValueChange={onChange}>
            {/* ⚠️ **자기 id를 `aria-labelledby`에 함께 넣는다** — 트리거는 `<button>`이라 접근 값이
                없어서, 라벨만 이으면 스크린리더가 "Branch"까지만 말하고 고른 브랜치를 말하지 않는다. */}
            <SelectTrigger id="repo-branch" aria-labelledby="repo-branch-label repo-branch" className="w-[220px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {branch.names.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : branch.mode === "input" ? (
          <Input
            id="repo-branch"
            value={state.branchValue}
            onChange={(e) => onChange(e.target.value)}
            className="w-[220px]"
          />
        ) : (
          /* ⚠️ **mono가 아니다** — 브랜치는 읽는 값이다 (핸드오프 1a의 `Select` 값이 sans다). */
          <p className="text-sm">{state.branchValue}</p>
        )}
        {/*
          ⚠️ **`text-foreground/60`이다** — 이 줄은 muted 면 위에 서므로 `muted-foreground`면 4.34:1로
          AA 미달이다 (핸드오프 · DESIGN §2.2). 같은 이유로 `FormGroup`을 쓰지 않는다 — 그 프리미티브의
          help는 흰 면 전용 색이고, 고치면 다른 화면의 모든 폼이 함께 움직인다.
        */}
        <p className="text-foreground/60 min-w-0 flex-1 text-xs leading-[1.6]">{help}</p>
      </>
    </BranchShell>
  );
}

/**
 * 브랜치 줄의 껍데기 — 행의 muted 면 위에 `border-top`으로 얹힌다.
 *
 * ⚠️ **`pl-20`(80)이 우연이 아니다** — 라디오 16 + gap 12 + 칩 40 + gap 12 = 80이라 **리포 이름과
 * 정확히 같은 세로선**에서 시작한다. 칩 치수를 바꾸면 이 값도 같이 움직여야 한다.
 */
function BranchShell({ children }: { children: React.ReactNode }) {
  return <div className="border-border flex items-center gap-3 border-t p-3 pl-20">{children}</div>;
}

/**
 * ⚠️ **`htmlFor`가 갈래를 탄다** — 조회 실패(`fixed`)와 로딩에는 가리킬 컨트롤이 아예 없다. 항상
 * 달면 존재하지 않는 id를 가리키는 라벨이 남는다.
 */
function BranchLabel({ htmlFor }: { htmlFor?: string }) {
  return (
    <label id="repo-branch-label" htmlFor={htmlFor} className="flex shrink-0 items-center gap-1.5 text-sm font-medium">
      <GitBranch className="size-3.5" aria-hidden />
      {m.newProject.repo.branch}
    </label>
  );
}

/**
 * 예외 A·B·C — 연결 전 / 설치 없음 / 리포 없음. **셋이 사용자에게 요구하는 일이 다르다**: 계정
 * 연결 · App 설치 · 설치 설정에서 리포 추가. 하나로 접으면 무엇을 해야 하는지 알 수 없다.
 */
function Blocked({
  error,
  installUrl,
  back,
}: {
  error: string;
  installUrl: string | null;
  back: { filter?: string; q?: string };
}) {
  if (error === "not-connected" || error === "reauthorize") {
    return (
      <Centered>
        <EmptyState
          icon={GithubIcon}
          title={m.newProject.empty.connect.title}
          description={m.newProject.empty.connect.description}
          action={
            <ConnectGithubButton
              dest="new"
              back={back}
              label={error === "not-connected" ? m.newProject.empty.connect.action : m.newProject.empty.connect.reauthorize}
            />
          }
        />
      </Centered>
    );
  }

  if (error === "no-installations" || error === "no-repos") {
    return (
      <Centered>
        <EmptyState
          icon={GithubIcon}
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
                  <a href={installUrl} target="_blank" rel="noreferrer" className="text-blue-600">
                    {error === "no-installations" ? m.newProject.empty.install : m.newProject.empty.addRepos}
                  </a>{" "}
                  — {m.newProject.empty.afterInstall}
                </>
              )}
            </>
          }
        />
      </Centered>
    );
  }

  /*
    ⚠️ **오류는 중앙에 두지 않는다** — `Alert`는 폭 100% 배너라 세로 중앙에 띄우면 "무엇이
    비었다"를 말하는 빈 상태와 같은 자리에 서서 둘이 같은 부류로 읽힌다. 배너는 위에 붙는다.
  */
  return (
    <Alert variant="danger" title={m.newProject.empty.listFailed}>
      {failureText(error)}
    </Alert>
  );
}

/**
 * 빈 상태가 본문의 **남은 높이 중앙**에 서는 자리 (핸드오프 1 · DESIGN §6.4).
 *
 * ⚠️ **`EmptyState`가 수직 중앙을 하지 않는다** — 표 안에서도 쓰여서 자리마다 다르고, `flex-1`은
 * 호출부가 든다는 것이 그 컴포넌트의 계약이다. 껍데기가 `min-h`로 세로를 잡아 두므로 여기서
 * 안 잡으면 칩·제목·설명이 헤더 바로 아래 뭉치고 그 아래 수백 px이 빈다 (2026-09-13 사용자 실물).
 */
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center">{children}</div>;
}
