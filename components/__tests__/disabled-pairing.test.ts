// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

/**
 * **"비활성화 + 스피너"가 한 자리에서만 정의되는지 센다** (2026-09-17 사용자).
 *
 * pending 표시의 정본은 `Button`의 `loading`이고 그것이 거는 것은 **`disabled` 속성 하나**다 —
 * 회색으로 죽는 것도 커서가 바뀌는 것도 cva의 `disabled:` 유틸리티가 만드는 부수효과다
 * (DESIGN §6.4). ⚠️ **그런데 `disabled`를 못 쓰는 자리가 계속 생긴다**: `<a>`에는 없는 속성이고
 * (`NewProjectButton`), Radix Dialog 트리거는 `disabled`면 닫을 때 포커스를 잃는다(`SyncButton`).
 *
 * 그 자리들이 각자 `aria-disabled:` 철자를 발명해 **같은 pending이 화면마다 다르게 보였다** —
 * 로그인은 회색 + not-allowed, Home sync는 글자만 회색, New project는 커서만 바뀌었다. 세 벌이
 * 생기고 나서야 사용자가 발견했다.
 *
 * ⚠️ **`import.meta.url`로 루트를 잡을 수 없다** — jsdom에서 그 값이 `file:`이 아니라
 * `fileURLToPath`가 던진다 (`focus-ring.test.ts`가 같은 이유로 `process.cwd()`를 쓴다).
 */
const ROOT = process.cwd();
const BUTTON = "components/ui/button.tsx";
const SKIP = new Set(["__tests__", "node_modules"]);

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

const read = (rel: string): string => stripComments(readFileSync(join(ROOT, rel), "utf8"));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * `disabled:bg-muted` → `bg-muted`.
 *
 * ⚠️ **앞의 `(?<![\w-])`가 이 파일의 전부다** — 없으면 `aria-disabled:bg-muted`가 `disabled:`
 * 쪽에도 잡혀 두 집합이 **항상 같아지고**, 아래 검사들이 무엇도 안 재는 채로 영원히 green이 된다.
 */
const utilities = (source: string, prefix: string): Set<string> =>
  new Set([...source.matchAll(new RegExp(`(?<![\\w-])${prefix}:([^\\s"'\`]+)`, "g"))].map((match) => match[1]!));

/**
 * ⚠️ **짝이 어긋나는 것을 막는 것이 이 파일의 본체다.** variant를 새로 만드는 사람은 `disabled:`만
 * 적고, 그 순간 `<a>`·Radix 트리거 쪽만 조용히 다른 모양이 된다 — 화면에도 테스트에도 안 나타난다.
 *
 * ⚠️ **`hover:`는 양방향 모두 예외다** (2026-09-17 실측). 브라우저는 진짜 `disabled`에 hover를 안
 * 태우므로 `disabled:hover:*`는 **한 번도 적용된 적 없는 죽은 규칙**이고, `aria-disabled`에서는
 * 타므로 그쪽엔 규칙이 **반드시** 필요하다. 즉 두 축은 같은 값일 수 없다 — `disabled:hover:bg-transparent`를
 * 그대로 복제했다가 `default`·`danger`의 배경이 흰색에서 투명으로 떨어지는 것을 브라우저 computed
 * style이 잡았다. **짝을 강제하면 그 복제를 도로 강요하게 된다.**
 */
it("buttonClass의 disabled: 유틸리티마다 aria-disabled: 짝이 있다 (hover: 제외)", () => {
  const source = read(BUTTON);
  const real = utilities(source, "disabled");
  const aria = utilities(source, "aria-disabled");
  expect(real.size).toBeGreaterThan(0);
  expect([...real].filter((u) => !aria.has(u) && !u.startsWith("hover:")).sort()).toEqual([]);
});

/**
 * 역방향도 막는다 — `aria-disabled:`만 있고 `disabled:`가 없으면 진짜 `<button>`이 그 모양을
 * 못 받는다. 두 검사가 함께 있어야 "한 자리에서 정의된다"가 참이 된다.
 *
 * ⚠️ **`hover:`만 예외다.** 브라우저는 진짜 `disabled` 요소에 hover를 안 태우므로 그쪽엔 짝이
 * 필요 없고, `aria-disabled`는 태우므로 **이쪽에만** 필요하다 — 없으면 회색으로 죽은 버튼이
 * hover에서 다시 살아난다. 예외를 `hover:`로 좁혀 두는 것이 요지다: 넓히면 이 검사가 아무것도
 * 안 막는다.
 */
it("buttonClass의 aria-disabled: 유틸리티마다 disabled: 짝이 있다 (hover: 제외)", () => {
  const source = read(BUTTON);
  const real = utilities(source, "disabled");
  const aria = utilities(source, "aria-disabled");
  expect(aria.size).toBeGreaterThan(0);
  const unpaired = [...aria].filter((u) => !real.has(u) && !u.startsWith("hover:"));
  expect(unpaired.sort()).toEqual([]);
  // 예외가 실제로 쓰이고 있는지도 본다 — 안 쓰이면 위 문단이 죽은 설명이다.
  expect([...aria].some((u) => u.startsWith("hover:"))).toBe(true);
});

/**
 * ⚠️ **소비자가 철자를 발명하지 못하게 한다.** 위 두 검사만 있으면 프리미티브는 옳은데 소비자가
 * 그 위에 자기 값을 덧칠하는 오늘의 상태가 그대로 통과한다 — 실제로 `sync-button`과
 * `new-project-button`이 그랬다. `aria-disabled` **속성**을 세우는 것은 자유이고, 막는 것은
 * **그 모양을 직접 그리는 것**뿐이다.
 */
it("aria-disabled: 스타일을 buttonClass 밖에서 쓰지 않는다", () => {
  const offenders = sourceFiles(join(ROOT, "components"))
    .concat(sourceFiles(join(ROOT, "app")))
    .map((full) => full.slice(ROOT.length + 1))
    .filter((rel) => rel !== BUTTON)
    .filter((rel) => utilities(read(rel), "aria-disabled").size > 0);
  expect(offenders.sort()).toEqual([]);
});
