# Changelog

## v1.1.0 — 2026-09-01

Usability-focused release shaped by hands-on writing use.

### Added

- Allowed reference URLs for plot notes, research, timelines, and other safe tabs during a draft
- Per-weekday scheduling controls
- Draggable remaining-keystroke HUD with remembered position
- Military-inspired olive/khaki styling and extension icons
- Emergency exit shown only on the `YOU ARE STILL DRAFTED` blocked-tab warning
- Expanded settings-page field manual and extension description

### Changed

- Completion is quiet: the HUD briefly shows `DISCHARGED.` and fades instead of interrupting writing with a full-screen message
- Allowed URL matching tolerates query/hash noise while respecting origin and path boundaries
- Existing settings migrate with all weekdays enabled so previous scheduling behavior is preserved
- README now documents scheduling/reconciliation behavior and the v1.1.0 installation flow

### Fixed

- HUD dragging no longer stretches the counter across the page when moved
- Emergency exit no longer sits permanently over the manuscript

### Verification

- Scheduler/settings helper tests: 9/9 passing before the release pass
- Browser syntax checks passed during implementation
- Core v1.1 behavior, HUD dragging, and emergency-exit placement were manually verified in Chrome before packaging

## v1.0.0 — 2026-09-01

First MVP release.

- Random daily drafting ambushes outside excluded hours
- Target URL and keystroke quota
- Tab-return enforcement within the drafted Chrome window
- Drafted-tab reopening with progress preserved
- Local-only settings/progress model
- `TEST DRAFT NOW` for immediate manual verification
