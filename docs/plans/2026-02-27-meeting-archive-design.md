# Meeting Archive Design

## Goal

Transform Moment from a screenshot tool into a Meeting Archive system. Each meeting produces a single, beautiful, self-contained archive with all meeting data and screenshots.

## Archive Contents

Each meeting produces a folder:

```
~/Moment/{topic}-{YYYY-MM-DD}/
├── archive.html          # Self-contained viewer (real-time updated)
├── archive.json          # Machine-readable event log
└── images/
    └── {HH-mm-ss}_{trigger}.png
```

## Data Captured

| Data | SDK API | Frequency |
|------|---------|-----------|
| Meeting info (topic, ID, UUID) | `getMeetingContext()`, `getMeetingUUID()` | Once at start |
| Participant timeline | `onParticipantChange()` | Every join/leave |
| Active speaker | `onActiveSpeakerChange()` | Every speaker change |
| Emoji reactions | `onEmojiReaction()` | Every reaction |
| Feedback reactions | `onFeedbackReaction()` | Raised hand, yes/no, etc. |
| Screenshots | `screencapture` via companion | On trigger |

**Not available** (Zoom SDK limitation): in-meeting chat, transcription.

## Trigger System

- **Reaction trigger**: any emoji reaction by default. Configurable — user picks which emojis trigger screenshots in settings.
- **Peak trigger**: unchanged (new participant max, 2min cooldown).
- **Manual trigger**: unchanged (button click).

## Archive Lifecycle

1. App detects `inMeeting` context → sends `start-archive` to companion.
2. Companion creates meeting folder, empty `archive.json`, initial `archive.html`.
3. As events happen, app sends `archive-event` messages to companion.
4. Companion appends to `archive.json` and regenerates `archive.html`.
5. Meeting ends or app closes → sends `end-archive`. Archive is already complete.

## WebSocket Protocol Changes

### New Messages (App → Companion)

```typescript
{ type: "start-archive", meetingTopic: string, meetingId: string, meetingUUID: string, startTime: string }
{ type: "archive-event", event: ArchiveEvent }
{ type: "end-archive" }
```

### ArchiveEvent Types

```typescript
type ArchiveEvent =
  | { type: "participant-join", timestamp: string, name: string, uuid: string, role: string }
  | { type: "participant-leave", timestamp: string, name: string, uuid: string }
  | { type: "reaction", timestamp: string, name: string, uuid: string, emoji: string, unicode: string }
  | { type: "feedback", timestamp: string, name: string, uuid: string, feedback: string }
  | { type: "speaker-change", timestamp: string, speakers: Array<{ name: string, uuid: string }> }
  | { type: "screenshot", timestamp: string, trigger: string, filename: string, participantCount: number }
```

### New Messages (Companion → App)

```typescript
{ type: "archive-started", path: string }
{ type: "archive-updated" }
```

### Existing Messages (unchanged)

`capture`, `captured`, `config`, `update-config`, `get-config`, `error`

## archive.json Schema

```typescript
{
  meeting: {
    topic: string,
    id: string,
    uuid: string,
    startTime: string,
    endTime: string | null,
    duration: number | null  // seconds
  },
  events: ArchiveEvent[],
  screenshots: Array<{
    filename: string,
    timestamp: string,
    trigger: string,
    participantCount: number
  }>
}
```

## HTML Archive

Self-contained single-page viewer. Pure HTML + CSS + inline JS, no external dependencies. Opens in any browser.

Sections:
- Meeting header: topic, date, duration, participant count
- Participant list with join/leave times
- Event timeline (reactions, speaker changes, screenshots inline)
- Screenshot gallery with thumbnails

The HTML references images relatively (`./images/...`).

Regenerated on every data update by the companion (template + JSON data → HTML).

## In-App Gallery (Zoom Sidebar)

The MomentsList component becomes a meeting timeline:
- Header: meeting topic, duration, live participant count
- Scrollable list of screenshot cards
- Tap card to expand full-width preview
- Delete button removes image from disk and updates archive
- Fade-in animation for new entries

## Settings Changes

New section: "Reaction triggers"
- List of common Zoom reactions with toggle switches
- Default: all enabled
- Stored in companion config and synced via WebSocket

Existing settings unchanged: capture mode, save folder.

## Files to Modify

### Companion (`companion/src/`)
- `index.ts` — archive lifecycle, new message handlers, HTML generation
- `utils.ts` — add HTML template generation
- New: `archive-template.ts` — HTML template string

### App (`app/src/`)
- `types.ts` — new ArchiveEvent types, updated Moment type
- `hooks/useCompanion.ts` — new archive messages, archive state
- `hooks/useReactionTrigger.ts` — expand to all reactions, configurable list
- `hooks/useZoomSdk.ts` — register onActiveSpeakerChange, onFeedbackReaction
- New: `hooks/useArchive.ts` — archive lifecycle orchestration
- `components/MomentsList.tsx` — redesign as timeline/gallery
- `components/TriggerSettings.tsx` — reaction emoji picker
- `components/Settings.tsx` — show archive path
- `App.tsx` — integrate archive lifecycle
- `App.css` — new gallery styles
