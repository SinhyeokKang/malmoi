"use client";

import { Box, Check, CircleAlert } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { deleteProjectImage, updateProjectName, uploadProjectImage } from "@/app/(edit)/projects/[slug]/settings/actions";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { useLandAfter } from "@/components/ui/focus";
import { Input } from "@/components/ui/input";
import { ImageTile } from "@/components/ui/image-tile";
import { PanelCard, PanelFacts } from "@/components/ui/panel-card";
import { toneFill } from "@/components/ui/tone";
import { isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { planProjectName, PROJECT_NAME_MAX_CHARS } from "@/lib/projects/plan";
import { settingsAccessMessage } from "@/lib/settings/message";
import { planImagePick } from "@/lib/upload/image";
import { uploadRejectMessage } from "@/lib/upload/message";
import { cn } from "@/lib/utils";

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
      <span className="text-xs text-neutral-400">{m.settings.general.thumbnail}</span>
      <div className="flex items-center gap-4">
        {/* 깨진 URL의 폴백은 목록·Home·초대와 같은 `ImageTile`이 든다 (malmoi#50). */}
        <ImageTile
          src={image}
          className="border-border flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border"
          fallbackClassName={`text-white ${toneFill(name)}`}
        >
          <Box className="size-[26px]" />
        </ImageTile>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2 [&_.animate-spin]:size-3.5">
            <FileInput aria-describedby="project-image-caption" aria-invalid={shownImageError !== null} accept="image/png,image/jpeg" disabled={archived || pending} loading={pending && operation === "upload"} aria-busy={pending && operation === "upload"} onPick={file => {
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
            <Button className="[&_.animate-spin]:size-3.5" variant="ghost" aria-describedby="project-image-caption" disabled={archived || pending || !image} loading={pending && operation === "remove"} aria-busy={pending && operation === "remove"} onClick={() => {
              setImageError(null); setOperation("remove");
              run(async () => { try { const result = await deleteProjectImage(slug); if (!result.ok) setImageError(isAccessError(result.reason) ? settingsAccessMessage(result.reason) : uploadRejectMessage(result.reason)); } catch { setImageError(uploadRejectMessage("unavailable")); } });
            }}>{m.settings.general.remove}</Button>
          </div>
          <p id="project-image-caption" role={shownImageError ? "alert" : undefined} className={cn("text-xs", shownImageError ? "text-destructive" : "text-muted-foreground")}>{shownImageError && <CircleAlert aria-hidden className="mr-1 inline size-3.5" />}{caption}{!image && !shownImageError && !pending && !archived && <span className="sr-only"> {m.settings.general.noImage}</span>}</p>
        </div>
      </div>
    </PanelFacts>
    <div className="border-border border-t"><PanelFacts>
      <label htmlFor="project-name" className="text-xs text-neutral-400">{m.settings.general.name}</label>
      <form className="flex min-w-0 flex-wrap items-center gap-2" onSubmit={event => {
        event.preventDefault(); if (archived || saving || !plan.ok) return;
        setError(null); setSaved(false);
        save(async () => { try { const result = await updateProjectName({ slug, name: value }); if (result.ok) { setCurrent(result.name); setSaved(true); } else setError(isAccessError(result.error) ? settingsAccessMessage(result.error) : result.error === "empty" ? m.settings.general.emptyName : result.error === "too-long" ? m.settings.general.longName : m.settings.repository.fields.failed); } catch { setError(m.settings.repository.fields.failed); } });
      }}>
        <Input ref={nameRef} id="project-name" className="w-[320px] max-w-full @max-[640px]:min-w-0 @max-[640px]:flex-1" value={archived ? current : value} maxLength={PROJECT_NAME_MAX_CHARS} disabled={archived || saving} aria-invalid={nameError !== null} aria-describedby="project-name-caption" onChange={event => { setValue(event.target.value); setSaved(false); setError(null); }} />
        <Button ref={saveRef} className="[&_.animate-spin]:size-3.5" type="submit" loading={saving} aria-busy={saving} disabled={archived || !plan.ok || plan.name === current} aria-describedby="project-name-caption">{m.settings.repository.fields.save}</Button>
        <p id="project-name-caption" role={nameError ? "alert" : undefined} className={cn("min-w-0 flex-1 basis-40 @max-[640px]:basis-full text-xs", nameError ? "text-destructive" : "text-muted-foreground")}>
          {nameError ? <><CircleAlert aria-hidden className="mr-1 inline size-3.5" />{nameError}</> : archived ? m.settings.archivedReason : saved ? <><Check aria-hidden className="mr-1 inline size-3.5" />{m.settings.repository.fields.saved}</> : m.settings.general.nameHelp}
        </p>
        {/* ⚠️ **성공은 전부터 있던 live 영역에 쓴다** (audit #39) — 캡션이 `Saved`로 바뀌는 것만으로는 아무도 알리지 않고,
            텍스트와 함께 새로 붙는 `role="status"`는 스크린리더가 놓친다. ⚠️ **성공 뒤 착지가 이름 칸으로 오면 `Saved`가 두 번 읽힐 수 있다** — 칸의 describedby(캡션)와 이 영역이다. 착지는
            포커스가 빠졌을 때만 일어나므로 이 영역을 뺄 수 없고, 한 번 더 읽히는 쪽을 받는다(B5 리뷰 r1). */}
        <span role="status" data-save-status="project-name" className="sr-only">{saved && !archived ? m.settings.repository.fields.saved : ""}</span>
      </form>
    </PanelFacts></div>
    <div className="border-border border-t"><PanelFacts>
      <label htmlFor="project-address" className="text-xs text-neutral-400">{m.settings.general.address}</label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Input id="project-address" className="bg-muted text-muted-foreground w-[320px] max-w-full @max-[640px]:min-w-0 @max-[640px]:flex-1" value={slug} readOnly />
        <p className="text-muted-foreground min-w-0 flex-1 basis-40 @max-[640px]:basis-full text-xs">{m.settings.general.addressHelp(slug)}</p>
      </div>
    </PanelFacts></div>
  </PanelCard>;
}
