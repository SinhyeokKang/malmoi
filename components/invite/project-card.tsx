import { Box } from "lucide-react";

import { LocaleFlag } from "@/components/translations/locale-badge";
import { toneFill } from "@/components/ui/tone";

/**
 * 초대의 프로젝트 카드 — **`components/ui/`의 프리미티브가 아니다**.
 *
 * 박스 규격은 `EntityCard`와 같고(같은 화면 언어여야 한다) 다른 것은 아바타·2행·우측 슬롯의
 * 내용뿐이다. 프리미티브로 올리지 않는 이유 셋이 DESIGN §6.4에 있다 — 요지는 `Avatar`의 폴백이
 * 이니셜인데 여기 요구는 **흰 글리프**이고, `docs/DESIGN.md`가 그 대체를 이미 거부해 뒀다는 것.
 *
 * ⚠️ **숫자를 싣지 않는다** — 키 수·멤버 수는 수락 여부를 바꾸지 않고 프로젝트 규모만 새게 한다.
 * 국기는 번역자가 **자기 언어가 있는지** 보는 값이라 남긴다.
 */
export function InviteProjectCard({
  name,
  image,
  role,
  locales,
}: {
  name: string;
  image?: string | null;
  role: string;
  locales: readonly string[];
}) {
  return (
    <div className="border-border flex w-full items-center gap-3 rounded-lg border p-3">
      {/*
        모양이 대상을 말한다 (DESIGN §6.4): 사람은 원, 프로젝트는 라운드 사각.

        ⚠️ **radius가 `rounded-sm`(8)이다 — 프로젝트 목록 행의 아이콘과 같은 값이다** (2026-09-12 실측:
        그쪽은 `size-7 rounded-sm`이고 여기가 `rounded-lg`(12)였다). 같은 대상을 가리키는 표식이
        화면마다 다른 모서리를 가지면 그것이 같은 것이라는 신호가 죽는다. DESIGN §6.4의 표도 8을 적었다.

        ⚠️ **테두리(`border-border`)도 `ProjectThumbnail`·`Avatar`와 같은 값이다** (2026-09-20 사용자) —
        같은 대상을 가리키는 타일이 화면마다 윤곽 유무가 갈리면 모서리가 갈리는 것과 같은 손실이다.

        ⚠️ **`overflow-hidden`도 목록과 같다** — 프로젝트 이미지가 생기는 날 이 배경이 그대로 그
        이미지의 자리가 된다(`app/(edit)/projects/page.tsx`의 같은 주석).
      */}
      <span
        aria-hidden
        className={`border-border flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border text-white ${image ? "" : toneFill(name)}`}
      >
        {image ? <img src={image} alt="" className="size-full object-contain" /> : <Box className="size-4" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-sm">{name}</span>
        <span className="text-muted-foreground truncate text-xs">{role}</span>
      </div>
      {/* ⚠️ 복수다 — 프로젝트의 로케일이 여럿이고, 매핑이 없는 코드는 `LocaleFlag`가 `null`을 낸다. */}
      <div className="flex max-w-1/2 shrink-0 flex-wrap items-center justify-end gap-1">
        {locales.map((code) => (
          <LocaleFlag key={code} code={code} />
        ))}
      </div>
    </div>
  );
}
