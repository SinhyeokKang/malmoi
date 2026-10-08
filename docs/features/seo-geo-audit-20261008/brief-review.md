# Independent batch review

The Dispatch names the batch letter, branch/worktree and handoff path. Review that batch independently, report only. Read this directory's report.md, orch.md and brief for that batch from main checkout when newer than the worker checkout. Read the actual commit range from merge-base with dev, not only unstaged diff. Do not edit application code or authoritative docs, stage, commit, push, build or run the whole gate. Focused read-only reproductions/tests are allowed only when needed to validate a concrete finding; do not mutate another worker's checkout while its gate runs.

Verify:

- Every assigned audit item has observable evidence, no fabricated production verification or unsupported SEO guarantee.
- Handoff's commits/test counts/gate claim match files/logs; no unowned paths, accidental guide structural divergence or lifecycle work hidden outside reported commits.
- Relevant CLAUDE/PRODUCT/ARCHITECTURE/DESIGN rules and POSTMORTEM recurrence patterns. No shared primitives copied by hand, no new raw colors/dark utilities or missing dictionaries.
- A: exact format support by adapter, invitation threshold rather than hard cap, current pricing facts, no future promise, hero.body unchanged, meaningful links and guide anchors, translated copy and source fidelity.
- B: English metadata versus actual JSON-LD language, FAQ breadcrumb only, real Next 404 status/SSR/metadata instead of component-only assumptions, inheritance on root/private pages, OG pixel equality and dimensions.
- C: actual Markdown destinations versus code spans/fences/reference definitions, deterministic export, dangerous/unrecognized links unchanged or safe failure, no image/alt regression, headers don't cache auth HTML, first-image loading order is actual rendered order.
- D if present: approved feature spec and review decisions, public-only mobile policy, desktop layout preserved, no invisible navigation or focus trap, app shell unchanged.
- Runtime classification: deterministic entry-point→view-output evidence belongs in tests. Only browser layout/HTTP build behavior/network/true runtime matters stay as (b). Point out handoffs that move deterministic checks into QA.

Report only actionable findings with severity, exact file/line, failure input/scenario and a one-line fix. Distinguish product decisions and known accepted tradeoffs; don't relitigate approved choices. No speculative generic SEO additions. Return red/yellow counts and deviations assessment even when zero.

Write `.scratch/review-<batch>.md` in your review workspace. Send current Dispatch worker_done exactly once with outcome succeeded (review completed, even if findings exist), report path and three-sentence summary, then idle. Only Codex Sol/Astra; Astra max medium. No nested agents needed unless bounded independent verification materially helps.
