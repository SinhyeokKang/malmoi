/**
 * CIMD 문서 가져오기의 SSRF 방어 — **해석된 주소**가 공개 유니캐스트인가 (mcp-oauth design §2). 이름이 아니라 주소를 본다: `evil.example`이
 * `169.254.169.254`(클라우드 메타데이터)로 풀리면 이름 검사는 아무것도 못 막는다.
 *
 * ⚠️ **거부 목록이다** — IANA 특수 목적 대역(RFC 6890 계열) 중 우리 서버가 닿으면 안 되는 것을 든다. IPv4를 품은 IPv6(`::ffff:a.b.c.d` mapped ·
 * `64:ff9b::/96` NAT64 · 옛 `::a.b.c.d` compatible)는 **품은 IPv4로** 판정한다 — 그 모양이 사설 대역 우회의 고전이다.
 * ⚠️ 주소 파싱을 직접 한다 — `net.isIP`는 모양만 보고, 정규화(`::ffff:7f00:1` ↔ `::ffff:127.0.0.1`)를 안 해 우회 모양을 놓친다.
 * ⚠️ `server-only`를 붙이지 않는다 — 순수 판정이다.
 */

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    // 선행 0은 받지 않는다 — 어떤 해석기는 8진수로 읽는다(`010` = 8).
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/** 여덟 개의 16비트 조각. 끝의 dotted IPv4 표기(`::ffff:1.2.3.4`)는 두 조각으로 바꿔 같은 길로 읽는다. */
function parseIpv6(value: string): number[] | null {
  let text = value.toLowerCase();
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (v4 === null) return null;
    text = `${text.slice(0, lastColon + 1)}${((v4[0]! << 8) | v4[1]!).toString(16)}:${((v4[2]! << 8) | v4[3]!).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const pieces = (s: string) => (s === "" ? [] : s.split(":"));
  const head = pieces(halves[0] ?? "");
  const rest = halves.length === 2 ? pieces(halves[1] ?? "") : [];
  if (![...head, ...rest].every(h => /^[0-9a-f]{1,4}$/.test(h))) return null;
  const numbers = (xs: string[]) => xs.map(h => parseInt(h, 16));
  if (halves.length === 1) return head.length === 8 ? numbers(head) : null;
  const missing = 8 - head.length - rest.length;
  if (missing < 1) return null;
  return [...numbers(head), ...Array<number>(missing).fill(0), ...numbers(rest)];
}

/** [시작 옥텟들, 접두 길이] — 접두 비트가 같으면 막힌 대역이다. */
const BLOCKED_V4: [number[], number][] = [
  [[0, 0, 0, 0], 8], [[10, 0, 0, 0], 8], [[100, 64, 0, 0], 10], [[127, 0, 0, 0], 8], [[169, 254, 0, 0], 16], [[172, 16, 0, 0], 12],
  [[192, 0, 0, 0], 24], [[192, 0, 2, 0], 24], [[192, 88, 99, 0], 24], [[192, 168, 0, 0], 16], [[198, 18, 0, 0], 15], [[198, 51, 100, 0], 24],
  [[203, 0, 113, 0], 24], [[224, 0, 0, 0], 4], [[240, 0, 0, 0], 4],
];

function v4Blocked(octets: number[]): boolean {
  const value = ((octets[0]! << 24) >>> 0) + (octets[1]! << 16) + (octets[2]! << 8) + octets[3]!;
  return BLOCKED_V4.some(([base, bits]) => {
    const start = ((base[0]! << 24) >>> 0) + (base[1]! << 16) + (base[2]! << 8) + base[3]!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((value & mask) >>> 0) === ((start & mask) >>> 0);
  });
}

function v6Blocked(h: number[]): boolean {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, last = 0] = h;
  const embedded = [g >> 8, g & 0xff, last >> 8, last & 0xff];
  // mapped `::ffff:a.b.c.d` · compatible `::a.b.c.d`(미지정·루프백 포함) → 품은 IPv4로.
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && (f === 0xffff || f === 0)) return v4Blocked(embedded);
  // NAT64 `64:ff9b::/96`.
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) return v4Blocked(embedded);
  if ((a & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if ((a & 0xffc0) === 0xfe80) return true; // 링크 로컬 fe80::/10
  if ((a & 0xffc0) === 0xfec0) return true; // 옛 site-local fec0::/10
  if ((a & 0xff00) === 0xff00) return true; // 멀티캐스트
  if (a === 0x2001 && b === 0x0db8) return true; // 문서 대역
  if (a === 0x0100 && b === 0 && c === 0 && d === 0) return true; // discard 100::/64
  return false;
}

export function isPublicAddress(address: string): boolean {
  if (address.includes(":")) {
    const hextets = parseIpv6(address);
    return hextets !== null && !v6Blocked(hextets);
  }
  const octets = parseIpv4(address);
  return octets !== null && !v4Blocked(octets);
}
