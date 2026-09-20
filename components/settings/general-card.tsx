"use client";

import { Box, Check, CircleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteProjectImage, updateProjectName, uploadProjectImage } from "@/app/(edit)/projects/[slug]/settings/actions";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Input } from "@/components/ui/input";
import { PanelCard, PanelFacts } from "@/components/ui/panel-card";
import { toneFill } from "@/components/ui/tone";
import { accessErrorMessage, isAccessError } from "@/lib/auth/message";
import { m } from "@/lib/i18n";
import { planProjectName, PROJECT_NAME_MAX_CHARS } from "@/lib/projects/plan";
import { planImagePick } from "@/lib/upload/image";
import { uploadRejectMessage } from "@/lib/upload/message";
import { cn } from "@/lib/utils";

export function GeneralCard({ slug, name, image, archived }: { slug: string; name: string; image: string | null; archived: boolean }) {
  const [value, setValue] = useState(name);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [saving, save] = useTransition();
  const [pending, run] = useTransition();
  const [operation, setOperation] = useState<"upload" | "remove">("upload");
  const plan = planProjectName(value);
  const nameError = error ?? (!plan.ok ? plan.reason === "empty" ? m.settings.general.emptyName : m.settings.general.longName : null);
  const caption = archived ? m.settings.archivedReason : pending ? m.settings.general.busy : imageError ?? m.settings.general.caption;
  return <PanelCard title={m.settings.general.title}>
    <PanelFacts>
      <span className="text-foreground/40 text-xs">{m.settings.general.thumbnail}</span>
      <div className="flex items-center gap-4">
        <span aria-hidden className={cn("border-border flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border", !image && ["text-white", toneFill(name)])}>
          {image ? <img src={image} alt="" className="size-full object-contain" /> : <Box className="size-[26px]" />}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2 [&_.animate-spin]:size-3.5">
            <FileInput aria-describedby="project-image-caption" aria-invalid={imageError !== null} accept="image/png,image/jpeg" disabled={archived || pending} loading={pending && operation === "upload"} aria-busy={pending && operation === "upload"} onPick={file => {
              if (!file || pending || archived) return;
              setImageError(null);
              const picked = planImagePick(file);
              if (!picked.ok) { setImageError(uploadRejectMessage(picked.reason)); return; }
              const form = new FormData(); form.set("slug", slug); form.set("image", file);
              setOperation("upload");
              run(async () => {
                try { const result = await uploadProjectImage(form); if (!result.ok) setImageError(isAccessError(result.reason) ? accessErrorMessage(result.reason) : uploadRejectMessage(result.reason)); }
                catch { setImageError(uploadRejectMessage("unavailable")); }
              });
            }}>{m.settings.general.upload}</FileInput>
            <Button className="[&_.animate-spin]:size-3.5" variant="ghost" aria-describedby="project-image-caption" disabled={archived || pending || !image} loading={pending && operation === "remove"} aria-busy={pending && operation === "remove"} onClick={() => {
              setImageError(null); setOperation("remove");
              run(async () => { try { const result = await deleteProjectImage(slug); if (!result.ok) setImageError(isAccessError(result.reason) ? accessErrorMessage(result.reason) : uploadRejectMessage(result.reason)); } catch { setImageError(uploadRejectMessage("unavailable")); } });
            }}>{m.settings.general.remove}</Button>
          </div>
          <p id="project-image-caption" role={imageError ? "alert" : undefined} className={cn("text-xs", imageError ? "text-destructive" : "text-muted-foreground")}>{imageError && <CircleAlert aria-hidden className="mr-1 inline size-3.5" />}{caption}{!image && !imageError && !pending && !archived && <span className="sr-only"> {m.settings.general.noImage}</span>}</p>
        </div>
      </div>
    </PanelFacts>
    <div className="border-border border-t"><PanelFacts>
      <label htmlFor="project-name" className="text-foreground/40 text-xs">{m.settings.general.name}</label>
      <form className="flex min-w-0 flex-wrap items-center gap-2" onSubmit={event => {
        event.preventDefault(); if (archived || saving || !plan.ok) return;
        setError(null); setSaved(false);
        save(async () => { try { const result = await updateProjectName({ slug, name: value }); if (result.ok) setSaved(true); else setError(isAccessError(result.error) ? accessErrorMessage(result.error) : m.settings.repository.fields.failed); } catch { setError(m.settings.repository.fields.failed); } });
      }}>
        <Input id="project-name" className="w-[320px] max-w-full @max-[640px]:min-w-0 @max-[640px]:flex-1" value={value} maxLength={PROJECT_NAME_MAX_CHARS} disabled={archived || saving} aria-invalid={nameError !== null} aria-describedby="project-name-caption" onChange={event => { setValue(event.target.value); setSaved(false); setError(null); }} />
        <Button className="[&_.animate-spin]:size-3.5" type="submit" loading={saving} aria-busy={saving} disabled={archived || !plan.ok} aria-describedby="project-name-caption">{m.settings.repository.fields.save}</Button>
        <p id="project-name-caption" role={nameError ? "alert" : undefined} className={cn("min-w-0 flex-1 basis-40 @max-[640px]:basis-full text-xs", nameError ? "text-destructive" : "text-muted-foreground")}>
          {nameError ? <><CircleAlert aria-hidden className="mr-1 inline size-3.5" />{nameError}</> : archived ? m.settings.archivedReason : saved ? <><Check aria-hidden className="mr-1 inline size-3.5" />{m.settings.repository.fields.saved}</> : m.settings.general.nameHelp}
        </p>
      </form>
    </PanelFacts></div>
    <div className="border-border border-t"><PanelFacts>
      <label htmlFor="project-address" className="text-foreground/40 text-xs">{m.settings.general.address}</label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Input id="project-address" className="bg-muted text-muted-foreground w-[320px] max-w-full @max-[640px]:min-w-0 @max-[640px]:flex-1" value={slug} readOnly />
        <p className="text-muted-foreground min-w-0 flex-1 basis-40 @max-[640px]:basis-full text-xs">{m.settings.general.addressHelp(slug)}</p>
      </div>
    </PanelFacts></div>
  </PanelCard>;
}
