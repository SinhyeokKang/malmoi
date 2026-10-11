"use client";

import { Search } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { FieldButton } from "@/components/ui/field-button";
import { Kbd } from "@/components/ui/kbd";
import type { PublicAccount } from "@/lib/auth/landing";
import { useMessages } from "@/components/i18n/messages-provider";
import { searchShortcut } from "@/lib/keyboard";
import { shouldIgnoreShortcut } from "@/lib/search/keys";
import type { NavProject } from "@/lib/shell/nav";
import { SearchDialog } from "./search-dialog";

const subscribe = () => () => {};
const platformSnapshot = () => navigator.platform;
const serverSnapshot = () => null;

/**
 * ⚠️ **헤더에 한 벌만 둔다** — 인스턴스마다 document keydown 리스너(⌘K)가 붙는다. 공개 셸의 `lg` 미만 아이콘 형은 같은 인스턴스가 CSS로 바꾼다
 * (`compact` → `FieldButton`, responsive-public design §2). 서랍에 검색을 다시 그리지 않는다.
 */
export function SearchTrigger({ account, memberships, compact = false }: { account: PublicAccount | null; memberships?: readonly NavProject[]; compact?: boolean }) {
  const m = useMessages();
  const platform = useSyncExternalStore(subscribe, platformSnapshot, serverSnapshot);
  const [open, setOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const show = () => { setGeneration(value => value + 1); setOpen(true); };
  const shortcut = searchShortcut(platform);
  useEffect(() => {
    if (platform === null) return;
    const { matches } = searchShortcut(platform);
    const listener = (event: KeyboardEvent) => {
      if (!matches(event) || shouldIgnoreShortcut(event.target, document)) return;
      event.preventDefault();
      setGeneration(value => value + 1);
      setOpen(true);
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [platform]);
  return <>
    <FieldButton compact={compact} icon={<Search />} placeholder={m.search.placeholder} shortcut={shortcut.label === null ? undefined : <Kbd>{m.common.keys.search[shortcut.label]}</Kbd>}
      aria-label={m.search.label} aria-haspopup="dialog" aria-expanded={open} aria-keyshortcuts={shortcut.aria ?? undefined} onClick={show} />
    {generation > 0 && <SearchDialog key={generation} open={open} onOpenChange={setOpen} account={account} memberships={memberships} />}
  </>;
}
