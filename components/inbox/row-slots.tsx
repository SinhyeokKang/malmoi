import type { ReactNode } from "react";

import { IconTile } from "@/components/ui/icon-tile";
import { attentionHref, attentionTile, body, tail, title } from "@/lib/home/attention-view";
import type { Messages } from "@/lib/i18n";
import type { UiLocale } from "@/lib/i18n/locales";
import type { InboxItem } from "@/lib/inbox/plan";
import { relativeTime } from "@/lib/relative-time";

/**
 * 주의 항목 한 줄의 **내용** — 드롭다운(`DropdownMenuRow`) · `/inbox` 페이지 · Home 카드(`ListRow`)가 그릇만 달리하고 이 슬롯을 나눠 쓴다(inbox-page D3).
 * 세 곳이 각자 조립하던 때는 문장·점·Owner 안내가 화면마다 갈렸다.
 *
 * ⚠️ **`"use client"`가 아니다** — 서버 페이지와 Home(순수 서버 컴포넌트)도 부른다. 그래서 `useMessages`를 부르지 않고 사전·화면 언어를 인자로 받는다.
 * ⚠️ **권한을 판정하지 않는다** — `ownerRetries`는 호출부가 정해 넘긴다(Inbox는 계획의 값 그대로, Home은 자기 역할 판정으로). 여기서 다시 판정하면 두 출처가 갈린다.
 * ⚠️ **안 읽음 점은 행 왼쪽 여백 16 안(x 5–11)에 선다** — 칩이 그룹 머리와 같은 x16에 남는다. 점이 `absolute`라 **그릇에 `relative`를 줘야 한다**.
 * 접근 이름 맨 앞이 sr `Unread`다. `unread`가 없는 항목(Home)에는 점도 sr 문장도 서지 않는다.
 */
export type AttentionRowItem = InboxItem & { ownerRetries: boolean; unread?: boolean };

export function attentionRowSlots(
  m: Messages,
  uiLocale: UiLocale,
  slug: string,
  item: AttentionRowItem,
  now: Date,
  { time }: { time: "narrow" | "long" },
): { href: string; icon: ReactNode; title: ReactNode; description: ReactNode; aside: ReactNode } {
  const tile = attentionTile(item);
  const Tile = tile.icon;
  const sub = title(m, item);
  return {
    href: attentionHref(slug, item),
    icon: <>
      {item.unread && <>
        <span className="sr-only">{m.inbox.unread}</span>
        <span data-unread-dot aria-hidden className="bg-primary absolute top-1/2 left-1.25 size-1.5 -translate-y-1/2 rounded-full" />
      </>}
      <IconTile tone={tile.tone}><Tile aria-hidden /></IconTile>
    </>,
    // 굵은 조각이 **사실**이고 나머지가 그 근거다 — 색이 아니라 무게로 가른다.
    title: <span className="text-pretty"><span className="font-medium">{body(m, item)}</span>{tail(m, item)}</span>,
    // 보조줄(표면 · 로케일)은 본문 **아래**고 한 줄로 자른다 — 이름이 길어져 행 높이가 흔들리지 않게. EDITOR 실패 안내는 따로 한 줄이다.
    description: sub === "" && !item.ownerRetries ? undefined : <>
      {sub !== "" && <span className="block truncate">{sub}</span>}
      {item.ownerRetries && <span className="mt-copy-gap block">{m.projects.importFailure.ownerRetries}</span>}
    </>,
    // 시각은 `muted`다(2026-09-30 사용자 — 같은 Home의 Log 행 시각과 맞췄다. 옛 `gray-dim`은 2.5:1이라 읽기 어려웠다).
    // 시각이 없으면 칸을 비운다 — 실패 시각이 기록되지 않은 항목에 "Never"를 적으면 거짓이다. `narrow`는 360 메뉴의 문장 칸(226)을 지킨다(#190).
    aside: item.at === null ? undefined : <span className="text-muted-foreground shrink-0 text-xs">{relativeTime(item.at, now, uiLocale, time === "narrow" ? { style: "narrow" } : undefined)}</span>,
  };
}
