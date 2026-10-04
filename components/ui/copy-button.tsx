"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { Input } from "./input";
import { useMessages } from "@/components/i18n/messages-provider";

/** 값 복사는 확인을 남기고, 코드·참조 복사는 기존 계약대로 2초 뒤 되돌린다. */
export function CopyButton({ value, label, size = "md", variant = "default", onCopyFailed }: {
  value: string;
  label?: string;
  size?: "sm" | "md";
  variant?: "default" | "code" | "link";
  onCopyFailed?: () => void;
}) {
  const m = useMessages();
  const text = label ?? m.common.copy;
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const [announcement, setAnnouncement] = useState("");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const fail = () => {
    setState("failed");
    setAnnouncement(m.common.copyFailed);
    onCopyFailed?.();
  };
  const copy = async () => {
    window.clearTimeout(timer.current);
    setAnnouncement("");
    try {
      if (navigator.clipboard === undefined) { fail(); return; }
      await navigator.clipboard.writeText(value);
      setState("copied");
      setAnnouncement(m.common.copied);
      if (variant !== "default") timer.current = window.setTimeout(() => { setState("idle"); setAnnouncement(""); }, 2000);
    } catch { fail(); }
  };
  const button = <Button type="button" size={variant === "default" ? size : "sm"}
    aria-label={variant === "link" && state !== "copied" ? text : undefined}
    className={variant === "code" ? "min-w-[66px]" : variant === "link" ? "min-w-7 gap-1 px-1.5" : undefined}
    onClick={() => { void copy(); }}>
    {variant !== "code" && (state === "copied" ? <Check className="size-3.5" aria-hidden /> : variant === "link" ? <Link2 className="size-3.5 text-gray-strong" aria-hidden /> : <Copy className="size-3.5" aria-hidden />)}
    {state === "copied" ? m.common.copied : variant === "link" ? null : state === "failed" ? m.common.copyFailed : text}
  </Button>;
  return <>
    {variant === "link" ? <span className="flex shrink-0 items-center gap-1.5">
      {state === "failed" && <Input width={192} size="xs" autoFocus readOnly value={value} aria-label={m.translations.workspace.detail.copyFailed} onFocus={event => event.currentTarget.select()} />}
      {button}
    </span> : button}
    {variant === "code" && <span role="status" aria-live="polite" className="sr-only">{announcement}</span>}
  </>;
}
