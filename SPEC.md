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

| # | Question | Status | Resolution |
|---|---|---|---|
| 1 | How does jrose name his tier groups? | ✅ Resolved | Color-based groups (exact color names TBD) |
| 2 | Does the full ranked list reshuffle every video, or do new runs just get inserted? | ✅ Resolved | New runs are inserted into the existing list — no full reshuffle |
| 3 | What's the contributor guideline for "badge boost glitch played a significant role"? | ✅ Resolved | Subjective — handled via contributor vote per run |
| 4 | Community note accounts — full email or lighter (username only)? | ✅ Resolved | Username only |
| 5 | Long-term public API goal? | ✅ Resolved | Yes — public API is a goal; schema should be designed with clean REST exposure in mind from the start |
| 6 | What is the exact YouTube playlist URL for the Gen 1 series? | ⏳ Pending | Need URL to configure playlist sync |

### Resolution notes

**Tier groups (Q1):** jrose uses color-coded groups. Store group as a `color` string (e.g. `"green"`, `"yellow"`) on each run. The exact color names should be confirmed from the series before the ranking UI is built. Contributors insert new runs into the existing ordered list within the correct color group — no drag-and-drop reorder of the full list needed.

**Badge boost glitch vote (Q3):** Rather than a single contributor making the call, the glitch flag is set by a simple contributor vote — e.g. majority of 3 votes. Admin can override. This keeps it fair and consistent as more contributors join.

**Public API (Q5):** Design the Postgres schema and Next.js routes with public API exposure in mind from day one. Use clean, stable IDs (dex number as primary key for Pokémon, slugs for runs). A `v1` API prefix on routes costs nothing upfront and avoids a painful migration later.

---

## 8. Data Ingestion

All Pokémon and move data is seeded once via scripts before launch, then stored in the database. No runtime calls to external APIs for this data. YouTube playlist sync runs on a daily cron.

### 8.1 Source: PokéAPI

Free, no auth required. Rate limit: 100 requests/minute. All three scripts run well within this — ~316 total requests with a small delay between calls.

Base URL: `https://pokeapi.co/api/v2/`

### 8.2 Script 1 — Pokémon base data

**Endpoint:** `pokemon/{id}` for id 1–151

**Extract:**
- Dex number, name
- Types (type 1, type 2 if applicable)
- Base stats: HP, Attack, Defense, Special, Speed (Gen 1 has a single Special stat)
- Sprite: `sprites.front_default` (modern) and `sprites.versions.generation-i.red-blue.front_default` (Gen 1 pixel art)

**Output:** seeds `pokemon` table (151 rows)

> Note: Gen 1 uses a single Special stat, not Sp. Atk / Sp. Def. PokéAPI returns the split stats for all gens — store both but display the Gen 1 Special stat in the UI.

### 8.3 Script 2 — Gen 1 move learnset

**Depends on:** Script 1 complete

**Endpoint:** `pokemon/{id}` (reuse Script 1 response) → filter `moves` array to `version_group: red-blue` → for each unique move, hit `move/{id}`

**Extract per move:**
- Name, type, PP, base power
- Damage class (physical / special / status) — note this reflects Gen 3+ split, not Gen 1 type-based mechanic; flag in UI

**Output:** seeds `moves` table (~165 rows) + `pokemon_moves` join table linking each Pokémon to its learnable moves

This join table is what powers the move typeahead on run entry — when a contributor selects a Pokémon, only that Pokémon's Gen 1 learnable moves appear.

### 8.4 Script 3 — YouTube playlist sync

**Endpoint:** `youtube.googleapis.com/youtube/v3/playlistItems`

**Requires:** Google API key (free), playlist ID (⏳ pending — see Open Questions Q6)

**Extract per video:**
- Video title, video ID, playlist position, publish date, thumbnail URL

**Pokémon parsing:** extract Pokémon name from video title via regex. jrose's titles are consistent enough for this — flag any that don't parse cleanly for manual contributor review.

**Output:** creates a `stub` Run record per video with YouTube link + Pokémon pre-filled

**Ongoing sync:** runs daily via Vercel cron — picks up new videos automatically and creates new stubs.

### 8.5 Script 4 — Community spreadsheet import

A community spreadsheet already tracks **final level** and **completion time** for completed runs. One-time import at launch:
- Export spreadsheet as CSV
- Map rows to Pokémon by dex number or name
- Populate `final_level` and `completion_time` on matching Run records

**Output:** pre-populates two fields across all completed runs, reducing contributor workload at launch.

### 8.6 Run order

```
Script 1 (Pokémon)
    ↓
Script 2 (Moves — depends on Pokémon records)
Script 3 (YouTube — independent)
Script 4 (Spreadsheet import — independent, but run after stubs exist)
```

---

## 9. Seed Data Plan

See Section 8 for full ingestion detail. Summary of what is pre-seeded vs. manually entered:

| Field | Source |
|---|---|
| Pokémon base stats + sprites | PokéAPI Script 1 |
| Gen 1 learnsets + move data | PokéAPI Script 2 |
| YouTube links + video metadata | YouTube API Script 3 (ongoing cron) |
| Final level + completion time | Community spreadsheet Script 4 |
| Gym order, moves used, Erika flags, glitch flag, Brock time, jrose rank | Manual contributor entry |

This minimises cold-start contributor burden — the most data-dense fields come pre-seeded.