import { formatMinute, type DateStyle } from "@/lib/date-format";

/**
 * 재시도 가능 시각의 표기 — 보는 사람의 시간대(기본 UTC)로 말하는 절대 시각이고(CLAUDE.md 날짜 규칙) **분 단위로 올린다**.
 * 내리면 "12:00 이후"를 보고 12:00에 눌러 다시 막힌다.
 */
export function retryAtLabel(iso: string, style: DateStyle): string {
  const ms = new Date(iso).getTime();
  const minute = 60_000;
  return formatMinute(new Date(Math.ceil(ms / minute) * minute), style);
}
