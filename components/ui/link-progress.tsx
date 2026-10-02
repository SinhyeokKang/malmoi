"use client";

import { Loader2 } from "lucide-react";
import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { glyphSlot } from "./button";

/** 헤더는 서버에 남기고 기존 Next 링크의 진행 신호만 이 잎에서 읽는다. */
export function LinkProgress({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <>{pending && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />}{glyphSlot(children, pending)}</>;
}
