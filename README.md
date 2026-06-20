# King of Open Play

Developed by **Developer King**, an engineer in the airline industry who loves
data and builds AI-powered applications on the side.

Helping pickleball communities run fair, fun, and organized open play sessions
through smart player rotation and court management.

An offline-first pickleball open-play organizer for large groups. It replaces paddle
stacking with an automatic fair queue, court assignments, live scoring, and complete
local session history.

## Live website

After GitHub Pages finishes deploying:

https://kirahmadlare.github.io/kingofopenplay/

## Features

- Fast bulk player registration (one name per line)
- Fair rotation: fewest games played first, then longest waiting
- Configurable courts, singles/doubles, points to win, and win-by rule
- Rule-aware live scoring for every court
- Traditional side-out scoring with doubles server 1/server 2 and automatic side-outs
- Optional provisional rally scoring
- One-tap game winner entry when there is no time to record every rally
- Automatic next-match assignment as soon as a court finishes
- Winner-vs-winner skill ladder that keeps partners together between games
- Balanced-remix ladder that can switch partners to create closer-skill teams
- Pure-random matchmaking option
- Equal-games rotation with a rest turn after every completed match
- Guided pre-event builder with explanations and a live gameplay simulation
- Fixed-team round-robin tournament mode with automatic scheduling and standings
- Arcade-style VS court-assignment introductions
- Optional spoken court and player-name announcements using the device voice
- Live player substitutions from the waiting queue for open play and skill ladders
- Pastel-blue sports dashboard theme with precisely centered VS court cards
- Final-score entry with point-margin skill adjustments
- Manual-score validation using the configured play-to, deuce, and win-by rules
- One hundred family-friendly funny team names for automatic matchups and tournaments
- In-app About page covering privacy, AI-assisted development, and public publishing
- In-app How to Use guide plus a downloadable illustrated organizer manual

## User guide

Open the **Guide** tab in the application or download
`King-of-Open-Play-User-Guide.docx`.
- Organizer controls to close and reopen courts as time blocks end
- Pause and return players without losing their stats
- Completed-game history
- Automatic offline saving in the browser
- JSON export/import for backups or moving a session to another device
- Installable Progressive Web App (PWA)
- No account, server, or database required

## Run locally

The service worker requires an HTTP server rather than opening `index.html` directly.

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Publish for free

This is a static site and can be deployed as-is to GitHub Pages, Cloudflare Pages,
Netlify, or Vercel. No build command is needed; publish the repository root.

## Data model and privacy

All session information is stored in the browser's `localStorage` on the device running
the event. Clearing browser site data removes it, so use **Export** for important
backups. Because there is no central database, a session does not automatically sync
between different phones or computers.
