# TEST.md — SmartDM phase-by-phase test bar

This file defines how each phase gets tested and what "pass" actually means.
It is a companion to `AGENTS.md` and the master plan
(`docs/implementation/SmartDM-Phase-by-Phase-Implementation-Plan.md`),
Section 31 in particular. Where this file gives a concrete test case, the
master plan's exit gate for that phase is still the final authority.

## 0. The standard, non-negotiable

**A phase is not done because its demo works. It is done because it cannot
be made to fail.**

- Zero known bugs at hand-off. Not "minor," not "edge case," not "will fix
  later" — if a defect is found during phase testing, the phase is not
  complete until it's fixed and re-tested.
- Zero flaky tests. A test that passes 9/10 runs is not a passing test —
  it's an undiagnosed bug in either the code or the test. Run every new or
  changed test **10 times in a row** before trusting it. Any failure in
  those 10 runs blocks the phase.
- No "mostly passes." Every item in the phase's exit gate (master plan) is
  a hard boolean. If it's not fully true, the phase is not complete.
- No suppressed warnings to make CI green. `@Disabled`, `@Ignore`,
  swallowed exceptions in tests, or reduced assertion strength to dodge a
  failure are treated as the phase failing, not passing.
- Every phase re-runs the **entire regression suite**, not just its own new
  tests. A later phase is never allowed to silently break an earlier one.
- Every test that touches timing, concurrency, or the filesystem must be
  deterministic — no `sleep`-and-hope. Use fakes/fixtures from Section
  31 of the plan, controllable clocks, and explicit synchronization.
- No test is allowed to depend on a live public website, a live antivirus
  cloud service, or the real Gemini API in the required suite. Those go in
  a separately marked, optional "manual compatibility" suite that never
  blocks CI and never blocks a phase.

## 1. The three-layer verification model, applied to every phase

1. **Automated regression suite** — must be 100% green, run twice
   consecutively with no flakes, before any manual step starts.
2. **Fault-injection / adversarial pass** — deliberately hostile inputs,
   crashes, and resource exhaustion, per the checklist for that phase
   below. This is not optional and not "best effort."
3. **Manual verification** — a short human checklist for the things
   automation cannot fully judge (visual correctness, real external tool
   compatibility, felt responsiveness). Logged in `TEST_EVIDENCE.md` with
   exact steps taken and the result observed, not just "looks good."

A phase only moves to `COMPLETE` in `PHASE_STATUS.md` after all three
layers pass and are logged.

## 2. Standard commands (run before and after every phase)

```powershell
gradlew.bat clean check
gradlew.bat architectureTest
gradlew.bat integrationTest
gradlew.bat uiTest
```

```bash
./gradlew clean check
./gradlew architectureTest
./gradlew integrationTest
./gradlew uiTest
```

Record the exact output (pass counts, not just "OK") in `TEST_EVIDENCE.md`.
A phase cannot close on a summary line alone.

---

## Phase 0 — Product, legal, privacy, and supply-chain lock

No code, so no unit tests — the "test" here is a review, and it has to be
just as unforgiving.

**Hard pass requires:**
- A written license-compatibility table for every dependency under
  consideration (SQLCipher, FFmpeg, yt-dlp, JavaFX, etc.), with the actual
  license text linked, not summarized from memory.
- A manual trace, with screenshots or captured network logs, proving zero
  outbound calls to any SmartDM-owned endpoint exist anywhere in the
  design — because none should exist at all.
- Every field intended for persistence has a row in the privacy/data table
  — no "we'll figure out what we store later."
- ADR-001 through ADR-006 exist, are internally consistent with each
  other, and don't contradict Section 3 of the plan.
- **Zero tolerance:** any unresolved "can we legally ship this?" question
  blocks every later phase — this is the one phase where "we'll decide
  later" is an automatic fail.

---

## Phase 1 — Repository and engineering foundation

**Automated:**
- Fresh clone → `clean check` green on both a Windows runner and a Linux
  runner, from a machine that has never built the project before (no
  cached Gradle state).
- A test that deliberately adds a forbidden import (e.g. `domain` module
  importing `javafx.*`) must fail the architecture test — verify the
  detector actually fires, don't just assume it does.
- A test that tampers with a dependency checksum in the lockfile must fail
  the build — verify supply-chain verification is real, not decorative.
- CI artifacts (test reports, coverage) are retrievable after the run.

**Hard pass:** a contributor with a clean machine can clone, build, and get
a green `check` with zero manual setup steps beyond installing the JDK.

---

## Phase 2 — Secure local profile and encrypted persistence

This is a security phase — treat every test here as adversarial by default.

**Automated:**
- Plant known unique strings (a URL, an API token shape, a username, a full
  file path) into the domain objects, persist them, then grep the raw
  database file, WAL file, and every log file byte-for-byte. **Zero
  matches, in any of them, ever.**
- Attempt to open the database with a wrong key 50 times in a row — confirm
  zero partial data is ever returned and no timing side-channel widens with
  repeated attempts beyond an intentional backoff.
- Start a second process against the same profile while the first is
  running — must be refused, not silently corrupt shared state.
- Rotate the encryption key, then confirm all existing data is still
  readable and the old wrapped key no longer works anywhere.
- On a Linux CI image with no Secret Service running, confirm the app
  either demands a master password or explicitly refuses sensitive
  features — grep logs and config files to confirm no plaintext secret was
  written as a fallback.

**Hard pass:** a full disk/memory dump of a running instance, searched for
every planted secret, returns nothing. This is checked, not assumed.

---

## Phase 3 — Minimal JavaFX shell and theme system

**Automated:**
- TestFX smoke test reaches every primary destination via keyboard alone
  (Tab/Shift+Tab/Enter), not just mouse clicks.
- View-model unit tests run with no JavaFX `Application` thread started,
  proving logic isn't accidentally coupled to the toolkit.
- Reference screenshots for Light/Dark/High Contrast/System themes on the
  main screens — a pixel-diff failure blocks the phase, not just a visual
  "eyeball" check.
- Inject an artificial blocking task on a background thread and confirm the
  UI thread's frame time never exceeds the budget in Section 5 of the plan
  — measured, not estimated.

**Hard pass:** zero infrastructure imports (JDBC, HTTP, process execution)
anywhere under the UI module — enforced by the architecture test, not code
review alone.

---

## Phase 4 — Single-download vertical slice

**Automated — the fake HTTP server must simulate, and a test must exist
for each:**
- Normal known-length response.
- Unknown-length (chunked) response.
- Redirect chain, and a redirect loop that must be detected and terminated.
- Server reports a length that doesn't match actual bytes sent.
- Mid-transfer disconnect.
- Connection that accepts the request but never responds (timeout path).
- Every relevant HTTP error code (401/403/404/429/500/503).
- A malicious `Content-Disposition` filename (path traversal, null byte,
  reserved Windows device name like `CON`, overlong name).
- Destination filename collision with an existing file.
- Simulated disk-full and permission-denied mid-write.

**Hard pass:**
- In every failure scenario above, the destination path never contains
  partial content saved under its final filename — verified by checking
  the actual bytes on disk, not just the reported status.
- Cancel mid-download leaves exactly the configured temp-file disposition
  (deleted or kept, per settings) — checked on disk, not just in the UI.
- Not one of these tests calls out to any real website.

---

## Phase 5 — Segmentation, pause/resume, verification, and recovery

This phase has the highest bar in the project — data corruption here is the
worst possible outcome.

**Automated:**
- Property-based tests over arbitrary file length and arbitrary segment
  count (including 1 segment, prime numbers of segments, and segment count
  greater than file byte length).
- Server that silently ignores range requests and returns the whole file.
- Server that returns a malformed/invalid `Content-Range` header.
- Resource that changes its ETag and content between pause and resume — the
  resume must be refused and surfaced to the user, never silently merged.
- Pause triggered at every segment boundary and at random byte offsets
  within a segment, then resumed — checksum the final file every time.
- Kill the process (`SIGKILL`/task-kill, not graceful shutdown) after each
  individually durable step, then restart and let recovery run —
  **every single kill point in the matrix must recover to either a
  correct complete file or a correctly resumable partial state, never
  anything in between.**
- Kill the process in the narrow window between the final segment move and
  the completion-state database commit — must never end up "file exists,
  database says incomplete" or vice versa in a way that causes re-download
  corruption.
- Deliberately corrupt one byte in a completed file and confirm hash
  verification catches it.

**Hard pass:** run the full kill-point matrix **at least 3 times per
point** (timing-sensitive crash tests are exactly the kind that flake) —
100% recovery correctness across all runs, or the phase is not done.

---

## Phase 6 — Queues, scheduler, bandwidth, and resource control

**Automated:**
- Rapid-fire priority reordering while workers are actively running — queue
  never exceeds its configured concurrency, verified by an instrumented
  counter, not just an eventual-consistency check.
- Scheduled start collides with a manual start of the same item at the same
  instant — no double-start, no dropped start.
- A schedule boundary that crosses a DST transition, tested for both the
  "spring forward" and "fall back" cases, on a system clock set to that
  date.
- Change the bandwidth limit mid-transfer and confirm the measured
  throughput converges within the stated tolerance within the stated
  window — measured, not assumed from configuration.
- Kill the process with active and deliberately "stuck" (unresponsive)
  workers, then restart — resumable state is intact for every download
  that was in flight.
- Fill the disk to induce pressure mid-queue and confirm the scheduler
  degrades safely (pauses/queues) rather than crashing or corrupting.

**Hard pass:** queue capacity is checked with an actual concurrent stress
test (dozens of adds/removals/reorders per second for at least 60 seconds),
not a single-threaded happy-path test.

---

## Phase 7 — Categories, batch, clipboard, authentication, and proxy

**Automated:**
- Every input path (manual add, batch, clipboard, category auto-rule)
  is traced to confirm it produces the exact same `AddDownload` command —
  a test that adds via each path and diffs the resulting command object.
- Category rule ordering test with deliberately conflicting/overlapping
  rules — result must be deterministic and match documented precedence.
- Batch add with an abusive size (attempt thousands of URLs at once) and
  with malformed/garbage lines mixed in — must be rejected/limited without
  freezing the UI.
- Clipboard monitor test that plants a secret-looking string (token/
  password pattern) and confirms it is never logged or persisted
  unencrypted.
- Auth flow that redirects cross-origin — confirm credentials/headers are
  **not** forwarded to the new origin.
- Proxy authentication tested against a local fixture proxy, including the
  proxy being offline (must fail gracefully, not hang indefinitely).

**Hard pass:** grep every log file produced during this phase's test run
for the planted secret strings — zero matches.

---

## Phase 8 — Chrome and Firefox native browser integration

**Automated:**
- Protocol fuzz test: malformed JSON, oversized messages, and messages
  with unexpected fields — native host must reject cleanly, never crash.
- A message claiming to come from a wrong/unregistered extension ID must
  be rejected, tested with the fixed Chrome ID and a spoofed one.
- Native host binary missing, an old protocol version, and a newer
  protocol version than the host understands — each must degrade with a
  clear message, not hang or silently drop messages.
- Chrome service worker suspend/resume cycle — confirm messages sent while
  the worker was asleep are not lost.
- Firefox background script lifecycle equivalent.
- Link collector stress test with a page containing several thousand
  links — UI stays responsive, no message-size violation.
- Cookie handoff requires explicit consent per test, and a deletion test
  confirms cookies are actually removed from encrypted storage, not just
  hidden from the UI.
- Reload/reinstall the Chrome extension 5 times and confirm the ID never
  changes (fixed manifest key working correctly).
- On a Snap-packaged Firefox/Chromium test image, confirm the capability
  notice fires — this is a required automated or scripted-manual test, not
  an assumption based on the code existing.
- Take the actual signed `.xpi` produced by the release pipeline and
  install it on an unmodified, standard-release Firefox — must succeed
  with zero special preference flags.

**Hard pass:** unplug the browser entirely (uninstalled/not running) and
confirm the desktop app has zero degraded behavior outside the browser
capture feature itself.

---

## Phase 9 — yt-dlp and FFmpeg media subsystem

**Automated:**
- Locally hosted test media fixtures with committed, known-good metadata —
  no dependency on any real streaming site for the required suite.
- Mocked yt-dlp/FFmpeg processes that return malformed JSON, partial
  output, a hang (must be killed by the configured timeout), a crash, and
  an oversized stdout — one test per failure mode, all must recover with a
  clear error, not a stuck spinner.
- Deliberately attempt argument injection through a crafted video title,
  URL, and destination path — confirm the process is invoked with a fixed
  executable and an argument array, and that no shell interpretation ever
  occurs.
- Video-only + audio-only stream merge produces a valid, playable output
  file (checked by a fixture parser, not by eye).
- Audio extraction, subtitle selection, cancellation mid-download, disk
  full mid-merge, tool binary missing, and a forced tool update rollback —
  one test each.

**Hard pass:** the argument-injection tests are run with inputs containing
shell metacharacters (`; | & $() \`` etc.) and confirm they end up as inert
literal argument content, never executed.

**Separate, non-blocking suite:** a manual/optional run against real
yt-dlp/FFmpeg and a real, authorized piece of content — logged, but never
required for the phase to close.

---

## Phase 10 — YouTube thumbnail SmartDM panel

**Automated:**
- DOM fixture tests covering every supported YouTube layout variant
  committed to the repo (not fetched live).
- Fixtures that add/remove/recycle thumbnail elements rapidly (simulating
  YouTube's virtualized lists) — confirm no duplicate overlay icons appear
  and none are left orphaned.
- Keyboard navigation reaches the overlay control, and a screen-reader
  fixture confirms it's announced correctly.
- Chrome MV3 service worker wake/sleep cycle while the overlay is active.
- Firefox equivalent lifecycle test.
- Native host/app not running, and a protocol-version mismatch — overlay
  must disable itself with a clear state, never silently do nothing.
- Format-list response latency measured against budget; cache invalidation
  tested by changing the underlying fixture data and confirming stale
  results are not shown.

**Hard pass:** take one of the committed DOM fixtures and mutate its
structure to simulate a YouTube layout change — confirm only the overlay
disables, and normal SmartDM downloads (Phase 4–8 functionality) are
provably unaffected by re-running that regression suite in the same run.

**Separate, non-blocking suite:** one manual pass against real YouTube
using content the tester is authorized to download.

---

## Phase 11 — Local file catalog and duplicate detection

**Automated:**
- Synthetic tree of 100,000 files, indexed incrementally — measured
  against the Potato-mode budget in Section 5, not just "it finished."
- Permission-denied entries, symlink cycles, filesystem watcher overflow,
  and rapid rename/move/delete during an active scan — one test each, all
  must leave the catalog consistent, not crashed or half-updated.
- Confirm scan I/O is throttled appropriately on a simulated HDD-speed
  fixture (not just SSD-speed testing).
- Quick-fingerprint collision test escalates to full hash before declaring
  a duplicate — verified by asserting the full-hash function was actually
  invoked, not just that the UI shows "duplicate."
- Remove a catalog root and confirm its metadata rows are purged from the
  encrypted database while the underlying user files on disk are
  completely untouched — checked by file timestamp/hash before and after.
- Dump the raw encrypted database file and confirm no plaintext path or
  filename is recoverable from it.

**Hard pass:** the catalog must never scan a single byte outside
user-approved roots — proven with a canary file placed outside the
approved root that must never appear in any index or log.

---

## Phase 12 — Local smart folder selection

**Automated:**
- Fixed ranking fixtures with known expected order — any change to the
  scoring logic that reorders these fixtures unexpectedly fails the test.
- A learning test that repeats the same synthetic user choice many times
  and confirms the ranking measurably shifts toward it.
- A reset action removes 100% of the learned influence — verified by
  re-running the ranking fixture and getting back the original baseline
  order.
- Malicious filename/path fixtures (`../`, absolute paths, symlinked
  targets) must never cause a suggestion to point outside approved roots.
- Simulate low disk space and a permission change on a suggested folder —
  confirm the suggestion is invalidated rather than presented as valid.
- Every suggestion's "why" explanation links to real catalog evidence that
  can be independently verified, not a generic string.

**Hard pass:** with Gemini fully disabled (default state), the top-three
suggestions still work correctly on every fixture — this is the default
configuration and must not be treated as a degraded/secondary test path.

---

## Phase 13 — Local natural-language search

**Automated:**
- A parser corpus covering every supported phrase pattern from the plan's
  real-world query examples, plus deliberately ambiguous phrasings — each
  has an expected, inspectable query plan.
- Time-zone boundary and date-boundary tests (midnight rollover, DST) for
  every relative-date phrase ("yesterday," "last week").
- FTS query construction tested against injection-style input (quotes,
  operators, control characters) — must be safely escaped, never crash the
  query engine or return unrelated results.
- 100,000-item synthetic index, p95 latency measured against the Potato
  budget.
- Remove/corrupt the optional semantic pack and confirm search still
  functions (degraded gracefully, not broken).
- A network-capture test running the full search suite confirms zero calls
  to Gemini or any external endpoint occur.

**Hard pass:** every acceptance query listed in the plan for this phase
produces a plan a human can read and verify is doing what it claims — not
just "returned some results."

---

## Phase 14 — Optional Gemini consented fallback

**Automated:**
- A fake local Gemini server exercising every documented status code and
  a battery of malformed/truncated/oversized responses — each must be
  handled without crashing or corrupting local state.
- Sanitizer test that deliberately tries to smuggle a forbidden field
  (raw file path, secret, unrelated personal data) into the outbound
  payload — must be stripped or the request blocked before it leaves the
  device.
- Consent dialog cancellation and timeout paths — confirm zero network call
  was made in either case.
- API key redaction test across logs, exceptions, and any diagnostic
  bundle export.
- A response inventing a file path or candidate that was never in the
  approved payload must be rejected, not silently trusted.
- Simulate quota exhaustion and confirm every local feature (search,
  suggestions, catalog) continues to work with zero degradation.
- A real network capture (e.g. via a local proxy) during the full disabled-
  by-default test run proves **zero outbound calls occur before explicit
  per-request approval.**

**Hard pass:** remove the API key entirely mid-session and confirm every
Gemini-dependent UI element disappears or disables cleanly, with zero
crash and zero impact on core downloading/search/catalog features.

---

## Phase 15 — Local safety scanner and risk center

Treat this phase like a security product, because it is one.

**Automated:**
- EICAR test file used only inside controlled, isolated test directories,
  per the antivirus engine's own testing guidance — confirms detection
  actually fires end-to-end.
- Benign executable, document, and archive fixtures must never be
  false-flagged.
- MIME-type-vs-extension mismatch and double-extension (`invoice.pdf.exe`)
  fixtures must be correctly flagged.
- A simulated zip-bomb fixture, sized safely for automated CI, confirms
  the scanner enforces safe expansion limits rather than exhausting memory
  or disk.
- Antivirus engine missing, stale definitions, and blocked/disabled by the
  OS — each must produce an honest "incomplete scan" state, never a false
  "safe."
- Scanner process timeout and forced crash — must fail safe (treated as
  unscanned/unsafe-to-open), never fail open.
- Quarantine path-traversal attempts and permission-boundary tests.
- A test that attempts to have the Gemini explanation layer alter a
  verdict — must be structurally impossible, not just discouraged by
  convention; verify the verdict type has no mutation path reachable from
  AI-generated text.

**Hard pass:** confirm zero file bytes and zero hashes leave the device
during the entire test run via network capture — including during the
EICAR and zip-bomb tests. A malware verdict must physically block
direct open/run of the file through the app, tested by attempting it.

---

## Phase 16 — Remaining IDM-parity workflows

**Automated:**
- Site crawler test with an intentional link loop, scope violation attempt,
  and rate-limit boundary — must terminate correctly and respect limits.
- A "download later" link where the underlying resource changed between
  scheduling and execution — must be detected and surfaced, not silently
  fetch the wrong content.
- Import a corrupted file and a version-mismatched export file — must be
  rejected cleanly with a clear message, never partially imported.
- CLI authentication test confirms no secret appears in process listings,
  shell history-visible arguments, or logs — pass secrets via a secure
  channel (stdin/file), never as a bare CLI argument.
- Power-action (shutdown/sleep after queue completes) countdown and
  cancellation tested with simulated timers, not real machine shutdown in
  CI.
- Move a completed file via SmartDM's own file-move feature and confirm
  the catalog/history update is atomic — kill the process mid-move and
  confirm no orphaned or duplicate records exist afterward.

**Hard pass:** every advanced workflow in this phase, when disabled by the
user, has zero residual effect — verified per feature, not assumed.

---

## Phase 17 — UX, accessibility, localization, and performance hardening

**Automated:**
- Every performance budget from Section 5 of the plan is measured with
  actual benchmarks on the Potato profile hardware target, and the numbers
  are recorded — "feels fast" is not an acceptable result.
- 100,000 rows of download history and catalog records loaded, then the
  full UI smoke suite is re-run against that dataset size.
- UI automated smoke test under artificially slowed disk/network I/O
  (fault-injection framework from Phase 5/6) — no freeze, no crash.
- An automated accessibility checker (contrast ratios, focus order, labels)
  runs against every screen, zero critical findings allowed.
- Localization test renders every supported locale's longest strings and
  confirms no UI truncation/overlap.
- A full network capture with every optional external feature (Gemini,
  updates) disabled must show **zero** outbound requests during a full
  UI walkthrough.

**Hard pass:** manual screen-reader pass (e.g. NVDA on Windows, Orca on
Linux) on every primary screen, logged with the exact steps and what was
heard — "accessible" is claimed only after this, not assumed from the
automated checker alone.

---

## Phase 18 — Packaging, browser-extension bundling, update, and release hardening

**Automated + scripted:**
- Full release test matrix: every supported Windows version and every
  supported Linux package format, each running install → launch → browser
  registration → download → media selection → search → scan → update →
  uninstall, end to end.
- Chrome and Firefox tested in both a non-sandboxed build and a
  Snap/Flatpak build, confirming the Phase 8.5 capability check behaves
  correctly in both.
- Every release artifact's published SHA-256 checksum is independently
  recomputed and compared — must match exactly, and the UI/download page
  must correctly display the unsigned-status disclosure.
- Fresh install, upgrade over a previous version, a deliberate downgrade
  attempt (must be refused, not silently allowed), and full uninstall —
  confirm uninstall leaves no orphaned service, scheduled task, or
  autostart entry.
- Update flow tested with a checksum mismatch injected — must refuse to
  apply the update, never execute unverified content.
- Kill the app mid-update and confirm the atomic staging/rollback path
  recovers to a working previous version, not a half-updated broken state.

**Hard pass:**
- Every item in Phase 18's exit gate in the master plan is independently
  re-verified, not carried over by assumption from earlier phases.
- No macOS artifact exists anywhere in the release output.
- No premium/entitlement code path exists anywhere in the codebase —
  checked with a repo-wide search, not just "we didn't add one."
- `KNOWN_LIMITATIONS.md` is reviewed and every entry is either fixed or
  explicitly, knowingly accepted before release — nothing is discovered
  for the first time after shipping.

---

## Final note

If any phase above cannot honestly meet its "hard pass" bar, the correct
outcome is a documented blocker and a fix — never a lowered bar, a skipped
test, or a note that says "will verify manually later." Section 3 of
`AGENTS.md` applies here too: a prior session's shortcut is not
authorization to repeat it.
