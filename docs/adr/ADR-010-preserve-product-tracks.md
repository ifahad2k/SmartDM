# ADR-010: Preserve the Java and C# product tracks

Status: Accepted by explicit maintainer instruction, 2026-11-03.

## Decision

The maintainer requested that both versions remain, with clear branches and current
architecture documentation so future agents can resume work reliably.

- `main` is the preserved Java/JavaFX product track.
- `sdm2.0` is the C#/.NET 9/Avalonia product track.
- Java is not a runtime prerequisite of the C# application.
- Preserve both branches, source history, build entry points, and relevant assets.
- Do not delete Java source as C# migration cleanup. On sdm2.0 this supersedes any
  interpretation of ADR-009 as authorization to delete the separate Java product.
- Keep branch-local architecture maps, test evidence and resume instructions.
- Keep the two versions in separate worktrees when working on both concurrently.
- Port shared fixes deliberately with receiving-branch tests; do not merge unrelated
  product histories or extensions solely to avoid documentation duplication.

This does not close any release gate, certify old binaries, or waive privacy/security
requirements. Earlier ADRs remain in history. Existing product constraints still apply.

See [branch map](../BRANCHES.md) and [current architecture](../CURRENT_ARCHITECTURE.md).
