import { toneFill } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

/**
 * ⚠️ **모양이 대상을 말한다** (DESIGN §6.4): 사람은 원, 프로젝트는 라운드 사각. 같은 크기의 원 둘이
 * 사이드바에 나란히 있으면 프로젝트 전환과 사용자 메뉴가 구별되지 않는다.
 */
export function Avatar({
  name,
  src,
  size = 24,
  shape = "circle",
  className,
}: {
  name: string;
  src?: string | null;
  size?: 16 | 24 | 32;
  shape?: "circle" | "square";
  className?: string;
}) {
  const shapeClass = shape === "circle" ? "rounded-full" : "rounded";
  const style = { width: size, height: size };
  if (src) {
    // eslint 없는 리포다 — `next/image`를 쓰지 않는 이유는 GitHub 아바타가 외부 호스트라
    // `images.remotePatterns` 설정이 따라붙기 때문이다(면적 대비 얻는 것이 없다).
    return <img src={src} alt="" style={style} className={cn(shapeClass, "shrink-0 object-cover", className)} />;
  }
  return (
    <span
      style={style}
      aria-hidden
      className={cn(
        /**
         * ⚠️ **색이 이름에서 온다** (2026-09-11 사용자). 그 전엔 `bg-muted` 하나라 사람이 여럿인
         * 화면에서 아바타가 전부 같은 회색이었다 — 이니셜만으로는 훑을 때 안 갈린다.
         *
         * ⚠️ **글자가 흰색이다** — 채워진 배경 위라 `text-foreground/60`은 안 읽힌다.
         */
        "inline-flex shrink-0 items-center justify-center text-xs font-medium text-white",
        toneFill(name),
        shapeClass,
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
