# Single-worker runtime QA — responsive fixes

Read tasks.md, orch.md, current dispatch implementation/report paths, and source-command-runtime-test plus ego-browser skills. This is the only QA worker: use main checkout `/Users/sinhyeok/code/malmoi`, local dev server and dev DB only. No source edits, build, commit or push. Do not copy or print env values. Do not touch production or source repositories. Restore any changed fixture/profile preferences; record before/after. Coordinator freezes integration/build while your dev server is active.

Use real ego-browser geometry/focus observations. Do not call DOM class inspection a visual pass. Check current local HEAD and server readiness. If tooling or authentication blocks a path, report the exact blocker and continue independent accessible scenarios.

Acceptance:

1. Narrow translation select -> delayed response -> Back to keys stays list and keeps focus. Also direct key navigation, tree intent, draft preservation, repeated key, split/single round trip. If reliable response delay cannot be produced, rely on deterministic test for that sequence and clearly report runtime limit; still test actual CSS focus and drafts.
2. Home Recent logs at 375 and 768, en/ko/es, result+warning+time and long text: all content reachable, no overlap/clipping; wide 1280/1440/1890 remains intentional. Contrast Logs page and loading layout.
3. Drawer 200-character unbroken project names, en/es and ko: text wraps, switcher usable, desktop truncation unchanged. Use dev QA fixture only, restore name.
4. Focus sidebar resize handle and cross lg both directions; target app menu when hidden, external focus unchanged, collapse and remembered width survive. Include keyboard resize/Enter.
5. Docs and Privacy: inline TOC expand/collapse, click middle section then manual scroll, current section matches actual heading coordinates after height changes; no scroll jump introduced.
6. Focus TOC link wide -> narrow and disclosure narrow -> wide at actual reading container 960; verify both open/closed preferences and unrelated focus, document scroll retained.
7. Check light/dark and 375/768/lg boundary plus reading-container boundary, and 1280/1440/1890 desktop regression. Cover changed surfaces across languages, with browser-specific limits stated.

Findings must be reported immediately through BugShot under source-command-orchestrate's authorized issue workflow; do not batch them to the end. Verify target tab binding and observed route. No direct gh issue creation unless BugShot itself is demonstrably blocked and the mandated BugShot issue/fallback sequence is followed. Send coordinator issue number and ownership immediately; continue testing. Never fix source yourself. Final recheck may comment/close only issues verified fixed, following the invoked orchestration workflow.

Use only one task space and no shared-profile parallel browser work. At completion stop your own dev server, finish task space, and leave `.scratch/qa-responsive-132.md` with exact HEAD, scenario matrix, actual metrics/focus outcomes, issue links, unverified items, and fixture restoration evidence. Send current Dispatch worker_done with explicit outcome; end turn.

8. Added batch M: landing mockup at 375/390/639 has no browser toolbar or left dots and all four screen insets are 8 logical px (scale-aware DOM measurements). At 640/768/1023 and 1024/1280/1440/1890 existing toolbar/dots and 44px top remain. Check all five scenes, pinned and static fallback/reduced motion, light/dark, boundary roundtrip retaining scene/progress, caption/progress unchanged. Mock app header remains.

Runtime: start server with PATH=/Users/sinhyeok/Library/pnpm/nodejs/24.15.0/bin:$PATH and verify node --version (repo requires Node 24; default shell is 26). Do not change project configuration.
