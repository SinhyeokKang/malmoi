#!/usr/bin/env bash
# 셀프 호스팅 이미지를 GHCR에 발행한다 — `scripts/publish-image.sh v<x.y.z>`.
#
# 호출자가 둘이고 절차는 이 파일 하나다: `.github/workflows/image.yml`(Release 이벤트·dispatch)과 Actions 장애 때의
# 비상 경로(`/merge` 9-b). ghcr.io 로그인과 `docker buildx create --driver docker-container`는 호출자가 한다.
#
# - 존재 조회는 3분기다(POSTMORTEM 2026-09-03 — 실패한 조회를 "없음"으로 읽었다). 있으면 빌드하지 않고, 실측한
#   not-found 문구와 **바이트까지 같을 때만** 빌드로 간다. 그 밖(인증·네트워크·`command not found`)은 fail-closed다 —
#   발행된 태그를 덮어쓰는 경로에 들어가지 않는다. 부분 문자열로 맞추지 않는다.
# - 이미지 이름은 소문자 리터럴이다 — `github.repository_owner`(`SinhyeokKang`)는 도커 참조로 무효다.
# - 빌드 입력은 태그 커밋의 `git archive`다 — 작업 트리가 어느 커밋이든 같은 context가 나간다. 그래서 워크플로가 태그가
#   아니라 자기 커밋을 체크아웃하고(태그에 이 스크립트가 없어도 된다), 비밀은 context에 실리지 않는다.
# - `( … ) &&` 꼴을 쓰지 않는다(POSTMORTEM 2026-10-09 — 조건 문맥 subshell은 errexit를 끈다). 실패는 `if !`로 받아 exit 1.
# - bash 3.2 호환(macOS 비상 경로). 도구는 PATH로 찾는다 — 테스트 대역이 PATH 앞에 선다. JSON은 jq 없이 읽는다.
#
# stdout은 정확히 한 줄 — `published <digest>` / `exists <digest>` / `mismatch <metadata digest> <registry digest>`.
# 진행 로그는 전부 stderr다. 종료 코드: 0 = published·exists, 1 = 실패·mismatch, 2 = 인자 오류.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: scripts/publish-image.sh v<x.y.z>" >&2
  exit 2
fi
tag=$1
# 셸 정규식은 값 전체에 걸린다 — 줄 단위인 `grep -E`는 개행 섞인 값을 통과시킨다. action 태그도 여기서 걸러진다.
tag_pattern='^v[0-9]+\.[0-9]+\.[0-9]+$'
if ! [[ "$tag" =~ $tag_pattern ]]; then
  echo "publish-image: not an app release tag: $tag" >&2
  exit 2
fi
ref="ghcr.io/sinhyeokkang/malmoi:$tag"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

report() {
  printf '%s\n' "$1"
  if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"; fi
}

publish_output() {
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then printf 'digest=%s\n' "$1" >> "$GITHUB_OUTPUT"; fi
}

inspect() {
  docker buildx imagetools inspect "$ref" --format '{{json .Manifest}}' > "$work/inspect.out" 2> "$work/inspect.err"
}

# `{{json .Manifest}}`는 2칸 들여쓰기 JSON이고 `"digest"`가 index·플랫폼 manifest·attestation 셋이다(2026-10-12 실측).
# 최상위(들여쓰기 2칸) 줄만 읽고 정확히 하나가 아니면 실패한다 — 첫 매치에 기대면 출력 순서가 바뀌는 날 자식을 고른다.
index_digest() {
  local line found="" count=0 pattern='^  "digest": "(sha256:[0-9a-f]{64})",?$'
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ $pattern ]]; then
      found=${BASH_REMATCH[1]}
      count=$((count + 1))
    fi
  done < "$1"
  if [[ $count -ne 1 ]]; then
    echo "publish-image: expected one top-level digest in imagetools output, found $count" >&2
    return 1
  fi
  printf '%s\n' "$found"
}

if ! sha=$(git rev-parse --verify "$tag^{commit}"); then
  echo "publish-image: tag not found locally: $tag (fetch it first)" >&2
  exit 1
fi
if ! git cat-file -e "$sha:Dockerfile"; then
  echo "publish-image: $tag has no Dockerfile (tags before v1.3.0 are not published)" >&2
  exit 1
fi

if inspect; then
  if ! digest=$(index_digest "$work/inspect.out"); then exit 1; fi
  report "exists $digest"
  publish_output "$digest"
  exit 0
fi
# `$(…)`는 끝 개행을 전부 벗기므로 `x`를 덧대 바이트 그대로 견준다.
if [[ "$(cat "$work/inspect.err"; printf x)" != "ERROR: $ref: not found"$'\n'x ]]; then
  cat "$work/inspect.err" >&2
  echo "publish-image: registry lookup failed — not treating it as missing" >&2
  exit 1
fi

if ! git archive "$sha" | docker buildx build --platform linux/amd64 --push -t "$ref" --metadata-file "$work/metadata.json" - >&2; then
  echo "publish-image: build or push failed" >&2
  exit 1
fi

metadata=$(cat "$work/metadata.json")
metadata_pattern='"containerimage\.digest": *"(sha256:[0-9a-f]{64})"'
if ! [[ "$metadata" =~ $metadata_pattern ]]; then
  echo "publish-image: containerimage.digest missing from build metadata" >&2
  exit 1
fi
built=${BASH_REMATCH[1]}

if ! inspect; then
  cat "$work/inspect.err" >&2
  echo "publish-image: registry lookup after push failed" >&2
  exit 1
fi
if ! registry=$(index_digest "$work/inspect.out"); then exit 1; fi

if [[ "$built" != "$registry" ]]; then
  report "mismatch $built $registry"
  exit 1
fi
report "published $registry"
publish_output "$registry"
