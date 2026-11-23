---
parent: high-level-design
prefix: LID
---

# LID: How This Project Changes

## Context and Design Philosophy

Slingshot is built with linked-intent development: every behaviour traces from the HLD through an LLD and an EARS spec to a test and the code. That chain only helps if it stays whole as the game grows. This node holds the three things that keep it whole: the skills every session works from, the change order every change starts with, and a script that checks the chain mechanically on every push.

The rule behind all three: a convention that depends on someone remembering gets skipped; a file in the repository and a failing pipeline do not.

## Vendored Skills

The `linked-intent-dev` and `update-lid` skills live in `.claude/skills/`, copied unmodified from the LID project at the version the `## LID` block in `AGENTS.md` declares. Each folder carries the upstream `LICENSE` and a `SOURCE.md` naming the upstream repository, path, tag and commit. Any session on this repository, cloud or local, therefore loads the same workflow.

Moving to a newer version is a change order: copy the same paths from the new tag, apply that release's migration from the upstream changelog, and update `SOURCE.md` and the `- Version:` line together.

## Change Orders

Every change starts as a change order in `docs/change-orders/`, written from `TEMPLATE.md` before any design doc, spec, test or code is touched. It predicts the change's effect at every level of the arrow (HLD, LLDs, specs, tests, code), names cross-segment effects, asks the requester's decisions in one round, and plans verification. Its Outcome section later records what was actually touched, so each change shows how well intent predicted code. Predictions are never revised after approval; differences belong in the Outcome.

The steps, the single manual stop (the requester's check on dev) and the explicit dev-check question are in `AGENTS.md`, where every session reads them. `docs/change-orders/README.md` holds the index.

`docs/development-log.md` tells how the game was built, including the changes made before change orders existed.

## Coherence Check

`bin/coherence-check.mjs` (`npm run coherence`) reads the spec files under `docs/intent/` and the `@spec` annotations in `site/`, `tests/`, `deploy/`, `scripts/`, `bin/`, `.github/` and `sst.config.ts`, and fails with a list of problems when:

1. **An annotation names no spec.** A `@spec` ID that no spec file defines.
2. **A spec ID is defined twice**, in one file or across files.
3. **A spec ID has the wrong prefix.** Every ID in a node's spec file must start with the `prefix:` its design doc declares, followed by a hyphen.
4. **An implemented spec is unverified.** A spec marked `[x]` that no file in `tests/` cites, unless its spec file lists it, written in backticks, under a **Verified by hand** heading (a plain mention in prose there does not count). That heading is where a spec file says, in plain words, which specs need a browser or a person and why.
5. **A node is malformed.** A folder under `docs/intent/` without its `<node>-design.md`, or a design doc without `parent:` and `prefix:` frontmatter. A `decisions/` folder (where a node keeps its decision docs) is not a node.

Specs marked `[ ]` (active gap) or `[D]` (deferred) need no test. The script has no dependencies and its logic is a pure function over file contents, so it is unit-tested on small fixtures. It runs in the pipeline's test job, so a push that breaks the chain does not deploy.

What the script cannot judge (whether a spec still says what the LLD means, or an LLD still fits the HLD) stays a reading task at the end of each change order.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Where the skills live | Vendored in the repository | Installed on the developer's machine only | A cloud session has no access to a laptop's plugins, and an unpinned skill can change under the project. |
| Where the process lives | `AGENTS.md` and the change-order README | Agent memory; a wiki | Process is project intent: a fresh agent in any tool needs it to work correctly. |
| One stop per change | The dev check | A stop after every LID phase | Phase-by-phase stops made small changes slow; the change order review, one decisions round and the dev check cover the same inspections. |
| Coherence | A script in the pipeline | An in-prompt audit at the end of each change | The audit was skipped under time pressure. A failing run cannot be skipped. |
| Hand-verified specs | Listed under a heading in the spec file | A separate exemptions file; allowing untested specs silently | The list sits next to the specs it covers, reads as documentation, and makes every untested spec a deliberate statement. |

## Open Questions & Future Decisions

### Deferred
1. The arrow-maintenance overlay (`docs/arrows/`), if the design tree grows past a size one reader can hold.
2. Checking that each test's cited spec is the one it actually exercises; today that is a review task.

## References

- `AGENTS.md` (Linked-Intent Development, Change Orders, LID Tooling)
- `docs/change-orders/README.md`, `docs/change-orders/TEMPLATE.md`
- LID project: https://github.com/jszmajda/lid
