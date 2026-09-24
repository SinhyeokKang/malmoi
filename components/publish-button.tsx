"use client";
import { utcMinute } from "@/lib/utc-time";
import { flagFor } from "@/lib/keys/flag";
import { diffWords } from "@/lib/publish/words";
import { Check, CircleCheck, FileJson2, GitPullRequestArrow, History, Info, LoaderCircle, RefreshCw, Send, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type RefObject, type ReactNode } from "react";
import { triggerPullAction } from "@/app/(edit)/actions";
import { loadPublishPreview } from "@/app/(edit)/publish-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OnboardingModal } from "@/components/ui/modal";
import { m } from "@/lib/i18n";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { onboardErrorMessage, isOnboardError } from "@/lib/onboarding/message";
import type { PullOutcome } from "@/lib/pull/message";
import { parseGithubPrUrl } from "@/lib/projects/pr-url";
import { routes } from "@/lib/routes";
import type { PublishModalState, PublishPreview } from "@/lib/publish/preview";
import { planPublishButton, planPublishView, planWithheldLines } from "@/lib/publish/plan";
import { summarizeWarnings } from "@/lib/publish/warnings";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** 실행 결과에 **그때의 사실**을 붙여 둔다 — 결과를 다시 열 때 `count`는 이미 refresh로 줄어 있다. */
type PublishResultState = { outcome: PullOutcome; at: Date; total: number };

/** 조건부 모달이 아니라 무조건 렌더되는 호스트가 든다 — 닫기·refresh가 실행 결과를 지우면 안 된다. */
export function usePublish(slug: string) {
  const router = useRouter();
  const [state, setState] = useState<PublishModalState>({ kind: "preview-loading" });
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PublishResultState | null>(null);
  /** ⚠️ **진행 중인 실행의 건수는 `result`에서 못 읽는다** — 그 값은 아직 **직전** 실행의 것이다. */
  const [runTotal, setRunTotal] = useState(0);
  const current = useRef(state); current.current = state;
  const running = useRef(false);
  const generation = useRef(0);
  const host = useRef(0);
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    host.current++; generation.current++; running.current = false;
    setOpen(false); setPending(false); setResult(null); setRunTotal(0); setState({ kind: "preview-loading" });
    return () => { host.current++; generation.current++; };
  }, [slug]);
  function close() { generation.current++; setOpen(false); }
  async function preview() {
    if (running.current) return;
    const request = ++generation.current;
    const loading = { kind: "preview-loading" } as const;
    current.current = loading; setState(loading); setOpen(true);
    try {
      const data = await loadPublishPreview({ slug });
      if (request !== generation.current) return;
      // 거부는 실행 전 거부와 같은 결과로 그린다(`1h`) — Retry가 같은 거부를 다시 받는 갈래를 만들지 않는다 (L3.3).
      const next: PublishModalState =
        data.status === "ok" ? { kind: "preview-ready", preview: data.preview }
        : data.status === "rejected" ? { kind: "result", outcome: { status: "failed", error: data.error, delivery: "not-started", retryable: false } }
        : data.status === "refused" ? { kind: "preview-refused", path: data.path, branch: data.branch }
        : { kind: "preview-error" };
      current.current = next; setState(next);
    } catch {
      if (request === generation.current) { current.current = { kind: "preview-error" }; setState(current.current); }
    }
  }
  async function confirm() {
    if (running.current || current.current.kind !== "preview-ready") return;
    const owner = host.current;
    // 진행 제목도 나가는 수로 말한다(#84) — 보류만 있으면 애초에 실행 버튼이 없다.
    const total = current.current.preview.sendable.total;
    if (total === 0) return;
    running.current = true; generation.current++; setPending(true); setRunTotal(total);
    current.current = { kind: "running" }; setState(current.current);
    const next: PullOutcome = await triggerPullAction(slug).catch(() => ({ status: "failed", error: "unavailable", retryable: true, delivery: "unknown" }));
    if (owner !== host.current) return;
    running.current = false; setPending(false); setResult({ outcome: next, at: new Date(), total });
    current.current = { kind: "result", outcome: next }; setState(current.current);
    if (next.status !== "failed") router.refresh();
  }
  function showResult() { if (result) { generation.current++; setState({ kind: "result", outcome: result.outcome }); setOpen(true); } }
  function launch() { if (running.current) { setState({ kind: "running" }); setOpen(true); } else void preview(); }
  return { state, open, pending, result, runTotal, triggerRef, close, preview, confirm, showResult, launch };
}
export type PublishController = ReturnType<typeof usePublish>;

/** @param id 번역 화면의 보류 배너가 포커스를 옮기는 대상 — 둘째 트리거를 만들지 않으려는 것이다 (sync-edit-protection T13). */
export function PublishButton({ id, count, publish, disabled = false }: { id?: string; count: number; publish: PublishController; disabled?: boolean }) {
  const plan = planPublishButton({ count, paused: disabled, otherPending: false, publishPending: publish.pending });
  const reasonId = useId();
  // ⚠️ **꺼진 Publish는 `aria-disabled`다** — 진짜 `disabled`면 사유가 hover `title`에만 남아 키보드·스크린리더로
  // 닿지 않는다 (DESIGN §6.65). 포커스를 받으므로 모달을 닫으면 이 버튼으로 돌아온다.
  return <div className="flex items-center gap-2">
    <span title={plan.hint || undefined}>
      <Button id={id} variant="primary" aria-disabled={plan.disabled ? "true" : undefined} aria-describedby={plan.disabled && plan.hint ? reasonId : undefined}
        onClick={event => { if (plan.disabled) return; publish.triggerRef.current = event.currentTarget; publish.launch(); }}>
        {publish.pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {publish.pending ? m.translations.publish.publishing : m.translations.publish.button}
        {plan.badge !== null && <span className="bg-background/20 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-px text-xs">{plan.badge.toLocaleString("en-US")}</span>}
      </Button>
      {plan.disabled && plan.hint && <span id={reasonId} className="sr-only">{plan.hint}</span>}
    </span>
    {!publish.pending && publish.result && <Button onClick={event => { publish.triggerRef.current = event.currentTarget; publish.showResult(); }}>{m.translations.publish.viewResult}</Button>}
  </div>;
}

const p = m.translations.publish;

/**
 * ⚠️ **갈래마다 높이를 고정한다** (시안 §7) — 한 값으로 묶으면 단계가 짧은 갈래에서 바닥 버튼이
 * 허공에 뜬다. ⚠️ **리터럴 문자열이어야 한다** — Tailwind는 소스에 그대로 적힌 클래스만 만든다.
 */
const PANEL = {
  preview: "min-h-[min(620px,calc(100svh-96px))] max-h-[min(680px,calc(100svh-96px))]",
  running: "min-h-[min(340px,calc(100svh-96px))] max-h-[min(380px,calc(100svh-96px))]",
  created: "min-h-[min(420px,calc(100svh-96px))] max-h-[min(460px,calc(100svh-96px))]",
  updated: "min-h-[min(460px,calc(100svh-96px))] max-h-[min(500px,calc(100svh-96px))]",
  noChanges: "min-h-[min(360px,calc(100svh-96px))] max-h-[min(400px,calc(100svh-96px))]",
  partial: "min-h-[min(560px,calc(100svh-96px))] max-h-[min(600px,calc(100svh-96px))]",
  configError: "min-h-[min(460px,calc(100svh-96px))] max-h-[min(500px,calc(100svh-96px))]",
  transientError: "min-h-[min(400px,calc(100svh-96px))] max-h-[min(440px,calc(100svh-96px))]",
  previewError: "min-h-[min(440px,calc(100svh-96px))] max-h-[min(480px,calc(100svh-96px))]",
} as const;

/**
 * 무색 블록 — `1a`의 PR 줄 · `1e`·`1g`의 브랜치 경고 · `1f`의 본문이 같은 급이다.
 *
 * ⚠️ **글리프 칸의 높이가 첫 줄의 line-height와 같다** (시안 §5). `margin-top`으로 눈대중 보정하면
 * 글자 크기가 다른 블록마다 어긋나고, 그 어긋남은 한 화면 안에서만 안 보인다.
 */
/*
 * ⚠️ **블록에 `aria-live`를 주지 않는다** — 시안은 PR 줄에 `polite`를 적었지만 **리뷰 6번이
 * "껍데기의 polite live 한 곳"으로 정정했다**: 같은 전이를 둘이 알리면 중복 낭독이 되고,
 * `translations-screen.test.ts`가 번역 작업 화면의 live 영역을 푸터 결과 영역 하나로 고정한다.
 */
function Notice({ icon: Icon, title, children }: { icon: typeof Info; title?: string; children: ReactNode }) {
  // ⚠️ 제목 없는 형(`1f`)은 padding 16이고 제목 있는 형은 14 16이다 — 시안이 그 둘을 갈라 그렸다.
  return <div className={`border-border flex shrink-0 gap-3 rounded-lg border ${title === undefined ? "p-4" : "px-4 py-3.5"}`}>
    <span className={`text-muted-foreground flex shrink-0 items-center ${title === undefined ? "h-6" : "h-[17px]"}`}><Icon className="size-4" aria-hidden /></span>
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      {title !== undefined && <span className="text-sm font-medium">{title}</span>}
      <span className={title === undefined ? "text-sm leading-[1.7] text-pretty" : "text-muted-foreground text-xs leading-[1.7]"}>{children}</span>
    </span>
  </div>;
}

/**
 * PR 줄의 조회 중 자리 — 제목 있는 `Notice`와 같은 박스라 준비되면 표가 안 밀린다.
 *
 * ⚠️ **`prUnknown`으로 대신하지 않는다** (malmoi#49). 그 문장은 조회가 **실패했다**는 말이라, 로딩에
 * 세우면 몇 초 동안 일어나지 않은 실패와 "열린 PR을 덮을 수 있다"를 읽힌다.
 */
function NoticeSkeleton() {
  return <div aria-hidden className="border-border flex shrink-0 gap-3 rounded-lg border px-4 py-3.5">
    <span className="flex h-[17px] shrink-0 items-center"><Skeleton className="size-4 rounded-full" /></span>
    {/* ⚠️ **막대가 아니라 줄 상자가 높이를 든다** — 제목 20 + 본문 13/1.7(22.1)이 `Notice`의 실측이고,
        막대 높이로 맞추면 소수 줄 높이가 안 맞아 준비될 때 표가 5px 밀렸다(2026-09-17 실측 71 → 76). */}
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex h-5 items-center"><Skeleton className="h-3.5 w-56" /></span>
      <span className="flex items-center text-xs leading-[1.7]">{"\u200b"}<Skeleton className="h-3 w-full" /></span>
    </span>
  </div>;
}

/**
 * ⚠️ **결과 갈래의 블록 사이는 12이고 껍데기의 16이 아니다** (시안 `1d`~`1k`가 전부 `gap:12`인
 * 안쪽 열을 하나 둔다). 껍데기 값을 바꾸면 온보딩 네 단계가 함께 움직인다.
 */
function Stack({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col gap-3">{children}</div>;
}

/** 바닥 보조 한 줄 — 글리프 21(13/1.6)에 맞춘다. */
function Hint({ icon: Icon = Info, children }: { icon?: typeof Info; children: ReactNode }) {
  return <div className="text-muted-foreground flex gap-2.5 text-xs leading-[1.6]">
    <span className="flex h-[21px] shrink-0 items-center"><Icon className="size-4" aria-hidden /></span>
    <span className="min-w-0 flex-1">{children}</span>
  </div>;
}

/** 네임스페이스 접두를 muted로 내린다 — 키 목록에서 눈이 잡아야 하는 것은 접두가 아니라 뒷부분이다. */
function namespaceOf(key: string): string {
  const dot = key.indexOf(".");
  return dot < 0 ? "" : key.slice(0, dot + 1);
}

/** `1d`·`1e`·`1g`가 공유하는 PR 카드. ⚠️ **제목을 그리지 않는다** — `PullResult`에 없다(§10-6). */
function PrCard({ repo, number, note }: { repo: string; number: number | null; note: string }) {
  return <div className="border-border flex shrink-0 items-center gap-3 rounded-lg border px-4 py-3.5">
    <GitPullRequestArrow className="size-4 shrink-0 text-green-800" aria-hidden />
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-sm">{repo}{number !== null && ` #${number}`}</span>
      <span className="text-muted-foreground text-xs">{note}</span>
    </span>
    <Badge variant="success">{p.prState}</Badge>
  </div>;
}

/** `1e`·`1g`가 공유하는 브랜치 경고 — 조건은 `pr === "updated"` 하나다(warnings와 무관하다). */
function Replaced({ branch, base }: { branch: string; base: string }) {
  return <Notice icon={RefreshCw} title={p.replacedTitle}>{p.replacedBody(branch, base)}</Notice>;
}

/**
 * 표 머리 — `1a`와 `1k`가 같은 자리에서 갈린다.
 *
 * ⚠️ **`<table>`이다** — 시안은 그림이라 DOM 시맨틱을 정하지 않고, 200행짜리 데이터 그리드에서
 * 열 머리와 셀의 연결이 사라지면 낭독에 "actionLog. filter.all en All"만 남는다. 치수는 그대로다.
 * ⚠️ **`border-separate`다** — `collapse`는 `sticky` 머리에서 테두리가 같이 안 붙는다.
 */
function TableHead() {
  return <thead className="bg-primary-foreground">
    <tr>
      {/* ⚠️ 아래는 구조선(`#e5e5e5`), 옆은 그룹 안의 선(`#f0f0f0`) — 한 클래스로 주면 뒤엣것이 네 변을 다 덮는다. */}
      <th scope="col" className="border-b-border border-r-divider text-muted-foreground bg-primary-foreground sticky top-0 z-10 w-[220px] border-r border-b px-3.5 py-[9px] text-left text-xs font-normal">{p.key}</th>
      <th scope="col" className="border-b-border border-r-divider text-muted-foreground bg-primary-foreground sticky top-0 z-10 w-[84px] border-r border-b px-3 py-[9px] text-left text-xs font-normal">{p.locale}</th>
      <th scope="col" className="border-border text-muted-foreground bg-primary-foreground sticky top-0 z-10 border-b px-3.5 py-[9px] text-left text-xs font-normal">{p.value}</th>
    </tr>
  </thead>;
}

/** 표 껍데기 — `1a`는 행을, `1k`는 빈 상태를 안에 세운다. */
function TableShell({ children }: { children: ReactNode }) {
  return <div className="border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">{children}</div>;
}

function DiffLine({ sign, parts, before }: { sign: string; parts: readonly { text: string; changed: boolean }[]; before?: boolean }) {
  return <span className="flex gap-2">
    {/* 글리프는 장식이고 뜻은 `sr-only`가 든다 — 낭독에 "All … All actions"만 남으면 어느 쪽이 리포인지 모른다. */}
    <span className="sr-only">{before ? p.beforeLabel : p.afterLabel}</span>
    <span className={`w-2.5 shrink-0 text-xs leading-5 ${before ? "text-red-700" : "text-green-800"}`} aria-hidden>{sign}</span>
    <span className={`min-w-0 flex-1 text-sm leading-5 break-words ${before ? "text-muted-foreground" : ""}`}>
      {parts.map((part, i) => <span key={i} className={!part.changed ? undefined : before ? "text-foreground rounded-[3px] bg-red-700/[0.14]" : "rounded-[3px] bg-green-800/[0.16]"}>{part.text}</span>)}
    </span>
  </span>;
}

function PreviewTable({ preview }: { preview: PublishPreview }) {
  return <TableShell>
    <div className="min-h-0 flex-1 overflow-y-auto">
      <table className="w-full table-fixed border-separate border-spacing-0">
        <TableHead />
        {preview.groups.map(group => <tbody key={`${group.surface}:${group.path}`}>
          <tr>
            <th scope="colgroup" colSpan={3} className="border-border bg-primary-foreground border-b px-3.5 py-[9px] text-left text-xs font-normal">
              <span className="flex items-center gap-2">
                <FileJson2 className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{group.path}</span>
                <span className="text-muted-foreground ml-auto shrink-0">{p.fileSummary(group.changes, group.keys)}</span>
              </span>
            </th>
          </tr>
          {group.rows.map(row => {
            const diff = diffWords(row.before ?? "", row.after);
            const flag = flagFor(row.localeCode);
            const namespace = namespaceOf(row.key);
            return <tr key={`${row.keyId}:${row.localeCode}`}>
              {/* ⚠️ **`rowSpan`이 병합을 든다** — 테두리를 지워 병합처럼 보이게 하면 낭독에는 빈 칸이 하나 더 생긴다. */}
              {row.keySpan > 0 && <td rowSpan={row.keySpan} className="border-divider w-[220px] border-t border-r px-3.5 py-[11px] align-top">
                <span className="block truncate text-xs"><span className="text-muted-foreground">{namespace}</span>{row.key.slice(namespace.length)}</span>
              </td>}
              <td className="border-divider w-[84px] border-t border-r px-3 py-[11px] align-top">
                <span className="flex items-start gap-2">
                  {flag !== null && <img src={`/flags/${flag}.svg`} alt="" className="mt-[5px] h-[11px] w-4 shrink-0 rounded-xs ring-1 ring-foreground/6" />}
                  <span className="text-xs leading-5 font-medium">{row.localeCode}</span>
                </span>
              </td>
              <td className="border-divider border-t px-3.5 py-[11px] align-top">
                <span className="flex items-start gap-2.5">
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    {row.before !== null && <DiffLine sign="−" parts={diff.before} before />}
                    <DiffLine sign="+" parts={diff.after} />
                  </span>
                  {/* ⚠️ 시안은 `#a3a3a3`이지만 그 색은 **본문 금지**다 — 흰 배경 2.6:1로 §7의 3:1 하한을 못 넘고, 저자 이름은 옆의 값이 뜻을 완성해 주지 않는다 (DESIGN §6.2). */}
                  <span className="text-muted-foreground shrink-0 text-xs leading-5">{row.author}</span>
                </span>
              </td>
            </tr>;
          })}
        </tbody>)}
      </table>
      {preview.truncated > 0 && <p className="text-muted-foreground px-3.5 py-[11px] text-xs">{p.truncated(preview.truncated)}</p>}
      {/* 원본 파일이 없어 pull이 안 쓰는 셀 — 표에서 뺐으니 수를 말한다 (launch-readiness L3.7). */}
      {preview.withoutFile > 0 && <p className="text-muted-foreground px-3.5 py-[11px] text-xs">{p.withoutFile(preview.withoutFile)}</p>}
      {preview.withoutKey > 0 && <p className="text-muted-foreground px-3.5 py-[11px] text-xs">{p.withoutKey(preview.withoutKey)}</p>}
    </div>
  </TableShell>;
}

/**
 * ⚠️ **시간 기반이고 사실을 주장하지 않는다** — 진행 이벤트를 내는 API가 없다(시안 §10-2).
 * 그래서 완료 표시가 **무색**이고 `done` 낱말이 없다.
 */
function Progress({ branch }: { branch: string }) {
  const [stage, setStage] = useState(0);
  useEffect(() => { const a = setTimeout(() => setStage(1), 2500); const b = setTimeout(() => setStage(2), 6500); return () => { clearTimeout(a); clearTimeout(b); }; }, []);
  return <ol className="border-border flex shrink-0 flex-col overflow-hidden rounded-lg border">
    {p.progress(branch).map((text, i) => <li key={text} className={`flex items-center gap-3 px-4 py-3.5 ${i === 0 ? "" : "border-divider border-t"}`}>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {i < stage && <Check className="size-4 text-neutral-400" aria-hidden />}
        {i === stage && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      </span>
      <span className={`min-w-0 flex-1 text-sm ${i === stage ? "" : "text-muted-foreground"}`}>{text}</span>
    </li>)}
  </ol>;
}

/** `1g` — 펼친 목록이다(불변식 9). 단위가 **파일**이고 키 이름이 없다 — 경고 문자열에 없다. */
function Warnings({ warnings }: { warnings: readonly string[] }) {
  const groups = summarizeWarnings(warnings);
  return <section className="border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border">
    <div className="border-divider flex shrink-0 items-center gap-2 border-b px-4 py-[11px]">
      <TriangleAlert className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      <h3 className="text-sm font-medium">{p.notWritten}</h3>
      <span className="text-muted-foreground ml-auto shrink-0 text-xs">{p.warnings(warnings.length)}</span>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map((group, i) => group.messages.map((message, j) => <div key={`${i}:${j}`} className="border-divider flex items-start gap-3 border-b px-4 py-[11px]">
        <span className="w-[210px] shrink-0 truncate text-xs leading-5">{j === 0 ? group.file : ""}</span>
        <span className="text-muted-foreground min-w-0 flex-1 text-xs leading-5 whitespace-pre-wrap">{message}</span>
      </div>))}
    </div>
    <p className="text-muted-foreground shrink-0 px-4 py-[11px] text-xs leading-[1.6]">{p.stillHere}</p>
  </section>;
}

function failureText(outcome: Extract<PullOutcome, { status: "failed" }>) {
  if (isAccessError(outcome.error)) return accessErrorMessage(outcome.error);
  if (isOnboardError(outcome.error)) return onboardErrorMessage(outcome.error);
  /*
    ⚠️ **코드가 있는 실패만 서버 문장을 그대로 싣는다** — 그 문장은 `runSync`가 고른 safe 메시지다(DESIGN §6.646).
    코드가 없는 거부의 모르는 문자열은 사람이 읽을 문장이 아니다 (audit #21). `invalid input`은 슬러그가 깨진 것이라
    권한 없음(`forbidden`)으로 옮기면 오역이었다.
  */
  return outcome.code !== undefined ? outcome.error : m.translations.publish.refused;
}

// 절대 시각은 UTC라고 말한다 — 브라우저 로컬을 라벨 없이 내면 참조 코드로 Logs(UTC)와 대조할 때 어긋나 보인다 (launch-readiness L7.1).
const stamp = (at: Date) => <time dateTime={at.toISOString()}>{utcMinute(at)}</time>;

export function PublishModal({ slug, publish, fallbackFocusRef, count, repo, role }: {
  slug: string;
  publish: PublishController;
  fallbackFocusRef: RefObject<HTMLElement | null>;
  /**
   * ⚠️ **`1h`의 복구 버튼이 역할을 탄다** (2026-09-16 사용자). 설정 화면은 `project:settings`라
   * EDITOR가 누르면 거절당한다 — **무반응·거절당하는 버튼은 비활성보다 한 단계 아래다**(Home의
   * 배너 셋·Sync 결과가 이미 같은 형이다). EDITOR에게는 바닥의 "오너에게 전달하라" 한 줄만 남는다.
   */
  role: "OWNER" | "EDITOR";
  /** 미발송 수 — `1a`의 스켈레톤과 `1k`가 조회 전에도 그것을 말한다. */
  count: number;
  /**
   * ⚠️ **호스트가 넘긴다** — 조회가 실패한 갈래(`1k`·`1h`)도 리포 이름을 말해야 하고,
   * 브랜치 이름은 서버가 만든다(그 모듈을 클라이언트가 물면 번들에 octokit·ts-morph가 온다).
   */
  repo: { owner: string; name: string; branch: string; syncBranch: string };
}) {
  const { state, result, runTotal } = publish;
  const label = `${repo.owner}/${repo.name}`;
  let title: string; let body: ReactNode; let description: string | undefined;
  let actions: ReactNode = null; let footer: ReactNode = null; let quiet = false; let panel: string = PANEL.preview;
  /** 본문 안에 자체 스크롤러가 있는가 — 표(`1a`·`1k`)와 경고 목록(`1g`)뿐이다. */
  let inner = true;
  // 실행 거부 둘은 작은 모달이다 — 제목·한 문장·버튼 하나라 큰 패널이면 빈 판이 된다 (2026-09-18 사용자, 옛 512 게이트).
  let alert = false;
  switch (state.kind) {
    case "preview-loading":
      title = p.previewTitle(count); description = p.previewIntro(label); footer = p.changes(count);
      body = <>
        <NoticeSkeleton />
        <TableShell>
          <table className="w-full table-fixed border-separate border-spacing-0"><TableHead /></table>
          <Skeleton className="min-h-0 flex-1 rounded-none" />
        </TableShell>
      </>;
      break;
    case "preview-refused": {
      // ⚠️ **Try again이 없다** — 파일이 생기거나 경로가 고쳐질 때까지 같은 거부다(L3.3). 고칠 곳은 역할이 가른다: Settings는 OWNER에게만 열린다.
      panel = PANEL.configError; inner = false; quiet = true;
      const r = p.baseFileMissing;
      title = r.title; description = r.description(state.path, state.branch); footer = p.notStarted;
      actions = role === "OWNER" ? <a className={buttonClass({ variant: "primary", size: "lg" })} href={routes.settings(slug)}>{p.settings}</a> : null;
      body = <Stack><Alert variant="danger" title={p.wontHelp}>{role === "OWNER" ? r.owner : r.editor}</Alert></Stack>;
      break;
    }
    case "preview-error": {
      panel = PANEL.previewError;
      title = p.previewFailed; description = p.previewFailedDescription(repo.branch); footer = p.notStarted;
      actions = <Button variant="primary" size="lg" onClick={() => void publish.preview()}>{p.retry}</Button>;
      body = <Stack>
        <TableShell>
          <table className="w-full table-fixed border-separate border-spacing-0"><TableHead /></table>
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 px-8 py-6 text-center">
            <FileJson2 className="text-muted-foreground size-5" aria-hidden />
            <p className="text-sm font-medium">{p.previewFailedTitle(repo.branch)}</p>
            <p className="text-muted-foreground max-w-[420px] text-xs leading-[1.7] text-pretty">{p.previewFailedBody(count)}</p>
          </div>
        </TableShell>
        <Hint>{p.previewFailedHint}</Hint>
      </Stack>;
      break;
    }
    case "preview-ready": {
      const data = state.preview;
      const open = data.openPr;
      // ⚠️ **나가는 수로 말한다** (#84 — POSTMORTEM 2026-09-17). 보류(`withoutFile`·`withoutKey`)를 뺀 수가 결과의 `delivered`·Logs와 같은 모집단이다.
      const { total: sending, keys: sendingKeys } = data.sendable;
      const partial = sending < data.total;
      if (sending === 0) {
        // 전부 보류면 PR을 만들거나 바꿀 것이 없다 — 그 버튼을 두지 않고 이유를 말한다. 표의 보류 줄이 사유별로 선다.
        title = p.nothingSendable.title; description = p.nothingSendable.body; footer = p.notStarted;
        actions = <Button variant="primary" size="lg" onClick={publish.close}>{p.close}</Button>;
        body = <PreviewTable preview={data} />;
        break;
      }
      title = p.previewTitle(sending);
      description = `${partial ? p.previewIntroPartial(label) : p.previewIntro(label)} ${p.previewCounts(sending, sendingKeys)}`;
      // ⚠️ **상한을 넘으면 파일 수를 빼고 말한다** — `total`·`keys`는 미발송 전체인데 `groups`는 실린 200행뿐이라, 셋을 나란히 두면 한 줄 안에서 모집단이 갈린다.
      footer = data.truncated > 0 ? p.fileSummary(sending, sendingKeys) : p.previewSummary(sending, sendingKeys, data.groups.length);
      actions = <Button variant="primary" size="lg" onClick={() => void publish.confirm()}>{open ? p.replacePr(open.number) : p.openPr}</Button>;
      body = <>
        {/* ⚠️ **삼상태를 `null`로 접지 않는다** — "없다"와 "모른다"는 다른 줄이다. 줄은 조회 전에도 선다. */}
        {open === undefined
          ? <Notice icon={Info} title={p.prUnknown.title}>{p.prUnknown.body}</Notice>
          : open === null
            ? <Notice icon={GitPullRequestArrow} title={p.prNone.title(label)}>{p.prNone.body(sending)}</Notice>
            : <Notice icon={GitPullRequestArrow} title={p.prOpen.title(open.number)}>{p.prOpen.body(open.number, sending)}</Notice>}
        <PreviewTable preview={data} />
      </>;
      break;
    }
    case "running":
      panel = PANEL.running; inner = false;
      title = p.progressTitle(runTotal || count); description = p.progressDescription; footer = p.leave;
      actions = <Button variant="primary" size="lg" disabled>{p.publishing}</Button>;
      body = <Progress branch={repo.syncBranch} />;
      break;
    case "result": {
      const outcome = state.outcome;
      const view = planPublishView(outcome);
      const at = result?.at ?? null;
      // ⚠️ **성공은 서버가 센 실린 수로 말한다** (delivery-invariants D7) — 미리보기 `total`은 보류를 안 뺀 미발송 전체라, 그 수로 말하면
      // "3 changes are in a pull request" 아래 "1 wasn't sent"가 서는 모순이 된다.
      const total = outcome.status === "committed" ? outcome.delivered : result?.total ?? count;
      const withheld = planWithheldLines(outcome, role).map(line => <p key={line} className="text-muted-foreground text-xs">{line}</p>);
      // ⚠️ **번호를 새로 파싱하지 않는다** — origin·owner/repo 검증까지 `parseGithubPrUrl`이 든다(DESIGN §6.646).
      const number = outcome.status === "committed"
        ? parseGithubPrUrl(outcome.prUrl, { repoOwner: repo.owner, repoName: repo.name })?.number ?? null
        : null;
      const files = outcome.status === "committed" ? outcome.changed.length : 0;
      const viewPr = outcome.status === "committed"
        ? <a className={buttonClass({ variant: "primary", size: "lg" })} href={outcome.prUrl} target="_blank" rel="noreferrer">{p.viewLink}</a>
        : null;
      switch (view) {
        case "created":
          panel = PANEL.created; inner = false;
          title = p.created; description = p.createdDescription(total);
          footer = number === null ? null : p.prMeta(number, files);
          actions = viewPr;
          body = <Stack><PrCard repo={label} number={number} note={p.openedJustNow} />{withheld}<Hint>{p.accessNote}</Hint></Stack>;
          break;
        case "updated":
          panel = PANEL.updated; inner = false;
          title = p.updated; description = number === null ? undefined : p.updatedDescription(number, total);
          footer = number === null ? null : p.prMeta(number, files);
          actions = viewPr;
          body = <Stack>
            <PrCard repo={label} number={number} note={p.holdsEverything} />
            {withheld}
            <Replaced branch={repo.syncBranch} base={repo.branch} />
            {number !== null && <Hint>{p.tellReviewer(number)}</Hint>}
          </Stack>;
          break;
        case "partial": {
          /*
            ⚠️ **보내지 않은 결과다** (sync-edit-protection T10). writer가 값을 버리면 GitHub에 쓰기 전에 멈추므로 PR 카드·브랜치
            교체 줄이 없다 — 있으면 "보냈다"로 읽힌다. 버린 값은 펼친 목록으로 선다(불변식 9). 새 모달 갈래를 늘리지 않고 이 틀을 쓴다.
          */
          panel = PANEL.partial;
          // 보류로 여기 온 결과는 writer가 값을 버린 것이 아니다 — 설명이 갈린다(#83). no-changes + 보류는 다른 편집이 이미 리포와 같았다.
          const reason = outcome.status === "skipped" ? outcome.reason : null;
          title = p.notSent;
          description = reason === "withheld" ? p.withheldDescription.withheld : reason === "no-changes" ? p.withheldDescription.noChanges : p.notSentDescription;
          actions = <Button variant="primary" size="lg" onClick={publish.close}>{p.close}</Button>;
          body = <Stack>
            {outcome.status === "skipped" && outcome.reason === "writer-warnings" && <Warnings warnings={outcome.warnings} />}
            {withheld}
          </Stack>;
          break;
        }
        case "no-changes":
          panel = PANEL.noChanges; inner = false;
          title = p.noChanges; description = p.noChangesDescription;
          actions = <Button variant="primary" size="lg" onClick={publish.close}>{p.close}</Button>;
          body = <Stack>
            <Notice icon={CircleCheck}>{p.noChangesBody(repo.branch)}</Notice>
            {withheld}
            <Hint icon={History}>{p.inLogs}</Hint>
          </Stack>;
          break;
        case "config-error": {
          panel = PANEL.configError; inner = false;
          const failed = outcome.status === "failed" ? outcome : null;
          // 실행 전 거부 다섯은 `SYNC_ERROR_CODES`를 지나지 않아 **실행 행 자체가 안 생긴다** —
          // 그래서 사실 표도 `Reference`도 "Logs에도 있다"도 함께 빠진다.
          const hasCode = failed?.code !== undefined;
          title = hasCode ? p.configError : failed ? failureText(failed) : p.configError;
          description = hasCode ? p.configErrorDescription(label, repo.branch) : undefined;
          footer = failed?.delivery === "unknown" ? p.unknownDelivery : p.notStarted;
          quiet = true;
          actions = hasCode && role === "OWNER"
            ? <a className={buttonClass({ variant: "primary", size: "lg" })} href={routes.settings(slug)}>{p.settings}</a>
            // 세션이 끝난 것은 역할과 무관하다 — 다시 로그인하는 것은 누구나 할 수 있다.
            : failed?.error === "unauthorized"
              ? <a className={buttonClass({ variant: "primary", size: "lg" })} href={routes.signIn()}>{p.signIn}</a>
              : null;
          body = <Stack>
            {/* ⚠️ **서버의 safe 메시지를 버리지 않는다** — 코드만 남기면 "안 된대요"가 "base-unreadable이래요"로 바뀔 뿐이다(DESIGN §6.646). 코드가 없는 갈래는 그 문장이 이미 제목이라 본문을 비운다. */}
            <Alert variant="danger" title={p.wontHelp}>{hasCode && failed ? failureText(failed) : null}</Alert>
            {hasCode && failed && <>
              <div className="border-border grid shrink-0 grid-cols-[130px_1fr] gap-x-3.5 gap-y-2.5 rounded-lg border px-4 py-3.5 text-xs">
                <span className="text-muted-foreground">{p.repository}</span><span>{label}</span>
                <span className="text-muted-foreground">{p.baseBranch}</span><span>{repo.branch}</span>
                <span className="text-muted-foreground">{p.failedAt}</span><span>{at === null ? "" : stamp(at)}</span>
                <span className="text-muted-foreground">{p.reference}</span><span className="text-muted-foreground">{failed.code}</span>
              </div>
              <Hint>{p.sendReference}</Hint>
            </>}
          </Stack>;
          break;
        }
        case "transient-error": {
          panel = PANEL.transientError; inner = false;
          const failed = outcome.status === "failed" ? outcome : null;
          title = p.transientError; description = p.transientErrorDescription;
          footer = failed?.delivery === "unknown" ? p.unknownDelivery : p.notStarted;
          quiet = true;
          actions = <Button variant="primary" size="lg" onClick={() => void publish.preview()}>{p.retry}</Button>;
          body = <Stack>
            <Alert variant="danger">{p.transientErrorBody()}</Alert>
            {/* ⚠️ 응답 유실에는 `Reference`를 만들어 붙이지 않는다 — 코드가 없으면 줄이 통째로 빠진다. */}
            {failed?.code !== undefined && <div className="border-border flex shrink-0 items-center gap-3 rounded-lg border px-4 py-3 text-xs">
              <span className="text-muted-foreground">{p.reference}</span>
              <span>{failed.code}</span>
              {at !== null && <span className="text-muted-foreground ml-auto">{stamp(at)}</span>}
            </div>}
          </Stack>;
          break;
        }
        case "already-running":
          alert = true;
          title = p.alreadyRunning; description = p.alreadyRunningBody;
          actions = <Button variant="primary" onClick={publish.close}>{p.close}</Button>;
          body = null;
          break;
        case "too-soon": {
          alert = true;
          const seconds = outcome.status === "failed" ? outcome.retryAfterSeconds ?? 0 : 0;
          title = p.tooSoon; description = p.tooSoonBody;
          /*
            ⚠️ **시안은 이 버튼을 꺼 두지만 살려 둔다** — 카운트다운을 안 넣기로 한 이상(열린 결정 3)
            꺼진 버튼은 스스로 풀리지 않아 "18초 뒤에 다시 하라"는 라벨이 영영 못 지키는 약속이 된다.
            라벨이 시키는 것을 화면이 실제로 할 수 있어야 한다.
          */
          actions = <Button variant="primary" onClick={() => void publish.preview()}>{p.wait(seconds)}</Button>;
          body = null;
          break;
        }
        default: { const exhaustive: never = view; return exhaustive; }
      }
      break;
    }
    default: { const exhaustive: never = state; return exhaustive; }
  }
  if (alert) {
    return <Dialog open={publish.open} onOpenChange={next => { if (!next) publish.close(); }}>
      <DialogContent title={title} description={description} footer={actions}
        // 큰 껍데기와 같은 복귀 규칙 — 호출 버튼, 사라졌으면 호스트 제목.
        onCloseAutoFocus={event => {
          event.preventDefault();
          const target = publish.triggerRef.current;
          if (target?.isConnected && !target.matches(":disabled")) target.focus();
          else fallbackFocusRef.current?.focus();
        }} />
    </Dialog>;
  }
  return <OnboardingModal open={publish.open} onClose={publish.close} title={title} description={description} closeLabel={m.common.close}
    footer={footer} actions={actions} transitionKey={state.kind} quiet={quiet} returnFocusRef={publish.triggerRef} fallbackFocusRef={fallbackFocusRef}
    /* ⚠️ **안쪽 스크롤러가 있는 갈래만 `hidden`이다** — 나머지는 `shrink-0` 블록만 쌓아서, 낮은 뷰포트에서 잠그면 마지막 줄에 스크롤로도 못 닿는다. */
    panelClassName={panel} bodyScroll={inner ? "hidden" : "auto"}>{body}</OnboardingModal>;
}
