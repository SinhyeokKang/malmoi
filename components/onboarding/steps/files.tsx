"use client";

import { FileCode2, FileJson2, FileSearch2 } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormGroup } from "@/components/ui/form-group";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableHeader, TableRow, Td, Th, Tr } from "@/components/ui/table";
import { LocaleFlag } from "@/components/translations/locale-badge";
import type { Adapter, AdapterName } from "@/lib/adapters/types";
import { m } from "@/lib/i18n";
import { panelConstraints } from "@/lib/shell/panel-size";
import type { CandidateSummary, SampleRow } from "@/lib/onboarding/detect";
import { onboardErrorMessage } from "@/lib/onboarding/message";
import { LOCALE_SEGMENT_MAX, collapseLocalePicker } from "@/lib/onboarding/locale-picker";
import type { AdapterChoice } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";

import { failureText } from "../failure";

/**
 * ② 로케일 파일 — 좌 240 후보 목록 + 우 키·값 표 (DESIGN §6.7).
 *
 * ⚠️ **표는 키 행만 스크롤한다** — 툴바·헤더·총량 줄은 고정이다. 그래서 껍데기의
 * `bodyScroll="hidden"`과 짝이고, 스크롤 컨테이너가 `<tbody>` 자리 하나다.
 *
 * ⚠️ **"못 읽었다"와 "정말 비었다"를 가른다** (DESIGN §6.7). 빈 값은 빈 칸, 조회·파싱 실패는
 * `We couldn't read this file.` — ②가 "ko 열이 비어 있다"를 말하는 화면이라 이 구별이 기능의
 * 목적 자체에 걸린다.
 */
export type ManualEntry = { adapter: AdapterName; pathTemplate: string; baseLocale: string };

/**
 * ② 좌측 패널이 나눠 가질 폭 — **여기는 뷰포트를 따라 변하지 않는다.** 모달이 `max-w-[1024px]`(2026-09-18, 옛 800)이고
 * 본문이 `px-8`(64)이라 952 = 960 − 핸들 8이고, 셸이 `min-w-[1280px]`이라 1280 뷰포트에서도 1024가
 * 그대로 산다(1280 − 96 = 1184). 그래서 `ShellPanels`와 달리 재는 훅이 없다. ⚠️ **모달 폭을 바꾸면 여기도 같이 바꾼다.**
 *
 * ⚠️ **핸들 폭과 같이 움직인다** — 여기가 핸들보다 크면 좌측이 계산한 240보다 넓게 선다(`w-4`
 * 시절의 16이 남아 있어 실측 242였다).
 */
const FILES_PANEL_WIDTH = 960 - 8;

/**
 * 좌측 치수는 셸 LNB와 **같은 200 / 240 / 320**이다. 하한 200은 후보 행의 40px 글리프와 2줄 경로가
 * 유지되는 자리, 상한 320은 우측이 400 아래로 안 내려가는 자리다 — 표가 `table-fixed` + key `w-1/3`
 * 이라 400에서 key 133 / value 267이고, 거기가 값이 읽히는 경계다.
 */
const FILES_LEFT = panelConstraints(FILES_PANEL_WIDTH, { min: 200, default: 240, max: 320 }) ?? undefined;

/** 언어별 미리보기 — 표시 상태 셋을 값으로 가른다. */
export type PreviewState =
  | { status: "loading" }
  | { status: "ready"; rows: SampleRow[]; total: number }
  | { status: "unavailable" };

export type FilesStepState = {
  detecting: boolean;
  detectError: string | undefined;
  candidates: CandidateSummary[];
  picked: number | null;
  locale: string;
  preview: PreviewState;
  manual: ManualEntry;
  manualCandidate?: CandidateSummary;
  manualMatched: boolean;
  adapters: AdapterChoice[];
  repoLabel: string;
  branch: string;
  banner: string | null;
};

/**
 * Path 힌트의 갈래 — 사전에 layout 전부가 있는지를 **여기서** 닫는다 (`lib/auth/message.ts`와 같은
 * 관용구: 사전은 잎이라 `satisfies`를 못 걸고 소비자가 건다).
 */
const PATH_HINTS = m.newProject.files.manual.pathHint satisfies Record<
  Adapter["layout"],
  (token: React.ReactNode) => React.ReactNode
>;

export function FilesStep({
  state,
  onPick,
  onLocale,
  onManual,
  onRetry,
  selection,
}: {
  state: FilesStepState;
  selection?: { checked: ReadonlySet<number>; conflicts: readonly { path: string }[]; onToggle: (index: number) => void };
  onPick: (index: number) => void;
  onLocale: (locale: string) => void;
  onManual: (next: ManualEntry) => void;
  onRetry: () => void;
}) {
  const { candidates, picked, detecting, detectError } = state;

  // 예외 F — 탐지 실패. ①의 선택(리포·브랜치)은 지키고 "아무것도 만들어지지 않았다"를 말한다.
  if (detectError !== undefined) {
    return (
      <div className="flex flex-1 flex-col gap-3">
        <Alert variant="danger">{failureText(detectError)}</Alert>
        <div>
          <Button variant="default" onClick={onRetry}>
            {m.newProject.result.ingest.retry}
          </Button>
        </div>
      </div>
    );
  }

  const candidate = picked === null ? undefined : candidates[picked];
  /**
   * ⚠️ **탐지 중은 수동 지정이 아니다** (bugshot-qa 2026-09-13). 후보가 아직 0개인 것은 "없다"가
   * 아니라 "모른다"인데, 그때 예외 E의 "Nothing to preview yet"을 띄우면 화면이 먼저 "로케일
   * 파일이 없다"를 말해 놓고 몇 초 뒤 후보를 내놓는다.
   */
  const manualMode = !detecting && (candidates.length === 0 || candidate === undefined);

  const candidateList = (
    <ul className="border-border min-h-0 overflow-y-auto rounded-md border" aria-label={m.newProject.files.candidates}>
      {candidates.map((c, index) => {
        const active = picked === index;
        const prevActive = index > 0 && picked === index - 1;
        /*
          ⚠️ **글리프가 파일 종류로 갈린다** — 어댑터 이름이 아니라 **경로의 확장자**로 판정한다
          (PRODUCT §3: 어댑터 내부 이름은 화면에 안 쓴다). 값이 아니라 모양만 가르는 자리다.
        */
        const Glyph = c.pathTemplate.endsWith(".json") ? FileJson2 : FileCode2;
        const content = (
                  <>
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", active ? "bg-background" : "bg-muted")}>
                      <Glyph className="text-muted-foreground size-5" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {/* 경로는 사용자가 자기 리포에서 확인할 수 있는 유일한 단서다 — **이름 자리가 경로다**. */}
                      <span className="block truncate text-base font-medium">{c.pathTemplate}</span>
                      <span className={cn("block truncate text-sm", active ? "text-foreground/60" : "text-muted-foreground")}>
                        {m.newProject.files.summaryShort(
                          c.locales.length,
                          c.keys.status === "counted"
                            ? m.newProject.files.keys(c.keys.count)
                            : onboardErrorMessage("key-count-failed"),
                        )}
                      </span>
                    </span>
                  </>
        );
        return (
          <li
            key={c.pathTemplate}
            className={cn(
              index > 0 && "border-t",
              index > 0 && (active || prevActive ? "border-border" : "border-divider"),
              active ? "bg-muted" : "hover:bg-foreground/3",
            )}
          >
            <div className={cn("p-3", selection && "flex items-center gap-3")}>
              {selection ? <>
                <Checkbox aria-label={m.newProject.files.include(c.pathTemplate)} checked={selection.checked.has(index)}
                  onCheckedChange={() => selection.onToggle(index)} />
                <Button variant="ghost" type="button" aria-label={m.newProject.files.previewCandidate(c.pathTemplate)}
                  className="text-foreground h-auto min-w-0 flex-1 justify-start gap-3 rounded p-0 text-left whitespace-normal"
                  onClick={() => onPick(index)}>{content}</Button>
              </> : <Radio value={String(index)} labelClassName="gap-3" label={content} />}
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    /*
      ⚠️ **래퍼가 `PanelGroup` 하나다** — 좌·핸들·우를 껍데기 본문의 **자식 하나**로 묶는다. 껍데기가
      `bodyDirection="row"`에서 드는 `gap-4`(16) **안에** 핸들을 형제로 끼우면 간격이 16+16+16이 되기
      때문이다. 자식이 하나면 그 `gap`은 아무것도 하지 않으므로 껍데기는 손대지 않는다 — 그 값은
      "두 자식을 놓는 다음 화면"의 계약이라 지울 것이 아니다. (2026-09-14에 이 자리가
      "래퍼를 세우지 않는다"였고, 간격을 핸들이 들게 되면서 그 전제가 뒤집혔다.)
    */
    <ResizablePanelGroup direction="horizontal" className="min-w-0 flex-1">
      {/* 좌 240(200~320) — 후보 목록 또는 수동 지정 폼. */}
      {/*
        ⚠️ **좌측에 `overflow-y-auto`를 두지 않는다** (2026-09-13 사용자 관측). CSS는 한 축이 `auto`면
        **다른 축의 `visible`을 `auto`로 강제**하므로, `w-full` 필드의 포커스 링(바깥 2px)이 좌우로
        잘린다. 스크롤이 필요한 것은 **후보 목록**뿐이라 그쪽으로 내린다 — 수동 지정 폼은 필드
        셋이라 넘치지 않는다.

        ⚠️ **`Panel`은 `overflow: hidden`을 인라인으로 건다** — 클래스가 아니라 라이브러리의
        `getPanelStyle`이라 Tailwind로 못 덮는다. 그대로 두면 위와 **같은 잘림이 다시 생기므로**
        `style`로 되돌린다(`styleFromProps`가 라이브러리 스타일 뒤에 펼쳐져 이긴다).
      */}
      {/*
        ⚠️ **`min-w-0`이 없으면 핸들이 아무것도 못 움직인다** (2026-09-14 실물 검증). flex 항목의 기본
        `min-width: auto`는 **min-content 아래로 못 줄이는 바닥**이라, 경로 텍스트가 든 후보 행의
        min-content(≈379)가 `flex-grow`를 이긴다 — `data-panel-size`는 33.3→44.4로 바뀌는데 폭은
        379에 붙박이고, 쉬는 폭도 240이 아니라 379다. 우측도 같은 이유로 함께 푼다.
      */}
      <ResizablePanel {...FILES_LEFT} style={{ overflow: "visible" }} className="flex min-w-0 flex-col gap-3">
        {state.banner !== null && <Alert variant="danger">{failureText(state.banner)}</Alert>}
        {detecting ? (
          <ul className="border-border overflow-hidden rounded-md border" aria-hidden>
            {[0, 1].map((i) => (
              <li key={i} className={cn("flex items-center gap-3 p-3", i > 0 && "border-divider border-t")}>
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="size-10 rounded-md" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
              </li>
            ))}
          </ul>
        ) : candidates.length === 0 ? (
          <ManualForm state={state} onManual={onManual} clearsSelection={false} />
        ) : (
          <>
            {selection ? candidateList : <RadioGroup aria-label={m.newProject.files.candidates}
              value={picked === null ? "" : String(picked)} onValueChange={value => onPick(Number(value))}
              className="min-h-0 overflow-y-auto">{candidateList}</RadioGroup>}
            {selection && selection.conflicts.length > 0 && <Alert variant="danger">
              <p>{m.newProject.files.conflicts}</p>
              {selection.conflicts.map(conflict => <p key={conflict.path}>{conflict.path}</p>)}
            </Alert>}
            <ManualToggle state={state} onManual={onManual} />
          </>
        )}
      </ResizablePanel>

      <ResizableHandle aria-label={m.newProject.files.resize} className="w-2" />

      {/*
        우 — 키·값 표. 껍데기는 `Preview`가 든다.

        ⚠️ **후보 0개에도 껍데기를 버리지 않는다** (핸드오프 3a). 경로를 쳐서 매칭되는 순간 빈 박스가
        통째로 툴바+헤더+행으로 갈리면 화면이 튄다 — 로딩에 헤더를 세워 두는 것과 **같은 규칙**이다.
      */}
      <ResizablePanel className="flex min-w-0">
        <Preview
          state={state}
          candidate={candidate ?? state.manualCandidate}
          onLocale={onLocale}
          empty={manualMode && !state.manualMatched}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function Preview({
  state,
  candidate,
  onLocale,
  empty = false,
}: {
  state: FilesStepState;
  candidate: CandidateSummary | undefined;
  onLocale: (locale: string) => void;
  /** 예외 E — 보여 줄 후보가 아직 없다. **헤더는 그대로 서고 본문 자리만 빈다.** */
  empty?: boolean;
}) {
  const locales = candidate?.locales ?? [];
  /**
   * 다섯 이상이면 세그먼트가 아니라 `Select`로 접는다. ⚠️ **③의 기준 언어와 경계가 다르다**(그쪽은
   * 열) — 세그먼트는 가로 한 줄이라 칸이 늘면 코드가 잘리고, 라디오는 감싸므로 줄만 는다.
   */
  const collapsed = collapseLocalePicker(locales.length, LOCALE_SEGMENT_MAX);
  const keysFor = (code: string): string | undefined => {
    const sample = candidate?.samples.find((s) => s.locale === code);
    return sample === undefined ? undefined : m.newProject.files.keys(sample.total);
  };

  return (
    /*
      ⚠️ **표가 자기 테두리 안에서 산다** — 툴바·헤더·총량 줄이 고정이고 **키 행만** 스크롤하므로
      껍데기의 `bodyScroll="hidden"`과 짝이다. 스크롤을 바깥이 들면 헤더의 `sticky`가 붙을 대상을
      잃는다 (`table.tsx`의 컨테이너 주석과 같은 규칙).
    */
    <div className="border-border flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border">
      {/*
        툴바 — 고정. ⚠️ **빈 상태에는 아예 없다** (핸드오프 3a는 헤더부터 시작한다). 남겨 두면
        고를 로케일도 읽을 파일도 없는 자리에 **트랙 자리 회색 블록이 영구히** 서서, 탐지 중 화면과
        픽셀 단위로 같아 보인다 — 사용자는 그것을 "로딩이 멈췄다"로 읽는다.
      */}
      {!empty && (
      <div className="border-border flex shrink-0 items-center gap-2 border-b p-2">
        {collapsed ? (
          <Select value={state.locale} onValueChange={onLocale}>
            {/* ⚠️ 라벨이 트리거 **밖**이다 — 안에 두면 자기 참조가 내용으로 풀릴 때 두 번 읽힌다 (리뷰 2026-09-13). */}
            <span id="preview-language-label" className="sr-only">{m.newProject.files.preview.language}</span>
            <SelectTrigger id="preview-language" aria-labelledby="preview-language-label preview-language" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locales.map((code) => (
                <SelectItem key={code} value={code}>
                  {/* ⚠️ 세그먼트 칸에는 국기가 있다 — 접혔다고 빠지면 같은 로케일이 두 가지로 보인다. */}
                  <LocaleFlag code={code} />
                  {m.newProject.files.preview.option(code, keysFor(code))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : locales.length === 0 ? (
          /*
            ⚠️ **칸 수를 모르는 동안은 트랙 자리만 남긴다** (핸드오프 2b). 칸 0개짜리 세그먼트를
            그대로 세우면 툴바가 빈 채로 있다가 값이 도착하는 순간 높이가 튄다.
          */
          <div className="bg-canvas h-9 w-[150px] rounded-lg" aria-hidden />
        ) : (
          <SegmentedControl
            label={m.newProject.files.preview.language}
            value={state.locale}
            onChange={onLocale}
            /* 칸마다 국기가 앞에 선다 — `leading`이 그 자리다 (`SegmentContent`는 아이콘 컴포넌트만 받는다). */
            options={locales.map((code) => ({ value: code, label: code, leading: <LocaleFlag code={code} /> }))}
          />
        )}
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-right text-xs">{candidate?.pathTemplate}</span>
      </div>
      )}

      {/*
        키 행 — **여기만** 스크롤한다. 헤더는 `Th`의 `sticky`가 세운다.

        ⚠️ **헤더는 로딩에도 서 있는다** — 스켈레톤이 `<tbody>` 안에서만 차야 값이 도착할 때
        레이아웃이 움직이지 않는다(핸드오프: "행 높이·디바이더·표 헤더 글자는 실물 그대로").
      */}
      {/*
        ⚠️ **컨테이너가 `tabIndex={0}`과 이름을 든다** — 이 안에 포커스 가능한 것이 하나도 없어서
        (읽기 전용 텍스트뿐) 없으면 키보드로 목록을 밀 수 없다. Chrome 127+의 keyboard-focusable
        scrollers가 가려 주지만 Firefox·Safari에는 없다.
      */}
      <div
        /* ⚠️ **`role`이 있어야 이름이 붙는다** — role 없는 div는 `generic`이고 ARIA 1.2가 naming을 **금지**한다. */
        role="region"
        tabIndex={0}
        aria-label={m.newProject.files.preview.rows}
        /*
          ⚠️ **`flex flex-col`이다** — 예외 E의 빈 상태가 **표 헤더 아래 남은 높이의 중앙**에 서야 하고
          (핸드오프 3a), 그 높이를 주는 것이 이 컨테이너뿐이다. 바깥 박스가 중앙을 잡으면 헤더까지
          포함한 중앙이 되어 블록이 위로 밀린다.
        */
        className="focus-visible:ring-ring flex min-h-0 flex-1 flex-col overflow-auto focus-visible:ring-2 focus-visible:outline-none"
      >
        {/* ⚠️ **`scrollable={false}`다** — 스크롤을 이 div가 들어야 `Th`의 `sticky`가 그것을 기준으로 붙는다. */}
        {/*
          ⚠️ **`shrink-0`이 flex 전환의 대가다** — flex 아이템은 기본이 `shrink:1`이라, 행이 많아
          내용이 컨테이너를 넘으면 표가 눌릴 수 있다. 넘치는 만큼은 스크롤이 받는다.
        */}
        <Table scrollable={false} className="table-fixed shrink-0">
          {/*
            ⚠️ **`[&_tr]:border-b-0`이 `TableRow`가 아니라 여기 있다.** 프리셋과 **같은 요소·같은
            변형**이라 twMerge가 뒤엣것만 남기고 프리셋은 CSS로 나가지도 않는다. 행에 `border-b-0`을
            주던 앞 판은 **아무 효과가 없었다** — 자손 선택자 `[&_tr]:border-b`(0,1,1)가 행의
            `border-b-0`(0,1,0)을 특정도로 이기고, 두 클래스가 다른 요소에 있어 twMerge도 못 봤다.
            그때 선이 안 보인 것은 `border-collapse`가 셀 테두리를 우선한 우연이다.
            선은 첫 `Td`의 `border-t`가 든다.
          */}
          <TableHeader className="[&_tr]:border-b-0">
            {/*
              ⚠️ **헤더 배경이 불투명이다.** 핸드오프의 `rgba(10,10,10,0.02)`는 흰 패널 위 **한 겹**으로
              그린 값인데, 여기 헤더는 `sticky`라 **뒤로 키 행이 지나간다** — 98% 투과면 글자가 그대로
              비친다. 흰 위 2%에 해당하는 불투명 값이 `#fafafa`이고 그것이 이미 토큰으로 있다
              (DESIGN §6.2에 등재. 이름에 primary가 붙은 것은 그 토큰의 첫 소비자가 버튼이어서지
              의미가 primary라서가 아니다).
            */}
            <TableRow>
              <Th className="bg-primary-foreground w-1/3 text-xs">{m.newProject.files.preview.key}</Th>
              <Th className="bg-primary-foreground text-xs">{m.newProject.files.preview.value}</Th>
            </TableRow>
          </TableHeader>
          {!empty && (
          <TableBody>
            {state.preview.status === "loading" ? (
              [0, 1, 2, 3, 4].map((i) => (
                <Tr key={i} aria-hidden className="hover:bg-transparent">
                  <Td className={cn("py-3", i === 0 ? "border-border" : "border-divider")}>
                    <Skeleton className="h-4 w-full" />
                  </Td>
                  <Td className={cn("py-3", i === 0 ? "border-border" : "border-divider")}>
                    <Skeleton className="h-4 w-full" />
                  </Td>
                </Tr>
              ))
            ) : state.preview.status === "unavailable" ? (
              <Tr className="hover:bg-transparent">
                <Td colSpan={2} className="border-border text-muted-foreground py-3">
                  {m.newProject.files.preview.unavailable}
                </Td>
              </Tr>
            ) : (
              state.preview.rows.map((row, index) => (
                <Tr key={row.key} className="hover:bg-transparent">
                  {/* ⚠️ **키가 sans다** — mono는 사람이 그대로 옮겨 적는 값에만 남는다 (핸드오프 공통). */}
                  {/*
                    ⚠️ **`whitespace-nowrap`을 명시한다.** `Td`의 기본이 `whitespace-normal`이고
                    `truncate`(= overflow-hidden + ellipsis + nowrap)와 **그룹이 달라** twMerge가
                    둘을 함께 남긴다 — 그러면 값이 두 줄로 흘러 행 높이가 제각각이 된다(실물 관측).
                  */}
                  <Td className={cn("text-muted-foreground truncate py-3 whitespace-nowrap", index === 0 ? "border-border" : "border-divider")}>
                    {row.key}
                  </Td>
                  {/* 정말 비었으면 **빈 칸**이다 — 못 읽은 것과 화면에서 갈린다. */}
                  <Td className={cn("truncate py-3 whitespace-nowrap", index === 0 ? "border-border" : "border-divider")}>
                    {row.value}
                  </Td>
                </Tr>
              ))
            )}
          </TableBody>
          )}
        </Table>
        {empty && (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={FileSearch2}
              title={m.newProject.files.preview.none}
              description={m.newProject.files.preview.noneDescription}
            />
          </div>
        )}
      </div>

      {/* 총량 줄 — 스크롤 밖에 남는다. */}
      {state.preview.status === "ready" && state.preview.total > state.preview.rows.length && (
        <p className="border-border text-muted-foreground shrink-0 border-t px-4 py-3 text-center text-xs">
          {m.newProject.files.preview.more(state.preview.total - state.preview.rows.length)}
        </p>
      )}
    </div>
  );
}

function ManualToggle({ state, onManual }: { state: FilesStepState; onManual: (next: ManualEntry) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <p className="text-muted-foreground text-xs">
        {m.newProject.files.notListed}{" "}
        <Button variant="link" size="sm" onClick={() => setOpen(true)} className="px-0">
          {m.newProject.files.setPath}
        </Button>
      </p>
    );
  }
  return <ManualForm state={state} onManual={onManual} clearsSelection />;
}

/** 예외 E — 후보 0개. **경로를 치면 우측이 키로 차고 그것이 검증이다.** */
function ManualForm({
  state,
  onManual,
  clearsSelection,
}: {
  state: FilesStepState;
  onManual: (next: ManualEntry) => void;
  /** ⚠️ **후보 0개에는 위에 지울 선택이 없다** (malmoi#47) — 그 갈래에서 안내 문장은 없는 UI를 가리킨다. */
  clearsSelection: boolean;
}) {
  const { manual, adapters } = state;
  // 셀렉트의 선택지가 `adapters` 그 배열이라 못 찾을 수 없다 — 폴백은 타입을 닫기 위한 것이다.
  const choice = adapters.find((c) => c.adapter === manual.adapter);

  return (
    <div className="flex flex-col gap-3">
      <FormGroup label={m.newProject.files.manual.format} labelId="manual-format-label" htmlFor="manual-format">
        <Select value={manual.adapter} onValueChange={(value) => onManual({ ...manual, adapter: value as AdapterName })}>
          <SelectTrigger id="manual-format" aria-labelledby="manual-format-label manual-format" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {adapters.map((c) => (
              <SelectItem key={c.adapter} value={c.adapter}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormGroup>
      <FormGroup
        label={m.newProject.files.manual.path}
        htmlFor="manual-path"
        help={PATH_HINTS[choice?.layout ?? "per-locale"](
          <span className="text-mono">{choice?.layout === "multi-locale" ? "*" : "{locale}"}</span>,
        )}
      >
        <Input
          id="manual-path"
          value={manual.pathTemplate}
          onChange={(e) => onManual({ ...manual, pathTemplate: e.target.value })}
          placeholder={choice?.example ?? "src/locales/{locale}.json"}
          className="text-mono w-full"
        />
      </FormGroup>
      <FormGroup label={m.newProject.files.manual.baseLocale} htmlFor="manual-base">
        <Input
          id="manual-base"
          value={manual.baseLocale}
          onChange={(e) => onManual({ ...manual, baseLocale: e.target.value })}
          placeholder="en"
          className="w-full"
        />
      </FormGroup>
      {/* ⚠️ 이 문장은 **블록 전체**를 설명한다 — 필드의 `help`로 매달면 그 필드의 설명으로 읽힌다 */}
      {clearsSelection && <p className="text-muted-foreground text-xs">{m.newProject.files.manual.hint}</p>}
    </div>
  );
}
