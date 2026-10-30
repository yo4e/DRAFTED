# Isolated Chrome verification

Use a separate Chrome profile with only this unpacked extension. Do not alter an everyday profile's settings. Grant access to a disposable writing page and set a small quota, plus one allowed reference URL.

1. Start **TEST DRAFT NOW**. The initial `YOU HAVE BEEN DRAFTED` overlay must show the small upper-left exit button. Click it within the existing 1.8-second overlay duration: the HUD disappears, tab switching stays free, and ARM DRAFTED remains enabled.
2. Start again. Switch to an unrelated tab by single click, double click, repeated clicks, and a long press (at least five seconds). Release the mouse without detaching the tab. Each must return to the manuscript once Chrome permits a tab edit, without duplicate tabs or continuous focus loops.
3. Open an allowed reference URL, including a child path or a newly loading reference tab. It must stay usable. When a return is pending, move to that reference or back to the manuscript: no obsolete return or warning should follow.
4. Switch to another Chrome window and detach a tab into a separate window. The extension must not focus that window or pull the writer back across windows.
5. After a blocked switch, verify the warning's exit button still works. Repeat with the initial button. Wait a few seconds and switch tabs again to check that no delayed retry resumes the ended session.
6. Reach the quota, disable ARM DRAFTED, and change the target URL in separate sessions. Each must cancel enforcement. Also exercise these while an attempted return is pending where possible.
7. Close the drafted tab before discharge. It reopens once with the previous count. Reload it and check that the overlay/HUD still initialize.
8. Repeat the intro and tab-return checks with a scheduled ambush. An ambush while already writing in the focused manuscript should still be consumed silently.
9. Repeat with a disposable Google Docs document to check host permission, iframe key counting, and the actual tab-strip gesture sequence on the target Chrome/macOS version.

`npm test` covers the retry/error/session races deterministically with mocked Chrome APIs and the overlay controls with a small DOM fixture. It cannot establish the native mouse event sequence reported in issue #11.
