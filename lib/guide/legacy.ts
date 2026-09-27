/**
 * 옛 `/docs#<id>` → 새 페이지 경로. 개요의 클라이언트 잎이 `location.hash`를 넣는다.
 *
 * ⚠️ **잎이다** — 클라이언트 컴포넌트가 import하므로 아무것도 import하지 않는다. 표는 인자로 받는다
 * (옛 id 일곱의 실제 표는 IA와 함께 선다).
 *
 * 해시는 남이 정한 키라 `Object.hasOwn`으로만 찾는다 — `#constructor`가 `Object.prototype`에서 찾아지면 안 된다.
 */
export function legacyAnchorTarget(hash: string, table: Readonly<Record<string, string>>): string | null {
  const id = hash.startsWith("#") ? hash.slice(1) : hash;
  return id !== "" && Object.hasOwn(table, id) ? (table[id] ?? null) : null;
}
