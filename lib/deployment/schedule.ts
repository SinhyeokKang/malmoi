/**
 * **야간 pull — hosted는 Vercel Cron(`vercel.json`), self-hosted는 스케줄러 컨테이너가 같은 경로를 같은 시각에 부른다** (self-hosting design §6).
 * 두 배포의 시각이 조용히 갈리지 않게 값의 집을 하나로 두고 `__tests__/schedule.test.ts`가 `vercel.json`과 대조한다.
 */
export const NIGHTLY_PULL = { path: "/api/pull", schedule: "0 18 * * *" } as const;
