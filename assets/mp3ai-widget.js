(function () {
  "use strict";

  /* ============================================================
     CONFIG
  ============================================================ */
  const STORE_KEY  = "mp3king_ai_chat";
  const AI_NAME    = "Kingy";
  const ROUTE      = "#kingy";
  const ROUTE_CHAT = id => `#kingy-${id}`;
  const GATEWAY_ENDPOINT = "/api/kingy-chat";
  const ACTION_RE  = /\[\[ACTION\]\]([\s\S]*?)\[\[\/ACTION\]\]/;

  /* ============================================================
     LOCALSTORAGE KEYS (mirrors the app)
  ============================================================ */
  const LS = {
    theme:     "mp3king_theme",
    settings:  "mp3king_settings",
    playlists: "mp3king_local_playlists",
    likedIds:  "mp3king_liked_ids",
    likedTrks: "mp3king_liked_tracks",
    artists:   "mp3king_saved_artists",
    albums:    "mp3king_saved_albums",
    history:   "mp3king_search_history",
    stats:     "mp3king_listening_stats",
    profile:   "mp3king_profile",
  };

  /* ============================================================
     CLOUD INFERENCE (DuckDuckGo AI Chat via our own /api proxy —
     fully anonymous, no signup, no API key)
  ============================================================ */
  async function streamLLM(messages, onToken) {
    const res = await fetch(GATEWAY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || ("LLM error " + res.status));
    }
    const data = await res.json();
    const full = (data?.text || "").trim();
    onToken(full);
    return full;
  }

  /* ============================================================
     STYLES
  ============================================================ */
  const style = document.createElement("style");
  style.textContent = `
  #mp3ai-anchor-btn { font-family:inherit; cursor:pointer; border:none; outline:none; }
  #mp3ai-anchor-btn {
    width:100%; margin-top:18px;
    background:linear-gradient(180deg,#111 0%,#050505 100%);
    color:#facc15; border:1.5px solid #facc15;
    padding:13px 16px; border-radius:14px;
    font-weight:700; font-size:13.5px;
    display:flex; align-items:center; justify-content:center; gap:8px;
    transition:background .15s,transform .1s,box-shadow .2s;
  }
  #mp3ai-anchor-btn:hover { background:#1a1a1a; box-shadow:0 0 14px rgba(250,204,21,.25); }
  #mp3ai-anchor-btn:active { transform:scale(.98); }
  .mp3ai-spark { width:16px; height:16px; flex-shrink:0; animation:mp3ai-spin 3.5s linear infinite; }
  @keyframes mp3ai-spin { to { transform:rotate(360deg); } }

  #mp3ai-overlay {
    position:fixed; inset:0; z-index:999999;
    background:radial-gradient(circle at 50% 0%,#161200 0%,#050505 55%);
    display:flex; opacity:0; pointer-events:none;
    transform:translateY(14px);
    transition:opacity .25s ease, transform .25s ease;
    font-family:inherit;
  }
  #mp3ai-overlay.mp3ai-open { opacity:1; pointer-events:auto; transform:translateY(0); }
  #mp3ai-main { flex:1; display:flex; flex-direction:column; min-width:0; }

  /* sidebar */
  #mp3ai-sidebar {
    width:260px; flex-shrink:0; background:#0a0a0a; border-right:1px solid #1c1c1c;
    display:flex; flex-direction:column;
    transform:translateX(-100%); transition:transform .25s ease;
    position:absolute; top:0; bottom:0; left:0; z-index:2;
  }
  #mp3ai-sidebar.open { transform:translateX(0); }
  #mp3ai-sidebar-head { padding:16px; border-bottom:1px solid #1c1c1c; }
  #mp3ai-new-chat {
    width:100%; background:#facc15; color:#0a0a0a; border:none; font-weight:700;
    padding:10px 12px; border-radius:12px; cursor:pointer; font-size:13px;
    display:flex; align-items:center; justify-content:center; gap:6px;
  }
  #mp3ai-chat-list { flex:1; overflow-y:auto; padding:8px; }
  .mp3ai-chat-item {
    display:flex; align-items:center; justify-content:space-between; gap:6px;
    padding:10px 12px; border-radius:10px; cursor:pointer; margin-bottom:2px;
    color:#c9c9c9; font-size:13px;
  }
  .mp3ai-chat-item:hover { background:#131313; }
  .mp3ai-chat-item.active { background:#1a1a08; color:#facc15; }
  .mp3ai-chat-item span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .mp3ai-chat-del { opacity:.5; flex-shrink:0; background:none; border:none; color:inherit; cursor:pointer; padding:2px; }
  .mp3ai-chat-del:hover { opacity:1; color:#ef4444; }
  #mp3ai-sidebar-backdrop {
    position:absolute; inset:0; background:rgba(0,0,0,.5);
    opacity:0; pointer-events:none; transition:opacity .2s; z-index:1;
  }
  #mp3ai-sidebar-backdrop.open { opacity:1; pointer-events:auto; }

  /* header */
  #mp3ai-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:16px 18px; border-bottom:1px solid #1c1c1c; flex-shrink:0;
  }
  #mp3ai-header .mp3ai-left { display:flex; align-items:center; gap:10px; }
  #mp3ai-header .mp3ai-title-wrap { display:flex; flex-direction:column; gap:2px; }
  #mp3ai-header .mp3ai-title {
    color:#facc15; font-weight:800; font-size:17px; letter-spacing:.3px;
    display:flex; align-items:center; gap:8px;
    text-shadow:0 0 18px rgba(250,204,21,.35);
  }
  #mp3ai-header .mp3ai-subtitle { color:#6b6b6b; font-size:11px; font-weight:500; margin-left:24px; }
  .mp3ai-icon-btn {
    background:transparent; border:none; color:#e5e5e5;
    width:36px; height:36px; border-radius:999px;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; transition:background .15s; flex-shrink:0;
  }
  .mp3ai-icon-btn:active { background:#1a1a1a; }

  /* body + empty */
  #mp3ai-body { flex:1; overflow-y:auto; padding:18px 16px; display:flex; flex-direction:column; gap:14px; }
  #mp3ai-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:20px; text-align:center; padding:0 24px; }

  /* mascot */
  .mp3ai-mascot {
    display:grid; grid-template-columns:repeat(11,11px); grid-template-rows:repeat(9,11px); gap:2px;
    animation:mp3ai-bob 2.4s ease-in-out infinite;
    filter:drop-shadow(0 10px 16px rgba(250,204,21,.18));
  }
  @keyframes mp3ai-bob { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-7px) rotate(-1.5deg)} }
  .mp3ai-cube { width:11px; height:11px; border-radius:3px; background:linear-gradient(155deg,#fde047 0%,#facc15 45%,#d4a309 100%); box-shadow:inset -2px -2px 0 rgba(0,0,0,.22),inset 2px 2px 0 rgba(255,255,255,.25); }
  .mp3ai-cube.dark { background:#050505; box-shadow:inset -1px -1px 0 rgba(255,255,255,.05); animation:mp3ai-blink 4.5s infinite; }
  .mp3ai-cube.orange { background:linear-gradient(155deg,#fb923c 0%,#f97316 45%,#ea580c 100%); box-shadow:inset -2px -2px 0 rgba(0,0,0,.22),inset 2px 2px 0 rgba(255,255,255,.2); }
  .mp3ai-cube.empty { background:transparent; box-shadow:none; }
  @keyframes mp3ai-blink { 0%,90%,100%{transform:scaleY(1)} 95%{transform:scaleY(.15)} }

  #mp3ai-empty h2 { color:#f5f5f5; font-size:22px; font-weight:800; margin:0; letter-spacing:-.2px; }
  #mp3ai-empty p { color:#8a8a8a; font-size:13px; margin:0; max-width:280px; line-height:1.5; }
  .mp3ai-suggestions { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:6px; }
  .mp3ai-chip { background:#131313; border:1px solid #2a2a2a; color:#e0e0e0; font-size:12px; padding:9px 14px; border-radius:999px; cursor:pointer; transition:border-color .15s,transform .1s; }
  .mp3ai-chip:hover { border-color:#facc15; }
  .mp3ai-chip:active { transform:scale(.96); }

  /* messages */
  .mp3ai-row { display:flex; flex-direction:column; max-width:84%; }
  .mp3ai-row.user { align-self:flex-end; align-items:flex-end; }
  .mp3ai-row.assistant { align-self:flex-start; align-items:flex-start; }
  .mp3ai-msg { padding:12px 15px; border-radius:18px; font-size:14.5px; line-height:1.5; white-space:pre-wrap; word-break:break-word; animation:mp3ai-rise .22s ease; cursor:pointer; }
  @keyframes mp3ai-rise { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .mp3ai-row.user .mp3ai-msg { background:linear-gradient(135deg,#fde047,#facc15); color:#0a0a0a; font-weight:500; border-bottom-right-radius:4px; }
  .mp3ai-row.assistant .mp3ai-msg { background:#131313; color:#ececec; border:1px solid #1e1e1e; border-bottom-left-radius:4px; }
  .mp3ai-msg img { max-width:100%; border-radius:14px; margin-top:10px; display:block; border:1px solid #2a2a2a; }
  .mp3ai-cursor { display:inline-block; width:7px; height:14px; background:#facc15; margin-left:2px; vertical-align:-2px; animation:mp3ai-caret .8s steps(1) infinite; }
  @keyframes mp3ai-caret { 50%{opacity:0} }

  .mp3ai-msg-actions { display:flex; gap:6px; margin-top:4px; max-height:0; overflow:hidden; transition:max-height .18s ease; }
  .mp3ai-row.actions-open .mp3ai-msg-actions { max-height:40px; }
  .mp3ai-msg-actions button { background:#131313; border:1px solid #2a2a2a; color:#d4d4d4; font-size:11px; padding:6px 10px; border-radius:999px; cursor:pointer; display:flex; align-items:center; gap:5px; }
  .mp3ai-msg-actions button:hover { border-color:#facc15; color:#facc15; }

  /* action confirm card */
  .mp3ai-action-card { background:#131313; border:1.5px solid #facc15; border-radius:16px; padding:14px; max-width:84%; align-self:flex-start; font-size:13.5px; color:#ececec; animation:mp3ai-rise .22s ease; }
  .mp3ai-action-card .mp3ai-action-label { color:#facc15; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.5px; margin-bottom:6px; }
  .mp3ai-action-card .mp3ai-action-desc { margin-bottom:12px; line-height:1.45; }
  .mp3ai-action-buttons { display:flex; gap:8px; }
  .mp3ai-action-buttons button { flex:1; padding:9px; border-radius:10px; font-size:12.5px; font-weight:700; border:none; cursor:pointer; }
  .mp3ai-approve { background:#facc15; color:#0a0a0a; }
  .mp3ai-cancel  { background:#1f1f1f; color:#aaa; }
  .mp3ai-action-result { font-size:12px; color:#8a8a8a; margin-top:8px; }

  .mp3ai-typing { display:flex; gap:4px; padding:4px 2px; }
  .mp3ai-typing span { width:6px; height:6px; border-radius:50%; background:#facc15; animation:mp3ai-typing 1.1s infinite ease-in-out; }
  .mp3ai-typing span:nth-child(2){animation-delay:.15s}
  .mp3ai-typing span:nth-child(3){animation-delay:.3s}
  @keyframes mp3ai-typing { 0%,60%,100%{transform:translateY(0);opacity:.5} 30%{transform:translateY(-5px);opacity:1} }

  /* input bar */
  #mp3ai-inputbar { flex-shrink:0; display:flex; align-items:flex-end; gap:10px; padding:12px 14px calc(14px + env(safe-area-inset-bottom)); border-top:1px solid #1c1c1c; background:#050505; }
  #mp3ai-input { flex:1; resize:none; max-height:110px; background:#131313; border:1.5px solid #262626; color:#f5f5f5; border-radius:20px; padding:12px 16px; font-size:14.5px; font-family:inherit; outline:none; transition:border-color .15s,box-shadow .15s; }
  #mp3ai-input:focus { border-color:#facc15; box-shadow:0 0 0 3px rgba(250,204,21,.12); }
  #mp3ai-send { width:44px; height:44px; border-radius:50%; flex-shrink:0; background:linear-gradient(135deg,#fde047,#facc15); color:#0a0a0a; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:transform .1s; }
  #mp3ai-send:active { transform:scale(.92); }
  #mp3ai-send:disabled { opacity:.4; }
  @media(max-width:640px){ #mp3ai-sidebar{width:78vw;} }
  `;
  document.head.appendChild(style);

  /* ============================================================
     ICONS
  ============================================================ */
  const svgClose = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
  const svgSpark = `<svg class="mp3ai-spark" viewBox="0 0 24 24" fill="#facc15"><path d="M12 1l2.6 7.4L22 11l-7.4 2.6L12 21l-2.6-7.4L2 11l7.4-2.6z"/></svg>`;
  const svgSend  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-8-8 18-2-8-8-2z"/></svg>`;
  const svgMenu  = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`;
  const svgCopy  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const svgRedo  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`;
  const svgTrash = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>`;
  const svgPlus  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;

  /* ============================================================
     STORAGE HELPERS
  ============================================================ */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function lsGet(k, fb) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  function lsSetRaw(k, v) { try { localStorage.setItem(k, v); } catch {} }

  /* ============================================================
     CHAT STORE
  ============================================================ */
  function readJSON(k, fb) { return lsGet(k, fb); }
  function loadStore() {
    let s = readJSON(STORE_KEY, null);
    if (!s || Array.isArray(s)) {
      const id = uid();
      s = { activeId: id, chats: { [id]: { id, title: "New chat", messages: Array.isArray(s) ? s : [], updatedAt: Date.now() } } };
      saveStore(s);
    }
    return s;
  }
  function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {} }
  function getActiveChat(s) { return s.chats[s.activeId] || Object.values(s.chats)[0]; }
  function titleFromText(t) { const x = t.trim().slice(0, 40); return x.length === t.trim().length ? x : x + "..."; }

  /* ============================================================
     APP DATA HELPERS
  ============================================================ */
  function getPlaylists() { return lsGet(LS.playlists, []); }
  function savePlaylists(pl) { lsSet(LS.playlists, pl); }
  function getLikedIds() { try { return new Set(JSON.parse(localStorage.getItem(LS.likedIds) || "[]")); } catch { return new Set(); } }
  function getLikedTracks() { return lsGet(LS.likedTrks, []); }
  function getSettings() { return lsGet(LS.settings, {}); }
  function getTheme() { return localStorage.getItem(LS.theme) || "dark"; }
  function getNowPlaying() {
    try { const md = navigator.mediaSession?.metadata; if (md?.title) return `${md.title}${md.artist ? " - " + md.artist : ""}`; } catch {}
    const au = window._mp3Au;
    if (au && !au.paused && au.src) return au.src.split("/").pop().split("?")[0] || "unknown";
    return "nothing";
  }

  /* ============================================================
     USER CONTEXT FOR SYSTEM PROMPT
  ============================================================ */
  function buildUserContext() {
    const liked     = getLikedTracks();
    const stats     = lsGet(LS.stats, {});
    const profile   = lsGet(LS.profile, {});
    const playlists = getPlaylists();
    const theme     = getTheme();
    const settings  = getSettings();
    const nowPlaying = getNowPlaying();
    const likedList  = Array.isArray(liked) ? liked.slice(-20).map(t => `${t.title || "?"} - ${t.artist || "?"}`).join("; ") : "";
    const plStr      = Array.isArray(playlists) ? playlists.map(p => `"${p.name}"(id:${p.id},${(p.tracks || []).length}tr)`).join("; ") : "";
    return [
      `User: ${profile?.name || "unknown"}.`,
      `Theme: ${theme}. Font size: ${settings?.fontSize || "medium"}. Compact mode: ${settings?.compactMode ? "on" : "off"}.`,
      `Now playing: ${nowPlaying}.`,
      `Stats: ${stats?.totalTracks || 0} tracks, ${Math.round((stats?.totalSeconds || 0) / 60)}min total.`,
      `Liked (recent): ${likedList || "none"}.`,
      `Playlists: ${plStr || "none"}.`,
    ].join(" ");
  }

  function systemPrompt() {
    const ctx = buildUserContext();
    return `You are Kingy, a friendly and capable music AI assistant embedded in mp3king.

## Your capabilities
You can take real actions inside mp3king on behalf of the user. When the user asks you to do something in the app, respond naturally AND emit a single [[ACTION]]...[[/ACTION]] block with a JSON object describing the action. The user must confirm before the action runs.

## Available actions (emit ONE per reply):
- Like a track:          {"action":"like_track","query":"Song - Artist"}
- Unlike a track:        {"action":"unlike_track","query":"Song - Artist"}
- Create playlist:       {"action":"create_playlist","name":"My Playlist","description":"optional"}
- Delete playlist:       {"action":"delete_playlist","playlistName":"My Playlist"}
- Rename playlist:       {"action":"rename_playlist","playlistName":"Old Name","newName":"New Name"}
- Add track to playlist: {"action":"add_to_playlist","query":"Song - Artist","playlistName":"My Playlist"}
- Add MULTIPLE tracks:   {"action":"add_multiple_to_playlist","tracks":["Song1 - Artist1","Song2 - Artist2"],"playlistName":"My Playlist"}
- Import Spotify playlist: {"action":"import_spotify_playlist","url":"https://open.spotify.com/playlist/..."}
- Remove from playlist:  {"action":"remove_from_playlist","query":"Song - Artist","playlistName":"My Playlist"}
- Clear liked tracks:    {"action":"clear_liked"}
- Play preview:          {"action":"play_preview","query":"Song - Artist"}
- Pause playback:        {"action":"pause_playback"}
- Resume playback:       {"action":"resume_playback"}
- Set volume:            {"action":"set_volume","volume":80}
- Change theme:          {"action":"set_theme","theme":"dark"} (options: dark, light, amoled)
- Change font size:      {"action":"update_setting","key":"fontSize","value":"large"} (options: small, medium, large)
- Toggle compact mode:   {"action":"update_setting","key":"compactMode","value":true}
- Toggle crossfade:      {"action":"update_setting","key":"crossfade","value":true}
- Toggle explicit filter:{"action":"update_setting","key":"explicitFilter","value":true}
- Toggle normalize vol:  {"action":"update_setting","key":"normalizeVolume","value":true}

## Rules
- Only talk about music and mp3king. Keep replies short and friendly.
- Always explain what you're about to do before the [[ACTION]] block.
- Emit the [[ACTION]] block at the END of your message, NEVER in the middle.
- Only emit one action per reply.
- When the user asks to add multiple songs at once, use add_multiple_to_playlist with all tracks in the array — never do them one by one.
- When the user asks to like multiple songs, use like_multiple with a tracks array.
- If the user's request is ambiguous, ask for clarification before acting.

## User info: ${ctx}`;
  }

  /* ============================================================
     ITUNES SEARCH
  ============================================================ */
  async function searchTrack(q) {
    try {
      const r = await fetch("https://itunes.apple.com/search?term=" + encodeURIComponent(q) + "&media=music&limit=1");
      const d = await r.json();
      const t = d.results?.[0];
      if (!t) return null;
      return {
        id: "itunes-" + t.trackId,
        title: t.trackName,
        artist: t.artistName,
        album: t.collectionName || "",
        duration: "0:00",
        coverUrl: (t.artworkUrl100 || "/placeholder.svg").replace("100x100", "512x512"),
        previewUrl: t.previewUrl || null,
      };
    } catch { return null; }
  }

  /* ============================================================
     ACTION DESCRIPTIONS (shown in confirm card)
  ============================================================ */
  function actionDesc(a) {
    switch (a.action) {
      case "like_track":         return `Like "${a.query}"`;
      case "unlike_track":       return `Remove "${a.query}" from liked tracks`;
      case "create_playlist":    return `Create a new playlist: "${a.name}"${a.description ? ` — ${a.description}` : ""}`;
      case "delete_playlist":    return `Delete the playlist "${a.playlistName}" permanently`;
      case "rename_playlist":    return `Rename "${a.playlistName}" → "${a.newName}"`;
      case "add_to_playlist":    return `Add "${a.query}" to playlist "${a.playlistName}"`;
      case "remove_from_playlist": return `Remove "${a.query}" from playlist "${a.playlistName}"`;
      case "add_multiple_to_playlist": return `Add ${a.tracks?.length || 0} tracks to playlist "${a.playlistName}": ${(a.tracks||[]).slice(0,3).join(", ")}${a.tracks?.length > 3 ? ` +${a.tracks.length-3} more` : ""}`;
      case "like_multiple":      return `Like ${a.tracks?.length || 0} tracks: ${(a.tracks||[]).slice(0,3).join(", ")}${a.tracks?.length > 3 ? ` +${a.tracks.length-3} more` : ""}`;
      case "import_spotify_playlist": return `Import Spotify playlist from: ${a.url}`;
      case "clear_liked":        return `Clear ALL liked tracks (cannot be undone)`;
      case "play_preview":       return `Play a preview of "${a.query}"`;
      case "pause_playback":     return `Pause current playback`;
      case "resume_playback":    return `Resume playback`;
      case "set_volume":         return `Set volume to ${a.volume}%`;
      case "set_theme":          return `Switch app theme to "${a.theme}"`;
      case "update_setting":     return `Set ${a.key} to "${a.value}"`;
      default:                   return "Run this action";
    }
  }

  /* ============================================================
     EXECUTE ACTION
  ============================================================ */
  async function executeAction(a) {
    switch (a.action) {

      /* — LIKE / UNLIKE — */
      case "like_track": {
        const t = await searchTrack(a.query);
        if (!t) throw new Error("Track not found on iTunes.");
        const ids = getLikedIds();
        const tracks = getLikedTracks();
        if (ids.has(t.id)) return `"${t.title} - ${t.artist}" is already liked.`;
        ids.add(t.id);
        tracks.push({ id: t.id, title: t.title, artist: t.artist, album: t.album, coverUrl: t.coverUrl });
        localStorage.setItem(LS.likedIds, JSON.stringify([...ids]));
        lsSet(LS.likedTrks, tracks);
        return `❤️ Liked "${t.title} - ${t.artist}".`;
      }

      case "unlike_track": {
        const t = await searchTrack(a.query);
        if (!t) throw new Error("Track not found on iTunes.");
        const ids = getLikedIds();
        const tracks = getLikedTracks().filter(x => x.id !== t.id);
        ids.delete(t.id);
        localStorage.setItem(LS.likedIds, JSON.stringify([...ids]));
        lsSet(LS.likedTrks, tracks);
        return `Removed "${t.title} - ${t.artist}" from liked.`;
      }

      case "like_multiple": {
        const ids = getLikedIds();
        const tracks = getLikedTracks();
        let added = 0;
        for (const q of (a.tracks || [])) {
          const t = await searchTrack(q);
          if (t && !ids.has(t.id)) {
            ids.add(t.id);
            tracks.push({ id: t.id, title: t.title, artist: t.artist, album: t.album, coverUrl: t.coverUrl });
            added++;
          }
        }
        localStorage.setItem(LS.likedIds, JSON.stringify([...ids]));
        lsSet(LS.likedTrks, tracks);
        return `❤️ Liked ${added} tracks.`;
      }

      case "clear_liked": {
        localStorage.setItem(LS.likedIds, "[]");
        lsSet(LS.likedTrks, []);
        return "All liked tracks cleared.";
      }

      case "import_spotify_playlist": {
        const spMatch = a.url?.match(/playlist\/([A-Za-z0-9]+)/);
        if (!spMatch) throw new Error("Invalid Spotify playlist URL.");
        const spId = spMatch[1];

        // Get client credentials from localStorage
        const spClientId = localStorage.getItem("mp3king_sp_client_id");
        const spClientSecret = localStorage.getItem("mp3king_sp_client_secret");
        if (!spClientId || !spClientSecret) throw new Error("Spotify not connected. Go to Library → Import → paste a Spotify link and follow the setup prompt to connect your free Spotify Developer credentials.");

        // Get token via Client Credentials flow (client-side, no proxy needed)
        const spTokRes = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: { "Authorization": "Basic " + btoa(spClientId + ":" + spClientSecret), "Content-Type": "application/x-www-form-urlencoded" },
          body: "grant_type=client_credentials",
          signal: (typeof AbortSignal.timeout==="function"?AbortSignal.timeout(8000):undefined),
        });
        if (!spTokRes.ok) throw new Error("Invalid Spotify credentials. Check your Client ID and Secret.");
        const { access_token: spTok } = await spTokRes.json();

        // Fetch playlist
        const fields = "name,description,images,tracks.total,tracks.items(track(id,name,duration_ms,artists(name),album(name,images)))";
        const spPlRes = await fetch(`https://api.spotify.com/v1/playlists/${spId}?fields=${encodeURIComponent(fields)}`, {
          headers: { Authorization: `Bearer ${spTok}` }, signal: (typeof AbortSignal.timeout==="function"?AbortSignal.timeout(10000):undefined),
        });
        if (!spPlRes.ok) throw new Error("Playlist not found or private.");
        const spPl = await spPlRes.json();

        let spItems = spPl.tracks.items || [];
        let spOff = 100;
        while (spOff < (spPl.tracks.total || 0) && spOff < 500) {
          const pg = await fetch(`https://api.spotify.com/v1/playlists/${spId}/tracks?offset=${spOff}&limit=100`, { headers: { Authorization: `Bearer ${spTok}` } });
          if (!pg.ok) break;
          const p = await pg.json(); spItems = spItems.concat(p.items || []); spOff += 100;
        }

        const spTracks = spItems.map(item => {
          const t = item?.track; if (!t?.name) return null;
          const ds = Math.floor((t.duration_ms || 0) / 1000);
          return { id: "spotify-" + (t.id || uid()), title: t.name, artist: t.artists?.[0]?.name || "Unknown", album: t.album?.name || "", duration: `${Math.floor(ds/60)}:${String(ds%60).padStart(2,"0")}`, coverUrl: t.album?.images?.[0]?.url || "/placeholder.svg" };
        }).filter(Boolean);

        if (!spTracks.length) throw new Error("No tracks found — playlist may be empty or private.");
        const spNewPl = { id: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: spPl.name || "Spotify Playlist", description: spPl.description || "", coverUrl: spPl.images?.[0]?.url || "", tracks: spTracks, createdAt: Date.now() };
        savePlaylists([spNewPl, ...getPlaylists()]);
        return `🟢 Imported "${spNewPl.name}" — ${spTracks.length} tracks. Refresh to see it!`;
      }

      /* — PLAYLISTS — */
      case "create_playlist": {
        const pl = getPlaylists();
        const newPl = {
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: a.name,
          description: a.description || "",
          coverUrl: "",
          tracks: [],
          createdAt: Date.now(),
        };
        savePlaylists([newPl, ...pl]);
        return `🎵 Playlist "${a.name}" created! Refresh to see it in your library.`;
      }

      case "delete_playlist": {
        const pl = getPlaylists();
        const match = pl.find(p => p.name.toLowerCase() === a.playlistName.toLowerCase());
        if (!match) throw new Error(`Playlist "${a.playlistName}" not found.`);
        savePlaylists(pl.filter(p => p.id !== match.id));
        return `🗑️ Playlist "${match.name}" deleted. Refresh to see the change.`;
      }

      case "rename_playlist": {
        const pl = getPlaylists();
        const match = pl.find(p => p.name.toLowerCase() === a.playlistName.toLowerCase());
        if (!match) throw new Error(`Playlist "${a.playlistName}" not found.`);
        savePlaylists(pl.map(p => p.id === match.id ? { ...p, name: a.newName } : p));
        return `✏️ Renamed "${a.playlistName}" to "${a.newName}". Refresh to see the change.`;
      }

      case "add_to_playlist": {
        const pl = getPlaylists();
        const match = pl.find(p => p.name.toLowerCase() === a.playlistName.toLowerCase());
        if (!match) throw new Error(`Playlist "${a.playlistName}" not found.`);
        const t = await searchTrack(a.query);
        if (!t) throw new Error("Track not found on iTunes.");
        if (match.tracks.find(x => x.id === t.id)) return `"${t.title}" is already in "${match.name}".`;
        match.tracks.push({ id: t.id, title: t.title, artist: t.artist, album: t.album, duration: t.duration, coverUrl: t.coverUrl });
        savePlaylists(pl);
        return `✅ Added "${t.title} - ${t.artist}" to "${match.name}". Refresh to see it.`;
      }

      case "add_multiple_to_playlist": {
        const pl = getPlaylists();
        const match = pl.find(p => p.name.toLowerCase() === a.playlistName.toLowerCase());
        if (!match) throw new Error(`Playlist "${a.playlistName}" not found.`);
        let added = 0, skipped = 0;
        for (const q of (a.tracks || [])) {
          const t = await searchTrack(q);
          if (!t) { skipped++; continue; }
          if (match.tracks.find(x => x.id === t.id)) { skipped++; continue; }
          match.tracks.push({ id: t.id, title: t.title, artist: t.artist, album: t.album, duration: t.duration, coverUrl: t.coverUrl });
          added++;
        }
        savePlaylists(pl);
        return `✅ Added ${added} tracks to "${match.name}"${skipped ? ` (${skipped} skipped)` : ""}. Refresh to see them.`;
      }

      case "remove_from_playlist": {
        const pl = getPlaylists();
        const match = pl.find(p => p.name.toLowerCase() === a.playlistName.toLowerCase());
        if (!match) throw new Error(`Playlist "${a.playlistName}" not found.`);
        const before = match.tracks.length;
        match.tracks = match.tracks.filter(t => !(t.title + " " + t.artist).toLowerCase().includes(a.query.toLowerCase()));
        if (match.tracks.length === before) throw new Error(`"${a.query}" not found in that playlist.`);
        savePlaylists(pl);
        return `Removed "${a.query}" from "${match.name}". Refresh to see the change.`;
      }

      /* — PLAYBACK — */
      case "play_preview": {
        const t = await searchTrack(a.query);
        if (!t) throw new Error("Track not found on iTunes.");
        if (!t.previewUrl) throw new Error(`No preview available for "${t.title}".`);
        const au = window._mp3Au;
        if (!au) throw new Error("Audio engine not ready.");
        au.src = t.previewUrl;
        au.volume = au.volume || 0.7;
        await au.play();
        navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album, artwork: [{ src: t.coverUrl }] });
        return `▶️ Playing 30-second preview of "${t.title} - ${t.artist}".`;
      }

      case "pause_playback": {
        const au = window._mp3Au;
        if (!au || au.paused) return "Nothing is playing.";
        au.pause();
        return "⏸ Paused.";
      }

      case "resume_playback": {
        const au = window._mp3Au;
        if (!au) throw new Error("Audio engine not ready.");
        if (!au.paused) return "Already playing.";
        await au.play();
        return "▶️ Resumed.";
      }

      case "set_volume": {
        const vol = Math.max(0, Math.min(100, Number(a.volume)));
        const au = window._mp3Au;
        if (au) au.volume = vol / 100;
        return `🔊 Volume set to ${vol}%.`;
      }

      /* — THEME & SETTINGS — */
      case "set_theme": {
        const validThemes = ["dark", "light", "amoled"];
        if (!validThemes.includes(a.theme)) throw new Error(`Unknown theme "${a.theme}". Valid: dark, light, amoled.`);
        lsSetRaw(LS.theme, a.theme);
        document.documentElement.setAttribute("data-theme", a.theme);
        // Also try to trigger React's context via a storage event
        window.dispatchEvent(new StorageEvent("storage", { key: LS.theme, newValue: a.theme, storageArea: localStorage }));
        return `🎨 Theme switched to "${a.theme}".`;
      }

      case "update_setting": {
        const settings = getSettings();
        const prev = settings[a.key];
        settings[a.key] = a.value;
        lsSet(LS.settings, settings);
        // Apply font size immediately if set
        if (a.key === "fontSize") {
          document.documentElement.setAttribute("data-font-size", a.value);
        }
        window.dispatchEvent(new StorageEvent("storage", { key: LS.settings, newValue: JSON.stringify(settings), storageArea: localStorage }));
        return `⚙️ Setting "${a.key}" changed from "${prev}" to "${a.value}". Refresh to apply fully.`;
      }

      default:
        throw new Error("Unknown action.");
    }
  }

  /* ============================================================
     UI STATE
  ============================================================ */
  let overlay, bodyEl, inputEl, sendBtn, sidebarEl, chatListEl, backdropEl;
  let prevPath = null;

  function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  function createOverlay() {
    overlay = document.createElement("div");
    overlay.id = "mp3ai-overlay";
    overlay.innerHTML = `
      <div id="mp3ai-sidebar-backdrop"></div>
      <div id="mp3ai-sidebar">
        <div id="mp3ai-sidebar-head">
          <button id="mp3ai-new-chat" type="button">${svgPlus}<span>New chat</span></button>
        </div>
        <div id="mp3ai-chat-list"></div>
      </div>
      <div id="mp3ai-main">
        <div id="mp3ai-header">
          <div class="mp3ai-left">
            <button class="mp3ai-icon-btn" id="mp3ai-menu" type="button">${svgMenu}</button>
            <div class="mp3ai-title-wrap">
              <div class="mp3ai-title">${svgSpark}${AI_NAME}</div>
            </div>
          </div>
          <button class="mp3ai-icon-btn" id="mp3ai-close" type="button">${svgClose}</button>
        </div>
        <div id="mp3ai-body"></div>
        <div id="mp3ai-inputbar">
          <textarea id="mp3ai-input" rows="1" placeholder="Ask anything…"></textarea>
          <button id="mp3ai-send" type="button">${svgSend}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    bodyEl    = overlay.querySelector("#mp3ai-body");
    inputEl   = overlay.querySelector("#mp3ai-input");
    sendBtn   = overlay.querySelector("#mp3ai-send");
    sidebarEl = overlay.querySelector("#mp3ai-sidebar");
    chatListEl = overlay.querySelector("#mp3ai-chat-list");
    backdropEl = overlay.querySelector("#mp3ai-sidebar-backdrop");

    overlay.querySelector("#mp3ai-close").addEventListener("click", closeOverlay);
    overlay.querySelector("#mp3ai-menu").addEventListener("click", toggleSidebar);
    backdropEl.addEventListener("click", closeSidebar);
    overlay.querySelector("#mp3ai-new-chat").addEventListener("click", () => {
      const s = loadStore(), id = uid();
      s.chats[id] = { id, title: "New chat", messages: [], updatedAt: Date.now() };
      s.activeId = id; saveStore(s);
      history.replaceState({ mp3ai: true }, "", location.pathname + ROUTE);
      renderSidebar(); renderBody(); closeSidebar();
    });
    sendBtn.addEventListener("click", handleSend);
    inputEl.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } });
    inputEl.addEventListener("input", () => { inputEl.style.height = "auto"; inputEl.style.height = Math.min(inputEl.scrollHeight, 110) + "px"; });
  }

  function toggleSidebar() { sidebarEl?.classList.toggle("open"); backdropEl?.classList.toggle("open"); }
  function closeSidebar()  { sidebarEl?.classList.remove("open"); backdropEl?.classList.remove("open"); }

  function renderSidebar() {
    const s = loadStore();
    const chats = Object.values(s.chats).sort((a, b) => b.updatedAt - a.updatedAt);
    chatListEl.innerHTML = "";
    chats.forEach(c => {
      const item = document.createElement("div");
      item.className = "mp3ai-chat-item" + (c.id === s.activeId ? " active" : "");
      item.innerHTML = `<span>${esc(c.title || "New chat")}</span><button class="mp3ai-chat-del" type="button">${svgTrash}</button>`;
      item.addEventListener("click", e => {
        if (e.target.closest(".mp3ai-chat-del")) return;
        const s2 = loadStore(); s2.activeId = c.id; saveStore(s2);
        const hasMsg = c.messages && c.messages.some(m => m.role === "user");
        history.replaceState({ mp3ai: true }, "", location.pathname + (hasMsg ? ROUTE_CHAT(c.id) : ROUTE));
        renderSidebar(); renderBody(); closeSidebar();
      });
      item.querySelector(".mp3ai-chat-del").addEventListener("click", e => {
        e.stopPropagation();
        const s2 = loadStore(); delete s2.chats[c.id];
        if (!Object.keys(s2.chats).length) { const id = uid(); s2.chats[id] = { id, title: "New chat", messages: [], updatedAt: Date.now() }; s2.activeId = id; }
        else if (s2.activeId === c.id) { s2.activeId = Object.values(s2.chats).sort((a, b) => b.updatedAt - a.updatedAt)[0].id; }
        saveStore(s2); renderSidebar(); renderBody();
      });
      chatListEl.appendChild(item);
    });
  }

  /* mascot */
  const MASCOT = [
    "..OOOOOOO..",
    "OOKKKKKKKOO",
    "OOYYYYYYYOO",
    "OOYYYYYYYOO",
    "OOYKYYYKYOO",
    "OOYYYYYYYOO",
    "OOYYYYYYYOO",
    "OOYYYYYYYOO",
    "..YY.YY.YY.",
  ];
  function mascotHTML() {
    let c = "";
    for (const row of MASCOT) for (const ch of row) {
      if (ch === ".")      c += `<div class="mp3ai-cube empty"></div>`;
      else if (ch === "O") c += `<div class="mp3ai-cube orange"></div>`;
      else if (ch === "K") c += `<div class="mp3ai-cube dark"></div>`;
      else                 c += `<div class="mp3ai-cube"></div>`;
    }
    return `<div class="mp3ai-mascot">${c}</div>`;
  }

  function renderEmptyState() {
    const wrap = document.createElement("div");
    wrap.id = "mp3ai-empty";
    wrap.innerHTML = `
      ${mascotHTML()}
      <h2>What's on your mind today?</h2>
      <p>Ask me for music recs, generate an image, or let me control the app for you.</p>
      <div class="mp3ai-suggestions">
        <button class="mp3ai-chip" data-q="Switch the app theme to amoled">Switch to AMOLED</button>
        <button class="mp3ai-chip" data-q="Create a playlist called Chill Vibes">New playlist</button>
        <button class="mp3ai-chip" data-q="Like the song Blinding Lights by The Weeknd">Like a track</button>
        <button class="mp3ai-chip" data-q="Based on what I listen to, what do you recommend?">Recommendations</button>
      </div>`;
    wrap.querySelectorAll(".mp3ai-chip").forEach(ch => ch.addEventListener("click", () => { inputEl.value = ch.dataset.q; handleSend(); }));
    bodyEl.appendChild(wrap);
  }

  function renderBody() {
    bodyEl.innerHTML = "";
    const s = loadStore(), chat = getActiveChat(s);
    if (!chat.messages.length) { renderEmptyState(); return; }
    chat.messages.forEach(m => {
      bodyEl.appendChild(buildRow(m));
      if (m.role === "assistant" && m.pendingAction) bodyEl.appendChild(buildActionCard(m.pendingAction));
    });
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function buildRow(msg) {
    const row = document.createElement("div");
    row.className = "mp3ai-row " + msg.role;
    row.dataset.id = msg.id;
    const bubble = document.createElement("div");
    bubble.className = "mp3ai-msg";
    bubble.textContent = msg.content;
    row.appendChild(bubble);
    if (msg.image) { const img = document.createElement("img"); img.src = msg.image; img.alt = "Generated image"; bubble.appendChild(img); }
    if (msg.role === "user") {
      const acts = document.createElement("div"); acts.className = "mp3ai-msg-actions";
      acts.innerHTML = `<button type="button">${svgCopy}Copy</button><button type="button">${svgRedo}Resend</button>`;
      row.appendChild(acts);
      bubble.addEventListener("click", () => row.classList.toggle("actions-open"));
      acts.children[0].addEventListener("click", e => { e.stopPropagation(); navigator.clipboard?.writeText(msg.content).catch(() => {}); });
      acts.children[1].addEventListener("click", e => { e.stopPropagation(); resendFrom(msg.id); });
    }
    return row;
  }

  function buildActionCard(action) {
    const card = document.createElement("div");
    card.className = "mp3ai-action-card";
    card.innerHTML = `
      <div class="mp3ai-action-label">${AI_NAME} wants to</div>
      <div class="mp3ai-action-desc">${esc(actionDesc(action))}</div>
      <div class="mp3ai-action-buttons">
        <button type="button" class="mp3ai-approve">✓ Approve</button>
        <button type="button" class="mp3ai-cancel">Cancel</button>
      </div>`;
    function clearStoredAction() {
      const s = loadStore();
      Object.values(s.chats).forEach(c => {
        c.messages.forEach(m => { if (m.pendingAction === action) delete m.pendingAction; });
      });
      saveStore(s);
    }
    card.querySelector(".mp3ai-cancel").addEventListener("click", () => {
      clearStoredAction();
      card.remove();
    });
    card.querySelector(".mp3ai-approve").addEventListener("click", async () => {
      const btns = card.querySelector(".mp3ai-action-buttons");
      btns.querySelectorAll("button").forEach(b => b.disabled = true);
      try {
        await executeAction(action);
        clearStoredAction();
        card.remove();
      } catch (e) {
        clearStoredAction();
        card.innerHTML = `<div class="mp3ai-action-result" style="color:#ef4444">✗ ${esc(e.message || "Error")}</div>`;
      }
    });
    return card;
  }

  function showTypingRow() {
    const d = document.createElement("div"); d.className = "mp3ai-row assistant"; d.id = "mp3ai-typing-row";
    d.innerHTML = `<div class="mp3ai-msg"><div class="mp3ai-typing"><span></span><span></span><span></span></div></div>`;
    bodyEl.appendChild(d); bodyEl.scrollTop = bodyEl.scrollHeight; return d;
  }

  /* ============================================================
     INFERENCE
  ============================================================ */
  async function runAssistantTurn(latestUserText) {
    sendBtn.disabled = true;
    const s = loadStore(), chat = getActiveChat(s);
    renderBody();
    const typingRow = showTypingRow();
    const bubble = typingRow.querySelector(".mp3ai-msg");

    try {
      const messages = [
        { role: "system", content: systemPrompt() },
        ...chat.messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
      ];

      let lastRender = "";
      const full = await streamLLM(messages, partial => {
        const display = partial.replace(ACTION_RE, "").trimEnd();
        if (display !== lastRender) {
          lastRender = display;
          bubble.innerHTML = "";
          bubble.appendChild(document.createTextNode(display));
          const cur = document.createElement("span"); cur.className = "mp3ai-cursor"; bubble.appendChild(cur);
          bodyEl.scrollTop = bodyEl.scrollHeight;
        }
      });

      let text = full, pendingAction = null;
      const match = full.match(ACTION_RE);
      if (match) {
        text = full.replace(ACTION_RE, "").trim();
        let raw = match[1].trim();
        // Strip markdown code fences (```json ... ``` or ``` ... ```) some models add
        raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
        try {
          pendingAction = JSON.parse(raw);
        } catch {
          // Last resort: grab the first {...} block in case there's stray text around it
          const objMatch = raw.match(/\{[\s\S]*\}/);
          if (objMatch) { try { pendingAction = JSON.parse(objMatch[0]); } catch {} }
        }
      }

      const s2 = loadStore(), c2 = getActiveChat(s2);
      c2.messages.push({ id: uid(), role: "assistant", content: text || "...", pendingAction: pendingAction || undefined });
      c2.updatedAt = Date.now(); saveStore(s2); renderBody();
    } catch (e) {
      const s2 = loadStore(), c2 = getActiveChat(s2);
      c2.messages.push({ id: uid(), role: "assistant", content: "Something went wrong: " + (e.message || "try again.") });
      saveStore(s2); renderBody(); console.error("Kingy:", e);
    } finally {
      sendBtn.disabled = false;
      document.getElementById("mp3ai-typing-row")?.remove();
    }
  }

  async function handleSend() {
    const text = inputEl.value.trim(); if (!text) return;
    inputEl.value = ""; inputEl.style.height = "auto";
    const s = loadStore(), chat = getActiveChat(s);
    chat.messages.push({ id: uid(), role: "user", content: text });
    if (chat.messages.filter(m => m.role === "user").length === 1) {
      chat.title = titleFromText(text);
      history.replaceState({ mp3ai: true }, "", location.pathname + ROUTE_CHAT(s.activeId));
    }
    chat.updatedAt = Date.now(); saveStore(s); renderSidebar();
    await runAssistantTurn(text);
  }

  async function resendFrom(userMsgId) {
    const s = loadStore(), chat = getActiveChat(s);
    const idx = chat.messages.findIndex(m => m.id === userMsgId); if (idx === -1) return;
    const text = chat.messages[idx].content;
    chat.messages = chat.messages.slice(0, idx + 1); saveStore(s);
    await runAssistantTurn(text);
  }

  /* ============================================================
     OVERLAY OPEN / CLOSE
  ============================================================ */
  function openOverlay(pushUrl) {
    if (!overlay) createOverlay();
    renderSidebar(); renderBody();
    overlay.classList.add("mp3ai-open");
    if (pushUrl !== false) {
      const st = loadStore(), chat = getActiveChat(st);
      const hasMessages = chat.messages.some(m => m.role === "user");
      const targetHash = hasMessages ? ROUTE_CHAT(st.activeId) : ROUTE;
      if (location.hash !== targetHash) history.pushState({ mp3ai: true }, "", targetHash);
    }
    setTimeout(() => inputEl?.focus(), 200);
  }
  function closeOverlay(skipNav) {
    overlay?.classList.remove("mp3ai-open"); closeSidebar();
    if (!skipNav) { history.pushState({}, "", location.pathname); window.location.href = "/"; }
  }
  window.addEventListener("hashchange", () => {
    if (location.hash === ROUTE || location.hash.startsWith("#kingy-")) {
      const chatId = location.hash.replace("#kingy-", "");
      if (chatId && chatId !== "kingy") { const st = loadStore(); if (st.chats[chatId]) { st.activeId = chatId; saveStore(st); } }
      openOverlay(false);
    } else if (overlay?.classList.contains("mp3ai-open")) {
      closeOverlay(true);
    }
  });

  /* ============================================================
     ANCHOR BUTTON (in Queue panel)
  ============================================================ */
  function tryMountAnchorButton() {
    if (document.getElementById("mp3ai-anchor-btn")) return true;
    const heading = Array.from(document.querySelectorAll("h1,h2,h3,div,span")).find(el => el.children.length === 0 && el.textContent.trim() === "Queue");
    if (!heading) return false;
    let c = heading.parentElement;
    while (c && c.parentElement && c.clientHeight < 80 && c.parentElement !== document.body) c = c.parentElement;
    if (!c) return false;
    const btn = document.createElement("button"); btn.id = "mp3ai-anchor-btn"; btn.type = "button";
    btn.innerHTML = `${svgSpark}<span>Talk to ${AI_NAME}</span>`;
    btn.addEventListener("click", () => {
      const s = loadStore(), id = uid();
      s.chats[id] = { id, title: "New chat", messages: [], updatedAt: Date.now() };
      s.activeId = id; saveStore(s);
      openOverlay();
    });
    c.appendChild(btn); return true;
  }

  function init() {
    if (!tryMountAnchorButton()) {
      const obs = new MutationObserver(() => tryMountAnchorButton());
      obs.observe(document.body, { childList: true, subtree: true });
    }
    if (location.hash === ROUTE || location.hash.startsWith("#kingy-")) {
      const chatId = location.hash.replace("#kingy-", "");
      if (chatId && chatId !== "kingy") { const st = loadStore(); if (st.chats[chatId]) { st.activeId = chatId; saveStore(st); } }
      setTimeout(() => openOverlay(false), 50);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
