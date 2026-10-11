# Responsive 1.3.2 audit fixes

Baseline: `v1.3.2` / `8bd4983ccaf81b5c2538791c301deadf69182e35`.
Scope: the seven findings from the 2026-10-12 static audit. No new feature or product decision.

- [ ] A / #1: Preserve the user's list pane when their earlier key-selection response arrives. Reproduce select B -> pending -> Back to keys -> response. Preserve external navigation, tree intent, drafts, cursor/IME and focus.
- [ ] B / #2: Stack Home Recent logs result/warnings/time at narrow card widths without hiding information; preserve wide layout and Logs rows. Verify en/ko/es and loading parity.
- [ ] B / #3: Wrap unbroken legal project names in drawer heading and project rows without overlap; preserve desktop truncation and switcher controls.
- [ ] B / #4: Hand focused sidebar resize handle to the app navigation trigger when it becomes hidden. Preserve resize, collapse preferences and focus outside the handle.
- [ ] C / #5: Recompute document heading positions when inline TOC disclosure changes height. Keep manual-scroll current section and click landing consistent for Docs and Privacy.
- [ ] C / #6: Preserve TOC focus across the reading-container 960px boundary in both directions. Use actual container width, not viewport lg; do not steal unrelated focus or remount content.
- [ ] D / #7: Align PRODUCT with DESIGN's final disabled-action reason decision (title + sr-only, visible-line removal).
- [ ] Independent review; route corrections to owning workers.
- [ ] Integrated gate, documentation freshness, dev push and exact-head CI.
- [ ] Single-worker runtime QA, corrections and recheck.
- [ ] Postmortem, final documentation, cleanup and delivery.
