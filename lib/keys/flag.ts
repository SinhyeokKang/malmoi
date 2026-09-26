/**
 * 로케일 코드 → 국기 파일 id, 또는 `null` (8-4 — DESIGN §6.1).
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
 * 리포가 보유한 국기 파일 (`public/flags/<id>.svg`) — **ISO 3166-1 alpha-2 소문자 253개**.
 *
 * ⚠️ **fs 스캔이 아니라 코드 상수다** — 이 모듈은 순수해야 하고(잎), 로케일 배지가 `?ns=*`에서
 * 2,709번 렌더되는 트리에 산다. 목록과 실제 파일이 어긋나면 **배경이 조용히 빈다** — 오류도 경고도
 * 없으므로 `lib/keys/__tests__/flag-assets.test.ts`가 둘을 양방향으로 대조한다.
 *
 * ⚠️ **전 세트를 들이는 것이 결정이다** (2026-09-11). 로케일은 **고객마다 다른 축**이라
 * 쓸 것만 골라 두면 새 로케일이 들어올 때마다 에셋을 찾아야 한다 — `pt-BR`·`es-MX` 같은 지역
 * 하위태그가 아무 설정 없이 서는 것이 이 목록의 값이다.
 *
 * ⚠️ **파일 원본은 `country-flag-icons@1.6.20`의 `3x2/`(MIT)다** (2026-09-27 — `public/flags/LICENSE`).
 * 처음 들인 세트는 출처·라이선스를 모르는 Figma 커뮤니티 파일이라 교체했다. 원본의 265개 중
 * **이 목록에 든 것만** 복사한다 — `bq-*`·`es-ct`·`gb-eng`·`gb-nir`·`gb-sct`·`gb-wls`는 alpha-2가
 * 아니라 로케일 하위태그로 안 오고, `ic`·`xa`·`xc`·`xo`는 ISO에 배정되지 않은 코드다.
 */
export const FLAG_INVENTORY: readonly string[] = [
  "ac", "ad", "ae", "af", "ag", "ai", "al", "am", "ao", "aq", "ar", "as", "at", "au", "aw", "ax",
  "az", "ba", "bb", "bd", "be", "bf", "bg", "bh", "bi", "bj", "bl", "bm", "bn", "bo", "bq", "br",
  "bs", "bt", "bv", "bw", "by", "bz", "ca", "cc", "cd", "cf", "cg", "ch", "ci", "ck", "cl", "cm",
  "cn", "co", "cr", "cu", "cv", "cw", "cx", "cy", "cz", "de", "dj", "dk", "dm", "do", "dz", "ec",
  "ee", "eg", "eh", "er", "es", "et", "eu", "fi", "fj", "fk", "fm", "fo", "fr", "ga", "gb", "gd",
  "ge", "gf", "gg", "gh", "gi", "gl", "gm", "gn", "gp", "gq", "gr", "gs", "gt", "gu", "gw", "gy",
  "hk", "hm", "hn", "hr", "ht", "hu", "id", "ie", "il", "im", "in", "io", "iq", "ir", "is", "it",
  "je", "jm", "jo", "jp", "ke", "kg", "kh", "ki", "km", "kn", "kp", "kr", "kw", "ky", "kz", "la",
  "lb", "lc", "li", "lk", "lr", "ls", "lt", "lu", "lv", "ly", "ma", "mc", "md", "me", "mf", "mg",
  "mh", "mk", "ml", "mm", "mn", "mo", "mp", "mq", "mr", "ms", "mt", "mu", "mv", "mw", "mx", "my",
  "mz", "na", "nc", "ne", "nf", "ng", "ni", "nl", "no", "np", "nr", "nu", "nz", "om", "pa", "pe",
  "pf", "pg", "ph", "pk", "pl", "pm", "pn", "pr", "ps", "pt", "pw", "py", "qa", "re", "ro", "rs",
  "ru", "rw", "sa", "sb", "sc", "sd", "se", "sg", "sh", "si", "sj", "sk", "sl", "sm", "sn", "so",
  "sr", "ss", "st", "sv", "sx", "sy", "sz", "ta", "tc", "td", "tf", "tg", "th", "tj", "tk", "tl",
  "tm", "tn", "to", "tr", "tt", "tv", "tw", "tz", "ua", "ug", "um", "us", "uy", "uz", "va", "vc",
  "ve", "vg", "vi", "vn", "vu", "wf", "ws", "xk", "ye", "yt", "za", "zm", "zw",
];

/**
 * 언어 → 국가. **알고리즘이 낼 수 있는 답이 아니라 표에만 담긴다** — `en → gb`는 시안의 선택이다.
 *
 * 이 표가 답하는 것은 **하위태그가 없을 때뿐**이다. 사용자가 못 박은 세 규칙이 그 경계를 보여 준다
 * (2026-09-11): `en` → GB(이 표) · `en-GB` → GB(하위태그) · `en-US` → US(하위태그). **앞의 하나만
 * 표의 몫이고 뒤의 둘은 `flagFor`의 순서가 이미 낸다** — 표에 지역별 항목을 더하면 규칙이 두 벌이 된다.
 *
 * ⚠️ **`Map`이다** — 조회 키가 리포의 로케일 코드(남이 정한 값)라 객체 조회는 `__proto__`에서
 * 프로토타입을 돌려준다.
 *
 * ⚠️ **기준이 "언어명과 나라가 사실상 1:1"이다** (2026-09-11 사용자). 지어내지 않는다는 규칙은
 * 그대로이고, 여기 든 것들은 **고를 여지가 없어서** 지어내는 것이 아니다 — 체코어를 쓰는 나라가
 * 체코 말고 없다.
 *
 * ⚠️ **일부러 뺀 것들이 있고, 그게 이 표의 경계다.** 주요 사용국이 둘 이상이라 **고르는 순간
 * 절반에게 틀린 국기**가 되는 것들이다: `es`(ES·MX·AR…) · `pt`(PT·BR) · `ar`(22개국) ·
 * `sw`(KE·TZ) · `ta`(IN·LK·SG) · `ca`·`eu`·`gl`(한 나라 안의 지역어) · `cy`.
 * **틀린 국기는 없는 것보다 나쁘다** — 그쪽은 `null`로 떨어져 코드만 그린다.
 * ⚠️ 다만 **`es-MX`·`pt-BR`처럼 하위태그가 붙으면 정확히 선다** — 그 경우 이 표를 지나지 않는다.
 */
export const LANGUAGE_FLAGS = new Map<string, string>([
  // 시안이 이름으로 적은 다섯.
  ["ko", "kr"],
  ["en", "gb"],
  ["ja", "jp"],
  ["zh", "cn"],
  ["fr", "fr"],

  // 유럽 — 언어명과 나라가 사실상 1:1인 것들.
  ["de", "de"], ["it", "it"], ["ru", "ru"], ["nl", "nl"], ["pl", "pl"],
  ["cs", "cz"], ["sk", "sk"], ["hu", "hu"], ["ro", "ro"], ["bg", "bg"],
  ["hr", "hr"], ["sr", "rs"], ["bs", "ba"], ["sq", "al"], ["mk", "mk"],
  ["uk", "ua"], ["be", "by"], ["el", "gr"], ["mt", "mt"], ["ga", "ie"],
  ["fi", "fi"], ["da", "dk"], ["sv", "se"], ["is", "is"],
  ["et", "ee"], ["lv", "lv"], ["lt", "lt"],

  /**
   * ⚠️ **노르웨이어는 코드가 셋인데 나라가 하나다** — `no`(매크로) · `nb`(보크몰) · `nn`(뉘노르스크).
   * 셋 다 오므로 셋 다 적는다.
   */
  ["no", "no"], ["nb", "no"], ["nn", "no"],

  // 아시아·중동.
  ["tr", "tr"], ["he", "il"], ["fa", "ir"], ["hi", "in"], ["ur", "pk"],
  ["bn", "bd"], ["ne", "np"], ["th", "th"], ["vi", "vn"], ["km", "kh"],
  ["lo", "la"], ["id", "id"], ["ka", "ge"], ["hy", "am"], ["az", "az"],
  ["kk", "kz"], ["uz", "uz"], ["mn", "mn"],

  /**
   * ⚠️ **여기 두 쌍은 오타로 보이지만 맞다.** 언어 코드와 국가 코드가 서로 엇갈려 겹친다:
   *
   * - `ms`(말레이어) → **`my`**(말레이시아) / `my`(버마어) → **`mm`**(미얀마)
   * - `sl`(슬로베니아어) → **`si`**(슬로베니아) / `si`(싱할라어) → **`lk`**(스리랑카)
   *
   * 고치려 들기 전에 이 줄을 읽는다.
   */
  ["ms", "my"], ["my", "mm"],
  ["sl", "si"], ["si", "lk"],

  // 아프리카 — 같은 기준.
  ["am", "et"], ["af", "za"],

  // 필리핀어는 두 코드가 같은 언어를 가리킨다.
  ["fil", "ph"], ["tl", "ph"],
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
