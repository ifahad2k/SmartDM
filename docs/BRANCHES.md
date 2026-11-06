# SmartDM versions and branches

Product track map refreshed on 2026-11-06. Remote heads were checked directly before
publication preparation. Earlier dated observations below remain historical. Both
product versions must be preserved.

| Purpose | Branch | Observed commit | Product entry point |
| --- | --- | --- | --- |
| Java version | `main` | `b705fd0` | `apps/desktop`, JavaFX `io.smartdm.desktop.Launcher` |
| C# version | `sdm2.0` | Current development snapshot; see `git log -1` | `apps/desktop-avalonia`, .NET 9 / Avalonia |
| C# compatibility branch | `sdm-v2` | Synchronized with `sdm2.0` by owner request on 2026-11-06 | Same C# / Avalonia development snapshot |

Other feature, release, OS and website branches are preserved. They are not designated
as the two primary product tracks. Do not rename, delete, merge or reset them as cleanup.
Before this synchronization, both remote C# branch names pointed at `ecbafc7`;
the local branch had three additional commits and extensive uncommitted changes.
The owner requested publishing the current snapshot to both names. Use
`git ls-remote --heads origin sdm2.0 sdm-v2` to verify their actual current tips.
Earlier `ecbafc7` history remains reachable; no force push is part of this update.

## Working safely

Start every session with `git branch --show-current`, `git rev-parse --short HEAD`,
`git status --short`, and `git worktree list`. Read that checkout's `AGENTS.md`,
`docs/CURRENT_ARCHITECTURE.md` and `docs/implementation/RESUME_HERE.md`.

Separate worktrees let both versions remain usable without moving dirty work:

```powershell
# From an existing repository checkout; choose a destination that does not exist.
git worktree add ../smartdm-java main
# If sdm2.0 is not already checked out elsewhere:
git worktree add ../smartdm-csharp sdm2.0
```

A branch can be checked out in only one worktree at once. Use `git worktree list`
before adding one. Never stash/reset someone else's work to switch versions.
Current machine: C# checkout is `E:/skill/projects/smartdm`; Java checkout is
`E:/skill/projects/smartdm-java`. These paths are examples, not application settings.

## Cross-version changes

Keep version-specific code and dependencies on their own branch. Port a fix as a
small reviewed change, with tests in the receiving version. Do not merge the whole
C# branch into Java just to share documentation. Browser extensions and website have
branch-specific copies; compatibility is not guaranteed by equal filenames.
Java media adapters do not authorize adding yt-dlp to the C# product. Preserving the
Java version does not reintroduce a Java runtime dependency into the C# application.

No history, source module, bundled runtime, release artifact or prototype should be
deleted merely because the other version no longer uses it. Generated files are not
sources of architectural truth. Distribution artifacts may describe older releases.


2026-11-04: Goals 3/4 runtime changes remain uncommitted on sdm2.0 at 48ec34c. The Java worktree/main history is preserved. See implementation/GOALS_3_4_HANDOFF.md. No setup, release package or publication was produced; installer creation is owner-deferred.

2026-11-04: Extension memory lifecycle repair remains uncommitted on sdm2.0 at
48ec34c; both product tracks are preserved. See implementation/EXTENSION_MEMORY_HANDOFF.md.

2026-11-06: See [publication handoff](implementation/BRANCH_SYNC_HANDOFF.md) for
the synchronized development scope, verification, Linux entry point and open gates.

The source publication consolidates previously unpublished development because
GitHub rejected an older 171 MB audit video. Original local commits remain on
`codex/local-before-source-sync-20261106`; the local video is preserved and ignored.
Both remote branch updates remain fast-forwards from their original `ecbafc7` tip.

Publication succeeded at `fb945a7` on both remote C# branches. A subsequent CI-only
repair replaces invalid action pins; use `git ls-remote` for the resulting tip.
Remote Ubuntu C# checks passed; the legacy Gradle cold-build verification gate
remains open. See the publication handoff for exact evidence and subsequent runs.
