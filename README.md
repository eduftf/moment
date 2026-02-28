# Moment

A Zoom App that captures screenshots during meetings — triggered by emoji reactions, participant peaks, or a manual click. Every meeting gets a complete archive with participant data, event timeline, and screenshot gallery.

## How it works

1. **Add to Zoom** — Install from the [Zoom Marketplace](https://marketplace.zoom.us/apps/oquNvLY1QWa7tEArRu1xow). Moment appears as a sidebar panel in meetings.
2. **Download Companion** — A lightweight helper app captures screenshots on your machine. Get it from [GitHub Releases](https://github.com/eduftf/moment/releases/latest).
3. **Moments happen** — Screenshots fire on reactions, participant peaks, or manual trigger. Saved to `~/Moment/` as a browsable HTML archive.

## Project structure

```
moment/
├── app/          # Zoom App — React 18 + Vite + TypeScript
├── companion/    # Companion CLI — Node.js + WebSocket
└── docs/         # Setup guides and plans
```

## Development

```bash
npm install                          # Install all workspaces
npm run dev --workspace=app          # Vite dev server (:3000)
npm run dev --workspace=companion    # Companion watch mode
npm run build                        # Build all workspaces
npm test                             # Run all tests
```

Requires [Node.js 22+](https://nodejs.org/) and an [ngrok](https://ngrok.com/) tunnel for local Zoom App development (Zoom requires HTTPS).

## Deploy

- **App**: Auto-deploys to [Cloudflare Pages](https://pages.cloudflare.com/) on push to `main`
- **Companion**: Tag a `v*` release to build binaries for macOS (ARM + Intel), Windows, and Linux via GitHub Actions

## Links

- [Landing page](https://moment.gtools.space)
- [Zoom Marketplace](https://marketplace.zoom.us/apps/oquNvLY1QWa7tEArRu1xow)
- [Support](https://moment.gtools.space/support)

## License

All rights reserved.
