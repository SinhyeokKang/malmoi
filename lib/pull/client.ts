import type { CommitPayload, TreePayload } from "./payload";

/**
 * pull이 GitHub에 요구하는 것 전부. **타입만 있고 구현이 없다** — 실제 호출은 `lib/github.ts`가,
 * 테스트용 가짜는 `lib/pull/__tests__/fake-client.ts`가 구현한다.
 *
 * **왜 인터페이스를 갈라놓나**: 오케스트레이션이 이걸 인자로 받으면 테스트가 fake를 넘겨
 * "GitHub을 몇 번 불렀나"를 셀 수 있다. spec 완료 조건 4("편집이 없으면 API 0회")의 판정 수단이
 * 이것 하나뿐이다. `lib/github.ts`를 직접 물면 octokit이 실 네트워크를 잡으려 들고 App 자격증명이
 * 필요해진다 — 인터페이스로 갈라 fake를 주입하는 것이 호출 수를 셀 유일한 방법이다. (전 서술은
 * "그 파일의 `server-only` 때문"이었는데 `lib/github.ts`는 일부러 안 붙였다 — 2026-09-04 audit #38.)
 *
 * 메서드는 ARCHITECTURE §3의 호출 순서에 나오는 것만 둔다. 쓰지 않을 래핑을 늘리지 않는다.
 */

/** 트리의 파일 하나. 디렉터리·심링크는 호출부가 쓰지 않으므로 담지 않는다. */
export type GitTreeBlob = { path: string; sha: string; size?: number };

/**
 * compare가 돌려주는 변경 파일 하나. **`previous_filename`은 rename에만 있다** — GitHub이 그때만
 * 채우고, 그 둘 중 하나가 로케일 경로면 변경으로 센다 (projects-list design §3.4).
 */
export type ChangedFile = { filename: string; previous_filename?: string };

export type GitClient = {
  /**
   * ref의 커밋 SHA. **브랜치가 없으면 `null`** — 404를 던지지 않는 것이 요지다.
   * `l10n/sync`의 부재가 첫 실행 경로(`createRef`)를 태우는 정상 입력이기 때문이다.
   *
   * ⚠️ **`null`은 "권한이 없다"일 수도 있다.** GitHub은 접근 권한이 없는 리소스에 존재를 숨기려
   * 404를 준다 — App 설치가 취소되거나 Contents 권한이 빠지면 base 브랜치도 `null`로 온다.
   * 그래서 **base 브랜치 조회는 호출부가 `null`이면 즉시 던져야 한다.** 그걸 "브랜치 없음"으로
   * 읽고 진행하면 `createRef`가 실패할 때까지 오진이 이어진다.
   *
   * @param ref `heads/dev` 형태. **슬래시를 인코딩해 넘기지 않는다** — 구현이 쓰는 octokit이
   *   이미 인코딩하므로 이중 인코딩(`%252F`)이 되어 조용한 404가 된다.
   */
  getRefSha(ref: string): Promise<string | null>;

  /**
   * 커밋의 전체 트리(recursive). **잘렸으면 던진다** — 일부만 보면 base에 있는 파일을
   * "없다"고 판정해 신규로 올리고, blob SHA 비교가 전부 틀어진다.
   */
  getTree(commitSha: string): Promise<GitTreeBlob[]>;

  /** blob 내용(UTF-8). 수술적 치환 어댑터의 write가 원본을 요구한다 (ARCHITECTURE §1.4). */
  getBlobText(sha: string): Promise<string>;

  /**
   * 트리 생성. **항목의 `content`가 blob을 암묵 생성하므로 `POST /git/blobs`를 따로 부르지
   * 않는다** — 파일 8개면 호출 9회가 1회로 줄고, `buildTreePayload`가 이미 `content`를 싣는다.
   */
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

  /**
   * **마지막으로 적재한 커밋 뒤로 base가 움직였나** (projects-list design §3.4 C).
   *
   * ⚠️ **이 둘은 목록 전용이다** — pull은 쓰지 않는다. 그래도 같은 인터페이스에 두는 이유는
   * 자격증명이 같기 때문이고(installation 토큰), 갈라 두면 **같은 App 토큰을 만드는 자리가 둘**이 된다.
   *
   * `diverged`도 앞선 것으로 본다 — base가 강제로 옮겨진 경우이고, 화면이 말하는 것은
   * "그 뒤로 로케일 파일이 바뀌었다"이지 "몇 커밋 앞섰다"가 아니다.
   */
  compareToBase(baseSha: string, branch: string): Promise<{ ahead: boolean; files: ChangedFile[] }>;

  /** 그 PR이 **아직 열려 있나**. 닫힌 PR에 "머지해서 끝내세요"를 띄우지 않으려는 것이다. */
  isPullRequestOpen(pullNumber: number): Promise<boolean>;
};
