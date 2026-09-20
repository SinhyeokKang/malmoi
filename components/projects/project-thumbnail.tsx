import { Box } from "lucide-react";
import { ImageTile } from "@/components/ui/image-tile";
import { toneFill } from "@/components/ui/tone";

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
 * ⚠️ **테두리가 이미지·폴백 두 갈래에 똑같이 붙는다** (2026-09-20 사용자, `Avatar`와 같은 판정) —
 * 흰 배경 로고는 윤곽이 없으면 타일이 사라지고, 이미지에만 붙이면 폴백이 일어난 순간 같은 `size-7`이
 * 달라 보인다. `box-sizing: border-box`라 28px은 안 움직인다.
 *
 * ⚠️ **`object-contain`이다 — `avatar.tsx`의 `object-cover`와 다르다.** 프로젝트 이미지는 로고라
 * 잘리면 뜻이 사라지고, 사람 사진은 채워야 얼굴이 산다. 같은 유틸리티로 모으지 않는다.
 *
 * ⚠️ **깨진 URL의 폴백은 `ImageTile`이 든다** (malmoi#50) — `image`가 truthy라는 것은 "보인다"가
 * 아니다. 폴백이 없으면 Blob이 사라진 프로젝트가 빈 테두리 상자로 남는다.
 */
export function ProjectThumbnail({ name, src }: { name: string; src?: string | null }) {
  return (
    <ImageTile
      src={src}
      className="border-border flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-sm border"
      fallbackClassName={`text-white ${toneFill(name)}`}
    >
      <Box className="size-4" />
    </ImageTile>
  );
}
