"use client";

import { Search } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { FieldButton } from "@/components/ui/field-button";
import { Kbd } from "@/components/ui/kbd";
import type { PublicAccount } from "@/lib/auth/landing";
import { m } from "@/lib/i18n";
import { isSearchShortcut, shouldIgnoreShortcut } from "@/lib/search/keys";
import type { NavProject } from "@/lib/shell/nav";
import { SearchDialog } from "./search-dialog";

const subscribe = () => () => {};
const platformSnapshot = () => navigator.platform;
const serverSnapshot = () => null;

export function SearchTrigger({ account, memberships }: { account: PublicAccount | null; memberships?: readonly NavProject[] }) {
  const platform = useSyncExternalStore(subscribe, platformSnapshot, serverSnapshot);
  const [open, setOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const show = () => { setGeneration(value => value + 1); setOpen(true); };
  useEffect(() => {
    if (platform === null) return;
    const shortcut = (event: KeyboardEvent) => {
      if (!isSearchShortcut(event, platform) || shouldIgnoreShortcut(event.target, document)) return;
      event.preventDefault();
      setGeneration(value => value + 1);
      setOpen(true);
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [platform]);
  const mac = platform !== null && /mac/i.test(platform);
  return <>
    <FieldButton icon={<Search />} placeholder={m.search.placeholder} shortcut={platform === null ? undefined : <Kbd>{mac ? "⌘K" : "Ctrl K"}</Kbd>}
      aria-label={m.search.label} aria-haspopup="dialog" aria-keyshortcuts={platform === null ? undefined : mac ? "Meta+K" : "Control+K"} onClick={show} />
    {generation > 0 && <SearchDialog key={generation} open={open} onOpenChange={setOpen} account={account} memberships={memberships} />}
  </>;
}
