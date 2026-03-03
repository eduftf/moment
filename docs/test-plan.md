# Moment — Zoom App Test Plan

## Overview

Moment is a Zoom App that captures screenshots during meetings. It consists of two components:

1. **Zoom App** — a sidebar panel that runs inside Zoom meetings (iframe via `@zoom/appssdk`), listens for meeting events, and sends capture commands.
2. **Companion** — a lightweight desktop application that runs locally on the user's computer, receives capture commands via WebSocket, and takes screenshots using the OS-native screenshot tool.

**App URL:** https://moment.gtools.space
**Documentation:** https://moment.gtools.space/docs
**Companion Download:** https://github.com/eduftf/moment/releases/latest

---

## Prerequisites

- A Zoom account with the Moment app installed
- The Moment Companion app downloaded and running on your computer
- A Zoom meeting with at least one other participant (for reaction/peak triggers)

---

## Test Credentials

**Production Client ID:** `oquNvLY1QWa7tEArRu1xow`

To test the app:
1. Install Moment from the Zoom Marketplace listing
2. Download the Companion from [GitHub Releases](https://github.com/eduftf/moment/releases/latest)
3. No additional account or login is required — Moment uses Zoom's built-in OAuth

---

## 1. Authorization Flow

### Test 1.1: App Installation
1. Go to the Moment listing on Zoom Marketplace
2. Click **Add**
3. Review the requested permissions (in-meeting access)
4. Click **Authorize**
5. **Expected:** App is added to your Zoom account. You see a confirmation page.

### Test 1.2: OAuth Callback
1. After authorizing, the browser redirects to the OAuth callback URL
2. **Expected:** The callback page loads successfully at `moment.gtools.space/auth/callback`

### Test 1.3: Opening the App in a Meeting
1. Start or join a Zoom meeting
2. Click the **Apps** button in the bottom meeting toolbar
3. Select **Moment** from the apps list
4. **Expected:** The Moment sidebar panel opens on the right side of the meeting window. The Zoom SDK initializes and the sidebar shows connection status.

---

## 2. Scopes and Capabilities

Moment requests the `zoomapp:inmeeting` scope, which provides access to the following capabilities:

| Capability | Purpose | How to Test |
|---|---|---|
| `onReaction` | Listen for legacy emoji reactions | Send a legacy reaction during a meeting |
| `onEmojiReaction` | Listen for new emoji reactions | Send an emoji reaction during a meeting |
| `onParticipantChange` | Track participant join/leave events | Have participants join and leave the meeting |
| `onActiveSpeakerChange` | Track who is currently speaking | Multiple participants speak in turn |
| `onFeedbackReaction` | Listen for feedback reactions (raised hand, yes/no) | Use raised hand feature |
| `getMeetingParticipants` | Get current participant list | App displays participant count in status bar |
| `getMeetingContext` | Get meeting topic and ID | Used for naming archive folders |
| `getMeetingUUID` | Get unique meeting identifier | Stored in archive metadata |
| `getUserContext` | Get current user's name and role | Displayed in app status |

### Test 2.1: SDK Initialization
1. Open Moment in a Zoom meeting
2. **Expected:** Status bar shows "Zoom: Connected" and displays your name and participant count.

### Test 2.2: Unsupported API Handling
1. Open Moment in a meeting on a Zoom client version that may not support all APIs
2. **Expected:** App gracefully handles unsupported APIs with console warnings. Core functionality still works.

---

## 3. Functionality Testing

### Test 3.1: Companion Connection
1. Ensure the Companion app is running on your computer
2. Open Moment in a Zoom meeting
3. **Expected:** Status bar shows "Companion: Connected". The companion auto-discovers via WebSocket on `localhost:54321`.

### Test 3.2: Companion Disconnection
1. Open Moment in a meeting with the Companion running
2. Quit the Companion app
3. **Expected:** Status bar changes to "Companion: Not running". After approximately 3 seconds, a setup overlay appears suggesting to download the Companion.

### Test 3.3: Companion Reconnection
1. With Moment open and Companion disconnected, restart the Companion
2. **Expected:** Status bar updates to "Companion: Connected" within 5 seconds (auto-reconnect interval).

---

### Test 3.4: Reaction Capture (Automatic Trigger)
1. Open Moment in a meeting with Companion connected
2. Ensure the "Reaction Capture" toggle is enabled in the sidebar
3. Have a participant send an emoji reaction (e.g., thumbs up, clap, heart)
4. **Expected:** A screenshot is captured. A new moment appears in the Moments list in the sidebar with the reaction emoji, trigger type "reaction", and timestamp. The screenshot PNG file is saved to `~/Moment/{meeting-topic}-{date}/images/`.

### Test 3.5: Reaction Debounce
1. Send multiple emoji reactions rapidly (within 5 seconds)
2. **Expected:** Only one screenshot is captured per 5-second window. Subsequent reactions within the cooldown are ignored.

### Test 3.6: Reaction Emoji Filter
1. Open trigger settings and select specific reactions (e.g., only thumbs up)
2. Send a heart reaction
3. **Expected:** No screenshot is captured (heart is not in the allowed list).
4. Send a thumbs up reaction
5. **Expected:** Screenshot is captured.

---

### Test 3.7: Peak Detection (Automatic Trigger)
1. Open Moment in a meeting with Companion connected
2. Ensure the "Peak Detection" toggle is enabled
3. Start with 2 participants. Have a 3rd participant join.
4. **Expected:** Participant count increases. When count exceeds previous maximum, a screenshot is captured with trigger type "peak".

### Test 3.8: Peak Detection Cooldown
1. After a peak trigger fires, have another participant join within 2 minutes
2. **Expected:** The new peak is recorded, but no screenshot is captured until the 2-minute cooldown expires.

---

### Test 3.9: Manual Capture
1. Open Moment in a meeting with Companion connected
2. Click the **Capture** button in the sidebar
3. **Expected:** A screenshot is captured immediately. A new moment appears in the list with trigger type "manual".

---

### Test 3.10: Moments List
1. Capture several screenshots using different triggers
2. **Expected:** All moments are listed chronologically in the sidebar. Each shows a thumbnail, trigger type (reaction/peak/manual), and timestamp.

### Test 3.11: Delete a Moment
1. In the Moments list, click the delete button on a captured moment
2. **Expected:** The moment is removed from the list and the corresponding PNG file is deleted from disk.

---

### Test 3.12: Meeting Archive
1. Open Moment in a meeting. Capture a few screenshots. End the meeting (or close the Moment sidebar).
2. Navigate to `~/Moment/` on your computer.
3. **Expected:** A folder exists named `{meeting-topic}-{YYYY-MM-DD}/` containing:
   - `archive.html` — open in a browser to see a full event timeline and screenshot gallery
   - `archive.json` — raw event data
   - `images/` — folder with PNG screenshots

### Test 3.13: Archive HTML Viewer
1. Open the `archive.html` file from Test 3.12 in a web browser
2. **Expected:** A self-contained page displays:
   - Meeting header (topic, date, duration)
   - Participant timeline (who joined and left, and when)
   - Event list (reactions, speaker changes, captures)
   - Screenshot gallery with thumbnails

---

### Test 3.14: Settings — Save Location
1. Open Settings in the Moment sidebar
2. Change the save location to a custom folder
3. Capture a screenshot
4. **Expected:** The screenshot is saved to the new custom folder instead of the default `~/Moment/`.

### Test 3.15: Settings — Capture Mode
1. Open Settings and change capture mode (Window / Screen / Video with margins)
2. Capture a screenshot
3. **Expected:** The screenshot reflects the selected capture mode (e.g., full screen vs. Zoom window only).

---

### Test 3.16: Companion Onboarding
1. Open Moment in a meeting without the Companion running
2. Wait 3 seconds
3. **Expected:** An onboarding overlay appears with download links for the Companion app (macOS Apple Silicon, macOS Intel, Windows), explaining what the Companion does.

---

### Test 3.17: Cross-Platform Screenshot Capture
1. **macOS:** Run the Companion and capture a screenshot → uses native `screencapture` command
2. **Windows:** Run the Companion and capture a screenshot → uses PowerShell screen capture
3. **Expected:** Screenshots are captured correctly on each platform.

---

## 4. Privacy and Security

### Test 4.1: Local-Only Data
1. Capture screenshots during a meeting
2. Monitor network traffic
3. **Expected:** No screenshot data is sent to any external server. All data stays on the local machine. The Companion only communicates via `localhost:54321`.

### Test 4.2: WebSocket Security
1. The Companion WebSocket server only accepts connections from localhost
2. **Expected:** External connections to port 54321 are rejected.

---

## 5. Edge Cases

### Test 5.1: No Companion Running
1. Open Moment without the Companion installed or running
2. Try to use reaction/peak/manual triggers
3. **Expected:** The sidebar shows "Companion: Not running" and an onboarding overlay. Triggers still fire and moments are tracked in the sidebar, but marked as "Missed" (no screenshot file saved).

### Test 5.2: Meeting with One Participant
1. Open Moment in a meeting where you are the only participant
2. **Expected:** Peak detection shows 1 participant. Reaction trigger and manual capture work normally.

### Test 5.3: Long Meeting
1. Run Moment for an extended meeting (30+ minutes)
2. **Expected:** All triggers continue to work. Archive accumulates events and screenshots without issues.

---

## Summary

| Feature | Trigger | Expected Behavior |
|---|---|---|
| Reaction Capture | Emoji reaction sent in meeting | Screenshot captured (5s debounce) |
| Peak Detection | New participant maximum reached | Screenshot captured (2min cooldown) |
| Manual Capture | Click "Capture" button | Screenshot captured immediately |
| Meeting Archive | Meeting ends / sidebar closes | HTML + JSON + images saved locally |
| Companion Connection | WebSocket on localhost:54321 | Auto-connect, auto-reconnect |
| Settings | User configuration | Save location, capture mode, emoji filter |
