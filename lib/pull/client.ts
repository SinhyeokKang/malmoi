import type { CommitPayload, TreePayload } from "./payload";

/**
 * pull이 GitHub에 요구하는 것 전부. **타입만 있고 구현이 없다** — 실제 호출은 `lib/github.ts`가,
 * 테스트용 가짜는 `lib/pull/__tests__/fake-client.ts`가 구현한다.
 *
 * **왜 인터페이스를 갈라놓나**: 오케스트레이션이 이걸 인자로 받으면 테스트가 fake를 넘겨
 * "GitHub을 몇 번 불렀나"를 셀 수 있다. spec 완료 조건 4("편집이 없으면 API 0회")의 판정 수단이
 * 이것 하나뿐이고, `lib/github.ts`를 직접 물면 그 파일의 `server-only` 때문에 테스트가 모듈을
 * **열 수조차 없다** — `lib/env.ts`·`lib/push/apply.ts`에서 이미 밟은 함정이다 (ARCHITECTURE §5.5.4).
 *
 * 메서드는 ARCHITECTURE §3의 호출 순서에 나오는 것만 둔다. 쓰지 않을 래핑을 늘리지 않는다.
 */

/** 트리의 파일 하나. 디렉터리·심링크는 호출부가 쓰지 않으므로 담지 않는다. */
export type GitTreeBlob = { path: string; sha: string };

export type GitClient = {
  /**
   * ref의 커밋 SHA. **브랜치가 없으면 `null`** — 404를 던지지 않는 것이 요지다.
   * `l10n/sync`의 부재가 첫 실행 경로(`createRef`)를 태우는 정상 입력이기 때문이다.
   *
   * @param ref `heads/dev` 형태. 슬래시 인코딩은 구현이 맡는다.
   */
  getRefSha(ref: string): Promise<string | null>;

  /**
   * 커밋의 전체 트리(recursive). **잘렸으면 던진다** — 일부만 보면 base에 있는 파일을
   * "없다"고 판정해 신규로 올리고, blob SHA 비교가 전부 틀어진다.
   */
  getTree(commitSha: string): Promise<GitTreeBlob[]>;

  /** blob 내용(UTF-8). 수술적 치환 어댑터의 write가 원본을 요구한다 (ARCHITECTURE §1.4). */
  getBlobText(sha: string): Promise<string>;

  createBlob(content: string): Promise<string>;
  createTree(payload: TreePayload): Promise<string>;
  createCommit(payload: CommitPayload): Promise<string>;

  /** 브랜치 신규 생성. `getRefSha`가 `null`을 준 경우다. */
  createRef(branch: string, sha: string): Promise<void>;
  /**
   * 브랜치를 강제로 옮긴다. **force가 의도된 것이다** — `l10n/sync`는 누적 히스토리가 아니라
   * "현재 DB 상태의 스냅샷"이다 (ARCHITECTURE §3).
   */
  updateRefForce(branch: string, sha: string): Promise<void>;

  /**
   * 열린 PR의 URL. 없으면 `null`.
   *
   * @param head **`owner:branch` 형식이어야 필터가 걸린다.** 브랜치명만 넘기면 GitHub이 필터를
   *   조용히 무시하고 전체 목록을 주므로, 재사용 판정이 무너져 PR이 중복 생성된다.
   */
  findOpenPrUrl(head: string, base: string): Promise<string | null>;

  createPr(headBranch: string, baseBranch: string, title: string, body: string): Promise<string>;
};
