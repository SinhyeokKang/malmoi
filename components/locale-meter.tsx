import { LocaleFlag } from "@/components/translations/locale-badge";
import type { RowLocaleProgress } from "@/lib/projects/list";

/**
 * 목록 행의 **로케일 Meter** (DESIGN §6.63). 시안 `1c`의 Meter 블록이 정본이고,
 * 아래 치수는 그 캔버스의 인라인 스타일에서 그대로 인용했다.
 *
 * ⚠️ **서버 컴포넌트다** — 상태가 없고 값은 서버가 이미 접어서 준다(`rowLocaleProgress`).
 *
 * ⚠️ **두 구간이 겹치지 않는다.** 완료는 검토 대기를 포함하지 않으므로(`done`) 두 폭의 합이 100%를
 * 넘지 않는다 — 겹치면 바가 트랙을 넘어 흐른다.
 *
 * ⚠️ **폭만 인라인 스타일이다.** 퍼센트는 데이터라 클래스로 표현할 수 없다. 나머지 치수는 전부
 * 유틸리티이고, "비슷한 유틸리티로 옮기는 것"이 이전 사이클에서 시안과 갈린 원인이었다 —
 * `gap-2.5`(10)로 `gap 16`을, `rounded-sm`(8)로 `radius 4`를 옮기면 `tsc`도 `pnpm test`도 조용하다.
 */
export function LocaleMeter({ locale }: { locale: RowLocaleProgress }) {
  // 분모가 0이면 두 폭도 0이다 — 0으로 나누지 않는다.
  const done = locale.total === 0 ? 0 : (locale.done / locale.total) * 100;
  const review = locale.total === 0 ? 0 : (locale.review / locale.total) * 100;

  return (
    <div className="flex w-25 flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs">
        {/*
          ⚠️ **`LocaleFlag`를 그대로 쓴다** — `public/flags/`에 253개가 이미 커밋돼 있고 매핑은
          `flagFor`(잎)다. 치수·radius가 시안과 이미 같으므로 **결정할 것이 없다**: 새 자산도,
          새 매핑도, `rounded-[2px]`도 만들지 않는다 (DESIGN §6.63).

          ⚠️ **국기 폭을 예약하지 않는다** — 매핑이 없으면(`es`·`pt`·`ar` 등) 그 자리가 통째로 비고,
          `gap-1.5`로 코드가 왼쪽으로 붙는다. 틀린 국기는 없는 것보다 나쁘다는 판정의 연장이다.
        */}
        <LocaleFlag code={locale.code} />
        <span className="truncate">{locale.code}</span>
        <span className="text-muted-foreground ml-auto">{locale.percent}%</span>
      </span>
      {/*
        트랙 8% · 높이 4 · 완료 `rgba(10,10,10,0.85)` · 검토 대기 `#f59e0b`.
        ⚠️ **바는 `aria-hidden`이다** — 라벨 줄의 코드와 퍼센트가 같은 사실을 글자로 말하므로
        스크린리더에 중복이 되지 않게 바만 장식으로 둔다. 완료율·검토 대기율을 함께 읽는 추가 설명은
        이번 범위에서 제외했다 (2026-09-13 사용자).
      */}
      <span aria-hidden className="bg-foreground/[0.08] flex h-1 overflow-hidden rounded-full">
        <span className="bg-foreground/85 h-1" style={{ width: `${done}%` }} />
        <span className="h-1 bg-amber-500" style={{ width: `${review}%` }} />
      </span>
    </div>
  );
}
