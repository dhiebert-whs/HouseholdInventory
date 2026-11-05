# Hiebert Home Inventory: Specification v3.0

**Owner:** Dan · **Users:** the Hiebert family (Dan, Ann and others Dan allows) · **Devices:** iPhones, the app added to the home screen from Safari
**Status:** Accepted, 2026-11-03 (Dan accepted the draft and its proposed answers) · **Based on:** v2.0 and the redesign interview of 2026-11-03 (§16)
**Previous:** v2.0 (2026-11-02) is in git history on `main` before this change. The FRC 2408 spec it came from (v0.18) is in history before commit `925a75f` and upstream at `ShrapnelSergeants2408/InventoryManagement`. Nothing from either applies unless this document says so.

**Changes in v3.0** (Dan, 2026-11-03):
- **Two parts in one app: Household and Holiday.** A switch at the top of the app chooses the part (F21), and the app reopens in the part used last. Each part has its own areas, spots, bins, items, categories and tags, and the two never mix. The parts share scanning, labels, photos, item screens, backup and sync.
- **Seasons are Holiday only.** The household part has no season fields, filters or chips.
- **New Holiday features:**
  - display spots: where a decoration goes when it's out (F22);
  - setup and takedown lists for each season (F6, F25);
  - condition checks that feed a to-buy list (F9, F24);
  - a season calendar (F23).
- **Users:** the family, not just Dan and Ann. Sign-in stays the emailed one-time code (Cloudflare Access), with the allowed emails listed by Dan (§12.4).
- **Order:** the split comes before sync. The Holiday part must be usable for **Christmas setup by late November 2026**, possibly on one phone. Sync follows, aiming for before Christmas takedown (§15).
- **The data on the phone is test data** (Dan). The upgrade from 0.1.2 needs to be safe, not clever (§3, "Upgrading").
- **H2b is folded into H3.** Find, Browse, scanning bins and spots, and bin and spot labels are built once, for both parts.

**Built so far:**
- **H1** (app 0.1.1, `docs/reviews/H1.md`): the FRC features stripped, rebranded.
- **H2a** (app 0.1.2, `docs/reviews/H2a.md`): the v2.0 data model in one part — areas, spots, bins, seasons, tags, every item field, several photos, the §7 backup, F7, F11, F16. Find, Browse, bin and spot scanning and labels (old H2b) were not built.
- **H3** (app 0.1.3, `docs/reviews/H3.md`; details (a)–(l) accepted, area codes from names added after review): schema v3 with the two parts and the 0.1.2 upgrade, F21 (switch, both tab bars, Undo toast), Set up for both parts, F1, F2, F3, F10 for bins, spots and items, F11 per part, season dates and the Season home (seasons on now, Coming up), the read-only Lists tabs, and the §7 part columns. Details decided along the way are listed there for Dan to confirm.
- **H4** (app 0.1.4, `docs/reviews/H4.md`): schema v5 (displays, season tasks, season runs; photos may carry a season), F22 displays and the item's usual display, F25 Start setup and the setup list, season tasks, F5 Unpack and Put out / Put back on an item, F8 setup photos by season on displays, F23 runs on the Season home and the `.ics` file, and the §7 files for them. Details (a)–(n) there accepted by Dan. A run's own dates are stored but have no screen yet.

---

## 1. Purpose and users

A home inventory in two parts that answers "where is it?" and "what's in this bin?":

- **Holiday:** decorations for every season, kept in their own storage places. It follows the yearly cycle: take bins out, set things up where they go, check their condition, pack them back, and know what to buy before next year.
- **Household:** everything else: the utility room, garage (including tools), attic, and later the pantry, kitchen and laundry. Its job is finding things and keeping records.

Users:
- Family members each use their own iPhone, and everyone can do everything in both parts (no roles).
- Every change is attributed to the person who made it and appears in a shared activity log.
- No PIN: sign-in identifies people, and confirmations prevent accidents (Dan, 2026-11-02).

## 2. Platform and stack

| Decision | Choice | Why |
|---|---|---|
| App type | PWA, added to the home screen from **iPhone Safari**. One app, one icon (Dan, 2026-11-03) | No App Store; the FRC app's code base |
| Language/build | TypeScript, Preact, Vite (unchanged) | Existing code and tooling |
| Storage on the phone | IndexedDB via Dexie, database `home-inventory`, schema v5 (H4: displays, season tasks and runs; H3: v3 the two parts, v4 area codes; v2 was H2a, v1 was H1) | **Local-first:** works with no signal in the attic, garage or storage room |
| Server | One Cloudflare **Worker** (API + static app), **D1** (data), **R2** (photos and files), on Dan's free-tier account | Free tier, never sleeps, ~$0 for a family (§14) |
| Sign-in | Cloudflare Access, one-time email code, a policy listing the family's email addresses. **Fallback** (§12.4) if it misbehaves in an iOS home-screen app | Real identity without passwords |
| Address | `https://<name>.workers.dev`. A custom domain (~$10–12/yr) can be added later with no code change (Dan, 2026-11-02: free address for now) | |
| Deploy | **Until H5:** GitHub Pages from `main` (as now). **From H5:** GitHub Actions on every merge to `main`: test, build, `cf deploy` (the cf CLI; config in `cloudflare.config.ts`) | The app must share an origin with the API, or Safari blocks the sign-in cookie |
| CSV, ZIP, QR, scanning | Papa Parse, JSZip, qrcode-generator, barcode-detector with the zxing WASM fallback (unchanged) | Safari has no native BarcodeDetector, so zxing is the main scanner |
| Tests | Vitest for app and Worker; headless browser checks (`scripts/`) | As now |

**Additional requirements**
- Fully usable offline after the first sign-in and sync. Changes made offline are queued and sent when the phone is online (§12).
- **Layout:** iPhone portrait, 360–430 CSS px wide, nothing scrolls sideways. Respect safe-area insets (notch, home indicator) and use dynamic viewport height.
- Request persistent storage. If iOS clears the app's storage, the next sign-in pulls everything back from the server, so nothing is lost except changes that hadn't synced yet. The sync status (§12.3) shows those.

## 3. Data model

Every stored record (except local caches) has these sync fields:

| Field | Notes |
|---|---|
| `id` | Random, made on the phone: a prefix plus 8 characters from the id alphabet (`src/domain/ids.ts`) |
| `updatedAt` | ms since epoch, **set by the server** when it accepts the change |
| `updatedBy` | Person id |
| `deleted` | Tombstone flag (§12.2). Deleted records are hidden everywhere |

### Parts (new in v3.0)

`part` is `household` or `holiday`.

| Record | How its part is known |
|---|---|
| Area, Category, Tag, To-buy line | Its own `part` field (required) |
| Spot | Its area's part |
| Bin | Its spot's area's part. A bin with no spot has its own `part` field, which must match its spot's whenever it has one |
| Item | Its own `part` field (required), so an item with no home still belongs to a part. It must match its home's part |
| Season, Display, Season task, Season run | Always `holiday` (no field) |
| Photo, Attachment | Its owner's part |
| Person, Activity | Shared |

Rules:
- Nothing links across parts: an item can't be homed in a bin of the other part, a household item can't have a category from the Holiday list, and so on. The phone and the server both refuse it.
- **Area codes are unique across both parts**, so every bin code (ATTIC-04) is unique in the whole app, and a typed code finds one bin wherever it is.
- Names (areas, categories, tags) are unique **within a part**, ignoring capitals. Both parts may have an area called "Attic".
- **Moving to the other part:** an item can be moved to the other part by choosing a home there (F7, with a confirmation naming the part). Its season, display and tags are cleared when it leaves Holiday, and its category is matched by name in the new part, else set to "Other". A bin moves part with everything in it, the same way. Areas and spots don't change part.

### Area (`ar-`)
A room or zone: Attic, Garage, Utility room, Storage room, Basement…

| Field | Required | Notes |
|---|---|---|
| part | yes | |
| name | yes | Unique within the part, ignoring capitals |
| code | yes | 1–8 capital letters A–Z ("ATTIC", "STORAGE"), unique across both parts. The bin-code prefix (§3, Bin). Defaults to the first word of the name; if that's taken, the word with the other words' initials, then its first 7 letters and A–Z. Letters only, so a bin's number never runs into it (Dan, 2026-11-03: names, not letters, so codes say where the bin lives) |
| order | yes | Walk order within the part |
| notes | no | |

Changing an area's code later doesn't rename its bins (their labels stay true); new bins there get the new code.

### Spot (`sp-`)
A place inside an area: "Shelf B", "Pegboard", "Cabinet over washer", "Floor by the furnace".

| Field | Required | Notes |
|---|---|---|
| areaId | yes | |
| name | yes | Unique within its area, ignoring capitals |
| order | yes | Walk order within the area |
| notes, photos | no | |

### Bin (`bn-`)
A container with a QR label.

| Field | Required | Notes |
|---|---|---|
| code | yes | Area code + 2-digit number ("ATTIC-04"; typed "attic4" works), the next free number in that area, assigned automatically and editable (D4). Unique across both parts. Printed large on the label. **Kept when the bin moves** to another area, so labels stay true |
| name | yes | "Christmas 4: lights & garland" |
| part | when it has no spot | See Parts |
| spotId | no | Where it's stored. Blank = "No spot" |
| seasonId | no | **Holiday only.** One season |
| tags | no | Free tags from the bin's part |
| state | yes | `stored` or `out` (taken out for the season, e.g. sitting empty in the living room) |
| notes, photos | no | Outside view, contents view… |
| labelPrintedAt, labelContents | no | When its label was last printed, and the contents summary printed on it (§9) |

### Item (`it-`)

| Field | Required | Notes |
|---|---|---|
| part | yes | See Parts |
| name | yes | |
| category, subcategory | yes / no | From the part's Categories list (F11) |
| binId **or** spotId | one of them, or neither | Its home. An item in a bin is wherever the bin is; a loose item sits on a spot. Neither = "No home yet" |
| quantity | yes | Whole number ≥ 0, default 1 |
| approx | yes | Default no. Yes shows "~40" for bulk lines |
| seasonId | no | **Holiday only.** One season. Blank means it follows its bin's season |
| displayId | no | **Holiday only.** Where it usually goes when it's out (F22) |
| tags | no | Free tags from the item's part (Fragile, Outdoor, Kids' room…) |
| status | yes | `stored` · `out` · `lent` |
| outWhere | no | While `out`: free text with recent suggestions ("Mantel", "Front yard"). In Holiday, picking a display fills it with the display's name and sets `outDisplayId` |
| outDisplayId | no | **Holiday only.** While `out`: the display it's on this time (defaults to `displayId`) |
| outSince | no | Date-time the item went out |
| lentTo, lentOn | no | While `lent`: typed name, date |
| condition | yes | `ok` · `needs repair` · `replace` · `toss` |
| conditionNote | no | "Left strand dead" |
| checkedAt | no | **Holiday only.** When its condition was last checked (F9). Lets a takedown show "not checked yet this season" |
| barcode | no | Product barcode (UPC/EAN) |
| notes | no | |
| value | no | Integer cents. Shown for every item (Dan, 2026-11-02) |
| purchaseDate, model, serial, warrantyUntil | no | Shown for every item, in a collapsed "Records" section |
| photos, attachments | no | Several of each |
| keepAtLeast | no | **Household, pantry phase (F19).** Not shown before then |

### Season (`se-`) — Holiday only
| Field | Required | Notes |
|---|---|---|
| name | yes | Unique, ignoring capitals |
| order | yes | Display order. Defaults to calendar order: Valentine's, St. Patrick's, Easter, 4th of July, Fall, Halloween, Thanksgiving, Christmas, Winter, New Year's |
| color | yes | From a fixed palette of 10 (chips only, never a condition color) |
| setupFrom, takedownBy | no | **New (F23).** Month and day each year ("11-25", "01-06"). Defaults below. A season run (below) can move them for one year |
| setupNotes, setup photos | no | How things were arranged (F8) |

Default dates (Dan to adjust, §17): Valentine's 02-01 → 02-20 · St. Patrick's 03-10 → 03-20 · Easter 03-20 → 04-30 · 4th of July 06-25 → 07-10 · Fall 09-15 → 11-30 · Halloween 10-01 → 11-05 · Thanksgiving 11-01 → 11-30 · Christmas 11-25 → 01-06 · Winter 12-01 → 02-28 · New Year's 12-28 → 01-03. Easter and Thanksgiving move each year, so their windows are wide; a run can narrow them.

### Display (`dp-`) — Holiday only, new
A place in or around the house where decorations are put out: "Mantel", "Front porch", "Dining table", "Front yard".

| Field | Required | Notes |
|---|---|---|
| name | yes | Unique, ignoring capitals |
| order | yes | Display order, e.g. the walk-through order for setup |
| notes, photos | no | Photos of the finished setup, each with an optional season (F8) |

Displays are not storage: nothing is homed on a display. An item says where it **usually goes** (`displayId`) and, while out, where it **is** (`outDisplayId`).

### Season task (`tk-`) — Holiday only, new
A line on a season's setup or takedown list that isn't a bin or an item: "Test the lights before hanging", "Get the ladder from the garage", "Water the tree daily".

| Field | Required | Notes |
|---|---|---|
| seasonId | yes | |
| phase | yes | `setup` or `takedown` |
| text | yes | |
| order | yes | Position in the list |

### Season run (`sr-`) — Holiday only, new
One year's setup-to-takedown cycle for a season. It holds the progress that isn't already in item and bin status.

| Field | Required | Notes |
|---|---|---|
| seasonId | yes | |
| year | yes | The year the setup starts. One run per season per year |
| setupFrom, takedownBy | no | This year's dates, if different from the season's |
| phase | yes | `planned` · `setting up` · `up` · `taking down` · `done` |
| doneTaskIds | no | Season tasks ticked this run |
| startedAt, finishedAt | no | |

### To-buy line (`tb-`) — new
The Holiday **To buy** list (F24). The pantry's shopping list (F19) uses the same record with `part: household`.

| Field | Required | Notes |
|---|---|---|
| part | yes | |
| text | yes | "Replacement lights for the front-porch garland" |
| quantity | no | |
| itemId | no | The item it replaces or tops up (shows its photo and path) |
| seasonId | no | **Holiday only.** For grouping; defaults to the item's season |
| done, doneAt | no | Ticked when bought |

### Category
As FRC F9: name, order, subcategories, plus `part`.

- **Household defaults:** Tools, Hardware, Yard & garden, Sports & outdoors, Seasonal clothing, Kitchen, Pantry, Cleaning & laundry, Electronics, Documents & keepsakes, Other.
- **Holiday defaults:** Ornaments, Lights, Wreaths & garland, Trees, Inflatables & yard, Village & figurines, Tableware & linens, Wrapping & cards, Costumes, Other.

Dan to adjust both lists (§17).

### Tag
Name, order and `part`. Each part has its own Tags list.

### Photo / Attachment (`ph-`, `at-`)
| Field | Notes |
|---|---|
| ownerType, ownerId | item, bin, spot, season or display |
| kind | Photo: `photo` or `setup`. Attachment: `manual`, `receipt`, `warranty` or `other` |
| seasonId | Optional, for a display's setup photo |
| caption | Optional |
| r2Key, contentType, bytes | Set once uploaded |
| order | Position in the owner's carousel. The first photo is the thumbnail |

The phone keeps a thumbnail (about 320 px) for every photo, and the full image (about 1600 px long side, JPEG, D10) for photos taken on this phone or opened before. Attachments (PDF or image, up to 15 MB) are downloaded when opened.

### Person (`pp-`)
name, email. Created by the server on first sign-in for an allowed email; the name can be edited in More. Any number of family members (§13).

### Activity (`ac-`, written by the server)
at, personId, summary ("Ann moved Snowman lights to ATTIC-04 Christmas 4"), recordType, recordId, part. Kept 2 years (D8).

### Upgrading a 0.1.2 phone

The phone's data is test data (Dan, 2026-11-03), so schema v3 keeps it simply:
- every area, category, tag and item goes to **Household**;
- seasons, and the season on items and bins, move to **Holiday**: the seasons are kept, and the household items and bins lose their season;
- the Holiday part starts with its default categories and no areas;
- each area's letter becomes a code from its name (Attic's A → ATTIC), and its bins are renamed to match (A-04 → ATTIC-04). A renamed bin counts as not printed yet, since its old label shows the old code.

Restore reads a 0.1.2 backup ZIP the same way. **H1 (0.1.1) backup ZIPs are no longer read** (nothing worth keeping is in one). A Full backup before installing 0.1.3 is still advised.

## 4. Rules and calculations

- **An item's location:** the item's home spot or bin. For a bin, the bin's spot and its area. Shown as a path: *Attic › Shelf B › ATTIC-04 Christmas 4*. If the bin has no spot: *ATTIC-04 Christmas 4 (no spot)*.
- **An item's season** (Holiday): the item's own season, else its bin's.
- **Out of place:** an item with status `out` or `lent` still keeps its home. Repacking returns it there.
- **Bin contents summary** (labels, bin cards): items in the bin with status `stored`, the largest quantities first, then A–Z. Each is shown as "Name ×3" or "Name ~40". Bulk lines come first when tied.
- **Label out of date:** a bin whose current contents summary differs from `labelContents` shows "Label out of date" with **Reprint**.
- **Ids in QR codes** (§9): `hhi:` + the record id.
- **Seasons on now** (Holiday): every season whose window (setupFrom to takedownBy, wrapping over New Year) contains today, or whose run this year is underway (not `planned` or `done`). Several can be on at once (late November: Fall, Thanksgiving and Christmas). The Holiday home leads with the one needing action soonest: a setup starting today or underway first, then the nearest takedown date; the others are listed under **Also now** (Dan, 2026-11-03, H3 mockups). If none is on, the home leads with the next to start.
- **A season's run:** the run for this year, created when someone first taps **Start setup**. Setup progress = bins of the season set to `out`, items set `out`, and setup tasks ticked. Takedown progress = items back to `stored`, items checked (F9), bins back to `stored`, and takedown tasks ticked.

## 5. Features

### 5.1 Both parts

| # | Feature | Acceptance criteria |
|---|---|---|
| F21 | Part switch | **New.** A two-way switch at the top of the main screens: **Household \| Holiday**, the current part in its color (§11). Switching changes the tab bar, the lists and the search scope, and keeps nothing open from the other part. The phone remembers the last part used and opens in it. Scanning a label or typing a bin code from the other part opens that record and switches part, with a toast ("Switched to Holiday") whose **Undo** goes back to the screen and part you were in (Dan, 2026-11-03). Detail screens show the part's color in the top bar so it's always clear which part you're in |
| F1 | Find | One search box over the **current part**: item names, notes, tags, barcode, model/serial, bin codes and names, spots, areas, categories, and in Holiday seasons and displays. Results update as you type, grouped Items / Bins / Spots, each with its path (§4) and a thumbnail. Below them, one line: "3 matches in Holiday" opens the other part's results. With the box empty and focused: the 8 records of this part most recently opened on this phone |
| F2 | Browse | Views, remembered per part: **By place** (Area › Spot › Bin, collapsible, walk order; loose items under their spot; "No home yet" last), **By category**, and in Holiday **By season** (season › bin › item, plus "Not in a bin") and **By display** (display › items that go there). Filters: area, status (stored / out / lent), condition (not OK), tag, and in Holiday season |
| F3 | Scan | Aim-and-hold scanner (FRC F21 rules: center square, 0.6 s hold). `hhi:bn-…` opens the bin, `hhi:sp-…` the spot, `hhi:it-…` the item, in whichever part (F21). Any other code is matched against item barcodes in both parts, and an unknown one offers **Attach to an item** or **Add item with this barcode** (in the current part). Codes can also be typed (a bin code like "A-04" works). Torch button |
| F7 | Move | Item: change its home (bin or spot) from its detail screen, by picking or scanning. Bin: **Move bin** → scan or pick the new spot. Bulk: Select mode in lists → **Move to…** a bin or spot. The picker shows the current part; a **Show Household/Holiday places** link moves things across parts (§3, Parts). The activity log records each move |
| F10 | Labels | Layouts from FRC §9 (5160, 5163, 22805, plain paper) for **bins, spots and items** of either part. §9 has the content rules. Printing via the iOS share sheet: AirPrint, or Save to Files (PDF). Start position, alignment nudge (per layout, per phone), test print and the 100% reminder are kept |
| F11 | Manage lists | **More › Areas & spots, Categories, Tags** for the current part, and in Holiday **Seasons** and **Displays**. Add, rename, reorder (▲/▼ reorder mode). Remove: an area or spot holding anything asks where its contents go first. A season, display or tag in use asks to confirm and is cleared from those records. Duplicate names are rejected, ignoring capitals |
| F16 | Item editing | Detail screen: photo carousel, path breadcrumbs, quantity stepper, status and condition chips, and actions in the thumb zone (Move, Edit, More…; Lend in Household). **Split a line**: take n out of a bulk line into a new item. **Duplicate** an item. **Delete** asks to confirm, naming the item. Holiday items also show their season and usual display |

### 5.2 Holiday

| # | Feature | Acceptance criteria |
|---|---|---|
| F23 | Season calendar | **New.** The Holiday home (§10) shows the seasons on now (§4), each with its dates and phase ("Christmas · setup from Nov 25 · not started"), and **Coming up**: the next three seasons with their setup dates. **More › Seasons** edits each season's dates. **Add to Calendar** makes an `.ics` file (iOS opens it in Calendar) with each season's setup and takedown dates as yearly all-day events, so reminders come from the iPhone's Calendar. In-app push reminders are not in this release (§13) |
| F25 | Setup list | **New.** On a season, **Start setup** creates this year's run (§3) and opens its setup list, three sections with progress ("12 of 30"): **Bins to bring out** (the season's bins, by place, each with **Out** to set the bin `out`, or scan the bin), **Put out** (the season's items by display, then "No display", each ticked to set it `out` on its display; **Unpack a bin** (F5) does a whole bin at once), and **Tasks** (setup tasks, ticked). Setup photos (F8) for each display are one tap away. **Finish setup** sets the run to `up`; anything still unticked is listed but doesn't block. Season tasks are added, edited and reordered on the season (More › Seasons) or straight from the list |
| F6 | Takedown list | (Was "Repack checklist".) On a season whose run is `up`, **Start takedown** opens the takedown list: **Pack** (items still `out`, grouped by their home bin: "ATTIC-04 Christmas 4 · 3 still out"; tap **Put back**, or open the bin and pack it, F4), **Check** (F9: items not checked this run), **Bins to put away** (bins `out` → `stored`, scan or tap), and **Tasks** (takedown tasks). Scanning a bin in this view shows that bin's missing items. When nothing is out, it shows "All packed" and **Finish** sets the run to `done` |
| F4 | Pack a bin | On a bin, **Pack**: a list of what's in it, and four ways to add. (a) **Scan** an item label or barcode. (b) **Search**. (c) **From "out"**: items of the bin's season that are out, with their home in this bin first, then others, ticked to put in. (d) **Quick add**: camera first, then name, quantity (with "approx"), category. The season defaults to the bin's. Items added get status `stored` and this bin as home. Moving an item from another bin asks first ("Snowman lights is in A-07. Move it here?") |
| F5 | Unpack | On a bin, **Unpack**: **Take everything out** or tick items. Each chosen item becomes `out` on its usual display, which can be changed once for the batch and per item (displays first, then typed text). The bin can be set to `out` too. Setup photos for those displays (F8) are offered |
| F22 | Displays | **New.** **More › Displays**: add, rename, reorder (setup walk order), remove (clears it from items, after confirming). A display's screen shows its setup photos by season, the items that usually go there (with where they're stored), and the items on it now. The item editor picks a usual display |
| F8 | Setup photos | On a display, photos tagged with a season and caption ("Mantel: garland left to right, stockings in age order"); on a season, setup notes and general photos. Shown when unpacking that season (F5) and from the setup list (F25) |
| F9 | Condition checks | **Check** a single item from its detail, a Pack line, a Put back, or the takedown list's **Check** section: OK, Needs repair, Replace or Toss, with a note; it sets `checkedAt`. Choosing Replace or Toss offers **Add to To buy** (prefilled with the item's name). **Holiday › Needs attention**: every item whose condition isn't `ok`, grouped by season (then "No season"), with its note. Actions: **Fixed** (→ ok), **Replaced** (→ ok, note cleared, optional new value; ticks its To-buy line), **Tossed** (deletes the item after confirming) |
| F24 | To buy | **New.** **Holiday › To buy**: lines grouped by season (then "Any season"), each with its quantity and, if linked, the item's photo and path. Add a typed line, or from an item (F9). Tick when bought; ticked lines move to "Bought" for 30 days, then disappear. Shared through sync. The same list component serves the pantry's Shopping list later (F19) |

### 5.3 Household

| # | Feature | Acceptance criteria |
|---|---|---|
| F12 | Lent out | Item › **Lend…** → a name (recent names offered) and date (default today). Status `lent`. **Lists › Out on loan**: name, item, how long. **Returned** sets it back to `stored`. Lending a bulk line lends the whole line (split it first to lend part, F16) |
| F13 | Records | Item › **Records** section: value, purchase date, model, serial, warranty until, and attachments (manual, receipt, warranty: camera, Photos or Files). **Lists › Warranties ending**: within 60 days, and ended in the last 30. Records also show on Holiday items; the lists are Household's |
| F14 | Insurance export | **More › Export › Insurance inventory**: every item **in both parts** with a value or a photo, by part then area. A ZIP with `insurance.csv` (part, path, name, category, quantity, value, purchase date, model, serial, notes, photo files), and the photos. **Print summary** opens a printable page (totals by part, area and overall, one photo per item) for AirPrint or Save to Files as a PDF |

### 5.4 Everyone

| # | Feature | Acceptance criteria |
|---|---|---|
| F15 | Sign-in and sync | §12. The top bar shows sync state: "Synced 2 min ago", "Offline · 3 changes waiting", "Syncing…", or an attention banner if a change was refused |
| F17 | Activity | **More › Activity**, newest first, for the current part with an "Both parts" option. Filter by person, area, season. Each item, bin and spot detail shows its last 10 entries |
| F18 | Backup and restore | **More › Export › Full backup (ZIP)**, both parts in one file (§7). The reminder is monthly (setting; off allowed), because the server holds the main copy. **Restore** replaces everything on the server with a backup: the confirmation compares server and backup, offers "Back up first", and needs an "I understand this replaces everything" tick. Other phones pick the result up on their next sync. Logged in the activity. Before H5 (no server), Backup and Restore work on the phone as they do now |

### 5.5 Later phase: pantry, kitchen and laundry (Household, not in the first release)

| # | Feature | Acceptance criteria |
|---|---|---|
| F19 | Keep at least and shopping list | Item `keepAtLeast`. When quantity < keepAtLeast, the item is on **Lists › Shopping** (To-buy lines with `part: household`, F24), grouped by area, with the amount needed. Ticking it when bought adds the amount bought. Typed one-off lines can be added |
| F20 | Grocery barcode lookup | Scanning an unknown product barcode while online offers **Look it up**: Open Food Facts (free, no key) prefills name, category guess and photo. Offline, it says lookup needs a signal |

## 6. Confirmations instead of a PIN

There's no PIN, because everyone can do everything (Dan, 2026-11-02). Destructive actions ask to confirm, naming what is affected:

- deleting an item, bin, spot or area (and where contents go);
- deleting a season, display or tag in use;
- moving an item or bin to the other part (§3);
- **Tossed** on Needs attention;
- Restore, which also needs the tick box.

Deleting a bin asks whether its items move to the bin's spot (the default) or are deleted too. Deleted records stay recoverable on the server for 90 days (D6), by restoring a backup or by hand. There is no undo button.

## 7. Backup formats

### Full backup (ZIP): `home-inventory-backup-<yyyy-mm-dd-hhmm>.zip`

One file holds both parts.

| File | Contents |
|---|---|
| `areas.csv` | id, part, name, code, order, notes (a 0.1.2 file's `letter` is read as the old code) |
| `spots.csv` | id, area_id, name, order, notes |
| `bins.csv` | id, part, code, name, spot_id, season_id, tags, state, notes, label_printed_at, label_contents |
| `items.csv` | id, part, name, category, subcategory, bin_id, spot_id, quantity, approx, season_id, display_id, tags, status, out_where, out_display_id, out_since, lent_to, lent_on, condition, condition_note, checked_at, barcode, notes, value, purchase_date, model, serial, warranty_until, keep_at_least |
| `seasons.csv` | id, name, order, color, setup_from, takedown_by, setup_notes |
| `displays.csv` | id, name, order, notes |
| `season_tasks.csv` | id, season_id, phase, text, order |
| `season_runs.csv` | id, season_id, year, setup_from, takedown_by, phase, done_task_ids, started_at, finished_at |
| `to_buy.csv` | id, part, text, quantity, item_id, season_id, done, done_at |
| `tags.csv` | part, name, order |
| `categories.csv` | part, then as FRC §7 |
| `files.csv` | id, owner_type, owner_id, kind, season_id, caption, order, path |
| `photos/`, `files/` | Every photo and attachment at full size |
| `manifest.json` | App name and version, savedAt, record counts per part |

**Rules**
- Tags and id lists are separated by `;`, and a tag can't contain `;`.
- Money is written as dollars with 2 decimals. Dates are ISO; season dates are `MM-DD`.
- Columns are matched by header name. CSV quoting and the UTF-8 / Windows-1252 rules are as in FRC §7.
- Export → restore must round-trip with nothing lost (tested). People and activity aren't in backups. They're kept on the server.
- A 0.1.2 backup (no `part` columns) restores as described in §3, "Upgrading".
- **Data only (CSV):** `items.csv` with the part, path and season added as readable columns, for opening in Excel or Sheets. It isn't restorable.

## 8. Photos

- Several per item, bin, spot, season and display. Take one with the camera or choose from Photos.
- Resized on the phone to about 1600 px on the long side (JPEG, ~250 KB) plus a ~320 px thumbnail.
- Uploaded in the background. "1 photo waiting to upload" appears in the sync state.
- Reorder (the first is the thumbnail), caption and delete from the carousel. Delete asks to confirm.

## 9. QR labels

- **Payload:** `hhi:` + the record id (`hhi:bn-a1b2c3d4`). The `hhi:` prefix separates household labels from product barcodes.
- Labels use the id, so a rename never breaks a label. A bin's code stays the same when it moves (§3).
- Labels don't show the part; the scan opens the right one (F21). Holiday bin labels show the season chip.

| Layout | Bin label | Spot label | Item label |
|---|---|---|---|
| Avery 5163 (2"×4", 10/sheet), **default for bins** | QR, **code large**, name, season chip (Holiday), **contents summary** (up to 6 lines, then "+ n more") | QR, area › spot name | QR, name, path |
| Avery 5160 (1"×2⅝", 30/sheet) | QR, code, name | QR, spot name | QR, name |
| Avery 22805 (1½" square, 24/sheet) | QR, code | QR, spot name | QR, short name |
| Plain paper grid | QR (1", 1½" or 2"), code, name, cut lines | Same | Same |

- Printing a bin label stores `labelPrintedAt` and `labelContents` (§4, "Label out of date").
- **Labels screen** (More › Labels, current part): pick bins, spots or items (or "all bins in an area", in Holiday "all bins in a season", or "bins with out-of-date labels"), then a layout, then print.
- **Printing from an iPhone:** the print page opens the share sheet. **Print** uses AirPrint. **Save to Files** makes a PDF to print from a computer at **Actual size / 100%**.

## 10. Screens and navigation

**Top bar:** the part switch (F21) on main screens, and the sync state (F15).

**Bottom tab bar** (always visible, labels under icons). Each part has its own:

| Tab | Household | Holiday |
|---|---|---|
| 1 | **Find** (home): search, recently viewed | **Season** (home): the lead season's card with its phase and the next step (Start setup / Setup list / Start takedown / Takedown list), **Also now** (the other seasons on now, each with its next step), **Coming up** (F23) |
| 2 | **Browse** (F2) | **Find**: search, recently viewed, shortcuts into Browse |
| 3 | **Scan** (large center button) | **Browse** (F2) |
| 4 | **Lists**: Out on loan, Warranties ending, later Shopping | **Scan** (large button) |
| 5 | **More** | **Lists**: To buy (F24), Needs attention (F9), Out now (items `out`, by display) |
| 6 | | **More** |

Household has five tabs with Scan in the center. Holiday has six, adding its own Browse tab, so Scan sits just right of center there (Dan, 2026-11-04; replaces five tabs in both, 2026-11-03).

**More** (per part): Areas & spots, Categories, Tags, Labels, Export & backup, Activity, Settings, About, Sign out; Holiday adds Seasons and Displays.

Detail screens (item, bin, spot, display):
- a photo carousel at the top;
- breadcrumbs (tap a level to open it);
- status, condition and season chips;
- the contents (bin, spot or display);
- recent activity;
- a sticky bottom action bar with at most 3 buttons plus "More…".

**Mockups** of the part switch, both tab bars, the Holiday home, the setup list, the takedown list and a bin opened across parts were approved by Dan on 2026-11-03: `docs/mockups/h3/` and the H3 design canvas.

## 11. UI conventions

Adapted from FRC §17.

- **Theme:** light. The ground, card, text and fonts are as FRC (Atkinson Hyperlegible body text, Barlow Condensed for headings and numbers).
- **Part colors:** each part has an accent color for its switch segment, top bar, Scan button and primary buttons, so the part is obvious at a glance: **Household rust `#8a3315`** (the app's current brand color) and **Holiday evergreen `#1f4d3a`** (Dan, 2026-11-03). Both are darker than every season color, and neither is used for status or condition.
- **Status chips** use word + icon, never color alone:
  - **Out:** filled blue-gray, arrow-out icon, "OUT · Mantel".
  - **Lent:** outline, hand icon, "LENT · Mike".
  - **Stored:** no chip.
- **Condition chips:**
  - **Needs repair:** amber fill, wrench icon.
  - **Replace:** amber outline, swap icon.
  - **Toss:** black with a red outline, trash icon.
  - **OK:** no chip.
- **Season chips** use the season's palette color with its name. These colors are never used for condition.
- **Destructive buttons:** black with a red outline and the action spelled out (FRC rule).
- **Banners:** navy for information (sync, backup reminder), light amber for attention (a refused change, labels out of date). Never red.
- **Toasts:** one line under the top bar, tap-through, 6 s.
- **Sizes:** touch targets ≥ 48 px, primary actions 56 px, steppers 64 px. Text ≥ 16 px (stops iOS zooming into inputs). Item names 19 px.
- **Reach:** primary actions sit at the bottom of the screen, within thumb reach. The part switch is the one control at the top, because it's used rarely.
- **No sideways swipes for navigation:** iOS uses them for Back, and the photo carousel uses them. The part switch is tapped, not swiped.
- **States:** every list has empty, loading and error states with one clear next step.

## 12. Sync

### 12.1 Model

- **Local-first.** Every change is written to the phone's database at once and added to the **outbox** (record type, id, full new record).
- **Push** sends the outbox in order, in batches. The server assigns `updatedAt` and `updatedBy`, writes the activity entry, and returns the accepted records.
- **Pull:** `GET /api/sync?since=<cursor>` returns every record changed after the cursor (including tombstones) plus a new cursor. Both parts sync together. It runs at launch, after every push, when the app returns to the foreground, and every 2 minutes while open and online.
- **Conflicts:** last write wins per record, in the order the server accepts them (D3, D5). Before a push, the phone pulls first. If a record it's about to push changed on the server since this phone last saw it, the push still wins, but the activity entry notes "overwrote Dan's change from 3:12 PM". Expected to be rare in a family; most likely during setup and takedown, when several people tick the same season's list. Ticking an item out or back is a change to that item only, so two people working the same list rarely touch the same record. `doneTaskIds` on a season run is merged as a set, not overwritten.
- **Validation:** the server rejects malformed records, e.g. an item with both binId and spotId, a link across parts, or a duplicate bin code. A refused change is reverted on the phone to the server's version, with an attention banner naming it.
- **Bin codes** are assigned on the phone. If two phones offline create the same code, the server keeps the first and gives the second the next free number, with an attention banner ("A-05 was taken; your new bin is A-06; reprint its label").
- **First sync of a phone used before H5:** the first phone to sign in uploads its data if the server is empty. Any other phone with local data is asked to choose: **Use the server's data** (local data is kept in a backup file first) or **Upload mine** (only if the server is empty).

### 12.2 Deletes

- A delete is a tombstone (`deleted: true`) that syncs like any change.
- The server purges tombstones and their R2 files after 90 days (D6).
- A phone whose cursor is older than 90 days does a full re-download instead of a pull.

### 12.3 Files

- Photos and attachments upload to `PUT /api/files/<id>` after their record syncs, retrying with backoff.
- They're downloaded on demand (thumbnails during pull).
- Their record shows "waiting to upload" on the phone that took them. Other phones show a placeholder until the upload arrives.

### 12.4 Sign-in

- Cloudflare Access protects the Worker's origin, with an email one-time code and a policy listing the family's email addresses (Dan, 2026-11-03: keep emailed codes). Dan adds or removes an email in the Cloudflare dashboard; HANDOFF gets the steps at H5.
- The Worker reads the Access identity header, maps it to a Person, and creates the Person on first sign-in.
- **H5 starts with a spike on a real iPhone.** It tests sign-in from the home-screen app, the session lasting at least 30 days, and a sync after an offline week.
- **Fallback if the spike fails:**
  - The Worker serves its own sign-in: the email gets a 6-digit code, and the Worker issues a long-lived device token.
  - The allowed emails are then a list in **More › Family**, which anyone signed in can edit.
  - The token is stored in IndexedDB and sent as `Authorization: Bearer`. It's revocable from More › Settings › Devices.
  - Sending the email code then needs an email service. Cloudflare Email Routing can't send arbitrary mail, so the spike also confirms which free sender to use.
- **Signed out or offline:** the app keeps working on local data. Changes wait in the outbox until the person signs in again.

### 12.5 First launch

1. **Welcome**, then **Sign in** (Access). Before H5 there's no sign-in, and the app opens on Set up.
2. A full download, with a progress bar ("Downloading 412 items, 960 photos (thumbnails)").
3. The app opens in the Holiday part's Season tab (the phone then remembers the last part).
4. On a brand-new household (no areas in either part), a short **Set up** step:
   - Load the default categories for both parts, and the default seasons (editable).
   - Add your **Holiday** storage areas, with suggestions: Storage room, Attic, Basement, Crawl space, Shed, Closet.
   - Add your **Household** areas, with suggestions: Garage, Utility room, Attic, Basement, Kitchen, Pantry, Laundry. Either can be skipped and done later from More.

There is no starter catalog: start fresh (Dan, 2026-11-02).

## 13. Out of scope (first release)

- Expiration dates (not chosen).
- Maintenance reminders (not chosen).
- In-app push reminders for season dates (the `.ics` file and the iPhone's Calendar do this, F23).
- Items in two seasons (Dan: one season).
- Items in both parts at once.
- Owner or member roles; every family member can do everything.
- Sharing with people outside the household.
- Android-specific features.
- Importing an existing spreadsheet (start fresh).
- Undo for deletions (recovery is by backup).
- Purchasing, suppliers, prices and budgets (FRC features, removed).

## 14. Hosting and cost

| Resource | Free allowance (approx., to recheck at H5) | Expected use |
|---|---|---|
| Workers requests | 100,000 / day | Hundreds / day |
| D1 storage | 5 GB | < 50 MB |
| R2 storage | 10 GB / month | 1–3 GB |
| Access | 50 users | The family (well under 50) |
| Domain | `*.workers.dev` free | Custom domain optional, ~$10–12/yr at cost through Cloudflare Registrar |

Nothing pauses when unused. If the free tier ever changes, the full backup (F18) is the way out.

## 15. Milestones

Same routine as HANDOFF §4: spec first, a branch per milestone from `main` (never stacked on another PR's branch), tests, a review file, a PR. Versions: the milestone number is the third position.

| # | Milestone | Contents | App version | Target |
|---|---|---|---|---|
| H0 | Spec | v2.0, then this document (v3.0) | | |
| H1 | Strip and rebrand | Done | 0.1.1 | Done |
| H2a | Places, bins, seasons: model | Done (one part) | 0.1.2 | Done |
| H3 | Two parts, find and labels | Mockups first (switch, tab bars, Holiday home, setup and takedown lists; Dan approves). Then schema v3 with `part` (§3), the 0.1.2 upgrade, F21, the two tab bars and Set up, F1, F2, F3, F10, F11 per part, §7 changes. Old H2b is here | 0.1.3 | ~Nov 14 |
| H4 | Holiday setup | Displays (F22), setup list and runs (F25), season tasks, Unpack (F5), setup photos (F8), season calendar and `.ics` (F23). **Usable for Christmas setup on one phone** | 0.1.4 | ~Nov 24 |
| H5 | Sync and sign-in | Sign-in spike, then §12, F15, F17, F18 on the server, Cloudflare deploy. **Independent review in a fresh session** | 0.1.5 | ~mid Dec |
| H6 | Holiday takedown | Takedown list (F6), Pack (F4), condition checks and Needs attention (F9), To buy (F24) | 0.1.6 | Before Christmas takedown (~Jan 1) |
| H7 | Phone UI pass | §10 and §11 on every remaining screen (the Household screens H3–H6 didn't touch), iPhone checks | 0.1.7 | |
| H8 | Garage records | F12–F14 | 0.1.8 | |
| H9 | Pantry (later) | F19, F20 | 0.1.9 | |

**Order** (Dan, 2026-11-03): the split first, then the Holiday setup in time for Christmas, then sync. Until H5, the Holiday part lives on one phone, or is moved between phones with Full backup and Restore (changes made on two phones can't be merged before H5). Takedown (H6) comes after sync, so the whole family can tick the takedown list together. The targets are aims, not promises; if H3 runs long, Find and Browse for Household can move to H7 to protect the H4 date.

## 16. Decision log

| Date | Decision | Who |
|---|---|---|
| 2026-11-02 | All iPhone; Cloudflare free tier; Area › Spot › Bin › Item; must work offline | Dan |
| 2026-11-02 | Holiday: out/packed, setup photos, repair/replace list, contents on labels; one season plus tags; mixed item/bulk lines; Avery sheets | Dan |
| 2026-11-02 | Pantry later (keep at least + shopping list, UPC lookup); tools: lent out, records and attachments, value for insurance; everyone equal, no PIN; activity log | Dan |
| 2026-11-02 | Several photos; pack by scanning the bin then adding items; start fresh; name "Hiebert Home Inventory" | Dan |
| 2026-11-02 | D1–D10 confirmed (plan §8) | Dan |
| 2026-11-02 | Sync before the holiday workflow (Christmas packing); 2 users only; free `workers.dev` address for now; one season per item; value and records fields on every item | Dan. **Superseded 2026-11-03** (order and users) |
| 2026-11-02 | H1 details (a)–(h) accepted (`docs/reviews/H1.md`); app version numbering restarts at 0.1 for the new build | Dan |
| 2026-11-02 | Version scheme: no milestone suffix; the milestone number is the third position (H1 = 0.1.1, H2 = 0.1.2, …) | Dan |
| 2026-11-02 | H2 in two PRs: H2a 0.1.2 and H2b 0.1.3 | Dan. **Superseded 2026-11-03:** H2b folded into H3 (0.1.3) |
| 2026-11-02 | H1 data is upgraded in place; H1 locations become spots in an "Unsorted" area; every §3 item field is stored from H2a | Dan |
| 2026-11-03 | Two parts, Household and Holiday, in **one app with a switch** (not two apps, not a swipe). Holiday storage is completely separate from household storage. Reasons: too cluttered, different workflows | Dan |
| 2026-11-03 | Seasons are Holiday only. Holiday adds display spots, setup/takedown lists, condition checks with a to-buy list, and a season calendar | Dan |
| 2026-11-03 | The family uses both parts, with live sync, offline first, on the Cloudflare free tier; sign-in stays emailed codes (Cloudflare Access) for the family's emails, not a shared household code | Dan |
| 2026-11-03 | Order: split, then sync; the Holiday part usable for Christmas setup by late Nov 2026 (sync may follow). The phone's data is test data. Write SPEC v3.0 before more code | Dan |
| 2026-11-03 | SPEC v3.0 §17 questions 1–8: every proposed answer accepted (area letters across parts, default categories and season dates, moving between parts, setup list order, `.ics` calendar, Holiday tab bar, 0.1.2 upgrade into Household, targets) | Dan |
| 2026-11-03 | H3 mockups approved, with three additions: Household also gets five tabs (Find, Browse, Scan, Lists, More) so Scan sits in the center in both parts; the Holiday home shows every season on now (lead card plus Also now); the "Switched to …" toast has Undo. Part colors: Household rust #8a3315, Holiday evergreen #1f4d3a | Dan |
| 2026-11-03 | H3 details (a)–(l) in `docs/reviews/H3.md` accepted | Dan |
| 2026-11-03 | H4 details (a)–(n) in `docs/reviews/H4.md` accepted (Start setup any time, the home's lead order, setup-list and Unpack behavior, removing displays and seasons, setup photos, Put out / Put back on an item, the calendar file, Find by display) | Dan |
| 2026-11-04 | Holiday gets its own **Browse** tab: six tabs (Season, Find, Browse, Scan, Lists, More), chosen over replacing Lists or Find. The home picker can add areas and spots and offers **Loose in** an area; sample data for testing until 1.0 | Dan |
| 2026-11-03 | Areas get **codes from their names** instead of letters, so bin codes are descriptive: ATTIC-04, STORAGE-12 (1–8 letters, unique across parts, chosen from three options). Supersedes "area letters unique across both parts" (§17 answer 1) | Dan |

## 17. Open questions

The eight questions raised with the draft were settled on 2026-11-03: Dan accepted every proposed answer (decision log). In short: area letters unique across both parts (since replaced by area codes from their names, decision log); the default categories and season dates in §3; items and bins can move between parts, clearing Holiday fields; the setup list order bins → items by display → tasks; the `.ics` calendar file instead of in-app reminders; the Holiday tab bar Season, Find, Scan, Lists, More; the 0.1.2 data upgraded into Household, with H1 backups no longer read; the targets in §15 (Christmas setup from about Nov 25).

To settle during the work:
- The app icon (H3).
- The free email sender, only if the §12.4 fallback is needed (H5 spike).
