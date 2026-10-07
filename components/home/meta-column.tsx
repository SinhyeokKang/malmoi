import { Link as InlineLink } from "@/components/ui/link";
import { Fact } from "@/components/ui/facts";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { LateHold, LatePrState, MetaTabs } from "@/components/home/meta-tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import type { LogKind } from "@/lib/events/payload";
import type { Trigger } from "@/lib/events/view";
import type { HomeLate, MetaTabs as Tabs, ProjectTabRow, PublishTabRow, SyncTabRow } from "@/lib/home/meta";
import { pullNumberFrom } from "@/lib/projects/remote-plan";
import { relativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import type { UiLocale } from "@/lib/i18n/locales";
import type { Messages } from "@/lib/i18n";

/**
 * 오른쪽 `Project` 메타 열 — **사실만** 든다 (project-card-tabs · DESIGN §6.64). 탭 셋 `Project` · `Sync` · `Publish`이고 착지할 때마다 `Project`다.
 * 실패의 "무엇을 하라"와 상태·사유는 배너·`Needs your attention`이 든다.
 *
 * ⚠️ **한 행 = 라벨 하나 + 사실 하나** — 옛 `Last sync`는 주체 · 성공 시각 · 실패 · 보류를 `·`로 한 줄에 붙여 어느 조각이 어느 사실인지 안 읽혔다.
 * 행의 유무는 `metaTabs`가 정하고 여기는 kind별 모양만 든다.
 *
 * ⚠️ **서버가 패널을 렌더하고 탭 껍데기(`MetaTabs`)만 클라이언트다** — 상대 시각·PR 번호·사전 문구가 서버에 남는다.
 *
 * ⚠️ **바닥 링크는 탭마다 하나이고 패널 안에 있다** — 높이가 탭을 따른다. `[Settings ›]`의 노출은 편의이고 차단이 아니다 —
 * `/settings`의 `requireProjectAccess({ permission: "project:settings" })`가 실제 방어선이다 (CLAUDE.md).
 */
export function MetaColumn({ tabs, slug, now, canOpenSettings, late, uiLocale, m }: {
  tabs: Tabs;
  slug: string;
  now: Date;
  canOpenSettings: boolean;
  /**
   * 열린 PR 조회에 달린 Hold · PR state — **본문을 막지 않고 늦게 도착한다**(malmoi#107). `planHomeHold`가 promise를 낼 때만 온다(편집 0 · 게이트 있음).
   * 없으면 `tabs`의 `hold` 행이 결론이다.
   */
  late?: Promise<HomeLate>;
  uiLocale: UiLocale;
  m: Messages;
}) {
  const sync = tabs.sync.map((group, i) => group.map((row) => syncFact(m, uiLocale, row, now)).concat(
    // 늦게 오는 Hold는 마지막 묶음 끝에 붙는다 — 첫 렌더에 아는 Hold(`hold` 행)와 같은 자리다.
    late !== undefined && tabs.lateHold && i === tabs.sync.length - 1 ? [<LateHold key="late-hold"><HoldRow m={m} /></LateHold>] : [],
  ));
  return (
    // 보이는 머리가 없어 이름은 aria-label이 든다 — 첫 탭도 `Project`지만 역할(랜드마크 vs 탭)이 갈라 준다.
    <aside className="border-border flex h-fit flex-col overflow-hidden rounded-lg border" aria-label={m.home.meta.title}>
      <MetaTabs
        label={m.home.meta.tabs.list}
        identity={slug}
        late={late}
        tabs={[
          {
            value: "project", label: m.home.meta.tabs.project,
            panel: <Panel groups={tabs.project.map((group) => group.map((row) => projectFact(m, uiLocale, row, slug, now)))}
              footer={canOpenSettings ? <FooterLink href={routes.settings(slug)}>{m.home.meta.settings}</FooterLink> : null} />,
          },
          {
            value: "sync", label: m.home.meta.tabs.sync,
            panel: <Panel groups={sync} footer={<FooterLink href={logsOf(slug, "imports")}>{m.home.meta.syncLogs}</FooterLink>} />,
          },
          {
            value: "publish", label: m.home.meta.tabs.publish,
            panel: <Panel groups={tabs.publish.map((group) => group.map((row) => publishFact(m, uiLocale, row, now)))}
              footer={<FooterLink href={logsOf(slug, "publish")}>{m.home.meta.publishLogs}</FooterLink>} />,
          },
        ]}
      />
    </aside>
  );
}

/** Logs를 그 종류로 좁혀 연다 — `kind`는 Logs가 읽는 화면 낱말(`LOG_KINDS`)이다. 이력이 없어도 선다(빈 목록은 Logs의 빈 상태가 말한다). */
function logsOf(slug: string, kind: LogKind): string {
  return routes.logs(slug, { kind });
}

/**
 * ⚠️ **묶음 사이만 선이다** — 첫 묶음은 탭 머리 선을 쓴다. 라벨 폭 96 고정 + 값 오른쪽 정렬(`dir` 아님)이라 값의 끝이 한 열로 선다.
 */
function Panel({ groups, footer }: { groups: ReactNode[][]; footer: ReactNode }) {
  return (
    <>
      {groups.map((facts, i) => (
        <dl key={i} className={cn("flex flex-col gap-2.5 px-4 py-3.5", i > 0 && "border-divider border-t")}>{facts}</dl>
      ))}
      {footer}
    </>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="focus-visible:ring-ring hover:bg-foreground/[0.02] border-divider flex items-center justify-center gap-0.5 border-t px-4 py-3 text-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none"
    >
      {children}
      <ChevronRight className="text-muted-foreground size-4" aria-hidden />
    </Link>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <Fact width={96} align="end" label={label}>{children}</Fact>;
}

/**
 * 회색 평문 값(`Never` · `Not recorded`) — **muted(#737373)**다(시안 v3 `2a`·`2f`, malmoi#180). ⚠️ `Fact dimmed`(라벨 톤 `text-gray-dim`)를 쓰지 않는다 —
 * 값이 라벨과 같은 톤이면 둘째 라벨처럼 읽힌다. 공용 `dimmed`의 기본값은 다른 소비자가 쓰므로 바꾸지 않는다.
 */
function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

// 로케일을 고정한다 — 서버 로케일에 따라 구분자가 갈리면 같은 DB 상태가 다른 화면을 낸다.
const count = (n: number) => n.toLocaleString("en-US");

function projectFact(m: Messages, uiLocale: UiLocale, row: ProjectTabRow, slug: string, now: Date): ReactNode {
  const label = m.home.meta[row.kind];
  switch (row.kind) {
    case "repository":
      /*
        ⚠️ **외부 링크에 글리프를 달지 않는다** (DESIGN §6.3) — 나가는 신호는 색과 `target="_blank"`가 든다. `home-landmarks.test.tsx`가
        이 행과 PR 행을 **함께** 세서 한쪽에만 되살아나지 못하게 한다. 파랑은 GitHub으로 나가는 것뿐이다(리포 · PR) — 앱 안 이동은 검정 + chevron.
        ⚠️ **연결이 정상이 아니면 평문이다** — 지금 읽을 수 없는 자리를 링크로 두면 화면이 거짓말한다(상태는 Connection 행이 든다).
      */
      return (
        <Row key={row.kind} label={label}>
          {row.linked ? <InlineLink href={row.href} target="_blank" rel="noreferrer">{`${row.owner}/${row.name}`}</InlineLink> : `${row.owner}/${row.name}`}
        </Row>
      );
    case "connection":
      // 배지 키는 설정 카드와 같은 판정(`repositoryConnectionState`)이다 — 연결 확인 실패는 끊김이 아니라 `Couldn't check`다.
      return <Row key={row.kind} label={label}><StatusBadge state={row.state} /></Row>;
    case "branch":
      return <Row key={row.kind} label={label}>{row.branch}</Row>;
    case "ci":
      return <Row key={row.kind} label={label}>{row.configured ? m.home.meta.configured : m.home.meta.notSetUp}</Row>;
    case "sources":
      // 로케일은 이 열에 없다 — Sources 상세가 소유한다(PRODUCT §7.7 결정 4). 이 행이 그 화면으로 가는 길이다.
      return (
        <Row key={row.kind} label={label}>
          <Link href={routes.sources(slug)} className="focus-visible:ring-ring inline-flex items-center gap-0.5 rounded-sm focus-visible:ring-2 focus-visible:outline-none">
            {count(row.count)}
            <ChevronRight className="text-muted-foreground size-4" aria-hidden />
          </Link>
        </Row>
      );
    case "keys":
      return <Row key={row.kind} label={label}>{count(row.count)}</Row>;
    case "members":
      return <Row key={row.kind} label={label}>{m.home.meta.memberCount(row.count, row.pending)}</Row>;
    case "created":
    case "archived":
      return <Row key={row.kind} label={label}>{relativeTime(row.at, now, uiLocale)}</Row>;
  }
}

function syncFact(m: Messages, uiLocale: UiLocale, row: SyncTabRow, now: Date): ReactNode {
  const label = m.home.meta[row.kind];
  switch (row.kind) {
    case "lastSync":
      if (row.value === "notSyncedYet") return <Row key={row.kind} label={label}><StatusBadge state="notSyncedYet" /></Row>;
      if (row.value === "unrecorded") return <Row key={row.kind} label={label}><Muted>{m.home.meta.unrecorded}</Muted></Row>;
      return <Row key={row.kind} label={label}><TriggerBadge trigger={row.value} kind="IMPORT" m={m} /></Row>;
    case "synced":
      return <Row key={row.kind} label={label}>{relativeTime(row.at, now, uiLocale)}</Row>;
    case "result":
      return <Row key={row.kind} label={label}><StatusBadge state={row.state} /></Row>;
    case "changed":
      return <Row key={row.kind} label={label}>{m.home.meta.values(row.values)}</Row>;
    case "keysSeen":
      return <Row key={row.kind} label={label}>{count(row.count)}</Row>;
    case "sources":
      return <Row key={row.kind} label={label}>{row.slugs.join(", ")}</Row>;
    case "hold":
      return <HoldRow key={row.kind} m={m} />;
  }
}

/** 보류 — 사유가 셋이어도 낱말은 `Held` 하나다(DESIGN §2.4). 사유 문장은 `To send` 카드 보조 줄이 든다. 첫 렌더·늦은 도착이 같은 모양이다. */
function HoldRow({ m }: { m: Messages }) {
  return <Row label={m.home.meta.hold}><StatusBadge state="held" /></Row>;
}

function publishFact(m: Messages, uiLocale: UiLocale, row: PublishTabRow, now: Date): ReactNode {
  const label = m.home.meta[row.kind];
  switch (row.kind) {
    case "lastPublish":
      if (row.value === "never") return <Row key={row.kind} label={label}><Muted>{m.home.meta.never}</Muted></Row>;
      return <Row key={row.kind} label={label}><TriggerBadge trigger={row.value} kind="PUBLISH" m={m} /></Row>;
    case "published":
      return <Row key={row.kind} label={label}>{relativeTime(row.at, now, uiLocale)}</Row>;
    case "pullRequest": {
      // ⚠️ 번호를 못 뽑으면 링크를 만들지 않는다 — 주소를 그대로 이름으로 읽히지 않는다.
      const pr = pullNumberFrom(row.href);
      // 리포 행과 같은 규칙 — 글리프 없이 색만, 연결이 정상이 아니면 평문.
      if (pr === null) return <Row key={row.kind} label={label}>—</Row>;
      return (
        <Row key={row.kind} label={label}>
          {row.linked ? <InlineLink href={row.href} target="_blank" rel="noreferrer">{m.home.meta.pr(pr)}</InlineLink> : m.home.meta.pr(pr)}
        </Row>
      );
    }
    case "prState":
      // 새 GitHub 호출이 없다 — 보류 판정이 이미 부른 조회의 결론이 늦게 도착해 채운다. 그때까지 56px 스켈레톤이 자리를 잡는다.
      return (
        <Row key={row.kind} label={label}>
          <LatePrState
            pending={<Skeleton size="sm" className="w-14" />}
            values={{ prOpen: <StatusBadge state="prOpen" />, notOpen: m.home.meta.notOpen, couldNotCheck: <StatusBadge state="prCheckFailed" /> }}
          />
        </Row>
      );
    case "changed":
      return <Row key={row.kind} label={label}>{m.home.meta.values(row.values)}</Row>;
    case "sources":
      return <Row key={row.kind} label={label}>{row.slugs.join(", ")}</Row>;
  }
}

/**
 * 실행 주체 (nightly-sync 14) — **Logs 보조줄과 같은 실행 종류 배지**다(4-Y19 — `Manual sync`·`Nightly publish` …, `m.logs.meta.runType`).
 * 이 탭은 성공 실행이 있을 때만 이 배지를 세우므로 주체가 언제나 있다.
 */
function TriggerBadge({ trigger, kind, m }: { trigger: Trigger; kind: "IMPORT" | "PUBLISH";
  m: Messages;
}) {
  return <Badge variant="soft-neutral">{m.logs.meta.runType[kind][trigger]}</Badge>;
}
