# SmartDM Testing desk

Open [smartdm_testing_checklist.html](smartdm_testing_checklist.html) directly in a
modern browser. It is one portable HTML file; no server, account, extension, build
step or network connection is required. The separate SmartDM application still
performs the downloads you are testing.

## Testing workflow

1. Set **Test setup**: app and extension version, branch/commit, browser, OS, and
   relevant settings. These are included in the handoff.
2. Select a site and open its link. Record individual successful or failed
   **Checks**, then use **Pass site**, **Fail / record bug**, or **Blocked** for
   the overall result. Blocked means the site could not be tested; explain why
   in **Notes & history**.
3. Record each distinct failure as a separate bug. Start with its title and
   actual error; add the exact page, selected server/quality, steps, expected
   behavior, frequency, logs and related check when available.
4. Paste screenshots with Ctrl+V, drag them into **Screenshot evidence**, or
   select **Attach screenshots**. Choose **Site overview** or a specific bug
   in the attachment selector. Add a caption so the agent knows what it shows.
5. Export the **AI handoff bundle** for the current site or multiple sites.
   Hand the downloaded ZIP to the implementing agent.

One site can contain many bugs. A bug marked `fixed` still needs retesting;
`verified` means the tester has checked the fix. Open/fixed bugs and failed checks
prevent a whole-site pass. Resetting a result keeps the bugs and prior history.
The desk records manual observations; it does not independently certify downloads.

## Import sites

**Import sites** accepts pasted text and text/CSV/TSV/Markdown files. For example:

```text
Name | URL | Category
RamoFlix | https://ramoflix.net | Movies
7Movies | https://7movies.ac | Movies
Example | https://example.com | General
```

Spreadsheet columns, quoted CSV, `[Name](https://example.com)`, `Name URL`,
name/URL pairs on consecutive lines and URLs on their own also work. Preview
shows new sites, duplicates and invalid rows before importing valid entries.
Exact normalized URLs are deduplicated; query strings and fragments are retained.
Existing sites/results are preserved. New sites receive common download checks
that can be extended with **Add check**.

The original file's 49 sites and 102 checks are included. On the original file
path, its `smartdm-checklist` local-storage checkbox array is migrated when its
length matches. Previously checked items become passed checks; this does not
invent overall site passes. The old local-storage entry is left untouched.

## Export and restore

| Export | Contents | Intended use |
| --- | --- | --- |
| AI handoff ZIP | `report.md`, `report.json`, `README.md`, `screenshots/` | Give to an AI agent; images remain inspectable files |
| Markdown | Setup, site results, checks, bugs and history; no image bytes | Read/share a text-only summary |
| Backup JSON | Restorable workspace records plus embedded screenshots | Move browsers/machines or protect against browser-data loss |

Scope can be **Current site**, **All sites**, **Failed sites**, **Passed sites**,
or **All tested sites**. The generated Markdown explicitly identifies missing
details instead of inventing reproduction steps. Record IDs and screenshot paths
link structured records to their evidence. Reports include successful checks as
regression cases. Opening a ZIP alone does not mean an agent has viewed the images:
the handoff tells it to extract and inspect the referenced screenshot files.

Restore through **Import sites → Restore a workspace backup instead**. Restore
validates the full inventory and screenshot bytes before asking to replace the
workspace. It does not execute imported HTML, scripts or URLs. `report.json` is a
report, not a restorable backup.

## Storage and limits

- Results and original screenshot Blobs are saved locally using IndexedDB. Images
  are not uploaded, recompressed or sent to an AI automatically.
- Browser storage belongs to the browser profile, origin and file path. Keep the
  HTML in the same place; use JSON backup/restore when moving it. Private browsing
  and clearing browser data can discard results. A backup is the portable copy;
  the HTML file itself does not contain newly recorded test data.
- If IndexedDB is unavailable, notes can fall back to local storage; screenshots
  remain in memory. The page displays this limitation and requests a backup before
  closing. Failed writes display an error rather than silently claiming success.
- Another tab saving the same workspace pauses editing to avoid overwriting its
  newer results. Export your current copy if needed, then reload.
- Maximum 2,000 sites; import text up to 1 MB; PNG/JPEG/WebP/GIF evidence up to
  12 MB per image; 200 images per site overview or bug; backup restore up to
  150 MB. Browser storage quotas can be lower. Use a smaller export scope for
  large screenshot collections.
- Screenshot removal and bug removal require confirmation. Failed exports do not
  remove existing data. Missing evidence blocks image-inclusive export and names
  the missing file.
- Test notes, URLs and screenshots can contain private data. Review the export
  before sharing. The application deliberately makes no network requests; a CSP
  blocks external connections and script dependencies. Clicking a site link opens
  that chosen site in a separate tab.

## Development and verification

The `testing-core` inline script holds pure import, schema, status, report and ZIP
functions. `testing-app` holds DOM events and local persistence. Keeping both in
one HTML file allows the user's existing file to remain portable and offline.

```powershell
node --test tests/testing-desk/*.test.cjs
```

The tests use Node built-ins and Python's standard `zipfile` module for an
independent ZIP/CRC check. Browser verification should cover a failed site with
multiple bugs, an attached/pasted image, reload persistence, passing checks,
bulk import, per-site and all-site exports, and JSON restore. Use
`?sandbox=1` for a separate preview database; never overwrite the tester's real
records with demonstration bugs. Browser UI verification is not covered by a
pure-data unit test.
