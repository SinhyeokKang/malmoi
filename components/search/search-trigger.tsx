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

export function SearchTrigger({ account, memberships }: { account: PublicAccount | null; memberships?: readonly NavProject[] }) {
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
    <FieldButton icon={<Search />} placeholder={m.search.placeholder} shortcut={shortcut.label === null ? undefined : <Kbd>{m.common.keys.search[shortcut.label]}</Kbd>}
      aria-label={m.search.label} aria-haspopup="dialog" aria-expanded={open} aria-keyshortcuts={shortcut.aria ?? undefined} onClick={show} />
    {generation > 0 && <SearchDialog key={generation} open={open} onOpenChange={setOpen} account={account} memberships={memberships} />}
  </>;
}
