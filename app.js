const STORAGE_KEY = "openplay-ph-session-v1";
const VOICE_KEY = "openplay-ph-announcer-enabled";

const state = {
  session: null,
  activeTab: "dashboard",
  editingSession: false,
  announcingCourtIds: new Set(),
  announcerEnabled: localStorage.getItem(VOICE_KEY) !== "false",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  emptyState: $("#empty-state"),
  appShell: $("#app-shell"),
  sessionDialog: $("#session-dialog"),
  confirmDialog: $("#confirm-dialog"),
  publicGuideDialog: $("#public-guide-dialog"),
  toast: $("#toast"),
  playerNames: $("#player-names"),
  playerSearch: $("#player-search"),
  installButton: $("#install-button"),
};

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
  return Date.now();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createSession(settings) {
  return {
    id: uid("session"),
    name: settings.name,
    eventType: settings.eventType || "openplay",
    courtCount: Number(settings.courtCount),
    format: settings.format,
    scoringMode: settings.scoringMode || "sideout",
    matchmakingMode: settings.matchmakingMode || "ladder",
    pointsToWin: Number(settings.pointsToWin),
    winBy: Number(settings.winBy),
    createdAt: now(),
    updatedAt: now(),
    players: [],
    courts: Array.from({ length: Number(settings.courtCount) }, (_, index) => ({
      id: uid("court"),
      name: `Court ${index + 1}`,
      closed: false,
      game: null,
    })),
    teamQueue: [],
    tournamentTeams: [],
    tournamentMatches: [],
    tournamentStarted: false,
    history: [],
  };
}

function normalizeSession(raw) {
  if (!raw || !Array.isArray(raw.players) || !Array.isArray(raw.courts)) return null;
  raw.players = raw.players.map((player) => ({
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    status: "waiting",
    joinedAt: now(),
    waitingSince: now(),
    ...player,
  }));
  raw.history = Array.isArray(raw.history) ? raw.history : [];
  raw.eventType = raw.eventType || "openplay";
  raw.scoringMode = raw.scoringMode || "sideout";
  raw.matchmakingMode = raw.matchmakingMode || "ladder";
  raw.teamQueue = Array.isArray(raw.teamQueue) ? raw.teamQueue : [];
  raw.tournamentTeams = Array.isArray(raw.tournamentTeams) ? raw.tournamentTeams : [];
  raw.tournamentMatches = Array.isArray(raw.tournamentMatches) ? raw.tournamentMatches : [];
  raw.tournamentStarted = Boolean(raw.tournamentStarted);
  raw.players.forEach((player) => {
    player.skillLevel = Number(player.skillLevel) || 0;
    player.teamPoints = Number(player.teamPoints) || 0;
    player.availableAfterGame = Number(
      player.availableAfterGame ?? player.availableAfterAssignment,
    ) || 0;
  });
  const validPlayerIds = new Set(raw.players.map((player) => player.id));
  const expectedTeamSize = raw.format === "doubles" ? 2 : 1;
  raw.teamQueue = raw.teamQueue.filter(
    (team) =>
      Array.isArray(team.playerIds) &&
      team.playerIds.length === expectedTeamSize &&
      team.playerIds.every((id) => validPlayerIds.has(id)),
  );
  raw.courts = raw.courts.map((court, index) => ({
    id: court.id || uid("court"),
    name: court.name || `Court ${index + 1}`,
    closed: Boolean(court.closed),
    game: court.game
      ? (() => {
          const teamAName = court.game.teamAName || randomFunnyTeamName();
          return {
          servingTeam: "A",
          serverNumber: raw.format === "doubles" ? 2 : 1,
          serverIndex: 0,
          rallyLog: [],
          ...court.game,
          teamAName,
          teamBName: court.game.teamBName || randomFunnyTeamName([teamAName]),
          };
        })()
      : null,
  }));
  return raw;
}

function loadSession() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    state.session = stored ? normalizeSession(JSON.parse(stored)) : null;
  } catch {
    state.session = null;
    showToast("Saved session could not be loaded.");
  }
}

let saveTimer;
function saveSession() {
  if (!state.session) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  state.session.updatedAt = now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.session));
  $("#save-status").textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    $("#save-status").textContent = "Saved offline";
  }, 450);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function updateVoiceToggle() {
  const button = $("#voice-toggle");
  button.setAttribute("aria-pressed", String(state.announcerEnabled));
  button.innerHTML = state.announcerEnabled
    ? '<span aria-hidden="true">🔊</span> Announcer on'
    : '<span aria-hidden="true">🔇</span> Announcer off';
}

function announceCourt(courtName, teamANames, teamBNames) {
  if (!state.announcerEnabled || !("speechSynthesis" in window)) return;
  const allNames = [...teamANames, ...teamBNames];
  const message =
    `${courtName}. Players assigned. ` +
    `${teamANames.join(" and ")}, versus ${teamBNames.join(" and ")}. ` +
    `${allNames.join(", ")}, please proceed to ${courtName}.`;
  const speech = new SpeechSynthesisUtterance(message);
  speech.rate = 0.88;
  speech.pitch = 1.02;
  speech.volume = 1;
  const voices = window.speechSynthesis.getVoices();
  speech.voice =
    voices.find((voice) => /^en-PH/i.test(voice.lang)) ||
    voices.find((voice) => /^en/i.test(voice.lang)) ||
    null;
  window.speechSynthesis.speak(speech);
}

function triggerCourtIntro(courtId, teamANames, teamBNames) {
  triggerCourtIntros([{ courtId, teamANames, teamBNames }]);
}

function triggerCourtIntros(assignments) {
  if (!assignments.length) return;
  state.announcingCourtIds.clear();
  assignments.forEach((assignment) => {
    state.announcingCourtIds.add(assignment.courtId);
  });
  render();
  assignments.forEach((assignment, index) => {
    const court = state.session.courts.find((item) => item.id === assignment.courtId);
    setTimeout(
      () =>
        announceCourt(
          court?.name || "Court",
          assignment.teamANames,
          assignment.teamBNames,
        ),
      index * 120,
    );
  });
  clearTimeout(triggerCourtIntros.timer);
  triggerCourtIntros.timer = setTimeout(() => {
    assignments.forEach((assignment) => {
      state.announcingCourtIds.delete(assignment.courtId);
    });
    render();
  }, 1900);
}

function playerById(id) {
  return state.session?.players.find((player) => player.id === id);
}

const FUNNY_TEAM_NAMES = [
  "Dink Responsibly", "The Big Dills", "Kitchen Nightmares", "Paddle Tattlers",
  "Serves You Right", "Dink Floyd", "Pickle Me Elmo", "The Volley Llamas",
  "Drop Shot Like It’s Hot", "Kind of a Big Dill", "Net Results", "The Dink Panthers",
  "Paddle Faster", "Kitchen Confidential", "No Big Dill", "The Spin Doctors",
  "Dink Outside the Box", "The Pickle Pack", "Third Shot Charm", "Sweet Spot Squad",
  "The Rally Turtles", "Dink Dynasty", "Paddle Pals", "The Court Jesters",
  "Pickle Rickshaws", "The Lob Mob", "Kitchen Sinkers", "The Dinking Donuts",
  "Net Worth", "The Paddle Cakes", "Dill With It", "The Volley Partons",
  "Oops All Dinks", "Pickled Peppers", "The Erne Birds", "The Serve-ivors",
  "Dink Tank", "Paddle Penguins", "The Fault Finders", "Kitchen Wizards",
  "The Fuzzy Pickles", "Dink and Tonic", "The Rally Rascals", "Paddle Monium",
  "The Net Set", "Pickle Whisperers", "The Dink Droids", "Court Potatoes",
  "The Paddle Snakes", "Lob Stars", "Dink Positive", "The Pickle Puns",
  "The Soft Game Gang", "Rally McRallyface", "The Kitchen Crew", "Paddle Scouts",
  "The Dink Detectives", "Zero Zero Fun", "The Pickle Sprinkles", "Net Navigators",
  "The Drop Shot Club", "Dink Happens", "The Paddle Puffins", "Kitchen Comedians",
  "The Volley Beans", "Pickle Party", "The Dink Flamingos", "Rally Around",
  "The Paddle Noodles", "Net Gains", "The Pickle Pixels", "Dink Different",
  "The Kitchen Kittens", "Paddle Parade", "The Rally Alpacas", "Third Shot Wonders",
  "The Dink Bunch", "Pickle Pirates", "The Net Ninjas", "Paddle Doodles",
  "The Lobsters", "Dink Twice", "The Kitchen Cousins", "Rally Good Time",
  "The Paddle Planners", "Pickle Picnic", "The Dinkonauts", "Net-ish Behavior",
  "The Happy Campers", "Paddle Pop", "The Rally Ducks", "Dink About It",
  "The Pickle Pockets", "Kitchen Karaoke", "The Serve Snacks", "Paddle Peaches",
  "The Dink Delegates", "Rally Cats", "The Pickle Sidekicks", "Court of Mild Chaos",
];

function randomFunnyTeamName(excluded = []) {
  const unavailable = new Set(excluded.map((name) => name.toLowerCase()));
  const available = FUNNY_TEAM_NAMES.filter(
    (name) => !unavailable.has(name.toLowerCase()),
  );
  return available[Math.floor(Math.random() * available.length)] || "The Happy Pickles";
}

function shuffleLandingTeamNames() {
  const first = randomFunnyTeamName();
  const second = randomFunnyTeamName([first]);
  $("#landing-team-a").textContent = first;
  $("#landing-team-b").textContent = second;
}

function waitingPlayers() {
  if (!state.session) return [];
  return state.session.players
    .filter((player) => player.status === "waiting")
    .sort(
      (a, b) =>
        a.gamesPlayed - b.gamesPlayed ||
        a.waitingSince - b.waitingSince ||
        a.joinedAt - b.joinedAt ||
        a.name.localeCompare(b.name),
    );
}

function queuedPlayerIds() {
  return new Set((state.session?.teamQueue || []).flatMap((team) => team.playerIds));
}

function freeWaitingPlayers() {
  const queued = queuedPlayerIds();
  return waitingPlayers().filter((player) => !queued.has(player.id));
}

function rotationCandidates() {
  const candidates = shuffle(freeWaitingPlayers());
  let rested =
    state.session.courtCount === 1
      ? candidates
      : candidates.filter(
          (player) => player.availableAfterGame <= state.session.history.length,
        );
  const playersPerGame = state.session.format === "doubles" ? 4 : 2;
  const hasLiveCourt = state.session.courts.some((court) => court.game);
  if (rested.length < playersPerGame && !hasLiveCourt) {
    rested = candidates;
  }
  return rested.sort(
    (a, b) =>
      a.gamesPlayed - b.gamesPlayed ||
      a.waitingSince - b.waitingSince,
  );
}

function ensureOnDeckTeams() {
  if (state.session.matchmakingMode !== "ladder" || !state.session.history.length) return;
  const teamSize = state.session.format === "doubles" ? 2 : 1;
  const candidates = rotationCandidates();
  while (candidates.length >= teamSize) {
    const players = candidates.splice(0, teamSize);
    state.session.teamQueue.push({
      id: uid("team"),
      playerIds: players.map((player) => player.id),
      result: "loser",
      level: players.reduce((total, player) => total + player.skillLevel, 0) / players.length,
      waitingSince: Math.min(...players.map((player) => player.waitingSince)),
      availableAfterGame: Math.max(
        ...players.map((player) => player.availableAfterGame || 0),
      ),
    });
  }
}

function teamQueueFor(result) {
  return state.session.teamQueue
    .filter(
      (team) =>
        team.result === result &&
        team.playerIds.every((id) => playerById(id)?.status === "waiting") &&
        (state.session.courtCount === 1 ||
          (team.availableAfterGame || 0) <= state.session.history.length),
    )
    .sort(
      (a, b) =>
        a.playerIds.reduce((sum, id) => sum + (playerById(id)?.gamesPlayed || 0), 0) -
          b.playerIds.reduce((sum, id) => sum + (playerById(id)?.gamesPlayed || 0), 0) ||
        a.waitingSince - b.waitingSince,
    );
}

function findLadderMatch() {
  ensureOnDeckTeams();
  for (const result of ["winner", "loser"]) {
    const teams = teamQueueFor(result);
    if (teams.length >= 2) {
      const first = teams[0];
      const opponent = teams
        .slice(1)
        .sort(
          (a, b) =>
            Math.abs(a.level - first.level) - Math.abs(b.level - first.level) ||
            a.waitingSince - b.waitingSince,
        )[0];
      return [first, opponent];
    }
  }
  return null;
}

function canCreateMatch() {
  const count = state.session.format === "doubles" ? 4 : 2;
  if (state.session.matchmakingMode === "ladder" && findLadderMatch()) return true;
  return rotationCandidates().length >= count;
}

function openCourts() {
  return state.session.courts.filter((court) => !court.closed);
}

function minutesSince(timestamp) {
  return Math.max(0, Math.floor((now() - timestamp) / 60000));
}

function waitLabel(timestamp) {
  const mins = minutesSince(timestamp);
  return mins < 1 ? "Just joined" : `${mins} min wait`;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function plural(value, word) {
  return `${value} ${word}${value === 1 ? "" : "s"}`;
}

function render() {
  const hasSession = Boolean(state.session);
  elements.emptyState.classList.toggle("hidden", hasSession);
  elements.appShell.classList.toggle("hidden", !hasSession);
  if (!hasSession) return;

  renderHeader();
  renderStats();
  renderCourts();
  renderQueue();
  renderPlayers();
  renderTournament();
  renderHistory();
  renderTabs();
}

function renderHeader() {
  const session = state.session;
  const isTournament = session.eventType === "tournament";
  $("#session-title").textContent = session.name;
  $("#session-meta").textContent = isTournament
    ? `${plural(session.courtCount, "court")} · Fixed-team round robin · Games to ${session.pointsToWin}`
    : `${plural(session.courtCount, "court")} · ${session.format === "doubles" ? "Doubles" : "Singles"} · ` +
      `Games to ${session.pointsToWin}, win by ${session.winBy} · ` +
      `${session.scoringMode === "rally" ? "Rally scoring" : "Side-out scoring"} · ` +
      `${
        session.matchmakingMode === "random"
          ? "Pure random"
          : session.matchmakingMode === "balanced"
            ? "Balanced remix"
            : "Winner ladder"
      }`;
  $("#matchmaking-help").textContent =
    session.matchmakingMode === "random"
      ? "Every open court gets a fresh random draw, with fewer-games priority."
      : session.matchmakingMode === "balanced"
        ? "Partners are remixed into close-skill teams, with fewer-games priority."
        : "Winning teams face winners after a rest turn; placement teams face similar teams.";
  $("#queue-help").textContent =
    session.matchmakingMode === "random"
      ? "Players who have rested and played fewer games move to the front."
      : session.matchmakingMode === "balanced"
        ? "Players wait individually, then teams are balanced from current skill results."
        : "Partners stay together, but must wait behind rested teams before playing again.";
  $("#player-count-badge").textContent = isTournament
    ? session.tournamentTeams.length
    : session.players.length;
  $("#participants-tab-label").textContent = isTournament ? "Teams" : "Players";
  $("#standings-tab").classList.toggle("hidden", !isTournament);
  $("#open-play-registration").classList.toggle("hidden", isTournament);
  $("#tournament-registration").classList.toggle("hidden", !isTournament);
  $("#add-player-shortcut").textContent = isTournament ? "+ Add teams" : "+ Add players";
}

function renderStats() {
  const session = state.session;
  if (session.eventType === "tournament") {
    const pending = session.tournamentMatches.filter((match) => match.status === "pending").length;
    const playing = session.tournamentMatches.filter((match) => match.status === "playing").length;
    const completed = session.tournamentMatches.filter((match) => match.status === "completed").length;
    $("#waiting-count").textContent = pending;
    $("#playing-count").textContent = playing;
    $("#games-count").textContent = completed;
    $("#longest-wait").textContent = session.tournamentTeams.length;
    $(".stat-card:nth-child(1) span").textContent = "Matches queued";
    $(".stat-card:nth-child(1) small").textContent = "remaining schedule";
    $(".stat-card:nth-child(2) span").textContent = "Live matches";
    $(".stat-card:nth-child(2) small").textContent = "currently on court";
    $(".stat-card:nth-child(4) span").textContent = "Teams";
    $(".stat-card:nth-child(4) small").textContent = "in competition";
    return;
  }
  $(".stat-card:nth-child(1) span").textContent = "Waiting";
  $(".stat-card:nth-child(1) small").textContent = "players in rotation";
  $(".stat-card:nth-child(2) span").textContent = "Playing";
  $(".stat-card:nth-child(2) small").textContent = "players on court";
  $(".stat-card:nth-child(4) span").textContent = "Longest wait";
  $(".stat-card:nth-child(4) small").textContent = "current queue";
  const waiting = waitingPlayers();
  const playing = session.players.filter((player) => player.status === "playing");
  $("#waiting-count").textContent = waiting.length;
  $("#playing-count").textContent = playing.length;
  $("#games-count").textContent = session.history.length;
  $("#longest-wait").textContent = waiting.length
    ? minutesSince(waiting[0].waitingSince) < 1
      ? "<1m"
      : `${minutesSince(waiting[0].waitingSince)}m`
    : "—";
}

function renderCourts() {
  if (state.session.eventType === "tournament") {
    renderTournamentCourts();
    return;
  }
  const playersPerGame = state.session.format === "doubles" ? 4 : 2;
  $("#fill-courts-button").textContent = "Fill open courts";
  const available = freeWaitingPlayers().length;
  const matchReady = canCreateMatch();
  $("#fill-courts-button").disabled =
    !state.session.courts.some((court) => !court.closed && !court.game);

  $("#courts-grid").innerHTML = state.session.courts
    .map((court) => {
      if (court.closed) {
        return `
          <article class="court-card court-closed">
            <div class="court-header">
              <h3><span class="court-icon" aria-hidden="true">×</span>${escapeHtml(court.name)}</h3>
              <span class="court-status">Closed</span>
            </div>
            <div class="court-body empty-court">
              <div><p>This court is no longer accepting matches.</p>
              <button class="button button-secondary" data-toggle-court="${court.id}">Reopen court</button></div>
            </div>
          </article>`;
      }
      if (!court.game) {
        return `
          <article class="court-card empty">
            <div class="court-header">
              <h3>${escapeHtml(court.name)}</h3>
              <span class="court-status">Open</span>
            </div>
            <div class="court-body empty-court">
              <div>
                <p>${
                  matchReady
                    ? state.session.matchmakingMode === "ladder" && findLadderMatch()
                      ? "A matched ladder game is ready."
                      : "Ready for a new random group."
                    : state.session.matchmakingMode === "ladder" && state.session.teamQueue.length
                      ? "Waiting for another winning or losing team to finish."
                      : `Need ${Math.max(0, playersPerGame - available)} more waiting player${playersPerGame - available === 1 ? "" : "s"}.`
                }</p>
                <button class="button button-secondary" data-assign-court="${court.id}" ${!matchReady ? "disabled" : ""}>
                  ${state.session.matchmakingMode === "ladder" ? "Assign matched teams" : "Assign random players"}
                </button>
                <button class="button button-secondary danger-text court-close-empty" data-toggle-court="${court.id}">Close court</button>
              </div>
            </div>
          </article>`;
      }

      const game = court.game;
      const teamA = game.teamA.map(playerById).filter(Boolean);
      const teamB = game.teamB.map(playerById).filter(Boolean);
      const teamAName = game.teamAName || "Team A";
      const teamBName = game.teamBName || "Team B";
      const servingTeam = game.servingTeam === "B" ? teamB : teamA;
      const server = servingTeam[game.serverIndex] || servingTeam[0];
      const servingScore = game.servingTeam === "A" ? game.scoreA : game.scoreB;
      const receivingScore = game.servingTeam === "A" ? game.scoreB : game.scoreA;
      const scoreCall =
        state.session.format === "doubles" && state.session.scoringMode === "sideout"
          ? `${servingScore} – ${receivingScore} – ${game.serverNumber}`
          : `${servingScore} – ${receivingScore}`;
      const winner = winningTeam(game);
      return `
        <article class="court-card ${state.announcingCourtIds.has(court.id) ? "court-intro" : ""}">
          ${
            state.announcingCourtIds.has(court.id)
              ? `<div class="versus-overlay" aria-hidden="true">
                  <div class="fighter-side fighter-a">${teamA.map((player) => `<strong>${escapeHtml(player.name)}</strong>`).join("")}</div>
                  <div class="versus-burst"><span>COURT ${escapeHtml(court.name.replace(/\D/g, "") || court.name)}</span><strong>VS</strong><i>READY!</i></div>
                  <div class="fighter-side fighter-b">${teamB.map((player) => `<strong>${escapeHtml(player.name)}</strong>`).join("")}</div>
                </div>`
              : ""
          }
          <div class="court-header">
            <h3><span class="court-icon" aria-hidden="true">⌗</span>${escapeHtml(court.name)}</h3>
            <span class="court-status live">Playing · ${waitLabel(game.startedAt).replace(" wait", "")}</span>
          </div>
          <div class="court-body">
            <div class="matchup fight-matchup">
              <div class="team fight-team fight-team-blue">
                <span class="team-label">${escapeHtml(teamAName)}</span>
                ${teamA.map((player) => `<span class="team-player">${escapeHtml(player.name)}</span>`).join("")}
              </div>
              <span class="versus">VS</span>
              <div class="team fight-team fight-team-red">
                <span class="team-label">${escapeHtml(teamBName)}</span>
                ${teamB.map((player) => `<span class="team-player">${escapeHtml(player.name)}</span>`).join("")}
              </div>
            </div>
            <div class="scoreboard">
              <div class="score-panel ${game.servingTeam === "A" ? "serving" : ""}">
                <span class="score-team-label">${escapeHtml(teamAName)}</span>
                <span class="score">${game.scoreA}</span>
                <span class="serve-indicator">${game.servingTeam === "A" ? `Serving · ${escapeHtml(server?.name || "")}` : ""}</span>
              </div>
              <div class="score-panel ${game.servingTeam === "B" ? "serving" : ""}">
                <span class="score-team-label">${escapeHtml(teamBName)}</span>
                <span class="score">${game.scoreB}</span>
                <span class="serve-indicator">${game.servingTeam === "B" ? `Serving · ${escapeHtml(server?.name || "")}` : ""}</span>
              </div>
            </div>
            <div class="score-call">
              <span>Call before serving</span>
              <strong>${scoreCall}</strong>
            </div>
            <div class="rally-actions">
              <button class="button button-secondary rally-button" data-rally-winner="${court.id}:A">${escapeHtml(teamAName)} won rally</button>
              <button class="button button-secondary rally-button" data-rally-winner="${court.id}:B">${escapeHtml(teamBName)} won rally</button>
            </div>
            <div class="quick-result">
              <span>Short on time? Record only the winner</span>
              <div>
                <button class="button button-quick" data-quick-winner="${court.id}:A">${escapeHtml(teamAName)} won game</button>
                <button class="button button-quick" data-quick-winner="${court.id}:B">${escapeHtml(teamBName)} won game</button>
              </div>
            </div>
            <div class="final-score-entry">
              <span>Finish game with final score</span>
              <div>
                <label>${escapeHtml(teamAName)}<input type="number" min="0" max="${state.session.pointsToWin}" value="${game.scoreA}" data-final-a="${court.id}" /></label>
                <strong>—</strong>
                <label>${escapeHtml(teamBName)}<input type="number" min="0" max="${state.session.pointsToWin}" value="${game.scoreB}" data-final-b="${court.id}" /></label>
                <button class="button button-primary" data-save-final="${court.id}">Save final result</button>
              </div>
              <small>Point margin adjusts skill ratings, helping future matches become closer.</small>
            </div>
            <details class="substitution-panel">
              <summary><span aria-hidden="true">⇄</span> Substitute a player</summary>
              <div class="substitution-controls">
                <label>
                  Player leaving
                  <select data-sub-out="${court.id}">
                    ${[...teamA, ...teamB]
                      .map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`)
                      .join("")}
                  </select>
                </label>
                <label>
                  Waiting replacement
                  <select data-sub-in="${court.id}">
                    ${
                      waitingPlayers().length
                        ? waitingPlayers()
                            .map(
                              (player) =>
                                `<option value="${player.id}">${escapeHtml(player.name)} · ${player.gamesPlayed} games</option>`,
                            )
                            .join("")
                        : `<option value="">No waiting players</option>`
                    }
                  </select>
                </label>
                <button class="button button-secondary" data-substitute="${court.id}" ${waitingPlayers().length ? "" : "disabled"}>
                  Confirm substitution
                </button>
              </div>
              <small>The departing player is checked out. The replacement takes the same team position and current score.</small>
            </details>
            <div class="court-actions">
              <button class="button button-secondary" data-undo-rally="${court.id}" ${game.rallyLog.length ? "" : "disabled"}>Undo rally</button>
              ${
                winner
                  ? `<button class="button button-primary" data-finish-game="${court.id}">Complete game · Team ${winner} won</button>`
                  : `<button class="button button-secondary danger-text" data-cancel-game="${court.id}">Cancel game</button>`
              }
              <button class="button button-secondary danger-text" data-close-after="${court.id}">End game & close court</button>
            </div>
          </div>
        </article>`;
    })
    .join("");
}

function tournamentTeamById(id) {
  return state.session.tournamentTeams.find((team) => team.id === id);
}

function renderTournamentCourts() {
  const hasPending = state.session.tournamentMatches.some((match) => match.status === "pending");
  $("#fill-courts-button").disabled =
    !hasPending || !state.session.tournamentStarted || !openCourts().length;
  $("#fill-courts-button").textContent = "Assign scheduled matches";
  $("#matchmaking-help").textContent =
    "Round-robin matches are assigned automatically without scheduling the same team twice at once.";
  $("#queue-help").textContent =
    "The schedule gives every registered team a match against every other team.";

  $("#courts-grid").innerHTML = state.session.courts
    .map((court) => {
      if (court.closed) {
        return `<article class="court-card court-closed">
          <div class="court-header"><h3><span class="court-icon">×</span>${escapeHtml(court.name)}</h3><span class="court-status">Closed</span></div>
          <div class="court-body empty-court"><div><p>Closed for the remainder of this time block.</p><button class="button button-secondary" data-toggle-court="${court.id}">Reopen court</button></div></div>
        </article>`;
      }
      const match = court.game
        ? state.session.tournamentMatches.find((item) => item.id === court.game.matchId)
        : null;
      if (!match) {
        const convertiblePlayers = state.session.players.filter(
          (player) => player.status !== "playing",
        ).length;
        return `
          <article class="court-card empty">
            <div class="court-header"><h3>${escapeHtml(court.name)}</h3><span class="court-status">Open</span></div>
            <div class="court-body empty-court"><div>
              <p>${
                state.session.tournamentStarted
                  ? hasPending
                    ? "Ready for the next scheduled match."
                    : "Tournament schedule complete."
                  : convertiblePlayers >= 4 && !state.session.tournamentTeams.length
                    ? `${convertiblePlayers} individual players found. Convert them into fixed teams first.`
                    : "Register teams and generate the schedule first."
              }</p>
              ${
                convertiblePlayers >= 4 && !state.session.tournamentTeams.length
                  ? `<button class="button button-primary" data-convert-players>Convert players into teams</button>`
                  : ""
              }
              <button class="button button-secondary" data-assign-tournament="${court.id}" ${!hasPending || !state.session.tournamentStarted ? "disabled" : ""}>Assign next match</button>
              <button class="button button-secondary danger-text court-close-empty" data-toggle-court="${court.id}">Close court</button>
            </div></div>
          </article>`;
      }
      const teamA = tournamentTeamById(match.teamAId);
      const teamB = tournamentTeamById(match.teamBId);
      return `
        <article class="court-card tournament-court ${state.announcingCourtIds.has(court.id) ? "court-intro" : ""}">
          ${
            state.announcingCourtIds.has(court.id)
              ? `<div class="versus-overlay" aria-hidden="true">
                  <div class="fighter-side fighter-a"><strong>${escapeHtml(teamA?.name || "Team A")}</strong>${(teamA?.players || []).map((name) => `<small>${escapeHtml(name)}</small>`).join("")}</div>
                  <div class="versus-burst"><span>${escapeHtml(court.name)}</span><strong>VS</strong><i>FIGHT!</i></div>
                  <div class="fighter-side fighter-b"><strong>${escapeHtml(teamB?.name || "Team B")}</strong>${(teamB?.players || []).map((name) => `<small>${escapeHtml(name)}</small>`).join("")}</div>
                </div>`
              : ""
          }
          <div class="court-header">
            <h3><span class="court-icon" aria-hidden="true">★</span>${escapeHtml(court.name)}</h3>
            <span class="court-status live">Round ${match.round}</span>
          </div>
          <div class="court-body">
            <div class="matchup fight-matchup">
              <div class="team fight-team fight-team-blue"><span class="team-label">Team A</span><span class="team-player">${escapeHtml(teamA?.name || "Team A")}</span><span class="row-meta">${escapeHtml((teamA?.players || []).join(" & "))}</span></div>
              <span class="versus">VS</span>
              <div class="team fight-team fight-team-red"><span class="team-label">Team B</span><span class="team-player">${escapeHtml(teamB?.name || "Team B")}</span><span class="row-meta">${escapeHtml((teamB?.players || []).join(" & "))}</span></div>
            </div>
            <div class="quick-result tournament-result">
              <span>Record the match winner</span>
              <div>
                <button class="button button-quick" data-tournament-winner="${court.id}:A">${escapeHtml(teamA?.name || "Team A")} won</button>
                <button class="button button-quick" data-tournament-winner="${court.id}:B">${escapeHtml(teamB?.name || "Team B")} won</button>
              </div>
            </div>
            <div class="final-score-entry">
              <span>Enter final tournament score</span>
              <div>
                <label>${escapeHtml(teamA?.name || "A")}<input type="number" min="0" max="${state.session.pointsToWin}" value="${state.session.pointsToWin}" data-tournament-final-a="${court.id}" /></label>
                <strong>—</strong>
                <label>${escapeHtml(teamB?.name || "B")}<input type="number" min="0" max="${state.session.pointsToWin}" value="0" data-tournament-final-b="${court.id}" /></label>
                <button class="button button-primary" data-save-tournament-final="${court.id}">Save score</button>
              </div>
            </div>
            <button class="button button-secondary danger-text tournament-cancel" data-cancel-tournament="${court.id}">Return match to schedule</button>
            <button class="button button-secondary danger-text tournament-cancel" data-close-after="${court.id}">End match & close court</button>
          </div>
        </article>`;
    })
    .join("");
}

function renderQueue() {
  if (state.session.eventType === "tournament") {
    const pending = state.session.tournamentMatches.filter((match) => match.status === "pending");
    $("#queue-list").innerHTML = pending.length
      ? pending
          .slice(0, 12)
          .map((match, index) => {
            const teamA = tournamentTeamById(match.teamAId);
            const teamB = tournamentTeamById(match.teamBId);
            return `<div class="queue-row">
              <span class="queue-position">${index + 1}</span>
              <div><p class="row-title">${escapeHtml(teamA?.name || "")} vs ${escapeHtml(teamB?.name || "")}</p><p class="row-meta">Round ${match.round}</p></div>
              <span class="pill">Scheduled</span><span></span>
            </div>`;
          })
          .join("")
      : `<div class="empty-list">${state.session.tournamentStarted ? "No pending matches." : "Generate a schedule after registering teams."}</div>`;
    return;
  }
  const queue = waitingPlayers();
  const teamByPlayer = new Map();
  state.session.teamQueue.forEach((team) => {
    team.playerIds.forEach((id) => teamByPlayer.set(id, team));
  });
  $("#queue-list").innerHTML = queue.length
    ? queue
        .map(
          (player, index) => {
            const team = teamByPlayer.get(player.id);
            const teammateNames = team
              ? team.playerIds
                  .filter((id) => id !== player.id)
                  .map((id) => playerById(id)?.name)
                  .filter(Boolean)
                  .join(" & ")
              : "";
            const queueMeta = team
              ? `${team.result === "winner" ? "Winning team" : "Placement team"}${teammateNames ? ` with ${teammateNames}` : ""}`
              : state.session.matchmakingMode === "balanced"
                ? "Waiting for balanced remix"
                : state.session.matchmakingMode === "ladder"
                  ? "Waiting for first-round draw"
                  : "Waiting for random draw";
            const resting =
              (team?.availableAfterGame || player.availableAfterGame || 0) >
              state.session.history.length;
            return `
            <div class="queue-row">
              <span class="queue-position">${index + 1}</span>
              <div>
                <p class="row-title">${escapeHtml(player.name)}</p>
                <p class="row-meta">${escapeHtml(queueMeta)} · ${resting ? "Resting one turn" : waitLabel(player.waitingSince)}</p>
              </div>
              <span class="pill">${team ? (team.result === "winner" ? "Winner pool" : "Placement pool") : plural(player.gamesPlayed, "game")}</span>
              <button class="text-button" data-pause-player="${player.id}">Pause</button>
            </div>`;
          },
        )
        .join("")
    : `<div class="empty-list">No players are waiting. Add players or finish a live game.</div>`;
}

function renderPlayers() {
  if (state.session.eventType === "tournament") return;
  const query = elements.playerSearch.value.trim().toLowerCase();
  const players = [...state.session.players]
    .filter((player) => player.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));

  $("#players-list").innerHTML = players.length
    ? players
        .map(
          (player) => `
            <div class="player-row">
              <div>
                <p class="row-title">${escapeHtml(player.name)}</p>
                <p class="row-meta">${player.wins}W · ${player.losses}L · Skill ${player.skillLevel >= 0 ? "+" : ""}${player.skillLevel} · ${player.teamPoints} team pts</p>
              </div>
              <span class="pill">${plural(player.gamesPlayed, "game")}</span>
              <span class="status-pill ${player.status}">${player.status}</span>
              <div class="player-actions">
                ${
                  player.status === "playing"
                    ? `<span class="row-meta">On court</span>`
                    : `<button class="text-button" data-toggle-player="${player.id}">${["paused", "left"].includes(player.status) ? "Return to queue" : "Pause"}</button>
                       <button class="text-button danger" data-remove-player="${player.id}">Remove</button>`
                }
              </div>
            </div>`,
        )
        .join("")
    : `<div class="empty-list">${query ? "No matching players." : "No players registered yet."}</div>`;
}

function renderTournament() {
  if (state.session.eventType !== "tournament") return;
  $("#teams-list").innerHTML = state.session.tournamentTeams.length
    ? state.session.tournamentTeams
        .map(
          (team, index) => `<div class="player-row">
            <div><p class="row-title">${escapeHtml(team.name)}</p><p class="row-meta">${escapeHtml(team.players.join(" & "))}</p></div>
            <span class="pill">Seed ${index + 1}</span>
            <span class="status-pill">${team.wins}W · ${team.losses}L</span>
            <button class="text-button danger" data-remove-team="${team.id}" ${state.session.tournamentStarted ? "disabled" : ""}>Remove</button>
          </div>`,
        )
        .join("")
    : `<div class="empty-list">Register at least three teams to begin a round robin.</div>`;
  $("#generate-schedule").disabled =
    state.session.tournamentTeams.length < 3 || state.session.tournamentStarted;

  const ranked = [...state.session.tournamentTeams].sort(
    (a, b) =>
      b.wins - a.wins ||
      (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst) ||
      a.name.localeCompare(b.name),
  );
  $("#standings-list").innerHTML = `
    <div class="standings-row header"><span>#</span><span>Team</span><span>Played</span><span>Won</span><span>Lost</span><span>PF</span><span>Diff</span></div>
    ${ranked
      .map(
        (team, index) => `<div class="standings-row">
          <span class="standings-rank">${index + 1}</span>
          <span class="standings-team">${escapeHtml(team.name)}<small class="row-meta">${escapeHtml(team.players.join(" & "))}</small></span>
          <span>${team.played}</span><span>${team.wins}</span><span>${team.losses}</span>
          <span>${team.pointsFor}</span><span>${team.pointsFor - team.pointsAgainst >= 0 ? "+" : ""}${team.pointsFor - team.pointsAgainst}</span>
        </div>`,
      )
      .join("")}`;

  $("#schedule-list").innerHTML = state.session.tournamentMatches.length
    ? state.session.tournamentMatches
        .map((match) => {
          const teamA = tournamentTeamById(match.teamAId);
          const teamB = tournamentTeamById(match.teamBId);
          return `<div class="history-row">
            <span class="pill">R${match.round}</span>
            <div><p class="row-title">${escapeHtml(teamA?.name || "")} vs ${escapeHtml(teamB?.name || "")}</p><p class="row-meta">${match.status === "playing" ? `Playing on ${escapeHtml(match.courtName || "")}` : match.status}</p></div>
            <span class="history-score">${match.status === "completed" ? escapeHtml(tournamentTeamById(match.winnerId)?.name || "Done") : "—"}</span>
          </div>`;
        })
        .join("")
    : `<div class="empty-list">No schedule generated yet.</div>`;
}

function renderHistory() {
  const history = [...state.session.history].reverse();
  $("#history-list").innerHTML = history.length
    ? history
        .map((game) => {
          const teamA = game.teamANames.join(" & ");
          const teamB = game.teamBNames.join(" & ");
          const matchupLabel =
            game.teamAName && game.teamBName
              ? `${escapeHtml(game.teamAName)} vs ${escapeHtml(game.teamBName)}`
              : `${escapeHtml(teamA)} vs ${escapeHtml(teamB)}`;
          return `
            <div class="history-row">
              <span class="pill">${escapeHtml(game.courtName)}</span>
              <div>
                <p class="row-title">${matchupLabel}</p>
                <p class="row-meta">
                  ${game.teamAName ? `${escapeHtml(teamA)} vs ${escapeHtml(teamB)} · ` : ""}
                  ${formatTime(game.finishedAt)} · ${Math.max(1, Math.round((game.finishedAt - game.startedAt) / 60000))} min
                  ${
                    game.substitutions?.length
                      ? ` · ${game.substitutions.map((sub) => `${escapeHtml(sub.incomingName)} replaced ${escapeHtml(sub.outgoingName)}`).join("; ")}`
                      : ""
                  }
                </p>
              </div>
              <span class="history-score">${
                game.scoreEntered === false
                  ? `Team ${game.winner} won`
                  : `${game.scoreA}–${game.scoreB}`
              }</span>
            </div>`;
        })
        .join("")
    : `<div class="empty-list">Completed games will appear here.</div>`;
}

function renderTabs() {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === state.activeTab));
  ["dashboard", "players", "standings", "history", "guide", "about"].forEach((tab) => {
    $(`#${tab}-panel`).classList.toggle("hidden", tab !== state.activeTab);
  });
}

function switchTab(tab) {
  state.activeTab = tab;
  renderTabs();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openSessionDialog(editing = false) {
  state.editingSession = editing;
  $("#dialog-title").textContent = editing ? "Session settings" : "Start open play";
  $("#save-session-button").textContent = editing ? "Save changes" : "Start session";
  const session = editing ? state.session : null;
  const eventType = session?.eventType || "openplay";
  const eventRadio = $(`input[name="eventType"][value="${eventType}"]`);
  if (eventRadio) eventRadio.checked = true;
  $("#session-name").value = session?.name || "Saturday Open Play";
  $("#court-count").value = session?.courtCount || 4;
  $("#game-format").value = session?.format || "doubles";
  $("#scoring-mode").value = session?.scoringMode || "sideout";
  $("#matchmaking-mode").value = session?.matchmakingMode || "ladder";
  $("#points-to-win").value = session?.pointsToWin || 11;
  $("#win-by").value = String(session?.winBy || 2);
  updateEventPreview();
  elements.sessionDialog.showModal();
}

function selectedEventType() {
  return $('input[name="eventType"]:checked')?.value || "openplay";
}

function updateEventPreview() {
  const eventType = selectedEventType();
  const format = $("#game-format").value;
  const scoring = $("#scoring-mode").value;
  const matchmaking = $("#matchmaking-mode").value;
  const courts = Number($("#court-count").value) || 1;
  const points = Number($("#points-to-win").value) || 11;

  const previews = {
    openplay: {
      title: "Fair Rotation Open Play",
      flow:
        matchmaking === "random"
          ? ["Players check in individually.", "Rested players with fewer games go first.", "Every game creates new random teams.", "The next match loads when a court finishes."]
          : ["Players check in individually.", "First matches establish results.", "Teams are matched or remixed by current level.", "Everyone rests before returning to court."],
      tip: "Best for social sessions where equal playing time matters more than a final champion.",
    },
    ladder: {
      title: matchmaking === "balanced" ? "Balanced Skill Ladder" : "Winner Court Ladder",
      flow: ["The opening round starts from a fair draw.", "Results update each player's skill level.", "Similar-result players meet in later games.", "Standings become more accurate as games accumulate."],
      tip: "Best when players want competitive games against people near their current level.",
    },
    tournament: {
      title: "Fixed-Team Round Robin",
      flow: ["Register each fixed doubles team.", "The app builds every team-vs-team match.", "Free courts receive the next conflict-free match.", "Wins and point difference produce final standings."],
      tip: "Best for a defined competition. Partners stay fixed for the entire event.",
    },
  };
  const preview = previews[eventType];
  $("#preview-title").textContent = preview.title;
  $("#preview-flow").innerHTML = preview.flow.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  $("#preview-format").textContent = eventType === "tournament" ? "Fixed doubles teams" : format === "doubles" ? "Doubles" : "Singles";
  $("#preview-scoring").textContent = `${scoring === "rally" ? "Rally" : "Side-out"} to ${points}`;
  $("#preview-courts").textContent = plural(courts, "court");
  $("#preview-tip").textContent = preview.tip;

  if (eventType === "tournament") {
    $("#game-format").value = "doubles";
    $("#game-format").disabled = true;
    $("#matchmaking-mode").disabled = true;
  } else {
    $("#game-format").disabled = false;
    $("#matchmaking-mode").disabled = false;
    if (eventType === "ladder" && matchmaking === "random") {
      $("#matchmaking-mode").value = "balanced";
    }
  }
}

async function confirmAction(title, message) {
  $("#confirm-title").textContent = title;
  $("#confirm-message").textContent = message;
  elements.confirmDialog.showModal();
  return new Promise((resolve) => {
    elements.confirmDialog.addEventListener(
      "close",
      () => resolve(elements.confirmDialog.returnValue === "confirm"),
      { once: true },
    );
  });
}

function addPlayers(text) {
  const names = text
    .split(/\r?\n|,/)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const existing = new Set(state.session.players.map((player) => player.name.toLowerCase()));
  const unique = names.filter((name) => {
    const key = name.toLowerCase();
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  const joinedAt = now();
  unique.forEach((name, index) => {
    state.session.players.push({
      id: uid("player"),
      name,
      status: "waiting",
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      joinedAt: joinedAt + index,
      waitingSince: joinedAt + index,
    });
  });
  saveSession();
  render();
  return { added: unique.length, skipped: names.length - unique.length };
}

const TEST_FIRST_NAMES = [
  "Aaron", "Abby", "Adrian", "Aira", "Alex", "Andrea", "Angela", "Anton",
  "Bea", "Ben", "Bianca", "Carlo", "Cathy", "Cedric", "Chris", "Dana",
  "Daniel", "Dianne", "Diego", "Elaine", "Ella", "Enzo", "Faith", "Francis",
  "Gab", "Gela", "Gino", "Grace", "Hannah", "Ian", "Iris", "Ivan",
  "Jamie", "Jan", "Jasmine", "JC", "Jenna", "Jerome", "Joanna", "John",
  "Joy", "Julia", "Ken", "Kim", "Kris", "Kyle", "Lara", "Leo",
  "Luis", "Mae", "Marco", "Mara", "Mark", "Mia", "Miguel", "Nica",
  "Nico", "Paolo", "Pat", "Paula", "Rafael", "Ria", "Sam", "Sofia",
  "Tina", "Tristan", "Vince", "Ysa",
];

const TEST_LAST_NAMES = [
  "Aguilar", "Aquino", "Bautista", "Castillo", "Castro", "Chua", "Cruz",
  "Dela Cruz", "Diaz", "Domingo", "Fernandez", "Flores", "Garcia", "Gomez",
  "Gonzales", "Gutierrez", "Hernandez", "Lim", "Lopez", "Mendoza", "Navarro",
  "Ocampo", "Pascual", "Ramos", "Reyes", "Rivera", "Santos", "Sy",
  "Tan", "Torres", "Valdez", "Villanueva",
];

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function generateTestPlayers(count) {
  const combinations = [];
  TEST_FIRST_NAMES.forEach((firstName) => {
    TEST_LAST_NAMES.forEach((lastName) => combinations.push(`${firstName} ${lastName}`));
  });
  const existing = new Set(state.session.players.map((player) => player.name.toLowerCase()));
  const names = shuffle(combinations)
    .filter((name) => !existing.has(name.toLowerCase()))
    .slice(0, count);
  const result = addPlayers(names.join("\n"));
  showToast(`${plural(result.added, "test player")} added to the rotation.`);
}

function addTournamentTeam(name, playerOne, playerTwo) {
  const cleanName = name.trim();
  if (!cleanName || !playerOne.trim() || !playerTwo.trim()) return false;
  if (state.session.tournamentTeams.some((team) => team.name.toLowerCase() === cleanName.toLowerCase())) {
    showToast("That team name is already registered.");
    return false;
  }
  state.session.tournamentTeams.push({
    id: uid("team"),
    name: cleanName,
    players: [playerOne.trim(), playerTwo.trim()],
    played: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  });
  saveSession();
  render();
  return true;
}

function generateTestTeams() {
  const names = shuffle(FUNNY_TEAM_NAMES).slice(0, 8);
  names.forEach((name, index) => {
    if (!state.session.tournamentTeams.some((team) => team.name === name)) {
      addTournamentTeam(name, TEST_FIRST_NAMES[index * 2], TEST_FIRST_NAMES[index * 2 + 1]);
    }
  });
  showToast("Eight test teams are ready.");
}

function convertPlayersToTournamentTeams() {
  const available = state.session.players.filter((player) => player.status !== "playing");
  if (available.length < 4) return;
  const unpaired = available.length % 2;
  const pairable = available.slice(0, available.length - unpaired);
  pairable.forEach((player, index) => {
    if (index % 2 !== 0) return;
    const partner = pairable[index + 1];
    addTournamentTeam(
      `Team ${state.session.tournamentTeams.length + 1}`,
      player.name,
      partner.name,
    );
  });
  showToast(
    `${plural(pairable.length / 2, "team")} created${unpaired ? "; one player remains unpaired" : ""}.`,
  );
  switchTab("players");
}

function generateTournamentSchedule() {
  const teams = state.session.tournamentTeams;
  if (teams.length < 3) return;
  const fixtures = [];
  let round = 1;
  for (let left = 0; left < teams.length; left += 1) {
    for (let right = left + 1; right < teams.length; right += 1) {
      fixtures.push({
        id: uid("match"),
        teamAId: teams[left].id,
        teamBId: teams[right].id,
        round,
        status: "pending",
        winnerId: null,
      });
      round = round >= teams.length - 1 ? 1 : round + 1;
    }
  }
  state.session.tournamentMatches = fixtures;
  state.session.tournamentStarted = true;
  saveSession();
  fillTournamentCourts();
  switchTab("dashboard");
  showToast(`${fixtures.length} round-robin matches scheduled.`);
}

function teamsCurrentlyPlaying() {
  return new Set(
    state.session.tournamentMatches
      .filter((match) => match.status === "playing")
      .flatMap((match) => [match.teamAId, match.teamBId]),
  );
}

function assignTournamentMatch(courtId, silent = false, deferEffects = false) {
  const court = state.session.courts.find((item) => item.id === courtId);
  if (!court || court.closed || court.game || !state.session.tournamentStarted) return false;
  const busy = teamsCurrentlyPlaying();
  const match = state.session.tournamentMatches.find(
    (item) =>
      item.status === "pending" && !busy.has(item.teamAId) && !busy.has(item.teamBId),
  );
  if (!match) {
    if (!silent) showToast("No conflict-free scheduled match is ready yet.");
    return false;
  }
  match.status = "playing";
  match.courtId = court.id;
  match.courtName = court.name;
  match.startedAt = now();
  court.game = { matchId: match.id };
  saveSession();
  const teamA = tournamentTeamById(match.teamAId);
  const teamB = tournamentTeamById(match.teamBId);
  const assignment = {
    courtId,
    teamANames: [teamA?.name || "Team A", ...(teamA?.players || [])],
    teamBNames: [teamB?.name || "Team B", ...(teamB?.players || [])],
  };
  if (!deferEffects) triggerCourtIntros([assignment]);
  return assignment;
}

function fillTournamentCourts() {
  let assignedCount = 0;
  const assignments = [];
  state.session.courts
    .filter((court) => !court.closed && !court.game)
    .forEach((court) => {
      const assignment = assignTournamentMatch(court.id, true, true);
      if (assignment) {
        assignedCount += 1;
        assignments.push(assignment);
      }
    });
  if (assignments.length) {
    saveSession();
    triggerCourtIntros(assignments);
  }
  return assignedCount;
}

function finishTournamentMatch(courtId, winnerSide, finalScoreA = null, finalScoreB = null) {
  const court = state.session.courts.find((item) => item.id === courtId);
  const match = court?.game
    ? state.session.tournamentMatches.find((item) => item.id === court.game.matchId)
    : null;
  if (!court || !match) return;
  const teamA = tournamentTeamById(match.teamAId);
  const teamB = tournamentTeamById(match.teamBId);
  const winner = winnerSide === "A" ? teamA : teamB;
  const loser = winnerSide === "A" ? teamB : teamA;
  winner.played += 1;
  winner.wins += 1;
  const scoreA = finalScoreA ?? (winnerSide === "A" ? state.session.pointsToWin : 0);
  const scoreB = finalScoreB ?? (winnerSide === "B" ? state.session.pointsToWin : 0);
  teamA.pointsFor += scoreA;
  teamA.pointsAgainst += scoreB;
  teamB.pointsFor += scoreB;
  teamB.pointsAgainst += scoreA;
  loser.played += 1;
  loser.losses += 1;
  match.status = "completed";
  match.winnerId = winner.id;
  match.finishedAt = now();
  state.session.history.push({
    id: match.id,
    courtName: court.name,
    teamANames: [teamA.name],
    teamBNames: [teamB.name],
    scoreA,
    scoreB,
    scoreEntered: finalScoreA !== null,
    startedAt: match.startedAt,
    finishedAt: match.finishedAt,
    winner: winnerSide,
  });
  court.game = null;
  const assignedCount = fillTournamentCourts();
  if (!assignedCount) {
    saveSession();
    render();
  }
  showToast(
    assignedCount
      ? `${winner.name} won. ${plural(assignedCount, "scheduled match")} assigned.`
      : `${winner.name} won. This court is waiting for a conflict-free matchup.`,
  );
}

function cancelTournamentMatch(courtId) {
  const court = state.session.courts.find((item) => item.id === courtId);
  const match = court?.game
    ? state.session.tournamentMatches.find((item) => item.id === court.game.matchId)
    : null;
  if (!court || !match) return;
  match.status = "pending";
  delete match.courtId;
  delete match.courtName;
  delete match.startedAt;
  court.game = null;
  saveSession();
  render();
}

function assignCourt(courtId, options = {}) {
  const { silent = false, deferEffects = false } = options;
  const court = state.session.courts.find((item) => item.id === courtId);
  const count = state.session.format === "doubles" ? 4 : 2;
  if (!court || court.closed || court.game) return false;

  let teamAIds;
  let teamBIds;
  let source = "random";

  if (state.session.matchmakingMode === "ladder") {
    const match = findLadderMatch();
    if (match) {
      [teamAIds, teamBIds] = match.map((team) => team.playerIds);
      const usedTeamIds = new Set(match.map((team) => team.id));
      state.session.teamQueue = state.session.teamQueue.filter(
        (team) => !usedTeamIds.has(team.id),
      );
      source = match[0].result;
    }
  }

  if (!teamAIds || !teamBIds) {
    const nextPlayers = rotationCandidates().slice(0, count);
    if (nextPlayers.length < count) {
      if (!silent) {
        showToast(
          state.session.matchmakingMode === "ladder" && state.session.teamQueue.length
            ? "Waiting for another team with the same result."
            : `Need ${count} waiting players to start a game.`,
        );
      }
      return false;
    }
    const half = count / 2;
    if (state.session.matchmakingMode === "balanced" && count === 4) {
      const bySkill = [...nextPlayers].sort(
        (a, b) =>
          b.skillLevel - a.skillLevel ||
          a.gamesPlayed - b.gamesPlayed ||
          a.waitingSince - b.waitingSince,
      );
      teamAIds = [bySkill[0].id, bySkill[3].id];
      teamBIds = [bySkill[1].id, bySkill[2].id];
      source = "balanced";
    } else {
      const randomized = shuffle(nextPlayers);
      teamAIds = randomized.slice(0, half).map((player) => player.id);
      teamBIds = randomized.slice(half).map((player) => player.id);
    }
  }

  const nextPlayers = [...teamAIds, ...teamBIds].map(playerById).filter(Boolean);
  if (nextPlayers.length !== count) {
    if (!silent) showToast("A queued team is no longer available.");
    return false;
  }
  nextPlayers.forEach((player) => {
    player.status = "playing";
  });
  court.game = {
    id: uid("game"),
    teamA: teamAIds,
    teamB: teamBIds,
    teamAName: randomFunnyTeamName(),
    teamBName: "",
    matchSource: source,
    scoreA: 0,
    scoreB: 0,
    servingTeam: "A",
    serverNumber: state.session.format === "doubles" ? 2 : 1,
    serverIndex: 0,
    rallyLog: [],
    startedAt: now(),
  };
  court.game.teamBName = randomFunnyTeamName([court.game.teamAName]);
  const assignment = {
    courtId,
    teamANames: teamAIds.map((id) => playerById(id)?.name).filter(Boolean),
    teamBNames: teamBIds.map((id) => playerById(id)?.name).filter(Boolean),
  };
  if (!deferEffects) {
    saveSession();
    triggerCourtIntro(courtId, assignment.teamANames, assignment.teamBNames);
  }
  return assignment;
}

function fillOpenCourts() {
  if (state.session.eventType === "tournament") {
    fillTournamentCourts();
    return;
  }
  const openCourtIds = state.session.courts
    .filter((court) => !court.closed && !court.game)
    .map((court) => court.id);
  const assignments = [];
  for (const courtId of openCourtIds) {
    const assignment = assignCourt(courtId, {
      silent: true,
      deferEffects: true,
    });
    if (assignment) assignments.push(assignment);
  }

  saveSession();
  render();
  triggerCourtIntros(assignments);

  const remainingOpen = state.session.courts.filter(
    (court) => !court.closed && !court.game,
  ).length;
  if (!assignments.length) {
    showToast(assignmentBlockReason());
  } else if (remainingOpen) {
    showToast(
      `${plural(assignments.length, "court")} filled. ${remainingOpen} remain open: ${assignmentBlockReason()}`,
    );
  } else {
    showToast(`${plural(assignments.length, "court")} filled successfully.`);
  }
}

function assignmentBlockReason() {
  if (state.session.eventType === "tournament") {
    return "No conflict-free tournament match is ready.";
  }
  const playersPerGame = state.session.format === "doubles" ? 4 : 2;
  const waiting = waitingPlayers();
  const free = freeWaitingPlayers();
  const eligible = rotationCandidates();
  if (waiting.length < playersPerGame) {
    return `Only ${waiting.length} players are waiting; ${playersPerGame} are required.`;
  }
  if (state.session.matchmakingMode === "ladder") {
    const winners = teamQueueFor("winner").length;
    const placement = teamQueueFor("loser").length;
    if (state.session.teamQueue.length && winners < 2 && placement < 2) {
      return "The ladder is waiting for another team with the same result.";
    }
  }
  if (free.length < playersPerGame) {
    return "Some waiting players are locked in unmatched ladder teams.";
  }
  if (eligible.length < playersPerGame) {
    return "Players are completing their required rest turn.";
  }
  return "Not enough eligible players are available for another full game.";
}

function autoFillOpenCourts(preferredCourtId) {
  const openCourtIds = state.session.courts
    .filter((court) => !court.closed && !court.game)
    .map((court) => court.id)
    .sort(
      (a, b) =>
        Number(b === preferredCourtId) - Number(a === preferredCourtId),
    );
  let preferredAssigned = false;
  const assignments = [];
  openCourtIds.forEach((courtId) => {
    const assigned = assignCourt(courtId, { silent: true, deferEffects: true });
    if (courtId === preferredCourtId && assigned) preferredAssigned = true;
    if (assigned) assignments.push(assigned);
  });
  if (assignments.length) {
    saveSession();
    triggerCourtIntros(assignments);
  }
  return preferredAssigned;
}

function snapshotGame(game) {
  return {
    scoreA: game.scoreA,
    scoreB: game.scoreB,
    servingTeam: game.servingTeam,
    serverNumber: game.serverNumber,
    serverIndex: game.serverIndex,
  };
}

function firstServerIndexForTeam(game, team) {
  const score = team === "A" ? game.scoreA : game.scoreB;
  return score % 2 === 0 ? 0 : 1;
}

function recordRally(courtId, winner) {
  const game = state.session.courts.find((court) => court.id === courtId)?.game;
  if (!game || winningTeam(game)) return;
  game.rallyLog.push(snapshotGame(game));

  if (state.session.scoringMode === "rally") {
    game[winner === "A" ? "scoreA" : "scoreB"] += 1;
    if (winner !== game.servingTeam) {
      game.servingTeam = winner;
      game.serverNumber = 1;
      game.serverIndex =
        state.session.format === "doubles" ? firstServerIndexForTeam(game, winner) : 0;
    }
  } else if (winner === game.servingTeam) {
    game[winner === "A" ? "scoreA" : "scoreB"] += 1;
  } else if (state.session.format === "singles") {
    game.servingTeam = winner;
    game.serverIndex = 0;
  } else if (game.serverNumber === 1) {
    game.serverNumber = 2;
    game.serverIndex = game.serverIndex === 0 ? 1 : 0;
  } else {
    game.servingTeam = winner;
    game.serverNumber = 1;
    game.serverIndex = firstServerIndexForTeam(game, winner);
  }

  saveSession();
  render();
}

function undoRally(courtId) {
  const game = state.session.courts.find((court) => court.id === courtId)?.game;
  const previous = game?.rallyLog.pop();
  if (!game || !previous) return;
  Object.assign(game, previous);
  saveSession();
  render();
}

function winningTeam(game) {
  const high = Math.max(game.scoreA, game.scoreB);
  const difference = Math.abs(game.scoreA - game.scoreB);
  if (game.scoreA === game.scoreB || high < state.session.pointsToWin || difference < state.session.winBy) {
    return null;
  }
  return game.scoreA > game.scoreB ? "A" : "B";
}

function finishGame(courtId, forcedWinner = null, finalScoreA = null, finalScoreB = null) {
  const court = state.session.courts.find((item) => item.id === courtId);
  if (!court?.game) return;
  const game = court.game;
  if (!forcedWinner && !winningTeam(game)) {
    showToast(`A winner needs at least ${state.session.pointsToWin} points and must win by ${state.session.winBy}.`);
    return;
  }

  const teamA = game.teamA.map(playerById).filter(Boolean);
  const teamB = game.teamB.map(playerById).filter(Boolean);
  const effectiveScoreA = finalScoreA ?? game.scoreA;
  const effectiveScoreB = finalScoreB ?? game.scoreB;
  const aWon = forcedWinner ? forcedWinner === "A" : effectiveScoreA > effectiveScoreB;
  const winners = aWon ? teamA : teamB;
  const losers = aWon ? teamB : teamA;
  const finishedAt = now();
  const recordedScoreA = finalScoreA ?? (forcedWinner
    ? aWon
      ? state.session.pointsToWin
      : 0
    : game.scoreA);
  const recordedScoreB = finalScoreB ?? (forcedWinner
    ? aWon
      ? 0
      : state.session.pointsToWin
    : game.scoreB);

  [...winners, ...losers].forEach((player) => {
    player.gamesPlayed += 1;
    player.status = "waiting";
    player.waitingSince = finishedAt;
    player.availableAfterGame = state.session.history.length + 2;
  });
  winners.forEach((player) => (player.wins += 1));
  losers.forEach((player) => (player.losses += 1));
  const pointMargin = Math.abs(recordedScoreA - recordedScoreB);
  const ratingDelta = 1 + Math.min(4, Math.floor(pointMargin / 3));
  winners.forEach((player) => {
    player.skillLevel = (player.skillLevel || 0) + ratingDelta;
    player.teamPoints =
      (player.teamPoints || 0) + (aWon ? recordedScoreA : recordedScoreB);
  });
  losers.forEach((player) => {
    player.skillLevel = (player.skillLevel || 0) - ratingDelta;
    player.teamPoints =
      (player.teamPoints || 0) + (aWon ? recordedScoreB : recordedScoreA);
  });

  if (state.session.matchmakingMode === "ladder") {
    state.session.teamQueue.push(
      {
        id: uid("team"),
        playerIds: winners.map((player) => player.id),
        result: "winner",
        level:
          winners.reduce((total, player) => total + player.skillLevel, 0) / winners.length,
        waitingSince: finishedAt,
        availableAfterGame: state.session.history.length + 2,
      },
      {
        id: uid("team"),
        playerIds: losers.map((player) => player.id),
        result: "loser",
        level:
          losers.reduce((total, player) => total + player.skillLevel, 0) / losers.length,
        waitingSince: finishedAt,
        availableAfterGame: state.session.history.length + 2,
      },
    );
  }

  state.session.history.push({
    id: game.id,
    courtId: court.id,
    courtName: court.name,
    teamA: game.teamA,
    teamB: game.teamB,
    teamANames: teamA.map((player) => player.name),
    teamBNames: teamB.map((player) => player.name),
    teamAName: game.teamAName,
    teamBName: game.teamBName,
    scoreA: recordedScoreA,
    scoreB: recordedScoreB,
    scoreEntered: finalScoreA !== null || !forcedWinner,
    startedAt: game.startedAt,
    finishedAt,
    winner: aWon ? "A" : "B",
    pointMargin,
    ratingDelta,
    substitutions: game.substitutions || [],
  });
  court.game = null;
  const nextGameAssigned = autoFillOpenCourts(courtId);
  if (!nextGameAssigned) {
    saveSession();
    render();
  }
  showToast(
    nextGameAssigned
      ? `${court.name} result saved. The next matchup was assigned automatically.`
      : state.session.matchmakingMode === "ladder"
        ? `${court.name} result saved. Waiting for a matching team.`
        : `${court.name} result saved. Waiting for enough players.`,
  );
}

function saveFinalResult(courtId) {
  const scoreA = Number(document.querySelector(`[data-final-a="${courtId}"]`)?.value);
  const scoreB = Number(document.querySelector(`[data-final-b="${courtId}"]`)?.value);
  const validation = validateManualFinalScore(scoreA, scoreB);
  if (!validation.valid) {
    showToast(validation.message);
    return;
  }
  finishGame(courtId, scoreA > scoreB ? "A" : "B", scoreA, scoreB);
}

function saveTournamentFinalResult(courtId) {
  const scoreA = Number(document.querySelector(`[data-tournament-final-a="${courtId}"]`)?.value);
  const scoreB = Number(document.querySelector(`[data-tournament-final-b="${courtId}"]`)?.value);
  const validation = validateManualFinalScore(scoreA, scoreB);
  if (!validation.valid) {
    showToast(validation.message);
    return;
  }
  finishTournamentMatch(courtId, scoreA > scoreB ? "A" : "B", scoreA, scoreB);
}

function validateManualFinalScore(scoreA, scoreB) {
  const target = state.session.pointsToWin;
  const winBy = state.session.winBy;
  if (
    !Number.isInteger(scoreA) ||
    !Number.isInteger(scoreB) ||
    scoreA < 0 ||
    scoreB < 0
  ) {
    return { valid: false, message: "Scores must be whole numbers of zero or higher." };
  }
  if (scoreA === scoreB) {
    return { valid: false, message: "A completed game cannot end in a tie." };
  }

  const winnerScore = Math.max(scoreA, scoreB);
  const loserScore = Math.min(scoreA, scoreB);
  const margin = winnerScore - loserScore;
  if (winnerScore < target) {
    return { valid: false, message: `The winner must reach at least ${target} points.` };
  }
  if (margin < winBy) {
    return { valid: false, message: `The winner must lead by ${winBy} points.` };
  }
  if (winnerScore > target) {
    if (loserScore < target - 1) {
      return {
        valid: false,
        message: `Scores above ${target} are allowed only after a ${target - 1}–${target - 1} deuce.`,
      };
    }
    if (margin !== winBy) {
      return {
        valid: false,
        message: `After deuce, the game ends immediately at a ${winBy}-point lead.`,
      };
    }
  }
  return { valid: true };
}

function syncManualScoreLimits(input) {
  const courtId =
    input.dataset.finalA ||
    input.dataset.finalB ||
    input.dataset.tournamentFinalA ||
    input.dataset.tournamentFinalB;
  if (!courtId) return;
  const tournament = "tournamentFinalA" in input.dataset || "tournamentFinalB" in input.dataset;
  const inputA = document.querySelector(
    tournament ? `[data-tournament-final-a="${courtId}"]` : `[data-final-a="${courtId}"]`,
  );
  const inputB = document.querySelector(
    tournament ? `[data-tournament-final-b="${courtId}"]` : `[data-final-b="${courtId}"]`,
  );
  if (!inputA || !inputB) return;
  const deuceReached =
    Number(inputA.value) >= state.session.pointsToWin - 1 ||
    Number(inputB.value) >= state.session.pointsToWin - 1;
  const maximum = deuceReached ? 99 : state.session.pointsToWin;
  inputA.max = String(maximum);
  inputB.max = String(maximum);
}

async function toggleCourt(courtId) {
  const court = state.session.courts.find((item) => item.id === courtId);
  if (!court) return;
  if (court.game) {
    const confirmed = await confirmAction(
      `Close ${court.name}?`,
      "The unfinished game will be cancelled and its players or teams will return to the queue.",
    );
    if (!confirmed) return;
    if (state.session.eventType === "tournament") {
      cancelTournamentMatch(courtId);
    } else {
      if (
        state.session.matchmakingMode === "ladder" &&
        ["winner", "loser"].includes(court.game.matchSource)
      ) {
        [court.game.teamA, court.game.teamB].forEach((playerIds) => {
          state.session.teamQueue.push({
            id: uid("team"),
            playerIds,
            result: court.game.matchSource,
            level:
              playerIds.reduce((total, id) => total + (playerById(id)?.skillLevel || 0), 0) /
              playerIds.length,
            waitingSince: now(),
            availableAfterGame: state.session.history.length,
          });
        });
      }
      [...court.game.teamA, ...court.game.teamB].forEach((id) => {
        const player = playerById(id);
        if (player) player.status = "waiting";
      });
      court.game = null;
    }
  }
  court.closed = !court.closed;
  saveSession();
  render();
  showToast(`${court.name} ${court.closed ? "closed" : "reopened"}.`);
}

async function cancelGame(courtId) {
  const court = state.session.courts.find((item) => item.id === courtId);
  if (!court?.game) return;
  const confirmed = await confirmAction(
    "Cancel this game?",
    "The score will be discarded and all players will return to their previous place in rotation.",
  );
  if (!confirmed) return;
  if (
    state.session.matchmakingMode === "ladder" &&
    ["winner", "loser"].includes(court.game.matchSource)
  ) {
    const restoredAt = now();
    [court.game.teamA, court.game.teamB].forEach((playerIds) => {
      state.session.teamQueue.push({
        id: uid("team"),
        playerIds,
        result: court.game.matchSource,
        level:
          playerIds.reduce((total, id) => total + (playerById(id)?.skillLevel || 0), 0) /
          playerIds.length,
        waitingSince: restoredAt,
      });
    });
  }
  [...court.game.teamA, ...court.game.teamB].forEach((id) => {
    const player = playerById(id);
    if (player) player.status = "waiting";
  });
  court.game = null;
  saveSession();
  render();
}

function removeQueuedTeamForPlayer(id) {
  state.session.teamQueue = state.session.teamQueue.filter(
    (team) => !team.playerIds.includes(id),
  );
}

function substitutePlayer(courtId) {
  if (state.session.eventType === "tournament") return;
  const court = state.session.courts.find((item) => item.id === courtId);
  const outgoingId = document.querySelector(`[data-sub-out="${courtId}"]`)?.value;
  const incomingId = document.querySelector(`[data-sub-in="${courtId}"]`)?.value;
  const outgoing = playerById(outgoingId);
  const incoming = playerById(incomingId);
  if (!court?.game || !outgoing || !incoming || incoming.status !== "waiting") {
    showToast("Choose an active player and an available replacement.");
    return;
  }

  const side = court.game.teamA.includes(outgoingId) ? "teamA" : "teamB";
  const position = court.game[side].indexOf(outgoingId);
  if (position < 0) return;

  removeQueuedTeamForPlayer(incomingId);
  removeQueuedTeamForPlayer(outgoingId);
  court.game[side][position] = incomingId;
  incoming.status = "playing";
  incoming.waitingSince = now();
  outgoing.status = "left";
  outgoing.checkedOutAt = now();
  outgoing.availableAfterGame = 0;
  court.game.substitutions ||= [];
  court.game.substitutions.push({
    outgoingId,
    outgoingName: outgoing.name,
    incomingId,
    incomingName: incoming.name,
    team: side === "teamA" ? "A" : "B",
    at: now(),
  });

  saveSession();
  triggerCourtIntro(
    courtId,
    court.game.teamA.map((id) => playerById(id)?.name).filter(Boolean),
    court.game.teamB.map((id) => playerById(id)?.name).filter(Boolean),
  );
  showToast(`${incoming.name} replaced ${outgoing.name} on ${court.name}.`);
}

function togglePlayer(id) {
  const player = playerById(id);
  if (!player || player.status === "playing") return;
  if (player.status === "waiting") removeQueuedTeamForPlayer(id);
  player.status = ["paused", "left"].includes(player.status) ? "waiting" : "paused";
  if (player.status === "waiting") player.waitingSince = now();
  saveSession();
  render();
}

async function removePlayer(id) {
  const player = playerById(id);
  if (!player || player.status === "playing") return;
  const confirmed = await confirmAction(
    `Remove ${player.name}?`,
    "Their completed game history will stay, but they will leave the current rotation.",
  );
  if (!confirmed) return;
  removeQueuedTeamForPlayer(id);
  state.session.players = state.session.players.filter((item) => item.id !== id);
  saveSession();
  render();
}

function exportSession() {
  const blob = new Blob([JSON.stringify(state.session, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `openplay-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Session backup exported.");
}

async function importSession(file) {
  try {
    const imported = normalizeSession(JSON.parse(await file.text()));
    if (!imported) throw new Error("Invalid session");
    const confirmed =
      !state.session ||
      (await confirmAction(
        "Replace current session?",
        "Your current session will be replaced by this imported backup.",
      ));
    if (!confirmed) return;
    state.session = imported;
    saveSession();
    render();
    showToast("Session imported successfully.");
  } catch {
    showToast("That file is not a valid King of Open Play session.");
  } finally {
    $("#import-input").value = "";
  }
}

function resizeCourts(newCount) {
  const oldCount = state.session.courts.length;
  if (newCount > oldCount) {
    for (let index = oldCount; index < newCount; index += 1) {
      state.session.courts.push({ id: uid("court"), name: `Court ${index + 1}`, closed: false, game: null });
    }
  } else if (newCount < oldCount) {
    const removed = state.session.courts.slice(newCount);
    if (removed.some((court) => court.game)) return false;
    state.session.courts = state.session.courts.slice(0, newCount);
  }
  state.session.courtCount = newCount;
  return true;
}

function bindEvents() {
  const openPublicGuide = () => elements.publicGuideDialog.showModal();
  $("#public-guide-button").addEventListener("click", openPublicGuide);
  $("#hero-guide-button").addEventListener("click", openPublicGuide);
  $("#shuffle-landing-teams").addEventListener("click", shuffleLandingTeamNames);
  $("#close-public-guide").addEventListener("click", () => elements.publicGuideDialog.close());
  $("#guide-start-event").addEventListener("click", () => {
    elements.publicGuideDialog.close();
    openSessionDialog(false);
  });
  $("#create-session-button").addEventListener("click", () => openSessionDialog(false));
  $("#settings-button").addEventListener("click", () => {
    if (state.session) openSessionDialog(true);
    else openSessionDialog(false);
  });
  $("#settings-button").addEventListener("keydown", (event) => {
    if (event.key === "Enter") openSessionDialog(Boolean(state.session));
  });
  $("#voice-toggle").addEventListener("click", () => {
    state.announcerEnabled = !state.announcerEnabled;
    localStorage.setItem(VOICE_KEY, String(state.announcerEnabled));
    if (!state.announcerEnabled && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    updateVoiceToggle();
    showToast(state.announcerEnabled ? "Court announcer enabled." : "Court announcer muted.");
  });

  $("#session-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") {
      elements.sessionDialog.close();
      return;
    }
    const settings = {
      name: $("#session-name").value.trim(),
      eventType: selectedEventType(),
      courtCount: Number($("#court-count").value),
      format: selectedEventType() === "tournament" ? "doubles" : $("#game-format").value,
      scoringMode: $("#scoring-mode").value,
      matchmakingMode:
        selectedEventType() === "tournament"
          ? "tournament"
          : selectedEventType() === "ladder" && $("#matchmaking-mode").value === "random"
            ? "balanced"
            : $("#matchmaking-mode").value,
      pointsToWin: Number($("#points-to-win").value),
      winBy: Number($("#win-by").value),
    };
    if (!settings.name || settings.courtCount < 1) return;
    if (state.editingSession) {
      const hasLiveGames = state.session.courts.some((court) => court.game);
      if (
        hasLiveGames &&
        (settings.format !== state.session.format ||
          settings.scoringMode !== state.session.scoringMode ||
          settings.matchmakingMode !== state.session.matchmakingMode ||
          settings.eventType !== state.session.eventType)
      ) {
        showToast("Finish or cancel live games before changing game or matchmaking settings.");
        return;
      }
      if (!resizeCourts(settings.courtCount)) {
        showToast("Finish or cancel games on removed courts first.");
        return;
      }
      if (
        settings.matchmakingMode !== state.session.matchmakingMode ||
        settings.format !== state.session.format
      ) {
        state.session.teamQueue = [];
      }
      Object.assign(state.session, settings);
    } else {
      state.session = createSession(settings);
    }
    elements.sessionDialog.close();
    saveSession();
    render();
  });

  $$('input[name="eventType"], #court-count, #game-format, #points-to-win, #scoring-mode, #matchmaking-mode').forEach(
    (input) => input.addEventListener("change", updateEventPreview),
  );

  $$(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
  $("#add-player-shortcut").addEventListener("click", () => {
    switchTab("players");
    elements.playerNames.focus();
  });

  $("#player-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const result = addPlayers(elements.playerNames.value);
    elements.playerNames.value = "";
    showToast(
      `${plural(result.added, "player")} added${result.skipped ? `; ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"} skipped` : ""}.`,
    );
  });
  elements.playerSearch.addEventListener("input", renderPlayers);
  $("#generate-test-players").addEventListener("click", () => {
    generateTestPlayers(Number($("#test-player-count").value));
  });
  $("#team-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (addTournamentTeam($("#team-name").value, $("#team-player-one").value, $("#team-player-two").value)) {
      event.currentTarget.reset();
    }
  });
  $("#generate-test-teams").addEventListener("click", generateTestTeams);
  $("#random-team-name").addEventListener("click", () => {
    const existing = state.session?.tournamentTeams?.map((team) => team.name) || [];
    $("#team-name").value = randomFunnyTeamName(existing);
    $("#team-name").focus();
  });
  $("#generate-schedule").addEventListener("click", generateTournamentSchedule);
  $("#fill-courts-button").addEventListener("click", fillOpenCourts);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.assignCourt) assignCourt(button.dataset.assignCourt);
    if (button.dataset.assignTournament) assignTournamentMatch(button.dataset.assignTournament);
    if (button.hasAttribute("data-convert-players")) convertPlayersToTournamentTeams();
    if (button.dataset.tournamentWinner) finishTournamentMatch(...button.dataset.tournamentWinner.split(":"));
    if (button.dataset.cancelTournament) cancelTournamentMatch(button.dataset.cancelTournament);
    if (button.dataset.rallyWinner) recordRally(...button.dataset.rallyWinner.split(":"));
    if (button.dataset.undoRally) undoRally(button.dataset.undoRally);
    if (button.dataset.quickWinner) finishGame(...button.dataset.quickWinner.split(":"));
    if (button.dataset.saveFinal) saveFinalResult(button.dataset.saveFinal);
    if (button.dataset.saveTournamentFinal) saveTournamentFinalResult(button.dataset.saveTournamentFinal);
    if (button.dataset.finishGame) finishGame(button.dataset.finishGame);
    if (button.dataset.cancelGame) cancelGame(button.dataset.cancelGame);
    if (button.dataset.pausePlayer) togglePlayer(button.dataset.pausePlayer);
    if (button.dataset.togglePlayer) togglePlayer(button.dataset.togglePlayer);
    if (button.dataset.removePlayer) removePlayer(button.dataset.removePlayer);
    if (button.dataset.substitute) substitutePlayer(button.dataset.substitute);
    if (button.dataset.toggleCourt) toggleCourt(button.dataset.toggleCourt);
    if (button.dataset.closeAfter) toggleCourt(button.dataset.closeAfter);
    if (button.dataset.removeTeam) {
      state.session.tournamentTeams = state.session.tournamentTeams.filter(
        (team) => team.id !== button.dataset.removeTeam,
      );
      saveSession();
      render();
    }
  });
  document.addEventListener("input", (event) => {
    if (
      event.target.matches(
        "[data-final-a], [data-final-b], [data-tournament-final-a], [data-tournament-final-b]",
      )
    ) {
      syncManualScoreLimits(event.target);
    }
  });

  $("#export-button").addEventListener("click", exportSession);
  $("#import-input").addEventListener("change", (event) => {
    if (event.target.files[0]) importSession(event.target.files[0]);
  });
  $("#new-session-button").addEventListener("click", async () => {
    const confirmed = await confirmAction(
      "Start a new session?",
      "Export a backup first if you want to keep this session. Starting over clears the current local data.",
    );
    if (!confirmed) return;
    state.session = null;
    localStorage.removeItem(STORAGE_KEY);
    state.activeTab = "dashboard";
    render();
    openSessionDialog(false);
  });
}

let deferredInstallPrompt;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  elements.installButton.classList.remove("hidden");
});

elements.installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  elements.installButton.classList.add("hidden");
});

window.addEventListener("appinstalled", () => {
  elements.installButton.classList.add("hidden");
  showToast("King of Open Play installed.");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // The app still works online if service worker registration is unavailable.
    });
  });
}

loadSession();
bindEvents();
updateVoiceToggle();
render();
setInterval(() => {
  if (state.session && state.activeTab === "dashboard") {
    renderStats();
    renderQueue();
  }
}, 60000);
