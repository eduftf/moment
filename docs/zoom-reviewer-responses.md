# Responses to Zoom Marketplace Reviewer Feedback

Date: March 3, 2026

---

## Note 1: Documentation Content — Sections

**Status: Resolved**

We have created a comprehensive documentation page at:
**https://moment.gtools.space/docs**

The page includes all three required sections:
1. **Adding the App** — step-by-step installation guide for both the Zoom App and the Companion desktop helper
2. **Usage** — detailed description of every feature: Reaction Capture, Peak Detection, Manual Capture, Trigger Settings, Moments List, Meeting Archive, and Settings
3. **Removing the App** — instructions for removing both the Zoom App and Companion, plus a clear explanation of what happens to user data (all data is local, nothing is stored on external servers)

---

## Note 2: Test Plan & App Credentials

**Status: Resolved**

We have prepared a detailed test plan document covering:
- Authorization flow (OAuth installation, callback, opening the app in a meeting)
- Each scope/capability and what it's used for (with a reference table)
- All functionality with step-by-step testing instructions (17 test cases)
- Edge cases and security considerations

**Test Credentials:**
- **Production Client ID:** `oquNvLY1QWa7tEArRu1xow`
- No additional account or credentials are needed — the app uses Zoom's built-in OAuth
- To test: install the app from the Marketplace, download the Companion from [GitHub Releases](https://github.com/eduftf/moment/releases/latest)

The test plan is available as a document and can be shared in the requested format (Google Doc / PDF).

---

## Note 3: Surface Features Selected

**Status: Resolved**

**Yes, the app does run inside Zoom meetings.** Moment is a Zoom App (not a standalone desktop application) that runs as a **sidebar panel inside the Zoom meeting window** via an iframe. It uses the `@zoom/appssdk` to:

- Listen for emoji reactions (`onReaction`, `onEmojiReaction`)
- Track participant changes (`onParticipantChange`)
- Monitor active speakers (`onActiveSpeakerChange`)
- Get meeting context (`getMeetingContext`, `getMeetingUUID`)
- Get user information (`getUserContext`)

The **Meeting** surface selection is correct — Moment opens within the meeting as a sidebar panel.

This is clearly documented in the documentation page (https://moment.gtools.space/docs), specifically in the Usage section under "Opening Moment in a Meeting".

---

## Note 4: Clarification — Your App

**Question:** "Is your app a desktop app that runs external to a Zoom meeting or something that runs from within it?"

**Answer:**

Moment has two components:

1. **Zoom App (in-meeting sidebar)** — This is the main application. It runs **inside the Zoom meeting** as an iframe sidebar panel, loaded via `@zoom/appssdk`. When a user opens Moment from the Apps menu during a meeting, it appears as a sidebar panel on the right side of the meeting window. This component listens for meeting events (reactions, participant changes, speaker changes) and triggers screenshot captures.

2. **Companion (local desktop utility)** — This is a lightweight helper application that runs on the user's local machine. It is **not** a Zoom App — it is a standalone Node.js application that runs a WebSocket server on `localhost:54321`. Its sole purpose is to receive capture commands from the Zoom App sidebar and execute the actual screenshot using the operating system's native screenshot tool (`screencapture` on macOS, PowerShell on Windows). The Companion never connects to Zoom directly.

**In summary:** The Zoom App runs inside the meeting (iframe sidebar). The Companion is a local helper that captures screenshots on the user's computer. They communicate via WebSocket on localhost.

---

## Note 5: Previously Resolved

Already resolved — no action needed.
