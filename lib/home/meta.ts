import type { HomeState } from "./state";

/**
 * 오른쪽 `Project` 메타 열 (캔버스 `2a` 오른쪽 · design §3.5).
 *
 * ⚠️ **행이 상태에 따라 사라지거나 는다.** 그 규칙을 JSX의 `&&`에 흩으면 여섯 상태 × 열 행의
 * 매트릭스를 화면을 읽어야만 알 수 있고, 테스트가 전수로 들 자리가 없어진다.
 */
export type MetaRow =
  /** ⚠️ **`2c`에서 링크가 사라진다** — 지금 우리가 읽을 수 없는 자리를 링크로 두면 화면이 거짓말한다. */
  | { kind: "repository"; owner: string; name: string; href: string | null; disconnected: boolean }
  | { kind: "branch"; branch: string }
  | { kind: "surfaces"; count: number }
  | { kind: "locales"; codes: readonly string[] }
  | { kind: "keys"; count: number }
  | { kind: "members"; count: number }
  /** ⚠️ **`2b`에서 값이 둘이다** — `1d ago · failed 10m ago`. 뒤쪽이 `lastImportFailedAt`이다. */
  | { kind: "lastSync"; at: Date | null; failedAt: Date | null }
  | { kind: "lastPublish"; at: Date | null; prUrl: string | null }
  | { kind: "created"; at: Date }
  /** ⚠️ **시각만 든다** (spec §9.4) — 캔버스의 `· by Sinhyeok`을 뺀 **의도된 이탈**이다. */
  | { kind: "archived"; at: Date };

export function metaRows(input: {
  state: HomeState;
  repoOwner: string;
  repoName: string;
  baseBranch: string;
  surfaces: number;
  locales: readonly string[];
  keys: number;
  members: number;
  lastSyncAt: Date | null;
  lastImportFailedAt: Date | null;
  lastPublishedAt: Date | null;
  lastPrUrl: string | null;
  createdAt: Date;
  archivedAt: Date | null;
}): MetaRow[] {
  const disconnected = input.state === "not_connected";
  const rows: MetaRow[] = [
    {
      kind: "repository",
      owner: input.repoOwner,
      name: input.repoName,
      href: disconnected ? null : `https://github.com/${input.repoOwner}/${input.repoName}`,
      disconnected,
    },
    { kind: "branch", branch: input.baseBranch },
  ];
  // ⚠️ **표면이 하나면 행이 사라진다** (spec §9.5-4) — `1`은 정보가 아니라 자리만 먹는다.
  if (input.surfaces > 1) rows.push({ kind: "surfaces", count: input.surfaces });
  rows.push(
    { kind: "locales", codes: input.locales },
    { kind: "keys", count: input.keys },
    { kind: "members", count: input.members },
    // 실패 시각은 실패 상태에서만 나란히 선다 — 성공한 뒤에도 남으면 옛 실패를 상시로 말한다.
    { kind: "lastSync", at: input.lastSyncAt, failedAt: input.state === "import_failed" ? input.lastImportFailedAt : null },
    { kind: "lastPublish", at: input.lastPublishedAt, prUrl: input.lastPrUrl },
    { kind: "created", at: input.createdAt },
  );
  // 시각 없는 사건을 세우지 않는다 — `recentActivity`와 같은 규칙이다.
  if (input.state === "archived" && input.archivedAt !== null) rows.push({ kind: "archived", at: input.archivedAt });
  return rows;
}
