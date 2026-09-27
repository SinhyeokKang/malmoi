// 클라이언트의 옛 해시 복귀용 잎 상수다. 파서·파일 읽기 모듈을 import하지 않는다.
export const LEGACY_ANCHORS = {
  "how-it-works": "/docs/sync#how-it-works",
  workflow: "/docs/setup/workflow#workflow",
  "allowed-actions": "/docs/setup/allowed-actions#allowed-actions",
  formats: "/docs/reference/formats#formats",
  limits: "/docs/reference/limits#limits",
  merging: "/docs/sync/merging#merging",
  nightly: "/docs/sync/nightly#nightly",
} as const;
