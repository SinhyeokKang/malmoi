import { Box } from "lucide-react";
import { toneFill } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

/** Project names are rendered beside this decorative thumbnail in both consumers. */
export function ProjectThumbnail({ name, src }: { name: string; src?: string | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-[4px]",
        !src && ["text-white", toneFill(name)],
      )}
    >
      {src ? <img src={src} alt="" className="size-full object-contain" /> : <Box className="size-4" />}
    </span>
  );
}
