import type { PullChange } from "./plan";

/**
 * pull이 리포 호스트에 요구하는 것 전부. **타입만 있고 구현이 없다** — 실제 호출은 호스트 구현(`lib/github.ts`)이
 * `lib/repo-host`를 지나 주고, 테스트용 가짜는 `lib/pull/__tests__/fake-client.ts`가 구현한다.
 *
 * **왜 인터페이스를 갈라놓나**: 오케스트레이션이 이걸 인자로 받으면 테스트가 fake를 넘겨
 * "GitHub을 몇 번 불렀나"를 셀 수 있다. ARCHITECTURE §2의 1층 스킵("편집이 없으면 API 0회")의 판정 수단이
 * 이것 하나뿐이다. `lib/github.ts`를 직접 물면 octokit이 실 네트워크를 잡으려 들고 App 자격증명이
 * 필요해진다 — 인터페이스로 갈라 fake를 주입하는 것이 호출 수를 셀 유일한 방법이다. (전 서술은
 * "그 파일의 `server-only` 때문"이었는데 `lib/github.ts`는 일부러 안 붙였다 — 2026-09-04 audit #38.)
 *
 * 메서드는 ARCHITECTURE §3의 호출 순서에 나오는 것만 둔다. 쓰지 않을 래핑을 늘리지 않는다.
 *
 * ⚠️ **쓰기는 호스트가 흉내 낼 수 있는 단위로 묶었다** (gitlab-repositories design §3). Git Data API의 트리·커밋·ref 네 단계는
 * GitLab에 대응물이 없다(커밋 API 한 번이 셋을 한다) — 그래서 경계는 "스냅샷 하나 올리기"·"sync 브랜치를 base로 수렴"이고 네 단계는
 * GitHub 구현 안에 산다. **무효화 순서는 호출부(`run.ts`)가 든다** — 첫 비읽기 메서드가 `invalidateDelivery` 뒤다.
 */

/**
 * Publish 한 번에 올리는 파일 하나. upsert의 `inBase`는 base 트리에 이미 있는가다 — 생성과 갱신을 가르는 호스트가 있다(GitHub은 보지 않는다).
 * delete는 base에 있는 경로에만 생긴다(`planPullChanges`)라 `inBase`가 없다.
 */
export type SnapshotChange = (Extract<PullChange, { kind: "upsert" }> & { inBase: boolean }) | Extract<PullChange, { kind: "delete" }>;

/** 리포 읽기 스냅샷의 blob 하나. */
/** `mode`는 리더 스냅샷이 싣는다(링크도 `type: blob`이다) — 언어 변경 만료의 정규 파일 판정 입력이다(`observeLocaleFiles`). */
export type GitTreeBlob = { path: string; sha: string; size?: number; mode?: string };

/** Publish 비교 트리는 비정규 경로도 보존한다 — 누락시키면 없는 파일로 오인해 재생성한다. */
export type GitTreeEntry = GitTreeBlob & { mode: string };

/**
 * compare가 돌려주는 변경 파일 하나. **`previous_filename`은 rename에만 있다** — GitHub이 그때만
 * 채우고, 그 둘 중 하나가 로케일 경로면 변경으로 센다.
 */
export type ChangedFile = { filename: string; previous_filename?: string };

export type GitClient = {
  /**
   * ref의 커밋 SHA. **브랜치가 없으면 `null`** — 404를 던지지 않는 것이 요지다.
   * `malmoi-i18n/sync`의 부재가 첫 실행 경로(`publishSnapshot`이 브랜치를 만든다)를 태우는 정상 입력이기 때문이다.
   *
   * ⚠️ **`null`은 "권한이 없다"일 수도 있다.** GitHub은 접근 권한이 없는 리소스에 존재를 숨기려
   * 404를 준다 — App 설치가 취소되거나 Contents 권한이 빠지면 base 브랜치도 `null`로 온다.
   * 그래서 **base 브랜치 조회는 호출부가 `null`이면 즉시 던져야 한다.** 그걸 "브랜치 없음"으로
   * 읽고 진행하면 첫 쓰기가 실패할 때까지 오진이 이어진다.
   *
   * @param ref `heads/dev` 형태. **슬래시를 인코딩해 넘기지 않는다** — 구현이 쓰는 octokit이
   *   이미 인코딩하므로 이중 인코딩(`%252F`)이 되어 조용한 404가 된다.
   */
  getRefSha(ref: string): Promise<string | null>;

  /**
   * 커밋의 전체 트리(recursive). **잘렸으면 던진다** — 일부만 보면 base에 있는 파일을
   * "없다"고 판정해 신규로 올리고, blob SHA 비교가 전부 틀어진다.
   */
  getTree(commitSha: string): Promise<GitTreeEntry[]>;

  /** blob 내용(UTF-8). 수술적 치환 어댑터의 write가 원본을 요구한다 (ARCHITECTURE §1.4). */
  getBlobText(sha: string): Promise<string>;

  /**
   * **고정 base 위에** 변경 파일로 커밋 하나를 만들고 sync 브랜치를 그 커밋으로 맞춘다(없으면 만든다). **첫 외부 쓰기**다. 반환 = 커밋 SHA.
   *
   * ⚠️ **parent는 언제나 `baseSha` 하나다** — sync 브랜치의 기존 head를 parent로 쓰면 누적 히스토리가 되고, base가 앞서 나간 뒤엔
   * 3-way merge가 필요해진다(ARCHITECTURE §0). 브랜치는 "현재 DB 상태의 스냅샷"이라 강제로 옮긴다(§3).
   *
   * @param summary 커밋 메시지의 요약(`2 files`). 메시지 자체는 구현이 `commitMessage`(`./payload`)로 만든다 — 루프 마커가 드는 문자열의
   *   조립이 한 곳이어야 한다.
   */
  publishSnapshot(input: { branch: string; baseSha: string; changes: readonly SnapshotChange[]; summary: string }): Promise<string>;

  /**
   * no-changes 수렴 — sync 브랜치를 "base와 같음"으로 만든다. 호출부는 sync head가 있고 base와 다를 때만 부른다.
   * 열린 PR은 그 **전에** 호출부가 닫는다(`closePr` 주석).
   */
  resetSyncBranch(branch: string, baseSha: string): Promise<void>;

  /**
   * 열린 PR. 없으면 `null`. `title`을 같이 주는 이유는 재사용하는 PR의 제목에 루프 마커가 있는지
   * 호출부가 봐야 해서다(`PR_TITLE`) — 마커가 커밋 메시지에만 있던 시절의 PR이 남아 있다.
   *
   * ⚠️ **base로 거르지 않는다** (launch-readiness L3.7). 설정에서 base를 바꾸면 저장된 base로는 옛 PR이
   * 안 보여 같은 head로 PR이 하나 더 열린다. 대신 `base`를 돌려주고 호출부가 어긋나면 옮긴다.
   *
   * @param branch **sync 브랜치 이름만** 넘긴다. GitHub 구현이 `owner:branch`를 조립한다 — 브랜치명만 넘기면 GitHub이 필터를
   *   조용히 무시하고 전체 목록을 주므로 재사용 판정이 무너져 PR이 중복 생성된다. 호출부마다 조립하던 함정을 경계 안으로 옮겼다.
   */
  findOpenPr(branch: string): Promise<{ url: string; number: number; title: string; base: string; body: string } | null>;

  createPr(headBranch: string, baseBranch: string, title: string, body: string): Promise<string>;

  /** 재사용하는 PR의 제목 갱신 — 제목에 루프 마커가 없을 때만 부른다(매 실행 PATCH를 만들지 않는다). */
  updatePrTitle(pullNumber: number, title: string): Promise<void>;

  /** 재사용하는 PR의 base를 설정의 base로 옮긴다 — 어긋날 때만 부른다. */
  updatePrBase(pullNumber: number, base: string): Promise<void>;

  /**
   * 재사용하는 PR/MR의 본문을 이 스냅샷의 본문으로 다시 쓴다 — 다를 때만 부른다(locale-add R-B2 Y3). 열린 PR에 파일 삭제가 얹히면 앱 코드 정리 안내가
   * 본문에 있어야 한다. 빈 본문은 `""`로 비교한다(`findOpenPr`의 `body`).
   */
  updatePr(pullNumber: number, body: string): Promise<void>;

  /**
   * 코멘트를 남기고 PR을 닫는다 (B1 r3). no-changes 경로가 sync 브랜치를 base로 되돌리기 **전에** 부른다 — 되돌리면 GitHub이 그 PR을 스스로
   * 닫고(때로 "merged"로 표시한다) 이유가 어디에도 안 남는다. 코멘트가 먼저다: 닫기가 성공하고 코멘트가 실패하면 이유 없이 닫힌 PR이 남는다.
   */
  closePr(pullNumber: number, comment: string): Promise<void>;

  /**
   * **마지막으로 적재한 커밋 뒤로 base가 움직였나** (DESIGN §6.63).
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
