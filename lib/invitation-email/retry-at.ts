import { utcMinute } from "@/lib/utc-time";

/**
 * 재시도 가능 시각의 표기 — UTC 절대 시각(CLAUDE.md 날짜 규칙)이고 **분 단위로 올린다**.
 * 내리면 "12:00 이후"를 보고 12:00에 눌러 다시 막힌다.
 */
export function retryAtLabel(iso: string): string {
  const ms = new Date(iso).getTime();
  const minute = 60_000;
  return utcMinute(new Date(Math.ceil(ms / minute) * minute));
}
