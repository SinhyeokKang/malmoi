import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { LocaleFlag } from "@/components/translations/locale-badge";
import { Badge } from "@/components/ui/badge";
import type { Trigger } from "@/lib/events/view";
import type { MetaRow } from "@/lib/home/meta";
import { m } from "@/lib/i18n";
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

export function MetaColumn({ rows, slug, now, canOpenSettings }: {
  rows: readonly MetaRow[];
  slug: string;
  now: Date;
  canOpenSettings: boolean;
}) {
  const facts = rows.filter((row) => !TIMES.includes(row.kind));
  const times = rows.filter((row) => TIMES.includes(row.kind));

  return (
    <aside className="border-border flex h-fit flex-col overflow-hidden rounded-lg border" aria-labelledby="home-meta-title">
      {/* 머리 아래 선은 머리가 긋는다(2026-10-01 4-Y1 — `PanelCard`와 한 규약) · 머리 gap은 카드 머리 한 벌이다(4-W1). */}
      <h2 id="home-meta-title" className="border-divider flex min-h-12 items-center gap-2 border-b px-4 py-3 text-base font-medium">
        {m.home.meta.title}
      </h2>
      {/* 구역 사이 선만 구역이 든다 — 머리 바로 아래 구역은 머리 선을 쓴다. */}
      <MetaGroup rows={facts} now={now} divided={false} />
      <MetaGroup rows={times} now={now} divided={facts.length > 0} />
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
function MetaGroup({ rows, now, divided }: { rows: readonly MetaRow[]; now: Date; divided: boolean }) {
  if (rows.length === 0) return null;
  return (
    <dl className={cn("flex flex-col gap-2.5 px-4 py-3.5", divided && "border-divider border-t")}>
      {rows.map((row) => (
        <div key={row.kind} className="flex items-baseline gap-3">
          <dt className="w-24 shrink-0 text-xs text-neutral-400">{m.home.meta[row.kind]}</dt>
          <dd className="min-w-0 flex-1 text-sm">{value(row, now)}</dd>
        </div>
      ))}
    </dl>
  );
}

function value(row: MetaRow, now: Date): ReactNode {
  switch (row.kind) {
    case "repository":
      return row.disconnected ? (
        <span className="flex flex-wrap items-center gap-1.5">
          {`${row.owner}/${row.name}`}
          {/* ⚠️ **링크가 사라지고 pill이 선다** — 지금 읽을 수 없는 자리를 링크로 두면 화면이 거짓말한다. */}
          {/* 배지 톤은 연결 갈래다 — 미연결 회색 · 끊김 호박 · 다른 리포 빨강(2026-09-30 상태 통일, 설정 카드와 같은 낱말). */}
          {row.problem === "wrong-repository" ? <Badge variant="missing">{m.settings.repository.wrongRepository}</Badge>
            : row.problem === "disconnected" ? <Badge variant="warning">{m.settings.repository.disconnected}</Badge>
            : <Badge variant="neutral">{m.home.meta.notConnected}</Badge>}
        </span>
      ) : (
        /*
          ⚠️ **외부 링크에 글리프를 달지 않는다** (DESIGN §6.3). 이 자리가 2026-09-16에 먼저 뺐고 —
          캔버스(`design_handoff_project_home`)의 lucide 목록에 `external-link`가 없다 — 2026-09-18에
          나머지 열이 따라왔다. 나가는 신호는 색과 `target="_blank"`가 든다.
          `home-landmarks.test.tsx`가 이 행과 아래 PR 행을 **함께** 세서 한쪽에만 되살아나지 못하게 한다.
        */
        <a
          href={row.href}
          target="_blank"
          rel="noreferrer"
          className="focus-visible:ring-ring text-blue-600 focus-visible:ring-2 focus-visible:outline-none"
        >
          {`${row.owner}/${row.name}`}
        </a>
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
            <Badge key={code} variant="neutral" className="gap-1">
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
      return (
        <span>
          {row.at === null ? m.home.meta.notSyncedYet : <>{relativeTime(row.at, now)}<TriggerBadge trigger={row.trigger} /></>}
          {/* `2b`에서만 실패가 붙는다 — `1d ago · nightly · failed 10m ago`(시각 → 주체 → 실패). */}
          {row.failedAt !== null && (
            <span className="text-destructive"> · {m.home.meta.failedAt(relativeTime(row.failedAt, now))}</span>
          )}
          {/* Never에는 아무것도 붙이지 않는다 — 주체와 같은 규칙. */}
          {/* 보류는 호박이다(2026-09-30 상태 통일). */}
          {row.at !== null && row.held === "open-pr" && <span className="text-amber-800"> · {m.home.meta.heldByOpenPr}</span>}
        </span>
      );
    case "lastPublish": {
      // ⚠️ 번호를 못 뽑으면 링크를 만들지 않는다 — 주소를 그대로 이름으로 읽히지 않는다.
      const pr = pullNumberFrom(row.prUrl);
      if (row.at === null) return m.home.meta.never;
      return pr === null || row.prUrl === null ? (
        <span>{relativeTime(row.at, now)}<TriggerBadge trigger={row.trigger} /></span>
      ) : (
        /* 캔버스는 **PR이 앞이고 시각이 뒤**다 — 이 행이 답하는 질문이 "무엇을 보냈나"라서다. */
        <span>
          {m.home.meta.pullRequest}{" "}
          {/*
            ⚠️ **글리프 없이 색만 든다** (DESIGN §6.3 — 위 리포 행과 같은 규칙). 접근 이름이 `#127`
            하나뿐이라 앞의 `{m.home.meta.pullRequest}`가 그것이 무엇인지 말하는 몫을 진다.
          */}
          <a
            href={row.prUrl}
            target="_blank"
            rel="noreferrer"
            className="focus-visible:ring-ring text-blue-600 focus-visible:ring-2 focus-visible:outline-none"
          >
            {m.home.meta.pr(pr)}
          </a>
          {` · ${relativeTime(row.at, now)}`}
          <TriggerBadge trigger={row.trigger} />
        </span>
      );
    }
    case "created":
    case "archived":
      return relativeTime(row.at, now);
  }
}

/**
 * 실행 주체 (nightly-sync 14) — Logs 사람 행의 보조줄과 같은 사전(`m.logs.meta`)에서 뽑는다. 사건이 없으면(`null`) 붙이지 않는다 —
 * 이력 도입 전 실행에 주체를 추정해 적지 않는다.
 */
const TRIGGER_WORD = { manual: m.logs.meta.manual, nightly: m.logs.meta.nightly, ci: m.logs.meta.ci } satisfies Record<Trigger, string>;

/**
 * ⚠️ **배지다, 글자가 아니다** (2026-09-30 사용자 — ` · nightly` 글자에서 바꿨다). 요약 줄 행간이 20이고 배지도 20이라 줄 높이가 안 흔들린다.
 * 앞의 ` · `를 떼고 간격(6)으로 가른다 — 배지 자체가 경계다.
 */
function TriggerBadge({ trigger }: { trigger: Trigger | null }) {
  if (trigger === null) return null;
  return <Badge variant="neutral" className="ml-1.5 align-middle">{TRIGGER_WORD[trigger]}</Badge>;
}
