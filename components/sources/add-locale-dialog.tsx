"use client";
import { FilePlus2 } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { addSourceLocale, previewSourceLocaleAdd } from "@/app/(edit)/projects/[slug]/sources/actions";
import { useMessages, useUiLocale } from "@/components/i18n/messages-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxGroup } from "@/components/ui/combobox";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { FormGroup } from "@/components/ui/form-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { LocaleFlag } from "@/components/translations/locale-badge";
import type { Messages } from "@/lib/i18n";
import { localeCollisionKey } from "@/lib/locales/add-plan";
import { CHROME_LOCALE_CODES } from "@/lib/locales/chrome-codes";
import { looksLikeCodeInput, matchesLanguage, nameKey, presetCodes, presetSeparator } from "@/lib/locales/presets";
import { languageName } from "@/lib/onboarding/language-name";
import type { SourceDetail } from "@/lib/sources/query";

type Language = SourceDetail["languages"][number];
type Check =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; action: "create" | "revive"; path: string; revive: number }
  /** 필드 자리 — "이 값을 고쳐라"(시안 A2). 파일 블록은 걷힌다. */
  | { kind: "field"; text: string }
  /** 미리보기 장애 — 다시 받을 수 있다. */
  | { kind: "failed" }
  /** Dialog 수준 — "지금 이 동작이 안 된다"(시안 A3 ②). */
  | { kind: "refused"; text: string };
export type AddOutcome = { kind: "added"; code: string; action: "create" | "revive"; reissued: number } | { kind: "lost"; code: string };

/** 치는 동안 미리보기를 부르기 전 쉼 — 한 글자마다 서버를 부르지 않는다. 고른 값은 기다리지 않는다. */
const TYPING_PAUSE_MS = 250;
/** 한 번에 하나만 열리는 Dialog라 고정 id다 — Select 트리거의 `aria-labelledby`가 같은 파일의 선언을 가리켜야 한다(`combobox-name.test.ts`). */
const FIELD_ID = "add-locale-code";
const FIELD_ERRORS = new Set(["invalid-code", "unsupported-locale", "already-active", "locale-collision", "unsafe-path", "path-conflict", "removal-pending"]);

/**
 * **언어 추가 Dialog** (locale-add E1 — 시안 A1–A5). json은 프리셋 + 자유 입력 칸(`Combobox`), Chrome은 지원 목록 `Select`, Inactive 행에서 열면
 * 입력 없이 그 코드다(A4 ②).
 *
 * ⚠️ **경로·되살릴 수·필드 판정은 서버 미리보기가 준다** — 화면이 템플릿을 채우지 않는다(미리보기 경로 = 실행 경로, POSTMORTEM 2026-09-16).
 * 미리보기 실패는 확정을 막는다 — 제출해도 같은 판정이 막을 수 있어 열어 두지 않는다(A1 ③).
 * ⚠️ **응답 순서를 믿지 않는다** — 치는 동안 여러 번 부르므로 마지막 요청의 응답만 받는다(`request`).
 * ⚠️ **저장 중엔 닫는 길을 전부 막는다**(A1 ⑤) — 성공하면 호스트가 닫고 새 행의 [Open]으로 포커스를 옮긴다(A5).
 */
export function AddLocaleDialog({ open, onOpenChange, slug, source, adapterName, pathTemplate, languages, initialCode, onDone, onCloseAutoFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; slug: string; source: string;
  adapterName: string; pathTemplate: string | null; languages: readonly Language[];
  /** Inactive 행의 [Add language] — 코드를 이미 안다. 입력이 없고 제목이 대상을 든다. */
  initialCode: string | null;
  onDone: (outcome: AddOutcome) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const m = useMessages();
  const uiLocale = useUiLocale();
  const [query, setQuery] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [check, setCheck] = useState<Check>({ kind: "idle" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const chrome = adapterName === "chrome-locales";
  const name = (value: string) => languageName(nameKey(value), uiLocale);

  function stopTyping() { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; }
  function run(value: string) {
    stopTyping();
    const id = ++request.current;
    setCode(value);
    setSubmitError(null);
    setCheck({ kind: "loading" });
    void previewSourceLocaleAdd({ slug, surfaceSlug: source, localeCode: value }).then(
      result => { if (request.current === id) setCheck(result.ok ? { kind: "ready", action: result.action, path: result.path, revive: result.revive } : refusal(result.error, value)); },
      () => { if (request.current === id) setCheck({ kind: "failed" }); },
    );
  }
  function refusal(error: string, value: string): Check {
    if (error === "unavailable") return { kind: "failed" };
    if (FIELD_ERRORS.has(error)) return { kind: "field", text: fieldText(m, error, value, languages, pathTemplate) };
    return { kind: "refused", text: dialogText(m, error) };
  }
  // 고른 값은 곧바로, 친 값은 쉼 뒤에 미리보기를 부른다 — 코드 모양이 아니면 부르지 않는다(이름 조각은 목록이 거른다).
  function type(value: string) {
    setQuery(value);
    stopTyping();
    request.current++;
    setCode(null);
    setSubmitError(null);
    setCheck({ kind: "idle" });
    if (looksLikeCodeInput(value)) timer.current = setTimeout(() => run(value), TYPING_PAUSE_MS);
  }
  // 고를 수 있는 행은 코드뿐이다 — 프리셋·이 소스에 있던 언어·코드 모양일 때만 서는 `Use this code`(R-E1 🟡1).
  function choose(value: string) {
    setQuery(value);
    run(value);
  }

  // 열 때마다 비운다 — 닫았다 연 Dialog가 앞의 입력·판정을 들고 오지 않게. 행에서 열면 그 코드를 곧바로 확인한다.
  useEffect(() => {
    stopTyping();
    request.current++;
    setQuery(initialCode ?? ""); setCode(null); setCheck({ kind: "idle" }); setSubmitError(null); setSaving(false);
    if (open && initialCode !== null) run(initialCode);
    return stopTyping;
  }, [open, initialCode]); // `run`은 slug·source만 읽는다 — 열림이 바뀔 때만 다시 시작한다.

  async function confirm() {
    if (saving || check.kind !== "ready" || code === null) return;
    const value = code;
    setSaving(true);
    setSubmitError(null);
    try {
      const result = await addSourceLocale({ slug, surfaceSlug: source, localeCode: value });
      if (result.ok) { onDone({ kind: "added", code: value, action: result.action, reissued: result.reissued }); return; }
      if (FIELD_ERRORS.has(result.error)) setCheck({ kind: "field", text: fieldText(m, result.error, value, languages, pathTemplate) });
      else setSubmitError(dialogText(m, result.error));
    } catch {
      // 응답을 잃은 추가는 서버가 끝냈을 수 있다 — 다시 실행하지 않고 호스트가 다시 읽는다.
      onDone({ kind: "lost", code: value });
      return;
    }
    setSaving(false);
  }

  const active = new Set(languages.filter(language => !language.orphaned).map(language => localeCollisionKey(language.code)));
  const inactive = languages.filter(language => language.orphaned);
  const fieldError = check.kind === "field" ? check.text : undefined;
  const ready = check.kind === "ready" ? check : null;
  const row = (value: string) => <><OptionFlag code={value} /><span data-option-code className="w-13 shrink-0">{value}</span><span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{name(value)}</span></>;
  const groups: ComboboxGroup[] = [];
  if (!chrome && initialCode === null) {
    const typed = query.trim();
    const shown = (value: string) => matchesLanguage(value, name(value), typed);
    const previously = inactive.filter(language => shown(language.code)).map(language => ({ value: language.code, label: row(language.code), aside: m.sources.locale.translationCount(language.translated + language.needsReview) }));
    const taken = new Set(inactive.map(language => language.code));
    const common = presetCodes(presetSeparator(languages.map(language => language.code))).filter(value => !taken.has(value) && shown(value))
      .map(value => active.has(localeCollisionKey(value)) ? { value, label: row(value), aside: m.sources.locale.added, disabled: true } : { value, label: row(value) });
    // 목록 밖 **코드**만 그대로 쓰라고 권한다 — 이름 조각(`Fren`)에 Use this code가 첫 행이면 Enter가 프리셋 대신 모양 오류를 낸다(R-E1 🟡1).
    if (looksLikeCodeInput(typed) && ![...previously, ...common].some(option => option.value === typed)) groups.push({ options: [{ value: typed, label: <span data-option-code className="min-w-0 truncate">{typed}</span>, aside: m.sources.locale.useCode }] });
    groups.push({ heading: m.sources.locale.previously, options: previously }, { heading: m.sources.locale.common, options: common });
  }

  return <Dialog open={open} onOpenChange={next => { if (!next && saving) return; onOpenChange(next); }}>
    {/*
      긴 소스 이름은 제목 안에서 감긴다(L5) — 제목 요소는 프리미티브가 그리므로 그릇에서 건다.
      열면 입력(Chrome은 Select 트리거)에 포커스한다(A1·A3) — 둘 다 `data-initial-focus`이고 본문이 푸터보다 앞이라 [Cancel]의 표식보다 먼저 잡힌다.
      행에서 열어 입력이 없으면 [Cancel]이다.
    */}
    <DialogContent closeDisabled={saving} onCloseAutoFocus={onCloseAutoFocus} className="[&_h2]:wrap-anywhere"
      title={initialCode !== null ? m.sources.locale.addAgainTitle(initialCode, source) : m.sources.locale.addTitle(source)}
      description={m.sources.locale.addBody}
      actions={<>
        <DialogClose asChild><Button ref={cancelRef} data-initial-focus aria-disabled={saving || undefined} onClick={event => { if (saving) event.preventDefault(); }}>{m.common.cancel}</Button></DialogClose>
        {/* 확정은 트리거와 같은 낱말이고 primary다 — 데이터를 지우지 않는다(A1). 꺼져도 포커스는 받는다(`aria-disabled`). */}
        <Button variant="primary" spinnerSize="sm" busy={saving} aria-disabled={(!saving && ready === null) || undefined}
          onClick={() => { if (ready !== null) void confirm(); }}>{m.sources.locale.addLanguage}</Button>
      </>}>
      {/* ⚠️ 본문은 표현식 하나다 — 형제가 둘이면 `children`이 배열이 되어 `DialogContent`가 빈 본문 블록을 세운다(`remove-source-dialog.tsx`). */}
      <div className="space-y-3">
        {initialCode === null && (chrome
          ? <FormGroup label={m.sources.locale.chromeLabel} labelId="add-locale-code-label" htmlFor="add-locale-code" error={fieldError}>
            {/* ⚠️ 저장 중엔 진짜 `disabled`가 아니라 잠근다 — 꺼지면 트리거의 포커스가 `body`로 빠진다(POSTMORTEM 2026-09-24 · `base-language-form.tsx`의 형). Tab만 통과한다. */}
            {describe => <Select value={code ?? ""} onValueChange={value => { if (!saving) run(value); }}>
              <SelectTrigger id="add-locale-code" data-initial-focus width="full" aria-labelledby="add-locale-code-label add-locale-code" aria-describedby={describe()} aria-invalid={fieldError !== undefined || undefined}
                aria-disabled={saving || undefined} onPointerDown={event => { if (saving) event.preventDefault(); }} onClick={event => { if (saving) event.preventDefault(); }}
                onKeyDown={event => { if (saving && event.key !== "Tab") event.preventDefault(); }}>
                <SelectValue placeholder={m.sources.locale.chromePlaceholder} />
              </SelectTrigger>
              <SelectContent>{CHROME_LOCALE_CODES.map(value => {
                const taken = active.has(localeCollisionKey(value));
                return <SelectItem key={value} value={value} disabled={taken}>
                  <span className="flex min-w-0 items-center gap-2"><OptionFlag code={value} /><span className="w-13 shrink-0">{value}</span><span className="text-muted-foreground truncate text-xs">{name(value)}</span>{taken && <span className="text-gray-dim ml-auto pl-2 text-xs">{m.sources.locale.added}</span>}</span>
                </SelectItem>;
              })}</SelectContent>
            </Select>}
          </FormGroup>
          : <FormGroup label={m.sources.locale.codeLabel} htmlFor={FIELD_ID} help={m.sources.locale.codeHelp} error={fieldError}>
            {describe => <Combobox id={FIELD_ID} initialFocus value={query} onValueChange={type} onSelect={choose} groups={groups} readOnly={saving} invalid={fieldError !== undefined}
              placeholder={m.sources.locale.codePlaceholder} listLabel={m.sources.locale.listLabel} aria-describedby={describe()} />}
          </FormGroup>)}
        {/*
          파일 블록은 미리보기의 결과 자리다. 받는 동안은 같은 마크업을 `invisible`로 깔고 골격을 덮는다 — 높이를 박지 않으니 도착해도 창이
          튀지 않는다(#192와 같은 규칙). 필드 오류·실패면 걷는다 — 만들지 않을 파일을 보이지 않는다(A2).
        */}
        <div aria-live="polite" className="space-y-3">
          {check.kind === "loading" && <div data-add-preview-skeleton aria-hidden className="relative">
            <div className="invisible"><FileBlock m={m} path={code ?? ""} create /></div>
            <Skeleton className="absolute inset-0 rounded-lg" />
          </div>}
          {ready !== null && <FileBlock m={m} path={ready.path} create={ready.action === "create"} />}
          {ready !== null && ready.action === "revive" && code !== null && <Alert variant="info" size="sm">
            {(initialCode !== null ? m.sources.locale.reviveAgain : (count: ReactNode) => m.sources.locale.reviveLine(code, count))(<span className="font-medium">{m.sources.locale.savedTranslations(ready.revive)}</span>)}
          </Alert>}
          {check.kind === "failed" && <Alert variant="danger" size="sm" live="off" actions={<Button size="sm" onClick={() => {
            // 누른 버튼이 골격과 함께 사라진다 — 포커스를 [Cancel]로 옮겨 둔다(#193).
            cancelRef.current?.focus();
            if (code !== null) run(code);
          }}>{m.sources.retry}</Button>}>{m.sources.locale.checkFailed}</Alert>}
          {(check.kind === "refused" || submitError !== null) && <Alert variant="danger" size="sm">{submitError ?? (check.kind === "refused" ? check.text : null)}</Alert>}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}

/**
 * 행의 깃발 열(시안 A1·A3) — Languages 카드 행과 같은 `LocaleFlag`다. ⚠️ **깃발이 없는 코드도 16 자리를 남긴다** — 비우면 그 행만 코드 열이 왼쪽으로
 * 붙어 목록의 코드가 한 선에 서지 않는다.
 */
function OptionFlag({ code }: { code: string }) {
  return <span data-option-flag className="flex w-4 shrink-0"><LocaleFlag code={code} /></span>;
}

/**
 * 만들 파일 블록(시안 A1 ④⑤ · A3 ② · A4) — 테두리 없는 muted 면이다. 사실 판(`Fact`·제거 확인의 테두리 판)과 형을 가른다: 이것은 "무엇을 만드나"
 * 한 줄의 예고이고, 경로 앞 `file-plus` 글리프가 그 뜻을 든다.
 */
function FileBlock({ m, path, create }: { m: Messages; path: string; create: boolean }) {
  return <div data-add-file className="bg-muted flex flex-col gap-0.5 rounded-md px-3 py-2.5">
    <p className="text-muted-foreground">{m.sources.locale.fileToCreate}</p>
    <p data-add-file-path className="text-foreground flex items-center gap-2 text-sm">
      <FilePlus2 className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 wrap-anywhere">{path.split("/").map((part, index) => <Fragment key={index}>{index > 0 && <>/<wbr /></>}{part}</Fragment>)}</span>
    </p>
    {create && <p className="text-muted-foreground">{m.sources.locale.noFileYet}</p>}
  </div>;
}

/** 필드 자리의 거부 — 서버 코드를 그 값에 대한 문장으로(시안 A2). */
function fieldText(m: Messages, error: string, code: string, languages: readonly Language[], pathTemplate: string | null): string {
  const errors = m.sources.locale.errors;
  switch (error) {
    case "invalid-code": return errors.unreadable;
    case "unsupported-locale": return errors.unsupportedLocale;
    case "already-active": return errors.alreadyActive(code);
    case "locale-collision": {
      const key = localeCollisionKey(code);
      return errors.collision(code, languages.find(language => language.code !== code && localeCollisionKey(language.code) === key)?.code ?? code);
    }
    case "removal-pending": return errors.removalPending(code);
    case "unsafe-path": return errors.unsafePath((pathTemplate ?? "").replaceAll("{locale}", "…"));
    default: return errors.pathConflict;
  }
}

/** Dialog 수준 거부 — 입력을 고쳐도 풀리지 않는다(시안 A3 ②). */
function dialogText(m: Messages, error: string): string {
  if (error === "archived") return m.sources.locale.archived;
  if (error === "publish-unsettled") return m.sources.locale.addUnsettled;
  return m.sources.locale.addFailed;
}
