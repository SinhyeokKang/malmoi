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
 * 오른쪽 `Project` 메타 열 (캔버스 `2a` 오른쪽 · design §3.5).
 *
 * ⚠️ **`[Project settings ›]`의 노출은 편의이고 차단이 아니다** — `/settings`의
 * `requireProjectAccess({ permission: "project:settings" })`가 실제 방어선이다 (CLAUDE.md).
 */
export function MetaColumn({ rows, slug, now, canOpenSettings }: {
  rows: readonly MetaRow[];
  slug: string;
  now: Date;
  canOpenSettings: boolean;
}) {
  return (
    <aside className="border-border h-fit rounded-xl border" aria-labelledby="home-meta-title">
      <h2 id="home-meta-title" className="border-border border-b p-3.5 text-sm font-medium">
        {m.home.meta.title}
      </h2>
      <dl className="flex flex-col gap-2.5 p-3.5 text-xs">
        {rows.map((row) => (
          <div key={row.kind} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground shrink-0">{label(row)}</dt>
            <dd className="min-w-0 text-right">{value(row, now)}</dd>
          </div>
        ))}
      </dl>
      {canOpenSettings && (
        <div className="border-border border-t p-3.5">
          <Link
            href={routes.settings(slug)}
            className="focus-visible:ring-ring text-muted-foreground inline-flex items-center gap-0.5 text-xs focus-visible:ring-2 focus-visible:outline-none"
          >
            {m.home.meta.settings}
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      )}
    </aside>
  );
}

function label(row: MetaRow): string {
  return m.home.meta[row.kind];
}

function value(row: MetaRow, now: Date): ReactNode {
  switch (row.kind) {
    case "repository":
      return row.href === null ? (
        <span className="flex items-center justify-end gap-1.5">
          {`${row.owner}/${row.name}`}
          {/* ⚠️ **링크가 사라지고 pill이 선다** — 지금 읽을 수 없는 자리를 링크로 두면 화면이 거짓말한다. */}
          <Badge variant="warning">{m.home.meta.notConnected}</Badge>
        </span>
      ) : (
        <a
          href={row.href}
          target="_blank"
          rel="noreferrer"
          className="focus-visible:ring-ring inline-flex items-baseline gap-1 text-blue-600 focus-visible:ring-2 focus-visible:outline-none"
        >
          {`${row.owner}/${row.name}`}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      );
    case "branch":
      return row.branch;
    case "surfaces":
      return row.count;
    case "locales":
      /* ⚠️ 매핑이 없는 코드는 `LocaleFlag`가 `null`을 낸다 — 물음표·지구본을 대신 그리지 않는다. */
      return (
        <span className="flex flex-wrap items-center justify-end gap-1">
          {row.codes.map((code) => (
            <LocaleFlag key={code} code={code} />
          ))}
        </span>
      );
    case "keys":
    case "members":
      return row.count;
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
      return (
        <span>
          {row.at === null ? m.home.meta.never : relativeTime(row.at, now)}
          {pr !== null && row.prUrl !== null && (
            <>
              {" · "}
              <a
                href={row.prUrl}
                target="_blank"
                rel="noreferrer"
                className="focus-visible:ring-ring text-blue-600 focus-visible:ring-2 focus-visible:outline-none"
              >
                {m.home.meta.pr(pr)}
              </a>
            </>
          )}
        </span>
      );
    }
    case "created":
    case "archived":
      return relativeTime(row.at, now);
  }
}
