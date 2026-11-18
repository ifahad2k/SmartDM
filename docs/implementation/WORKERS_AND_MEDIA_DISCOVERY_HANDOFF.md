# Worker count and media discovery

**Branch and commit:** `sdm2.0` at `6c91563`, working tree changes.

**Pre-existing dirty files:** Previous HLS, security, staging, and browser UI work was present. The Java worktree remains separate.

**Package and audit IDs addressed:** Package 2 worker selection and telemetry, plus Package 4 browser format discovery. No new security audit finding.

**Files and modules changed:** The Avalonia add dialog and transfer engine honor the configured worker count for HLS and verified range downloads. The HLS worker pool is bounded by outstanding chunks, and the monitor distinguishes transfer workers from chunks saved. The shared extension resolver keeps an SD result available while awaiting the other YouTube source. The Chrome and Firefox coordinators keep a pending request intact when page data arrives, and ignore the ad player as a fallback source for the requested video. Embedded-player detection distinguishes an advertised URL from a captured playlist body. It can recognize HLS read by the player from an opaque HTTP address and retain a complete snapshot. The supported transport still rejects denied responses.

**Schema migrations:** None.

**Exact test commands and results:**

- `dotnet test SmartDm.sln --no-restore -p:BaseOutputPath='<isolated-output>/' --verbosity minimal` with `SMARTDM_MEDIA_TESTS=1`, an isolated profile, and isolated staging. 487 passed with zero failed or skipped. The native HLS engine started 12 overlapping requests against controlled responses.
- `node tools/build-extensions.cjs --check` synchronized. `node --test tests/browser/*.test.cjs` recorded 395 passed with zero failed or skipped. The regressions cover SD arriving before HD, successful opaque playlists, later complete snapshots, and actual playlist capture after the same URL first appeared in JSON.
- `dotnet build apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj --no-restore --verbosity minimal` succeeded with zero warnings or errors.

**Manual verification:** Reloaded the installed Chrome extension. On the exact reported YouTube video, the watch menu and home card each showed 1080p60 and 720p60. The desktop resolver independently returned the same HD qualities. SmartDM restarted after the running and queued transfer count was checked. The user's settings reported 16 workers and an inactive speed limiter. HydraHD presented a slider verification prompt before playback.

**Privacy and security evidence:** The live YouTube resolver check printed format labels only. Transfer checks printed numeric settings and aggregate status counts. The verification prompt was left intact. No media from the reported embedded host was downloaded as part of testing.

**Remaining limitations:** The reported HydraHD stream and its transfer are unverified, as is sustained Doraby throughput against IDM. Earlier transfers retain their saved worker count. Installed Firefox and Linux were not exercised.

**Exit gate fully satisfied:** NO.

**Next allowed package:** Continue validation of the existing transfer and media gates.
