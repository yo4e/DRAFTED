# DRAFTED

> **YOU HAVE BEEN DRAFTED**  
> **300 KEYSTROKES TO DISCHARGE**

DRAFTED is a tiny Chrome extension that ambushes you with the document you have been avoiding.

At random times outside your excluded hours, DRAFTED opens your configured writing URL. Until you reach your keystroke quota, switching to another tab in that Chrome window sends you straight back.

It does **not** care whether the writing is good. It does **not** even care whether you write meaningful text. If necessary, hit the space bar 300 times and earn your discharge.

The point is not productivity. The point is contact.

## MVP

DRAFTED has four essential settings:

- **Target URL** — the document to open, such as a Google Docs manuscript
- **Keystroke quota** — default: `300`
- **Ambushes per day** — default: `3`
- **Excluded hours** — one or more daily time ranges during which DRAFTED must never activate

The MVP schedules the configured number of ambushes at random eligible times each local calendar day. With the defaults, you can expect three surprise visits per day, each requiring 300 keystrokes to discharge.

When activated:

1. DRAFTED opens the target URL in a new Chrome tab.
2. An in-page overlay appears:

   **YOU HAVE BEEN DRAFTED**  
   **300 KEYSTROKES TO DISCHARGE**

3. Every non-modifier keydown counts as one keystroke. Holding a key down does not auto-farm the counter.
4. A small HUD shows the remaining count.
5. If you switch to another tab in the drafted Chrome window before reaching the quota, DRAFTED immediately returns you to the manuscript tab and shows the warning again.
6. If you close the drafted tab, DRAFTED reopens it and preserves the current count.
7. At zero, the lock is released and DRAFTED displays:

   **DISCHARGED.**

Spaces count. Backspace counts. Arrow keys count. DRAFTED is intentionally not interested in judging what you wrote.

## What DRAFTED is not

- Not a writing app
- Not an editor
- Not a Pomodoro timer
- Not a blocker for the entire operating system
- Not an AI writing assistant
- Not a quality checker

DRAFTED never reads or stores the text you type. The content script sends only a generic keystroke signal; the service worker stores only a numeric count.

Closing Chrome, using another browser/window, or disabling the extension remains a deliberate escape hatch. This is a playful commitment device, not malware.

## Installation

DRAFTED is designed for local installation and will **not** be published to the Chrome Web Store.

1. Download this repository as a ZIP, or clone it with Git.
2. Unzip it if necessary.
3. Open `chrome://extensions/` in Chrome.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the DRAFTED repository directory (the directory containing `manifest.json`).
7. Chrome opens DRAFTED's settings page on first install.
8. Configure a target URL, quota, ambushes per day, excluded hours, then enable **ARM DRAFTED** and save.
9. Approve host access for the configured target origin when Chrome asks.

Updates are manual: download or pull a newer version and click **Reload** on the extension card in `chrome://extensions/`.

The settings page includes **TEST DRAFT NOW**, which starts a session immediately without consuming one of the day's scheduled ambushes.

## Privacy

DRAFTED stays local-first and boring:

- no account
- no analytics
- no telemetry
- no server
- no external API calls
- no document-content collection
- no storage of individual keys pressed

Only settings, scheduling state, and numeric progress are stored locally in Chrome. Live drafting progress uses `chrome.storage.session`, so quitting Chrome intentionally ends the coercive session.

## Development

The extension itself has no build step and no runtime dependencies. Scheduler/settings helpers have Node tests:

```bash
npm test
```

A real Google Docs document still requires manual verification because browser permission and rich-editor event behavior cannot be proven by the Node tests.

## Design

See [`DESIGN.md`](./DESIGN.md) for the MVP technical design and acceptance criteria.

## License

MIT. See [`LICENSE`](./LICENSE).
