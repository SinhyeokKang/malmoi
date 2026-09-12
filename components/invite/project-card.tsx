import { Box } from "lucide-react";

import { LocaleFlag } from "@/components/translations/locale-badge";
import { toneFill } from "@/components/ui/tone";

/**
 * 초대의 프로젝트 카드 — **`components/ui/`의 프리미티브가 아니다** (account-linking design ⑩).
 *
 * 박스 규격은 `EntityCard`와 같고(같은 화면 언어여야 한다) 다른 것은 아바타·2행·우측 슬롯의
 * 내용뿐이다. 프리미티브로 올리지 않는 이유 셋이 design §7에 있다 — 요지는 `Avatar`의 폴백이
 * 이니셜인데 여기 요구는 **흰 글리프**이고, `docs/DESIGN.md`가 그 대체를 이미 거부해 뒀다는 것.
 *
 * ⚠️ **숫자를 싣지 않는다** — 키 수·멤버 수는 수락 여부를 바꾸지 않고 프로젝트 규모만 새게 한다.
 * 국기는 번역자가 **자기 언어가 있는지** 보는 값이라 남긴다.
 */
export function InviteProjectCard({
  name,
  role,
  locales,
}: {
  name: string;
  role: string;
  locales: readonly string[];
}) {
  return (
    <div className="border-border flex w-full items-center gap-3 rounded-lg border p-3">
      {/* 모양이 대상을 말한다 (DESIGN §6.4): 사람은 원, 프로젝트는 라운드 사각. */}
      <span
        aria-hidden
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-white ${toneFill(name)}`}
      >
        <Box className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-sm">{name}</span>
        <span className="text-muted-foreground truncate text-xs">{role}</span>
      </div>
      {/* ⚠️ 복수다 — 프로젝트의 로케일이 여럿이고, 매핑이 없는 코드는 `LocaleFlag`가 `null`을 낸다. */}
      <div className="flex shrink-0 items-center gap-1">
        {locales.map((code) => (
          <LocaleFlag key={code} code={code} />
        ))}
      </div>
    </div>
  );
}
