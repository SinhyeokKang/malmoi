/**
 * CLI 인자 파싱 — `scripts/ingest.ts`·`scan.ts`·`push-local.ts`가 공유한다.
 *
 * ⚠️ **값 플래그의 값은 `--`로 시작하지 않는다.** "플래그가 아닌 첫 인자"를 대상으로 삼으면
 * `pnpm ingest --adapter ts-dict ./repo`가 `ts-dict`를 디렉터리로 읽는다. 셋이 각자 짰을 때
 * `ingest`만 이 함정이 남아 있었다 — 한 곳에 두면 한 곳만 고친다.
 *
 * 순수 함수다 — `process.argv`는 호출부가 넘긴다.
 */

/** 값 플래그를 건너뛴 뒤 남는 첫 위치 인자. */
export function findTarget(argv: readonly string[], valueFlags: ReadonlySet<string>): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === undefined) continue;
    if (valueFlags.has(a)) {
      i += 1;
      continue;
    }
    if (!a.startsWith("--")) return a;
  }
  return undefined;
}

/** `--name <value>`의 첫 값. 플래그가 마지막이거나 다음 자리가 플래그면 값이 없는 것이다. */
export function flagValue(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  const value = at === -1 ? undefined : argv[at + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

/** 반복 가능한 `--name <value>` 전부. */
export function flagValues(argv: readonly string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== name) continue;
    const v = argv[i + 1];
    if (v !== undefined) out.push(v);
  }
  return out;
}

export function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(name);
}
