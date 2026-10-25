# Unified client contract and implementation status

Updated 2026-10-25. This is a coordination note, not a declaration that the Pod has migrated.

## Revisions and ownership

build and all seven isolated production browser/API checks passed. The full
push gate passed 4,564 tests across 230 files, both Drizzle checks and 16
offline importer tests. Syncing the merged bedtime base did not change the tree. SQLite and
transport failure checks used simulated hardware.

Upstream alarm snooze support at `5cb54f2` has been identified for the next
reviewed integration: `snoozeDuration` 60–1800 seconds (default 300) and
`snoozeTaper` 0/30/40/50/60 (default 0). Those fields are **not yet supported** by
this Core revision. The existing bedtime contract must be extended to preserve
them before support can be advertised to the native client. Upstream also has
an owned curve-library API (`PUT /curve-templates`, `POST /curve-templates/active`)
with per-side day claims. It must coexist with complete overnight routine
ownership without silently deleting imported rows. Both integrations need
explicit capability flags so empty alarm/template collections are unambiguous;
legacy fallback remains required until that reviewed integration is published.

## Offline migration and overnight schedule contract

Revision `9ff9cd3` passed 14 importer tests, 398 focused tests and the full
3,832-test related push gate (182 files), TypeScript, full ESLint, both Drizzle
checks and an isolated production build. Importer PR #2 and bedtime PR #3 are now merged into Core main; the latter
adds the complete versioned editor described above.

The Core importer now stages `free-sleep-migration/1` backups into a new review
candidate. It does not deploy a controller or create a Core origin/key. The
older saved snapshot produced 14 disabled power rows and 14 disabled alarms.
The newer installation-recovery snapshot preserves one enabled power routine
and zero enabled alarms; the latest complete-bedtime rehearsal verified all 14
normalized routines against that source. Both are offline evidence only.

Core power responses now include `offDayOffset` (`0` for the same calendar
weekday, `1` for the following weekday). Creates default to `0`; individual and
batch partial updates preserve the stored value. Imported overnight Free Sleep
rows use `1`. Temperature and alarm rows remain **calendar-day events**, so an
01:00 Sunday phase belongs to Saturday's overnight Free Sleep routine but is
stored under Sunday in Core. Clients must preserve this distinction and the
explicit shutdown offset. Existing curve delete/recreate workflows still need
qualification for imported routines before cutover.

The importer retains original biometric metrics and full journal/learning files
under `legacy/`; it does not mix old five-minute averages into Core's live metric
history or claim they are Preview nights. Core's alarm temperature warm-up/hold
also differs from Free Sleep and requires explicit migration review. Candidate
reports always say `readyForCutover: false`. See [Core migration](https://github.com/lucaandrea/sleepypod-core/blob/9ff9cd3/docs/FREE_SLEEP_MIGRATION.md) for
the complete translation and remaining gates.

The working Pod now also has verified off-host installation and Bluetooth-state
archives. All 45,126 installation entries and 70 Bluetooth entries restored into
isolated private directories, and a fresh data backup passed the same importer.
The running Free Sleep, sensor, SSH and Bluetooth processes were unchanged.
This establishes file recovery only: live operational rollback, controller
cutover and a compatible client origin remain pending. See the
[recovery runbook](../scripts/migration/RECOVERY.md); do not provision clients
against Home Assistant or infer physical acceptance from these archives.
