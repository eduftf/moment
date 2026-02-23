# Zoom Marketplace Setup Guide

## Prerequisites

- Zoom account (Pro, Business, or Education plan)
- Zoom Marketplace developer access: https://marketplace.zoom.us

## 1. Create the App

1. Go to https://marketplace.zoom.us
2. Navigate to **Develop > Build App**
3. Select **General App** and click **Create**
4. App Name: **Moment**

## 2. Basic Information

- Short description: "Auto-screenshot on thumbs-up reactions and peak participant count"
- Company name: your org name
- Developer contact: your email

## 3. OAuth Configuration

- **Redirect URL**: `https://moment.gtools.space/` (your Cloudflare Pages URL)
- **OAuth Allow List**: `moment.gtools.space`, `localhost`

Save the **Client ID** and **Client Secret** (you'll need them if you add REST API features later).

## 4. Surface: Zoom Meetings

1. Select **Zoom Meetings** as a product
2. **Home URL**: `https://moment.gtools.space/` (production) or your ngrok URL (development)
3. **Domain Allow List**: add all domains your app loads from:
   - `moment.gtools.space`
   - `localhost` (for development)
4. Enable **In-client features** and add SDK capabilities:
   - `onReaction`
   - `onEmojiReaction`
   - `onParticipantChange`
   - `getMeetingParticipants`
   - `getMeetingContext`
   - `getUserContext`

## 5. Scopes

- `zoomapp:inmeeting` (added by default when you select Zoom Meetings)

## 6. Local Testing

1. Go to the **Local Test** page in your app settings
2. Click **Add** to install the app on your Zoom account
3. Open Zoom desktop client
4. Join or start a meeting
5. Click **Apps** in the meeting toolbar
6. Find and open **Moment**

## Development Workflow

### First time setup

```bash
# Install ngrok (if not already installed)
npm install -g ngrok

# Start the dev server
cd /path/to/moment
npm run dev --workspace=app

# In another terminal, start ngrok tunnel
ngrok http 3000
```

### Configure ngrok URL in Marketplace

1. Copy the ngrok HTTPS URL (e.g., `https://abc123.ngrok.io`)
2. Update **Home URL** in Marketplace app settings to this URL
3. Add the ngrok domain to the **Domain Allow List**

Note: Free ngrok URLs change on every restart. Consider a paid plan for a stable subdomain.

### Start the companion (optional)

```bash
# In another terminal
cd /path/to/moment
npm run build --workspace=companion
node companion/dist/index.js
```

The companion will listen on `ws://localhost:54321` and capture screenshots to `~/Moment/`.

### Testing triggers

1. Start/join a Zoom meeting with the app open
2. **Thumbs up**: Click the Reactions button and send a thumbs-up emoji
3. **Peak participants**: Have participants join the meeting
4. Check the Moment sidebar for captured moments
5. If companion is running, check `~/Moment/` for PNG + JSON files
