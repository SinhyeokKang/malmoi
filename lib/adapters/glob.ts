/**
 * 글롭 매칭 — **역추적이 없다** (2026-09-10, sec-audit-2 발견 35).
 *
 * 전에는 `[^/]*`로 컴파일한 정규식이었다. 메타문자를 전부 이스케이프했으므로 주입은 아니었지만,
 * 인접한 양자 k개가 매칭 **실패** 경로에서 "n글자를 k조각으로 나누는 모든 경우"를 훑었다 —
 * ⚠️ **비용을 키우는 n이 템플릿이 아니라 매칭 대상 경로의 길이**라, 템플릿만 재는 예산으로는
 * 상한이 서지 않았다(리포 경로는 남이 정한다).
 *
 * 그래서 표를 채운다. `dp[i][j]` = "경로의 앞 i글자가 템플릿의 앞 j글자와 맞는가"이고, 각 칸이
 * 이웃 두 칸만 보므로 시간이 `템플릿 길이 × 경로 길이`로 **고정**된다. 조합을 탐색할 자리가 없다.
 *
 * ⚠️ **`*`는 `/`를 먹지 않는다** — 그것이 이 매처의 유일한 특수 규칙이고, 나머지 문자는 `?`를
 * 포함해 전부 리터럴이다. 먹게 두면 하위 디렉터리의 엉뚱한 파일이 로케일 파일로 읽힌다.
 *
 * ⚠️ 한 행은 `Uint8Array`다 — 불리언 배열을 새로 만드는 것보다 싸고, 값이 0·1뿐이라 의미가 같다.
 */
export function matchesGlob(template: string, path: string): boolean {
  // 0번째 행: 경로를 한 글자도 안 쓴 상태. 템플릿이 `*`뿐인 접두사만 참이다(빈 문자열과 맞는다).
  let previous = new Uint8Array(template.length + 1);
  previous[0] = 1;
  for (let j = 1; j <= template.length; j++) previous[j] = template[j - 1] === "*" ? previous[j - 1]! : 0;

  for (let i = 0; i < path.length; i++) {
    const next = new Uint8Array(template.length + 1);
    for (let j = 1; j <= template.length; j++) {
      const token = template[j - 1];
      next[j] = token === "*"
        // `*`는 아무것도 안 먹거나(next[j-1]) 이 글자를 먹는다(previous[j]) — 단 `/`는 못 먹는다.
        ? (next[j - 1] || (path[i] !== "/" && previous[j]) ? 1 : 0)
        // 리터럴은 글자가 같을 때만, 양쪽에서 한 칸씩 물러난 자리를 잇는다.
        : (token === path[i] ? previous[j - 1]! : 0);
    }
    previous = next;
  }
  return previous[template.length] === 1;
}
