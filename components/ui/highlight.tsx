export function Highlight({ segments }: { segments: readonly { text: string; match: boolean }[] }) {
  return <>{segments.map((part, index) => part.match ? (
    <mark key={index} className="rounded-[3px] bg-link/[0.14] px-px text-inherit">{part.text}</mark>
  ) : part.text)}</>;
}
