import { toneOf } from "@/lib/tone";

/**
 * 이름에서 뽑은 색(`lib/tone.ts`)을 Tailwind 클래스로 옮긴다. **판정은 `lib/`, 클래스는 여기**가
 * 든다 — `STATUS_VARIANT`와 같은 형이고, `lib/`가 Tailwind를 알면 그 규칙이 두 층에 걸친다.
 *
 * ⚠️ **소비자가 둘이고 형이 같다** — 사용자 아바타 폴백과 프로젝트 목록 행의 아이콘이 모두
 * 채운 배경 + 흰 글리프다. 글리프만 색을 드는 판(`toneText`)도 잠깐 있었는데 **소비자가 0이 되어
 * 걷어냈다** — 쓰는 곳이 생길 때 세 줄로 되돌린다.
 *
 * ⚠️ **클래스를 문자열 리터럴로 적는다** — `bg-${tone}-600`으로 조립하면 Tailwind가 정적 추출을
 * 못 해 색이 통째로 빠진다 (bugshot-2가 `grid-cols-N`에서 같은 이유로 맵을 쓴다).
 *
 * ⚠️ **`-600`으로 통일한다.** `-500`이 더 밝지만 amber·lime 계열에서 흰 글자가 안 읽혀, 색마다
 * 단계를 다르게 두면 여덟이 같은 계열로 안 보인다.
 */
const FILL = {
  rose: "bg-rose-600",
  orange: "bg-orange-600",
  amber: "bg-amber-600",
  emerald: "bg-emerald-600",
  teal: "bg-teal-600",
  sky: "bg-sky-600",
  indigo: "bg-indigo-600",
  fuchsia: "bg-fuchsia-600",
} as const;

/** 채운 표면 — 배경이 색이고 그 위 글자·글리프가 흰색인 자리. */
export function toneFill(name: string): string {
  return FILL[toneOf(name)];
}

