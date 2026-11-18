# HLS startup and selected audio

**Branch and commit:** `sdm2.0` at `6c91563`, working tree changes.

**Pre-existing dirty files:** Earlier security, browser UI, media, and transfer fixes were present. Java remains in its separate worktree.

**Package and audit IDs addressed:** Package 2 transfer startup and staging, plus Package 4 HLS audio discovery.

**Files and modules changed:** The C# HLS engine starts with one worker and admits additional workers after validated chunks are saved, up to the chosen limit. A terminal denial ends startup without opening the remaining worker requests. Both browser extensions hand over the selected external audio playlist URL as soon as the player identifies it. They use a captured playlist body only when its address or verified redirect matches that rendition. New audio selections invalidate the previous body's association. The desktop can read the selected audio playlist and report a denial. Staging-directory lookup now tolerates concurrent completion cleanup.

**Schema migrations:** None.

**Exact test commands and results:**

- `dotnet test SmartDm.sln --no-restore -p:BaseOutputPath='<isolated-output>/' --verbosity minimal` with `SMARTDM_MEDIA_TESTS=1` and isolated profile and staging directories. Final run **489 passed, zero failed or skipped**. Tests observed one startup request before expanding to 12, a terminal 403 confined to the first chunk, and decoded both tracks after the engine retrieved audio using only the selected playlist URL. An earlier rerun exposed a staging cleanup race, which was repaired before the final run.
- `node tools/build-extensions.cjs --check` passed. `node --test tests/browser/*.test.cjs`: **395 passed, zero failed or skipped**. Fixtures cover the selected URL before the playlist body, unrelated audio events, and rendition changes.
- `dotnet build apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj --no-restore --verbosity minimal` succeeded. Two transient executable copy retries resolved automatically.

**Manual verification:** The app rebuilt and restarted after zero active or queued transfers were confirmed. The new process was responding. Chrome showed SmartDM Integration switched off, so the reported pages were not tested with the new hooks.

**Privacy and security evidence:** Historical comparisons used only hostnames, counts, booleans, and status categories. The engine rejects persistent HTTP denials. Controlled media tests used generated clips and loopback responses.

**Remaining limitations:** The screenshots do not establish why each CDN denied a segment. The new startup behavior has controlled coverage, and the reported CDNs and installed Firefox remain unverified.

**Exit gate fully satisfied:** NO.

**Next allowed package:** Continue validation of the existing transport and media gates.
