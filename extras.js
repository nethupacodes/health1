/* HealthMate extras: AI Assistant view, My Watch view, Home cards.
   Loaded before script.js. It reads the user's logs through window.HealthMateDebug (read-only copies),
   and keeps its own data under separate localStorage keys. */
(function () {
  'use strict';
  const HM = window.HM, AI = HM.ai, esc = HM.esc;
  const $ = (s, r = document) => r.querySelector(s);
  const dbg = () => window.HealthMateDebug;
  const K = { chat: 'healthmate.chat.v1', ai: 'healthmate.ai.v1', watch: 'healthmate.watch.v1' };
  const load = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Could not save. Browser storage may be full or blocked.', 'error'); return false; } };
  const toast = (m, t) => (dbg() && dbg().toast ? dbg().toast(m, t) : null);
  const icon = n => `<svg class="ico" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const tm = (ts, sec) => new Date(ts).toLocaleTimeString([], sec ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
  const dt = ts => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const prefsNow = () => (dbg() ? dbg().prefs() : { name: '', waterGoal: 1500, sleepGoal: 8, activityGoal: 60 });
  const recsNow = () => (dbg() ? dbg().records() : {});

  /* ======================= AI ASSISTANT ======================= */
  const TIPS = [
    'Drink a glass of water when you wake up. It is an easy first win.', 'A 10-minute walk counts as activity. Start small.',
    'Put screens away 30 minutes before bed tonight.', 'Take three slow breaths before you start studying.',
    'Add one fruit or vegetable to your next meal.', 'Stand up and stretch for a minute every hour.',
    'Keep a water bottle where you study.', 'Go to bed 15 minutes earlier than usual tonight.',
    'Talk to someone you trust if something is on your mind.', 'Get some daylight in the morning to help your sleep rhythm.',
    'Take a short screen break and look at something far away.', 'Pick one small goal for today and tick it off.',
    'A short stretch before bed can help you wind down.', 'Celebrate small progress. Consistency beats perfection.'
  ];
  const dailyTip = () => { const d = new Date(); return TIPS[Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5) % TIPS.length]; };

  function cleanChat(c) {
    const out = { cur: [], arch: [] };
    const msg = m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string'
      ? { id: String(m.id || HM.uid()), role: m.role, text: m.text.slice(0, 4000), kind: ['text', 'emergency', 'error'].includes(m.kind) ? m.kind : 'text', src: ['demo', 'ai', 'user', 'system'].includes(m.src) ? m.src : 'user', ts: Number.isFinite(m.ts) ? m.ts : 0 } : null;
    if (c && Array.isArray(c.cur)) out.cur = c.cur.map(msg).filter(Boolean).slice(-200);
    if (c && Array.isArray(c.arch)) out.arch = c.arch.map(a => ({ id: String(a.id || HM.uid()), ts: Number.isFinite(a.ts) ? a.ts : 0, msgs: Array.isArray(a.msgs) ? a.msgs.map(msg).filter(Boolean).slice(-200) : [] })).filter(a => a.msgs.length).slice(-10);
    return out;
  }
  let chat = cleanChat(load(K.chat));
  let cfg = (() => { const c = load(K.ai) || {}; return { endpoint: typeof c.endpoint === 'string' ? c.endpoint.slice(0, 300) : '', token: typeof c.token === 'string' ? c.token.slice(0, 600) : '', consent: c.consent === true }; })();
  let shown = 30, busy = false, aiBuilt = false;
  const saveChat = () => save(K.chat, chat);
  const saveCfg = () => save(K.ai, cfg);
  const endpointOk = u => /^https:\/\/[^\s]+$/i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[^\s]*)?$/i.test(u);
  const remoteOn = () => !!(cfg.endpoint && endpointOk(cfg.endpoint) && cfg.consent);

  function modeText() {
    return remoteOn() ? 'Connected to your AI backend. Replies are AI-generated.' : 'Demo mode: replies come from simple built-in rules using your own logs. This is not a live AI model.';
  }

  function buildAssistant() {
    $('#assistantRoot').innerHTML = `
      <p class="note" id="aiMode"></p>
      <div class="chips ai-actions" id="aiActions" aria-label="Quick actions"></div>
      <div class="chat-log" id="aiLog" role="log" aria-live="polite" aria-label="Conversation"></div>
      <form class="composer" id="aiForm" novalidate>
        <label class="sr-only" for="aiInput">Message HealthMate AI</label>
        <textarea id="aiInput" rows="1" maxlength="1000" placeholder="Ask about sleep, water, stress…" enterkeyhint="send"></textarea>
        <button class="btn" id="aiSend" type="submit" aria-label="Send message">${icon('send')}</button>
      </form>
      <p class="note safety">${icon('lock')} General wellness guidance only. HealthMate AI does not diagnose or replace a doctor. In an emergency, call your local emergency number (Sri Lanka ambulance: 1990).</p>
      <div class="row"><button class="btn ghost small" type="button" data-xa="new-chat">${icon('plus')} New conversation</button></div>
      <article class="card spaced"><h2>Past conversations</h2><div id="aiHist"></div></article>
      <article class="card"><h2>AI backend (optional)</h2>
        <p class="note">Without a backend you get demo replies. To use a real AI model, deploy the small server in <code>backend/ai-proxy</code> (it keeps the API key secret) and paste its address here. See docs/backend-setup.md. Never paste a secret API key into this app.</p>
        <form id="aiCfg" novalidate>
          <label for="aiEndpoint">Backend address (https://…)</label>
          <input id="aiEndpoint" type="text" inputmode="url" autocomplete="off" placeholder="https://your-project.supabase.co/functions/v1/healthmate-ai">
          <label for="aiToken">Public access token <span class="opt">(optional, for example a Supabase anon key)</span></label>
          <input id="aiToken" type="text" autocomplete="off">
          <label class="check"><input type="checkbox" id="aiConsent"> <span>I agree to send my messages and a summary of my last 7 days (averages only, no notes) to this backend.</span></label>
          <p class="form-error" id="aiCfgErr" role="alert"></p>
          <div class="row"><button class="btn small" type="submit">Save</button><button class="btn ghost small" type="button" data-xa="cfg-clear">Use demo mode</button></div>
        </form>
      </article>`;
    $('#aiEndpoint').value = cfg.endpoint; $('#aiToken').value = cfg.token; $('#aiConsent').checked = cfg.consent;
    $('#aiActions').innerHTML = AI.ACTIONS.map(a => `<button class="chip" type="button" data-xa="ask" data-intent="${a.id}">${esc(a.label)}</button>`).join('');
    const inp = $('#aiInput');
    inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 120) + 'px'; });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#aiForm').requestSubmit(); } });
    $('#aiForm').addEventListener('submit', e => { e.preventDefault(); const v = inp.value; inp.value = ''; inp.style.height = 'auto'; ask(v, 'free'); });
    $('#aiCfg').addEventListener('submit', e => {
      e.preventDefault();
      const u = $('#aiEndpoint').value.trim(), err = $('#aiCfgErr');
      if (u && !endpointOk(u)) { err.textContent = 'Use an https:// address (http://localhost is allowed for testing).'; return; }
      if (u && !$('#aiConsent').checked) { err.textContent = 'Please tick the box to allow sending your messages to this backend.'; return; }
      err.textContent = '';
      cfg = { endpoint: u, token: $('#aiToken').value.trim(), consent: !!u && $('#aiConsent').checked };
      saveCfg(); renderAssistant(); toast(u ? 'Backend saved.' : 'Demo mode on.');
    });
    aiBuilt = true;
  }

  const bubble = m => {
    const who = m.role === 'user' ? 'You' : 'HealthMate AI';
    const tag = m.role === 'assistant' ? (m.kind === 'emergency' ? 'Safety message' : m.src === 'ai' ? 'AI-generated' : m.src === 'demo' ? 'Demo reply' : '') : '';
    const body = esc(m.text).replace(/\n/g, '<br>');
    return `<div class="msg ${m.role} ${m.kind}"><div class="msg-meta"><span>${who}</span>${m.ts ? `<span>${tm(m.ts)}</span>` : ''}${tag ? `<span class="tag">${tag}</span>` : ''}</div><div class="bubble">${m.kind === 'emergency' ? `<strong>${icon('bell')} Urgent</strong><br>` : ''}${body}</div></div>`;
  };

  function renderAssistant() {
    if (!aiBuilt) buildAssistant();
    $('#aiMode').textContent = modeText();
    const first = prefsNow().name;
    const welcome = `<div class="msg assistant"><div class="msg-meta"><span>HealthMate AI</span></div><div class="bubble">Hi${first ? ' ' + esc(first) : ''}! I’m HealthMate AI. I can look at the water, sleep and activity you have logged and suggest small, achievable steps.<br><br>I give general wellness guidance only. I can’t diagnose anything, and I’ll tell you when to see a doctor.<br><br><em>Today’s tip:</em> ${esc(dailyTip())}</div></div>`;
    const list = chat.cur, start = Math.max(0, list.length - shown);
    $('#aiLog').innerHTML = (start > 0 ? `<button class="chip" type="button" data-xa="older">Show earlier messages (${start})</button>` : '') + welcome + list.slice(start).map(bubble).join('') + (busy ? `<div class="msg assistant" aria-label="HealthMate AI is typing"><div class="bubble typing"><i></i><i></i><i></i></div></div>` : '');
    $('#aiHist').innerHTML = chat.arch.length ? chat.arch.slice().reverse().map(a => {
      const t = (a.msgs.find(m => m.role === 'user') || a.msgs[0]).text.slice(0, 60);
      return `<div class="hist"><div><strong>${esc(t)}</strong><small>${a.ts ? dt(a.ts) : ''} · ${a.msgs.length} messages</small></div><div><button class="btn ghost small" type="button" data-xa="hist-open" data-id="${esc(a.id)}">Open</button><button class="icon-btn danger" type="button" data-xa="hist-del" data-id="${esc(a.id)}" aria-label="Delete conversation">${icon('trash')}</button></div></div>`;
    }).join('') : '<p class="note">No earlier conversations yet.</p>';
    $('#aiSend').disabled = busy;
  }
  const scrollEnd = () => { const l = $('#aiLog'); if (l && l.lastElementChild) l.lastElementChild.scrollIntoView({ block: 'end' }); };
  const push = (role, text, kind, src) => { chat.cur.push({ id: HM.uid(), role, text: String(text).slice(0, 4000), kind: kind || 'text', src, ts: Date.now() }); if (chat.cur.length > 200) chat.cur.shift(); saveChat(); };

  async function ask(text, intent) {
    text = String(text || '').trim().slice(0, 1000);
    if (busy) return;
    if (intent !== 'free') { const a = AI.ACTIONS.find(x => x.id === intent); if (!a) return; text = a.prompt; }
    if (!text) return;
    push('user', text, 'text', 'user'); busy = true; renderAssistant(); scrollEnd();
    const s = AI.summarize(recsNow(), prefsNow(), HM.today(), 7);
    try {
      if (AI.emergency(text)) { await delay(350); const r = AI.emergencyReply(text); push('assistant', r.text, 'emergency', 'demo'); }
      else if (remoteOn()) {
        if (!navigator.onLine) throw new Error('You appear to be offline.');
        const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 25000);
        try {
          const res = await fetch(cfg.endpoint, { method: 'POST', signal: ctrl.signal, headers: Object.assign({ 'Content-Type': 'application/json' }, cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {}), body: JSON.stringify(AI.payload(chat.cur, s, prefsNow().name)) });
          if (!res.ok) throw new Error('The backend answered with error ' + res.status + '.');
          const data = await res.json();
          if (!data || typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('The backend sent an empty or unexpected reply.');
          push('assistant', data.reply, data.emergency ? 'emergency' : 'text', 'ai');
        } finally { clearTimeout(timer); }
      } else {
        await delay(500);
        const r = AI.demoReply(intent === 'free' ? 'free' : intent, s, text);
        push('assistant', r.text, r.kind, 'demo');
      }
    } catch (e) {
      const why = e && e.name === 'AbortError' ? 'The backend took too long to answer.' : (e && e.message) || 'Something went wrong.';
      push('assistant', `I couldn’t get an answer. ${why} Your message was saved. You can try again, or switch to demo mode in “AI backend” below.`, 'error', 'system');
    }
    busy = false; renderAssistant(); scrollEnd();
  }

  function newChat() {
    if (chat.cur.length) { chat.arch.push({ id: HM.uid(), ts: Date.now(), msgs: chat.cur }); chat.arch = chat.arch.slice(-10); }
    chat.cur = []; shown = 30; saveChat(); renderAssistant(); toast('New conversation started.');
  }

  /* ======================= MY WATCH ======================= */
  const COLORS = { teal: '#18A999', navy: '#2F6E8C', silver: '#B9C4CA', black: '#2A3138' };
  const emptyW = () => ({ brand: '', model: '', color: 'teal', perms: { hr: false, battery: false }, status: 'disconnected', mode: null, name: '', battery: null, lastSync: null, lastHr: null, hrDaily: {}, demo: false });
  function cleanW(w) {
    const o = emptyW(); if (!w || typeof w !== 'object') return o;
    if (AI.BRANDS.some(b => b.id === w.brand)) o.brand = w.brand;
    o.model = typeof w.model === 'string' ? w.model.slice(0, 40) : '';
    if (COLORS[w.color]) o.color = w.color;
    o.perms = { hr: !!(w.perms && w.perms.hr), battery: !!(w.perms && w.perms.battery) };
    o.name = typeof w.name === 'string' ? w.name.slice(0, 60) : '';
    o.battery = Number.isFinite(w.battery) && w.battery >= 0 && w.battery <= 100 ? Math.round(w.battery) : null;
    o.lastSync = Number.isFinite(w.lastSync) ? w.lastSync : null;
    if (w.lastHr && Number.isFinite(w.lastHr.bpm) && Number.isFinite(w.lastHr.t)) o.lastHr = { bpm: w.lastHr.bpm, t: w.lastHr.t };
    if (w.hrDaily && typeof w.hrDaily === 'object') for (const k of Object.keys(w.hrDaily).slice(-90)) {
      const d = w.hrDaily[k]; if (HM.validKey(k) && d && [d.min, d.max, d.sum, d.n].every(Number.isFinite) && d.n > 0) o.hrDaily[k] = { min: d.min, max: d.max, sum: d.sum, n: d.n };
    }
    return o; // status is always "disconnected" after a reload: a Bluetooth connection cannot survive it
  }
  let W = cleanW(load(K.watch));
  let dev = null, hrChar = null, session = [], watchBuilt = false, saveTimer = null, wRange = 7, watchMsg = '';
  const saveW = () => save(K.watch, W);
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveW, 8000); };
  const brand = () => AI.BRANDS.find(b => b.id === W.brand) || null;
  const btOK = () => !!(navigator.bluetooth && window.isSecureContext);
  const live = () => W.status !== 'disconnected' && W.mode === 'ble';

  function onHr(ev) {
    const v = ev.target.value, bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    const bpm = AI.parseHeartRate(bytes); if (bpm === null) return;
    const now = Date.now(), k = HM.today();
    W.lastHr = { bpm, t: now }; W.lastSync = now;
    session.push(bpm); if (session.length > 600) session.shift();
    const d = W.hrDaily[k] || (W.hrDaily[k] = { min: bpm, max: bpm, sum: 0, n: 0 });
    d.min = Math.min(d.min, bpm); d.max = Math.max(d.max, bpm); d.sum += bpm; d.n++;
    saveSoon(); updateLive();
  }
  function onDrop() {
    if (W.mode !== 'ble') return;
    W.status = 'disconnected'; hrChar = null; saveW();
    watchMsg = 'Connection lost. Move the watch closer, keep heart-rate broadcast on, then press Reconnect.';
    renderWatch(); refreshHome();
  }
  async function readBattery(server) {
    if (!W.perms.battery) return;
    try { const s = await server.getPrimaryService('battery_service'), c = await s.getCharacteristic('battery_level'); W.battery = (await c.readValue()).getUint8(0); }
    catch (e) { W.battery = null; }
  }
  async function attach(server) {
    const svc = await server.getPrimaryService('heart_rate');
    hrChar = await svc.getCharacteristic('heart_rate_measurement');
    hrChar.addEventListener('characteristicvaluechanged', onHr);
    await hrChar.startNotifications();
    await readBattery(server);
    try { const s = await server.getPrimaryService('device_information'), c = await s.getCharacteristic('manufacturer_name_string'); W.maker = new TextDecoder().decode(await c.readValue()).slice(0, 40); } catch (e) { /* optional */ }
  }
  async function connectWatch() {
    if (!btOK()) return toast('This browser cannot use Bluetooth here.', 'error');
    if (!W.perms.hr) return toast('Allow “Heart rate” below first. I only read data you allow.', 'error');
    W.demo = false; watchMsg = '';
    try {
      dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }], optionalServices: ['battery_service', 'device_information'] });
      W.status = 'syncing'; W.mode = 'ble'; W.name = (dev.name || 'Unnamed device').slice(0, 60); renderWatch();
      dev.addEventListener('gattserverdisconnected', onDrop);
      const server = await dev.gatt.connect();
      await attach(server);
      W.status = 'connected'; W.lastSync = Date.now(); saveW();
      toast('Watch connected. Waiting for a heart-rate reading…');
    } catch (e) {
      W.status = 'disconnected'; W.mode = null;
      try { if (dev && dev.gatt.connected) dev.gatt.disconnect(); } catch (x) { /* ignore */ }
      const n = e && e.name;
      watchMsg = n === 'NotFoundError' ? (/no services|heart/i.test(e.message || '') ? 'No watch with heart-rate sharing was found. Turn on “broadcast / share heart rate” in your watch settings and try again.' : 'No watch was selected.')
        : n === 'SecurityError' || n === 'NotAllowedError' ? 'Bluetooth permission was blocked. Allow Bluetooth for this site in your browser settings.'
        : n === 'NetworkError' ? 'Could not connect. Move the watch closer, make sure it is not connected to another app, and try again.'
        : 'This device does not share standard heart-rate data, so HealthMate cannot read it from the browser. (' + esc((e && e.message) || 'unknown error') + ')';
      saveW();
    }
    renderWatch(); refreshHome();
  }
  async function reconnect() {
    if (!dev) return connectWatch();
    W.status = 'syncing'; watchMsg = ''; renderWatch();
    try { const server = await dev.gatt.connect(); await attach(server); W.status = 'connected'; W.lastSync = Date.now(); saveW(); toast('Reconnected.'); }
    catch (e) { W.status = 'disconnected'; watchMsg = 'Could not reconnect. Press “Connect watch” to pick the device again.'; dev = null; }
    renderWatch(); refreshHome();
  }
  async function syncNow() {
    if (W.demo) return toast('Demo mode: nothing real to sync.');
    if (!live() || W.status !== 'connected') return toast('Connect a watch first.', 'error');
    W.status = 'syncing'; renderWatch();
    try { await readBattery(dev.gatt); W.lastSync = Date.now(); saveW(); toast('Checked the watch. Heart rate streams live.'); }
    catch (e) { watchMsg = 'Sync failed. Try reconnecting.'; }
    W.status = dev && dev.gatt.connected ? 'connected' : 'disconnected'; renderWatch(); refreshHome();
  }
  function disconnectWatch() {
    try { if (hrChar) { hrChar.removeEventListener('characteristicvaluechanged', onHr); hrChar.stopNotifications().catch(() => {}); } } catch (e) { /* ignore */ }
    try { if (dev) { dev.removeEventListener('gattserverdisconnected', onDrop); if (dev.gatt.connected) dev.gatt.disconnect(); } } catch (e) { /* ignore */ }
    dev = null; hrChar = null; session = []; W.status = 'disconnected'; W.mode = null; W.demo = false; W.battery = null; watchMsg = '';
    saveW(); renderWatch(); refreshHome(); toast('Watch disconnected.');
  }

  const SAMPLE = { hr: 68, steps: 6420, goal: 8000, km: 4.8, kcal: 312, sleepMin: 432, active: 41, spo2: 97, stress: 'Low' };
  const sampleSeries = n => Array.from({ length: n }, (_, i) => 62 + ((i * 7) % 11));

  function tile(label, value, tag, note) {
    return `<div class="tile${tag.cls === 'ns' ? ' dim' : ''}"><small>${esc(label)}</small><strong>${value}</strong><span class="src ${esc(tag.cls)}">${esc(tag.text)}</span>${note ? `<small class="tnote">${esc(note)}</small>` : ''}</div>`;
  }
  const NS = { cls: 'ns', text: 'Needs native app' };
  function tiles() {
    const t = HM.today(), r = recsNow()[t], demo = W.demo;
    const SD = { cls: 'demo', text: 'Sample data' };
    const man = { cls: 'man', text: 'Entered manually' };
    const out = [];
    if (demo) out.push(tile('Heart rate', `${SAMPLE.hr} <small>BPM</small>`, SD));
    else if (live() && W.lastHr && Date.now() - W.lastHr.t < 20000) out.push(tile('Heart rate', `<span id="wHrNow">${W.lastHr.bpm}</span> <small>BPM</small>`, { cls: 'meas', text: 'Measured' }, 'Updated ' + tm(W.lastHr.t, true)));
    else if (live()) out.push(tile('Heart rate', 'Waiting…', { cls: 'ns', text: 'No reading yet' }, 'Keep the watch snug on your wrist.'));
    else if (W.lastHr) out.push(tile('Heart rate', `${W.lastHr.bpm} <small>BPM</small>`, { cls: 'old', text: 'Last measured' }, 'At ' + dt(W.lastHr.t)));
    else out.push(tile('Heart rate', 'No data available', { cls: 'ns', text: 'Not connected' }));
    out.push(demo ? tile('Steps', `${SAMPLE.steps.toLocaleString()} <small>/ ${SAMPLE.goal.toLocaleString()}</small>`, SD) : tile('Steps', 'Not supported', NS, 'Needs HealthKit or Health Connect in a native app.'));
    out.push(demo ? tile('Distance', `${SAMPLE.km} <small>km</small>`, SD) : tile('Distance', 'Not supported', NS));
    out.push(demo ? tile('Calories burned', `${SAMPLE.kcal} <small>kcal</small>`, SD) : tile('Calories burned', 'Not supported', NS));
    const sleep = r && r.sleepEntries.reduce((a, e) => a + e.minutes, 0);
    out.push(demo ? tile('Sleep', HM.fmtDur(SAMPLE.sleepMin), SD, 'Sleep stages are shown only if a watch provides them.')
      : sleep ? tile('Sleep', HM.fmtDur(sleep), man, 'Sleep stages: not supported.') : tile('Sleep', 'No data available', { cls: 'ns', text: 'Nothing logged today' }, 'Sleep stages: not supported.'));
    const act = r && r.activityEntries.reduce((a, e) => a + e.minutes, 0);
    out.push(demo ? tile('Active minutes', `${SAMPLE.active} <small>min</small>`, SD)
      : act ? tile('Active minutes', `${act} <small>min</small>`, man) : tile('Active minutes', 'No data available', { cls: 'ns', text: 'Nothing logged today' }));
    out.push(demo ? tile('Blood oxygen (SpO₂)', `${SAMPLE.spo2}<small>%</small>`, SD) : tile('Blood oxygen (SpO₂)', 'Not supported', NS));
    out.push(demo ? tile('Stress / recovery', SAMPLE.stress, SD) : tile('Stress / recovery', 'Not supported', NS));
    return out.join('');
  }

  function bars(vals, labels, unit, label, color) {
    const max = Math.max(1, ...vals.filter(v => v !== null)), W_ = 320, H = 110, n = vals.length, bw = Math.max(3, Math.min(26, (W_ - 8) / n - 3));
    const step = (W_ - 8) / n;
    const parts = vals.map((v, i) => {
      const x = 4 + i * step + (step - bw) / 2;
      if (v === null) return `<circle cx="${x + bw / 2}" cy="${H - 6}" r="2" class="gap"/>`;
      const h = Math.max(3, (v / max) * (H - 24));
      return `<rect x="${x}" y="${H - 14 - h}" width="${bw}" height="${h}" rx="3" fill="${color}"><title>${esc(labels[i])}: ${v} ${unit}</title></rect>`;
    }).join('');
    const tickIdx = [0, Math.floor((n - 1) / 2), n - 1];
    const ticks = tickIdx.map(i => `<text x="${4 + i * step + step / 2}" y="${H}" text-anchor="middle">${esc(labels[i].slice(5))}</text>`).join('');
    return `<svg class="mini" viewBox="0 0 ${W_} ${H + 2}" role="img" aria-label="${esc(label)}">${parts}${ticks}</svg>`;
  }

  function trendsHTML() {
    const keys = HM.rangeKeys(HM.addDays(HM.today(), -(wRange - 1)), HM.today());
    const r = recsNow();
    let hrVals, hrNote;
    if (W.demo) { hrVals = sampleSeries(keys.length); hrNote = '<span class="src demo">Sample data</span>'; }
    else { hrVals = keys.map(k => W.hrDaily[k] ? Math.round(W.hrDaily[k].sum / W.hrDaily[k].n) : null); hrNote = '<span class="src meas">Measured</span>'; }
    const hasHr = hrVals.some(v => v !== null);
    const actVals = keys.map(k => { const d = r[k]; return d && d.activityEntries.length ? d.activityEntries.reduce((a, e) => a + e.minutes, 0) : null; });
    const hasAct = actVals.some(v => v !== null);
    return `<div class="seg" role="group" aria-label="Trend range">${[7, 14, 30].map(n => `<button type="button" class="chip${wRange === n ? ' on' : ''}" data-xa="range" data-n="${n}" aria-pressed="${wRange === n}">${n} days</button>`).join('')}</div>
      <h3>Average heart rate per day ${hrNote}</h3>
      ${hasHr ? bars(hrVals, keys, 'BPM', 'Average heart rate per day', 'var(--teal)') : '<p class="note">No heart-rate history yet. When a connected watch shares heart rate, daily averages build up here. Days without data stay empty.</p>'}
      <h3>Active minutes per day <span class="src man">Entered manually</span></h3>
      ${hasAct ? bars(actVals, keys, 'min', 'Active minutes per day', 'var(--navy-soft)') : '<p class="note">No activity logged in this period.</p>'}`;
  }

  function faceBpm() { return W.demo ? SAMPLE.hr : (live() && W.lastHr && Date.now() - W.lastHr.t < 20000 ? W.lastHr.bpm : '--'); }
  function watchSVG() {
    const c = COLORS[W.color];
    return `<svg class="watch-art" viewBox="0 0 120 160" role="img" aria-label="Illustration of a ${esc(W.color)} smartwatch">
      <rect x="38" y="2" width="44" height="36" rx="10" fill="${c}" opacity=".55"/><rect x="38" y="122" width="44" height="36" rx="10" fill="${c}" opacity=".55"/>
      <rect x="14" y="30" width="92" height="100" rx="26" fill="#0b1b24" stroke="${c}" stroke-width="5"/>
      <text x="60" y="82" text-anchor="middle" font-size="26" font-weight="700" fill="#fff" id="wFace">${faceBpm()}</text>
      <text x="60" y="102" text-anchor="middle" font-size="10" fill="#9fc3cf">${W.demo ? 'SAMPLE' : 'BPM'}</text></svg>`;
  }

  const STATUS = { connected: ['Connected', 'ok'], disconnected: ['Disconnected', 'off'], syncing: ['Syncing…', 'sync'] };
  function statusCard() {
    const b = brand(), [stTxt, stCls] = STATUS[W.demo ? 'connected' : W.status];
    const name = W.demo ? 'Sample watch (demo)' : W.name || (b ? b.name : 'No watch connected');
    const maker = W.demo ? 'Demo' : (W.maker || (b ? b.maker : '—'));
    const connected = !W.demo && W.status === 'connected';
    return `<article class="card watch-top">
      <div class="watch-flex">${watchSVG()}<div class="wmeta">
        <h2>${esc(name)}</h2>
        <p class="note">Manufacturer: ${esc(maker)}${W.model ? ' · Model: ' + esc(W.model) : ''}</p>
        <p><span class="pill ${stCls}" role="status">${stTxt}</span></p>
        <p class="note">Battery: ${W.demo ? '<span class="src demo">Sample 82%</span>' : W.battery !== null && live() ? W.battery + '%' : 'Not available'}<br>Last sync: ${W.demo ? 'n/a (demo)' : W.lastSync ? dt(W.lastSync) : 'Never'}</p>
      </div></div>
      ${W.demo ? '<p class="banner">Demo mode: every number on this page marked “Sample data” is made up. It is not from a real watch.</p>' : ''}
      ${watchMsg ? `<p class="banner warn" role="alert">${watchMsg}</p>` : ''}
      <div class="row">
        ${!W.demo && W.status === 'disconnected' && dev ? `<button class="btn" type="button" data-xa="reconnect">Reconnect</button>` : ''}
        <button class="btn" type="button" data-xa="connect" ${W.demo || W.status === 'syncing' || !btOK() ? 'disabled' : ''}>${icon('watch')} Connect watch</button>
        <button class="btn ghost" type="button" data-xa="sync" ${connected ? '' : 'disabled'}>Sync now</button>
        <button class="btn ghost" type="button" data-xa="disconnect" ${W.status !== 'disconnected' || W.demo ? '' : 'disabled'}>Disconnect</button>
      </div>
      ${btOK() ? '' : '<p class="note">This browser or page cannot use Bluetooth, so Connect is off. Web Bluetooth works in Chrome and Edge on Android and desktop over https (or localhost). It does not work in Safari on iPhone.</p>'}
    </article>`;
  }

  function setupCard() {
    const b = brand();
    return `<article class="card"><h2>Your watch</h2>
      <label for="wBrand">Brand</label>
      <select id="wBrand" data-xa-change="brand"><option value="">Choose a brand…</option>${AI.BRANDS.map(x => `<option value="${x.id}"${x.id === W.brand ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <label for="wModel">Model <span class="opt">(optional)</span></label>
      <input id="wModel" type="text" maxlength="40" value="${esc(W.model)}" placeholder="e.g. Series 9, Venu 3" data-xa-change="model">
      <label for="wColor">Illustration colour</label>
      <select id="wColor" data-xa-change="color">${Object.keys(COLORS).map(c => `<option value="${c}"${c === W.color ? ' selected' : ''}>${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}</select>
      ${b ? `<div class="method"><strong>How ${esc(b.name)} connects</strong><p>${esc(b.method)}</p><p class="note">${esc(b.note)}</p>${b.native ? '<p class="note">Full data (steps, sleep stages, SpO₂) needs a native app. See docs/smartwatch-setup.md. HealthMate does not claim every watch connects directly.</p>' : ''}</div>` : '<p class="note">Pick your brand to see how it connects. Not every watch supports a direct connection.</p>'}
    </article>`;
  }

  function permCard() {
    return `<article class="card"><h2>${icon('lock')} Health data permissions</h2>
      <p class="note">HealthMate reads nothing until you allow it. You can switch these off and disconnect at any time.</p>
      <label class="check"><input type="checkbox" data-xa-change="perm-hr" ${W.perms.hr ? 'checked' : ''}> <span><b>Heart rate</b><br><small>Shows your live BPM. Daily min, average and max are saved only in this browser.</small></span></label>
      <label class="check"><input type="checkbox" data-xa-change="perm-battery" ${W.perms.battery ? 'checked' : ''}> <span><b>Battery level</b><br><small>Shows the watch battery when the watch shares it.</small></span></label>
      <div class="row"><button class="btn danger small" type="button" data-xa="wipe">Delete stored watch data</button></div></article>`;
  }

  const TROUBLE = [
    ['The watch does not appear in the list', 'Open your watch settings and turn on heart-rate sharing or broadcast. Close the watch’s own app so it is not holding the connection, and keep the watch within one metre.'],
    ['Connect is greyed out', 'Use Chrome or Edge over https (or localhost) on Android or desktop. Safari on iPhone has no Web Bluetooth. Apple Watch needs a native iOS app with HealthKit.'],
    ['It connects but shows no heart rate', 'Wear the watch snugly and wait 10–20 seconds. Some watches only broadcast during a workout mode.'],
    ['It keeps disconnecting', 'Turn Bluetooth off and on, remove other apps that are connected to the watch, then press Reconnect. Battery saver modes can cut the link.'],
    ['Steps, sleep or SpO₂ show “Not supported”', 'Browsers cannot read these from a watch. They need HealthKit, Health Connect or the maker’s SDK in a native app. HealthMate shows the gap instead of inventing numbers.'],
    ['Permission was blocked', 'Click the lock icon in the address bar, allow Bluetooth for this site, then try again.']
  ];

  function renderWatch() {
    if (!watchBuilt) {
      $('#watchRoot').addEventListener('change', e => {
        const t = e.target, a = t.dataset.xaChange; if (!a) return;
        if (a === 'brand') { W.brand = t.value; saveW(); renderWatch(); }
        else if (a === 'model') { W.model = t.value.trim().slice(0, 40); saveW(); }
        else if (a === 'color') { W.color = COLORS[t.value] ? t.value : 'teal'; saveW(); renderWatch(); }
        else if (a === 'perm-hr') { W.perms.hr = t.checked; if (!t.checked && W.mode === 'ble') disconnectWatch(); saveW(); }
        else if (a === 'perm-battery') { W.perms.battery = t.checked; if (!t.checked) W.battery = null; saveW(); renderWatch(); }
      });
      watchBuilt = true;
    }
    const keepFocus = document.activeElement && document.activeElement.id;
    $('#watchRoot').innerHTML = `
      ${statusCard()}
      <article class="card"><h2>${icon('activity')} Today</h2><div class="tiles" id="wTiles">${tiles()}</div>
        <p class="note">Labels show where each number comes from: <b>Measured</b> by a watch, <b>Entered manually</b> by you, or <b>Sample data</b> in demo mode. Unsupported items stay blank.</p></article>
      <article class="card"><h2>Trends</h2>${trendsHTML()}</article>
      ${setupCard()}${permCard()}
      <article class="card"><h2>Try it without a watch</h2><p class="note">Demo mode fills the screen with clearly labelled sample numbers so you can see the layout. It is never mixed with real readings.</p>
        <label class="check"><input type="checkbox" data-xa-change="demo-toggle" ${W.demo ? 'checked' : ''} ${live() ? 'disabled' : ''}> <span>Show sample data (demo mode)</span></label></article>
      <article class="card"><h2>Troubleshooting</h2>${TROUBLE.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</article>`;
    $('#watchRoot input[data-xa-change="demo-toggle"]').addEventListener('change', e => { W.demo = e.target.checked; if (W.demo) watchMsg = ''; saveW(); renderWatch(); refreshHome(); });
    if (keepFocus) { const el = document.getElementById(keepFocus); if (el) el.focus({ preventScroll: true }); }
  }
  function updateLive() {
    const n = $('#wHrNow'), f = $('#wFace');
    if (n && W.lastHr) { n.textContent = W.lastHr.bpm; const s = n.closest('.tile') && n.closest('.tile').querySelector('.tnote'); if (s) s.textContent = 'Updated ' + tm(W.lastHr.t, true); }
    else if (document.getElementById('wTiles') && !$('#view-watch').hidden) { $('#wTiles').innerHTML = tiles(); }
    if (f) f.textContent = faceBpm();
  }

  /* ======================= HOME CARDS ======================= */
  function homeCards() {
    const st = W.demo ? 'Demo mode (sample data)' : W.status === 'connected' ? 'Connected' : W.status === 'syncing' ? 'Syncing…' : 'Disconnected';
    const cls = W.demo ? 'sync' : W.status === 'connected' ? 'ok' : W.status === 'syncing' ? 'sync' : 'off';
    const hr = !W.demo && live() && W.lastHr && Date.now() - W.lastHr.t < 20000 ? `${W.lastHr.bpm} BPM (measured)` : null;
    return `<article class="card ai-card"><h2>${icon('chat')} HealthMate AI</h2>
        <p><b>Today’s tip:</b> ${esc(dailyTip())}</p>
        <div class="chips"><button class="chip" data-action="nav" data-view="assistant" data-fid="ai-open">Ask HealthMate AI</button>
        <button class="chip" data-xa="ask-go" data-intent="analyze" data-fid="ai-an">Analyze My Health</button>
        <button class="chip" data-xa="ask-go" data-intent="week" data-fid="ai-wk">Summarize My Week</button></div>
        <p class="note">${esc(modeText())}</p></article>
      <article class="card"><h2>${icon('watch')} My Watch</h2>
        <p><span class="pill ${cls}">${st}</span>${hr ? ' ' + esc(hr) : ''}</p>
        <div class="chips"><button class="chip" data-action="nav" data-view="watch" data-fid="wt-open">Open My Watch</button></div></article>
      <div class="chips" aria-label="More sections"><button class="chip" data-action="nav" data-view="mind" data-fid="go-mind">${icon('mind')} MindCare</button><button class="chip" data-action="nav" data-view="progress" data-fid="go-prog">${icon('progress')} Progress</button></div>`;
  }
  const refreshHome = () => { if (dbg() && dbg().refresh) dbg().refresh(); };

  /* ======================= EVENTS + HOOKS ======================= */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-xa]'); if (!t) return;
    const a = t.dataset.xa;
    if (a === 'ask') ask('', t.dataset.intent);
    else if (a === 'ask-go') { dbg().go('assistant'); ask('', t.dataset.intent); }
    else if (a === 'new-chat') newChat();
    else if (a === 'older') { shown += 30; renderAssistant(); }
    else if (a === 'hist-open') {
      const i = chat.arch.findIndex(x => x.id === t.dataset.id); if (i < 0) return;
      if (chat.cur.length) chat.arch.push({ id: HM.uid(), ts: Date.now(), msgs: chat.cur });
      chat.cur = chat.arch.splice(i, 1)[0].msgs; chat.arch = chat.arch.slice(-10); shown = 30; saveChat(); renderAssistant(); scrollEnd();
    }
    else if (a === 'hist-del') { chat.arch = chat.arch.filter(x => x.id !== t.dataset.id); saveChat(); renderAssistant(); toast('Conversation deleted.'); }
    else if (a === 'cfg-clear') { cfg = { endpoint: '', token: '', consent: false }; saveCfg(); $('#aiEndpoint').value = ''; $('#aiToken').value = ''; $('#aiConsent').checked = false; renderAssistant(); toast('Demo mode on.'); }
    else if (a === 'connect') connectWatch();
    else if (a === 'reconnect') reconnect();
    else if (a === 'sync') syncNow();
    else if (a === 'disconnect') disconnectWatch();
    else if (a === 'range') { wRange = +t.dataset.n || 7; renderWatch(); }
    else if (a === 'wipe') {
      if (!confirm('Delete the stored watch settings and heart-rate history from this browser?')) return;
      disconnectWatch(); W = emptyW(); saveW(); renderWatch(); refreshHome(); toast('Watch data deleted.');
    }
  });
  window.addEventListener('beforeunload', () => { if (W.lastHr) saveW(); });

  window.HMX = {
    homeCards,
    onView(v) {
      if (v === 'assistant') { renderAssistant(); scrollEnd(); }
      else if (v === 'watch') renderWatch();
    }
  };
})();
