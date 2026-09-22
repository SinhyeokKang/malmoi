"use client";
import { useEffect, useRef, useState } from "react";
import { updateBaseLocale } from "@/app/(edit)/projects/[slug]/sources/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { baseLocaleFieldValue } from "@/lib/onboarding/base-pending";
import { isRepositorySettingsError, repositorySettingsErrorMessage } from "@/lib/settings/message";
import { createBaseLanguageForm, planBaseLanguageForm } from "@/lib/sources/base-language";
import { cn } from "@/lib/utils";

export function BaseLanguageForm({ slug, surfaceSlug, baseLocale, declaredBaseLocale, locales, awaiting, onPending, onError, onSaved }: {
  slug: string; surfaceSlug: string; baseLocale: string | null; declaredBaseLocale: string | null; locales: readonly string[];
  /** 선언이 적재를 기다리는 중. 필드가 **요청 값**을 들고 있다는 표식이라 값 자체와 함께 서야 한다. */
  awaiting: boolean;
  onPending: (pending: boolean) => void; onError: (error: boolean) => void; onSaved: () => void;
}) {
  const [state, setState] = useState(() => createBaseLanguageForm({ baseLocale, declaredBaseLocale }));
  const submit = useRef<HTMLButtonElement>(null);
  const server = baseLocaleFieldValue({ baseLocale, declaredBaseLocale }) ?? "";
  if (state.serverValue !== server) setState(planBaseLanguageForm(state, { type: "refresh", value: server }));
  const error = typeof state.result === "object" ? state.result.error : null;
  useEffect(() => { onError(error !== null); if (error !== null && !state.pending) submit.current?.focus(); }, [error, state.pending, onError]);
  const unavailable = baseLocale === null || locales.length === 0;
  const locked = unavailable || state.pending;
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault();
    if (locked || state.draft === state.baseline) return;
    const value = state.draft;
    setState(s => planBaseLanguageForm(s, { type: "submit" })); onPending(true);
    try {
      const result = await updateBaseLocale({ slug, surfaceSlug, baseLocale: value });
      setState(s => planBaseLanguageForm(s, result.ok ? { type: "success" } : { type: "failure", error: result.error }));
      if (result.ok) onSaved();
    } catch { setState(s => planBaseLanguageForm(s, { type: "failure", error: "unavailable" })); }
    finally { onPending(false); }
  }}>
    <label id="base-locale-label" htmlFor="base-locale" className="sr-only">{m.locales.field.label}</label>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={state.draft} onValueChange={value => { if (!locked) setState(s => planBaseLanguageForm(s, { type: "change", value })); }}>
          <SelectTrigger id="base-locale" aria-labelledby="base-locale-label base-locale" aria-disabled={locked || undefined} aria-describedby={unavailable ? "base-unavailable" : undefined} data-base-pending={awaiting || undefined} className={cn("w-40", awaiting && "border-amber-500/50")}
            onPointerDown={event => { if (locked) event.preventDefault(); }} onClick={event => { if (locked) event.preventDefault(); }} onKeyDown={event => { if (locked) event.preventDefault(); }}><SelectValue /></SelectTrigger>
          <SelectContent>{locales.map(code => <SelectItem key={code} value={code}>{code}</SelectItem>)}</SelectContent>
        </Select>
        <Button ref={submit} type="submit" loading={state.pending} disabled={unavailable || state.draft === state.baseline}>{m.locales.field.save}</Button>
        {state.result === "saved" && <span role="status" className="text-muted-foreground text-xs">{m.locales.field.saved}</span>}
        <p className="text-muted-foreground min-w-0 flex-1 text-xs leading-[1.7] @max-[850px]:basis-full">{m.locales.field.help}</p>
      </div>
    {unavailable && <p id="base-unavailable" className="text-muted-foreground text-xs">{baseLocale === null ? m.sources.firstImport : m.locales.field.noLocales}</p>}
    {error && <Alert variant="danger">{isRepositorySettingsError(error) ? repositorySettingsErrorMessage(error) : isAccessError(error) ? accessErrorMessage(error) : m.locales.field.failed}</Alert>}
  </form>;
}
