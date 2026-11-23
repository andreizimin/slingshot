# LID — EARS Specs

Design: `lid-design.md` · Prefix: `LID`

- [x] **LID-001**: The coherence check shall fail when a `@spec` annotation in `site/`, `tests/`, `deploy/`, `scripts/`, `bin/`, `.github/` or `sst.config.ts` names an ID that no spec file under `docs/intent/` defines.
- [x] **LID-002**: The coherence check shall fail when the same spec ID is defined more than once, in one spec file or across spec files.
- [x] **LID-003**: The coherence check shall fail when a spec ID in a node's spec file does not start with the `prefix:` declared in that node's design doc followed by a hyphen, when a folder under `docs/intent/` other than a `decisions/` folder has no `<node>-design.md`, or when a design doc lacks `parent:` or `prefix:` frontmatter.
- [x] **LID-004**: The coherence check shall fail when a spec marked `[x]` is cited by no `@spec` annotation in `tests/` and is not named in backticks under a "Verified by hand" heading in its own spec file (a plain mention in prose does not count); specs marked `[ ]` or `[D]` shall need neither.
- [x] **LID-005**: When the coherence check finds no problem it shall exit with status 0 and print a one-line summary; otherwise it shall print every problem and exit with a non-zero status.
- [x] **LID-006**: The repository shall carry the `linked-intent-dev` and `update-lid` skills under `.claude/skills/`, each with the upstream `LICENSE` and a `SOURCE.md` naming the upstream tag, and that tag's version shall equal the `- Version:` in the `## LID` block of `AGENTS.md`.
- [x] **LID-007**: The repository shall carry `docs/change-orders/README.md` with an index row for every `CO-NNN-*.md` file in that folder, and `docs/change-orders/TEMPLATE.md`.
