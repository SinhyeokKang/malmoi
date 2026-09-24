"use client";

import { Check, ChevronRight, FileJson2, Link2 } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import { LocaleBadge } from "@/components/translations/locale-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { localeTextAttrs } from "@/lib/translations/text-direction";
import { m } from "@/lib/i18n";
import { keyEditCommand, type KeyDraftState } from "@/lib/translations/draft";
import { MISSING_LANGUAGES } from "@/lib/translations/query";
import { cn } from "@/lib/utils";

import { FilterMenu } from "./filter-menu";
import { Pill } from "./key-list";

/**
 * 선택 키의 로케일 상세 (핸드오프 `2a` · `2d` · `2j`). **고정 블록**(키 이름 · N of M · 설명 · 코드 위치)과 저장 푸터는 스크롤하지 않고,
 * 입력 목록만 흐른다.
 *
 * ⚠️ **빈 칸의 회색 원문은 도움말이지 값도 placeholder도 아니다** — 입력의 형제이고 `aria-describedby`로 묶여 선택·복사할 수 있다.
 * 점선은 **지금 입력이 비어 있다**를 뜻한다(저장 여부와 독립).
 * ⚠️ **Enter는 줄바꿈**, Ctrl/Cmd+Enter가 키 저장, Escape는 그 입력만 되돌린다. blur·Tab은 저장하지 않는다.
 * ⚠️ **수는 저장된 값만 센다** — 입력 중에는 `N of M languages`가 움직이지 않는다.
 */
export type DetailView = {
  key: { id: string; key: string; namespace: string; sourceText: string; description: string | null; surfaceSlug: string };
  refs: { path: string; line: number; href: string | null }[];
  locales: { code: string; isBase: boolean; value: string | null; needsReview: boolean; pending: boolean; actorLabel: string | null }[];
};

export function LocalePanel({ detail, draft, language, onLanguage, onEdit, onReset, onSave, copyHref, readOnly, footer, invalid }: {
  detail: DetailView;
  draft: KeyDraftState;
  language: string | undefined;
  onLanguage: (value: string | undefined) => void;
  onEdit: (code: string, value: string) => void;
  onReset: (code: string) => void;
  onSave: () => void;
  copyHref: string;
  readOnly: boolean;
  footer: ReactNode;
  /** 저장 거부가 가리키는 로케일과 그 사유(푸터 Alert)의 id. 셀 옆에 새 패턴을 만들지 않는다 — 이유는 푸터 한 곳에 선다(delivery-invariants D2). */
  invalid?: { locales: readonly string[]; describedBy: string };
}) {
  const w = m.translations.workspace.detail;
  const filled = detail.locales.filter(l => l.value !== null && l.value !== "").length;
  const total = detail.locales.length;
  const base = detail.locales.find(l => l.isBase)?.code;
  // 언어 필터는 **보이는 행만** 거른다 — Save·Revert 대상은 여전히 전 언어의 draft·pending이다.
  const visible = detail.locales.filter(l => {
    if (language === undefined || l.isBase) return true;
    if (language === MISSING_LANGUAGES) return l.value === null || l.value === "";
    return l.code === language;
  });
  const languageLabel = language === undefined ? w.allLanguages : language === MISSING_LANGUAGES ? w.missingOnly : language;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-[53px] shrink-0 items-center gap-2 px-4">
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
          <FileJson2 className="size-4 shrink-0" aria-hidden />
          {detail.key.surfaceSlug}
          <ChevronRight className="size-3.5 shrink-0 text-neutral-400" aria-hidden />
          <span className="text-foreground min-w-0 truncate font-medium">{detail.key.namespace}</span>
        </span>
        <span className="ml-auto">
          <FilterMenu
            axis={w.languagesGroup}
            label={languageLabel}
            on={language !== undefined}
            size="sm"
            value={language ?? ""}
            options={[
              { value: "", label: w.allLanguages },
              { value: MISSING_LANGUAGES, label: w.missingOnly },
              ...detail.locales.filter(l => !l.isBase).map(l => ({ value: l.code, label: l.code, group: w.languagesGroup })),
            ]}
            onSelect={value => onLanguage(value === "" ? undefined : value)}
          />
        </span>
      </div>
      <div className="border-divider flex min-h-0 flex-1 flex-col overflow-hidden border-t">
        <div className="border-divider flex shrink-0 flex-col gap-1 border-b px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="min-w-0 flex-1 text-base font-medium [overflow-wrap:anywhere]">{detail.key.key}</span>
            <span className={cn("shrink-0 text-xs", filled < total ? "text-amber-700" : "text-muted-foreground")}>{w.languages(filled, total)}</span>
            <CopyLink href={copyHref} />
          </div>
          <span className="text-muted-foreground text-xs leading-normal">
            {detail.key.description ?? w.noDescription}
            {detail.refs[0] !== undefined && (
              <>
                {" · "}
                {detail.refs[0].href === null
                  ? <span title={w.noCommit}>{`${detail.refs[0].path}:${detail.refs[0].line}`}<span className="sr-only">{` (${w.noCommit})`}</span></span>
                  : <a href={detail.refs[0].href} target="_blank" rel="noreferrer" className="text-blue-600">{`${lastSegment(detail.refs[0].path)}:${detail.refs[0].line}`}</a>}
                {/* ⚠️ `title`만으로는 hover에서만 읽힌다 (audit #38) — 같은 문장을 sr-only로 겹친다. 보이는 `+N`은 숨긴다(두 번 읽힌다). */}
                {detail.refs.length > 1 && <span title={w.referenced(detail.refs.length)}><span aria-hidden>{` +${detail.refs.length - 1}`}</span><span className="sr-only">{` · ${w.referenced(detail.refs.length)}`}</span></span>}
              </>
            )}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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

function lastSegment(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function LocaleRow({ keyName, sourceText, sourceCode, locale, first, draft, saved, sending, readOnly, isBase, invalidBy, onEdit, onReset, onSave }: {
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
  isBase: boolean;
  invalidBy?: string;
  onEdit: (value: string) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const w = m.translations.workspace.detail;
  const helpId = useId();
  const dirty = draft !== saved;
  const missing = locale.value === null || locale.value === "";
  const empty = draft === "";
  const field = (
    <Textarea
      data-locale={locale.code}
      /* ⚠️ 값이 자기 언어의 방향으로 선다 (malmoi#91) — 페이지의 `ltr`·`lang="en"`을 상속하면 RTL 값의 중립 문자가 반대 끝으로 튄다. */
      {...localeTextAttrs(locale.code)}
      rows={2}
      value={draft}
      readOnly={readOnly}
      aria-label={m.translations.cellLabel(keyName, locale.code)}
      aria-invalid={invalidBy === undefined ? undefined : true}
      aria-describedby={[empty ? helpId : undefined, invalidBy].filter(Boolean).join(" ") || undefined}
      placeholder=""
      onChange={event => onEdit(event.target.value)}
      onKeyDown={event => {
        const command = keyEditCommand({
          key: event.key, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey,
          isComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode,
        });
        if (command === null) return;
        event.preventDefault();
        if (command === "save") onSave();
        else onReset();
      }}
      className={cn(
        // ⚠️ `w-full`이 필요하다 — 프리미티브의 `field-sizing-content`가 폭까지 내용에 맞춰 줄인다(실측 473 → 269).
        "w-full rounded-md text-sm leading-[1.55]",
        // 빈 칸은 입력이 점선 상자 안쪽 전체다 — 어디를 눌러도 커서가 서고, 원문이 그 첫 줄 자리에 겹친다.
        empty ? "col-start-1 row-start-1 min-h-[42px] border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" : "min-h-[62px] px-2.5 py-2.5",
      )}
    />
  );
  return (
    <div className={cn("flex shrink-0 flex-col gap-2 px-4 py-3", !first && "border-border border-t")}>
      <div className="flex items-center gap-2">
        <LocaleBadge code={locale.code} orphaned={false} />
        {isBase && <span className="text-muted-foreground text-xs">{w.source}</span>}
        <span className="ml-auto flex items-center gap-2">
          {/* ⚠️ 전송 중인 셀은 "Not saved"가 아니다 (audit-ux #20) — 버튼 스피너만으로는 어느 셀이 가는 중인지 모른다. */}
          {dirty && sending
            ? <span className="text-muted-foreground text-xs">{w.saving}</span>
            : dirty
            ? <span className="text-xs text-amber-700">{w.notSaved}</span>
            : missing && <span className="text-xs text-amber-700">{w.missing}</span>}
          {locale.needsReview && !missing && <span className="text-xs text-amber-700">{m.translations.workspace.list.needsReview}</span>}
          {locale.pending && <Pill>{m.translations.workspace.list.notSent}</Pill>}
        </span>
      </div>
      {/*
        ⚠️ **래퍼를 항상 그린다** — 빈 칸에서 첫 글자를 치는 순간 트리 모양이 바뀌면 textarea가 다시 마운트되어 포커스를 잃는다
        (구현 중 DOM 테스트가 잡았다). 비어 있으면 래퍼가 점선이고 포커스 링은 래퍼가 든다.
        ⚠️ **원문은 입력 첫 줄 자리에 겹친다** — 아래 형제로 두면 빈 입력줄 밑에 붙어 "플레이스홀더가 아래에 있다"로 읽혔다(사용자 지적).
        `placeholder` 속성이 아니라 겹친 span인 이유: 접근 이름과 따로 `aria-describedby`로 읽혀야 하고, 포인터를 가로채지 않아야 한다.
        absolute가 아니라 grid 한 칸에 쌓는다 — 원문이 여러 줄이면 상자가 그 높이를 따라야 다음 행을 덮지 않는다.
      */}
      <div className={cn(empty && "has-[textarea:focus-visible]:ring-ring grid min-h-[62px] rounded-md border border-dashed border-neutral-300 p-2.5 has-[textarea:focus-visible]:ring-2")}>
        {field}
        {empty && <span id={helpId} {...(sourceCode === undefined ? { dir: "auto" } : localeTextAttrs(sourceCode))} className="text-muted-foreground pointer-events-none col-start-1 row-start-1 text-sm leading-[1.55]">{sourceText}</span>}
      </div>
    </div>
  );
}

/** 키 이름 블록 우측 28 버튼 (`2j`). 성공은 같은 자리에서 `Copied` 2초, 실패는 선택된 읽기 전용 주소 입력이다 — 토스트를 쓰지 않는다. */
function CopyLink({ href }: { href: string }) {
  const w = m.translations.workspace.detail;
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const url = typeof window === "undefined" ? href : new URL(href, window.location.origin).toString();
  useEffect(() => {
    if (state === "copied") { const timer = setTimeout(() => setState("idle"), 2000); return () => clearTimeout(timer); }
    return undefined;
  }, [state]);
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {/* 실패하면 주소를 **선택된 채로** 준다 — 손으로 복사할 수 있어야 한다. */}
      {state === "failed" && <Input autoFocus readOnly value={url} aria-label={w.copyFailed} onFocus={event => event.currentTarget.select()} className="h-7 w-48 text-xs" />}
      <Button
        size="sm"
        // ⚠️ 복사된 동안은 이름을 비운다 (audit #39 · WCAG 2.5.3) — 보이는 `Copied`를 `Copy link`가 덮었다.
        aria-label={state === "copied" ? undefined : w.copyLink}
        onClick={() => {
          if (navigator.clipboard === undefined) { setState("failed"); return; }
          navigator.clipboard.writeText(url).then(() => setState("copied"), () => setState("failed"));
        }}
        className="h-7 min-w-7 gap-1 px-1.5"
      >
        {state === "copied" ? <><Check className="size-3.5" aria-hidden />{w.copied}</> : <Link2 className="size-3.5 text-neutral-600" aria-hidden />}
      </Button>
    </span>
  );
}
