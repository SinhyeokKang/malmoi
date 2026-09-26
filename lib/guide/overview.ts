/**
 * 개요(`/docs`)의 **두 갈래**(시안 `Docs.dc.html` 1a) — 어느 장을 앞에 세우고 그 장의 어느 셋을 "첫 할 일"로 보이는지는
 * **편집 판단**이라 SUMMARY에서 파생하지 않는다. 제목·설명은 SUMMARY와 각 페이지의 도입 문단이 든다(렌더러가 찾는다).
 *
 * 대상 라벨은 사전 키다(`m.publicDocs.docs`) — 이 모듈은 사전을 읽지 않는다. 모든 slug가 SUMMARY에 있는지는
 * `lib/guide/__tests__/overview.test.ts`가 본다. 나머지 목록(`More in the docs`)은 여기 없는 최상위 장 전부다.
 */
export const OVERVIEW_TRACKS = [
  { audience: "forDevelopers", chapter: "setup", pages: ["setup/create-project", "setup/workflow", "setup/members"] },
  { audience: "forTranslators", chapter: "translate", pages: ["translate/join", "translate/edit", "translate/publish"] },
] as const satisfies readonly { audience: "forDevelopers" | "forTranslators"; chapter: string; pages: readonly [string, string, string] }[];
