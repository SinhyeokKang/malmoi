"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useMessages } from "@/components/i18n/messages-provider";
import { Button } from "@/components/ui/button";
import { DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { FilterMenu } from "@/components/ui/filter-menu";
import { ProjectThumbnail } from "@/components/ui/project-thumbnail";
import { SearchInput } from "@/components/ui/search-input";
import { hasNarrowing, inboxQuery, type InboxFilter, type InboxFilterOptions } from "@/lib/inbox/filter";
import { routes } from "@/lib/routes";

/** URL은 실효 필터에서 다시 만든다 — 계획에서 사라진 선택을 다음 이동에 되살리지 않는다. */
export function InboxFilters({ filter, options }: { filter: InboxFilter; options: InboxFilterOptions }) {
  const m = useMessages();
  const router = useRouter();
  const [clearing, startClear] = useTransition();
  const go = (next: Partial<InboxFilter>) => router.push(routes.inbox(inboxQuery({ ...filter, ...next })));
  const names = filter.projects.map(slug => options.projects.find(project => project.slug === slug)!.name).join(", ");

  return (
    <div data-inbox-filter-row className="flex flex-wrap items-center gap-2">
      <FilterMenu axis={m.logs.filters.axis.kind} label={filter.kind === null ? m.inbox.filters.all : m.inbox.filters.kinds[filter.kind]} on={filter.kind !== null}>
        <DropdownMenuItem selected={filter.kind === null} onSelect={() => go({ kind: null })}>{m.inbox.filters.all}</DropdownMenuItem>
        {options.kinds.map(kind => (
          <DropdownMenuItem key={kind} selected={filter.kind === kind} onSelect={() => go({ kind })}>{m.inbox.filters.kinds[kind]}</DropdownMenuItem>
        ))}
      </FilterMenu>
      <FilterMenu axis={m.inbox.filters.axis.project} label={filter.projects.length === 0 ? m.inbox.filters.anyProject : m.inbox.filters.selectedProjects(names)} on={filter.projects.length > 0} className="max-w-60">
        {options.projects.map(project => (
          <DropdownMenuCheckboxItem key={project.slug} checked={filter.projects.includes(project.slug)} onCheckedChange={() => go({
            projects: filter.projects.includes(project.slug) ? filter.projects.filter(slug => slug !== project.slug) : [...filter.projects, project.slug],
          })}>
            <ProjectThumbnail size="xs" name={project.name} src={project.image} />
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {filter.projects.length > 0 && <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => go({ projects: [] })}>{m.inbox.filters.clearProjects}</DropdownMenuItem>
        </>}
      </FilterMenu>
      {hasNarrowing(filter) && <Button variant="ghost" busy={clearing} onClick={() => { if (!clearing) startClear(() => router.push(routes.inbox())); }}>
        <RotateCcw aria-hidden />
        {m.inbox.filters.clear}
      </Button>}
      <SearchInput className="ml-auto" width={320} value={filter.q ?? undefined} label={m.inbox.search.label} placeholder={m.inbox.search.placeholder} onSearch={q => go({ q: q === "" ? null : q })} />
    </div>
  );
}
