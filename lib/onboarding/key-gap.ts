/**
 * ③의 "145 keys fewer" (new-project-modal design §10).
 *
 * ⚠️ **잎이다 — import가 없어야 한다.** ③이 클라이언트 컴포넌트라 이 판정을 **값으로** 읽는데,
 * `lib/onboarding/detect.ts`에 두면 그 그래프(`lib/adapters` → ts-morph)가 클라이언트 번들에
 * 7.2MB로 들어온다 (POSTMORTEM 2026-09-07 — `ref-slug.ts`가 같은 이유로 내려왔다).
 *
 * ⚠️ **키 수를 모르는 로케일에는 `undefined`다** (결정 ⑦). detect의 blob 예산(≤21) 안에서 키 수가
 * 채워지는 것은 `sampleOrder`가 고른 로케일과 사용자가 눌러 본 로케일뿐이라, 모르는 언어까지 비교하면
 * 되돌릴 수 없는 결정의 근거가 **"②에서 무엇을 눌렀는지"라는 우연한 이력**이 된다.
 *
 * 차이가 0이거나 오히려 많으면 `undefined`다 — 문구가 "fewer" 한 방향뿐이다.
 */
export function keyGap(base: number | undefined, other: number | undefined): number | undefined {
  if (base === undefined || other === undefined) return undefined;
  const gap = base - other;
  return gap > 0 ? gap : undefined;
}

