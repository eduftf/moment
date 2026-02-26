// companion/src/archive-template.ts

interface ArchiveData {
  meeting: {
    topic: string;
    id: string;
    uuid: string;
    startTime: string;
    endTime: string | null;
  };
  events: any[];
  screenshots: Array<{
    filename: string;
    timestamp: string;
    trigger: string;
    participantCount: number;
  }>;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "In progress";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  if (hrs > 0) return `${hrs}h ${m}m`;
  return `${m}m`;
}

function triggerColor(trigger: string): string {
  switch (trigger) {
    case "reaction":
      return "#f59e0b";
    case "peak":
      return "#06b6d4";
    case "manual":
      return "#8b5cf6";
    default:
      return "#6366f1";
  }
}

function eventColor(type: string): string {
  switch (type) {
    case "join":
      return "#10b981";
    case "leave":
      return "#ef4444";
    case "reaction":
      return "#f59e0b";
    case "speaker":
      return "#06b6d4";
    case "screenshot":
      return "#8b5cf6";
    default:
      return "#6366f1";
  }
}

function eventIcon(type: string): string {
  switch (type) {
    case "join":
      return "&#x2192;";
    case "leave":
      return "&#x2190;";
    case "reaction":
      return "&#x1F44D;";
    case "speaker":
      return "&#x1F3A4;";
    case "screenshot":
      return "&#x1F4F7;";
    default:
      return "&#x2022;";
  }
}

function buildParticipantsHtml(events: any[]): string {
  const participants = new Map<
    string,
    { name: string; role: string; joined: string; left: string | null }
  >();

  for (const ev of events) {
    if (ev.type === "join" && ev.name) {
      if (!participants.has(ev.name)) {
        participants.set(ev.name, {
          name: ev.name,
          role: ev.role || "Participant",
          joined: ev.timestamp,
          left: null,
        });
      }
    }
    if (ev.type === "leave" && ev.name) {
      const p = participants.get(ev.name);
      if (p) p.left = ev.timestamp;
    }
  }

  if (participants.size === 0) {
    return '<p class="empty-state">No participant data recorded</p>';
  }

  let rows = "";
  for (const [, p] of participants) {
    const leftText = p.left ? formatTime(p.left) : '<span class="present-badge">Present</span>';
    rows += `
      <tr>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.role)}</td>
        <td>${formatTime(p.joined)}</td>
        <td>${leftText}</td>
      </tr>`;
  }

  return `
    <table class="participants-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Role</th>
          <th>Joined</th>
          <th>Left</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function buildTimelineHtml(events: any[]): string {
  if (events.length === 0) {
    return '<p class="empty-state">No events recorded</p>';
  }

  let items = "";
  for (const ev of events) {
    const color = eventColor(ev.type);
    const icon = eventIcon(ev.type);
    const time = ev.timestamp ? formatTime(ev.timestamp) : "";
    let desc = escapeHtml(ev.type);

    if (ev.type === "join" && ev.name) {
      desc = `<strong>${escapeHtml(ev.name)}</strong> joined`;
      if (ev.role) desc += ` as ${escapeHtml(ev.role)}`;
    } else if (ev.type === "leave" && ev.name) {
      desc = `<strong>${escapeHtml(ev.name)}</strong> left`;
    } else if (ev.type === "reaction" && ev.name) {
      desc = `<strong>${escapeHtml(ev.name)}</strong> reacted`;
      if (ev.reaction) desc += ` with ${escapeHtml(ev.reaction)}`;
    } else if (ev.type === "speaker" && ev.name) {
      desc = `<strong>${escapeHtml(ev.name)}</strong> started speaking`;
    } else if (ev.type === "screenshot") {
      desc = `Screenshot captured`;
      if (ev.trigger) desc += ` (${escapeHtml(ev.trigger)})`;
      if (ev.participantCount) desc += ` &mdash; ${ev.participantCount} participants`;
    }

    items += `
      <div class="timeline-item" style="--event-color: ${color}">
        <div class="timeline-dot">${icon}</div>
        <div class="timeline-content">
          <span class="timeline-time">${time}</span>
          <span class="timeline-desc">${desc}</span>
        </div>
      </div>`;
  }

  return `<div class="timeline">${items}</div>`;
}

function buildGalleryHtml(
  screenshots: ArchiveData["screenshots"]
): string {
  if (screenshots.length === 0) {
    return '<p class="empty-state">No screenshots captured</p>';
  }

  let cards = "";
  for (let i = 0; i < screenshots.length; i++) {
    const s = screenshots[i];
    const color = triggerColor(s.trigger);
    cards += `
      <div class="gallery-card" onclick="openLightbox(${i})">
        <div class="gallery-img-wrap">
          <img src="images/${escapeHtml(s.filename)}" alt="Screenshot" loading="lazy" />
        </div>
        <div class="gallery-meta">
          <span class="gallery-time">${formatTime(s.timestamp)}</span>
          <span class="trigger-badge" style="background: ${color}">${escapeHtml(s.trigger)}</span>
          <span class="gallery-participants">${s.participantCount} participants</span>
        </div>
      </div>`;
  }

  return `<div class="gallery-grid">${cards}</div>`;
}

export function buildArchiveHtml(data: ArchiveData): string {
  const topic = escapeHtml(data.meeting.topic);
  const date = formatDate(data.meeting.startTime);
  const duration = formatDuration(data.meeting.startTime, data.meeting.endTime);
  const startTime = formatTime(data.meeting.startTime);

  // Count unique participants from events
  const participantNames = new Set<string>();
  for (const ev of data.events) {
    if (ev.type === "join" && ev.name) participantNames.add(ev.name);
  }
  const participantCount = participantNames.size;

  const screenshotsJson = JSON.stringify(
    data.screenshots.map((s) => ({ filename: s.filename }))
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${topic} - Moment Archive</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0f0f1a;
      --bg-card: #1a1a2e;
      --bg-card-hover: #222240;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --border: #2d2d4a;
      --primary: #6366f1;
      --primary-end: #8b5cf6;
      --success: #10b981;
      --danger: #ef4444;
      --amber: #f59e0b;
      --cyan: #06b6d4;
    }

    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8fafc;
        --bg-card: #ffffff;
        --bg-card-hover: #f1f5f9;
        --text: #1e293b;
        --text-muted: #64748b;
        --border: #e2e8f0;
      }
    }

    body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }

    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }

    /* Header */
    .header {
      text-align: center;
      padding: 3rem 0 2rem;
    }

    .logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--primary), var(--primary-end));
      color: #fff;
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 1rem;
    }

    .header h1 {
      font-size: 2.25rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--primary), var(--primary-end));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 0.75rem;
    }

    .meta {
      display: flex;
      justify-content: center;
      gap: 2rem;
      flex-wrap: wrap;
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .meta-icon {
      font-size: 1.1rem;
    }

    /* Sections */
    .section {
      margin-top: 2.5rem;
    }

    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border);
    }

    /* Participants Table */
    .participants-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    .participants-table th,
    .participants-table td {
      text-align: left;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
    }

    .participants-table th {
      color: var(--text-muted);
      font-weight: 500;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .participants-table tr:hover td {
      background: var(--bg-card-hover);
    }

    .present-badge {
      display: inline-block;
      padding: 0.15rem 0.6rem;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
      font-size: 0.8rem;
      font-weight: 500;
    }

    /* Timeline */
    .timeline {
      display: flex;
      flex-direction: column;
      gap: 0;
      max-height: 500px;
      overflow-y: auto;
      padding-right: 0.5rem;
    }

    .timeline::-webkit-scrollbar {
      width: 4px;
    }

    .timeline::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 2px;
    }

    .timeline-item {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.6rem 0;
      border-left: 3px solid var(--event-color, var(--primary));
      padding-left: 1rem;
    }

    .timeline-dot {
      flex-shrink: 0;
      font-size: 1rem;
      line-height: 1;
      margin-top: 0.1rem;
    }

    .timeline-content {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: baseline;
    }

    .timeline-time {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
      min-width: 70px;
    }

    .timeline-desc {
      font-size: 0.9rem;
    }

    /* Gallery */
    .gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.25rem;
    }

    .gallery-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .gallery-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
    }

    .gallery-img-wrap {
      aspect-ratio: 16 / 10;
      overflow: hidden;
      background: #000;
    }

    .gallery-img-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .gallery-meta {
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
    }

    .gallery-time {
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }

    .trigger-badge {
      display: inline-block;
      padding: 0.1rem 0.5rem;
      border-radius: 9999px;
      color: #fff;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: capitalize;
    }

    .gallery-participants {
      margin-left: auto;
      color: var(--text-muted);
      font-size: 0.8rem;
    }

    /* Lightbox */
    .lightbox {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.9);
      z-index: 1000;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .lightbox.active {
      display: flex;
    }

    .lightbox img {
      max-width: 95vw;
      max-height: 90vh;
      border-radius: 8px;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.5);
    }

    .lightbox-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(255, 255, 255, 0.15);
      border: none;
      color: #fff;
      font-size: 2rem;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }

    .lightbox-nav:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .lightbox-prev { left: 1rem; }
    .lightbox-next { right: 1rem; }

    .lightbox-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      background: rgba(255, 255, 255, 0.15);
      border: none;
      color: #fff;
      font-size: 1.5rem;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .lightbox-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    /* Footer */
    .footer {
      text-align: center;
      padding: 3rem 0 2rem;
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    .footer a {
      color: var(--primary);
      text-decoration: none;
    }

    .empty-state {
      color: var(--text-muted);
      font-style: italic;
      padding: 1rem 0;
    }

    @media (max-width: 640px) {
      .header h1 { font-size: 1.5rem; }
      .meta { gap: 1rem; font-size: 0.85rem; }
      .gallery-grid { grid-template-columns: 1fr; }
      .container { padding: 1rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">M</div>
      <h1>${topic}</h1>
      <div class="meta">
        <div class="meta-item">
          <span class="meta-icon">&#x1F4C5;</span>
          <span>${escapeHtml(date)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-icon">&#x1F552;</span>
          <span>${escapeHtml(startTime)} &mdash; ${escapeHtml(duration)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-icon">&#x1F465;</span>
          <span>${participantCount} participant${participantCount !== 1 ? "s" : ""}</span>
        </div>
        <div class="meta-item">
          <span class="meta-icon">&#x1F4F7;</span>
          <span>${data.screenshots.length} screenshot${data.screenshots.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Participants</h2>
      ${buildParticipantsHtml(data.events)}
    </div>

    <div class="section">
      <h2 class="section-title">Timeline</h2>
      ${buildTimelineHtml(data.events)}
    </div>

    <div class="section">
      <h2 class="section-title">Screenshots</h2>
      ${buildGalleryHtml(data.screenshots)}
    </div>
  </div>

  <!-- Lightbox -->
  <div class="lightbox" id="lightbox" onclick="closeLightbox(event)">
    <button class="lightbox-close" onclick="closeLightbox(event)">&#x2715;</button>
    <button class="lightbox-nav lightbox-prev" onclick="navLightbox(event, -1)">&#x2039;</button>
    <img id="lightbox-img" src="" alt="Screenshot" />
    <button class="lightbox-nav lightbox-next" onclick="navLightbox(event, 1)">&#x203A;</button>
  </div>

  <div class="footer">
    Generated by <strong>Moment</strong>
  </div>

  <script>
    var screenshots = ${screenshotsJson};
    var currentIndex = 0;

    function openLightbox(index) {
      currentIndex = index;
      var lb = document.getElementById('lightbox');
      var img = document.getElementById('lightbox-img');
      img.src = 'images/' + screenshots[index].filename;
      lb.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeLightbox(e) {
      if (e.target === document.getElementById('lightbox') || e.currentTarget.classList.contains('lightbox-close')) {
        document.getElementById('lightbox').classList.remove('active');
        document.body.style.overflow = '';
      }
    }

    function navLightbox(e, dir) {
      e.stopPropagation();
      currentIndex = (currentIndex + dir + screenshots.length) % screenshots.length;
      document.getElementById('lightbox-img').src = 'images/' + screenshots[currentIndex].filename;
    }

    document.addEventListener('keydown', function(e) {
      var lb = document.getElementById('lightbox');
      if (!lb.classList.contains('active')) return;
      if (e.key === 'Escape') {
        lb.classList.remove('active');
        document.body.style.overflow = '';
      } else if (e.key === 'ArrowLeft') {
        navLightbox(e, -1);
      } else if (e.key === 'ArrowRight') {
        navLightbox(e, 1);
      }
    });
  </script>
</body>
</html>`;
}
