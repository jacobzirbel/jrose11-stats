# jrose11 Gen 1 Stat Tracker — Product Spec

> Planning Document — Not yet in development

---

## 1. Overview

A community-maintained stat tracker for jrose11's ongoing Gen 1 Pokémon series, in which he beats the game using a single Pokémon for all 151 Dex entries. The site provides a public-facing dashboard with detailed per-run stats, cross-run analytics, and community contributions.

**Key goals:**
- Track detailed data for each of the 151 runs as videos are released
- Surface cross-run comparisons, rankings, and quirks (Brock difficulty, gym order deviation, badge boost glitch usage, Erika behaviour)
- Support community contributions with a tiered permission model
- Allow trusted contributors to define custom fields that appear on every run
- Sync with jrose11's YouTube playlist to auto-create run stubs as new videos drop

---

## 2. Data Model

### 2.1 Run (core entity)

One Run = one Pokémon's solo playthrough. 151 total when the series is complete.

| Field | Type | Notes |
|---|---|---|
| Pokémon | Reference | Dex #, name, sprite, types |
| YouTube link | URL | Auto-populated via playlist sync |
| Gym order | Ordered list [1–8] | Sequence in which badges were obtained |
| Erika skipped | Boolean | Did he actually skip Erika? |
| Erika joked | Boolean | Did he joke about skipping Erika? |
| Badge boost glitch | Boolean | Only flagged if meaningfully contributed to E4 win |
| Moves used | Array | Typeahead from Gen 1 learnset; each move: name + used (yes/no) |
| Brock finish time | MM:SS | Approximate timestamp of finishing first gym |
| Brock time estimated | Boolean | Flag if exact moment was unclear in video |
| jrose rank | Ordered position + group | Entered from end-of-video ranking; see Section 2.3 |
| Final level | Integer | Seeded from community spreadsheet |
| Completion time | Duration | Seeded from community spreadsheet |
| Community notes | Array | Freeform; flagged entries go to review queue |
| Contributor credit | String | Username of primary contributor |
| Run status | Enum | See Section 2.4 |
| Custom fields | Dynamic | See Section 2.5 |

> Both Erika booleans can be true simultaneously — he jokes about it and still skips, or jokes and still gets the badge. Track them independently.

### 2.2 Pokémon Reference Data

Static, seeded at launch, not user-editable:
- Dex number, name, official sprite
- Type(s) — used for type-based analytics
- All learnable moves in Gen 1 — populates the move typeahead

### 2.3 Ranking Model

jrose11 reveals his ranking at the end of every video, inserting the new run into a ranked, grouped list. The data model needs:
- **Tier group** — named or numbered group (exact naming TBD; see Open Questions)
- **Position within group** — ordered rank within that group

The full list reshuffles as new runs are added, so contributors need to reorder existing entries, not just append. This implies a drag-and-drop ranking UI for contributors.

### 2.4 Run Status

Computed automatically from field completion, but can be manually overridden by a contributor.

| Status | Meaning |
|---|---|
| `stub` | Auto-created from playlist sync — only YouTube link + Pokémon populated |
| `in_progress` | Some fields filled, at least one required field still missing |
| `needs_review` | All core fields present; pending contributor sign-off |
| `complete` | Fully filled and signed off |

The series overview grid is color-coded by this status. When a run is `complete`, it is locked for standard contributors — edits require admin approval or go through the community suggestion workflow.

**Missing field indicator:** on `in_progress` runs, the run page shows exactly which fields are still empty so contributors know what's needed at a glance.

### 2.5 Custom Fields

Trusted contributors can define new fields that appear on every run's page. This allows the community to track things not anticipated at launch (e.g. a new glitch discovered mid-series, a running joke that emerges, etc.).

#### Field definition

| Property | Options |
|---|---|
| Field name | Free text (shown as label on run page) |
| Field type | `boolean`, `text`, `number`, `enum` (dropdown with defined options) |
| Description | Short explanation of what to track (shown as tooltip) |
| Required? | Whether it blocks `complete` status |
| Created by | Trusted contributor username |
| Status | `active` / `deprecated` |

#### Rules
- Only **trusted contributors** (a sub-role between Contributor and Admin) can define new custom fields
- New custom field definitions require **admin approval** before going live
- Once active, a custom field appears on every run page — existing runs show it as empty
- Fields can be **deprecated** (hidden from new entries, retained on existing ones) but not deleted, to preserve historical data
- Custom field values follow the same edit/lock rules as core fields

---

## 3. Pages & Views

### 3.1 Series Overview

Landing page. 151 Pokémon in a grid, color-coded by run status (`stub` / `in_progress` / `needs_review` / `complete`). Includes series completion counter and links to leaderboard and dashboards.

### 3.2 Per-Pokémon Run Page

- Pokémon name, dex #, sprite, types
- YouTube embed or link
- Gym order sequence
- Erika skipped + Erika joked (shown independently)
- Badge boost glitch flag + context note
- Moves used — full Gen 1 learnset with used/not used indicator
- Brock finish time (with estimated flag)
- Final level + completion time
- jrose rank (group + position)
- Contributor credit
- Custom fields (all active fields, in definition order)
- Missing fields indicator (if run is `in_progress`)
- Community notes section

### 3.3 Leaderboard & Comparisons

Sortable/filterable table across all completed runs:
- Sort by: jrose rank, completion time, final level, Brock time
- Filter by: type, glitch used, Erika skipped, Erika joked, tier group
- **Brock-adjusted rank view** — highlights over/underperformers relative to Brock time vs. overall rank
- **Glitch vs. no-glitch comparison** — toggle or side-by-side view

### 3.4 Quirks & Glitch Tracker

Cross-run view of notable flags:
- Badge boost glitch: which runs used it
- Erika tracker (see Dashboard 4.5)
- Gym order deviations: runs that deviated from the standard route

### 3.5 Community Notes

Per-run comment/suggestion thread on each run page:
- Anonymous users can submit — goes to review queue
- Optional account holders: notes are attributed; skip queue if trusted
- Contributors and admins can approve, reject, or pin notes

### 3.6 Custom Field Management (Contributor/Admin only)

- View all active and deprecated custom fields
- Submit new field definition (trusted contributors)
- Approve/reject pending field definitions (admin)
- Deprecate existing fields

---

## 4. Dashboard Views

### 4.1 Series Progress
- X of 151 complete (large counter)
- Completion over time chart

### 4.2 Predicted Rankings
A model predicting where upcoming runs will likely land, based on completed runs. Input signals: Pokémon type(s), type vs. Brock difficulty correlation, glitch eligibility. Improves as more runs complete. Displayed as predicted tier group with confidence indicator. Framed as a fun community feature, not a hard prediction.

### 4.3 Move Analytics
- Physical / Special / Status breakdown across all runs
- Moves never used across the entire series
- Most common final movesets

### 4.4 Gym Order Deviation
- What percentage of runs deviate from standard order?
- Which gyms are most commonly reordered?

### 4.5 Erika Tracker
- Running tally: skipped / joked / both / neither — updated as each run completes
- Trend over time — is the joke rate or skip rate changing?

### 4.6 Brock & Type Difficulty
- Type vs. Brock time correlation
- Brock-adjusted rank vs. raw rank scatter

### 4.7 Glitch Analytics
- Glitch vs. no-glitch rank comparison

### 4.8 Community Activity
- Most discussed runs (by note volume)

---

## 5. Roles & Permissions

| Role | Access | How to get |
|---|---|---|
| Anonymous | Read all; submit community notes (review queue) | No account needed |
| Account | Read all; attributed notes; skip queue if trusted | Self-register |
| Contributor | Create/edit run data; approve/reject notes | Admin-approved |
| Trusted Contributor | All contributor permissions; propose custom field definitions | Admin-elevated |
| Admin | All permissions; manage contributors; approve custom fields; unlock complete runs | Site owner |

Run data is locked once `complete` — edits from contributors require admin approval or go through the community suggestion workflow.

---

## 6. Tech Stack

### 6.1 Recommended Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js (React) | Static + dynamic pages; excellent Vercel integration |
| Database | Supabase (Postgres) | Free tier; built-in auth; row-level security for permissions |
| Auth | Supabase Auth | Email invites for contributors; open read for public |
| Hosting | Vercel | Free tier; auto-deploys from GitHub; pairs with Next.js |
| Sprites | PokéAPI or local static | Gen 1 sprites; no runtime API calls needed |

$0 starting cost. Supabase row-level security handles the full permission model without custom auth middleware.

### 6.2 YouTube Playlist Sync

YouTube Data API v3 (free, requires Google API key). The `playlistItems` endpoint returns per video: title, video ID/link, playlist position, publish date, thumbnail.

**Sync flow:**
- Scheduled job (e.g. daily Vercel cron) calls `playlistItems`
- New videos auto-create a `stub` Run with YouTube link + Pokémon pre-filled
- Stub appears on series overview immediately, ready for a contributor to complete
- Playlist ID extracted from: `youtube.com/playlist?list=XXXXXXX`

---

## 7. Open Questions

| # | Question | Impact |
|---|---|---|
| 1 | How does jrose name his tier groups? Custom names, S/A/B/C, or purely positional? | Ranking data model |
| 2 | Does the full ranked list reshuffle every video, or do new runs just get inserted? | Contributor reorder UX |
| 3 | What's the contributor guideline for "badge boost glitch played a significant role"? | Data consistency |
| 4 | Community note accounts — full email or lighter (username only)? | Auth complexity |
| 5 | Long-term public API goal? Affects early schema decisions. | Architecture |
| 6 | What is the exact YouTube playlist URL for the Gen 1 series? | Sync setup |

---

## 8. Seed Data Plan

A community spreadsheet already tracks **final level** and **completion time** for completed runs. At launch:
- Import both fields for all completed runs from the existing spreadsheet
- Gym order, moves, Erika flags, glitch flag, Brock time, and jrose rank must be entered manually by contributors
- YouTube links + metadata auto-populated via playlist sync

This minimises cold-start contributor burden — the two most data-dense numeric fields come pre-seeded.