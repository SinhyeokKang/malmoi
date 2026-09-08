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
        "bg-muted text-foreground/60 inline-flex shrink-0 items-center justify-center text-xs font-medium",
        shapeClass,
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
