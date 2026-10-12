"use client";
import { ButtonLink } from "@/components/ui/button";
import { Link as InlineLink } from "@/components/ui/link";
import { Archive, Clock, FolderGit2, GitBranch, KeyRound, Link2, Search } from "lucide-react";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { GithubIcon, GitlabIcon } from "@/components/signin/brand-icons";
import { GitLabTokenForm } from "@/components/gitlab/token-form";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useGithubConnect } from "@/components/onboarding/connect-github";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState, NoMatch } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SelectRow } from "@/components/ui/select-row";
import { useDateStyle, useMessages, useUiLocale } from "@/components/i18n/messages-provider";
import { formatDay } from "@/lib/date-format";
import { forHost } from "@/lib/i18n/host";
import type { BranchChoice } from "@/lib/onboarding/branch";
import type { RepoOption } from "@/lib/onboarding/types";
import { PROJECT_LIMIT } from "@/lib/onboarding/create-plan";
import { relativeTime } from "@/lib/relative-time";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { failureText } from "../failure";
import { IconTile } from "@/components/ui/icon-tile";

/**
 * ① 리포와 브랜치 (DESIGN §6.7).
 *
 * ⚠️ **막힘 상태 셋(예외 A·B·C)이 여기 있다.** 전에는 `/projects/new`가 라우트라 그 갈래마다 따로
 * 반환했는데, 모달이 되면서 같은 자리에 선다 — 그것이 `new/layout.tsx`를 지울 수 있게 한 이관이다.
 *
 * ⚠️ **예외 B′(검색 0건)를 예외 B(설치에 리포 없음)와 가른다.** 요구하는 일이 다르다: 검색어를
 * 지워라 / 설치에 리포를 넣어라 (DESIGN §6.7).
 */
/** GitLab 탭 위 연결 계정 줄(G2e)의 값 — 서버 DB 값이다(만료일은 ISO). */
export type GitLabAccountLine = { username: string; expiresAt: string | null };

type Connected = Parameters<Parameters<typeof GitLabTokenForm>[0]["onConnected"]>[0];

export type RepoStepState = {
  /** 어느 탭의 ①인가 — GitLab은 막힘 갈래·로딩 문장·시각 낱말이 다르고 설치 링크가 없다. 없으면 GitHub이다. */
  host?: "github" | "gitlab";
  /** GitLab 탭의 연결 계정 — GitHub 탭은 없다. */
  gitlabAccount?: GitLabAccountLine | null;
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
  /** 설치 요청이 조직 관리자의 승인을 기다린다 (`Account.installRequestedAt` — `listConnectableRepos`). */
  pending: boolean;
};

export function RepoStep({
  state,
  onSelect,
  onScan,
  onQueryChange,
  onBranchChange,
  onAnnounce,
  onGitLabConnected,
  onGitLabRetry,
}: {
  state: RepoStepState;
  /** GitLab PAT 연결·교체가 끝났다 — 컨테이너가 계정 줄을 바꾸고 목록을 다시 읽는다. */
  onGitLabConnected?: (connection: Connected) => void;
  /** GitLab 목록을 다시 읽는다 — 일시 장애·리포 없음의 [Try again]. */
  onGitLabRetry?: () => void;
  onSelect: (repo: RepoOption) => void;
  /** 미확정 행을 훑는 동안 Next가 이전 리포로 진행하지 않게 한다. */
  onScan: (fullName: string) => void;
  onQueryChange: (query: string) => void;
  onBranchChange: (value: string) => void;
  /** 모달의 live 영역 하나로 흘려보낸다 — 영역을 둘로 나누면 같은 전이가 두 번 읽힌다. */
  onAnnounce: (message: string) => void;
}) {
  const uiLocale = useUiLocale();
  const m = useMessages();
  const { repos, query, listError, installUrl, now, selected } = state;
  // 화살표 훑기는 Radix 선택만 움직인다. 브랜치 조회는 명시적 확정에서만 시작한다.
  const [choice, setChoice] = useState(selected ?? "");
  const [seenSelection, setSeenSelection] = useState(selected);
  if (seenSelection !== selected) { setSeenSelection(selected); setChoice(selected ?? ""); }
  const scanning = useRef(false);
  const confirm = (repo: RepoOption) => { setChoice(repo.fullName); onSelect(repo); };
  const router = useRouter();
  const search = useRef<HTMLDivElement>(null);
  /**
   * [Check again] (install-and-connect). ⚠️ **`router.refresh()`는 Suspense fallback을 다시 띄우지 않는다** —
   * `loading`이 없으면 반응이 안 보인다. 상태가 이 컴포넌트에 있는 이유: 승인되면 D 블록이 언마운트되고,
   * 그때 포커스를 검색 필드로 옮겨야 `body`에 떨어지지 않는다.
   */
  const [checking, startCheck] = useTransition();
  /**
   * ⚠️ **클릭이 세우는 상태다 — `checking`의 true→false 가장자리를 관찰하지 않는다.** 콜백이 동기로 끝나면
   * React가 두 값을 한 커밋에 접어 가장자리가 안 보일 수 있다(테스트에서 순서에 따라 갈렸다).
   */
  const [awaiting, setAwaiting] = useState(false);
  const checked = useRef(false);
  const blockedPending = listError !== undefined && state.pending;
  useEffect(() => {
    if (!awaiting || checking) return;
    setAwaiting(false);
    // 새로고침이 끝났는데 여전히 대기면 그 사실을 말한다 — 같은 화면이 다시 서서 눈으로는 반응이 없다.
    if (blockedPending) onAnnounce(m.newProject.empty.waiting.still);
    // 목록이 아닌 다른 막힘(승인됐는데 리포 0 → C)에 착지했으면 포커스 이동 대기를 거둔다 — 남기면 한참 뒤
    // 목록이 설 때 느닷없이 포커스를 뺏는다.
    if (listError !== undefined && !blockedPending) checked.current = false;
  }, [awaiting, checking, blockedPending, listError, onAnnounce]);
  const listed = listError === undefined && repos !== undefined;
  useEffect(() => {
    if (!checked.current || !listed) return;
    checked.current = false;
    search.current?.querySelector("input")?.focus();
  }, [listed]);

  if (listError !== undefined && state.host === "gitlab") {
    return <GitLabBlocked error={listError} account={state.gitlabAccount ?? null} onConnected={onGitLabConnected} onRetry={onGitLabRetry} />;
  }

  if (listError !== undefined) {
    return (
      <Blocked
        error={listError}
        installUrl={installUrl}
        back={state.backQuery}
        pending={state.pending}
        checking={checking}
        onCheckAgain={() => {
          checked.current = true;
          setAwaiting(true);
          /**
           * ⚠️ **live 영역을 먼저 비운다** — 모달은 `announce` 값이 **바뀔 때만** 낭독한다. 두 번째 클릭은 같은
           * 문장을 다시 넣으므로 비우지 않으면 스크린리더에는 로딩만 돌고 아무 일도 없는 것으로 들린다.
           */
          onAnnounce("");
          startCheck(() => router.refresh());
        }}
      />
    );
  }

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
              <Skeleton className="size-10 rounded-sm" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3.5 w-72" />
              </div>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs leading-body">{forHost(m.newProject.repo, state.host ?? "github").loading}</p>
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
      {state.banner !== null && <Alert variant="danger">{failureText(m, state.banner)}</Alert>}
      {/* 다른 설치로 리포가 이미 보여도 요청이 사라진 것은 아니다 — 무음으로 두면 방금 한 요청이 안 먹은 것으로 읽힌다. */}
      {state.pending && <Alert variant="info">{m.newProject.empty.waiting.info}</Alert>}

      {/* 즉시 검색은 제출형 SearchInput 대신 Input의 글리프·지우기 슬롯을 쓴다. */}
      <div ref={search} className="shrink-0">
        <Input width="full" icon={<Search />} clearable
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={forHost(m.newProject.repo, state.host ?? "github").search.placeholder}
          aria-label={forHost(m.newProject.repo, state.host ?? "github").search.label}
        />
      </div>

      {/* ⚠️ **목록 위다** — 목록 아래 두면 리포가 많을 때 스크롤해야 보인다. 검색 0건이면 빈 상태 블록 안의 것이 대신 선다. */}
      {/* 캡션 슬롯(검색 아래 · 목록 위) — GitHub은 설치 힌트, GitLab은 연결 계정 줄이다(시안 G2e · #248). */}
      {state.gitlabAccount != null && <GitLabAccount account={state.gitlabAccount} onConnected={onGitLabConnected} />}
      {shown.length > 0 && <InstallHint installUrl={installUrl} />}

      {shown.length === 0 ? (
        /*
          ⚠️ **설치 힌트가 이 안으로 들어온다** (2026-09-13 ego 실측). 밖에 형제로 두면 빈 상태의
          `flex-1`이 남은 높이를 먹어 **힌트만 모달 바닥으로 200px 넘게 밀려** 고아로 뜬다 —
          "리포가 안 보이면 설치에 추가하라"는 지금 화면의 두 번째 출구라 블록에 붙어야 한다.
        */
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <NoMatch
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
          value={choice}
          onValueChange={fullName => { setChoice(fullName); if (scanning.current) onScan(fullName); }}
          onKeyDownCapture={event => { scanning.current = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key); }}
          onKeyUpCapture={() => { scanning.current = false; }}
          onPointerDownCapture={() => { scanning.current = false; }}
        >
        {/* 컨테이너 선언 — 펼친 Branch 행이 목록 폭을 묻는다(malmoi#224, 선언·질의 분리 POSTMORTEM 2026-09-15). */}
        <ul className="@container border-border overflow-hidden rounded-md border">
          {shown.map((repo, index) => {
            const active = choice === repo.fullName;
            /*
              ⚠️ **`divide-y`가 아니다** — 구분선 색이 두 벌이기 때문이다: **선택 행(muted 면)에 접한
              경계는 `border`(#e5e5e5)**이고 비선택끼리는 한 단계 연한 `divider`(#f0f0f0)다. 한 값으로
              두면 muted 면의 위아래 가장자리가 면 안에서 풀린다 (핸드오프 1a).
            */
            const prevActive = index > 0 && choice === shown[index - 1]?.fullName;
            return (
              /*
                ⚠️ **padding이 `<li>`가 아니라 안쪽 둘에 붙는다** — 브랜치 줄의 `border-top`이 행 끝까지
                가야 하는데, `<li>`가 padding을 들면 그 선이 좌우로 12씩 들여써진다.
              */
              <li key={repo.fullName}>
                  <SelectRow input="radio" checked={active} first={index === 0} previousChecked={prevActive}
                    value={repo.fullName}
                    onClick={() => { if (!scanning.current) confirm(repo); }}
                    onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); confirm(repo); } }}
                    expand={active && selected === repo.fullName ? <BranchRow state={state} onChange={onBranchChange} /> : undefined}
                    label={
                      <>
                        {/*
                          ⚠️ **글리프에 톤 색을 주지 않는다** — 아직 프로젝트가 아니라 후보다
                          (`/projects` 목록의 `hueFill`과 반대). 선택되면 **칩만** 흰색으로 뒤집혀
                          muted 면 위에서 떠오른다.
                        */}
                        <IconTile size="lg" className={active ? "bg-background" : "bg-muted"}>
                          <FolderGit2 aria-hidden />
                        </IconTile>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="block truncate text-base font-medium">{repo.repo}</span>
                          {/*
                            ⚠️ **선택 행에서 색이 바뀐다** — muted 면 위에서 `muted-foreground`는
                            4.34:1로 AA 미달이다 (핸드오프 · DESIGN §2.2).
                          */}
                          <span className={cn("block truncate text-sm", active ? "text-foreground/60" : "text-muted-foreground")}>
                            {repo.owner}
                            {repo.pushedAt !== null && ` · ${forHost(m.newProject.repo, state.host ?? "github").pushedAt(relativeTime(new Date(repo.pushedAt), new Date(now), uiLocale))}`}
                          </span>
                        </span>
                      </>
                    }
                  />
              </li>
            );
          })}
        </ul>
        </RadioGroup>
      )}
    </div>
  );
}

/**
 * GitLab 탭의 연결 계정 줄 (시안 G2e · #248) — **검색 아래 캡션 슬롯**(GitHub `Don't see a repository?` 자리와 같은 형 — muted 12, 문장 + 인라인 링크):
 * 누구의 토큰으로 목록을 읽었고 언제 만료되는지, 그리고 [Replace token]. 교체는 `/account`와 같은 PAT 입력이다(같은 GitLab 계정만 — D19).
 * ⚠️ 만료일은 `formatDay`(오프셋 라벨 없음 — design-brief 확정 5)이고 UTC 날짜다(결정 R1).
 */
function GitLabAccount({ account, onConnected }: { account: GitLabAccountLine; onConnected?: (connection: Connected) => void }) {
  const m = useMessages();
  // ⚠️ 이 함수의 날짜는 PAT 만료일뿐이고, GitLab이 날짜로만 주는 값이다(그날 00:00 UTC로 저장) — 시각이 아니라 날짜라서 UTC로 고정한다.
  // 보는 사람 시간대로 옮기면 서쪽에선 GitLab 토큰 화면보다 하루 이르다(audit U5 · 결정 R1).
  const style = { ...useDateStyle(), timeZone: "UTC" } as const;
  const [open, setOpen] = useState(false);
  return (
    <p className="text-muted-foreground shrink-0 text-xs leading-body">
      {m.newProject.gitlab.account(account.username, account.expiresAt === null ? null : formatDay(new Date(account.expiresAt), style))}{" "}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="link" size="sm" className="h-auto px-0 align-baseline text-xs">{m.account.gitlab.replace}</Button>
        </DialogTrigger>
        <DialogContent title={m.account.gitlab.replaceTitle} description={m.account.gitlab.replaceHint(account.username)}>
          <GitLabTokenForm autoFocus submitLabel={m.account.gitlab.replace} onConnected={(connection) => { setOpen(false); onConnected?.(connection); }} />
        </DialogContent>
      </Dialog>
    </p>
  );
}

/**
 * ① GitLab 탭의 막힘 갈래 (design-brief "GitLab 탭 상태"). GitHub `Blocked`와 같은 틀(빈 상태 블록 + 액션)이고 갈래가 다르다:
 * 연결 전(PAT 입력) · 토큰 못 씀(다시 붙여 넣기) · Maintainer 프로젝트 없음 · 상한(공유) · 그 밖(목록 실패 Alert).
 * GitHub의 승인 대기(`waiting`)는 GitLab에 대응이 없다.
 */
function GitLabBlocked({ error, account, onConnected, onRetry }: { error: string; account: GitLabAccountLine | null; onConnected?: (connection: Connected) => void; onRetry?: () => void }) {
  const m = useMessages();
  // ⚠️ 이 함수의 날짜는 PAT 만료일뿐이고, GitLab이 날짜로만 주는 값이다(그날 00:00 UTC로 저장) — 시각이 아니라 날짜라서 UTC로 고정한다.
  // 보는 사람 시간대로 옮기면 서쪽에선 GitLab 토큰 화면보다 하루 이르다(audit U5 · 결정 R1).
  const style = { ...useDateStyle(), timeZone: "UTC" } as const;
  if (error === "limit-reached") {
    return (
      <BlockShell icon={Archive} title={m.newProject.empty.limit.title} description={m.newProject.empty.limit.description(PROJECT_LIMIT)}
        action={<ButtonLink variant="primary" href={routes.projects()}>{m.newProject.empty.limit.action}</ButtonLink>} secondary={null} error={null} />
    );
  }
  if (error === "gitlab-not-connected" || error === "gitlab-reconnect") {
    /*
      칩은 key-round다(시안 G2a·G2f · #247) — 연결하는 것은 플랫폼이 아니라 계정 토큰이다(탭이 이미 GitLab을 말한다). 저장 만료일이 지났으면 그 날짜를
      말하고, 만료일 전인데 못 쓰면(철회·스코프 상실) 같은 블록에 설명만 다르다(#249).
    */
    const expiredAt = error === "gitlab-reconnect" && account?.expiresAt != null && new Date(account.expiresAt).getTime() <= Date.now() ? new Date(account.expiresAt) : null;
    const copy = error === "gitlab-not-connected" ? m.newProject.gitlab.connect : m.newProject.gitlab.reconnect;
    const description = expiredAt !== null ? m.newProject.gitlab.reconnect.expiredOn(formatDay(expiredAt, style)) : copy.description;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <EmptyState icon={KeyRound} title={copy.title} description={description} />
        {/* 입력은 빈 상태 블록 밖, 아래다 — 블록의 액션 칸은 가로 flex라 폼이 버튼 옆에 눌린다(`BlockShell` 보조 줄과 같은 이유). */}
        <div className="w-full max-w-[480px]">
          <GitLabTokenForm submitLabel={m.account.gitlab.form.connect} onConnected={(connection) => onConnected?.(connection)} />
        </div>
      </div>
    );
  }
  if (error === "gitlab-no-repos") {
    return (
      <BlockShell icon={FolderGit2} title={m.newProject.gitlab.repos.title} description={m.newProject.gitlab.repos.description}
        action={<Button variant="primary" onClick={onRetry}>{m.newProject.gitlab.repos.action}</Button>} secondary={null} error={null} />
    );
  }
  return (
    <Alert variant="danger" title={m.newProject.empty.listFailed}
      actions={onRetry === undefined ? undefined : <Button size="sm" onClick={onRetry}>{m.newProject.gitlab.repos.action}</Button>}>
      {failureText(m, error)}
    </Alert>
  );
}

/**
 * 목록에 없는 리포로 가는 길 — 검색 필드와 목록 사이, 검색 0건에서는 빈 상태 블록 아래. `GITHUB_APP_SLUG`가 없으면 사라진다.
 * ⚠️ **같은 탭이다** (DESIGN §6.3 예외) — 리포 선택을 저장하면 GitHub이 callback으로 되돌려 ①에 착지한다.
 */
function InstallHint({ installUrl }: { installUrl: string | null }) {
  const m = useMessages();
  if (installUrl === null) return null;
  return (
    <p className="text-muted-foreground shrink-0 text-xs leading-body">
      {m.newProject.repo.notListed}{" "}
      <InlineLink href={installUrl} >
        {m.newProject.empty.repos.action}
      </InlineLink>
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
  const m = useMessages();
  if (state.accessError !== undefined) {
    // 계정·세션 거부는 이미 상단 배너가 같은 문장으로 말한다 — 한 화면에 두 번 세우지 않는다 (#122).
    if (state.banner === state.accessError) return null;
    return (
      <BranchShell>
        <Alert variant="danger">{failureText(m, state.accessError)}</Alert>
      </BranchShell>
    );
  }
  if (state.branchLoading || state.branch === undefined) {
    return (
      <BranchShell>
        <BranchLabel />
        <Skeleton className="h-9 w-[220px] max-w-full shrink-0 rounded-md @max-form:flex-1" />
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
    /* 라벨·컨트롤·설명이 **한 줄**이다 — 세로로 쌓으면 행 하나가 세 줄이 되어 목록의 리듬이 깨진다.
       ⚠️ 목록 640 미만에서만 세 줄이다(malmoi#224) — 375에서 220 고정이 카드 밖으로 나가고 설명이 폭 0으로 사라졌다. DOM 순서 그대로 감긴다. */
    <BranchShell>
      <BranchLabel htmlFor={branch.mode === "fixed" ? undefined : "repo-branch"} />
      <>
        {branch.mode === "select" ? (
          <Select value={state.branchValue} onValueChange={onChange}>
            {/* ⚠️ **자기 id를 `aria-labelledby`에 함께 넣는다** — 트리거는 `<button>`이라 접근 값이
                없어서, 라벨만 이으면 스크린리더가 "Branch"까지만 말하고 고른 브랜치를 말하지 않는다. */}
            {/* 폭은 래퍼가 든다(repository-form과 같은 형) — 넓으면 220, 좁으면 둘째 줄 전폭. */}
            <div className="flex w-[220px] max-w-full shrink-0 @max-form:min-w-0 @max-form:flex-1">
              <SelectTrigger width="full" id="repo-branch" aria-labelledby="repo-branch-label repo-branch">
                <SelectValue />
              </SelectTrigger>
            </div>
            <SelectContent>
              {branch.names.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : branch.mode === "input" ? (
          <div className="flex w-[220px] max-w-full shrink-0 @max-form:min-w-0 @max-form:flex-1">
            <Input width="full"
              id="repo-branch"
              value={state.branchValue}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        ) : (
          /* ⚠️ **mono가 아니다** — 브랜치는 읽는 값이다 (핸드오프 1a의 `Select` 값이 sans다). */
          <p className="text-sm">{state.branchValue}</p>
        )}
        {/*
          ⚠️ **`text-foreground/60`이다** — 이 줄은 muted 면 위에 서므로 `muted-foreground`면 4.34:1로
          AA 미달이다 (핸드오프 · DESIGN §2.2). 같은 이유로 `FormGroup`을 쓰지 않는다 — 그 프리미티브의
          help는 흰 면 전용 색이고, 고치면 다른 화면의 모든 폼이 함께 움직인다.
        */}
        <p className="text-foreground/60 min-w-0 flex-1 text-xs leading-body @max-form:basis-full">{help}</p>
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
  return <div className="border-border flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t p-3 pl-20">{children}</div>;
}

/**
 * ⚠️ **`htmlFor`가 갈래를 탄다** — 조회 실패(`fixed`)와 로딩에는 가리킬 컨트롤이 아예 없다. 항상
 * 달면 존재하지 않는 id를 가리키는 라벨이 남는다.
 */
function BranchLabel({ htmlFor }: { htmlFor?: string }) {
  const m = useMessages();
  return (
    <label id="repo-branch-label" htmlFor={htmlFor} className="flex shrink-0 items-center gap-1.5 text-sm font-medium @max-form:basis-full">
      <GitBranch className="size-3.5" aria-hidden />
      {m.newProject.repo.branch}
    </label>
  );
}

/**
 * ① 막힘 갈래 (install-and-connect · DESIGN §6.7). **사용자에게 요구하는 일이 갈래마다 다르다**: 설치(A/B) ·
 * 설치에 리포 추가(C) · 관리자 승인 대기(D) · 재인가. 하나로 접으면 무엇을 해야 하는지 알 수 없다.
 *
 * ⚠️ **대기(D)에 설치 화면 제목·버튼을 세우지 않는다** — 요청자는 설치할 수 없고, 설치 링크를 다시 누르면
 * 요청이 한 번 더 간다. ⚠️ **"끝나면 새로고침"은 어느 갈래에도 없다** — 설치·리포 선택 모두 같은 탭 왕복이다.
 * ⚠️ **`installUrl === null`(= `GITHUB_APP_SLUG` 없음)이면 설치 버튼을 세우지 않는다** — 서버가 이미 알고,
 * 세우면 항상 `unavailable`로 실패하는 버튼이 된다.
 */
function Blocked({
  error,
  installUrl,
  back,
  pending,
  checking,
  onCheckAgain,
}: {
  error: string;
  installUrl: string | null;
  back: { filter?: string; q?: string };
  pending: boolean;
  checking: boolean;
  onCheckAgain: () => void;
}) {
  const m = useMessages();
  /**
   * ⚠️ **한 블록의 버튼들이 pending 하나·오류 하나를 공유한다** — 주 버튼(Install)과 보조 링크(Authorize)가
   * 각자 들면 둘 다 눌려 state 쿠키가 덮이고, 먼저 떠난 왕복이 `state-mismatch`로 돌아온다.
   */
  const connect = useGithubConnect({ dest: "new", back });
  /*
    ⚠️ **스피너는 누른 쪽에만 선다** (audit-ux #27) — 보조 링크는 꺼지기만 하고 돌지 않았고, 링크를 누르면 주 버튼이 돌았다.
    막는 것은 여전히 `pending` 하나다(위 경고).
  */
  const spinning = (via: "install" | "authorize") => connect.pending && connect.via === via;
  const link = (via: "install" | "authorize", label: string) => (
    <Button variant="link" size="sm" className="px-0" disabled={connect.pending} loading={spinning(via)} onClick={() => connect.start(via)}>
      {label}
    </Button>
  );

  // ⚠️ **연결 상태보다 먼저다** — 상한이면 설치·연결을 권해도 끝에서 막힌다 (`listConnectableRepos`가 GitHub 전에 판정한다).
  if (error === "limit-reached") {
    return (
      <BlockShell
        icon={Archive}
        title={m.newProject.empty.limit.title}
        description={m.newProject.empty.limit.description(PROJECT_LIMIT)}
        action={
          <ButtonLink variant="primary" href={routes.projects()} >
            {m.newProject.empty.limit.action}
          </ButtonLink>
        }
        secondary={null}
        error={null}
      />
    );
  }

  if ((error === "no-installations" || error === "no-repos") && pending) {
    return (
      <BlockShell
        icon={Clock}
        title={m.newProject.empty.waiting.title}
        description={m.newProject.empty.waiting.description}
        action={
          <Button variant="primary" loading={checking} onClick={onCheckAgain}>
            {m.newProject.empty.waiting.action}
          </Button>
        }
        // 요청이 거절됐는지 GitHub이 알려 주지 않는다 — 다른 계정에 설치하는 길을 남긴다.
        secondary={installUrl === null ? null : link("install", m.newProject.empty.waiting.otherAccount)}
        error={connect.error}
      />
    );
  }

  if (error === "not-connected" || error === "no-installations") {
    return (
      <BlockShell
        icon={Link2}
        title={m.newProject.empty.install.title}
        description={installUrl === null ? m.newProject.empty.noLink : m.newProject.empty.install.description}
        action={
          installUrl !== null ? (
            <Button variant="primary" disabled={connect.pending} loading={spinning("install")} onClick={() => connect.start("install")}>
              {m.newProject.empty.install.action}
            </Button>
          ) : error === "not-connected" ? (
            // 슬러그가 없어도 연결은 된다 — 설치는 관리자가 GitHub에서 따로 한다.
            <Button variant="primary" disabled={connect.pending} loading={spinning("authorize")} onClick={() => connect.start("authorize")}>
              <GithubIcon className="size-4" />
              {m.newProject.empty.connect.action}
            </Button>
          ) : null
        }
        // 이미 조직에 설치돼 있어 연결만 필요한 사람의 길 — 연결이 없는 A에만 선다.
        secondary={
          error === "not-connected" && installUrl !== null ? (
            <>
              {m.newProject.empty.install.installed} {link("authorize", m.newProject.empty.install.connect)}
            </>
          ) : null
        }
        error={connect.error}
      />
    );
  }

  if (error === "no-repos") {
    return (
      <BlockShell
        icon={FolderGit2}
        title={m.newProject.empty.repos.title}
        description={installUrl === null ? m.newProject.empty.noLink : m.newProject.empty.repos.description}
        action={
          installUrl === null ? null : (
            // ⚠️ **같은 탭이다** (DESIGN §6.3 예외) — 저장하면 GitHub이 callback으로 되돌려 ①에 착지한다.
            <ButtonLink variant="primary" external href={installUrl} >
              {m.newProject.empty.repos.action}
            </ButtonLink>
          )
        }
        secondary={null}
        error={null}
      />
    );
  }

  if (error === "reauthorize") {
    return (
      <BlockShell
        icon={GithubIcon}
        title={m.newProject.empty.reconnect.title}
        description={m.newProject.empty.reconnect.description}
        action={
          <Button variant="primary" disabled={connect.pending} loading={spinning("authorize")} onClick={() => connect.start("authorize")}>
            <GithubIcon className="size-4" />
            {m.newProject.empty.connect.reauthorize}
          </Button>
        }
        secondary={null}
        error={connect.error}
      />
    );
  }

  /*
    ⚠️ **오류는 중앙에 두지 않는다** — `Alert`는 폭 100% 배너라 세로 중앙에 띄우면 "무엇이
    비었다"를 말하는 빈 상태와 같은 자리에 서서 둘이 같은 부류로 읽힌다. 배너는 위에 붙는다.
  */
  return (
    <Alert variant="danger" title={m.newProject.empty.listFailed}>
      {failureText(m, error)}
    </Alert>
  );
}

/**
 * 막힘 갈래 한 블록 — 검색 0건 블록과 같은 형이다: 한 열이 남은 높이의 중앙에 서고 보조 줄이 빈 상태에 붙는다.
 * ⚠️ **`EmptyState`가 수직 중앙을 하지 않는다** — `flex-1`은 호출부가 든다는 것이 그 컴포넌트의 계약이다.
 * 안 잡으면 칩·제목·설명이 헤더 바로 아래 뭉치고 그 아래 수백 px이 빈다 (2026-09-13 사용자 실물).
 * ⚠️ **보조 줄은 `EmptyState` 밖, 아래다**(`InstallHint` 형) — action 래퍼는 가로 flex라 그 안에 넣으면 버튼 옆에 붙는다.
 */
function BlockShell({
  icon,
  title,
  description,
  action,
  secondary,
  error,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action: React.ReactNode;
  secondary: React.ReactNode;
  error: string | null;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <EmptyState icon={icon} title={title} description={description} action={action ?? undefined} />
      {secondary !== null && <p className="text-muted-foreground text-xs leading-body">{secondary}</p>}
      {error !== null && <Alert variant="danger">{error}</Alert>}
    </div>
  );
}
