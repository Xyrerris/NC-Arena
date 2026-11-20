# Checkpoint 6 — screen mockups (in progress: stages 1–2)

**2026-11-20.** Mockups are `mockups/screens.html`: one page, dark / light, font scale 1× / 1.3× / 1.5× / 2×, width
360 / 412 dp (toolbar at the top; `?theme=light&fs=2&w=360` also works). It uses the Checkpoint 5 tokens by name and
value, one block per theme, and **the bundled font files** loaded with `@font-face` (the page reports
"fonts: bundled files loaded" only after `document.fonts.load` + `check` succeed). To see the fonts, serve the repo
root (`python -m http.server`) rather than opening the file from disk, because the relative font paths need HTTP.

**Status: stages 1–2.** Roster and its states, player detail, the player form and the "Who are you?" picker are drawn and looked at; the rest is still to do.
This is not yet the Checkpoint 7 review set.

## Roster header: fixed app bar (owner, 2026-11-20)

The title no longer scrolls. Fixed: 56 dp bar with "Arena", the season (below 1.5×) and "+"; a sync strip only while syncing; the
failed-sync banner (fixed below 1.5×, scrolling with the list above it, because at 2× it wraps to four lines and
fixed it would take the fixed chrome to about 43 % of a 728 dp screen). Scrolling: season at ≥ 1.5×, "Updated … · N registered players",
viewer row, search, sort. Measured on the mockup: status + bar + bottom bar = 150 dp at 1×, 163 dp at 2×. **Not yet redrawn:** the
banner's scroll-above-1.5× variant in the mockup (it is still fixed at every scale).

## What stage 1 contains

Roster ready, sync failed, syncing; loading (skeleton), error, empty roster, search with no result. All with the
bottom bar (Option 1), seen in dark and light at 1× and 2× at 360 dp (screenshots looked at, not described from code).

## Findings from looking at it

- **Cinzel digits are proportional** (advance 36–61.5 per 100 px at weight 500, measured in the browser with the real
  file; JetBrains Mono is a constant 60). Closes the open item of Checkpoint 5 §8: the fixed-width, right-aligned
  rank cell is the right call, and the two-digit rank (`01`…`99`) sits well in a column of `2.1 × 20 px × fontScale`.
- **Light theme works** with the Checkpoint 5 values: no failing pair appears (selected chip uses `primary` text).
- **At 2× the header is the whole first screen** (title, season, sync line, count, viewer row, "Update my stats",
  search): it scrolls with the list now, which is the improvement over today's fixed header, but a 2× user must
  scroll before seeing a row. Decision for you at review: keep as is, or collapse the viewer block to one line
  above 1.5×. I would keep it: the viewer's exact and rounded CP must stay visible.
- At 2× the exact CP wraps after "CP" (`CP` / `2,911,004,802`). Acceptable (never clipped), but the label could be
  attached with a non-breaking space; to settle at implementation.

## Controls kept (roster inventory, from `RosterScreen.tsx` / `RosterRow.tsx`)

Season label, sync status (live), count, "New player", viewer card with rounded + exact CP, "Update my stats" /
"Who are you?", search, sort (Rank, CP, My wins), pull-to-refresh, per-row swipe win/loss with its labels and
accessibility actions, record badge, points, sync-error banner with retry, record-error line, loading, error with
retry, empty (with add), search-empty (no add). The viewer card is drawn as a ladder row (flow change 9, approved:
tappable), with "Update my stats" kept as its own action beneath it.

## Stage 2 — detail, form, picker

Drawn (phone area scrolls, so long forms can be read to the end): detail Stats / Vs you / Vs you without avatar /
not found; form new (Level focused), edit of the viewer with a scan note, validation error, sticky-Save **alternate**,
remove dialog; picker ready / nobody. Loading and error of these screens reuse the roster states.

**Controls kept.** Detail: back, Edit, rank, name, identity, exact + rounded CP, tabs, six stats each with exact and
rounded value, the "exact value left · rounded value right" caption (kept: moving it breaks `player-detail.yaml`),
head-to-head note and record, the win/loss stepper (add and remove), six comparison bars with delta and verdict,
no-avatar message. Form: Cancel, "Not you?", eyebrow, scan button with its caption and result notes, eleven fields
with errors, "already on the ladder" and import notices (not yet drawn: see below), save, remove with confirmation.
Picker: Cancel, explanation, candidate rows with the current one marked, nobody state with add.

**Helper-text census (decision 8), `playerFormStrings`.**

| Text                                         | Verdict                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `scoreHint` "Not on the profile screen…"     | Always visible: it tells the user the scan cannot fill this field (ADR-0024)         |
| `scanHint` "Reads a screenshot … deletes it" | Always visible: said _before_ pressing, because the action deletes a file (ADR-0026) |
| `gameCodeHint`                               | "optional" moves into the label; the `#`-added-for-you part shows on focus           |
| `levelHint` "The Lv. beside the name."       | On focus (a locating aid)                                                            |
| `critHint` "113 means 113 %"                 | On focus (a format aid)                                                              |

Upgrade's `bargainHint` / `ceilingHint` and Collection's `categoryHint` / `statsHint` are not in this census yet:
they belong to their screens (phase 3).

**Not drawn yet in this stage:** the "already on the ladder" and import notices in the form, the form's `Saving` state,
the record-error line on the detail, and the `/me` footer sections.

**Findings.** The record stepper reads as two ordinary list rows with 48 dp icon buttons; comparison bars carry their
values and delta as text. The detail screen keeps its caption, so `player-detail.yaml` is untouched by this stage.
`CompareBar`'s exact current geometry was not re-read: the bars are drawn from its role (mine / theirs / delta), to be
matched to the component at implementation.

## Stage 3 — Collection and Upgrade

Drawn: Collection (Collections view, filters open, Offers with one piece selected and the purchase bar, no avatar) and
Upgrade (results with a selection, before reading, read with failures). Both share one pattern: app bar, progress line,
underlined tabs, chips in single scrollers instead of wrapping blocks, hairline rows with a text-plus-check Select
control, and a docked purchase bar. The undecided flow changes are **not** drawn (filters stay an inline panel, the
Upgrade intro stays prose, "Read again" stays in place); the census of `categoryHint` / `statsHint` keeps both visible
(they change what a selection means). Upgrade's `bargainHint` / `ceilingHint` stay with their number fields.

**Controls kept.** Collection: progress and its bar, read time and source, unknown-note, refresh line with retry,
inventory note, three views, filters (status, category + equipment type, rewards, reset), sort, skill legend, rows
(title, count, status, bonus, owned summary, items with skill mark and owned tag, market note, "Find on market",
action), offers (intro, notices, Find / Stop / Read again, progress, sorts, level chips, under-standard, overpriced
toggle, failed + retry, to-top, rows with Select, purchase bar). Upgrade: intro, Find / Stop / Read again / Retry
failed, grade-7 toggle, status, grade and slot chips, only-raised, ceilings and bargains (with number fields), left-out
notices, rows with band and Select, Add all bargains, to-top, purchase bar with note, Plan an upgrade.

**Finding that needs your decision: the purchase bar.** Measured in the mockup, the docked bar is 147 dp at 1× and
**414 dp at 2×** of a 728 dp screen (57 %); with the 163 dp of fixed chrome, 79 % of the screen is fixed at 2× and the
list is almost gone. (Today's bar has the same content; this is not a regression, but the redesign should not carry it
over.) Options: **A** keep the bar as is (nothing changes, 2× stays poor); **B** below 1.5× show the full bar, from 1.5×
show only the title line and "Buy the selection", with balance and note in the review sheet that already follows
(moves prose into a sheet: a flow change, needs your OK); **C** from 1.5× the bar is no longer docked but is the last
item of the list. I recommend **B**.

**Correction (2026-11-20, after reading `UpgradeScreen.tsx` and `useUpgradeMarket.ts`).** The Upgrade figures above were
drawn from `strings.ts` and the paragraph "Controls kept" for Upgrade was not an inventory of the component. Errors
found: (1) before a read **every control is already on screen** (Grade 7, grade and slot chips, Only raised, Ceilings,
Bargains, Plan, the idle notice): the "before reading" figure wrongly removed them; (2) grade chips derive from the
candidates (grade 7 and above, not 4–6); (3) the Upgrade purchase bar has **no balance / "would leave" line** (that is
the Offers bar): title, note, Buy, Clear only; (4) after a read the filled Find button becomes "Read again" and sits
beside a filled Buy, which breaks the one-filled-action rule: it should turn secondary once results exist; (5) the row
detail also carries "NCG per +0 piece"; (6) Plan an upgrade is disabled until something has been read; (7) the toggles
change label by state (`GRADE 7 ON/OFF`, `ONLY RAISED` / `ALL LEVELS`), so turning them into check chips is copy and
test impact. Facts that matter for the open question on thresholds: **Grade 7 scopes the read** — changing it changes
the candidate set, which discards the current reading (phase back to idle, results cleared) and is not disabled while
running; grade and slot filter what is already read; ceilings and bargains are free text that re-rank the existing read
instantly and have defaults; they are plain component state. These Upgrade figures are to be redrawn.

**Decision (owner, 2026-11-20): purchase bar = option B.** Below 1.5× the full bar; from 1.5× only the title line, Buy and
Clear, with the balance and the note moved to the review sheet (a flow change, approved). Applied to both purchase bars in
the mockup. Measured on a 728 dp screen: Upgrade's bar 126 dp at 1×, 205 dp at 2× (it was 414 dp at 2× before, with
the balance line and the note that the Upgrade bar never had); the Offers bar still carries its balance line below 1.5×.

**Upgrade redrawn (2026-11-20).** Corrected as-built figure (all controls present before a read, Plan disabled, Find
secondary once results exist, real bar content, grades 7+), plus **labelled alternates that need approval**: three
levels (Grade 7 beside Find with a note that it clears the read; "Ceilings and bargains" as one collapsed line with a
summary, available before any read; grade, slot and Only raised as view filters, also before a read), the expanded block
(per grade a ceiling and a bargain field, hints visible) and the results figure. Collapsed block measured at 48 dp
at 1× and 59 dp at 2×. New copy to list for the owner: "Ceilings and bargains · default" summary, "Changing grade 7
clears what has been read."; test impact: the toggles' labels and testIDs (`upgrade-ceilings-toggle`,
`upgrade-bargains-toggle`) move if the alternate is approved. Collection Offers is still to be reconciled with this.

**Owner's correction (2026-11-20): "before reading" stays minimal.** In the alternate, before a read the screen holds
only the intro, Find, Grade 7 (with its note) and the collapsed "Ceilings and bargains · default" line with Edit. The
view filters (grade, slot, Only raised) and "Plan an upgrade" are removed from this state, since they act on nothing
until a read exists, and appear only in the after-read alternate. This is a flow change (Plan and the filters hidden
until results), so it still needs approval; the as-built figure keeps everything visible.

**Collection completed (2026-11-20), read from `CollectionScreen.tsx`, `OffersView.tsx`, `strings.ts`.** Now drawn: Items
view (kind headings, piece lines, unlisted note), empty states, header notices (chain failed with retry, inventory,
unknown collections, sample data), reading lines, the game-data loading and failure screens, and Offers in all its states
(before reading, reading with Stop, results with a selection, notices with "↑ Top", nothing to find).

- **Offers needs no flow change.** As built, the header filters are the scope of the read, and sort, level and "Under
  standard" appear only once offers exist, so Offers already works as "scope, then read". The earlier Offers figure
  was wrong in omitting the shared header and in showing sort chips as if always present; replaced. This is also the
  pattern the Upgrade alternate proposes.
- **Row targets:** an Offers row opens the offer card; the Select control toggles the selection (Upgrade rows toggle
  on the whole row). Kept as built; drawn with the Select control only.
- **Offers purchase bar** keeps its real lines (units, balance, raise, note); from 1.5× only title, Buy and Clear
  (option B). Measured 205 dp at 2× on 740 dp (28 %). At 1× it is tall with every line present, which is today's content.
- **Today's header does not scroll** (a stated implementation reason: controls in a recycled list header). The mockups
  scroll it with the list, as for the roster; at implementation the app bar and tabs stay fixed and the rest goes in the
  list header, with the same recycling care the roster needed.
- **To flag (copy, your call):** the Items "other" family heading reads `Items Costume…`, which looks truncated. The
  "↑ Top" pill floats over the last row text at 2×; acceptable as built, to place with a bottom inset at implementation.
- **Not drawn:** the market sheet and offer sheet (next, with the other sheets), Collections rows with partial owned
  counts and "Not sold on the market" (row states not yet drawn).

## Stage 4 — sheets and the planner (2026-11-20)

Drawn (section 8 of the mockup, 15 figures), read from `MarketSheet`, `OfferSheet`, `PurchaseCard`, `PurchaseTry`,
`BatchSheet`, `PlannerSheet` and their strings: market sheet (listings, reading / waiting / nothing / not sold,
failed), offer sheet (several lots), purchase card (dry run, live, confirmation, every state), batch sheet (ready,
confirmation, stopped, other lines), planner (choose, plan, other cases).

**One pattern for all of them:** a bottom sheet on the Checkpoint 5 `scrim`, `raised` surface, rounded top, the title
in the heading role and "Close" as a text action (it is a secondary button today); the body scrolls; one filled action
per sheet; Cancel and Back are text actions; negative text always carries the icon. Today's sheets have no scrim
("the design system has no overlay colour"): Checkpoint 5 now defines one, so this is a visual change only.

**Copy and census.** The passphrase hint ("Used once to sign, then forgotten. It is never saved.") stays **always
visible**: it says, before you type, that the secret is not kept. The live "Buy for real (price)" and "Confirm and pay
(price)" keep the amount in the label; only the confirmation button pays. No wording changes in this stage (uppercase
labels become sentence case, as everywhere).

**Findings from looking at it at 2×:** every sheet except the shortest scrolls inside its body (as intended), but in the
confirmations the **paying button falls below the fold** (935 dp of content in a 507 dp body). Recommendation, needs
your OK: from 1.5× the one filled action of a sheet is pinned at the bottom of the sheet (as the sticky-Save alternate
in the form). The mockup first clipped the pay button to two lines at 2× because the flex children shrank; fixed
(buttons grow, 72 dp at 2×), and a rule for the implementation: **buttons wrap, never clip**. The title and "Close" also
stack at 2× ("Before buying" wraps in the heading role); acceptable.

**Not re-read from code:** the listing detail line (`toListingUi`: CP, seller, lot) is composed from the strings; the
exact wording of `describeStep` rows. Both to match at implementation.

## Stage 5 — You, account, boot and the remaining notices (2026-11-20)

Drawn (section 9 of the mockup, 14 figures), read from `KeystoreSection`, `ViewerAvatarSection`,
`RosterBackupControls`, `AccountConnectPrompt`, `AccountSetupScreen`, `+not-found`, `_layout` (BootFailure),
`PlayerDetailScreen` and the form strings: avatar section (idle and every state), keystore (empty, stored), limits and
the real-purchase switch, unsettled purchases, offline notice and backup with its replace dialog, the account gate
(ask, error and working, secrets), boot failure, not found, form and picker notices, the detail record error.

- **The `/me` footer loses its boxes.** Today each section is a bordered, filled card with an uppercase eyebrow; they
  become hairline-separated sections with a sentence-case label (label role). No section has a filled action: the
  screen's one filled action is the form's Save above. The one exception is a transient decision inside a section
  ("Yes, this is me"), which is filled while it is the only decision on view.
- **Avatar confirmation is a sheet (owner, 2026-11-20).** After "Save avatar" the checking line, "Is this you?" with
  "Yes, this is me" / "Change", the unchecked case ("Save without checking" / "Cancel") and the failures open in a
  sheet, as in stage 4. On the page stay only the format error under the field (before any check) and the "Saved" note.
- **Real purchases: switch on top, confirmation in a sheet (owner, 2026-11-20).** The section is now "Purchases" (new
  label, was "Purchase limits"): the real-purchase line and its button come first, the limits below a hairline.
  Turning them on opens a sheet with the warning and "Yes, turn them on" as negative text with Cancel as text (it arms
  paying but does not pay; only the purchase confirmation's amount button is filled, stage 4). Turning off needs no
  confirmation. The ON line is negative text.
- **Helper-text census (decision 8), this stage:** all of these stay visible, because each says something before an
  action with a consequence: the keystore section hint and passphrase hint ("never saved"), the paste hint, the limit
  hints ("with no limit, nothing can be bought"), the unsettled-purchases explanation, the gate's recovery-code hint
  (it explains the empty-versus-filled choice) and the skip hint, the backup stakes sentence. Nothing here moves to
  focus-only. The avatar address hint ("0x followed by 40 characters") is a format aid and could move to focus; left
  visible since the field starts empty and the format is the whole task.
- **At 2×** the gate and the secrets screen scroll (they are a `ScrollView` already); no button clips. On the secrets
  screen the long warning pushes "I have written it down" below the first screen: acceptable, since the point is that
  it is read before.
- **Boot failure has no action** today; a "Try again" would be a flow change, not drawn (observation only).
- **Catalogue (debug / visual-gate screen) is not redrawn**: it is not a user screen and takes the new tokens through
  the components. Its Maestro baselines will need regenerating with the rest.
- **Wording composed, not re-read from code:** the stored-keystore line, the "opened" results, the unsettled entry line,
  the backup stakes sentence and success/failure messages, the boot-failure message. Match at implementation.

**Checkpoint 6 is now fully drawn.** Before Checkpoint 7 (advisor review of all mockups, then your approval) the
decisions that need your OK should be listed once, in one place.

## Still to do (inventory still to be taken from the components)

The four sheets and the planner, account gate, keystore /
avatar / backup sections, BootFailure / not-found, Catalogue. For each: read the `*Screen.tsx` and `*UiState.ts`,
list every control and state, draw all of them. The undecided flow changes (filters in a sheet, prose into info
sheets, "Read again" in a toolbar, sticky Save) are **drawn in the visual-only layout by default**, with the flow
version as a labelled alternate.

## Copy and test impact noted so far

Sentence case means editing strings stored in uppercase (`RETRY`, the season label, the sort chips `RANK` / `CP` /
`MY WINS`, `TRY AGAIN`) and the tests that assert them. New copy so far: none (the mockup uses existing strings;
"Retry" / "Try again" are the sentence-case forms of existing ones).
