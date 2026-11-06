# SmartDM 2.0 — C# application and browser extension review

Date: 2026-11-03. Branch: `sdm2.0`. HEAD: `48ec34c`.

Implementation follow-up: the ordinary-download slice of R03, R05, R09 and R16
has since been implemented and tested. The findings below preserve the review
baseline; consult the [current handoff](E:/skill/projects/smartdm/docs/implementation/PACKAGE2_RELIABILITY_HANDOFF.md)
for changed behavior and remaining scope. This does not close the overall audit.
The later [lifecycle handoff](E:/skill/projects/smartdm/docs/implementation/PACKAGE2_LIFECYCLE_HANDOFF.md)
records R07 remediation with ordinary-transfer concurrency tests; media-process
and platform coverage remains limited.

## Assessment

SmartDM has a real, usable engineering foundation. It is beyond a UI demonstration: ordinary downloads use C# workers, staging, range validation, checkpoint hashes, and finalization; media uses native discovery, YoutubeExplode, and FFmpeg. However, it is currently a development build, not a dependable everyday replacement for IDM.

The distance to IDM is primarily **reliability and integration**, not appearance or the number of connections. Happy-path throughput may be competitive on some servers, but no controlled comparison was performed. There is no defensible percentage-complete estimate or speed ratio from this review. Several confirmed defects can prevent downloads from finishing, and browser interception can abandon the original browser request before SmartDM owns a durable replacement.

The implementation quality is uneven: ordinary-file integrity has received substantive attention; media recovery, browser ownership, credentials, lifecycle coordination, and application wiring do not yet meet the same standard. Keep the stronger transfer code and improve it incrementally. A rewrite would discard useful work without automatically solving these problems.

## Scope and evidence

Reviewed the C# runtime paths for creation, probing, transfer, pause/resume, journaling, media processing, persistence, scanning, updates, browser IPC, settings, and relevant views/view models. Reviewed the unique browser background, capture, discovery, format, overlay, watcher, and mounting modules, and both manifests. Chrome and Firefox JavaScript copies matched by SHA-256 in the inspected working tree, so shared findings apply to both. Inspected supporting architecture and transfer tests; this was not an exhaustive line-by-line review of every test, diagnostic mode, or visual XAML property.

The scoped inventory contained approximately 34,869 physical lines across 110 source/configuration/test files, including duplicated Firefox code. Line count is scope information, not a measure of correctness.

Evidence labels used below:

- **Reproduced:** actual repository code exercised in a local harness or browser-module VM.
- **Code:** directly traceable implementation behavior; impact has not been reproduced in a full application/browser session.
- **Gap:** missing capability or proof, rather than a demonstrated runtime failure.

Executed during this review:

| Command/check | Result |
|---|---|
| `dotnet test SmartDm.sln -v:q` | Passed, 54 tests. This invocation also built the required projects. |
| `node --test tests/browser/*.test.cjs` | Passed, 8 tests. |
| Temporary C# harness referencing the desktop project | Confirmed limiter stall, HLS terminal-failure coordination failure, unrelated-domain cookie fallback, overly broad YouTube classification. |
| Node VM loading the actual format engine for each browser | Confirmed fabricated Facebook quality ladder and provisional-format URL surviving merge with a real stream. |

No live Facebook/YouTube download, Linux run, loaded-extension end-to-end session, installer validation, or IDM throughput benchmark was performed. Passing the existing tests does not establish those behaviors. All harness HTTP traffic was mocked; no real cookies were used.

## What is already good

1. Ordinary-file output is staged rather than written over an existing destination immediately. Range bounds, truncated responses, checkpoint hashes, and final destination protection have meaningful implementation and tests.
2. Recovery rejects unsafe reuse when it cannot establish a matching strong validator. Restarting is inefficient, but preferable to silently combining different remote versions.
3. Expected SHA-256 verification and durable checkpoint work are substantive integrity mechanisms, not cosmetic progress reporting.
4. FFmpeg uses a configured/verified executable and argument arrays. HLS uses platform TLS validation. No need to reintroduce yt-dlp or a Java transfer dependency.
5. The browser implementation has useful modularization, bounded collections, debounced observation, visibility tracking, and selected-Facebook identity checks. The recent identity protections should be preserved.
6. The tests include meaningful local-server and crash/recovery scenarios. Expand those around the gaps below instead of replacing them with tests that merely assert method names or UI strings.

## Findings

Priority: **P0** blocks trusting the affected path or release; **P1** should precede broader feature work; **P2** is important quality/scale work. Priority is not a claim of a demonstrated exploit.

### R01 — Browser capture transfers ownership too early — P0, Code

[background.js](E:/skill/projects/smartdm/extensions/chrome/background.js:2533) cancels and erases a browser download before desktop acceptance. A fallback re-download cannot faithfully reconstruct the original POST body, request context, or authentication. The desktop's [IPC acknowledgement](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/LocalIpcService.cs:322) follows event dispatch, not durable insertion of an accepted request. Opening a dialog is not durable acceptance; another capture can replace the previous add dialog.

**Fix:** define explicit request IDs and ownership states. Persist an inbox entry before acknowledging ownership. Deduplicate retries. Only cancel an original browser transfer after the agreed durable acceptance point. Where the browser API cannot preserve a request faithfully, leave the browser in control rather than promising a lossless fallback. Test desktop unavailable, dialog cancelled, two simultaneous captures, process crash, extension restart, and POST downloads.

### R02 — Loopback bridge authentication is bypassed — P0, Code

[LocalIpcService](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/LocalIpcService.cs:106) permits wildcard CORS; its authorization condition accepts local/loopback requests independently of the bearer token at line 150. The extension scans ports and treats an HTTP response as service discovery. This does not authenticate the desktop or enforce the documented extension-origin boundary. Sensitive capture data can reach a different local listener. Exact website reachability also depends on browser private-network restrictions, which were not tested.

**Fix:** versioned envelopes, authenticated pairing, exact allowed origins, bounded bodies/concurrency, strict message schemas, and authenticated discovery. Fail closed before processing URLs or cookies. Native messaging must have equivalent sender validation. Add negative tests for absent/wrong tokens, unexpected origins, oversized messages, unknown types, and an impostor listener.

### R03 — Low speed limits can stall forever — P0, Reproduced

[AggregateSpeedLimiter](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/ISpeedLimiter.cs:60) caps available tokens at one second of the configured rate, but waits for tokens covering an entire read. [Workers](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/SegmentWorker.cs:172) can read 128 KiB. If a read is larger than the bucket's capacity, it can never be granted.

Harness: limit 1 KiB/s, charge 2 KiB; cancellation was required. With normal buffers, this affects much more practical limits too.

**Fix:** charge large reads incrementally or use a capacity that can accommodate the largest charge while maintaining the aggregate rate. Test small limits, changing limits, unlimited mode, cancellation, fairness, and multiple simultaneous downloads.

### R04 — Terminal HLS failure can leave the download waiting indefinitely — P0, Reproduced

The [HLS worker loop](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/SegmentWorker.cs:415) waits while the completion predicate is false. On terminal segment failure the dequeued work is not completed, but another worker can continue polling an empty queue. [DownloadEngine](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/DownloadEngine.cs:2369) decrements remaining work only on success and awaits all workers at line 2487.

Harness: one permanently failing segment, two workers; queue empty, one worker failed, only one of two tasks completed until cancellation.

**Fix:** a shared failure/cancellation coordinator must stop sibling workers and preserve the causal error. Every queued item needs a terminal outcome. Test permanent 403/404, timeout, cancellation, retries exhausted, and fallback invocation without an infinite wait.

### R05 — A known-size server without range support is not handled sequentially — P1, Code

[AddDownloadViewModel](E:/skill/projects/smartdm/apps/desktop-avalonia/ViewModels/AddDownloadViewModel.cs:682) reduces thread count to one when ranges are unsupported. However, the [engine](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/DownloadEngine.cs:615) still constructs a bounded range worker for known-size files; the worker requires a partial response. One connection is not equivalent to a non-range GET. A valid 200 response can therefore fail.

**Fix:** carry actual probe capabilities into the transfer plan. Distinguish sequential full-body transfer from ranged transfer. Do not weaken 206 validation to achieve this. Test known-size 200, unknown-size 200, valid 206, ignored Range, and a server whose HEAD metadata is misleading.

### R06 — Ordinary transfers lack complete failure recovery — P1, Code/Gap

The [HTTP client](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/DownloadEngine.cs:412) uses infinite overall timeout. Ordinary workers do not provide a complete bounded connect/read-idle/retry policy, and sibling work is not consistently cancelled on failure. Saved timeout/retry settings do not establish that policy. Workers request HTTP/1.1 explicitly despite protocol-oriented UI text.

**Fix:** separate connect, header, and idle-read budgets; classify transient versus permanent failures; implement bounded retries with validator checks and backoff. Cancellation must reach every worker. Record actual negotiated protocol. Never switch protocols or retry counts solely to make marketing claims.

### R07 — Session ownership is vulnerable to pause/resume overlap — P1, Code

Session registration occurs after asynchronous setup. [Pause/resume/cancel](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/DownloadEngine.cs:3015) wait at most 800 ms for an old runner, then remove the session. A replacement can begin while the old runner still writes or finalizes; old cleanup also removes entries by download ID. This is a race risk, not a reproduced corruption event.

**Fix:** serialize commands per download ID, reserve ownership before asynchronous setup, and await actual worker/process shutdown before replacement. Cleanup must remove only the session instance it owns. Include scanning/finalization in cancellation rules. Test rapid repeated commands and deliberately slow shutdown.

### R08 — Media checkpoints are weaker than ordinary-file checkpoints — P1, Code

Dual-stream/audio part records lack the ordinary path's equivalent per-part identity and durable byte evidence. HLS [existing segment reuse](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/DownloadEngine.cs:2345) accepts nonempty numbered files without a sufficiently strong playlist/segment identity. A restarted stream or changed playlist can reuse stale content. Some chunk range checks also accept missing Content-Range evidence.

**Fix:** one reusable checkpoint contract: resource/representation identity, validated byte bounds, durable length/hash, and completed state only after flushing. Bind HLS segments to playlist identity and segment URI/sequence, not index alone. Test modified playlists, expired URLs, interrupted writes, truncated segments, and changed media representations.

### R09 — UI-created downloads lose important recovery metadata — P1, Code

The [creation model](E:/skill/projects/smartdm/apps/desktop-avalonia/ViewModels/AddDownloadViewModel.cs:666) does not copy the probe's ETag/Last-Modified. Safe checkpoint reuse consequently often restarts downloads created through the real UI even where engine tests manually provide a validator. [Persistence](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/SqliteDatabaseRepository.cs:51) does not preserve all source-page/format selection metadata needed to re-resolve media after restart.

**Fix:** test the complete probe → creation → database → restart → engine path. Preserve weak/strong validator semantics. Add immutable versioned migrations for representation and recovery fields; do not patch old migrations in place.

### R10 — Credential scope can be widened incorrectly — P0, Reproduced/Code

[FormatCookieHeader](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/DownloadEngine.cs:1897) falls back to returning collected cookie pairs when no domain matches; Netscape cookie handling also lacks full path/secure/expiry semantics. Harness: a cookie for `site-a.invalid` was returned for `site-b.invalid`. Browser collection combines several contexts, increasing the consequence. Cookies are stored in ordinary database fields; unused secret-store abstractions do not protect this production path.

**Fix:** use an explicit scoped credential store and standards-aware cookie matching. Never fall back to unrelated cookies. Apply scope on redirects, video/audio hosts, and playlist requests independently. Keep secrets out of normal DTOs/logs and prove production encryption/key handling, rather than relying on database branding.

### R11 — Facebook format choices can be fabricated — P1, Reproduced

[Format engine](E:/skill/projects/smartdm/extensions/chrome/modules/format_engine.js:1076) constructs several advertised resolutions from the same primary video URL and scales displayed sizes. Harness for both browsers produced four resolution labels, one unique video URL, and different claimed sizes. Choosing a lower label does not make FFmpeg stream-copy produce that lower resolution.

**Fix:** show only discovered representations with measured metadata. A single unidentified stream should be one honest option. If transcoding is later offered, make it a separate explicit operation with a real encoder plan.

### R12 — Provisional YouTube formats can survive real discovery — P1, Reproduced

[Watcher](E:/skill/projects/smartdm/extensions/chrome/modules/watcher.js:531) displays generic quality choices immediately. [mergeFormatLists](E:/skill/projects/smartdm/extensions/chrome/modules/format_engine.js:12) can match by height and retain the old nonempty watch-page URL when the actual stream arrives. Harness: an incoming real CDN URL did not replace the provisional watch URL.

**Fix:** model provisional/loading state separately from selectable formats. Replace provisional entries with verified representation IDs. Height alone cannot identify a codec/container/audio/language combination. Test slow discovery, late audio pairing, and multiple formats at the same height.

### R13 — General-site media identity remains too broad — P1, Code

Outside stronger Facebook matching, discovery can use a tab-wide media pool and assign page metadata to candidates without proving which element initiated the request. Ads, recommendations, and multiple players can be confused. Tab fallback and unknown-identity merging widen this risk.

**Fix:** maintain provenance through tab/frame/document/player/asset IDs. Do not attach the selected caption to an unproven stream. Add multi-player, advertisement, SPA navigation, iframe, and recycled-feed-node fixtures. Reject ambiguity rather than downloading a random candidate.

### R14 — YouTube URL classification accepts unrelated hosts — P1, Reproduced

[YouTubeMediaResolver](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/YouTubeMediaResolver.cs:31) accepts generic `?v=` and `/shorts/` patterns without first validating the host. `https://example.invalid/file?v=abcdef12345` was classified as YouTube in the harness.

**Fix:** exact approved host parsing and valid video-ID parsing before routing. Never use substring host checks. Add negative routing tests for unrelated sites and lookalike domains.

### R15 — Move/rename can overwrite and leave stale metadata — P0, Code

[MoveRenameDialog](E:/skill/projects/smartdm/apps/desktop-avalonia/Views/MoveRenameDialog.axaml.cs:114) calls `File.Move(..., true)` directly from the view. Failure handling can still proceed to model updates, and the application does not wire its destination-changed event into durable repository updates. A failed move or restart can leave model, disk, and database disagreeing.

**Fix:** move this into an application operation. Validate basename/canonical destination, stop active writers, explicitly resolve collisions, perform the move off the UI thread, and persist only the successful result. Test existing destination, permission failure, active download, cross-volume move, and restart. Do not silently overwrite.

### R16 — Explicit overwrite selection is not forwarded to the engine — P1, Code

[Collision callback](E:/skill/projects/smartdm/apps/desktop-avalonia/ViewModels/AddDownloadViewModel.cs:753) consumes the dialog result but only changes name/path. It does not set the model's conflict action. An engine unit test supplying Replace directly does not verify this UI workflow.

**Fix:** map every dialog choice to an explicit command and persist it; verify through the real creation path. Preserve the default never-overwrite behavior.

### R17 — Update selection and verification are insufficient — P0 release gate, Code

[UpdateCheckerService](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/UpdateCheckerService.cs:44) treats a different tag as newer, selects assets by broad extensions, and does not establish product-track/architecture compatibility or a verified update payload before launch. With two preserved product tracks, this can select the wrong product or version.

**Fix:** semantic version ordering, explicit C# release channel, OS/architecture selection, authenticated integrity/signature verification, unique temporary files, and user-visible review. Test older releases, Java-track releases, missing/wrong assets, corrupted payloads, and cancelled updates.

### R18 — Safety results claim more evidence than exists — P0 release gate, Code

[SafetyScannerService](E:/skill/projects/smartdm/apps/desktop-avalonia/Services/SafetyScannerService.cs:40) returns clean for a missing file. Its fallback at line 120 claims verified cleanliness and absence of zip-slip hazards after filename checks, without equivalent archive inspection or a successful external scan. Scanner availability/evidence is not durably represented well enough for trustworthy later UI claims.

**Fix:** separate NotScanned, Unavailable, Failed, Clean, and ThreatFound with scanner/evidence/timestamp. Missing output is a transfer failure. Filename heuristics are not antivirus or archive safety proof. Preserve evidence through persistence and display it honestly. Test unavailable scanners, timeout, cancellation, missing file, and detected threat.

### R19 — Queueing, scheduling, and settings need real operational wiring — P1, Code/Gap

Queued status and bulk start actions are not a full concurrency-controlled scheduler. Browser batch message names do not establish that the desktop durably accepts each item. Several saved settings do not consistently feed transfer creation, timeout/retry policy, tray behavior, or startup state.

**Fix:** define a single settings-to-policy flow and queue coordinator. Each exposed control needs an integration test or must be clearly unavailable. Implement bounded global/per-host scheduling and durable batch acceptance before adding more menu options.

### R20 — UI/catalog scalability has unresolved costs — P2, Code/Gap

Catalog enumeration/hashing, frequent worker notifications, mutable observable models, and list rebuilding need explicit thread/scale verification. The main download list uses ItemsControl/ScrollViewer patterns rather than a proven virtualized history surface. Some filtering work grows poorly with history size. Demo/test construction can also initiate real catalog work.

**Fix:** isolate catalog jobs from construction, inject test roots, marshal UI mutations, coalesce progress by download, and virtualize history. Measure responsiveness at 1,000 and 10,000 records and with several active downloads. Do not optimize based only on a small screenshot dataset.

### R21 — Target architecture is ahead of actual boundaries — P2, Code

The large DownloadEngine combines transport, journals, media strategy, headers, processes, and completion. View models have fallback construction and views perform filesystem operations. Domain/application projects do not yet define the production boundaries described by the ADR. Existing architecture tests cannot detect all method-body dependencies and therefore overstate boundary enforcement if interpreted broadly.

**Fix:** extract responsibilities along existing working behavior, one vertical slice at a time. Start with session coordination, transfer planning, credential policy, and finalization. Strengthen architecture checks against real assembly/dependency edges. Do not create unused layers merely to match a diagram.

### R22 — Diagnostics and tests do not yet provide a release gate — P1, Code/Gap

54 .NET and 8 browser tests are useful but leave the reproduced failures uncovered. Browser VM tests do not exercise browser permissions, service-worker suspension, native installation, or real cross-process ownership. [The staging diagnostic](E:/skill/projects/smartdm/apps/desktop-avalonia/Program.cs:549) invokes orphan cleanup without an explicitly isolated active-download test set; diagnostic operations must not touch a user's real partials.

**Fix:** isolate every diagnostic filesystem/database root. Add loaded Chrome/Firefox end-to-end tests, Windows/Linux CI, restart/fault injection, and installer/update checks. Make browser tests an explicit CI gate. Documentation must distinguish code present, automated proof, and manual proof.

## How far from IDM?

This compares SmartDM code/evidence with IDM's documented user capabilities, not IDM source code or a measured speed contest. IDM documents dynamic segmentation, resume, scheduling, browser integration, and connection/authentication options in its [features](https://www.internetdownloadmanager.com/features2.html) and [user guide](https://www.internetdownloadmanager.com/support/using_idm/using_idm.html).

| Area | SmartDM today | Distance / implication |
|---|---|---|
| Basic file transfer | Real concurrent C# workers and staging | Working foundation; no-range compatibility, timeout/retry, and limiter defects are substantial gaps. |
| Transfer efficiency | Fixed range partitioning; multiple connections | No proven dynamic redistribution equivalent. A slow final partition can dominate completion time. More connections are not automatically faster. |
| Resume/recovery | Stronger ordinary-file checkpoints; weaker media recovery | Safe reuse and UI metadata flow need work. Restarting safely can still waste substantial bandwidth. |
| Browser capture | Chrome/Firefox discovery and IPC exist | Ownership, authentication, original-request preservation, and worker restart behavior are not release-ready. |
| Video selection | Native extraction and processing exist | Format honesty, exact identity, expiry, and recovery must improve before broad site-support claims. |
| Queues/scheduler | Queued models and manual actions | Missing dependable scheduling/policy orchestration and batch acceptance. |
| Authentication/settings | Capture and settings scaffolding exist | Credential isolation and end-to-end wiring are incomplete. |
| Desktop responsiveness | Functional Avalonia UI | Large-history, catalog, thread affinity, and sustained-load proof missing. |
| Installation/updates | Helpers exist | Product-specific packaging, trust, compatibility, and cross-platform proof required. |

**Practical verdict:** suitable for controlled testing with noncritical downloads; not yet something to rely on unattended for important authenticated downloads. The remaining work is several engineering gates, not a cosmetic finishing pass. Speed may already be adequate in favorable cases; reliability is the limiting factor.

## Next goals, in the repository's required package order

Do not implement every finding concurrently. ADR-009 and the current implementation plan remain authoritative. The sequence below refines their gates; it does not replace them. P0 security/safety/update findings block release while the prerequisite transfer work proceeds.

### Goal 1 — Close Package 2: dependable ordinary transfers

Address R03, R05–R09 as applicable to ordinary files, R15–R16, and queue ownership groundwork. Preserve existing integrity tests. Add per-download command serialization, explicit range/sequential plans, bounded network failure policy, real metadata propagation, and correct collision handling.

**Exit proof:** known/unknown-size 200, valid/invalid 206, changed ETag, weak validator, disconnect, idle socket, retry exhaustion, disk-full/permission failure, low aggregate limit, rapid pause/resume/cancel, and crash during checkpoint/finalization. Every successful output matches the expected hash; every failure preserves an existing destination. No overlapping writer sessions or indefinite waits.

### Goal 2 — Close Package 3: secure persistence and lossless browser ownership

Address R01–R02, R10, durable inbox/batch handling, migrations, and production secret storage. Separate request acceptance from UI confirmation. Define idempotency and recoverable statuses across both processes.

**Exit proof:** app absent, impostor port, invalid token/origin, browser restart, desktop crash immediately after ACK, duplicate delivery, multiple captures, expired cookies, cross-domain redirects, and POST requests. No acknowledged request disappears; no credential crosses its authorized scope. Verify actual loaded Chrome and Firefox extensions.

### Goal 3 — Close Package 4: honest, recoverable media

Address R04, media aspects of R08–R09, R11–R14. Keep native HLS/Facebook extraction, YoutubeExplode, and FFmpeg; do not introduce yt-dlp. Use explicit representations and provenance rather than synthetic menus.

**Exit proof:** selected video and audio belong to the selected asset; advertised resolution exists; output is playable with correct tracks; expired URLs re-resolve the same representation; interrupted/changed HLS never reuses unrelated segments; permanent errors terminate. Use fixture-based tests plus permitted live smoke checks, recording site/date/version without logging secrets.

### Goal 4 — Close Package 5: trustworthy product behavior and release

Address R17–R18, remaining R19–R22, packaging, real settings, safety evidence, history scale, and cross-platform checks. Show only claims backed by evidence. Preserve both product branches and make C# update channels unambiguous.

**Exit proof:** Windows and Linux install/upgrade/uninstall, scanner unavailable/threat/timeout states, verified update failure cases, persistent settings, bounded scheduler concurrency, large-history responsiveness, and user-isolated diagnostics. Reconcile PHASE_STATUS, TEST_EVIDENCE, KNOWN_LIMITATIONS, and architecture documentation with observed behavior.

### Goal 5 — Measure efficiency against IDM after correctness gates

Build a reproducible benchmark before tuning connection counts. On the same Windows machine, compare identical URLs/payloads under controlled server and network conditions: 2 MB, 100 MB, and 1 GB; low/high latency; ranged and non-ranged servers; one and multiple downloads; fast and throttled servers. Include pause/resume, disconnect/reconnect, and slow final partitions. Alternate run order and repeat enough runs to report variability.

Record wall-clock completion, useful bytes/network bytes, CPU, peak/steady RAM, disk writes, resumed bytes reused, failures, and output hashes. Compare 1/4/8/16 connections and then dynamic splitting only where measurements justify it. Define speed targets after a baseline exists. Never accept corruption, credential leakage, or dropped captures as a performance tradeoff.

## Review handoff

- **Branch and commit:** `sdm2.0`, `48ec34c`; review applies to the dirty working tree, not only that commit.
- **Pre-existing dirty files:** extensive desktop, browser, docs, tests, Java, website, prototype, and launcher changes; preserved. See adjacent `PRE_EXISTING_STATUS.txt` for the captured list.
- **Package and audit IDs addressed:** review only; R01–R22 identify follow-up work across Packages 2–5. No implementation gate closed.
- **Files/modules changed:** this report and review evidence files only. No application, extension, or legacy implementation edited in this review.
- **Schema migrations:** none.
- **Exact test commands/results:** listed above; 54 .NET and 8 browser tests passed. Local harness findings are separate from the committed suite.
- **Manual verification:** code tracing and local mocked/module reproductions; no live site, installer, Linux, or IDM performance verification.
- **Privacy/security evidence:** dummy cookies and mocked HTTP used. Confirmed helper-level cookie isolation failure; bridge authentication and secret persistence require remediation. No real credential material included in this report.
- **Remaining limitations:** all open findings, untested platforms/live integrations, and lack of comparative benchmark evidence.
- **Exit gate fully satisfied:** NO.
- **Next allowed package:** Package 2, subject to the authoritative plan's prerequisite gates; release remains blocked by unresolved security/safety/update findings.
