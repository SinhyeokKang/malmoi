import { Link as InlineLink } from "@/components/ui/link";
import { Fact } from "@/components/ui/facts";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { HoldLater } from "@/components/home/hold-later";
import { LocaleFlag } from "@/components/translations/locale-badge";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Trigger } from "@/lib/events/view";
import type { MetaRow } from "@/lib/home/meta";
import { connectionState } from "@/lib/home/state";
import { m } from "@/lib/i18n";
import type { HoldReason } from "@/lib/protection/plan";
import { pullNumberFrom } from "@/lib/projects/remote-plan";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

/**
 * 오른쪽 `Project` 메타 열 — **변하지 않는 사실만** (캔버스 `2a` 오른쪽 · DESIGN §6.64).
 *
 * ⚠️ **구역이 둘이다** — 리포의 모양(주소·브랜치·표면·로케일·키·멤버)과 **시각**(마지막 Sync·
 * 마지막 Publish·생성·보관). 한 덩어리로 두면 아홉 행이 균질한 표가 되어 "언제"를 찾는 눈이
 * 위에서부터 훑어야 한다.
 *
 * ⚠️ **`[Project settings ›]`의 노출은 편의이고 차단이 아니다** — `/settings`의
 * `requireProjectAccess({ permission: "project:settings" })`가 실제 방어선이다 (CLAUDE.md).
 */

/** 시각을 드는 행들 — 아래 구역으로 내려간다. */
const TIMES: readonly MetaRow["kind"][] = ["lastSync", "lastPublish", "created", "archived"];

export function MetaColumn({ rows, slug, now, canOpenSettings, heldLater }: {
  rows: readonly MetaRow[];
  slug: string;
  now: Date;
  canOpenSettings: boolean;
  /**
   * 열린 PR 조회에 달린 보류 사유 — **본문을 막지 않고 늦게 도착한다**(ux-drift-unify Q6 · malmoi#107 — 클라이언트 섬 `HoldLater`가 받는다). 없으면 `Last sync` 행의 `held`가 결론이다.
   * `planHomeHold`가 promise를 낼 때만 온다(편집 0 · 게이트 있음).
   */
  heldLater?: Promise<HoldReason | null>;
}) {
  const facts = rows.filter((row) => !TIMES.includes(row.kind));
  const times = rows.filter((row) => TIMES.includes(row.kind));

  return (
    <aside className="border-border flex h-fit flex-col overflow-hidden rounded-lg border" aria-labelledby="home-meta-title">
      {/* 머리 아래 선은 머리가 긋는다(2026-10-01 4-Y1 — `Card`와 한 규약) · 머리 gap은 카드 머리 한 벌이다(4-W1). */}
      <h2 id="home-meta-title" className="border-divider flex min-h-12 items-center gap-2 border-b px-4 py-3 text-base font-medium">
        {m.home.meta.title}
      </h2>
      {/* 구역 사이 선만 구역이 든다 — 머리 바로 아래 구역은 머리 선을 쓴다. */}
      <MetaGroup rows={facts} now={now} divided={false} />
      <MetaGroup rows={times} now={now} divided={facts.length > 0} heldLater={heldLater} slug={slug} />
      {canOpenSettings && (
        <Link
          href={routes.settings(slug)}
          className="focus-visible:ring-ring hover:bg-foreground/[0.02] border-divider flex items-center justify-center gap-0.5 border-t px-4 py-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          {m.home.meta.settings}
          <ChevronRight className="text-muted-foreground size-4" aria-hidden />
        </Link>
      )}
    </aside>
  );
}

/**
 * ⚠️ **라벨 폭이 96으로 고정이다** — `justify-between`으로 벌리면 값의 시작 위치가 라벨 길이를 따라
 * 행마다 달라지고, 아홉 행이 한 열로 안 읽힌다.
 */
function MetaGroup({ rows, now, divided, heldLater, slug }: { rows: readonly MetaRow[]; now: Date; divided: boolean; heldLater?: Promise<HoldReason | null>; slug?: string }) {
  if (rows.length === 0) return null;
  return (
    <dl className={cn("flex flex-col gap-2.5 px-4 py-3.5", divided && "border-divider border-t")}>
      {rows.map((row) => (
        <Fact key={row.kind} width={96} label={m.home.meta[row.kind]}>{value(row, now, heldLater, slug)}</Fact>
      ))}
    </dl>
  );
}

function value(row: MetaRow, now: Date, heldLater?: Promise<HoldReason | null>, slug = ""): ReactNode {
  switch (row.kind) {
    case "repository":
      return row.disconnected ? (
        <span className="flex flex-wrap items-center gap-1.5">
          {`${row.owner}/${row.name}`}
          {/* ⚠️ **링크가 사라지고 pill이 선다** — 지금 읽을 수 없는 자리를 링크로 두면 화면이 거짓말한다. */}
          {/* 배지는 연결 갈래의 상태 키다 — 미연결 회색 · 끊김 호박 · 다른 리포 빨강(DESIGN §2.4, 설정 카드와 같은 `STATE` 행). */}
          <StatusBadge state={connectionState(row.problem)} />
        </span>
      ) : (
        /*
          ⚠️ **외부 링크에 글리프를 달지 않는다** (DESIGN §6.3). 이 자리가 2026-09-16에 먼저 뺐고 —
          캔버스(`design_handoff_project_home`)의 lucide 목록에 `external-link`가 없다 — 2026-09-18에
          나머지 열이 따라왔다. 나가는 신호는 색과 `target="_blank"`가 든다.
          `home-landmarks.test.tsx`가 이 행과 아래 PR 행을 **함께** 세서 한쪽에만 되살아나지 못하게 한다.
        */
        <InlineLink
          href={row.href}
          target="_blank"
          rel="noreferrer"

        >
          {`${row.owner}/${row.name}`}
        </InlineLink>
      );
    case "branch":
      return row.branch;
    case "surfaces":
      return row.count;
    case "locales":
      /* ⚠️ 매핑이 없는 코드는 `LocaleFlag`가 `null`을 낸다 — 물음표·지구본을 대신 그리지 않는다. */
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          {row.codes.map((code) => (
            // 국기 + 코드는 배지 하나다(2026-09-30 사용자 — 프로젝트 행 Meter 머리와 같은 모양).
            <Badge key={code} variant="soft-neutral" className="gap-1">
              <LocaleFlag code={code} />
              {code}
            </Badge>
          ))}
        </span>
      );
    case "keys":
    case "members":
      // 로케일을 고정한다 — 서버 로케일에 따라 구분자가 갈리면 같은 DB 상태가 다른 화면을 낸다.
      return row.count.toLocaleString("en-US");
    case "lastSync":
      /*
        ⚠️ **배지가 먼저고 사실이 뒤다** (4-Y19 — Logs 보조줄의 `[배지…] 사실` 문법) — `[Nightly sync] 1d ago · [Sync failed] 10m ago · [Held]`.
        상태 조각이 색 글자가 아니라 배지다(4-W11 — 옛 붉은 `failed 10m ago` · 호박 `held until …`). 첫 동기화 전에는 아무것도 붙이지 않는다.
      */
      if (row.at === null) return m.home.meta.notSyncedYet;
      return (
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span><TriggerBadge trigger={row.trigger} kind="IMPORT" />{relativeTime(row.at, now)}</span>
          {/* `2b`에서만 선다 — 일부 반영은 `Partially synced`다(🔴 A2, "failed"로 말하지 않는다). */}
          {row.failed !== null && <span>· <StatusBadge state={row.failed.state} className="mr-1.5 align-middle" />{relativeTime(row.failed.at, now)}</span>}
          {/* 보류는 지금의 판정이다(ux-drift-unify Q6) — 사유 문장은 `To send` 카드 보조 줄이 든다. PR에 달린 사유는 늦게 도착한다. */}
          {/* 늦게 도착하는 사유는 클라이언트 섬이 effect로 받는다 — `use()`로 받으면 `?event=`·재검증 전환이 조회를 기다린다(U7 r1). */}
          {heldLater === undefined ? <Held reason={row.held} /> : <HoldLater hold={heldLater} as="badge" identity={slug} />}
        </span>
      );
    case "lastPublish": {
      // ⚠️ 번호를 못 뽑으면 링크를 만들지 않는다 — 주소를 그대로 이름으로 읽히지 않는다.
      const pr = pullNumberFrom(row.prUrl);
      if (row.at === null) return m.home.meta.never;
      return pr === null || row.prUrl === null ? (
        <span><TriggerBadge trigger={row.trigger} kind="PUBLISH" />{relativeTime(row.at, now)}</span>
      ) : (
        /* 캔버스는 **PR이 앞이고 시각이 뒤**다 — 이 행이 답하는 질문이 "무엇을 보냈나"라서다. */
        <span>
          {m.home.meta.pullRequest}{" "}
          {/*
            ⚠️ **글리프 없이 색만 든다** (DESIGN §6.3 — 위 리포 행과 같은 규칙). 접근 이름이 `#127`
            하나뿐이라 앞의 `{m.home.meta.pullRequest}`가 그것이 무엇인지 말하는 몫을 진다.
          */}
          <InlineLink
            href={row.prUrl}
            target="_blank"
            rel="noreferrer"

          >
            {m.home.meta.pr(pr)}
          </InlineLink>
          {" · "}
          <TriggerBadge trigger={row.trigger} kind="PUBLISH" />
          {relativeTime(row.at, now)}
        </span>
      );
    }
    case "created":
    case "archived":
      return relativeTime(row.at, now);
  }
}

/** 보류 배지 — 사유가 셋이어도 낱말은 `Held` 하나다(DESIGN §2.4). 사유는 카드 보조 줄이 든다. */
function Held({ reason }: { reason: HoldReason | null }) {
  return reason === null ? null : <span>· <StatusBadge state="held" className="align-middle" /></span>;
}

/**
 * 실행 주체 (nightly-sync 14) — **Logs 보조줄과 같은 실행 종류 배지**다(4-Y19 — `Manual sync`·`Nightly publish` …, `m.logs.meta.runType`). 옛 소문자
 * `nightly`가 같은 Home의 Recent logs `Nightly sync` 옆에 섰다. 사건이 없으면(`null`) 붙이지 않는다 — 이력 도입 전 실행에 주체를 추정해 적지 않는다.
 *
 * ⚠️ **배지다, 글자가 아니다** (2026-09-30 사용자). 요약 줄 행간이 20이고 배지도 20이라 줄 높이가 안 흔들린다. 배지 자체가 경계라 `·`를 두지 않는다.
 */
function TriggerBadge({ trigger, kind }: { trigger: Trigger | null; kind: "IMPORT" | "PUBLISH" }) {
  if (trigger === null) return null;
  return <Badge variant="soft-neutral" className="mr-1.5 align-middle">{m.logs.meta.runType[kind][trigger]}</Badge>;
}
