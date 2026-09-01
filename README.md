# DRAFTED

> **YOU HAVE BEEN DRAFTED**  
> **300 KEYSTROKES TO DISCHARGE**

DRAFTED is a tiny Chrome extension that ambushes you with the document you have been avoiding.

At random times outside your excluded hours, DRAFTED opens your configured writing URL. Until you reach your keystroke quota, switching to another tab sends you straight back.

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
5. If you switch to another tab before reaching the quota, DRAFTED immediately returns you to the manuscript tab and shows the warning again.
6. If you close the drafted tab, DRAFTED reopens it and preserves the current count.
7. At zero, the lock is released and DRAFTED displays:

   **DISCHARGED.**

Spaces count. Backspace counts. Arrow keys may count. DRAFTED is intentionally not interested in judging what you wrote.

## What DRAFTED is not

- Not a writing app
- Not an editor
- Not a Pomodoro timer
- Not a blocker for the entire operating system
- Not an AI writing assistant
- Not a quality checker

DRAFTED never reads or stores the text you type. It only increments a counter on keydown events.

Closing Chrome, using another browser/window, or disabling the extension remains a deliberate escape hatch. This is a playful commitment device, not malware.

## Installation

DRAFTED will **not** be published to the Chrome Web Store.

Once the extension is implemented:

1. Download this repository as a ZIP, or clone it with Git.
2. Unzip it if necessary.
3. Open `chrome://extensions/` in Chrome.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the DRAFTED extension directory.
7. Open DRAFTED's settings and configure your document URL, quota, ambushes per day, and excluded hours.

Updates are manual: download or pull a newer version from this repository and reload the extension.

## Privacy

DRAFTED should remain local-first and boring:

- no account
- no analytics
- no telemetry
- no server
- no document-content collection
- no storage of individual keys pressed

Only settings, scheduling state, and numeric progress are stored locally in Chrome.

## Design

See [`DESIGN.md`](./DESIGN.md) for the MVP technical design and acceptance criteria.

## License

MIT. See [`LICENSE`](./LICENSE).
