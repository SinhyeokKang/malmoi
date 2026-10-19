/**
 * `pnpm adapter-survey`의 I/O 층 — 리포를 받아 `surveyOne`에 넘길 입력을 만들고, `--jobs`개씩 겹쳐 돈다.
 *
 * ⚠️ **git은 주입받는 async 러너다** (audit #21). 전에는 스크립트가 async 워커 안에서 `execFileSync`를 불러 clone이
 * 이벤트 루프를 막았고, `--jobs 6`이어도 git은 하나씩만 돌았다. 러너가 promise여야 워커들이 실제로 겹친다 — 그리고
 * 테스트가 네트워크 없이 프로세스 경계를 제어할 수 있다.
 */
import { decodeLocaleFile, LocaleFileParseError } from "../file-encoding";
import { lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { causeMessage } from "../cause";
import { surveyOne } from "./one";
import { PIN_SHA } from "./pins";
import { selectSurveyFiles } from "./select";
import type { RepoSurvey, SurveyInput } from "./types";

export type GitRunner = (cwd: string, args: readonly string[]) => Promise<string>;

const short = (cause: unknown): string =>
  causeMessage(cause).split("\n")[0]?.slice(0, 120) ?? "알 수 없음";

/**
 * 리포 하나를 받아 `surveyOne`에 넘길 입력을 만든다.
 *
 * 실패는 던지지 않고 `failure`로 담는다 — 리포 하나가 전체를 멈추면 50개짜리 실행이 첫 사설
 * 리포에서 죽는다 (tasks.md 6).
 *
 * `pin`이 있으면 그 커밋만 받는다. ⚠️ **받지 못해도 HEAD로 물러나지 않는다** — 조용한 폴백은 "고정했는데 상류가 움직인
 * 결과"를 기준선과 같은 것으로 보이게 만든다. `pin`은 git 인자로 들어가므로 전체 SHA 모양만 통과시킨다.
 */
export async function fetchRepo(repo: string, git: GitRunner, pin?: string): Promise<SurveyInput> {
  if (pin !== undefined && !PIN_SHA.test(pin)) {
    return { repo, paths: [], files: new Map(), configFiles: [], failure: `pin 형식 오류: ${pin.slice(0, 20)}` };
  }
  const dir = mkdtempSync(join(tmpdir(), "adapter-survey-"));
  try {
    await git(dir, ["clone", "--depth", "1", "--filter=blob:none", "--no-checkout", "--quiet", `https://github.com/${repo}.git`, "r"]);
  } catch (cause) {
    rmSync(dir, { recursive: true, force: true });
    return { repo, paths: [], files: new Map(), configFiles: [], failure: `clone 실패: ${short(cause)}` };
  }
  const work = join(dir, "r");
  let commit: string | undefined;
  try {
    if (pin !== undefined) {
      try {
        await git(work, ["fetch", "--depth", "1", "--filter=blob:none", "--quiet", "origin", pin]);
      } catch (cause) {
        return { repo, paths: [], files: new Map(), configFiles: [], failure: `pin fetch 실패: ${short(cause)}` };
      }
      commit = pin;
    } else {
      const head = (await git(work, ["rev-parse", "HEAD"])).trim();
      if (PIN_SHA.test(head)) commit = head;
    }
    const rev = commit ?? "HEAD";
    const paths = (await git(work, ["ls-tree", "-r", rev, "--name-only"])).split("\n").filter(Boolean);
    if (paths.length === 0) {
      return { repo, paths: [], files: new Map(), configFiles: [], failure: "빈 트리", commit };
    }
    const { paths: wanted, configFiles, truncated } = selectSurveyFiles(paths);
    const files = new Map<string, string>();
    const decodeErrors: NonNullable<SurveyInput["decodeErrors"]> = [];
    if (wanted.length > 0) {
      try {
        // 한 번에 받는다. 개별 blob fetch는 네트워크 왕복이 파일 수만큼 든다.
        // ⚠️ **`--`가 있어야 한다** (sec-audit 발견 20). `wanted`는 **신뢰할 수 없는 리포의 경로**라
        // `-`로 시작하면 argv에서 옵션으로 읽힌다. 이 서브커맨드에 실행 옵션이 없어 RCE 경로는 못
        // 찾았지만, 그것은 지금 git 버전의 성질이지 우리 계약이 아니다.
        await git(work, ["sparse-checkout", "set", "--no-cone", "--", ...wanted]);
        await git(work, ["checkout", "--quiet", rev]);
      } catch (cause) {
        // ⚠️ 물리화가 실패하면 파일 집합이 비거나 일부뿐인데 이를 성공으로 돌려주면 `commit`이 pins에 기록되고 파일이 있는
        // 리포가 탐지 실패로 보인다. 고정 여부와 무관하게 측정하지 못한 커밋은 실패다(`commit`도 싣지 않는다).
        return { repo, paths: [], files: new Map(), configFiles: [], failure: `체크아웃 실패: ${short(cause)}` };
      }
      for (const p of wanted) {
        try {
          const full = join(work, p);
          // ⚠️ **심링크는 `catch`가 안 잡는다** (sec-audit 발견 12). 옛 주석이 "심볼릭 링크는 없는
          // 파일로 취급한다"였는데 `catch`는 **오류일 때만** 돌고, 링크가 유효하면 `readFileSync`가
          // 링크를 **따라가** 그 대상을 읽는다 — 측정 대상이 아닌 파일이 코퍼스에 섞인다.
          if (lstatSync(full).isSymbolicLink()) continue;
          const buf = readFileSync(full);
          // 다른 포맷의 NUL 파일 스킵은 유지하되 .strings는 UTF-16일 수 있으므로 디코더로 보낸다.
          if (!p.endsWith(".strings") && buf.includes(0)) continue;
          files.set(p, decodeLocaleFile(p, buf).content);
        } catch (error) {
          if (error instanceof LocaleFileParseError) decodeErrors.push({ path: p, code: error.code });
          // 서브모듈(gitlink)처럼 체크아웃이 성공해도 물리화되지 않는 파일 — 없는 파일로 취급한다.
        }
      }
    }
    return { repo, paths, files, configFiles, truncated, commit, ...(decodeErrors.length === 0 ? {} : { decodeErrors }) };
  } catch (cause) {
    return { repo, paths: [], files: new Map(), configFiles: [], failure: `트리 읽기 실패: ${short(cause)}`, commit };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 리포 목록을 `jobs`개씩 겹쳐 처리한다. clone이 네트워크 대기라 직렬로 돌리면 훨씬 느리다.
 *
 * ⚠️ **결과는 인덱스로 모은다** — 완료 순서로 `push`하면 같은 목록이 실행마다 다른 순서의 원자료를 낸다.
 * `onDone`만 완료 순서다(진행 표시용).
 */
export async function runSurveys(
  repos: readonly string[],
  jobs: number,
  fetch: (repo: string) => Promise<SurveyInput>,
  onDone?: (survey: RepoSurvey, done: number) => void,
): Promise<RepoSurvey[]> {
  const out: RepoSurvey[] = new Array(repos.length);
  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      const repo = repos[i];
      if (repo === undefined) return;
      let survey: RepoSurvey;
      try {
        survey = surveyOne(await fetch(repo));
      } catch (cause) {
        // 던져도 자리를 돌려주고 그 리포만 실패로 남긴다 — 워커 하나가 죽으면 동시 수가 조용히 준다.
        survey = surveyOne({ repo, paths: [], files: new Map(), configFiles: [], failure: `측정 실패: ${short(cause)}` });
      }
      out[i] = survey;
      done += 1;
      onDone?.(survey, done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, jobs), repos.length) }, worker));
  return out;
}
