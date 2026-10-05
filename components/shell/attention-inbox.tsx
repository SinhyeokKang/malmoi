"use client";

import { CircleCheck, Inbox, Loader2, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadAttentionBadgeAction, openAttentionInboxAction } from "@/app/inbox/actions";
import { useMessages, useUiLocale } from "@/components/i18n/messages-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommandStatus } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRow, DropdownMenuRowSkeleton, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { IconTile } from "@/components/ui/icon-tile";
import { ListGroup } from "@/components/ui/list-group";
import { ProjectThumbnail } from "@/components/ui/project-thumbnail";
import { Skeleton } from "@/components/ui/skeleton";
import { attentionHref, attentionTile, body, tail, title } from "@/lib/home/attention-view";
import { badgeLabel, type InboxItem, type InboxPlan } from "@/lib/inbox/plan";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

type List = { status: "idle" } | { status: "ok"; plan: InboxPlan; loadedAt: Date } | { status: "failed" };

/**
 * 헤더 Inbox — 멤버 프로젝트 전체의 "지금 손볼 것" (attention-inbox · 시안 `Attention Inbox.dc.html` H1–H3 · D1–D7).
 *
 * ⚠️ **레이아웃 렌더에 싣지 않는다** — `(edit)` 레이아웃은 클라이언트 이동에서 다시 렌더되지 않아 배지가 굳고, 모든 페이지 응답에
 * 집계 쿼리를 더한다. 마운트 때 배지 Action 한 번, 열 때마다 open Action 한 번이다(실시간 갱신은 비목표).
 *
 * ⚠️ **배지 0은 메뉴가 닫힐 때 반영한다**(시안 D1) — 읽음 기록은 열 때 서버가 하지만, 열린 채 배지가 빠지면 트리거가 52 → 32로 줄어
 * 왼쪽 묶음(앱 셸 `New project` · 공개 셸 GitHub)과 세로선이 밀리고 트리거에 붙은 메뉴도 따라 움직인다. `marked: false`·`failed`면 서버 워터마크가 안 움직였으니 배지를 그대로 둔다.
 *
 * ⚠️ **골격은 첫 조회 전에만** — 다시 열면 받은 목록을 바로 보이고 뒤에서 갱신한다. 항목 key가 고정이라 응답이 와도 같은 행이
 * 다시 마운트되지 않아 로빙 포커스를 잃지 않는다(POSTMORTEM 2026-09-20 · 09-24).
 */
export function AttentionInbox() {
  const m = useMessages();
  const [unread, setUnread] = useState(0);
  const [list, setList] = useState<List>({ status: "idle" });
  const [loading, setLoading] = useState(false);
  const open = useRef(false);
  const clearOnClose = useRef(false);
  const latest = useRef(0);
  // 서버 워터마크가 실제로 움직였나 — 그 뒤 도착한 배지 수는 옛 사실이다. 실패·`marked: false` 열기는 워터마크를 안 움직였으니 배지를 버리지 않는다.
  const marked = useRef(false);

  useEffect(() => {
    void loadAttentionBadgeAction().then(result => {
      // 읽음이 기록된 뒤 도착한 배지 수로 지운 배지를 되살리지 않는다.
      if (result.status === "ok" && !marked.current) setUnread(result.unread);
    }, () => {});
  }, []);

  const load = useCallback(() => {
    const id = ++latest.current;
    setLoading(true);
    const settle = (next: List) => {
      if (id !== latest.current) return;
      setList(next);
      setLoading(false);
    };
    openAttentionInboxAction().then(result => {
      if (result.status === "ok" && result.marked) {
        marked.current = true;
        if (open.current) clearOnClose.current = true;
        else setUnread(0);
      }
      // 닫힌 뒤 도착한 marked 응답은 곧바로 "읽은 목록"으로 캐시한다 — 다음 열기가 응답 전에 이 목록을 그린다(#191).
      settle(result.status !== "ok" ? { status: "failed" } : { status: "ok", plan: result.marked && !open.current ? readAll(result.plan) : result.plan, loadedAt: result.loadedAt });
    }, () => settle({ status: "failed" }));
  }, []);

  const badge = badgeLabel(unread);
  return (
    <DropdownMenu onOpenChange={next => {
      open.current = next;
      if (next) load();
      else if (clearOnClose.current) {
        clearOnClose.current = false;
        setUnread(0);
        // ⚠️ **캐시 목록의 행 표시도 함께 지운다**(#191 · spec 7 "다음 열람부터 사라진다") — 다시 열면 응답 전에 이 목록이 그대로 그려지므로,
        // 안 지우면 이미 읽은 행에 점·sr `Unread`가 응답 도착까지 다시 선다. 응답이 오면 워터마크보다 새 행만 다시 안 읽음이다.
        setList(current => current.status === "ok" ? { ...current, plan: readAll(current.plan) } : current);
      }
    }}>
      <DropdownMenuTrigger asChild>
        {/*
          ⚠️ **ghost 기본 둘을 덮는다**(시안 H1 — DESIGN 헤더 절의 의도된 이탈): 글리프는 늘 foreground, 면은 같은 헤더 `New project` 링크와
          같은 3%이고 열린 동안도 같다. 안 읽음이 있을 때만 정사각을 푼다(32 → 52 · `9+` 58). 배지는 Button **안**의 자식이다(형제 금지 —
          POSTMORTEM 2026-09-09). 접근 이름은 하나 — 배지는 `aria-hidden`이고 이름이 실제 수를 읽는다.
        */}
        <Button size="icon-md" variant="ghost"
          aria-label={unread === 0 ? m.inbox.label : m.inbox.labelUnread(unread)}
          className={cn("text-foreground hover:bg-foreground/[0.03] data-[state=open]:bg-foreground/[0.03]", badge !== null && "w-auto gap-1 px-1.5")}>
          <Inbox className="size-4" aria-hidden />
          {badge !== null && <span data-inbox-badge aria-hidden className="flex"><Badge variant="soft-neutral">{badge}</Badge></span>}
        </Button>
      </DropdownMenuTrigger>
      {/* 그릇은 전역 검색 목록과 같은 형이다 — 폭 360, 높이 min(560, 가용), 한 겹 스크롤. 머리 제목은 없다(트리거 이름이 메뉴 이름이다). */}
      <DropdownMenuContent align="end" className="max-h-[min(560px,var(--radix-dropdown-menu-content-available-height))] w-90 p-0">
        <div className="py-2">
          {/*
            ⚠️ **로딩·빈 상태의 sr 문장은 aria-busy 밖의 region 하나가 든다**(R-B 🟡2) — busy 안의 변화는 AT가 미뤄도 되고,
            빈 상태는 메뉴 항목이 0이라 포커스로 닿지 않는다. 오류 줄은 아래 `CommandStatus`(보이는 줄)가 든다.
          */}
          <LiveStatus text={list.status === "idle" ? m.inbox.loading : list.status === "ok" && list.plan.groups.length === 0 ? m.home.attention.empty.title : ""} />
          {list.status === "idle" && <Loading />}
          {/* 상태 줄은 늘 마운트된 live region이다 — 목록 자리가 오류로 바뀌는 순간 내용만 들어와 읽힌다. */}
          <div className={list.status === "failed" ? "pb-1" : undefined}>
            <CommandStatus lines={list.status === "failed" ? [{ tone: "danger", text: m.inbox.failed }] : []} />
          </div>
          {list.status === "failed" && (
            <DropdownMenuRow disabled={loading} aria-busy={loading || undefined}
              icon={loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}
              onSelect={event => { event.preventDefault(); load(); }}>
              {m.common.retry}
            </DropdownMenuRow>
          )}
          {list.status === "ok" && (list.plan.groups.length === 0
            ? <EmptyState placement="inset" icon={CircleCheck} title={m.home.attention.empty.title} description={m.inbox.emptyDescription} />
            : list.plan.groups.map(group => (
              <ListGroup key={group.project.slug} heading={group.project.name}
                icon={<ProjectThumbnail size="xs" name={group.project.name} src={group.project.image} />}>
                {group.items.map(item => <Row key={itemKey(group.project.slug, item)} slug={group.project.slug} item={item} now={list.loadedAt} />)}
              </ListGroup>
            )))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 항목 하나 — Home `AttentionRow`와 같은 문장(굵은 사실 + 근거 꼬리, 보조줄은 아래, EDITOR 실패는 따로 한 줄 Owner 안내).
 * ⚠️ **안 읽음 점은 행 왼쪽 여백 16 안(x 5–11)에 선다** — 칩이 그룹 머리와 같은 x16에 남는다. 접근 이름 맨 앞이 sr `Unread`다.
 */
function Row({ slug, item, now }: { slug: string; item: InboxPlan["groups"][number]["items"][number]; now: Date }) {
  const m = useMessages();
  const uiLocale = useUiLocale();
  const tile = attentionTile(item);
  const Tile = tile.icon;
  const sub = title(m, item);
  return (
    <DropdownMenuRow href={attentionHref(slug, item)} className="relative"
      icon={<>
        {item.unread && <>
          <span className="sr-only">{m.inbox.unread}</span>
          <span data-unread-dot aria-hidden className="bg-primary absolute top-1/2 left-1.25 size-1.5 -translate-y-1/2 rounded-full" />
        </>}
        <IconTile tone={tile.tone}><Tile aria-hidden /></IconTile>
      </>}
      title={<span className="text-pretty"><span className="font-medium">{body(m, item)}</span>{tail(m, item)}</span>}
      description={sub === "" && !item.ownerRetries ? undefined : <>
        {sub !== "" && <span className="block truncate">{sub}</span>}
        {item.ownerRetries && <span className="mt-copy-gap block">{m.projects.importFailure.ownerRetries}</span>}
      </>}
      // 시각은 시안의 짧은 형(`12m ago`)이다 — 360 메뉴의 문장 칸(226)을 지킨다(#190). Home 카드는 긴 형 그대로다.
      aside={item.at === null ? undefined : <span className="text-muted-foreground shrink-0 text-xs">{relativeTime(item.at, now, uiLocale, { style: "narrow" })}</span>}
    />
  );
}

/**
 * sr 상태 문장 — region이 **먼저 빈 채로 서고** 문장은 한 박자 뒤에 들어온다. 메뉴 면은 열 때마다 새로 마운트되므로, 문장과 함께
 * 나타나는 region은 낭독이 보장되지 않는다(`CommandStatus` 머리 주석과 같은 이유).
 */
const ANNOUNCE_DELAY_MS = 100;
function LiveStatus({ text }: { text: string }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setShown(text), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return <div data-inbox-live role="status" aria-live="polite" className="sr-only">{shown}</div>;
}

/** 첫 조회 전 골격 — 그룹 머리 한 줄 + 행 셋. 메뉴 항목이 0개라 ↓는 아무 데도 가지 않는다. `aria-busy`는 골격에만 선다(상태 문장은 `LiveStatus`). */
function Loading() {
  return <div aria-hidden aria-busy="true">
    <ListGroup heading={<Skeleton size="xs" className="w-24" />} icon={<Skeleton className="size-4" />}>
      <DropdownMenuRowSkeleton widths={["w-[88%]", "w-[40%]"]} />
      <DropdownMenuRowSkeleton widths={["w-[72%]", "w-[32%]"]} />
      <DropdownMenuRowSkeleton widths={["w-[80%]", "w-[44%]"]} />
    </ListGroup>
  </div>;
}

/** 읽음이 기록된 목록 — 행의 안 읽음 표시만 내린다(순서·항목은 그대로). */
function readAll(plan: InboxPlan): InboxPlan {
  return { ...plan, groups: plan.groups.map(group => ({ ...group, items: group.items.map(item => ({ ...item, unread: false })) })) };
}

/** 종류·프로젝트·표면·로케일이 키다 — 응답이 와도 같은 행이 같은 노드로 남는다. */
function itemKey(slug: string, item: InboxItem): string {
  return `${item.kind}:${slug}:${"surfaceSlug" in item ? item.surfaceSlug : ""}:${"code" in item ? item.code : ""}`;
}
