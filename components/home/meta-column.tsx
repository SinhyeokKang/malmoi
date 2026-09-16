import { ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { LocaleFlag } from "@/components/translations/locale-badge";
import { Badge } from "@/components/ui/badge";
import type { MetaRow } from "@/lib/home/meta";
import { m } from "@/lib/i18n";
import { pullNumberFrom } from "@/lib/projects/remote-plan";
import { relativeTime } from "@/lib/relative-time";
import { routes } from "@/lib/routes";

/**
 * 오른쪽 `Project` 메타 열 — **변하지 않는 사실만** (캔버스 `2a` 오른쪽 · design §3.5).
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
      <h2 id="home-meta-title" className="p-4 text-base font-medium">
        {m.home.meta.title}
      </h2>
      <MetaGroup rows={facts} now={now} />
      <MetaGroup rows={times} now={now} />
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
function MetaGroup({ rows, now }: { rows: readonly MetaRow[]; now: Date }) {
  if (rows.length === 0) return null;
  return (
    <dl className="border-divider flex flex-col gap-2.5 border-t px-4 py-3.5">
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
          <Badge variant="warning">{m.home.meta.notConnected}</Badge>
        </span>
      ) : (
        /*
          ⚠️ **이 링크만 `ExternalLink`를 안 단다** — 두 정본이 같은 답을 준다: 캔버스
          (`design_handoff_project_home`)의 lucide 목록에 `external-link`가 없고 `2a`가 "리포 주소와
          PR 번호만 링크"라고만 적으며, `docs/DESIGN.md` §6.3이 글리프를 다는 외부 링크 여덟을 이름으로
          열거하는데 **"Home의 PR 링크"는 있고 이 리포 링크는 없다.** 바로 아래 `lastPublish`의 PR
          링크는 그 목록에 있으므로 글리프를 그대로 든다 — `home-landmarks.test.tsx`가 그 **비대칭**을
          센다(한쪽만 고치지 못하게).
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
        <span className="flex flex-wrap items-center gap-2.5">
          {row.codes.map((code) => (
            <span key={code} className="inline-flex items-center gap-1.5">
              <LocaleFlag code={code} />
              {code}
            </span>
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
          {row.at === null ? m.home.meta.never : relativeTime(row.at, now)}
          {/* `2b`에서만 값이 둘이다 — `1d ago · failed 10m ago`. */}
          {row.failedAt !== null && (
            <span className="text-destructive"> · {m.home.meta.failedAt(relativeTime(row.failedAt, now))}</span>
          )}
        </span>
      );
    case "lastPublish": {
      // ⚠️ 번호를 못 뽑으면 링크를 만들지 않는다 — 주소를 그대로 이름으로 읽히지 않는다.
      const pr = pullNumberFrom(row.prUrl);
      if (row.at === null) return m.home.meta.never;
      return pr === null || row.prUrl === null ? (
        relativeTime(row.at, now)
      ) : (
        /* 캔버스는 **PR이 앞이고 시각이 뒤**다 — 이 행이 답하는 질문이 "무엇을 보냈나"라서다. */
        <span>
          {m.home.meta.pullRequest}{" "}
          {/*
            ⚠️ **리포 밖으로 나가는 링크는 전부 색 + `ExternalLink` 12px이다** (DESIGN §6.3이 이 자리를
            이름으로 든다). 아이콘이 빠지면 예고 없이 새 탭이 열리고, 접근 이름도 `#127` 하나가 된다.
          */}
          <a
            href={row.prUrl}
            target="_blank"
            rel="noreferrer"
            className="focus-visible:ring-ring inline-flex items-baseline gap-1 text-blue-600 focus-visible:ring-2 focus-visible:outline-none"
          >
            {m.home.meta.pr(pr)}
            <ExternalLink className="size-3" aria-hidden />
          </a>
          {` · ${relativeTime(row.at, now)}`}
        </span>
      );
    }
    case "created":
    case "archived":
      return relativeTime(row.at, now);
  }
}
