import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **되돌릴 수 있는 설정 변경은 전달 확인을 명시적으로 무효화한다** (translation-rework T7 — ARCHITECTURE §5.8).
 *
 * 적재(strict push·수동 Sync)는 증가만 하는 `importRevision`이 context 지문을 바꿔 무효화한다. 반면 base branch는
 * A → B → A로 되돌릴 수 있어 지문만으로는 **옛 확인이 부활한다** — 그래서 변경 tx 안에서 `invalidatedAt`을 쓴다.
 * 리포 id는 한 번 고정되면 바뀌지 않으므로(`connectRepository`가 다른 id를 거부한다) 지문으로 충분하다.
 *
 * ⚠️ Server Action이라 DB를 띄워 부르지 않고 소스를 센다 — 무효화 함수 자체는 `delivery-confirm.integration.ts`가 잰다.
 */
const settings = readFileSync("app/(edit)/projects/[slug]/settings/actions.ts", "utf8");

function body(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("설정 변경의 전달 확인 무효화", () => {
  it("base branch 변경은 같은 tx에서 무효화한다 — 값이 실제로 바뀐 갈래 안이다", () => {
    const update = body(settings, "updateRepositorySettings");
    const changed = update.slice(update.indexOf("if (baseBranch !== project.baseBranch)"));
    expect(changed).toMatch(/invalidateDeliveryConfirmations\(tx, projectId\)/);
    // 변경 없는 저장은 확인을 잃지 않는다 — 무효화가 no-op 판정보다 앞에 있으면 안 된다.
    expect(update.slice(0, update.indexOf("if (baseBranch !== project.baseBranch)"))).not.toMatch(/invalidateDeliveryConfirmations/);
  });
});
