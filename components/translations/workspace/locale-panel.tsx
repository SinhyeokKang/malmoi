"use client";
import { Link as InlineLink } from "@/components/ui/link";
import { ChevronRight, FileJson2 } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";

import { LocaleBadge } from "@/components/translations/locale-badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { localeTextAttrs } from "@/lib/translations/text-direction";
import { useMessages, useUiLocale } from "@/components/i18n/messages-provider";
import { formatNumber } from "@/lib/number-format";
import { keyEditCommand, type KeyDraftState } from "@/lib/translations/draft";
import { MISSING_LANGUAGES } from "@/lib/translations/query";
import { detailFill } from "@/lib/translations/summary";
import { cn } from "@/lib/utils";

import { OptionsFilterMenu } from "./filter-menu";

/**
 * 선택 키의 로케일 상세 (핸드오프 `2a` · `2d` · `2j`). **고정 블록**(키 이름 · N of M · 설명 · 코드 위치)과 저장 푸터는 스크롤하지 않고,
 * 입력 목록만 흐른다.
 *
 * ⚠️ **빈 칸의 회색 원문은 도움말이지 값도 placeholder도 아니다** — 입력의 형제이고 `aria-describedby`로 묶여 선택·복사할 수 있다.
 * 점선은 **지금 입력이 비어 있다**를 뜻한다(저장 여부와 독립).
 * ⚠️ **Enter는 줄바꿈**, Ctrl/Cmd+Enter가 키 저장, Escape는 그 입력만 되돌린다. blur·Tab은 저장하지 않는다.
 * ⚠️ **수는 저장된 값만 센다** — 입력 중에는 `N of M languages`가 움직이지 않는다.
 * ⚠️ **제거 예정 언어(`readOnly`)는 분모에서 빠지고 칸이 얼는다** (locale-add 시안 T1) — 미저장 입력은 남고 그 아래 이유와 `Discard change`가 선다.
 */
export type DetailView = {
  key: { id: string; key: string; namespace: string; sourceText: string; description: string | null; surfaceSlug: string };
  refs: { path: string; line: number; href: string | null }[];
  /** `readOnly` — 제거 예정 언어(`loadTranslationDetail`). 값은 보이되 편집·저장에서 빠진다(셀 얼리기 — draft의 `readOnly`가 같은 목록을 든다). */
  locales: { code: string; isBase: boolean; readOnly: boolean; value: string | null; needsReview: boolean; pending: boolean; actorLabel: string | null }[];
};

/**
 * 상세 머리의 경로(소스 › 네임스페이스) — 머리 줄 자체는 Workspace가 든다(responsive-app design §3): 골격 · 상세 · 부재 안내가 바뀌어도 머리의 제목이
 * **같은 노드**여야 단일 판의 진입 착지가 응답 도착에 끊기지 않는다.
 */
export function DetailCrumb({ surfaceSlug, namespace }: { surfaceSlug: string; namespace?: string }) {
  return <>
    {/*
      ⚠️ **경로 칸(h2 — `@container/crumb`)이 84px 미만이면 장식 아이콘이 숨는다** (#228 QA2) — es 375의 경로 칸은 64px라 아이콘 16 + 간격이 소스 › 폴더의
      자리를 먹어 소스가 0px로 사라졌다. 아이콘은 `aria-hidden` 장식이라 숨겨도 뜻이 같다. 84 = 아이콘 16 + 간격 6 + 두 하한 2ch + 구분자 14 + 간격 12 근처.
    */}
    <FileJson2 className="size-4 shrink-0 @max-[84px]/crumb:hidden" aria-hidden />
    {/*
      ⚠️ **좁으면 폴더가 먼저 줄고 2ch는 남긴다 — 그다음에 소스 이름이 2ch까지 준다** (#228 · 시안 `web › ch…`). flex는 줄어드는 몫을 `shrink × 기본 폭`으로 나누므로
      폴더에 무게(`shrink-[100]`)를 실어 먼저 줄이고, 폴더가 바닥에 닿으면 남은 부족분이 소스로 간다. 하한 2ch는 "한 글자 + …"의 폭이다 — 소스를 `shrink-0`으로
      묶거나(es에서 폴더가 칸 밖으로 밀려 잘렸다) 폴더 하한을 3ch로 두면(es 64px에 고정 최소 76) 어느 한쪽이 사라졌다(재실측 두 번).
    */}
    <span className={namespace === undefined ? "text-foreground min-w-0 truncate font-medium" : "min-w-[2ch] truncate"}>{surfaceSlug}</span>
    {namespace !== undefined && <>
      <ChevronRight className="size-3.5 shrink-0 text-gray-dim" aria-hidden />
      <span className="text-foreground min-w-[2ch] shrink-[100] truncate font-medium">{namespace}</span>
    </>}
  </>;
}

/** 상세 머리 오른쪽 끝의 언어 메뉴 — 보이는 행만 거른다(Save·Revert 대상은 전 언어다). */
export function LanguageMenu({ detail, language, locked = false, onLanguage }: {
  detail: DetailView;
  language: string | undefined;
  /**
   * 이동을 기다리는 동안 언어 메뉴를 잠근다 (U3 리뷰 r1) — 언어는 `history.replaceState`로 바뀌고 Next 16.3에서 그것이 대기 중인 이동을
   * 버린다. 입력의 읽기 전용 잠금(`readOnly`)은 이 메뉴를 덮지 않는다.
   */
  locked?: boolean;
  onLanguage: (value: string | undefined) => void;
}) {
  const m = useMessages();
  const w = m.translations.workspace.detail;
  const languageLabel = language === undefined ? w.allLanguages : language === MISSING_LANGUAGES ? w.missingOnly : language;
  return (
    <OptionsFilterMenu
      axis={w.languagesGroup}
      label={languageLabel}
      on={language !== undefined}
      size="sm"
      // 머리 오른쪽 끝이다 — 끝 정렬이어야 메뉴가 화면 밖으로 나가지 않는다(2026-10-02).
      align="end"
      disabled={locked}
      value={language ?? ""}
      options={[
        { value: "", label: w.allLanguages },
        { value: MISSING_LANGUAGES, label: w.missingOnly },
        ...detail.locales.filter(l => !l.isBase).map(l => ({ value: l.code, label: l.code, group: w.languagesGroup })),
      ]}
      onSelect={value => onLanguage(value === "" ? undefined : value)}
    />
  );
}

/** 상세 머리를 뺀 몸통 — 키 블록 · 입력 목록 · 저장 푸터. */
export function LocalePanel({ detail, draft, language, onEdit, onReset, onSave, copyHref, readOnly, footer, invalid }: {
  detail: DetailView;
  draft: KeyDraftState;
  language: string | undefined;
  onEdit: (code: string, value: string) => void;
  onReset: (code: string) => void;
  onSave: () => void;
  copyHref: string;
  readOnly: boolean;
  footer: ReactNode;
  /** 저장 거부가 가리키는 로케일과 그 사유(푸터 Alert)의 id. 셀 옆에 새 패턴을 만들지 않는다 — 이유는 푸터 한 곳에 선다(delivery-invariants D2). */
  invalid?: { locales: readonly string[]; describedBy: string };
}) {
  const m = useMessages();
  const uiLocale = useUiLocale();
  const w = m.translations.workspace.detail;
  const { filled, total } = detailFill(detail.locales);
  const base = detail.locales.find(l => l.isBase)?.code;
  // 언어 필터는 **보이는 행만** 거른다 — Save·Revert 대상은 여전히 전 언어의 draft·pending이다.
  const visible = detail.locales.filter(l => {
    if (language === undefined || l.isBase) return true;
    if (language === MISSING_LANGUAGES) return l.value === null || l.value === "";
    return l.code === language;
  });

  return (
    /*
      ⚠️ **낮은 높이(520 미만)에서는 줄지 않고 흐른다 — 폭과 무관하다** (#236 · O21 확장) — 그때는 카드가 스크롤 칸이고(`workspace.tsx` `LOW_DETAIL_SCROLL`) 이 세 겹이 내용 높이를
      그대로 쓴다. 보통 높이는 키 블록·저장 줄이 고정이고 언어 목록만 스크롤한다.
    */
    <div className="flex min-h-0 min-w-0 flex-1 flex-col [@media(max-height:519px)]:flex-none">
      <div className="border-divider flex min-h-0 flex-1 flex-col overflow-hidden border-t [@media(max-height:519px)]:flex-none [@media(max-height:519px)]:overflow-visible">
        <div className="border-divider flex shrink-0 flex-col gap-1 border-b px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="min-w-0 flex-1 text-base font-medium wrap-anywhere">{detail.key.key}</span>
            <span className="text-muted-foreground shrink-0 text-xs">{w.languages(filled, total)}</span>
            <CopyLink href={copyHref} />
          </div>
          <span className="text-muted-foreground text-xs leading-normal">
            {detail.key.description ?? w.noDescription}
            {detail.refs[0] !== undefined && (
              <>
                {" · "}
                {detail.refs[0].href === null
                  ? <span title={w.noCommit}>{`${detail.refs[0].path}:${detail.refs[0].line}`}<span className="sr-only">{` (${w.noCommit})`}</span></span>
                  : <InlineLink href={detail.refs[0].href} target="_blank" rel="noreferrer">{`${lastSegment(detail.refs[0].path)}:${detail.refs[0].line}`}</InlineLink>}
                {/* ⚠️ `title`만으로는 hover에서만 읽힌다 (audit #38) — 같은 문장을 sr-only로 겹친다. 보이는 `+N`은 숨긴다(두 번 읽힌다). */}
                {detail.refs.length > 1 && <span title={w.referenced(detail.refs.length)}><span aria-hidden>{` +${formatNumber(detail.refs.length - 1, uiLocale)}`}</span><span className="sr-only">{` · ${w.referenced(detail.refs.length)}`}</span></span>}
              </>
            )}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [@media(max-height:519px)]:flex-none [@media(max-height:519px)]:overflow-visible">
          {visible.map((locale, index) => (
            <LocaleRow
              key={locale.code}
              keyName={detail.key.key}
              sourceText={detail.key.sourceText}
              locale={locale}
              first={index === 0}
              draft={draft.draft[locale.code] ?? ""}
              saved={draft.saved[locale.code] ?? ""}
              sending={draft.inFlight !== undefined && Object.hasOwn(draft.inFlight.sent, locale.code) && draft.inFlight.sent[locale.code] === draft.draft[locale.code]}
              readOnly={readOnly}
              frozen={draft.readOnly.includes(locale.code)}
              isBase={locale.code === base}
              sourceCode={base}
              invalidBy={invalid?.locales.includes(locale.code) ? invalid.describedBy : undefined}
              onEdit={value => onEdit(locale.code, value)}
              onReset={() => onReset(locale.code)}
              onSave={onSave}
            />
          ))}
        </div>
        {footer}
      </div>
    </div>
  );
}

/**
 * 다른 키의 상세를 기다리는 동안의 골격 — 머리 · 키 블록 · 언어 셋 · 푸터가 실물 치수다(DESIGN §6.64 로딩 행 — 도착 때 안 움직인다).
 * 언어 수는 모르므로 가장 흔한 셋이다.
 */
export function LocalePanelSkeleton({ head = true }: {
  /** 작업 화면 안에서는 `false`다 — 머리 줄은 Workspace가 직접 든다(진입 착지의 제목이 같은 노드여야 한다). */
  head?: boolean;
}) {
  return (
    <div data-skeleton-detail className="flex min-h-0 min-w-0 flex-1 flex-col">
      {head && (
        <div className="flex h-12 shrink-0 items-center gap-2 px-4">
          <DetailHeadSkeleton />
        </div>
      )}
      <div className="border-divider flex min-h-0 flex-1 flex-col overflow-hidden border-t">
        <div className="border-divider flex shrink-0 flex-col gap-1 border-b px-4 py-3.5">
          <div className="flex h-7 items-center gap-2.5">
            {/* ⚠️ 비율 폭은 부모 폭이 있어야 선다 — flex 행의 `Skeleton`은 내용 폭이라 `flex-1`이 없으면 0으로 접힌다. */}
            <div className="min-w-0 flex-1"><Skeleton size="md" className="w-[45%]" /></div>
            <Skeleton className="ml-auto h-3 w-20 rounded-md" />
            <Skeleton className="size-7 shrink-0 rounded-sm" />
          </div>
          <Skeleton size="xs" className="w-[60%]" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {[0, 1, 2].map(i => (
            <div key={i} className={cn("flex shrink-0 flex-col gap-2 px-4 py-3", i > 0 && "border-border border-t")}>
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-[62px] w-full rounded-md" />
            </div>
          ))}
        </div>
        <div className="border-border flex shrink-0 items-center gap-3 border-t px-4 py-3">
          <Skeleton size="xs" className="w-24" />
          <Skeleton className="ml-auto h-9 w-16 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** 상세 머리의 골격 조각 — 경로와 언어 메뉴 자리. */
function DetailHeadSkeleton() {
  return <>
    <Skeleton className="size-4 shrink-0 rounded" />
    <Skeleton size="sm" className="w-32" />
    <Skeleton className="ml-auto h-7 w-28 rounded-md" />
  </>;
}

function lastSegment(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function LocaleRow({ keyName, sourceText, sourceCode, locale, first, draft, saved, sending, readOnly, frozen, isBase, invalidBy, onEdit, onReset, onSave }: {
  keyName: string;
  sourceText: string;
  /** 겹친 원문의 언어 — 셀이 아니라 base의 방향을 든다. */
  sourceCode: string | undefined;
  locale: DetailView["locales"][number];
  first: boolean;
  draft: string;
  saved: string;
  /** 이 셀의 지금 입력이 전송 중인 요청에 실려 있다 — 보낸 뒤 더 친 입력은 아니다(`draft`와 `inFlight.sent`가 같을 때만). */
  sending: boolean;
  readOnly: boolean;
  /** 제거 예정 언어로 얼린 칸 — 편집만 막는다. Escape·`Discard change`(둘 다 `onReset`)는 그 입력을 버릴 수 있다. */
  frozen: boolean;
  isBase: boolean;
  invalidBy?: string;
  onEdit: (value: string) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const m = useMessages();
  const w = m.translations.workspace.detail;
  const helpId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const dirty = draft !== saved;
  const missing = locale.value === null || locale.value === "";
  const empty = draft === "";
  const field = (
    <Textarea
      ref={fieldRef}
      data-locale={locale.code}
      /* ⚠️ 값이 자기 언어의 방향으로 선다 (malmoi#91) — 페이지의 `ltr`·`lang="en"`을 상속하면 RTL 값의 중립 문자가 반대 끝으로 튄다. */
      {...localeTextAttrs(locale.code)}
      rows={2}
      value={draft}
      readOnly={readOnly || frozen}
      aria-label={m.translations.cellLabel(keyName, locale.code)}
      // ⚠️ 얼림은 입력 오류가 아니다 (#274) — 저장 거부 뒤에도 얼린 칸은 빨간 테두리를 들지 않는다. 거부 사실은 푸터 Alert와 이유 줄이 말한다.
      aria-invalid={invalidBy === undefined || frozen ? undefined : true}
      aria-describedby={[empty ? helpId : undefined, invalidBy].filter(Boolean).join(" ") || undefined}
      placeholder=""
      onChange={event => onEdit(event.target.value)}
      onKeyDown={event => {
        const command = keyEditCommand(event.nativeEvent);
        if (command === null) return;
        event.preventDefault();
        if (command === "save") onSave();
        else onReset();
      }}
      className={cn(
        // ⚠️ `w-full`이 필요하다 — 프리미티브의 `field-sizing-content`가 폭까지 내용에 맞춰 줄인다(실측 473 → 269).
        "w-full rounded-md text-sm leading-translation",
        // 빈 칸은 입력이 점선 상자 안쪽 전체다 — 어디를 눌러도 커서가 서고, 원문이 그 첫 줄 자리에 겹친다.
        empty ? "col-start-1 row-start-1 min-h-[42px] border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" : "min-h-[62px] px-2.5 py-2.5",
        // 얼린 칸은 잠긴 값이다(시안 T1 ①·②′) — muted 면 + 일반 테두리. 프리미티브는 `disabled:`만 칠해 호출부가 든다.
        frozen && !empty && "bg-muted border-border",
      )}
    />
  );
  return (
    <div className={cn("flex shrink-0 flex-col gap-2 px-4 py-3", !first && "border-border border-t")}>
      <div className="flex items-center gap-2">
        <LocaleBadge code={locale.code} orphaned={false} />
        {isBase && <span className="text-muted-foreground text-xs">{w.source}</span>}
        {/* 제거 중 언어 — 언어 배지 바로 옆(시안 T1). 미저장이 없는 얼린 칸에는 이것이 유일한 설명이다. */}
        {frozen && <StatusBadge state="removing" className="shrink-0" />}
        <span className="ml-auto flex items-center gap-2">
          {/* ⚠️ 전송 중인 셀은 "Not saved"가 아니다 (audit-ux #20) — 버튼 스피너만으로는 어느 셀이 가는 중인지 모른다. */}
          {dirty && sending
            ? <span className="text-muted-foreground text-xs">{w.saving}</span>
            : dirty
            ? <span className="text-warning-foreground text-xs">{w.notSaved}</span>
            : missing && <span className="text-muted-foreground text-xs">{w.missing}</span>}
          {locale.needsReview && !missing && <span className="text-warning-foreground text-xs">{m.translations.workspace.list.needsReview}</span>}
          {locale.pending && <StatusBadge state="unsent" className="shrink-0" />}
        </span>
      </div>
      {/*
        ⚠️ **래퍼를 항상 그린다** — 빈 칸에서 첫 글자를 치는 순간 트리 모양이 바뀌면 textarea가 다시 마운트되어 포커스를 잃는다
        (구현 중 DOM 테스트가 잡았다). 비어 있으면 래퍼가 점선이고 포커스 링은 래퍼가 든다.
        ⚠️ **원문은 입력 첫 줄 자리에 겹친다** — 아래 형제로 두면 빈 입력줄 밑에 붙어 "플레이스홀더가 아래에 있다"로 읽혔다(사용자 지적).
        `placeholder` 속성이 아니라 겹친 span인 이유: 접근 이름과 따로 `aria-describedby`로 읽혀야 하고, 포인터를 가로채지 않아야 한다.
        absolute가 아니라 grid 한 칸에 쌓는다 — 원문이 여러 줄이면 상자가 그 높이를 따라야 다음 행을 덮지 않는다.
      */}
      <div className={cn(empty && "has-[textarea:focus-visible]:ring-ring grid min-h-[62px] rounded-md border border-dashed border-gray-light p-2.5 has-[textarea:focus-visible]:ring-2", empty && frozen && "bg-muted")}>
        {field}
        {empty && <span id={helpId} {...(sourceCode === undefined ? { dir: "auto" } : localeTextAttrs(sourceCode))} className="text-muted-foreground pointer-events-none col-start-1 row-start-1 text-sm leading-translation">{sourceText}</span>}
      </div>
      {/*
        얼린 칸의 미저장 입력은 이유와 버리는 길이 한 줄로 선다 (시안 T1) — `Revert to last sent`는 이 칸에 거부되므로(`locale-removal-pending`)
        버리는 길은 이것 하나다. 깨끗한 얼린 칸은 버릴 것이 없어 이 줄이 없다.
      */}
      {frozen && dirty && (
        <div className="flex items-start gap-3">
          <span className="text-muted-foreground min-w-0 flex-1 text-xs leading-normal">{w.frozenReason(locale.code)}</span>
          {/* 누른 버튼이 이 클릭으로 사라진다 — 포커스가 body로 빠지지 않게 그 칸으로 옮긴다. */}
          <Button size="sm" className="shrink-0" disabled={readOnly} onClick={() => { onReset(); fieldRef.current?.focus(); }}>{w.discardChange}</Button>
        </div>
      )}
    </div>
  );
}

/** 키 이름 블록 우측 28 버튼 (`2j`). 성공은 같은 자리에서 `Copied` 2초, 실패는 선택된 읽기 전용 주소 입력이다 — 토스트를 쓰지 않는다. */
function CopyLink({ href }: { href: string }) {
  const m = useMessages();
  const url = typeof window === "undefined" ? href : new URL(href, window.location.origin).toString();
  return <CopyButton value={url} label={m.translations.workspace.detail.copyLink} variant="link" />;
}
