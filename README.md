# DRAFTED

> **YOU HAVE BEEN DRAFTED**  
> **300 KEYSTROKES TO DISCHARGE**

DRAFTED is a tiny Chrome extension that ambushes you with the document you have been avoiding.

At random eligible times, DRAFTED opens your configured writing URL. Until you reach your keystroke quota, switching to another tab in that Chrome window sends you straight back — unless the destination matches one of your allowed reference URLs.

It does **not** care whether the writing is good. It does **not** even care whether you write meaningful text. If necessary, hit the space bar 300 times and earn your discharge.

The point is not productivity. The point is contact.

Current release: **v1.1.0**. See [`CHANGELOG.md`](./CHANGELOG.md) for release history.

## Quick start

1. Set your manuscript as the **Target URL**.
2. Add plot notes or research pages under **Allowed reference URLs** so you can consult them during a draft.
3. Choose active weekdays, excluded hours, ambushes per day, and the keystroke quota.
4. Turn on **ARM DRAFTED** and save. Random activation times stay hidden.
5. When drafted, type until the HUD reaches zero. You can drag the HUD anywhere and DRAFTED remembers its position.
6. If something genuinely urgent happens, try to leave the manuscript: the `YOU ARE STILL DRAFTED` warning includes a tiny emergency-exit icon at its upper-left. Use it to end only the current session.

Use **TEST DRAFT NOW** to verify the setup without consuming a scheduled ambush.

## Settings

DRAFTED has six essential settings:

- **Target URL** — the document to open, such as a Google Docs manuscript
- **Allowed reference URLs** — optional plot, notes, setting, timeline, or research pages that remain reachable during a draft
- **Active days** — choose which weekdays may schedule ambushes; all seven are enabled by default
- **Keystroke quota** — default: `300`
- **Ambushes per day** — default: `3`
- **Excluded hours** — one or more daily local-time ranges during which DRAFTED must never activate

## Scheduling

DRAFTED does not roll a percentage chance every minute. It chooses the configured number of random eligible future minutes for the current local day and schedules ambushes there.

If Chrome was closed when a scheduled time passed, DRAFTED reconciles the day on the next browser startup: stale times are discarded and the remaining unstarted ambushes are rescheduled into eligible future minutes that day. If there are not enough eligible minutes left — for example late at night or after exclusions consume the rest of the day — the day may end with fewer ambushes than configured.

Inactive weekdays schedule none. **TEST DRAFT NOW** still works on inactive days and does not consume a scheduled ambush.

## When activated

1. DRAFTED opens the target URL in a new Chrome tab.
2. An in-page overlay appears:

   **YOU HAVE BEEN DRAFTED**  
   **300 KEYSTROKES TO DISCHARGE**

3. Every non-modifier keydown counts as one keystroke. Holding a key down does not auto-farm the counter.
4. A small HUD shows the remaining count. Drag the HUD anywhere on the page; its position is remembered.
5. If you switch to another tab in the drafted Chrome window before reaching the quota, DRAFTED immediately returns you to the manuscript unless that tab matches an allowed reference URL.
6. If you close the drafted tab, DRAFTED reopens it and preserves the current count.
7. At zero, the HUD briefly reads `DISCHARGED.` and quietly fades away, leaving you in the manuscript if you want to keep writing.
8. When DRAFTED blocks a tab switch, the `YOU ARE STILL DRAFTED` warning includes a tiny emergency-exit control at its upper-left. It immediately ends the current session without disarming future scheduled ambushes.

Spaces count. Backspace counts. Arrow keys count. DRAFTED is intentionally not interested in judging what you wrote.

## What DRAFTED is not

- Not a writing app
- Not an editor
- Not a Pomodoro timer
- Not a blocker for the entire operating system
- Not an AI writing assistant
- Not a quality checker

DRAFTED never reads or stores the text you type. The content script sends only a generic keystroke signal; the service worker stores only a numeric count.

Closing Chrome, using another browser/window, disabling the extension, or using the warning-overlay emergency exit remains a deliberate escape hatch. The emergency exit ends only the current drafting session; DRAFTED stays armed for later scheduled ambushes. This is a playful commitment device, not malware.

## Installation

DRAFTED is designed for local installation and is **not** published to the Chrome Web Store.

1. Open [Releases](https://github.com/yo4e/DRAFTED/releases/latest) and download `DRAFTED-v1.1.0.zip`.
2. Unzip it.
3. Open `chrome://extensions/` in Chrome.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted `DRAFTED-v1.1.0` directory — the directory containing `manifest.json`.
7. Chrome opens DRAFTED's settings page on first install.
8. Configure the target URL, optional allowed reference URLs, active days, quota, ambushes per day, and excluded hours.
9. Turn on **ARM DRAFTED**, save, and approve host access for the configured target origin when Chrome asks.

Developers can alternatively clone the repository and load the repository directory directly.

Updates are manual: download a newer release, replace the extracted files, and click **Reload** on the extension card in `chrome://extensions/`.

## Privacy

DRAFTED stays local-first and boring:

- no account
- no analytics
- no telemetry
- no server
- no external API calls
- no document-content collection
- no storage of individual keys pressed

Only settings, scheduling state, numeric progress, and the HUD position are stored locally in Chrome. Live drafting progress uses `chrome.storage.session`, so quitting Chrome intentionally ends the coercive session.

## Development

The extension itself has no build step and no runtime dependencies. Scheduler/settings helpers have Node tests:

```bash
npm test
```

A real Google Docs document still requires manual verification because browser permission and rich-editor event behavior cannot be proven by the Node tests. v1.1.0 was also hands-on tested in Chrome before packaging.

## Design

See [`DESIGN.md`](./DESIGN.md) for the original MVP technical design and acceptance criteria. The current implementation also includes allowed reference URLs, selectable active weekdays, a draggable HUD, quiet discharge behavior, an emergency exit, and military-inspired visual styling added after hands-on use.

## License

MIT. See [`LICENSE`](./LICENSE).
