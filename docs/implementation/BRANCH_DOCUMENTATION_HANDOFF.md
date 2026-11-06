# Branch documentation handoff — 2026-11-03

Branch and commit: `sdm2.0` at `48ec34c`; documentation changes remain uncommitted.

Pre-existing dirty files: extensive C# desktop/browser/UI/cleanup, website, docs and tests; preserved in place.

Package and audit IDs addressed: documentation consolidation and maintainer-approved
version preservation (ADR-010). No remediation package gate closed.

Files/modules changed: `.gitignore` (ignore Kotlin compiler session caches), README
and AGENTS navigation; docs/README, BRANCHES, CURRENT_ARCHITECTURE; implementation
RESUME_HERE and TEST_EVIDENCE; ADR-010 and this handoff.
C# implementation plan wording updated from proposed to accepted ADR-009, Avalonia UI and separately preserved Java version.

Schema migrations: none.

Exact test commands and results: see TEST_EVIDENCE documentation section. New entry
page link existence checks PASS; `git diff --check` PASS. Java full validation was
interrupted in transfer tests and is INCOMPLETE; C# code tests not rerun for docs.

Manual verification: branch refs, worktree map, csproj/sln and Gradle module graph,
entry points, composition code, browser manifests, persistence implementation and
resume priorities inspected. No live account, download, installer or release checked.

Privacy/security evidence: no application behavior, credentials, runtime dependencies,
TLS, authentication, scanner evidence or database schemas changed. No files deleted.

Remaining limitations: changes are local/uncommitted on both branches; no remote fetch,
push, rename or merge performed. Architecture pages are dated maintained snapshots,
not automatically live diagrams. Historical docs remain labeled/linked rather than
rewritten as new test evidence. Java build toolchain mismatch and incomplete transfer
verification remain explicitly documented.

Exit gate fully satisfied: YES for branch documentation/navigation scope; NO for
product remediation/release gates.

Next allowed package: Package 2, preserving existing dirty work.
