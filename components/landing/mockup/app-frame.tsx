import { Box, CircleUser, Files, History, House, Languages, Settings, Users } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

import { m } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import logo from "@/public/brand/malmoi-icon-black.svg";

/**
 * 목업 안의 앱 셸 — 헤더 40 · LNB · `ContentPanel`을 **정적 복제**로 그린다(spec 비목표 — 실제 셸은 Server Action·세션에 묶여 있다).
 *
 * ⚠️ **인터랙티브 태그를 두지 않는다** — 프레임은 `aria-hidden` + `inert`이지만 jsdom이 `inert`를 모르므로 태그 수로 센다.
 * 라벨은 실제 사전(`m.common.nav`)을 읽는다 — 사이드바와 목업이 다른 말을 하면 랜딩이 거짓이다.
 */
export function AppFrame({ children, overlay }: { children: ReactNode; overlay?: ReactNode }) {
  const nav = m.common.nav;
  const items = [
    { icon: House, label: nav.home },
    { icon: Files, label: nav.sources },
    { icon: Languages, label: nav.translations, active: true },
    { icon: Users, label: nav.members },
    { icon: History, label: nav.logs },
    { icon: Settings, label: nav.projectSettings },
  ];
  return (
    <div className="bg-canvas relative flex h-full flex-col px-2 pt-2 pb-2">
      <div className="flex h-10 shrink-0 items-center justify-between px-1">
        <span className="flex size-8 items-center justify-center rounded-lg">
          <Image src={logo} alt="" width={32} height={32} />
        </span>
        <CircleUser className="text-muted-foreground size-5" aria-hidden />
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex w-[200px] shrink-0 flex-col gap-0.5 p-1">
          <p className="text-foreground flex items-center gap-2 p-1.5 text-sm font-medium">
            <Box className="size-4" aria-hidden />
            <span className="min-w-0 truncate">{m.landing.mockup.project}</span>
          </p>
          {items.map(({ icon: Icon, label, active }) => (
            <span key={label} className={cn("text-foreground flex items-center gap-2 rounded-sm p-1.5 text-sm", active && "bg-foreground/[0.07]")}>
              <Icon className="size-4" aria-hidden />
              <span className="min-w-0 truncate">{label}</span>
            </span>
          ))}
        </div>
        <div className="border-border-subtle bg-background shadow-low flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">{children}</div>
      </div>
      {overlay !== undefined && (
        <div className="bg-foreground/32 absolute inset-0 flex items-center justify-center">{overlay}</div>
      )}
    </div>
  );
}
