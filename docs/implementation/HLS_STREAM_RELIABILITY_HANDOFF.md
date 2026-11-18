# HLS stream reliability

**Branch and commit:** `sdm2.0` at `6c91563`, changes in the working tree.

**Pre-existing dirty files:** Desktop security, staging, refactoring, browser appearance and media size work was already present. The separate Java worktree was outside this repair.

**Package and audit IDs addressed:** Package 4 media reliability with the existing Package 2 transfer machinery. No new security audit finding is claimed.

**Files and modules changed:** The shared browser runtime and both overlays retain distinct HLS sources, pass through duration and bandwidth, and hand off only complete media snapshots. A master supplies the audio group for its selected variant. Known short preview snapshots are excluded when the player reports a substantially longer duration. The desktop can recover from a stale master snapshot by reading the selected URL, and rejects a duration mismatch before downloading chunks. Whole-file clear fMP4 initialization and media fragments use the bounded download workers, verified chunk checkpoints and an offline FFmpeg remux. Byte-range HLS and encrypted fMP4 remain on the existing FFmpeg path.

The native engine avoids an extra first-chunk GET and avoids silently switching qualities. It measures the segment timeout while waiting on the network, outside rate limiting, and stops after a terminal chunk rejection. Verified chunks stay available to retry. FFmpeg's local remux receives only generated local paths and the file protocol. Existing TLS, request and credential scoping, and final verification still apply.

**Schema migrations:** None.

**Exact test commands and results:**

- `dotnet test SmartDm.sln --no-restore -p:BaseOutputPath='<isolated-output>/' --verbosity minimal` with `SMARTDM_MEDIA_TESTS=1` and isolated profile and staging directories. **486 passed, zero failed or skipped.** The generated fMP4 test observed overlapping video and audio requests, then used FFmpeg to decode both tracks. Additional cases cover legacy master handoff, long manifests, segment rejection, and preview mismatch before media transfer.
- `node tools/build-extensions.cjs --check` confirmed both generated backgrounds match the shared source. `node --test tests/browser/*.test.cjs`: **392 passed, zero failed or skipped**. Includes both extension handoffs, rendition groups, and rejection of unrelated audio and short previews.
- `dotnet build apps/desktop-avalonia/SmartDm.Desktop.Avalonia.csproj --no-restore --verbosity minimal`: **zero warnings and errors**.

**Manual verification:** Rebuilt and restarted SmartDM after the local database reported zero queued or active transfers. The SmartDM Downloads window was visible. Chrome did not expose a window, so extension activation and live streaming were not checked.

**Privacy and security evidence:** Tests use generated media, local loopback servers and synthetic URLs. The app check printed only the transfer count and process status. No credentials or signed source URLs were copied into this report.

**Remaining limitations:** The reported CDNs, sustained IDM throughput, installed extension reload, and Linux execution were not verified. A server can still reject or throttle a request. A preview with no known duration may still be indistinguishable from an unrelated full playlist until stronger player binding is available.

**Exit gate fully satisfied:** NO.

**Next allowed package:** Continue validation of the open transfer and media gates on the C# track.
