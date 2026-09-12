"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormGroup } from "@/components/ui/form-group";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import type { Adapter, AdapterName } from "@/lib/adapters/types";
import { m } from "@/lib/i18n";
import type { CandidateSummary, SampleRow } from "@/lib/onboarding/detect";
import { onboardErrorMessage } from "@/lib/onboarding/message";
import type { AdapterChoice } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";

import { failureText } from "../failure";

/**
 * ② 로케일 파일 — 좌 240 후보 목록 + 우 키·값 표 (new-project-modal design §4·§8).
 *
 * ⚠️ **표는 키 행만 스크롤한다** — 툴바·헤더·총량 줄은 고정이다. 그래서 껍데기의
 * `bodyScroll="hidden"`과 짝이고, 스크롤 컨테이너가 `<tbody>` 자리 하나다.
 *
 * ⚠️ **"못 읽었다"와 "정말 비었다"를 가른다** (design §3.4). 빈 값은 빈 칸, 조회·파싱 실패는
 * `We couldn't read this file.` — ②가 "ko 열이 비어 있다"를 말하는 화면이라 이 구별이 기능의
 * 목적 자체에 걸린다.
 */
export type ManualEntry = { adapter: AdapterName; pathTemplate: string; baseLocale: string };

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
}: {
  state: FilesStepState;
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

  return (
    <div className="flex min-h-0 flex-1 gap-6">
      {/* 좌 240 — 후보 라디오 또는 수동 지정 폼. */}
      <div className="flex w-60 shrink-0 flex-col gap-3 overflow-y-auto">
        {state.banner !== null && <Alert variant="danger">{failureText(state.banner)}</Alert>}
        {detecting ? (
          <div className="flex flex-col gap-2" aria-hidden>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : candidates.length === 0 ? (
          <ManualForm state={state} onManual={onManual} />
        ) : (
          <>
            <ul className="divide-border-subtle border-border divide-y overflow-hidden rounded-lg border">
              {candidates.map((c, index) => (
                <li key={c.pathTemplate} className={cn("px-3 py-2", picked === index && "bg-muted font-medium")}>
                  <Radio
                    name="candidate"
                    checked={picked === index}
                    onChange={() => onPick(index)}
                    label={
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{c.label}</span>
                        {/* 경로는 사용자가 자기 리포에서 확인할 수 있는 유일한 단서다 (design §3.3) */}
                        <span className="text-muted-foreground block truncate text-xs">{c.pathTemplate}</span>
                        <span className="text-muted-foreground block text-xs">
                          {m.newProject.files.summaryShort(
                            c.locales.length,
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
            <ManualToggle state={state} onManual={onManual} />
          </>
        )}
      </div>

      {/* 우 — 키·값 표. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        {manualMode && !state.manualMatched ? (
          <EmptyState className="py-6" title={m.newProject.files.preview.none} />
        ) : (
          <Preview state={state} candidate={candidate ?? state.manualCandidate} onLocale={onLocale} />
        )}
      </div>
    </div>
  );
}

function Preview({
  state,
  candidate,
  onLocale,
}: {
  state: FilesStepState;
  candidate: CandidateSummary | undefined;
  onLocale: (locale: string) => void;
}) {
  const locales = candidate?.locales ?? [];
  /** 다섯 이상이면 세그먼트가 아니라 `Select`로 접는다 (design §8). */
  const collapsed = locales.length >= 5;
  const keysFor = (code: string): string | undefined => {
    const sample = candidate?.samples.find((s) => s.locale === code);
    return sample === undefined ? undefined : m.newProject.files.keys(sample.total);
  };

  return (
    <>
      {/* 툴바 — 고정. */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        {collapsed ? (
          <Select
            aria-label={m.newProject.files.preview.language}
            value={state.locale}
            onChange={(e) => onLocale(e.target.value)}
            className="w-48"
          >
            {locales.map((code) => (
              <option key={code} value={code}>
                {m.newProject.files.preview.option(code, keysFor(code))}
              </option>
            ))}
          </Select>
        ) : (
          <SegmentedControl
            label={m.newProject.files.preview.language}
            value={state.locale}
            onChange={onLocale}
            options={locales.map((code) => ({ value: code, label: code }))}
          />
        )}
        <span className="text-muted-foreground truncate text-xs">{candidate?.pathTemplate}</span>
      </div>

      {/* 헤더 — 고정. */}
      <div className="border-border-subtle text-muted-foreground grid shrink-0 grid-cols-[1fr_2fr] gap-3 border-b pb-2 text-xs">
        <span>{m.newProject.files.preview.key}</span>
        <span>{m.newProject.files.preview.value}</span>
      </div>

      {/* 키 행 — **여기만** 스크롤한다. */}
      <div
        tabIndex={0}
        aria-label={m.newProject.files.preview.value}
        className="focus-visible:ring-ring min-h-0 flex-1 overflow-y-auto focus-visible:ring-2 focus-visible:outline-none"
      >
        {state.preview.status === "loading" ? (
          <div className="flex flex-col gap-2 pt-2" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : state.preview.status === "unavailable" ? (
          <p className="text-muted-foreground pt-2 text-sm">{m.newProject.files.preview.unavailable}</p>
        ) : (
          <dl className="grid grid-cols-[1fr_2fr] gap-x-3 gap-y-1 pt-2 text-sm">
            {state.preview.rows.map((row) => (
              <div key={row.key} className="contents">
                <dt className="text-mono truncate">{row.key}</dt>
                {/* 정말 비었으면 **빈 칸**이다 — 못 읽은 것과 화면에서 갈린다. */}
                <dd className="truncate">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* 총량 줄 — 고정. */}
      {state.preview.status === "ready" && state.preview.total > state.preview.rows.length && (
        <p className="text-muted-foreground shrink-0 text-xs">
          {m.newProject.files.preview.more(state.preview.total - state.preview.rows.length)}
        </p>
      )}
    </>
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
  return <ManualForm state={state} onManual={onManual} />;
}

/** 예외 E — 후보 0개. **경로를 치면 우측이 키로 차고 그것이 검증이다.** */
function ManualForm({ state, onManual }: { state: FilesStepState; onManual: (next: ManualEntry) => void }) {
  const { manual, adapters } = state;
  // 셀렉트의 선택지가 `adapters` 그 배열이라 못 찾을 수 없다 — 폴백은 타입을 닫기 위한 것이다.
  const choice = adapters.find((c) => c.adapter === manual.adapter);

  return (
    <div className="flex flex-col gap-3">
      <FormGroup label={m.newProject.files.manual.format} htmlFor="manual-format">
        <Select
          id="manual-format"
          value={manual.adapter}
          onChange={(e) => onManual({ ...manual, adapter: e.target.value as AdapterName })}
          className="w-full"
        >
          {adapters.map((c) => (
            <option key={c.adapter} value={c.adapter}>
              {c.label}
            </option>
          ))}
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
      <p className="text-muted-foreground text-xs">{m.newProject.files.manual.hint}</p>
    </div>
  );
}
