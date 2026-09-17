import { Box } from "lucide-react";
import { toneFill } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

/**
 * 프로젝트를 가리키는 타일. 소비자는 목록 행·Home 머리 **둘**이고, 초대 카드는 같은 규격을 자기
 * 화면 조각으로 든다(§6.4의 `EntityCard` 문단이 그 예외를 적는다).
 *
 * ⚠️ **타일은 이름의 일부이지 링크가 아니다** — Home에서는 프로젝트 안이라 자기 자신으로 가는
 * 링크가 될 자리이고, 그것은 죽은 컨트롤이다. 목록에서는 행 전체가 이미 링크다.
 *
 * ⚠️ **색이 프로젝트 이름에서 온다** — 사용자 아바타와 **같은 판정**(`lib/tone.ts`)이고 입력만
 * 다르다. 목록을 훑을 때 행을 가르는 것이 이름 글자보다 색이 먼저다. Home 머리가 2026-09-17까지
 * 고정 `bg-foreground`였고, 같은 프로젝트가 화면마다 다른 색으로 보였다 (POSTMORTEM 2026-09-17).
 *
 * ⚠️ **radius가 `rounded-sm`(8)이고 캔버스의 4가 아니다** (2026-09-17 사용자). 같은 대상을
 * 가리키는 표식이 화면마다 다른 모서리를 가지면 같은 것이라는 신호가 죽는데, 초대 카드가 8이다
 * (§6.4 — 그쪽은 2026-09-12에 12에서 8로 내려왔다). **세 화면을 한 값으로 모으는 쪽을 골랐다.**
 * DESIGN §6.63의 이탈 표가 그 판정의 정본이다.
 *
 * ⚠️ **`object-contain`이다 — `avatar.tsx`의 `object-cover`와 다르다.** 프로젝트 이미지는 로고라
 * 잘리면 뜻이 사라지고, 사람 사진은 채워야 얼굴이 산다. 같은 유틸리티로 모으지 않는다.
 */
export function ProjectThumbnail({ name, src }: { name: string; src?: string | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-sm",
        !src && ["text-white", toneFill(name)],
      )}
    >
      {src ? <img src={src} alt="" className="size-full object-contain" /> : <Box className="size-4" />}
    </span>
  );
}
