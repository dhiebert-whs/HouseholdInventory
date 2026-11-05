# Stage 4 session log

Times are America/Chicago (CDT).

---

## Session 1 — 2026-10-17

**SESSION IDENTITY**
Claude Code (Opus 5.5), VS Code/terminal on Dan's Windows machine. Repo: `C:\Users\dhiebert\Local Repositories\InventoryManagement`. Stage 4, Step 0 (review and plan; no code).

**DATES & TIMES**
| Time | Activity |
|---|---|
| ~15:55 (exact start not recorded; after the 15:54 "first publish" commit) | Request received. Repo held only the extracted seed files; asked Dan for the kit |
| ~16:00 | Kit files added at the root. Seed loose files verified byte-identical to the ZIP (130/130) and removed. Kit moved into `docs/`, `seed/`, `assets/` |
| ~16:05 | Mockup sources were nested one level too deep; verified against `mockup-source.zip` (68/68) and moved to `docs/mockups/source/` |
| 16:09 | Commit `a64562d` "Arrange Stage 4 kit" |
| 16:09–16:14 | Read SPEC v0.5, design notes, verification report, INDEX and the source README; scripted seed checks; checked Chrome Web Share file types (MDN) |
| ~16:15 | Wrote `docs/history/spec-questions.md`, `docs/history/stage4-plan.md` and this log |

**WORK COMPLETED**
- Repo arranged per START-HERE.md; extraneous ZIPs removed; committed.
- Seed verified: 129 items, 168 vendor options, 128 photos, 9 suppliers; on_hand 0 → 124 priced lines, $8,413.66.
- Spec review: 10 questions plus 8 minor default decisions.
- Build plan: dependencies, repo structure, Dexie schema, 10 milestones with F-criteria, tests and risk levels.

**DELIVERABLES PRODUCED**
`docs/history/spec-questions.md`, `docs/history/stage4-plan.md`, `docs/session-log.md` (uncommitted; they'll go in with M1 or on request).

**PREDECESSORS / CONTEXT**
Stages 1–3 (claude.ai): SPEC v0.5, `stage3-design-notes.md`, `docs/history/stage3-verification.md`, 67 mockup artboards, seed ZIP.

**CONFIDENCE**
High on the seed numbers (scripted). High that `.zip` is not on Chrome's Web Share allow-list (MDN), but it needs a check on the Tab S8. The other questions are judgment calls for Dan.

---

## Session 1 (continued) — M1 Foundation

**DATES & TIMES**
| Time | Activity |
|---|---|
| 16:17 | Dan: "defaults OK, use Preact, commit docs with M1". Approval recorded in `docs/history/spec-questions.md` |
| 16:18–16:24 | Scaffold (Vite 8, TS 7, Preact 11, Vitest 5, Dexie 4, Papa Parse, JSZip, Fontsource); domain types, money, order, status, validation, ids |
| ~16:22 | Dan: commit regularly, push every 5 commits and at milestone completion, set up Pages. Remote exists (`ShrapnelSergeants2408/InventoryManagement`, private); `gh` token invalid; `git push` works via the credential manager |
| 16:25 | Domain tests 44/44; commit `70001b1` |
| 16:25–16:26 | Storage, CSV codec, list files, ZIP/seed reader, DB and seed tests: 89/89; build clean; commit `da484d2` |
| ~16:27 | Dan: the repo can be made public if necessary |
| 16:27–16:30 | M1 verification: mutation check (7 caught, 1 equivalent), real Chrome IndexedDB check ($8,413.66), Pages workflow, review `docs/reviews/M1.md` |

**WORK COMPLETED**
M1: data model, IndexedDB storage, order math, CSV codec, starter-catalog reader, deploy workflow.

**DELIVERABLES PRODUCED**
`src/domain/*`, `src/data/*`, `src/io/*`, `tests/*` (89 tests), `scripts/cdp-check.mjs`, `.github/workflows/deploy.yml`, `docs/reviews/M1.md`.

**PREDECESSORS / CONTEXT**
Step 0 (above).

**CONFIDENCE**
High for the M1 math and codec (tests, mutation check, real-browser check). Pages isn't enabled yet; it needs Dan (see the M1 summary).

---

## Session 1 (end) — GitHub setup

| Time | Activity |
|---|---|
| ~16:31 | Push to main rejected (ruleset: PR required). M1 pushed to branch `m1-foundation` |
| ~16:35 | Dan removed GITHUB_TOKEN and made the repo public (verified via API) |
| 17:06 | `gh auth login` blocked by an inherited GITHUB_TOKEN in the VS Code terminal; Dan restarting VS Code. Session paused |

**Next:** gh login → open M1 PR → enable Pages (GitHub Actions) → after merge, check the deploy → M2. Open question: vendor photos on the public site (SPEC §8).

---

## Session 2 — 2026-10-17 — M1 PR, Pages, M2

**SESSION IDENTITY**
Claude Code (Opus 5.5), VS Code terminal on Dan's Windows machine. Stage 4: M1 hand-off, then M2.

**DATES & TIMES**
| Time | Activity |
|---|---|
| ~17:50 | Resumed. `gh auth status` OK (account `dhiebert-whs`, scopes repo + workflow; admin on the repo) |
| ~17:52 | **PR #1** opened: m1-foundation → main (https://github.com/ShrapnelSergeants2408/InventoryManagement/pull/1) |
| ~17:53 | **GitHub Pages enabled**, source = GitHub Actions (API `build_type: workflow`). `github-pages` environment allows deploys from `main` only. Found the org's custom domain: the site will be **https://team2408.com/InventoryManagement/**; the github.io URL 301-redirects there; HTTPS works |
| ~17:55 | Dan's answer on public vendor photos: **"accept it"**, recorded in `docs/history/spec-questions.md` › Later decisions |
| 17:56–18:02 | M2 domain: search, filters, grouped view, prefs, `adjustOnHand`; commit `b36789b` (140 tests) |
| 18:02–18:10 | M2 UI: shell, Inventory screen, stepper, filter panel, thumbnails, storage error; browser check script; two stepper bugs found and fixed by it; commit `acdfa02` |
| 18:10–18:14 | 15 px text (§17), storage-error browser scenario; commit `0ec5de8` |
| 18:14–18:20 | M2 verification: mutation check (15/15 after one test fix), code read (4 fixes), `docs/reviews/M2.md` |

**WORK COMPLETED**
- M1 handed off: PR #1 open; Pages on. The deploy runs when #1 is merged.
- M2: F1–F5, §2 storage-error screen, §17 shell and states. 161 tests; 28 browser checks.

**DELIVERABLES PRODUCED**
`src/domain/{search,filters,inventory-view,image-size}.ts`, `src/data/{prefs,photos}.ts`, `src/ui/**` (App, Shell, router, Inventory, ItemRow, FilterPanel, OnHandStepper, StorageError, Placeholder), `src/styles/app.css`, `scripts/m2-ui-check.mjs`, 7 new test files, `docs/reviews/M2.md`.

**PREDECESSORS / CONTEXT**
Session 1 (M1); mockups 1a–1g.

**CONFIDENCE**
High for the list logic (tests, mutants, real browser). Medium for touch and keyboard feel until the Tab S8. **Flag (M10, medium):** the site's origin is team2408.com, shared with the team website (see M2 review, finding 8).

**Next:** Dan merges PR #1 (use **"Create a merge commit"** so the M2 PR stays clean), then I check the deploy and the live site. Then the M2 PR, then M3.

---

## Session 3 — 2026-10-17 — deploy check, M3

**SESSION IDENTITY**
Claude Code (Opus 5.5), VS Code terminal on Dan's Windows machine. Stage 4: deploy check, then M3.

**DATES & TIMES**
| Time | Activity |
|---|---|
| 23:12 | Dan merged PR #1 and PR #2 (both "Create a merge commit") |
| ~23:14 | Deploy check: the run for #1 was cancelled because the #2 run replaced it (one deploy at a time); the run for #2 **succeeded** (34 s). `shrapnelsergeants2408.github.io/InventoryManagement/` → 301 → `team2408.com/InventoryManagement/` → 200. Headless Chrome on the live URL: starter catalog loaded in about 1 s, "129 items · 124 short · 0 low spares", 12 categories, thumbnails render, secure context, no console errors |
| ~23:16 | Local `main` fast-forwarded to `origin/main` (it had no extra commits after all) |
| 23:18 | Branch `m3-edit-lists`: M3 started (item detail, add/edit/remove, suppliers, categories, locations) |
| 23:18–23:26 | M3 domain and data: item form, list rules, links, add/edit/delete, supplier/location/category changes; commit `b3b7193` (238 tests) |
| 23:26–23:36 | M3 UI: detail card, editor, delete, More, Suppliers, Categories, Locations, PIN gate stand-in; commit `bc77128` |
| 23:36–23:46 | Browser check script (50 checks); it found the double detail card after saving (fixed: router remembers where each screen was opened from); portrait fixes; commit `ea62d6f` |
| 23:46–23:55 | M3 verification: mutation check 22/22, code read (locked vendor fields kept as stored, "No location" reserved, Escape on the photo), commit `18d6bde`; `docs/reviews/M3.md` |

**WORK COMPLETED**
- Deploy of M1+M2 verified on the live site.
- M3: F6–F11, F23, F25, with every PIN step going through `gate(reason)` (stand-in dialog until M6). 252 tests; 50 browser checks; M2's 28 still pass.

**DELIVERABLES PRODUCED**
`src/domain/{item-form,lists,url,dates,item-text}.ts`, `src/data/{items,lists}.ts`, `src/security/gate.ts`, `src/ui/screens/item/*`, `src/ui/screens/more/*`, `src/ui/components/Dialog.tsx`, `src/ui/shell/GateHost.tsx`, `scripts/m3-ui-check.mjs`, 6 new test files, `docs/reviews/M3.md`.

**PREDECESSORS / CONTEXT**
Sessions 1–2 (M1, M2); mockups 2a–2e, 3a–3e, 7a–7k, 9a.

**CONFIDENCE**
High for the list rewrites and the PIN rule (tests, mutants, real browser with IndexedDB read-back). Medium for typing in the form on the Tab S8 until Stage 5. **Flag (until M6, medium):** the PIN stand-in only asks for a confirmation, and once M3 is merged that is what the live site does (M3 review, finding 5).

**Process note:** during the review, `git checkout --` on one file to undo a deliberate test mutation also discarded that file's uncommitted fix. It was restored from a copy taken just before; tests confirmed nothing was lost. From now on, mutations are reverted from a saved copy only.

**Next:** Dan merges PR #3 (M3), then M4 (order list, high risk: money).

---

## Session 3 (continued) — 2026-10-18 — M3 deploy check, M4

| Time | Activity |
|---|---|
| 00:03 | Dan merged PR #3 (M3). Deploy run **succeeded** (37 s). A manual `workflow_dispatch` deploy also ran at 23:33 on the 17th (not started by me; it succeeded). Live site serves the M3 build (`index-DeAVgDPs.js`, same as the local final build): detail card, Suppliers and the locked editor all work on team2408.com |
| 00:04 | Branch `m4-order-list` |
| 00:04–00:09 | Order domain: catalog-order lines, supplier groups ignoring capitals, stale prices, banners, order CSV, share-or-download; commit `9349866` (274 tests) |
| 00:09–00:13 | Order screen, export dialog, price-refresh steps; `scripts/m4-ui-check.mjs` (25 checks); banner and preview layout fixed from the screenshots; commit `b83e6d1` |
| 00:13–00:18 | M4 verification: mutation check 18/18 (added a spring-DST test), code read, `docs/reviews/M4.md` |

**WORK COMPLETED**
M4: F12, F13, F14 (and §4 on screen). 274 tests; 25 browser checks; M2 and M3 checks still pass.

**DELIVERABLES PRODUCED**
`src/domain/stale.ts`, `src/io/order-csv.ts`, `src/io/share.ts`, `src/ui/screens/order/*`, `scripts/m4-ui-check.mjs`, `tests/order-list.test.ts`, `docs/reviews/M4.md`.

**CONFIDENCE**
High for the money: the full starter-catalog CSV is recomputed to the cent from its text, and every row is checked in the browser. Medium for share versus download on the Tab S8 (Stage 5, Q1).

**Next:** Dan merges PR #4 (M4), then M5 (backup, restore, price import; high risk; fresh-session review recommended afterwards).


---

## Session 4 — 2026-10-18 — M5

**SESSION IDENTITY**
Claude Code (Opus 5.5), VS Code terminal on Dan's Windows machine. Stage 4: M5 (backup, restore, share, price import).

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| before 07:27 | Dan merged PR #4 (M4); merge commit `48e6a33` |
| ~07:27 | Branch `m5-backup-restore` from `main`; read SPEC F15–F18, §7, §10, spec-questions Q1/Q3/Q4/Q5/Q8/Q10/D7, mockups 8a–8e |
| 07:27–07:36 | Backup ZIP/CSV build, restore plan and one-transaction apply (`replaceAll` with keep-photos), price-import plan and apply, reminder clock; 38 new tests; commit `fc2057d` |
| 07:36–07:43 | Backup & restore screen, restore dialog, problem and summary dialogs, reminder banner on Inventory and Backup, More row; `scripts/m5-ui-check.mjs` (37 checks); 2 bugs found by it and fixed; commit `e5ae0f2` |
| 07:43–07:55 | M5 verification: mutation check (26 mutants, 25 applicable caught after 2 test gaps closed), Windows-1252 fallback, storage status in About, regression of the M2–M4 browser checks, `docs/reviews/M5.md` |

**WORK COMPLETED**
M5: F15, F16, F17, F18, §2 storage status. 313 tests; 37 browser checks; the M2, M3 and M4 checks still pass (28, 50, 25).

**DELIVERABLES PRODUCED**
`src/io/{backup,restore,price-import}.ts`, `src/data/{backup,price-import}.ts`, `src/domain/backup-reminder.ts`, `src/ui/screens/more/{Backup,RestoreDialog,ImportDialogs,export-backup}.tsx/ts`, `src/ui/shell/BackupBanner.tsx`, `scripts/m5-ui-check.mjs`, `tests/{backup-restore,price-import,backup-reminder}.test.ts`, `docs/reviews/M5.md`.

**PREDECESSORS / CONTEXT**
Sessions 1–3 (M1–M4); mockups 8a–8f; `io/bundle.ts` (M1 reader) reused for restore.

**CONFIDENCE**
High for the data paths: byte-for-byte round-trip tests, a forced mid-transaction failure, mutants, and a real-browser restore read back from IndexedDB. Medium for share/download and the file picker on the Tab S8 (Stage 5). **Flag:** restore and price import are behind the PIN stand-in until M6. **An independent fresh-session review of M5 is recommended** (stage4-plan §4).

**Next:** Dan merges PR #5 (M5), ideally after a fresh-session review; then M6 (mentor PIN and settings; high risk).


---

## Session 5 — 2026-10-18 — M6

**SESSION IDENTITY**
Claude Code (Opus 5.5), VS Code terminal on Dan's Windows machine. Stage 4: M6 (mentor PIN and settings).

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| 08:55 | Dan merged PR #5 (M5); merge commit `cf9b665`. Branch `m6-pin-settings` from `main`. Read SPEC §6, §17, D6, S9, Q2 and mockups 0b, 9a–9g |
| 08:55–09:05 | PIN hashing and recovery code, unlock timer, gate checks the unlock, wrong-try wait, PIN pad, first-launch setup, live lock button, More lock card, Change/Forgot PIN, Reminders & limits screen, Escape only closes the top dialog; 24 new tests; commit `aa27471` |
| 09:05–09:32 | M2–M5 browser checks switched to the real setup and PIN (`scripts/pin-helpers.mjs`), all still pass; `scripts/m6-ui-check.mjs`; vendor saves re-check the lock; commit `375b8f0` |
| 09:32–10:05 | M6 verification: unit mutation check (27/27 after 4 test gaps closed), settings relock check, `docs/reviews/M6.md`. The interface mutation run was stopped by Claude Code for low memory after 1 of 7 (caught); its leftover mutant was reverted from git and the clean build re-checked (49/49 twice) |

**WORK COMPLETED**
M6: §6 in full (setup, hashing, recovery, unlock length, lock button, wait after wrong tries, settings, change PIN) and the real gate behind every PIN step from M3–M5. 339 tests; 49 browser checks; the M2–M5 checks pass with the real PIN.

**DELIVERABLES PRODUCED**
`src/security/{pin,lock,gate}.ts`, `src/data/pin.ts`, `src/domain/settings-limits.ts`, `src/ui/components/PinPad.tsx`, `src/ui/shell/{GateHost,LockPill,PinFlows}.tsx`, `src/ui/screens/Setup.tsx`, `src/ui/screens/more/{Settings,PinDialogs}.tsx`, `scripts/{pin-helpers,m6-ui-check}.mjs`, `tests/pin.test.ts`, `docs/reviews/M6.md`.

**PREDECESSORS / CONTEXT**
Sessions 1–4 (M1–M5); `gate(reason)` calls from M3–M5 kept unchanged; mockups 0b and 9a–9g.

**CONFIDENCE**
High for the PIN logic: fake-timer tests of the exact expiry, mutants, and a real-browser run with the real 30-second wait and 1-minute relock. Medium for PBKDF2 speed and the pad's feel on the Tab S8 (Stage 5). **An independent fresh-session review of M6 is recommended** (stage4-plan §4).

**Next:** Dan merges PR #6 (M6), ideally after a fresh-session review; then M7 (photos; low risk).


---

## Session 6 — 2026-10-18 — independent review of M5 and M6

**SESSION IDENTITY**
Claude Code (Opus 5.5), VS Code terminal on Dan's Windows machine. The fresh-session reviews of M5 and M6 that stage4-plan §4 recommends, then fixes.

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| 10:33–10:45 | Read the M5/M6 reviews, the plan and the session log. Ran `npm test` (339/339), the build, and `m5-` and `m6-ui-check.mjs` (37/37 and 49/49, twice each) |
| 10:35–10:42 | Two separate senior reviewers (M5, M6), each in its own git worktree, checked the code against the SPEC and wrote tests that prove each finding. The Director reproduced their tests on the main checkout and read the code for the top findings |
| ~10:50 | Reported to Dan. He asked for fixes to M6 findings 1–2 and M5 findings 1–2, for the reviewers' tests to be added, and for the results to go in docs/reviews |
| 10:55–11:20 | Fixes: gated dialogs close on relock and Delete asks again at confirm; the PIN pad and recovery check recover from errors; a price-import preview before the PIN; `v01_` headers refused. Reviewer tests added. M5/M6 browser checks extended; the M3 check relocks between dialog steps. Commit `7b4fb9e` |
| 11:20–11:47 | A separate verifier undid each fix (mutation check) and reviewed the diff: 6 of 8 mutants caught. Gaps: the recovery-check fix had no test, and relock-close depended on a timer that can fire late |
| 11:47–11:55 | Added the recovery-check browser check (its mutant is now caught) and a once-a-second wall-clock check in `useCloseOnRelock`. Fixed stale test titles. Wrote `docs/reviews/M5-independent.md` and `M6-independent.md` |

**WORK COMPLETED**
- Independent review of M5 and M6. No way past the PIN from a locked start, and no data loss in backup or restore, were found.
- Four findings fixed; the remaining findings are recorded as open (all low).

**DELIVERABLES PRODUCED**
- `src/ui/shell/LockPill.tsx` (`useCloseOnRelock`); `DeleteItem`, `Suppliers`, `Categories`, `Locations` and `More` use it.
- `GateHost.tsx` and `PinFlows.tsx` (try/finally).
- `src/io/price-import.ts` (preview, `detailChanges`, `v01_` check); `ImportDialogs.tsx` (`PriceImportPreview`); `Backup.tsx`; `app.css`.
- `tests/review-m5.test.ts` and `tests/m6-review.test.ts`.
- `scripts/{m3,m5,m6}-ui-check.mjs` and `scripts/pin-helpers.mjs` (`relockNow`).
- `docs/reviews/M5-independent.md` and `M6-independent.md`.

**PREDECESSORS / CONTEXT**
Sessions 4–5 (M5, M6) and their reviews.

**CONFIDENCE**
High for the four fixes:
- 357 unit tests pass.
- Browser checks pass: M2 28/28, M3 50/50, M4 25/25, M5 39/39, M6 54/54.
- Every fix but one has a mutant that is caught. The exception is Delete's second PIN check at confirm, which is backup protection behind the close-on-relock.

Also untested: the wall-clock close after the tablet sleeps.

**Next:** Dan merges PR #7 (M6 plus these fixes), then M7 (photos).



---

## Session 7 — 2026-10-18 — M7

**SESSION IDENTITY**
Claude Code (Opus 5.5), VS Code terminal on Dan's Windows machine. Stage 4: M7 (part photos; low risk). Also looked at the leftover worktree branches, at Dan's request.

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| ~12:11 | PR #7 (M6 plus review fixes) already merged, as `ade857a`. Branch `m7-photos` from `origin/main`. Read SPEC §8, F19, mockups 2a/2b/2d/3a and the existing photo code (thumbnails and the detail photo came in M3) |
| 12:11–12:24 | `setPhoto` / `applyPhotoChange` (photo row and `hasPhoto` in one transaction); `addItem` / `updateItem` take a photo change; `preparePhoto` (one decode, 1024 px JPEG and a 160 px thumbnail); `PhotoButtons`; Detail (Take/Retake, Gallery, Remove with a confirmation, Replace from the enlarged photo); Editor (staged photo, saved with the item); thumbnail change notices; 20 new tests; `scripts/m7-ui-check.mjs`. Commit `a9c95c6` |
| ~12:20 | Dan asked about worktree agent branches with unfinished commits or PRs. Checked them (see WORK COMPLETED) |
| 12:24–12:38 | M7 verification: unit mutants 15/15; M2–M6 browser checks as regression; interface mutants 6/6 after closing one test gap (the delete dialog's thumbnail); `docs/reviews/M7.md` |

**WORK COMPLETED**
- M7: F19 and §8 in full: take or choose, resize on the tablet, thumbnail, full size on the card, enlarge, replace and remove with no PIN. 377 tests; 32 browser checks. The M2–M6 checks still pass (28, 50, 25, 39, 54).
- Worktrees: `worktree-agent-a056243a7b1b2e7b6` (M5 reviewer) and `worktree-agent-a9f7b8a443fb05054` (M6 reviewer) are the Session 6 reviewers' worktrees. Each has one commit ("catch up 2" / "catch up 3", 12:12) with its reviewer's first-draft test file. Both files are already on `main`, edited (`tests/review-m5.test.ts`, `tests/m6-review.test.ts`), and every test in them is there. PR #8 (from the first branch) was opened and closed within seconds. Nothing to rescue; recommended removing both worktrees and branches (Dan to confirm).

**DELIVERABLES PRODUCED**
`src/data/photos.ts` (`setPhoto`, `applyPhotoChange`), `src/data/items.ts`, `src/data/db.ts` (`taken`), `src/io/image.ts` (`preparePhoto`), `src/domain/image-size.ts` (`pickedFileProblem`), `src/ui/components/PhotoButtons.tsx`, `src/ui/screens/item/{Detail,Editor}.tsx`, `src/ui/data-hooks.ts` (`usePhoto`, thumbnail notices), `src/ui/icons.tsx`, `src/styles/app.css`, `tests/{photos,image-size}.test.ts`, `scripts/m7-ui-check.mjs`, `scripts/m2–m6-ui-check.mjs` (touch-target scans skip the hidden inputs), `docs/reviews/M7.md`.

**PREDECESSORS / CONTEXT**
Sessions 1–6 (M1–M6 and the independent review); M3's thumbnail cache and detail photo; M5 backup format (§7).

**CONFIDENCE**
High for the data paths: every write and failure case is unit-tested with mutants, and the browser check reads back and decodes the stored JPEGs. Medium for the camera and picker on the Tab S8, EXIF rotation and decoding speed at 12 MP (Stage 5). Open (low): the "taken on this tablet" mark isn't in backups, so after a restore a team photo on a starter item shows the vendor note again. A fresh-session review isn't needed (low risk).

**Next:** Dan merges the M7 PR; then M8 (QR labels and scanning; medium risk).


---

## Session 7, continued — 2026-10-18 — M8

**SESSION IDENTITY**
Claude Code (Opus 5.5), VS Code terminal on Dan's Windows machine, same session as M7. Stage 4: M8 (QR labels and scanning; medium risk).

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| 12:49 | Dan merged PR #9 (M7), as `b0f3f9a`. Branch `m8-labels-scan` from `origin/main`. Read SPEC §9, F20, F21, mockups 5a–5f and 6a–6d and the mockup logic. Web search for the Avery 22805 margins found nothing usable |
| 12:49–13:15 | `qrcode-generator` and `barcode-detector` (zxing, local `.wasm`) added. `domain/labels.ts` (layouts, geometry, start, nudge, label text), `domain/scan.ts`, `domain/qr.ts`, `data/labels.ts`, `setBarcode`; Labels screen (two steps, preview = print pages, test print, print CSS); `Scanner`, Scan screen, editor Scan button, Print QR label on the card; `scripts/m8-ui-check.mjs` with a fake camera playing a generated QR label. Commit `e7b14c5` |
| 13:15–13:40 | M8 verification: M2–M7 regression (the M2 placeholder check moved to Count); review fixes (walk-order printing, quick nudge taps), commit `3ffe54d`; unit mutants 27/29 (2 equivalent) after one test gap; interface mutants 9/9; `docs/reviews/M8.md` |

**WORK COMPLETED**
M8: F20, F21 and §9: labels for 4 layouts with start position, page breaks, nudge, test print and the 100% reminder; scanning QR labels, barcodes and typed codes; attach or add for unknown codes; a barcode Scan button in the editor. 443 tests; 60 browser checks; the M2–M7 checks pass (28, 50, 25, 39, 54, 32).

**DELIVERABLES PRODUCED**
`src/domain/{labels,scan,qr}.ts`, `src/data/labels.ts`, `src/data/items.ts` (`setBarcode`), `src/data/prefs.ts` (last layout), `src/io/barcode.ts`, `src/ui/components/{Scanner,ScanDialog}.tsx`, `src/ui/screens/labels/{Labels,LabelSheet}.tsx`, `src/ui/screens/scan/Scan.tsx`, `src/ui/screens/item/{Detail,Editor}.tsx`, `src/ui/shell/router.ts`, `src/ui/App.tsx`, `src/styles/{labels,scan}.css`, `tests/{labels,labels-db,scan}.test.ts`, `tests/router.test.ts`, `scripts/m8-ui-check.mjs`, `scripts/m2-ui-check.mjs`, `docs/reviews/M8.md`.

**PREDECESSORS / CONTEXT**
M1–M7; the mockup's label geometry (approximate) and SPEC §15 Q2 (label sheets still not chosen).

**CONFIDENCE**
High for the label math and scan logic: exact positions, page breaks and nudge are unit-tested with mutants; the print is measured in print media and as a PDF; generated QR codes decode back with zxing, and the camera path ran end to end on a fake camera. **Medium for the physical print:** the sheet geometry is marked "verify against package" and needs a real print at 100% on the Tab S8 (Stage 5). Medium for the native BarcodeDetector and the torch on the tablet. A fresh-session review isn't needed; a real test print is.

**Next:** Dan merges the M8 PR; then M9 (count-in; medium risk).


---

## Session 8 — 2026-10-18 — M9

**SESSION IDENTITY**
Claude Code (Opus 5.5), VS Code terminal on Dan's Windows machine. New session after `/clear` ("continue"). Stage 4: M9 (count-in; medium risk).

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| 16:53 | PR #10 (M8) already merged, as `1e14b08`. Branch `m9-count-in` from `origin/main`. Read SPEC F24, design notes §5, mockups 10a–10e and the mockup logic, and the existing data layer, Scan and Labels code |
| 16:53–17:22 | `domain/count.ts` (walk order, groups, progress, keypad, summary), `listOrder` in `inventory-view.ts`, `data/count.ts` (`saveCount`), count options and pause point in `prefs.ts`, `Keypad`, Count screen (start, walk, summary, scan as you go), `count.css`; 45 new tests; `scripts/m9-ui-check.mjs`; M2 check updated (Count is no longer a placeholder); scanner line CSS fix. Commit `729eff9` |
| 17:22–17:55 | M9 verification: unit mutants 26/26 after one test gap; interface mutants 9/9 after finding and fixing the scanner stopping after one report (M8 bug); M2–M8 regression; `docs/reviews/M9.md` |

**WORK COMPLETED**
M9: F24 in full. Three modes (by category, by location in walk order then "No location", scan as you go), start screen with order total, overall progress and Start/Continue/Recount per group, the two options, one item per screen with keypad, status preview and location picks (with New location, no PIN), Back/Skip/Save & next, group summary with before → after total and shortcuts, and resume after a reload. 488 tests; 63 browser checks; the M2–M8 checks pass (28, 50, 25, 39, 54, 32, 61). Two M8 bugs fixed on the way: the scanner stopped reading after its first code unless paused and resumed, and its amber line drew as a block (CSS class clash).

**DELIVERABLES PRODUCED**
`src/domain/count.ts`, `src/domain/inventory-view.ts` (`listOrder`), `src/data/count.ts`, `src/data/prefs.ts`, `src/ui/components/Keypad.tsx`, `src/ui/components/common.tsx` (chip prefix), `src/ui/components/Scanner.tsx`, `src/ui/screens/count/Count.tsx`, `src/ui/App.tsx`, `src/main.tsx`, `src/styles/{count,scan}.css`, `tests/{count,count-db}.test.ts`, `scripts/m9-ui-check.mjs`, `scripts/{m2,m8}-ui-check.mjs`, `docs/reviews/M9.md`; removed `src/ui/screens/Placeholder.tsx`.

**PREDECESSORS / CONTEXT**
M1–M8; spec-questions Q7 and D8; M8's Scanner and Labels routes.

**CONFIDENCE**
High for the count logic and the save: walk order, progress, keypad, summary and `saveCount` are unit-tested with mutants (26/26), and the browser check reads the stored values back. Medium for scan as you go on the tablet (native BarcodeDetector, a long camera session) and for glove use (Stage 5). Open (low, for Dan): recounts have no "round", so after the first full count every group shows Recount 100% (see M9 review). A fresh-session review isn't needed.

**Next:** Dan merges the M9 PR; then M10 (starter catalog first launch and offline/PWA; medium risk).


---

## Session 8, continued — 2026-10-18 — count rounds, M10, Stage 4 close

**SESSION IDENTITY**
Claude Code (Opus 5.5), VS Code terminal on Dan's Windows machine, same session as M9. Dan: "merged, continue with m10. for low priority decision - change spec to indication per-recount progress with counted since <date>".

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| ~18:42 | Dan merged PR #11 (M9), as `33487b5`. Branch `m10-starter-pwa` from `origin/main` |
| 18:42–18:50 | SPEC v0.6 (F24 count rounds, change note, decision log); `countSince` setting, round-aware progress, Start a new count / Change date / Count from the beginning; 9 unit tests, 8 browser checks; mutants 7/7 after one gap. Commit `744b4c2` |
| 18:50–19:10 | M10: setup step 3 (starter catalog with progress, restore a backup, start empty), Ready screen, persistent-storage request, storage-error "Set up again", boot seed load removed; `vite-plugin-pwa` 2.0.0, manifest and icons, precache, update banner; `tests/setup.test.ts`; `scripts/m10-ui-check.mjs` (offline with the server stopped); setup helper in the M2–M9 checks. Full regression M2–M10 during this time. Commits `481f44c`, `0acf613` |
| 19:10–19:25 | M10 verification: unit mutants 4/4, interface mutants 8/8; `docs/reviews/M10.md`; Stage 4 final regression and F1–F25 trace, `docs/reviews/Stage4-final.md` |

**WORK COMPLETED**
- Count rounds (Dan's decision on the M9 open item): written into SPEC v0.6 and built.
- M10: F22 and §2 in full, plus the Q2 recovery path. 504 tests; browser checks M2–M10 all pass (28, 50, 25, 39, 54, 32, 61, 71, 40 = 400) with no console errors.
- Stage 4 close: every F1–F25 traced to checks that ran on the final source; all ✅, with Stage 5 items noted (share sheet, camera, native detector, real label print, install).

**DELIVERABLES PRODUCED**
`docs/SPEC.md` (v0.6), `src/domain/count.ts`, `src/data/count.ts`, `src/ui/screens/count/Count.tsx`, `src/styles/count.css`, `src/data/setup.ts`, `src/io/{bundle,seed}.ts` (photo progress), `src/ui/screens/{Setup,StorageError}.tsx`, `src/ui/shell/{UpdateBanner,Shell}.tsx`, `src/ui/App.tsx`, `src/main.tsx`, `src/styles/app.css`, `vite.config.ts`, `tsconfig.json`, `package.json` (`vite-plugin-pwa`), `public/icons/icon-{192,512}.png`, `tests/{setup,count,count-db}.test.ts`, `scripts/m10-ui-check.mjs`, `scripts/{m6,m9}-ui-check.mjs`, `scripts/pin-helpers.mjs`, `docs/reviews/{M9,M10,Stage4-final}.md`, `docs/history/stage4-plan.md` (Stage 5 list).

**PREDECESSORS / CONTEXT**
M1–M9; spec-questions Q2, D7, D8; the M9 review's open item.

**CONFIDENCE**
High for first launch and the data it writes (unit-tested with mutants; refused once setup is done) and for offline use (checked with the web server stopped, including a full first launch). Medium for what only the Tab S8 shows: installing, the persistent-storage answer for the installed app, and an update after a real deploy (Stage 5). Process note: the mutation runner doesn't check that a mutant compiles; one M10 mutant first showed as a false miss for that reason (a failed build can't produce a false catch).

**Next:** Dan merges the M10 PR (Stage 4 complete); then Stage 5 on the Tab S8 (see `docs/reviews/Stage4-final.md`).


---

## Stage 6, Session 1 — 2026-10-21 — spec merge (no code)

**SESSION IDENTITY**
Claude Code (Opus 5.5), terminal on Dan's Windows machine. Branch `stage6-start`. Step 3 of `STAGE6-START.md`: find out what the repo's v0.6/v0.7 are, merge the claude.ai proposal, stop. No code and no `docs/SPEC.md` changes.

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| ~13:30 | Dan: two local commits wouldn't sync. Cause: PR #13 merged and GitHub deleted `fix-t01-persistent-storage`. Created `stage6-start` from `ba72d61` and pushed it (only `11baab4` and `ba72d61` ahead of `origin/main`) |
| 13:34 | Stage 6 step 3 received. Tags: none (local or remote). Read `git log`, SPEC v0.7, the proposal, `STAGE6-START.md`, `docs/history/spec-questions.md`, `docs/history/stage5-review.md` |
| 13:34–13:37 | Read `src/data/db.ts` (Dexie `version(1)`), `src/io/lists-csv.ts` (`categories.csv`), `src/domain/count.ts` and `src/data/count.ts` (count rounds), `src/io/inventory-csv.ts` (`last_counted` parsing); listed the new seed ZIP and read its `categories.csv` |
| 13:37–13:39 | Wrote `docs/history/spec-merge-plan.md`; confirmed `docs/mockups/helper-screens/helper-screens/` is byte-identical to its parent (`diff -rq`) |
| 13:39–13:40 | Wrote `docs/SPEC-next-draft.md` (v0.8 draft). `docs/SPEC.md` unchanged (`git status`: only the two new files untracked) |

**WORK COMPLETED**
- Repo v0.6 (2026-10-18, `744b4c2`): F24 count rounds. Repo v0.7 (2026-10-18, `7e6f0cc`): Category list in §3, `categories.csv` and `manifest.json` in §7, §15 Q3/Q4 closed. Both branch from v0.5, like the proposal, so the merge is **v0.8**.
- No F-number or section clashes (the proposal adds F26–F28, §18, §19).
- Conflicts found and resolved in the draft: the proposal's F24 drops count rounds; its §7/F15 drop `manifest.json`; its `categories.csv` layout differs from v0.7's (the current parser already reads both; the new seed loads); it reopens §15 Q3/Q4; its F22 would leave out the built restore / start-empty setup choices.
- Dexie: `version(1)` → next version adds `orderLists`, `helpers`, `pendingItems`, `pendingPhotos`, `importUndo`; `categories` already exists; `last_counted` converted to local-midnight date-times; `counted_by` added. Recommended: a schema-version guard first (Stage 5 finding 6) and a separate database for helper mode.
- Seven merge decisions for Dan listed as new §15 Q7.

**DELIVERABLES PRODUCED**
`docs/history/spec-merge-plan.md`, `docs/SPEC-next-draft.md`, this log entry. Not committed.

**PREDECESSORS / CONTEXT**
SPEC v0.7; `docs/history/2026-10-21-claude-proposal.md`; `STAGE6-START.md`; `docs/history/stage5-review.md`; `docs/history/spec-questions.md`.

**CONFIDENCE**
High for the version history (git and the spec agree) and for the conflicts list (proposal and v0.7 compared section by section). High that the new seed's `categories.csv` loads with the current parser (read from the code, not run; §19 adds a test). Medium for the schema plan's table layout: it's a proposal for Step 4, not a design that's been tested.

**Noticed, not acted on:** no `stage5-verified` tag yet; no `docs/stage5-findings.md` (STAGE6-START step 1); the duplicate `helper-screens/helper-screens/` folder in `ba72d61`.

**Next:** Dan reviews `docs/history/spec-merge-plan.md` and the draft (optionally in the claude.ai project), answers §15 Q6 and Q7, then: "Approved. Make SPEC-next-draft.md the new docs/SPEC.md."

| Time (CDT) | Activity (continued) |
|---|---|
| 13:44 | Dan: "q6 yes to all, q7 yes to all". Recorded in `docs/SPEC-next-draft.md` (§15 Q6 and Q7 marked approved; decision-log row). `docs/SPEC.md` still v0.7: waiting for "Make SPEC-next-draft.md the new docs/SPEC.md" |
| 13:46 | Dan: "Approved. Make SPEC-next-draft.md the new docs/SPEC.md." Draft moved to `docs/SPEC.md` (title, status line and "Changes in v0.8" no longer say draft; decision-log row added); `SPEC-next-draft.md` removed; committed on `stage6-start` |
| 13:46 | Tagged `11baab4` as `stage5-verified` (annotated); removed the duplicate `docs/mockups/helper-screens/helper-screens/` (byte-identical to its parent); pushed `stage6-start` and the tag |
| 13:48 | Opened PR #14 (`stage6-start` → `main`). Found the Stage 6 kit commit had renamed the 2026-10-17 seed to the 2026-10-21 one, removing the file `src/io/seed.ts`, `Setup.tsx`, the tests and the M7/M10 checks load. Restored it from `11baab4` (STAGE6-START: keep the old seed). `npx vitest run` 33 files / 510 tests pass; `npm run build` clean (16 precache entries) |
| 13:52 | Dan merged PR #14 (`ef5a800`); "start step 4". Pulled `main`. Read `docs/history/stage4-plan.md`, `db.ts`, `setup.ts`, `seed.ts`, `inventory.ts`, `FilterPanel.tsx`, `Order.tsx`, Stage 5 findings 1, 2 and 6; counted seed-file and category-name references in tests and checks. Wrote `docs/history/stage6-plan.md` (M11–M16c, schema v2 in M15 and v3 in M16a, upgrade testing). Uncommitted (goes in with M11, like the Stage 4 plan with M1). Waiting for Dan's OK |


---

## Stage 6, M11 — 2026-10-21 — filter order (F5)

**SESSION IDENTITY**
Claude Code (Opus 5.5), same session. Dan: "ok, build m11". Branch `m11-filter-order` from `main` (`ef5a800`).

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| ~13:58 | Branch created. Changed the quick-filter row (`Inventory.tsx`) and the Filters panel (`FilterPanel.tsx`): Location now comes before Supplier |
| ~14:00–14:08 | Wrote `scripts/m11-ui-check.mjs`. The first runs failed in setup: the copied setup line had lost a regex escape (script bug, not the app). Fixed; moved to free ports 4331/9347. 12/12 pass. Interface mutant (the old order) caught |
| ~14:08–14:07 | Regression: `npx vitest run` 510/510; build clean; browser checks M2–M10 400/400 and M11 12/12, all with clean consoles. Wrote `docs/reviews/M11.md`; committed, pushed, opened the PR |

**WORK COMPLETED**
F5 filter order (SPEC v0.8) in both places it shows. The Stage 6 plan (`docs/history/stage6-plan.md`) goes in with this milestone.

**DELIVERABLES PRODUCED**
`src/ui/screens/inventory/{Inventory,FilterPanel}.tsx`, `scripts/m11-ui-check.mjs`, `docs/reviews/M11.md`, `docs/history/stage6-plan.md`.

**CONFIDENCE**
High: a layout-only change, checked in both orientations, with the mutant caught and the full regression green. One open wording note for Dan (M11 review, finding 1).

**Next:** Dan merges the PR and checks the filter order on the Tab S8; then M12 (categories and the new seed).


---

## Stage 6, M12 — 2026-10-21 — categories, new seed, finding 2

**SESSION IDENTITY**
Claude Code (Opus 5.5), same session. Dan merged PR #15 (M11, `36c84d4`) and said "build m12". Branch `m12-categories` from `main`.

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| ~14:10 | Branch created. Stage 5 finding 2 fix (`spellLikeLists`, `itemsIn` and `fitToLists` ignore capitals); switched the seed to 2026-10-21 |
| ~14:12–14:20 | Unit tests: 5 old-category expectations updated to §11 (shared `SPEC_CATEGORIES`); 10 new tests (seed order and empties, both `categories.csv` layouts, `spellLikeLists`, finding 2 restore and edit). A probe (scratchpad, not committed) listed the seed's categories. One shell command hung on `python -` reading stdin; stopped it and used the Edit tool |
| ~14:20–14:35 | Mutation check 11/12 caught (the 12th is an unused constant). Updated the M2, M3, M7, M8, M9 and M10 browser checks for the new names; removed the old seed; wrote `scripts/m12-ui-check.mjs` (13/13) |
| ~14:35–14:38 | Regression M2–M11 412/412 after fixing M10's three "12 categories" expectations; interface mutant (seed ignores `categories.csv`) caught; `docs/reviews/M12.md`; committed, pushed, opened the PR |

**WORK COMPLETED**
§11 categories through the new seed, for both first-launch choices; `categories.csv` in both layouts pinned by tests; Stage 5 finding 2 fixed. 520 unit tests.

**DELIVERABLES PRODUCED**
`src/io/{lists-csv,restore,seed,backup}.ts`, `src/domain/lists.ts`, `src/data/items.ts`, `src/ui/screens/Setup.tsx`, tests (`helpers`, `seed`, `setup`, `inventory-view`, `lists-csv`, `backup-restore`, `edits-db`), browser checks M2, M3, M7, M8, M9, M10 (updated) and M12 (new), `docs/reviews/M12.md`. Removed `seed/frc2408-starter-catalog-2026-10-17.zip`.

**CONFIDENCE**
High for the seed load, the order of the lists and the finding 2 fix (unit and browser, mutants caught). The plan's independent fresh-session review for M12 is still to do before merging.

**Next:** an independent review of the M12 PR, then Dan merges and checks it in a fresh browser profile; then M13 (bulk move).
| 15:10 | M12 independent review (a separate review agent, at Dan's request): "merge after one small fix" (`docs/reviews/M12-independent.md`). Dan: "yes, make the fixes". Fixed review finding 1 (the editor refused items stored with other capitals: `item-form.ts`, `Editor.tsx`) and finding 4 (comment, ZIP test). Unit tests 522; mutants 5/5; M12 check +3 editor checks (16/16), failing against the pre-fix editor (built with `vite build`, because `npm run build` kept the old dist when the type check failed). Regression M2–M12 428/428. Findings 2 and 3 recorded as known issues (pre-M12 data only) |


---

## Stage 6, M13 — 2026-10-21 — bulk move (F28)

**SESSION IDENTITY**
Claude Code (Opus 5.5), same session (Dan also connected by Remote Control). Dan merged PR #16 (M12) and said "Build m13". Branch `m13-bulk-move` from `main` (`008fb5e`).

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| ~15:50 | Branch created. Read the Inventory screen, Labels selection, the category data helpers and Dialog |
| ~15:55–16:10 | `moveItemsTo` (data), `selection.ts` (domain), header `ids` and `shownIds` in the view; 14 unit tests; Select mode, `SelectRow`, `SelectBar`, `MoveDialog`, the shared `CheckBox`, CSS |
| ~16:10–16:25 | `scripts/m13-ui-check.mjs` (25/25 after three script fixes); screenshots checked; mutants 16/16 after one test gap was closed; interface mutant caught |
| ~16:25–16:17 | Regression M2–M12: M6 and M7 failed on Chrome IndexedDB "UnknownError" with C: full (2 GB free); both passed when re-run. `docs/reviews/M13.md`; committed, pushed, opened the PR |

**WORK COMPLETED**
F28 bulk move: Select mode with header and row checkboxes, Select all shown, a hidden-selection warning, the Move dialog with new category and subcategory, one-transaction save, no PIN. 536 unit tests.

**DELIVERABLES PRODUCED**
`src/data/lists.ts` (`moveItemsTo`), `src/domain/{selection,inventory-view}.ts`, `src/ui/screens/inventory/{Inventory,MoveDialog,ItemRow}.tsx`, `src/ui/components/common.tsx` (`CheckBox`), `src/ui/screens/labels/Labels.tsx` (uses `CheckBox`), `src/styles/app.css`, `tests/{selection,edits-db}.test.ts`, `scripts/m13-ui-check.mjs`, `docs/reviews/M13.md`.

**CONFIDENCE**
High: unit and browser checks with mutants caught, both orientations, screenshots looked at. Open: the test machine's drive is full, and old `cdp-*` Chrome profiles from the browser checks are a likely cause (M13 review, finding 3), for Dan to decide.

**Next:** Dan merges the PR and tries bulk move on the Tab S8; then M14 (order-list search).
| 16:32 | Dan: "Please clean up those items". The 32 Chrome processes were all Dan's own browser (none from the checks), so none were closed. Deleted 320 check folders in %TEMP% (279 `cdp-` Chrome profiles of about 100 MB each, 22 `m10-files-`, 19 `m7-`): C: free 3.3 GB → 24.8 GB. Also 61 `m8-cam-`/`m9-cam-` test-video folders (about 270 MB). New `scripts/tmp-cleanup.mjs`: every check now removes its temp folders on exit, after closing its own Chrome; verified with M11 (12/12) and M9 (71/71), leaving 0 folders and 0 Chrome processes |


---

## Stage 6, M14 — 2026-10-21 — order-list search (F12)

**SESSION IDENTITY**
Claude Code (Opus 5.5), same session. Dan merged PR #17 (M13) and said "Build m14". Branch `m14-order-search` from `main` (`46eb6ee`).

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| ~16:35 | Branch created. Found that the browser-check cleanup commit (`41cd5cc`) was pushed to the M13 branch after PR #17 had been merged, so it isn't on `main`; cherry-picked as `bcf2a42`, and told Dan |
| ~16:35–16:45 | `filterOrderList` and `orderLineText` (domain); note row and filtered file name (io); 9 unit tests, which caught a blank line after the note row (fixed); Order screen search, tiles and footer, Export shown lines only, ExportDialog |
| ~16:45–17:00 | `scripts/m14-ui-check.mjs` (20/20 after script fixes: tile spacing; matches now worked out from IndexedDB, since notes are searched too); portrait footer and the suppliers tile fixed after the screenshots; mutants 16/16 after one test gap was closed; interface mutant caught |
| ~17:00–16:58 | Regression M2–M13 453/453, 0 temp folders left; `docs/reviews/M14.md`; committed, pushed, opened the PR |

**WORK COMPLETED**
F12 order-list search with shown and whole-list totals; Export CSV unchanged; Export shown lines only with a note row and a filtered file name. 545 unit tests.

**DELIVERABLES PRODUCED**
`src/domain/order.ts`, `src/io/order-csv.ts`, `src/ui/screens/order/{Order,ExportDialog}.tsx`, `src/styles/app.css`, `tests/order-list.test.ts`, `scripts/m14-ui-check.mjs`, `docs/reviews/M14.md`; plus the cherry-picked `scripts/tmp-cleanup.mjs` and its changes to every check.

**CONFIDENCE**
High: totals checked to the cent in unit tests and against the screen; the exported files are read back in the browser check; mutants caught. Three small decisions for Dan are in the M14 review.

**Next:** Dan merges the PR (it also brings the check cleanup to `main`) and tries the search on the Tab S8; then M15 (named order lists and the first schema upgrade, high risk; needs a full backup exported from the Tab S8 first).


---

## Stage 6 — 2026-10-23 — M14 on the tablet, the M15b decision, M15 named order lists and the first schema upgrade

**SESSION IDENTITY**
Claude Code (Opus 5.5), new session. Dan merged PR #18 (M14) on 2026-10-21. Branch `m15-order-lists` from `main` (`92d80ae`).

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| ~11:30 | Dan asked what's next. M14 was merged; next was the Tab S8 check, then M15 |
| ~11:40 | Dan: the tablet had none of the M11–M14 changes. The live site served the M14 build (checked the bundle). Cause: the service worker keeps the old copy until Reload is tapped on the banner. Gave steps: back up first, close and reopen, check the address, unregister in `chrome://serviceworker-internals` (never Clear site data) |
| ~11:50 | Dan: M14 works on the tablet. Asked for checkboxes to build a custom order (e.g. only AndyMark, up to desired rather than desired + spares). Dan chose: checkboxes on the Automatic list and in Inventory Select mode; the quantity rule chosen each time; Automatic unchanged; built as **M15b** after M15. Written into SPEC F27, §19 and the decision log, and the Stage 6 plan |
| ~12:00 | Dan: "ready to continue to build m15" |
| ~12:00–12:40 | Domain and I/O: `order-lists.ts` (quantities, names, pricing via the shared `groupOrderLines`), `order-lists-csv.ts`; schema v2 with `checkSchema`; `data/order-lists.ts`; item delete, `replaceAll`, backup, bundle, restore. One shell command hung reading stdin (`python -`); stopped it |
| ~12:40–13:00 | Boot: guard, blocked and replaced states; finding 1 (`storage-error.ts`, DELETE typed). Unit tests: 40 new, 585 in all. Screens: Order tabs and list view, Add / New / Edit / Delete dialogs, row ⋮ menu, Detail, Scan, Delete confirmation, restore comparison; CSS |
| ~13:00–13:15 | `scripts/m15-ui-check.mjs` 40/40 after script fixes (finding 5); one real fix (apostrophe). Regression M2–M14: M4, M5, M8, M10 needed updates for intended changes (M4 by restoring the old subtitle; the rest in the checks). Mutants 38/38 after one test was tightened. Interface mutant caught |
| ~13:15 | `scripts/m15-upgrade-check.mjs`: `main` at `92d80ae` built in a scratch worktree (node_modules by junction, removed before the worktree), then this build at the same address. 19/19: blocked screen, byte-equal rows, rollback harmless. The plan's rollback step corrected (M15 review, finding 1) |
| ~13:20 | `docs/reviews/M15.md`; committed, pushed, opened the PR |

**WORK COMPLETED**
F27 named order lists (create, rename, duplicate, delete; add from row, detail and scan; +/− and remove; search and exports; backup and both restores; item delete). Schema v2 with the guard (Stage 5 finding 6), the blocked-upgrade screen, and the Set up again fix (finding 1). `APP_VERSION` 0.2.0. Spec and plan updated for M15b.

**DELIVERABLES PRODUCED**
New: `src/domain/{order-lists,storage-error}.ts`, `src/data/order-lists.ts`, `src/io/order-lists-csv.ts`, `src/ui/screens/order/ListDialogs.tsx`, `tests/{order-lists,order-lists-db,schema-upgrade,tablet-backup}.test.ts`, `scripts/m15-ui-check.mjs`, `scripts/m15-upgrade-check.mjs`, `docs/reviews/M15.md`. Changed: `src/data/{db,inventory,items,setup,backup}.ts`, `src/domain/order.ts`, `src/io/{backup,bundle,order-csv,restore}.ts`, `src/ui/App.tsx`, `src/ui/data-hooks.ts`, `src/ui/icons.tsx`, `src/ui/shell/{router.ts,UpdateBanner.tsx}`, `src/ui/screens/{StorageError.tsx,order/Order.tsx,order/ExportDialog.tsx,inventory/ItemRow.tsx,item/Detail.tsx,item/DeleteItem.tsx,scan/Scan.tsx,more/Backup.tsx,more/RestoreDialog.tsx}`, `src/styles/app.css`, `tests/backup-restore.test.ts`, `scripts/m{5,8,10}-ui-check.mjs`, `docs/SPEC.md`, `docs/history/stage6-plan.md`.

**CONFIDENCE**
High for the upgrade: byte-equal rows in unit tests and in a real browser, the blocked case and a rollback tried. High for list math (to the cent, mutants caught). Still to do: the real Tab S8 backup through `tests/tablet-backup.test.ts`, before merging.

**Next:** Dan exports a full backup from the Tab S8 and runs (or gives the path for) the real-data test; then merges with a merge commit and does the tablet check in the M15 review; then M15b.
| 13:27 | Dan: the backup is at `D:\backups\inventory-backup.zip`; the file there is `inventory-backup-2026-10-23-1323.zip` (the only one in the folder). `tests/tablet-backup.test.ts` with it: passes, 129 items, 127 photos, order total $6,949.47, the same after the upgrade and after export → restore. Review and PR updated |


---

## Stage 6, M15b — 2026-10-23 — add many items to an order list

**SESSION IDENTITY**
Claude Code (Opus 5.5), same session. Dan merged PR #19 (M15, `4234b06`) and said "build m15b". Branch `m15b-add-many` from `main`.

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| ~13:35 | Branch created. Read the M13 Select mode and selection helpers |
| ~13:35–13:45 | `ruleQuantity`, `planAddMany`, `applyAddMany` (domain), `addManyToOrderList` (data); 12 unit tests with hand-worked quantities and totals |
| ~13:45–13:50 | Shared `SelectBar`; Inventory Add to order list…; `AddManyDialog`; Select mode on the Automatic list (line and supplier checkboxes). One shell command with heredoc quoting failed to parse and ran nothing; redone with the Edit tool |
| ~13:50–13:57 | `scripts/m15b-ui-check.mjs` 26/26 (one check tightened); screenshots led to the "Choose replace or keep" label. Regression M2–M15: M15 needed its tab reading narrowed (Select button). Mutants 14/14; interface mutant caught; upgrade check 19/19 and the Tab S8 backup test again |
| ~14:00 | `docs/reviews/M15b.md`; committed, pushed, opened the PR |

**WORK COMPLETED**
F27 "Add many at once": Select on the Automatic list and Add to order list… in Inventory Select mode; the three quantity rules; skipped items counted; replace or keep asked once; one transaction.

**DELIVERABLES PRODUCED**
New: `src/ui/components/SelectBar.tsx`, `scripts/m15b-ui-check.mjs`, `docs/reviews/M15b.md`. Changed: `src/domain/order-lists.ts`, `src/data/order-lists.ts`, `src/ui/screens/order/{Order,ListDialogs}.tsx`, `src/ui/screens/inventory/Inventory.tsx`, `src/styles/app.css`, `tests/order-lists{,-db}.test.ts`, `scripts/m15-ui-check.mjs`, `scripts/m15-upgrade-check.mjs`.

**CONFIDENCE**
High: quantities and totals checked to the cent against hand-worked numbers and an independent calculation in the browser; mutants caught; regression green.

**Next:** Dan merges the PR and does the tablet check in the M15b review; then M16a (helpers on the main tablet, the second schema upgrade).

---

## Stage 6, M16a — 2026-10-26 — helpers on the main tablet, count kits, the second schema upgrade

**SESSION IDENTITY**
Claude Code (Opus 5.5), new session. Dan merged PR #20 (M15b, `197ff26`). Dan asked for next steps, then: "1 worked perfectly. build m16a" (the M15b tablet check). Branch `m16a-helpers` from `main`.

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| start | Next steps given (M15b tablet check, then M16a). Dan: step 1 worked; build M16a. Recorded in the M15b review |
| — | Read the plan, SPEC §3, §7, §18, §19, the count, CSV, backup and database code |
| — | Count times as local date-times with offset (`dates.ts`), `counted_by`, CSV both forms, `isCounted` by local date; schema v3 with its data step; helper rules, data and the kit writer; Restore refuses kits; renames carry helpers. One shell command waited on stdin (`python -` heredoc) and was stopped; nothing changed |
| — | Unit tests: `count-times`, `helper-devices`, `schema-upgrade` rewritten for v1/v2 → v3; tests pinned to America/Chicago. 652 pass. Tab S8 backup v1 → v3 passes (it has no counted items) |
| — | Helper devices screen, dialogs, count-in card and per-group helpers. `m16a-ui-check` 39/39 after script fixes and one app fix (the shared-group warning repeated on every edit) |
| — | `main` built in a scratch worktree (node_modules by junction, removed first). `m16a-upgrade-check` 24/24 twice: blocked, upgrade, rollback to `main` shows the guard and writes nothing |
| — | Regression M2–M15b 541/541 after updating M3, M5, M9, M15 for intended changes. Mutants 27/28 compiling caught (one equivalent) after one test added |
| — | `docs/reviews/M16a.md`; committed, pushed, opened the PR |

**WORK COMPLETED**
§18.1 helpers (add, edit, remove, coverage, shared warning, name lock), §18.2 count kit with Include photos, F24 helpers on the start screen, §3 `last_counted` date-time and `counted_by`, schema v3. `APP_VERSION` 0.3.0.

**CONFIDENCE**
High for the upgrade (field-by-field unit tests on both DST sides, real-browser upgrade and rollback) and the kit contents (read back in Node). Not yet done: the plan's independent fresh-session review for M16, and the Tab S8 share sheet with a 6 MB kit.

**Next:** the independent review of the M16a PR (if Dan wants it run as a separate agent, as for M12); Dan merges with a merge commit, backs up the tablet first, and does the tablet check in the M16a review; then M16b.
| later | Dan: "yes, run the independent review". A separate review agent wrote `docs/reviews/M16a-independent.md`: **merge after fixes** (2 minor, 4 notes; the upgrade itself sound) |
| later | Dan: "fix all of them and commit". Restore refuses a kit's `inventory.csv` when the tablet has prices; the helper dialog drops removed groups; the upgrade converts only real dates; `buildKit` uses `now`; spreadsheet date-times read; setup clears helpers. Unit 669; mutants 11/11 on the fixes; M2–M15b 541, M16a 42, upgrade 24; Tab S8 backup again. One more `python -` heredoc hang, stopped |

---

## 2026-10-28 — M17: location QR codes (F29) and the app version line

**SESSION IDENTITY**
Claude Code (Opus 5.5), new session on `m16a-helpers`, then `m17-location-scan` from `main` (`ae3ce0a`, PR #21 merged).

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| morning | Dan asked to add, select and filter by a location by scanning the existing QR codes. Answers: each bin's QR holds the area and a number ("Electrical 15", "Tools 7"); scanning in the item editor, count-in, the Scan tab and More › Locations; unknown codes can be added (anyone) or rename a location (PIN); filtering reports "Location not found" |
| — | M16a tablet check: the Reload banner never showed and close/reopen didn't update; a Chrome force-stop and opening the site in a tab did. Dan: "update occured; tablet check completed successfully". Recorded in `docs/reviews/M16a.md` |
| — | Dan: add the Add button on the Scan tab, offer rename and add, add an app version line, build M17. Spec v0.9 (F29, §20) |
| — | `locationText`, `findLocation`, `couldBeLocation`, location results in `resolveScan`; `LocationScanDialog`; editor, count-in, Scan tab, Locations, Filters; More › About version and build time; `APP_VERSION` 0.4.0. One shell command waited on stdin (`python -` left in a command) and was stopped; nothing changed |
| — | Unit 682 pass (13 new). `m17-ui-check` 34/34. Mutants 13/14, then 14/14 after one test case. Regression M2–M16a 583/583 after three intended check updates (M8, M9, M16a); M9 and M12 each flaked once and passed on re-run |
| — | `docs/reviews/M17.md`; committed, pushed, opened the PR |

**WORK COMPLETED**
F29 location QR codes in five places, "Location not found" with Add / Rename (PIN), the app version line. No schema or backup change.

**CONFIDENCE**
High for matching and placement (unit tests, mutants, a real QR read by the camera in headless Chrome). Not yet done: the Tab S8 check with real bin labels, including poor light and distance.

**Next:** Dan merges the M17 PR, updates the tablet and checks More › About shows 0.4.0, then runs the tablet check in `docs/reviews/M17.md`; then M16b.

---

## 2026-10-28 (later) — M17b: aim and hold for camera scans

**SESSION IDENTITY**
Same session. Dan merged PR #22 (M17, `e615f6e`). Branch `m17b-scan-aim` from `main`.

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| — | Dan: M17 tablet check successful; "the qr code reads so quickly that if several codes are close to each other it is not possible to focus on the correct one before the pop-up occurs". Cause: the camera used the first code anywhere in the picture (including the cropped-off part) on the first frame. Dan chose aim + hold, about 0.6 s, every scanner |
| — | `src/domain/scan-aim.ts` (`toView`, `pickAimed`, `stepHold`), the camera loop in `Scanner.tsx`, amber corners and a fill bar, hints. Spec v0.10 |
| — | Unit 695 pass (13 new). `m17b-ui-check` (three codes side by side) 7/7 after one app fix (the hold showed one frame late) and two script fixes. Mutants 14/14. All browser checks M2–M17 617/617 |
| — | `docs/reviews/M17b.md`; committed, pushed, opened the PR |

**CONFIDENCE**
High that the right code is chosen and held (unit tests on the mapping, a three-code camera picture in four screens). Not yet done: the Tab S8 with real shelves, and whether 0.6 s feels right.

**Next:** Dan merges, checks More › About shows the new build time, runs the M17b tablet check; then M16b.

---

## 2026-10-28 (afternoon) — M16b: helper mode on the helper device

**SESSION IDENTITY**
Claude Code (Opus 5.5), new session. Dan merged PR #23 (M17b, `ee65adc`) and asked "build m16b". Branch `m16b-helper-mode` from `main`. The M17b tablet check wasn't reported in this session.

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| start–13:20 | Read the plan, SPEC §2, §3, §15, §17, §18, the count-in, setup, kit, backup and database code, mockups 11a–11c. "Before" tablet screenshots of `main` (`scripts/m16b-tablet-shots.mjs`), taken twice to measure photo noise |
| 13:20–13:40 | `src/domain/helper-mode.ts`, `readCountKit` / `buildCountsFile`, `src/data/helper-db.ts` (own database, change records), hooks in `saveCount`, `setBarcode`, `addLocation`. `tests/helper-mode.test.ts` 59 pass. One shell command waited on stdin (a `python -` placeholder) and was stopped; nothing changed |
| 13:40–14:00 | First question, helper shell, Count / Scan / Add / Send, phone styles. Tablet before/after: one text-kerning change found and fixed. `m16b-ui-check` 35/38 → 36/36 after one app fix (Add form too wide at 360 px), one wording fix and two check fixes |
| 14:00–14:20 | M6, M10, M12 and `pin-helpers` answer the new question. All checks M2–M17b + M16b 660/660. Mutants 47/53 → 53/53 after 6 test cases. `APP_VERSION` 0.5.0; M16a, M17, M16b re-run. `m16a-upgrade-check` 24/24 (old build in a scratch worktree; two runs lost to unquoted Windows paths in my command) |
| 14:25 | `docs/reviews/M16b.md`; committed, pushed, opened the PR |

**WORK COMPLETED**
F22 first question; §18.2 join (kit check, newer format refused with reload); §18.3 counting on the helper's own database (assigned groups, outside flagged, new locations, barcodes, pending items); §18.4 cumulative counts file, unsent count and reminder; Open a new kit and Leave helper mode ask about unsent changes; phone layouts from 360 px with the tablet pixel-identical outside photos.

**DELIVERABLES PRODUCED**
New: `src/domain/helper-mode.ts`, `src/data/helper-db.ts`, `src/ui/helper/{HelperApp,HelperAdd,HelperSend,KitPicker}.tsx`, `src/ui/helper/session.ts`, `src/ui/screens/FirstLaunch.tsx`, `src/styles/helper.css`, `tests/helper-mode.test.ts`, `scripts/m16b-ui-check.mjs`, `scripts/m16b-tablet-shots.mjs`, `docs/reviews/M16b.md`. Changed: `src/ui/App.tsx`, `src/ui/screens/count/Count.tsx`, `src/io/{count-kit,bundle,backup}.ts`, `src/data/{count,items,lists}.ts`, `src/ui/components/{common,LocationScanDialog}.tsx`, `src/main.tsx`, `scripts/{pin-helpers,m6-ui-check,m10-ui-check,m12-ui-check,m16a-ui-check,m17-ui-check}.mjs`.

**PREDECESSORS/CONTEXT**
M16a (helpers and count kits on the shop tablet). Next is M16c (Import counts on the shop tablet). Seven details filled in for Dan to confirm: review "Details I filled in" (a)–(g).

**CONFIDENCE**
High for the counts file and change records (unit tests, mutants, a real kit → helper → counts file read back in the browser check) and for the tablet layout (pixel comparison). Not yet done: real Android and iPhone phones (share sheets, zxing on Safari, 360 px by hand), and the plan's independent fresh-session review for M16.

**Next:** Dan decides on the independent review; merges with a merge commit; runs the tablet and phone check in `docs/reviews/M16b.md`; then M16c.
**Later:** Dan: "confirm the seven details. merged." PR #24 merged (`419323a`). Details (a)–(g) written into SPEC v0.11 (§18.3, §18.4, decision log) and marked confirmed in `docs/reviews/M16b.md`, on branch `m16b-details-confirmed`
**Later (14:46):** Dan: "tablet check works." Recorded in `docs/reviews/M16b.md` (Tablet check result). Next: M16c.
**Later:** Dan: helper mode worked on an iPhone only in Chrome; a Safari retest is to come. Open item in `docs/reviews/M16b.md`.

---

## 2026-10-28 (late afternoon) — M16c: import counts, undo, pending items

**SESSION IDENTITY**
Same session. Dan: "build m16c". PR #25 (SPEC v0.11) still open, so `m16c-import-counts` is stacked on `m16b-details-confirmed`.

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| 15:15 | Read §18.5, mockups 11d–11f, the backup, restore and helper code |
| 15:15–15:30 | `src/domain/import-counts.ts` (planner, duplicates, combine, match), `src/io/counts-file.ts`, `src/io/pending-csv.ts`, `src/data/import-counts.ts` (apply, undo), `src/data/pending.ts`; pending items in backups and restore; `addItem` accepts a pending item. `tests/import-counts.test.ts` 41 → 44 |
| 15:30–15:45 | Import counts and Pending screens, Accept in the editor, count-in and Backup entry points, the restore comparison row. Planner fixes: repeats across cumulative files asked once; within-import repeats of new items not reported as skipped |
| 15:45–15:56 | `m16c-ui-check` (two browser contexts at one address) 25/25 after check fixes. Regression M2–M16b 660/660 after the intended M5 change (M11 flaked once, passed twice). Tablet screenshots unchanged. Mutants 48/50 → 50/50 compiling after 3 tests. Two edits to the check went wrong the same way as in M16b (`$$` in a JS replace string), found and fixed |
| 15:56 | `docs/reviews/M16c.md`; committed, pushed, opened the PR |

**WORK COMPLETED**
§18.5 in full: check, preview with every row of the table, choices, Use newest for all, all-or-nothing Apply, summary, Undo this import (summary and Backup screen), pending review (accept, same as existing, discard, duplicates, combine); `pending-items.csv` and pending photos in full backups; restore replaces or keeps them and clears Undo.

**DELIVERABLES PRODUCED**
New: `src/domain/import-counts.ts`, `src/io/counts-file.ts`, `src/io/pending-csv.ts`, `src/data/import-counts.ts`, `src/data/pending.ts`, `src/ui/screens/count/{Import,Pending}.tsx`, `src/styles/import.css`, `tests/import-counts.test.ts`, `scripts/m16c-ui-check.mjs`, `docs/reviews/M16c.md`. Changed: backup, bundle, restore, setup, items, count-kit, item-form, Editor, Count, Backup, RestoreDialog, router, App, data-hooks; `scripts/m5-ui-check.mjs`, `tests/router.test.ts`, `tests/helper-devices.test.ts`.

**PREDECESSORS/CONTEXT**
M16b (helper mode). Ten details filled in for Dan to confirm: review "Details I filled in" (a)–(j).

**CONFIDENCE**
High for the import rules (one unit test per preview row, mutants, a real two-device round trip in the browser) and for Undo (field-by-field tests and the browser check). Not yet done: the plan's independent fresh-session review (recommended: this changes real counts), and a real two-device count on the tablet.

**Next:** Dan merges PR #25, decides on the independent review, merges M16c with a merge commit, backs up the tablet, and runs the tablet check in `docs/reviews/M16c.md`.

**Later (16:39):** PRs #25 and #26 merged (`a434e4e`). Dan: "a-j accepted; tablet check worked; iphone safari works (cache needed to be cleared)". SPEC v0.12 (§18.5 import details, decision log); results recorded in `docs/reviews/M16c.md` and `docs/reviews/M16b.md` (Safari item closed), on branch `m16c-details-confirmed`. With M16c, every Stage 6 milestone in `docs/history/stage6-plan.md` is merged.

## 2026-10-28 (evening) — SPEC v0.13 draft (placed orders, spending history) and M18 (Stage 5 leftovers)

**SESSION IDENTITY**
Claude Code (Opus 5.5), new session after `/clear`. Dan: "take care of the stage 5 leftovers", plus a new feature to consider: confirming an order once it's placed (tax, discounts, shipping, etc.) and an order history over a date range with spending by vendor and in total. "Ask me questions about these new features." PR #27 (SPEC v0.12) still open, so `m18-stage5-fixes` is stacked on `m16c-details-confirmed`.

**DATES & TIMES**
| Time (CDT) | Activity |
|---|---|
| ~16:30 | Checked which Stage 5 findings were still open on `main`: 3, 4, 5, 7, parts of 8 and 9 (1, 2, 6 and T-01 done in M12/M15). Three rounds of questions on the new feature; Dan answered all (decision log, 2026-10-28) |
| ~16:50 | Dan: "go ahead with the spec draft and M18". SPEC v0.13 draft: F30–F32, §3 Placed order, §4 on order, §21, §22, the Stage 5 decisions; §15 Q8 lists the details Claude filled in. One correction to what Claude had told Dan: a data-only backup is one CSV, so orders travel in full backups only |
| ~17:00–17:20 | M18 code: findings 3, 4, 5, 7, 8, 9. `tests/stage5-leftovers.test.ts`. Mutants 10/12 → 12/12 (one redundant condition removed, two tests added) |
| ~17:20–17:30 | `scripts/m18-ui-check.mjs` 14/14 (one script fix: the ZIP's `photos/` folder entry). Screenshots showed the setup line's bold text in its own column: fixed. Wording fix in the missing-photo note |
| ~17:30–18:10 | Regression `m2`–`m16c` in the background; `docs/reviews/M18.md`; v0.13 milestones added to `docs/history/stage6-plan.md`. `APP_VERSION` 0.5.1 (`m16a`, `m17` checks updated and re-run) |

**WORK COMPLETED**
SPEC v0.13 draft. M18: cleared-storage line on setup; empty full backups with lists restore (warned); missing ZIP photos shown in the attention style and the tablet's own kept; Downloads-only toast; F16 and §9 text as built; storage status refreshes on a grant.

**DELIVERABLES PRODUCED**
New: `tests/stage5-leftovers.test.ts`, `scripts/m18-ui-check.mjs`, `docs/reviews/M18.md`. Changed: `docs/SPEC.md`, `docs/history/stage6-plan.md`, `src/io/{bundle,restore,backup}.ts`, `src/data/{inventory,setup}.ts`, `src/domain/labels.ts`, `src/ui/{App.tsx,data-hooks.ts}`, `src/ui/screens/Setup.tsx`, `src/ui/screens/more/{RestoreDialog.tsx,export-backup.ts}`, `src/styles/app.css`, `tests/helper-devices.test.ts`, `scripts/m16a-ui-check.mjs`, `scripts/m17-ui-check.mjs`.

**EVIDENCE**
Unit 813 pass (1 skipped). Type check and build clean. Mutants 12/12. Browser: M2 28, M3 50, M4 25, M5 39, M6 54, M7 32, M8 61, M9 71, M10 42, M11 12, M12 16, M13 25, M14 20, M15 40, M15b 26, M16a 42, M17 34, M17b 7, M16b 36, M16c 25, M18 14: **699, all pass, clean consoles.**

**CONFIDENCE**
High for the restore changes (byte-level unit tests, mutants, real IndexedDB in the browser). Medium for the toast and setup line on the Tab S8 until the tablet check.

**Next:** Dan reviews and approves SPEC v0.13 (§15 Q8 (a)–(g)), merges PR #27 then the M18 PR, and runs the tablet check in `docs/reviews/M18.md`. Then M19 (placed orders and receiving).

**Later:** Dan merged PRs #27 and #28 and approved the v0.13 details (§15 Q8 (a)–(g)): "spec details approved". SPEC v0.13 marked approved on branch `v013-approved`. M19 is next.

## 2026-10-28 (late evening) — M19: placed orders, receiving, on order

**SESSION IDENTITY**
Same session. Dan: "build m19". PR #29 (SPEC v0.13 approved) still open, so `m19-placed-orders` is stacked on `v013-approved`.

**WORK COMPLETED**
F30 Mark ordered and the order form, F31 receiving, on order in every order quantity (§4), the price copy (§21.3), receipts, edit / cancel / delete (§21.4), Placed orders list and order page, schema v4, orders and receipts in full backups and restore (§21.6). Fixed in passing: setup's restore dropped the backup's named order lists. `APP_VERSION` 0.6.0.

**EVIDENCE**
Unit 853 pass (1 skipped); tablet-backup test passes. Mutants 32/34 compiling caught (2 equivalent). Browser: M19 35/35; upgrade check against the real Oct 23 backup 22/22; regression M2–M18 696/696 (M15 updated for the new tab and v4). Clean consoles.

**INCIDENT (local, fixed)**
To build `main` for the upgrade check, a scratch worktree got a `node_modules` junction to the repo's own. `git worktree remove --force` followed it and deleted part of the real `node_modules`. Restored with `npm ci` (package files unchanged), then the type check, all unit tests, the build and the M19 check were re-run and pass. Nothing in the source or git was touched. Recorded in Claude's memory so it isn't repeated.

**CONFIDENCE**
High for the money and the data paths (unit tests to the cent, mutants, real IndexedDB, a byte-level upgrade on real data). Medium for the camera and PDF picker on the Tab S8 and the form's feel with gloves, until the tablet check. Recommended before merging: an independent fresh-session review (stage6-plan M19).

**Next:** Dan merges PR #29, decides on the independent review, confirms details (a)–(g) in `docs/reviews/M19.md`, merges M19 with a merge commit, backs up the tablet and runs the tablet check. Then M20 (order history and spending summary).

## 2026-10-29 (morning) — M19 details confirmed; typed lines get pack size and unit

**SESSION IDENTITY**
Claude Code (Opus 5.5), new session. Dan: "approve a-g except for c - allow for different pack sizes and units on typed lines; after approval of #1 run an independent review". PR #30 (M19) was already merged, so `m19-details-confirmed` starts from `main` (`4a9c659`).

**WORK COMPLETED**
SPEC v0.14: the seven M19 details written in, (c) as Dan changed it (§3 Order line, §21.1, decision log). Code: `typedLine` takes a pack size and unit (blank unit → "each"); the order form enables Pack size on typed lines and adds a labelled Unit box; the form's line total shows the typed line's own unit; typed lines are stored with the description and unit trimmed. `docs/reviews/M19.md` records the confirmation.

**EVIDENCE**
Type check and build clean. Unit 854 pass (1 skipped), +1 test (pack size, unit, blank unit, pack size 0 refused, not on order). `m19-ui-check` 37/37 (+2: the form's "$45.00 6 shirt", the order page's "3 × 2 = 6 shirt"; Receive now starts the typed line at 6), clean console; screenshots looked at in landscape and portrait.

**Next:** the independent review of M19 (with this change), in a separate agent.

**Later (independent review and fixes):** A separate review agent wrote `docs/reviews/M19-independent.md` (commit `a04f2f6`). Verdict: merge, after fixing findings 1, 2 and 5. Dan: "fix 1, fix 2, 3 undo skips items that have been received, fix 5, fix 7-8". Fixed on the same branch: the Receive confirmation for deleted items (1); no second order after a receipt fails (2); Undo leaves items received since the import alone (3, SPEC §18.5 v0.14); Cancel and Remove receipt close on relock (5); portrait labels on the order page (7); future dates, oversized totals, $0 price-copy lines, line order on restore, Setup's order total, plan v4 row, tablet-check steps (8). Unit 859 pass; `m19-ui-check` 45/45; regression M3 50, M5 39, M15b 26, M16c 25, M18 14. Findings 4 (the m15 check stops early and still exits 0) and 6 (a duplicate receipt name in a hand-edited backup) are still open.

**Later (findings 4 and 6):** Dan: "fix 4 and 6 too". M15's guard check uses schemaVersion 5 (M15 40/40 again); every browser check script now exits 1 on a FAIL or ERROR. Orders files naming a receipt twice or more than 5 per order are refused at the check. While testing 6, found that the CSV reader guessed the separator: an order with 4+ receipts, or item notes with about 5 semicolons, made a backup unrestorable ("missing columns"). `readCsv` now always uses commas (SPEC §7, v0.14). The Oct 23 tablet backup was never affected. Unit 862 pass; browser regression M2–M19 744/744, clean consoles.

## 2026-10-29 — M20: order history and spending summary

**SESSION IDENTITY**
Same session. Dan: "merged and checked" (PR #31; M19 tablet check passed), "step 7 opened the pdf. build m20". Branch `m20-order-history` from `main` (`371d3f8`).

**WORK COMPLETED**
F32 / §21.5: the History tab (ranges, supplier and status filters), the spending summary by supplier and by category, Export CSV and Export lines CSV, Print summary, and the Season starts and School year starts settings (PIN). The range is remembered on the device. `APP_VERSION` 0.7.0. M19's tablet result recorded in `docs/reviews/M19.md`.

**EVIDENCE**
Unit 883 pass (1 skipped); tablet-backup test passes. Mutants 23/23 (21/23 first: one test added, one redundant check removed). Browser: M20 37/37; regression M2–M19 744/744, all exit 0, clean consoles.

**CONFIDENCE**
High for the ranges and money (boundary dates, hand-worked and random summaries, mutants). Medium for the Android print dialog and the share sheet until the tablet check.

**Next:** Dan reviews details (a)–(k) in `docs/reviews/M20.md`, merges, and runs the tablet check there. With M20, every v0.13 milestone is built.

**Later:** Dan: "confirm a-k". SPEC v0.15 writes the eleven M20 details into §21.5 and the decision log; `docs/reviews/M20.md` records the confirmation. PR #32 ready to merge.

**Later:** Dan merged PR #32 (M20) and ran its tablet check: "tablet check successful". Every v0.13 milestone (M18–M20) is built and checked on the tablet. Still open from Stage 5: the real label-sheet print (D-01), waiting for labels to be bought.

**Later:** Dan: "label print test can be closed". SPEC §15 question 2 (which label sheets) and the Stage 5 real label-print test (D-01) are closed; decision log updated. Nothing from Stage 5 or v0.13 is still open.

## 2026-10-29 (midday, about 11:40–13:00 CDT) — Independent mentor review; M21 and M22

**SESSION IDENTITY**
New session. Dan asked for an independent look at the app "as a mentor of an FRC team": features, ease of use, layout, and up to 10 suggestions. Reviewed SPEC v0.15, the earlier reviews and screenshots of every screen from the existing browser checks.

**DECISIONS (Dan)**
Layout issues: "fix 1, 2, don't worry about 3, fix 4, 5, 6. don't worry about 7." Suggestions: 1–3 (part checkout, pit packing list, tool checkout) go to the team as a document; "do not include 4, 5, 6"; "Add 7, 8, 9 to current build"; "don't do 10".

**WORK COMPLETED**
- `docs/proposals/2026-10-29-team-feature-ideas.md`: the three ideas, each with "inside this app" vs "a separate app" and questions for the team.
- **M21** (`m21-ui-fixes`, SPEC v0.16, `APP_VERSION` 0.8.0): toasts under the top bar and tap-through; NOT COUNTED for never-counted items; portrait search shares the lock's row; Scan panel label, hint and alignment; lock always at the right. `docs/reviews/M21.md`.
- **M22** (`m22-spending-overdue-search`, stacked on M21, SPEC v0.17, `APP_VERSION` 0.9.0): Paid from (funding) on orders, By funding summary, school-year budget, overdue deliveries and their setting, the Inventory shop status strip, search by category / subcategory / barcode, recently viewed. `docs/reviews/M22.md`.

**EVIDENCE**
See the two review files (unit tests, browser checks, screenshots).

**Next:** Dan confirms the details in `docs/reviews/M21.md` and `M22.md`, merges M21 then M22 (merge commits: M22 is stacked), and runs both tablet checks.

**Later:** Dan, 2026-10-29: "m21: accept a-e; m22 accept a-h; merged; tablet checks pass." PRs #35 and #36 are merged; the details are recorded in `docs/reviews/M21.md`, `M22.md` and SPEC v0.17. Open: the team's answers on `docs/proposals/2026-10-29-team-feature-ideas.md`.

## 2026-10-29 (afternoon) — M23: cleanup of open review findings

**SESSION IDENTITY**
Same session. Dan asked what remained to build apart from the three team questions; the answer was the low-severity findings earlier reviews left open. Dan: "fix 1-5 as a cleanup milestone". Branch `m23-cleanup` from `main` (`3f963b8`).

**WORK COMPLETED**
M5 review findings 3–6 (CSV in a ZIP read as Windows-1252; links cleaned on restore; blank lines before a header; backup or snooze dated in the future), M6 review finding 7 and M19 review finding 8 (new browser checks: the PIN pad's answer, the delete text, a helper upgrading from before M19). The helper check found that M19–M22 patched old helper databases in place with a Dexie warning; the helper's version now follows the inventory's (104). Import counts' "No PIN needed" moved before the lock. SPEC v0.18, `APP_VERSION` 0.10.0. `docs/reviews/M23.md`.

**EVIDENCE**
Unit 902 pass; real tablet backup passes; mutants 15/15; M23 13/13; helper upgrade 9/9; regression M2–M22 807/807, clean consoles.

**Next:** Dan confirms details (a)–(d) in `docs/reviews/M23.md`, merges, and runs the tablet check.

**Later:** Dan, 2026-10-29: "details confirmed. merged. tablet checked." Recorded in `docs/reviews/M23.md` and SPEC v0.18. Nothing in the spec or the reviews is open; the team's answers on `docs/proposals/2026-10-29-team-feature-ideas.md` are next.

## 2026-10-29 (late afternoon) — Hand-off guide and cleanup

Dan: "write the hand-off guide and clean up unnecessary files (old deprecated logs and such)". Added `docs/HANDOFF.md` (for the next maintainer) and a root `README.md`. Deleted one-time files: `STAGE6-START.md` and `docs/START-HERE.md` (kickoff prompts), `scripts/cdp-check.mjs` (an M1 probe), `scripts/m15-upgrade-check.mjs` and `scripts/m16a-upgrade-check.mjs` (v1→v2 and v2→v3 upgrades no install needs any more; `m19-upgrade-check` and `m23-helper-upgrade-check` stay as templates). Moved finished planning documents and the Stage 5 review to `docs/history/`, with every reference updated. Unit 902 pass; build clean.

## 2026-10-29 (evening) — Version 1.0.0

Dan: "lets now set this as version 1.0.0", and asked how to start the tablet with a fresh database (no test data, helpers or orders). `APP_VERSION`, `package.json` and `package-lock.json` 1.0.0; the M16a and M17 checks expect it. `docs/HANDOFF.md` §8 gains "Starting completely fresh": clear the site's data in Chrome, then first-launch setup; a restore can't do it because it keeps the PIN, settings and helper list.

**Later:** Dan, 2026-10-29: "merged. tablet reset and set up fresh." PR #41 merged; the Tab S8 runs 1.0.0, its test data cleared (site data), set up again with a new PIN and recovery code. From here the tablet holds the team's real inventory: test on a computer or a spare device, never on it.

## 2026-11-02 (morning) — Household conversion: planning and interview

**SESSION IDENTITY**
Fork `dhiebert-whs/HouseholdInventory` (upstream `ShrapnelSergeants2408/InventoryManagement`), `main` at `925a75f`. Dan: modify the FRC inventory for household use (holiday decorations first; utility room, garage and tools, attic; later pantry, kitchen, laundry), phone-based, updatable from 2 phones (up to 5) through a lightweight free server. "Start with a planning phase … also interview me."

**DATES & TIMES**
2026-11-02, about 10:45–11:25 CST. Exact minutes for each interview round were not recorded.

**WORK COMPLETED**
Reviewed HANDOFF, SPEC v0.18 (§1–§6, §9, §13), the data model (`src/domain/types.ts`, `src/data/db.ts`) and the future-features proposals. Four interview rounds (16 answers). Wrote `docs/proposals/2026-11-02-household-conversion-plan.md`: what's kept, removed and reshaped; local-first plus Cloudflare sync; the household data model; features H-F1 to H-F19; milestones H0–H7; details D1–D10 and questions Q1–Q5.

**DELIVERABLES PRODUCED**
`docs/proposals/2026-11-02-household-conversion-plan.md`. Not committed.

**PREDECESSORS/CONTEXT**
FRC app 1.0.0 (2026-10-29). The pit-trips "containers" proposal and the tool-checkout proposal informed the bins and the lent-out feature.

**CONFIDENCE**
Plan: high for scope and the removals. Medium for Cloudflare Access sign-in in an iOS home-screen app (spike planned at H4 start, with a fallback). Free-tier figures are approximate and to be checked again at build time.

**Next:** Dan answers D1–D10 and Q1–Q5. Then H0: write SPEC v2.0.

**Later (about 11:30–11:45):** Dan: "1) yes; 2) confirmed; 3) only 2 people … items should only be in one season, keep value/insurance fields for all items". So H4 comes before H5, D1–D10 are confirmed, there are 2 users, the free `workers.dev` address is used for now (a custom domain only costs the registration, ~$10–12/yr), one season per item, and value and records fields go on every item. **H0:** `docs/SPEC.md` rewritten as SPEC v2.0 (household) on branch `h0-spec`. The FRC v0.18 spec stays in git history (`925a75f`). README and HANDOFF are left FRC until H1.

## 2026-11-02 (midday) — H1: strip and rebrand

**SESSION IDENTITY**
Same session. Dan: "pr is merged. continue to h1". Branch `h1-strip-rebrand` from `main` (`3ae9912`).

**DATES & TIMES**
2026-11-02, about 11:46–12:15 CST.

**WORK COMPLETED**
Removed purchasing, helpers, count-in, the PIN, the starter catalog, stock status, the FRC browser checks and the FRC docs (D9). The item became id, name, category, subcategory, location, quantity, barcode, notes and photo, in a new database `home-inventory` v1. Labels use `hhi:`. First launch offers Start fresh (household categories) or Restore. The app is rebranded as Hiebert Home Inventory (manifest, iPhone meta tags, placeholder icons). Tests were rewritten for the household model. New `scripts/h1-ui-check.mjs`. README and HANDOFF rewritten; SPEC v2.0 notes the interim model; `docs/reviews/H1.md`.

**DELIVERABLES PRODUCED**
Branch `h1-strip-rebrand`; `docs/reviews/H1.md`; `scripts/h1-ui-check.mjs`.

**EVIDENCE**
Unit tests 354/354 pass (27 files); build clean; H1 browser check 18/18 PASS, no console errors.

**CONFIDENCE**
High for the removals and the backup round trip (tested). Not tested on a real iPhone: nothing is published yet, because Actions and Pages aren't enabled on the fork.

**Next:** Dan confirms details (a)–(h) in `docs/reviews/H1.md`, merges, and decides whether to turn on GitHub Pages for an iPhone check before H4. Then H2.

**Later (about 12:40–13:05):** Dan turned on Actions and Pages after merging PR #2, so no run had started; the deploy was started by hand (`gh workflow run`) and passed. The app is live at https://dhiebert-whs.github.io/HouseholdInventory/. Dan: "installed and tested successfully on iphone. since this is a new build lets reset the version number to 0.1-h1. decisions a-h accepted." The version is now `0.1.0-h1` (npm needs three numbers) in `APP_VERSION`, `package.json`, the H1 browser check and the docs. Branch `h1-version-0.1`.

**Later (H2 start):** Dan: "for version numbers, remove the h value and use its number as the 3rd position. so 0.1.0-h1 becomes 0.1.1, h2 would be 0.1.2 and so on". H1 is now `0.1.1` in `APP_VERSION`, `package.json`, `package-lock.json`, the H1 browser check, SPEC, HANDOFF and `docs/reviews/H1.md` (same branch, PR #3).

## 2026-11-02 (afternoon) — H2a: places, bins, seasons (the model)

**SESSION IDENTITY**
New session (after /clear). Dan: "begin on h2". PR #3 (version) was still open, so the H2 work is stacked on `h1-version-0.1`. Four questions first:
- upgrade in place;
- H1 locations become spots in an "Unsorted" area;
- two PRs (H2a, H2b);
- store every §3 item field and show most.

Dan chose the recommended answer each time. Mid-session, Dan: "for version numbers, remove the h value and use its number as the 3rd position. so 0.1.0-h1 becomes 0.1.1, h2 would be 0.1.2". PR #3 was updated to 0.1.1. Asked how a split H2 is numbered: H2a 0.1.2, H2b 0.1.3 (Dan).

**DATES & TIMES**
2026-11-02, about 13:05 onwards CST. The exact end time was not recorded.

**WORK COMPLETED**
SPEC updated (H2a/H2b split, upgrade, item fields, §7 `label_contents` and `tags.csv`, decision log). Branch `h2a-model`:
- schema v2 with the in-place H1 upgrade;
- areas, spots, bins, seasons, tags, several photos;
- every item field;
- the §7 backup, with H1 ZIPs still restorable;
- Move, Split, Duplicate;
- item, bin and spot screens; Areas & spots, Seasons and Tags lists;
- Inventory filters and bulk Move.

The H1 browser check was replaced by `scripts/h2a-ui-check.mjs`. Version 0.1.2. `docs/reviews/H2a.md` lists details (a)–(k) for Dan.

**DELIVERABLES PRODUCED**
- Branch `h2a-model`.
- `docs/reviews/H2a.md`.
- `scripts/h2a-ui-check.mjs`.
- Tests `upgrade-h1`, `places`, `places-db`, `household-csv`.

**PREDECESSORS/CONTEXT**
H1 (0.1.1), PR #3 open.

**EVIDENCE**
Unit 405/405 (29 files); build clean; H2a browser check 35/35 PASS including the upgrade of a real H1 database, no console errors.

**CONFIDENCE**
High for the upgrade, backup round trip and restore safety (unit and browser tested). Medium for the screen details, which H3 reworks. The cause of the Dexie early-commit seen with bin and spot photos wasn't isolated; the rewritten code is tested.

**Next:** Dan merges PR #3, then the H2a PR. Before installing 0.1.2 on the phone, make a Full backup. Then the phone check in `docs/reviews/H2a.md`, confirm (a)–(k), then H2b.

## 2026-11-03 (morning) — Deploy fix, redesign interview, SPEC v3.0 draft

**SESSION IDENTITY**
Continued from the H2a session. Dan: "it looks like the app isn't updating on the iphone. it is still showing version 2.0.0-h1". After the fix Dan saw 0.1.2, then: "I am looking at a redesign before we continue. I am going to split this into 2 apps … or possibly 2 apps in one with a home screen slider … Which would work easier? Interview me". Then: "go ahead and draft SPEC v3.0".

**DATES & TIMES**
2026-11-02 evening (deploy fix) to 2026-11-03, about 10:40 local (SPEC draft).

**WORK COMPLETED**
- Deploy: PR #4 (H2a) had been stacked on PR #3's branch and merged into it after #3 had merged, so 0.1.1 and H2a never reached `main`; merges to `main` also started no Pages deploy. PR #5 brought them onto `main`; 0.1.2 reached the phone.
- Interview (four rounds of questions): one app with a Household | Holiday switch; completely separate storage; seasons Holiday only; Holiday adds displays, setup/takedown lists, condition checks with a to-buy list, a season calendar; family on both parts with live sync, offline first, Cloudflare free tier, emailed codes kept; split before sync; Holiday usable for Christmas setup by late Nov; current data is test data.
- SPEC v3.0 drafted on branch `spec-v3` (parts in the data model, new records Display, Season task, Season run, To-buy line; F21–F25; two tab bars; §7 columns; milestones H3–H9 with targets; 8 open questions in §17). HANDOFF updated (users, roadmap, no stacked PRs, check the deploy after a merge).

**DELIVERABLES PRODUCED**
- `docs/SPEC.md` v3.0 (draft), `docs/HANDOFF.md`, this entry. PR on `spec-v3`.

**PREDECESSORS/CONTEXT**
H2a (0.1.2) merged and on the phone. Old H2b is folded into H3.

**EVIDENCE**
Documentation only; no code changed, so no tests were run.

**CONFIDENCE**
High that the draft records Dan's answers. The proposed details (letters across parts, default categories and dates, moving between parts, the setup-list order, the `.ics` calendar, the upgrade, the targets) are mine and listed in SPEC §17 for Dan.

**Next:** Dan reviews SPEC v3.0 and answers §17; then H3 starts with mockups.

## 2026-11-03 (late morning) — H3: two parts, Find, Browse, scanning, labels (0.1.3)

**SESSION IDENTITY**
New session after the H3 mockups were approved. Dan: "go ahead with h3".

**DATES & TIMES**
2026-11-03, from about 11:10 (after the 11:05 mockup commit) to about 12:15 CST. The exact start time was not recorded.

**WORK COMPLETED**
Branch `h3-two-parts`:
- schema v3 with `part`, season dates, the 0.1.2 upgrade, and new part-keyed `categoryList` and `tagList` tables;
- the part rules in the domain and data layers;
- §7 backup columns; 0.1.2 ZIPs restore through the same conversion; 0.1.1 ZIPs are refused;
- the part switch and both five-tab bars, the Undo toast;
- Find, Browse (place, category, season), the Season home, the Lists tabs, More per part;
- scanning of bins, spots and typed bin codes across parts;
- bin, spot and item labels with "Label out of date";
- Move across parts; Set up for both parts.

Version 0.1.3. `scripts/h3-ui-check.mjs` replaces the H2a check (its flows moved into part 3). `docs/reviews/H3.md` lists details (a)–(l) for Dan. SPEC "Built so far" and HANDOFF updated.

**DELIVERABLES PRODUCED**
- Branch `h3-two-parts`.
- `docs/reviews/H3.md`.
- `scripts/h3-ui-check.mjs`.
- Tests `upgrade-v2`, `parts`, `parts-db`, `seasons`.

**PREDECESSORS/CONTEXT**
SPEC v3.0 (PR #6) and the H3 mockups (approved 2026-11-03).

**EVIDENCE**
- Unit tests: 464/464 pass (33 files).
- Build: clean.
- H3 browser check: 57/57 PASS, including the in-place upgrade of a real 0.1.2-shaped database; no console errors.
- An independent review of the database, backup and part rules (separate agent) found nothing serious; its two minor findings (blank `part` cells, mixed 0.1.2/0.1.3 files in one ZIP) were fixed and tested.

**CONFIDENCE**
- High for the upgrade, the backup round trip and the part rules (unit and browser tested, independently reviewed).
- Medium for the look of the screens H7 still reworks (item, bin and spot detail, the editor, Labels). They work at phone width but use stopgap layouts.

**Next:** Dan reviews the PR and details (a)–(l). Before installing 0.1.3, make a Full backup on the phone. Then the phone check in `docs/reviews/H3.md`, then H4 (Holiday setup, target ~Nov 24).

## 2026-11-03 (midday) — H3 follow-up: area codes from names; (a)–(l) accepted

**SESSION IDENTITY**
Same day, after PR #7 opened. Dan: "lets switch areas to area names and not letters so they are more descriptive. decisions a-l." Asked to choose a code form; he chose "Short name + number" (ATTIC-04) and accepted (a)–(l). The work was interrupted by the usage limit once and finished with "continue the area-code change".

**DATES & TIMES**
2026-11-03, about 12:20 onwards CST. The exact end time was not recorded.

**WORK COMPLETED**
- Area `letter` became `code` (1–8 letters, from the name, unique across parts); bin codes are CODE-NN.
- The 0.1.2 upgrade and restore rename bins (A-04 → ATTIC-04) and mark them not printed.
- Areas & spots, the bin editor and labels use the codes; long codes shrink on labels.
- Tests and the H3 browser check updated.
- SPEC §3, §7 and the decision log (area codes; (a)–(l) accepted), the H3 review file.

**DELIVERABLES PRODUCED**
Commits on `h3-two-parts` (PR #7).

**PREDECESSORS/CONTEXT**
H3 (0.1.3), PR #7.

**EVIDENCE**
Unit tests 464/464; build clean; H3 browser check 57/57 PASS, no console errors.

**CONFIDENCE**
High: the rename runs through the same `fromV2` conversion the independent review checked, and it's covered by the upgrade, restore and browser tests.

**Next:** Dan merges PR #7; check that the deploy ran; Full backup on the phone before installing 0.1.3; then the phone check in `docs/reviews/H3.md`, then H4.

## 2026-11-03 (afternoon) — Area codes onto main: schema v4

**SESSION IDENTITY**
Dan: "in github i see pushes but not the pr". PR #7 had been merged (12:10 CST) and deployed (12:40) before the area-code commits were pushed to its branch, so they never reached `main`.

**WORK COMPLETED**
- New branch `h3-area-codes` from the area-code commits.
- Schema v4 converts letters to codes on any phone that installed the deployed (letters) 0.1.3; the same conversion (`lettersToCodes`) serves the v2 upgrade and backups from either build.
- Tests, browser check, SPEC, HANDOFF (no pushes to a merged PR's branch) and the review file updated.

**EVIDENCE**
Unit 467/467; build clean; H3 browser check 57/57 PASS, no console errors.

**CONFIDENCE**
High: the v3-letters upgrade, running it twice, and restoring a letters-build backup are all tested.

**Next:** Dan merges the new PR; check the deploy ran; then the phone check in `docs/reviews/H3.md`.

## 2026-11-03 (afternoon) — Deploy check, then H4: the Holiday setup (0.1.4)

**SESSION IDENTITY**
Dan: "merged. check deploy. then begin h4". PR #8 (area codes, schema v4) had been merged at 13:55 CST.

**DATES & TIMES**
2026-11-03. PR #8's deploy run finished 13:56 CST; H4 data commit 14:08, screens commit 14:28, docs about 14:30 onwards. The session's start time was not recorded.

**WORK COMPLETED**
- Deploy check: the "Deploy to GitHub Pages" run for PR #8 succeeded (52 s), and the live site serves 0.1.3 with ATTIC-04 codes.
- H4 on branch `h4-holiday-setup`:
  - schema v5: displays, season tasks, season runs; photos may carry a season;
  - the rules: run years, the setup list, the Season home with runs, the `.ics` file, integrity checks;
  - the backup files `displays.csv`, `season_tasks.csv`, `season_runs.csv`, and `season_id` in `files.csv`;
  - screens: More › Displays, a display's screen with setup photos by season, a season's screen (Start setup, tasks, notes, photos), the setup list as in the mockup, Unpack, Put out / Put back, the usual display in the editor and on the item, the Season home's next steps, Add to Calendar.
- `scripts/h4-ui-check.mjs` replaces the H3 check (its parts 1–3 kept, part 4 added).
- `docs/reviews/H4.md` lists details (a)–(n) for Dan. SPEC "Built so far" and §2, HANDOFF updated.

**DELIVERABLES PRODUCED**
- Branch `h4-holiday-setup`.
- `docs/reviews/H4.md`.
- `scripts/h4-ui-check.mjs`.
- Tests `holiday`, `holiday-db`, `holiday-backup`; `backup-restore` extended.

**PREDECESSORS/CONTEXT**
H3 (PR #7) and the area-code change (PR #8); SPEC v3.0 §15 H4; the approved H3 setup-list mockup.

**EVIDENCE**
- Unit tests: 505/505 pass (37 files).
- Build: clean.
- H4 browser check: 90/90 PASS, no console errors or warnings; the new screens checked at 390 px.
- Independent review of the data layer (separate agent): nothing corrupting; four findings (lent items put out, a stale "up" run blocking next year, Household bins set out, a silent loss on restoring a 0.1.3 backup) fixed with tests.

**CONFIDENCE**
- High for the upgrade (no stored record changes), the new writes and the backup round trip (unit and browser tested).
- Medium for Add to Calendar on an iPhone: what iOS's share sheet does with an `.ics` file wasn't testable here (phone check step 8).

**Next:** Dan reviews the PR and details (a)–(n); Full backup on the phone before installing 0.1.4; the phone check in `docs/reviews/H4.md`; then H5 (sync and sign-in).

## 2026-11-03 (afternoon) — H4 merged and deployed; (a)–(n) accepted

Dan: "merged. check deploy. decisions a-n accepted." PR #9 merged 14:41 CST. Its deploy run succeeded (1 m 15 s), and the live site serves 0.1.4 (checked in the bundle). Decisions (a)–(n) recorded in SPEC §16 and `docs/reviews/H4.md`. **Next:** Full backup on the phone, install 0.1.4, the phone check in `docs/reviews/H4.md` (step 8: the `.ics` on an iPhone), then H5.

## 2026-11-05 — H5 sync built (branch `h5-sync`)

Dan: H4 step 8 (the `.ics` on the iPhone) passed; spike questions 2 and 3 wait; "build h5 sync, moving forward with option a" (merge the spike's Worker into `main` first).

**WORK COMPLETED**
- PR #13 (the sign-in spike) merged into `main`, its description saying questions 2 and 3 continue there.
- Branch `h5-sync` from `main`:
  - the Worker: Access token check, D1 records with a sequence-number cursor, push with validation (shared `src/domain/sync.ts`), bin-code renumbering, overwrite notes, ticked-task merge, the activity log, R2 photo files, daily purge; `cloudflare.config.ts` gets D1, R2, the Access team and audience, a daily trigger;
  - the phone: schema v6, the outbox middleware, `syncOnce` (pull, push, pull, photos), link repair, first sync and first download;
  - screens: the sync line and banners, More › Activity and each record's last 10 entries, Settings' sync card and your name, restore wording;
  - the Cloudflare deploy job (skipped until the secrets exist); version 0.1.5.
- `docs/reviews/H5.md` with details (a)–(n); SPEC, HANDOFF §9 and H4's step 8 updated.

**EVIDENCE**
- Unit tests: 538/538 pass (41 files), including the Worker on D1 over SQLite and two phones syncing through it.
- Build and both type checks clean; the H4 browser check passes 90/90 on the copy with no server (three stale expectations updated).
- Not yet: a deployed Worker in a real browser (R2 must be turned on first), the independent review.

**CONFIDENCE**
- High for the sync rules (tested end to end through the real Worker code).
- Medium for Cloudflare specifics not testable here: D1's and R2's bindings, the first deploy creating them, Access's real tokens.

**Next:** Dan turns on R2, deploys, runs the phone check in `docs/reviews/H5.md`, and reviews (a)–(n); an independent review in a fresh session.

## 2026-11-05 — H5 independent review (branch `h5-review-fixes`)

Dan: "decisions a-n ok. phone tests passed. begin independent review of h5", then "fix 1, 2, 3 and low items".

**WORK COMPLETED**
- Review in a fresh session (SPEC §15), recorded in `docs/reviews/H5.md` › Independent review.
- Fixed: link repair that read "not arrived yet" as "deleted" (push order, server-side clearing of links to deleted records, phone repair limited to pulled deletes); Access key rotation; push in a few D1 queries and one batch; one person per email; images only with nosniff; a reset keeping photos not yet uploaded; a renumbered bin keeping its number; activity trimmed on phones; failed thumbnail downloads not retried every sync.

**EVIDENCE**
- Unit tests: 552/552 pass (41 files); 12 of the 14 new tests fail on the code before the fixes.
- Build and both type checks clean; the H4 browser check passes with no console errors (copy with no server).

**CONFIDENCE**
- High for the repair and ordering fix (reproduced, then tested end to end on two phones through the Worker).
- Medium for the D1 query rounds on real D1 (`(type, id) IN (SELECT … json_each)` runs on SQLite here; D1 runs the same engine).

**Next:** Dan merges, deploys the Worker (`npm run worker:deploy`) and reloads the app on each phone.
