/**
 * 로케일 코드 → 국기 파일 id, 또는 `null` (8-4 — spec Q4).
 *
 * ⚠️ **잎이다 — import가 0이다.** 로케일 배지가 `?ns=*`에서 2,709번 렌더되고 그 트리가
 * 클라이언트다. `lib/keys/view.ts`를 하나라도 물면 `compareKeys` → `lib/adapters/shared` 그래프가
 * 번들에 따라온다 (POSTMORTEM 2026-09-07 — 7.2MB 청크). **재수출도 하지 않는다.**
 *
 * ⚠️ **매핑은 원리적으로 실패한다** — 언어와 국가는 같은 축이 아니다(`ar`에 나라가 없고 `en`은
 * 여럿이다). 그래서 계약은 성공 사례가 아니라 **실패했을 때 무엇을 그리는가**이고, 답은
 * **아무것도 안 그린다(코드만)** 이다. 물음표·지구본은 모르는 것을 아이콘으로 주장하는 것이라
 * 쓰지 않는다.
 */

/**
 * 리포가 보유한 국기 파일 (`public/flags/<id>.svg`).
 *
 * ⚠️ **fs 스캔이 아니라 코드 상수다** — 이 모듈은 순수해야 한다. 목록과 실제 파일이 어긋나면
 * 배경이 조용히 비므로 `lib/keys/__tests__/flag-assets.test.ts`가 둘을 대조한다.
 *
 * ⚠️ **비어 있는 것이 정상 상태다** (2026-09-11): 국기 SVG는 사용자가 export 해서 준다
 * (`ui-rework/README.md` 규약 2). 그때까지 모든 로케일이 폴백으로 서고 화면은 성립한다 —
 * 그래서 에셋이 이 배송의 blocker가 아니었다.
 *
 * 새 국기를 더하려면 **이 목록 · 아래 표 · `app/globals.css`의 규칙 셋을 함께** 고친다.
 */
export const FLAG_INVENTORY: readonly string[] = [];

/**
 * 언어 → 국가. **알고리즘이 낼 수 있는 답이 아니라 표에만 담긴다** — `en → gb`는 시안의 선택이다.
 *
 * ⚠️ **`Map`이다** — 조회 키가 리포의 로케일 코드(남이 정한 값)라 객체 조회는 `__proto__`에서
 * 프로토타입을 돌려준다.
 *
 * ⚠️ **넓히지 않는다.** 지금 든 다섯은 시안과 design §3.7이 이름으로 적은 것뿐이고, 나머지는
 * 에셋과 함께 오는 **첫 매핑 목록**(T0)이 정한다 — 지어내면 리포의 로케일과 어긋난다.
 */
const LANGUAGE_FLAGS = new Map<string, string>([
  ["ko", "kr"],
  ["en", "gb"],
  ["ja", "jp"],
  ["zh", "cn"],
  ["fr", "fr"],
]);

/**
 * @param code 리포에서 온 로케일 코드 — **임의 문자열이다.**
 * @param inventory 보유 목록. 인자인 이유는 에셋 도착 전에도 매핑 규칙을 잴 수 있게 하려는 것이다.
 * @returns 국기 파일 id, 또는 `null`(코드만 그린다).
 */
export function flagFor(code: string, inventory: readonly string[] = FLAG_INVENTORY): string | null {
  // ⚠️ `_`와 `-`를 같게 본다 — 리포 파일명이 둘 다 쓴다 (`planBaseLocaleChange`가 이미 겪은 자리다).
  const parts = code.toLowerCase().split(/[-_]/);
  const language = parts[0] ?? "";
  const region = parts.length > 1 ? parts[parts.length - 1] : undefined;

  // 하위태그가 이긴다 — `zh-CN`은 중국 국기이고 그것이 언어 표보다 구체적이다.
  if (region !== undefined && /^[a-z]{2}$/.test(region) && inventory.includes(region)) return region;

  const mapped = LANGUAGE_FLAGS.get(language);
  return mapped !== undefined && inventory.includes(mapped) ? mapped : null;
}
