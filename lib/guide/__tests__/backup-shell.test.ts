import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 문서의 명령 자체를 실행한다. Docker·복사는 가짜이며 쓰기는 임시 폴더에만 닿는다.
// `( set -e; ... ) && echo ok`는 subshell 전체의 errexit를 끄므로 문법 검사만으로는 못 잡는다.
const steps = ["stop", "mkdir", "permissions", "dump", "read-dump", "uploads", "env", "config", "image", "migrations", "checksum", "seal"];
const stubs = `
step() { printf '%s\\n' "$1" >> "$TRACE"; [ "$FAIL_AT" != "$1" ]; }
docker() {
  case "$*" in
    'compose stop '*) step stop ;;
    *' pg_dump '*) step dump ;;
    *' pg_restore '*) step read-dump ;;
    'run '*) step uploads ;;
    *' psql '*) step migrations ;;
    *) return 99 ;;
  esac
}
mkdir() { step mkdir || return 41; command mkdir "$@"; }
chmod() { case "$1" in 700) step permissions ;; *) step seal ;; esac; }
cp() { case "$1" in .env) step env ;; *) step config ;; esac; }
grep() { step image; }
sha256sum() { step checksum; }
`;

function runBackup(locale: string, shell: string, failAt = "") {
  const markdown = readFileSync(`guide/${locale}/self-hosting/operate.md`, "utf8");
  const section = markdown.split("{#backup}")[1]?.split("{#restore}")[0];
  const snippet = section?.match(/```sh\n([\s\S]*?)\n```/)?.[1];
  if (!snippet) throw new Error(`backup snippet missing: ${locale}`);
  const dir = mkdtempSync(join(tmpdir(), "malmoi-backup-"));
  try {
    const trace = join(dir, "trace");
    const result = spawnSync(shell, ["-c", stubs + snippet.replace("/var/backups/malmoi/", '"$BACKUP_ROOT"/')], {
      cwd: dir, encoding: "utf8", timeout: 5_000,
      env: { PATH: process.env.PATH, BACKUP_ROOT: dir, TRACE: trace, FAIL_AT: failAt },
    });
    return { ...result, steps: readFileSync(trace, "utf8").trim().split("\n") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.each(["en", "ko", "es"])("%s 백업 명령", (locale) => {
  describe.each(["sh", "bash"])("%s 실패 전파", (shell) => {
    it("모든 단계가 성공한 뒤에만 backup ok를 출력한다", () => {
      const result = runBackup(locale, shell);
      expect(result.status, result.stderr).toBe(0);
      expect(result.steps).toEqual(steps);
      expect(result.stdout).toContain("backup ok:");
    });
    it.each(steps)("%s 실패 뒤 후속 명령과 성공 안내를 실행하지 않는다", (step) => {
      const result = runBackup(locale, shell, step);
      expect(result.status, result.stderr).not.toBe(0);
      expect(result.stdout).not.toContain("backup ok:");
      expect(result.steps).toEqual(steps.slice(0, steps.indexOf(step) + 1));
    });
  });
});
