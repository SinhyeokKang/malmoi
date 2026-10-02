"use client";

import { Box, Check } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { deleteProjectImage, updateProjectName, uploadProjectImage } from "@/app/(edit)/projects/[slug]/settings/actions";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { FieldError } from "@/components/ui/form-group";
import { useLandAfter } from "@/components/ui/focus";
import { Input } from "@/components/ui/input";
import { ImageTile } from "@/components/ui/image-tile";
import { PanelCard, PanelFacts } from "@/components/ui/panel-card";
import { hueFill } from "@/components/ui/tone";
import { isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { planProjectName, PROJECT_NAME_MAX_CHARS } from "@/lib/projects/plan";
import { settingsAccessMessage } from "@/lib/settings/message";
import { planImagePick } from "@/lib/upload/image";
import { uploadRejectMessage } from "@/lib/upload/message";
import { cn } from "@/lib/utils";

/** 이름 줄 캡션의 배치 — 오류(`FieldError`)와 안내가 같은 자리에 선다. */
const CAPTION = "min-w-0 flex-1 basis-40 @max-form:basis-full";

export function GeneralCard({ slug, name, image, archived }: { slug: string; name: string; image: string | null; archived: boolean }) {
  const [value, setValue] = useState(name);
  // 저장된 이름 — 앞뒤 공백만 다른 값은 서버가 같은 이름으로 접으므로 [Save]를 켜지 않는다.
  const [current, setCurrent] = useState(name);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saving, save] = useTransition();
  const [pending, run] = useTransition();
  const [operation, setOperation] = useState<"upload" | "remove">("upload");
  const nameRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  /*
    ⚠️ **저장이 끝나면 착지한다** (audit #32) — 저장 중엔 [Save]·입력이 `loading`·`disabled`라 포커스가 `body`로 빠진다.
    실패면 다시 켜진 [Save], 성공이면 저장할 것이 없어 꺼진 채라 방금 고친 이름 필드다.
  */
  useLandAfter(saving, () => [saveRef.current, nameRef.current]);
  const plan = planProjectName(value);
  // ⚠️ 보관 상태가 오면 행의 옛 오류·거부된 입력을 내린다 — 다른 행과 같은 `archivedReason` 한 문장만 선다 (QA D1).
  const nameError = archived ? null : error ?? (!plan.ok ? plan.reason === "empty" ? m.settings.general.emptyName : m.settings.general.longName : null);
  const shownImageError = archived ? null : imageError;
  const caption = archived ? m.settings.archivedReason : pending ? m.settings.general.busy : imageError ?? m.settings.general.caption;
  return <PanelCard title={m.settings.general.title}>
    <PanelFacts>
      <span className="text-muted-foreground text-xs">{m.settings.general.thumbnail}</span>
      <div className="flex items-center gap-4">
        {/* 깨진 URL의 폴백은 목록·Home·초대와 같은 `ImageTile`이 든다 (malmoi#50). */}
        <ImageTile
          src={image}
          className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm"
          fallbackClassName={`text-white ${hueFill(name)}`}
        >
          <Box className="size-5" />
        </ImageTile>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <FileInput spinnerSize="sm" aria-describedby="project-image-caption" aria-invalid={shownImageError !== null} accept="image/png,image/jpeg" disabled={archived || pending} loading={pending && operation === "upload"} aria-busy={pending && operation === "upload"} onPick={file => {
              if (!file || pending || archived) return;
              setImageError(null);
              const picked = planImagePick(file);
              if (!picked.ok) { setImageError(uploadRejectMessage(picked.reason)); return; }
              const form = new FormData(); form.set("slug", slug); form.set("image", file);
              setOperation("upload");
              run(async () => {
                try { const result = await uploadProjectImage(form); if (!result.ok) setImageError(isAccessError(result.reason) ? settingsAccessMessage(result.reason) : uploadRejectMessage(result.reason)); }
                catch { setImageError(uploadRejectMessage("unavailable")); }
              });
            }}>{m.settings.general.upload}</FileInput>
            {/* 썸네일이 없으면 [Remove]를 그리지 않는다(2026-09-30 사용자 — 꺼진 버튼을 걷었다). */}
            {image && <Button spinnerSize="sm" variant="ghost" aria-describedby="project-image-caption" disabled={archived || pending} loading={pending && operation === "remove"} aria-busy={pending && operation === "remove"} onClick={() => {
              setImageError(null); setOperation("remove");
              run(async () => { try { const result = await deleteProjectImage(slug); if (!result.ok) setImageError(isAccessError(result.reason) ? settingsAccessMessage(result.reason) : uploadRejectMessage(result.reason)); } catch { setImageError(uploadRejectMessage("unavailable")); } });
            }}>{m.settings.general.remove}</Button>}
          </div>
          {shownImageError ? <FieldError id="project-image-caption">{caption}</FieldError> : <p id="project-image-caption" className="text-muted-foreground text-xs">{caption}</p>}
        </div>
      </div>
    </PanelFacts>
    <div className="border-border border-t"><PanelFacts>
      <label htmlFor="project-name" className="text-muted-foreground text-xs">{m.settings.general.name}</label>
      <form className="flex min-w-0 flex-wrap items-center gap-2" onSubmit={event => {
        event.preventDefault(); if (archived || saving || !plan.ok) return;
        setError(null); setSaved(false);
        save(async () => { try { const result = await updateProjectName({ slug, name: value }); if (result.ok) { setCurrent(result.name); setSaved(true); } else setError(isAccessError(result.error) ? settingsAccessMessage(result.error) : result.error === "empty" ? m.settings.general.emptyName : result.error === "too-long" ? m.settings.general.longName : m.settings.repository.fields.failed); } catch { setError(m.settings.repository.fields.failed); } });
      }}>
        <div className="flex w-[320px] max-w-full @max-form:min-w-0 @max-form:flex-1">
          <Input width="full" ref={nameRef} id="project-name" value={archived ? current : value} maxLength={PROJECT_NAME_MAX_CHARS} disabled={archived || saving} aria-invalid={nameError !== null} aria-describedby="project-name-caption" onChange={event => { setValue(event.target.value); setSaved(false); setError(null); }} />
        </div>
        <Button ref={saveRef} spinnerSize="sm" type="submit" loading={saving} aria-busy={saving} disabled={archived || !plan.ok || plan.name === current} aria-describedby="project-name-caption">{m.settings.repository.fields.save}</Button>
        {nameError ? <FieldError id="project-name-caption" className={CAPTION}>{nameError}</FieldError> : (
          <p id="project-name-caption" className={cn(CAPTION, "text-muted-foreground text-xs")}>
            {archived ? m.settings.archivedReason : saved ? <><Check aria-hidden className="mr-1 inline size-3.5" />{m.settings.repository.fields.saved}</> : null}
          </p>
        )}
        {/* ⚠️ **성공은 전부터 있던 live 영역에 쓴다** (audit #39) — 캡션이 `Saved`로 바뀌는 것만으로는 아무도 알리지 않고,
            텍스트와 함께 새로 붙는 `role="status"`는 스크린리더가 놓친다. ⚠️ **성공 뒤 착지가 이름 칸으로 오면 `Saved`가 두 번 읽힐 수 있다** — 칸의 describedby(캡션)와 이 영역이다. 착지는
            포커스가 빠졌을 때만 일어나므로 이 영역을 뺄 수 없고, 한 번 더 읽히는 쪽을 받는다(B5 리뷰 r1). */}
        <span role="status" data-save-status="project-name" className="sr-only">{saved && !archived ? m.settings.repository.fields.saved : ""}</span>
      </form>
    </PanelFacts></div>
    <div className="border-border border-t"><PanelFacts>
      <label htmlFor="project-address" className="text-muted-foreground text-xs">{m.settings.general.address}</label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex w-[320px] max-w-full @max-form:min-w-0 @max-form:flex-1">
          <Input width="full" id="project-address" className="bg-muted text-muted-foreground" value={slug} readOnly />
        </div>
      </div>
    </PanelFacts></div>
  </PanelCard>;
}
