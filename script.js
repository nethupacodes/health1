/* HealthMate — app logic (vanilla JS).
   Sections: 1 Setup · 2 Storage · 3 Data helpers · 4 UI helpers · 5 Actions · 6 Rendering ·
             7 Charts · 8 Mind · 9 Settings · 10 Reminders · 11 Events · 12 Boot */
(() => {
  'use strict';
  const { pad, dkey, parseKey, validKey, today, addDays, rangeKeys, esc, uid, timeToMin, sleepMinutes,
    crossesMidnight, fmtDur, avg, pct, streaks, toCSV } = window.HM;

  /* ============ 1. SETUP ============ */
  const KEYS = { records: 'healthmate.records.v1', prefs: 'healthmate.prefs.v1' };
  const VIEWS = ['home', 'assistant', 'habits', 'watch', 'mind', 'progress', 'profile'];
  const TABS = ['water', 'sleep', 'activity', 'food'];

  const GOALS = [{ id: 'hydration' }, { id: 'sleep' }, { id: 'activity' }, { id: 'habits' }];
  const HABITS = [
    { id: 'breakfast', label: 'Had breakfast', goal: 'habits' },
    { id: 'fruitveg', label: 'Ate a fruit or vegetable', goal: 'habits' },
    { id: 'water', label: 'Sipped water through the day', goal: 'hydration' },
    { id: 'move', label: 'Moved my body for fun', goal: 'activity' },
    { id: 'screen', label: 'Took a screen break', goal: 'habits' },
    { id: 'lunch', label: 'Ate a balanced lunch', goal: 'habits' },
    { id: 'talk', label: 'Talked or laughed with someone I trust', goal: 'habits' },
    { id: 'wind', label: 'Put screens away before bed', goal: 'sleep' }
  ];
  const MOODS = [
    { id: 'great', emoji: '😄', label: 'Great' }, { id: 'good', emoji: '🙂', label: 'Good' },
    { id: 'okay', emoji: '😐', label: 'Okay' }, { id: 'low', emoji: '😟', label: 'Low' },
    { id: 'struggling', emoji: '😢', label: 'Struggling' }
  ];
  const ACT_TYPES = ['walking', 'running', 'cycling', 'sports', 'workout'];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  const DEFAULT_PREFS = {
    onboarded: false, name: '', goals: [], theme: 'dark',
    waterGoal: 1500, sleepGoal: 8, activityGoal: 60, fvGoal: 5,
    reminders: { water: { on: false, every: 90 }, bed: { on: false, time: '21:30' } },
    contacts: { adultName: '', adultPhone: '', counName: '', counPhone: '' }
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmtNum = n => Math.round(n).toLocaleString();
  const fmtDay = (k, o = { weekday: 'short', month: 'short', day: 'numeric' }) => parseKey(k).toLocaleDateString(undefined, o);

  /* ============ 2. STORAGE ============ */
  function sanitizeRecords(raw) {
    const out = {};
    const num = (x, min, max) => typeof x === 'number' && isFinite(x) && x >= min && x <= max;
    const list = (a, ok) => Array.isArray(a) ? a.filter(e => e && typeof e === 'object' && typeof e.id === 'string' && ok(e)) : [];
    for (const [k, v] of Object.entries(raw || {})) {
      if (!validKey(k) || !v || typeof v !== 'object') continue;
      out[k] = {
        date: k,
        waterEntries: list(v.waterEntries, e => num(e.ml, 1, 5000)),
        sleepEntries: list(v.sleepEntries, e => num(e.minutes, 1, 1440) && timeToMin(e.bedtime) !== null && timeToMin(e.wake) !== null),
        activityEntries: list(v.activityEntries, e => num(e.minutes, 1, 1440) && ACT_TYPES.includes(e.type)),
        habitsCompleted: Array.isArray(v.habitsCompleted) ? [...new Set(v.habitsCompleted.filter(h => HABITS.some(x => x.id === h)))] : [],
        moodEntries: list(v.moodEntries, e => MOODS.some(m => m.id === e.mood)),
        fruitVeg: num(v.fruitVeg, 0, 50) ? Math.round(v.fruitVeg) : 0
      };
    }
    return out;
  }

  function sanitizePrefs(p) {
    const o = JSON.parse(JSON.stringify(DEFAULT_PREFS));
    if (!p || typeof p !== 'object') return o;
    const n = (x, min, max, def) => typeof x === 'number' && isFinite(x) && x >= min && x <= max ? x : def;
    const s = (x, len) => typeof x === 'string' ? x.slice(0, len) : '';
    o.onboarded = p.onboarded === true;
    o.name = s(p.name, 30);
    o.goals = Array.isArray(p.goals) ? p.goals.filter(g => GOALS.some(x => x.id === g)) : [];
    if (['system', 'light', 'dark'].includes(p.theme)) o.theme = p.theme;
    o.waterGoal = Math.round(n(p.waterGoal, 250, 6000, o.waterGoal));
    o.sleepGoal = n(p.sleepGoal, 4, 14, o.sleepGoal);
    o.activityGoal = Math.round(n(p.activityGoal, 5, 300, o.activityGoal));
    o.fvGoal = Math.round(n(p.fvGoal, 1, 15, o.fvGoal));
    const r = p.reminders || {};
    o.reminders.water = { on: !!(r.water && r.water.on === true), every: [30, 60, 90, 120, 180, 240].includes(r.water && r.water.every) ? r.water.every : 90 };
    o.reminders.bed = { on: !!(r.bed && r.bed.on === true), time: timeToMin(r.bed && r.bed.time) !== null ? r.bed.time : '21:30' };
    const c = p.contacts || {};
    o.contacts = { adultName: s(c.adultName, 60), adultPhone: s(c.adultPhone, 25), counName: s(c.counName, 60), counPhone: s(c.counPhone, 25) };
    return o;
  }

  function load(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { toast('Could not save. Browser storage may be full or blocked.', 'error'); return false; }
  }

  let records = sanitizeRecords(load(KEYS.records));
  let prefs = sanitizePrefs(load(KEYS.prefs));
  const savePrefs = () => save(KEYS.prefs, prefs);

  /* ============ 3. DATA HELPERS ============ */
  const emptyDay = k => ({ date: k, waterEntries: [], sleepEntries: [], activityEntries: [], habitsCompleted: [], moodEntries: [], fruitVeg: 0 });
  const isEmpty = d => !d.waterEntries.length && !d.sleepEntries.length && !d.activityEntries.length && !d.habitsCompleted.length && !d.moodEntries.length && !d.fruitVeg;
  const day = k => records[k] || emptyDay(k);
  const dayW = k => records[k] || (records[k] = emptyDay(k));
  function persist() {
    for (const k of Object.keys(records)) if (isEmpty(records[k])) delete records[k];
    return save(KEYS.records, records);
  }

  const waterTotal = k => day(k).waterEntries.reduce((a, e) => a + e.ml, 0);
  const sleepTotal = k => day(k).sleepEntries.reduce((a, e) => a + e.minutes, 0);
  const actTotal = k => day(k).activityEntries.reduce((a, e) => a + e.minutes, 0);
  const habitPct = k => pct(day(k).habitsCompleted.length, HABITS.length);
  const hasData = k => !isEmpty(day(k));
  const weekKeys = end => rangeKeys(addDays(end, -6), end);

  /** How many of the four daily goals were reached (habits: at least 75% ticked). */
  function goalsMet(k) {
    let n = 0;
    if (waterTotal(k) > 0 && waterTotal(k) >= prefs.waterGoal) n++;
    if (sleepTotal(k) > 0 && sleepTotal(k) / 60 >= prefs.sleepGoal) n++;
    if (actTotal(k) > 0 && actTotal(k) >= prefs.activityGoal) n++;
    if (habitPct(k) >= 75) n++;
    return n;
  }

  function findEntry(cat, id) {
    for (const k of Object.keys(records)) {
      const e = records[k][cat].find(x => x.id === id);
      if (e) return { k, e };
    }
    return null;
  }

  function stats() {
    const s = { waterLogs: 0, sleepLogs: 0, actLogs: 0, moodLogs: 0, waterGoalDays: 0, actGoalDays: 0, perfectHabitDays: 0 };
    const active = new Set(), waterDays = new Set();
    for (const k of Object.keys(records)) {
      const d = records[k];
      if (isEmpty(d)) continue;
      active.add(k);
      s.waterLogs += d.waterEntries.length; s.sleepLogs += d.sleepEntries.length;
      s.actLogs += d.activityEntries.length; s.moodLogs += d.moodEntries.length;
      if (waterTotal(k) >= prefs.waterGoal && waterTotal(k) > 0) { s.waterGoalDays++; waterDays.add(k); }
      if (actTotal(k) >= prefs.activityGoal && actTotal(k) > 0) s.actGoalDays++;
      if (habitPct(k) === 100) s.perfectHabitDays++;
    }
    const t = today();
    s.activeDays = active.size;
    s.log = streaks(active, t);
    s.waterStreak = streaks(waterDays, t);
    return s;
  }

  const BADGES = [
    { id: 'sip', name: 'First sip', desc: 'Log a drink', group: 'water', test: s => s.waterLogs >= 1 },
    { id: 'hydrated', name: 'Water goal reached', desc: 'Reach your water goal in a day', group: 'water', test: s => s.waterGoalDays >= 1 },
    { id: 'sleep3', name: 'Sleep keeper', desc: 'Log sleep 3 times', group: 'sleep', test: s => s.sleepLogs >= 3 },
    { id: 'move1', name: 'On the move', desc: 'Log your first activity', group: 'activity', test: s => s.actLogs >= 1 },
    { id: 'move5', name: 'Getting going', desc: 'Log 5 activities', group: 'activity', test: s => s.actLogs >= 5 },
    { id: 'movegoal', name: 'Activity goal reached', desc: 'Reach your activity goal in a day', group: 'activity', test: s => s.actGoalDays >= 1 },
    { id: 'mood1', name: 'Self check-in', desc: 'Save a mood check-in', group: 'mind', test: s => s.moodLogs >= 1 },
    { id: 'habits', name: 'Habit day', desc: 'Tick every habit in one day', group: 'habits', test: s => s.perfectHabitDays >= 1 },
    { id: 'streak3', name: '3-day streak', desc: 'Log something 3 days in a row', group: 'streak', test: s => s.log.longest >= 3 },
    { id: 'streak7', name: '7-day streak', desc: 'Log something 7 days in a row', group: 'streak', test: s => s.log.longest >= 7 }
  ];

  /* ============ 4. UI HELPERS ============ */
  let toastTimer = null;
  function toast(msg, type = 'ok', undo = null) {
    const el = $('#toast');
    el.className = 'toast ' + (type === 'error' ? 'error' : '');
    el.innerHTML = `<span>${esc(msg)}</span>`;
    if (undo) {
      const b = document.createElement('button');
      b.className = 'toast-btn'; b.textContent = 'Undo';
      b.addEventListener('click', () => { undo(); el.hidden = true; });
      el.appendChild(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, undo ? 6000 : 3500);
  }

  function setHTML(el, html) {
    const a = document.activeElement;
    const fid = a && el.contains(a) ? a.dataset.fid : null;
    el.innerHTML = html;
    if (fid) { const n = el.querySelector(`[data-fid="${CSS.escape(fid)}"]`); if (n) n.focus(); }
  }
  const put = (sel, html) => setHTML($(sel), html);
  const setErr = (id, msg) => { $(id).textContent = msg || ''; };

  const dlg = $('#dlg');
  let dlgHandler = null;
  function openDialog({ title, body, submit = 'Save', cancel = true, onSubmit }) {
    $('#dlgTitle').textContent = title;
    $('#dlgBody').innerHTML = body;
    $('#dlgError').textContent = '';
    $('#dlgSubmit').textContent = submit;
    $('#dlgCancel').hidden = !cancel;
    dlgHandler = onSubmit || null;
    if (!dlg.open) dlg.showModal();
  }
  $('#dlgForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!dlgHandler) { dlg.close(); return; }
    const err = dlgHandler(new FormData($('#dlgForm')));
    if (err) $('#dlgError').textContent = err; else dlg.close();
  });

  function confirmAction(title, msg, ok = 'Delete') {
    return new Promise(res => {
      const d = $('#confirmDlg');
      $('#confirmTitle').textContent = title; $('#confirmMsg').textContent = msg; $('#confirmOk').textContent = ok;
      d.returnValue = '';
      const done = () => { d.removeEventListener('close', done); res(d.returnValue === 'yes'); };
      d.addEventListener('close', done);
      d.showModal();
    });
  }

  function ring(p, label, color = 'var(--teal)', size = 88) {
    const stroke = 10, r = (size - stroke) / 2, c = 2 * Math.PI * r, mid = size / 2;
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}" style="--ring:${color}">
      <circle class="ring-bg" cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="ring-fg" cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}" transform="rotate(-90 ${mid} ${mid})"/>
      <text x="${mid}" y="${mid}" text-anchor="middle" dominant-baseline="central">${p}%</text></svg>`;
  }

  const icon = id => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;

  function itemHTML({ title, sub, tag, id, edit, del, label }) {
    return `<li class="item"><div class="item-main"><strong>${title}</strong>${sub ? `<span>${sub}</span>` : ''}${tag ? `<em class="tag">${tag}</em>` : ''}</div>
      <div class="item-actions">
        ${edit ? `<button class="icon-btn" data-action="${edit}" data-id="${esc(id)}" aria-label="Edit ${esc(label)}">${icon('edit')}</button>` : ''}
        ${del ? `<button class="icon-btn danger" data-action="${del}" data-id="${esc(id)}" aria-label="Delete ${esc(label)}">${icon('trash')}</button>` : ''}
      </div></li>`;
  }

  function miniBars(keys, values, max, fmt) {
    const m = Math.max(max, ...values.filter(v => v != null), 1);
    return `<div class="minibars" role="list">${keys.map((k, i) => {
      const v = values[i];
      const h = v == null ? 0 : Math.max(6, Math.round(v / m * 100));
      return `<div class="mb" role="listitem" aria-label="${esc(fmtDay(k))}: ${v == null ? 'no data' : fmt(v)}"><div class="mb-col">${v == null ? '<span class="mb-none"></span>' : `<span class="mb-bar" style="height:${h}%"></span>`}</div><small>${esc(fmtDay(k, { weekday: 'short' }))}</small></div>`;
    }).join('')}</div>`;
  }

  /* ============ 5. ACTIONS (change data) ============ */
  function addWater(ml, k = sel) {
    const v = Number(ml);
    if (!Number.isInteger(v) || v < 10 || v > 2000) return 'Enter a whole number of millilitres between 10 and 2000.';
    const before = waterTotal(k);
    dayW(k).waterEntries.push({ id: uid(), ml: v, createdAt: Date.now() });
    persist(); renderAll();
    toast(`Added ${v} ml.` + (before < prefs.waterGoal && before + v >= prefs.waterGoal ? ' You reached your water goal!' : ''));
    return null;
  }

  function validateSleep(bed, wake, k, ignoreId) {
    if (timeToMin(bed) === null || timeToMin(wake) === null) return { err: 'Enter both a bedtime and a wake-up time.' };
    const minutes = sleepMinutes(bed, wake);
    if (minutes === null) return { err: 'Bedtime and wake-up time can’t be the same.' };
    if (minutes > 960) return { err: 'That’s more than 16 hours. Please check your times.' };
    if (day(k).sleepEntries.some(e => e.id !== ignoreId && e.bedtime === bed && e.wake === wake)) return { err: 'You already saved this sleep for this day.' };
    return { minutes };
  }
  function addSleep(bed, wake, k = sel) {
    const r = validateSleep(bed, wake, k);
    if (r.err) return r.err;
    dayW(k).sleepEntries.push({ id: uid(), bedtime: bed, wake, minutes: r.minutes, crossedMidnight: crossesMidnight(bed, wake), source: 'manual', createdAt: Date.now() });
    persist(); renderAll();
    toast(`Sleep saved: ${fmtDur(r.minutes)}.`);
    return null;
  }

  function validateActivity(type, minutes, date, notes) {
    const m = Number(minutes);
    if (!ACT_TYPES.includes(type)) return 'Choose an activity type.';
    if (!Number.isInteger(m) || m < 1 || m > 600) return 'Enter whole minutes between 1 and 600.';
    if (!validKey(date)) return 'Choose a valid date.';
    if (date > today()) return 'The date can’t be in the future.';
    if (String(notes).length > 120) return 'Notes can be up to 120 characters.';
    return null;
  }
  function addActivity({ type, minutes, date, notes }) {
    const err = validateActivity(type, minutes, date, notes);
    if (err) return err;
    const n = String(notes).trim(), m = Number(minutes);
    const dup = day(date).activityEntries.some(e => e.type === type && e.minutes === m && (e.notes || '') === n && Date.now() - (e.createdAt || 0) < 60000);
    if (dup) return 'That looks like a duplicate of an activity you just saved.';
    const before = actTotal(date);
    dayW(date).activityEntries.push({ id: uid(), type, minutes: m, notes: n, createdAt: Date.now() });
    persist(); renderAll();
    toast(`Activity saved${date !== today() ? ' for ' + fmtDay(date) : ''}.` + (before < prefs.activityGoal && before + m >= prefs.activityGoal ? ' You reached your activity goal!' : ''));
    return null;
  }

  function saveMood(moodId, note) {
    if (!MOODS.some(m => m.id === moodId)) return 'Choose how you’re feeling first.';
    const n = String(note || '').trim().slice(0, 500);
    const t = today();
    if (day(t).moodEntries.some(e => e.mood === moodId && (e.note || '') === n && Date.now() - (e.createdAt || 0) < 60000)) return 'You just saved this check-in.';
    dayW(t).moodEntries.push({ id: uid(), mood: moodId, note: n, createdAt: Date.now() });
    persist(); renderAll(); showSupport(moodId);
    toast('Check-in saved.');
    return null;
  }

  function toggleHabit(k, id, on) {
    if (!validKey(k) || !HABITS.some(h => h.id === id)) return;
    const d = dayW(k), s = new Set(d.habitsCompleted);
    on ? s.add(id) : s.delete(id);
    d.habitsCompleted = [...s];
    persist(); renderAll();
    if (on && habitPct(k) === 100) toast('Every habit ticked for the day. Nice work!');
  }

  function deleteWithUndo(cat, id, what) {
    const f = findEntry(cat, id);
    if (!f) return;
    records[f.k][cat] = records[f.k][cat].filter(x => x.id !== id);
    persist(); renderAll();
    toast(`${what} deleted.`, 'ok', () => { dayW(f.k)[cat].push(f.e); persist(); renderAll(); toast('Restored.'); });
  }

  /* ----- edit dialogs ----- */
  function editWater(id) {
    const f = findEntry('waterEntries', id); if (!f) return;
    openDialog({
      title: 'Edit drink',
      body: `<label for="eMl">Amount (ml)</label><input id="eMl" name="ml" type="number" inputmode="numeric" min="10" max="2000" step="10" value="${f.e.ml}">`,
      onSubmit: fd => {
        const v = Number(fd.get('ml'));
        if (!Number.isInteger(v) || v < 10 || v > 2000) return 'Enter a whole number of millilitres between 10 and 2000.';
        f.e.ml = v; persist(); renderAll(); toast('Drink updated.');
      }
    });
  }
  function editSleep(id) {
    const f = findEntry('sleepEntries', id); if (!f) return;
    openDialog({
      title: 'Edit sleep',
      body: `<div class="grid2"><div><label for="eBed">Bedtime</label><input id="eBed" name="bed" type="time" value="${esc(f.e.bedtime)}"></div>
             <div><label for="eWake">Woke up</label><input id="eWake" name="wake" type="time" value="${esc(f.e.wake)}"></div></div>
             <p class="note">Entered manually · saved on ${esc(fmtDay(f.k))}</p>`,
      onSubmit: fd => {
        const bed = fd.get('bed'), wake = fd.get('wake');
        const r = validateSleep(bed, wake, f.k, id);
        if (r.err) return r.err;
        Object.assign(f.e, { bedtime: bed, wake, minutes: r.minutes, crossedMidnight: crossesMidnight(bed, wake) });
        persist(); renderAll(); toast('Sleep updated.');
      }
    });
  }
  function editActivity(id) {
    const f = findEntry('activityEntries', id); if (!f) return;
    openDialog({
      title: 'Edit activity',
      body: `<div class="grid2">
        <div><label for="eType">Type</label><select id="eType" name="type">${ACT_TYPES.map(t => `<option value="${t}" ${t === f.e.type ? 'selected' : ''}>${cap(t)}</option>`).join('')}</select></div>
        <div><label for="eMin">Minutes</label><input id="eMin" name="minutes" type="number" min="1" max="600" value="${f.e.minutes}"></div>
        <div><label for="eDate">Date</label><input id="eDate" name="date" type="date" max="${today()}" value="${f.k}"></div>
        <div><label for="eNote">Notes</label><input id="eNote" name="notes" type="text" maxlength="120" value="${esc(f.e.notes || '')}"></div></div>`,
      onSubmit: fd => {
        const type = fd.get('type'), minutes = fd.get('minutes'), date = fd.get('date'), notes = String(fd.get('notes') || '').trim();
        const err = validateActivity(type, minutes, date, notes);
        if (err) return err;
        records[f.k].activityEntries = records[f.k].activityEntries.filter(x => x.id !== id);
        Object.assign(f.e, { type, minutes: Number(minutes), notes });
        dayW(date).activityEntries.push(f.e);
        persist(); renderAll(); toast('Activity updated.');
      }
    });
  }
  const GOAL_CFG = {
    water: { key: 'waterGoal', label: 'Daily water goal (ml)', min: 250, max: 6000, step: 50, int: true },
    sleep: { key: 'sleepGoal', label: 'Nightly sleep goal (hours)', min: 4, max: 14, step: 0.5, int: false },
    activity: { key: 'activityGoal', label: 'Daily activity goal (minutes)', min: 5, max: 300, step: 5, int: true },
    fv: { key: 'fvGoal', label: 'Fruit and vegetable goal (servings)', min: 1, max: 15, step: 1, int: true }
  };
  function editGoal(kind) {
    const c = GOAL_CFG[kind];
    openDialog({
      title: 'Change goal',
      body: `<label for="gVal">${c.label}</label><input id="gVal" name="v" type="number" inputmode="decimal" min="${c.min}" max="${c.max}" step="${c.step}" value="${prefs[c.key]}">
             <p class="note">Choose what feels right for you. Needs differ from person to person.</p>`,
      onSubmit: fd => {
        const v = Number(fd.get('v'));
        if (!isFinite(v) || fd.get('v') === '' || v < c.min || v > c.max || (c.int && !Number.isInteger(v))) return `Enter ${c.int ? 'a whole number' : 'a number'} from ${c.min} to ${c.max}.`;
        prefs[c.key] = v; savePrefs(); fillSettings(); renderAll(); toast('Goal saved.');
      }
    });
  }

  /* ----- record manager (Profile) ----- */
  function recordsListHTML() {
    const keys = Object.keys(records).filter(hasData).sort().reverse();
    if (!keys.length) return '<p class="empty">No records yet. Nothing to delete.</p>';
    const del = (cat, k, id, label) => `<button class="icon-btn danger" data-action="rec-del" data-cat="${cat}" data-date="${k}" data-id="${esc(id)}" aria-label="Delete ${esc(label)}">${icon('trash')}</button>`;
    return keys.map(k => {
      const d = records[k], rows = [];
      d.waterEntries.forEach(e => rows.push([`${e.ml} ml water`, del('water', k, e.id, `${e.ml} ml water on ${fmtDay(k)}`)]));
      d.sleepEntries.forEach(e => rows.push([`Sleep ${fmtDur(e.minutes)}`, del('sleep', k, e.id, `sleep on ${fmtDay(k)}`)]));
      d.activityEntries.forEach(e => rows.push([`${cap(e.type)} ${e.minutes} min`, del('activity', k, e.id, `${e.type} on ${fmtDay(k)}`)]));
      d.moodEntries.forEach(e => rows.push([`Mood: ${MOODS.find(m => m.id === e.mood).label}${e.note ? ' (with note)' : ''}`, del('mood', k, e.id, `mood on ${fmtDay(k)}`)]));
      d.habitsCompleted.forEach(h => rows.push([`Habit: ${HABITS.find(x => x.id === h).label}`, del('habit', k, h, `habit on ${fmtDay(k)}`)]));
      if (d.fruitVeg) rows.push([`${d.fruitVeg} fruit and veg servings`, del('fruit', k, 'fv', `fruit and veg on ${fmtDay(k)}`)]);
      return `<h3>${esc(fmtDay(k, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</h3><ul class="list compact">${rows.map(r => `<li class="item"><div class="item-main"><span>${esc(r[0])}</span></div>${r[1]}</li>`).join('')}</ul>`;
    }).join('');
  }
  function openRecordManager() {
    openDialog({ title: 'Your records', body: `<div class="scroll" id="recList">${recordsListHTML()}</div>`, submit: 'Done', cancel: false });
  }
  function deleteRecord(cat, k, id) {
    const d = records[k]; if (!d) return;
    if (cat === 'water') d.waterEntries = d.waterEntries.filter(e => e.id !== id);
    else if (cat === 'sleep') d.sleepEntries = d.sleepEntries.filter(e => e.id !== id);
    else if (cat === 'activity') d.activityEntries = d.activityEntries.filter(e => e.id !== id);
    else if (cat === 'mood') d.moodEntries = d.moodEntries.filter(e => e.id !== id);
    else if (cat === 'habit') d.habitsCompleted = d.habitsCompleted.filter(h => h !== id);
    else if (cat === 'fruit') d.fruitVeg = 0;
    persist(); renderAll();
    const l = $('#recList'); if (l) l.innerHTML = recordsListHTML();
    toast('Record deleted.');
  }

  /* ----- export / clear ----- */
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportData(kind) {
    if (!Object.keys(records).length) { toast('No records yet, so there is nothing to export.', 'error'); return; }
    const stamp = today();
    if (kind === 'json') download(`healthmate-${stamp}.json`, JSON.stringify({ app: 'HealthMate', exportedAt: new Date().toISOString(), preferences: prefs, records }, null, 2), 'application/json');
    else download(`healthmate-${stamp}.csv`, toCSV(records), 'text/csv');
    toast(`Exported as ${kind.toUpperCase()}.`);
  }
  async function clearAll() {
    const ok = await confirmAction('Clear all data?', 'This permanently deletes every record, goal and setting stored by HealthMate in this browser. It cannot be undone. Export first if you want a copy.', 'Delete everything');
    if (!ok) return;
    try { localStorage.removeItem(KEYS.records); localStorage.removeItem(KEYS.prefs); } catch (e) { /* ignore */ }
    records = {}; prefs = sanitizePrefs(null); sel = today();
    breathReset(); applyTheme(); fillSettings(); fillContacts();
    showOnboarding();
    toast('All data deleted.');
  }

  /* ============ 6. RENDERING ============ */
  let view = 'home', tab = 'water', sel = today();

  function renderAll() {
    renderHome(); renderDateBar(); renderWater(); renderSleep(); renderActivity(); renderFood();
    renderMood(); renderProgress(); renderReminders(); renderNotifStatus(); renderCharts();
  }

  function habitListHTML(k, scope) {
    const done = new Set(day(k).habitsCompleted), p = habitPct(k);
    const ordered = [...HABITS].sort((a, b) => (prefs.goals.includes(b.goal) ? 1 : 0) - (prefs.goals.includes(a.goal) ? 1 : 0));
    return `<div class="progress-line"><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="Habits completed"><span style="width:${p}%"></span></div><strong>${p}%</strong></div>
      <p class="note">${done.size} of ${HABITS.length} done${prefs.goals.length ? '. Habits marked “for your goals” match what you chose to work on.' : ''}</p>
      <ul class="checklist">${ordered.map(h => `<li><label class="check"><input type="checkbox" data-habit="${h.id}" data-date="${k}" data-fid="${scope}-${h.id}" ${done.has(h.id) ? 'checked' : ''}><span>${esc(h.label)}</span>${prefs.goals.includes(h.goal) ? '<em class="tag">for your goals</em>' : ''}</label></li>`).join('')}</ul>`;
  }

  function reminderSummary() {
    const r = prefs.reminders, parts = [];
    parts.push(r.water.on ? `Water: every ${r.water.every} min` : 'Water: off');
    parts.push(r.bed.on ? `Bedtime: ${r.bed.time}` : 'Bedtime: off');
    let perm = 'in-app only';
    if ('Notification' in window && Notification.permission === 'granted') perm = 'browser notifications allowed';
    return `${parts.join(' · ')} (${perm}, while HealthMate is open)`;
  }

  function renderHome() {
    const t = today(), d = day(t);
    const w = waterTotal(t), wp = pct(w, prefs.waterGoal);
    const sm = sleepTotal(t), sp = pct(sm / 60, prefs.sleepGoal);
    const am = actTotal(t), ap = pct(am, prefs.activityGoal);
    const hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const first = d.sleepEntries[0];
    const todayMood = d.moodEntries.length ? MOODS.find(m => m.id === d.moodEntries[d.moodEntries.length - 1].mood) : null;
    const brandNew = !Object.keys(records).length;
    const week = weekKeys(t);

    const html = `
      <div class="hero">
        <div>
          <h1 tabindex="-1">${greet}${prefs.name ? ', ' + esc(prefs.name) : ''}</h1>
          <p>${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
          <p class="hero-sub">${isEmpty(d) ? 'Nothing logged yet today.' : `${goalsMet(t)} of 4 daily goals reached so far.`}</p>
        </div>
        <svg class="pulse" viewBox="0 0 120 40" aria-hidden="true"><polyline points="0 22 30 22 40 8 52 34 62 22 120 22"/></svg>
      </div>

      ${window.HMX ? window.HMX.homeCards() : ''}

      ${brandNew ? `<div class="card empty-card"><h2>Welcome to HealthMate</h2><p>You haven’t logged anything yet. Start with a glass of water or a quick mood check-in. Your progress will appear here as you go.</p></div>` : ''}

      <div class="chips quick" aria-label="Quick actions">
        <button class="chip" data-action="water-add" data-ml="250" data-date="${t}" data-fid="q-water">${icon('drop')} Add 250 ml</button>
        <button class="chip" data-action="nav" data-view="habits" data-tab="sleep" data-fid="q-sleep">${icon('moon')} Log sleep</button>
        <button class="chip" data-action="nav" data-view="habits" data-tab="activity" data-fid="q-act">${icon('activity')} Log activity</button>
        <button class="chip" data-action="nav" data-view="mind" data-fid="q-mind">${icon('mind')} Mood check-in</button>
      </div>

      <div class="grid2">
        <article class="card">
          <div class="card-split">${ring(wp, `Water: ${wp}% of today's goal`)}
            <div><h2>${icon('drop')} Water</h2><p class="big">${fmtNum(w)} <small>ml</small></p>
            <p class="note">${w ? `of your ${fmtNum(prefs.waterGoal)} ml goal` : `Goal: ${fmtNum(prefs.waterGoal)} ml. Nothing logged yet.`}</p></div></div>
          <div class="chips"><button class="chip" data-action="water-add" data-ml="250" data-date="${t}" data-fid="w250">+250 ml</button><button class="chip" data-action="water-add" data-ml="500" data-date="${t}" data-fid="w500">+500 ml</button><button class="chip" data-action="nav" data-view="habits" data-tab="water" data-fid="wmore">More options</button></div>
        </article>

        <article class="card">
          <div class="card-split">${ring(sp, `Sleep: ${sp}% of your sleep goal`, 'var(--navy-soft)')}
            <div><h2>${icon('moon')} Sleep</h2>${sm
              ? `<p class="big">${fmtDur(sm)}</p><p class="note">${first ? `${esc(first.bedtime)} to ${esc(first.wake)} · entered by you` : ''}</p>`
              : `<p class="note">No sleep logged for last night.</p>`}</div></div>
          <div class="chips"><button class="chip" data-action="nav" data-view="habits" data-tab="sleep" data-fid="s-log">${sm ? 'Manage sleep' : 'Log sleep'}</button></div>
        </article>

        <article class="card">
          <div class="card-split">${ring(ap, `Activity: ${ap}% of today's goal`, 'var(--teal-ink)')}
            <div><h2>${icon('activity')} Activity</h2><p class="big">${fmtNum(am)} <small>min</small></p>
            <p class="note">${am ? `of your ${prefs.activityGoal} min goal` : `Goal: ${prefs.activityGoal} min. Nothing logged yet.`}</p></div></div>
          <div class="chips"><button class="chip" data-action="nav" data-view="habits" data-tab="activity" data-fid="a-log">Log activity</button></div>
        </article>

        <article class="card">
          <h2>${icon('mind')} Mood check-in</h2>
          ${todayMood
            ? `<p class="big mood-now"><span aria-hidden="true">${todayMood.emoji}</span> ${esc(todayMood.label)}</p><p class="note">You checked in today. You can add a private note or check in again in MindCare.</p>
               <div class="chips"><button class="chip" data-action="nav" data-view="mind" data-fid="m-more">Open MindCare</button></div>`
            : `<p class="note">How are you feeling right now?</p>
               <div class="mood-quick">${MOODS.map(m => `<button class="mood-btn" data-action="mood-quick" data-mood="${m.id}" data-fid="mq-${m.id}" aria-label="${m.label}"><span aria-hidden="true">${m.emoji}</span><small>${m.label}</small></button>`).join('')}</div>`}
        </article>
      </div>

      <article class="card"><h2>${icon('habits')} Today’s habits</h2>${habitListHTML(t, 'home')}</article>

      <article class="card"><h2>This week</h2>
        <div class="week-prev" role="list">${week.map(k => {
          const met = goalsMet(k), has = hasData(k);
          return `<div class="wp" role="listitem" aria-label="${esc(fmtDay(k))}: ${has ? met + ' of 4 goals reached' : 'nothing logged'}"><div class="wp-col">${has ? `<span class="wp-bar" style="height:${15 + met * 21}%"></span>` : '<span class="wp-none"></span>'}</div><small>${esc(fmtDay(k, { weekday: 'short' }))}</small></div>`;
        }).join('')}</div>
        <p class="note">Bar height shows how many of your 4 daily goals you reached (water, sleep, activity, and at least 75% of habits). A dot means nothing was logged that day.</p>
        <button class="chip" data-action="nav" data-view="progress" data-fid="w-prog">See full progress</button>
      </article>

      <article class="card"><h2>${icon('bell')} Reminders</h2><p class="note">${esc(reminderSummary())}</p>
        <button class="chip" data-action="nav" data-view="profile" data-fid="r-set">Change reminders</button></article>`;
    put('#homeContent', html);
  }

  function renderDateBar() {
    const t = today();
    $('#dateLabel').textContent = sel === t ? 'Today · ' + fmtDay(sel) : fmtDay(sel, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    const inp = $('#dateInput'); inp.max = t; inp.value = sel;
    $('#dateNext').disabled = sel >= t;
    const ad = $('#actDate'); ad.max = t;
    if (!ad.dataset.touched) ad.value = sel;
  }

  function renderWater() {
    const w = waterTotal(sel), g = prefs.waterGoal, p = pct(w, g);
    put('#waterSummary', `<div class="card-split">${ring(p, `Water ${p}% of goal`)}
      <div><p class="big">${fmtNum(w)} <small>ml</small></p><p class="note">of ${fmtNum(g)} ml goal${w >= g && w > 0 ? ' · goal reached' : ''}</p>
      <button class="chip" data-action="goal" data-kind="water" data-fid="g-water">Change goal</button></div></div>`);
    const wk = weekKeys(sel), vals = wk.map(k => day(k).waterEntries.length ? waterTotal(k) : null);
    const a = avg(vals), logged = vals.filter(v => v != null).length;
    put('#waterWeek', miniBars(wk, vals, g, v => v + ' ml') + `<p class="note">${logged
      ? `${fmtNum(vals.reduce((s, v) => s + (v || 0), 0))} ml over ${logged} logged day${logged > 1 ? 's' : ''}. Average on logged days: ${fmtNum(a)} ml. Dashes mean nothing was logged.`
      : 'No drinks logged in this 7-day window yet.'}</p>`);
    const es = [...day(sel).waterEntries].sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
    put('#waterList', es.length ? es.map(e => itemHTML({
      title: `${e.ml} ml`, sub: e.createdAt ? 'Added at ' + esc(new Date(e.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) : '',
      id: e.id, edit: 'water-edit', del: 'water-del', label: `${e.ml} ml drink`
    })).join('') : '<li class="empty">No drinks logged for this day yet. Tap a quick-add button above to start.</li>');
  }

  function renderSleep() {
    const m = sleepTotal(sel), p = pct(m / 60, prefs.sleepGoal);
    put('#sleepSummary', `<div class="card-split">${ring(p, `Sleep ${p}% of goal`, 'var(--navy-soft)')}
      <div>${m ? `<p class="big">${fmtDur(m)}</p><p class="note">of your ${prefs.sleepGoal} h goal · entered by you</p>` : `<p class="note">No sleep saved for ${sel === today() ? 'last night' : 'the night before ' + esc(fmtDay(sel))} yet. Add it below.</p>`}
      <button class="chip" data-action="goal" data-kind="sleep" data-fid="g-sleep">Change goal</button></div></div>`);
    const all = [];
    Object.keys(records).sort().reverse().forEach(k => records[k].sleepEntries.forEach(e => all.push({ k, e })));
    const shown = all.slice(0, 14);
    put('#sleepList', shown.length ? shown.map(({ k, e }) => itemHTML({
      title: fmtDur(e.minutes), sub: `${esc(e.bedtime)} to ${esc(e.wake)}${e.crossedMidnight ? ' (past midnight)' : ''} · woke ${esc(fmtDay(k))}`,
      tag: 'Entered manually', id: e.id, edit: 'sleep-edit', del: 'sleep-del', label: `sleep on ${fmtDay(k)}`
    })).join('') + (all.length > 14 ? '<li class="note">Showing your 14 latest entries. Older ones are in Profile › Review records.</li>' : '') : '<li class="empty">No sleep saved yet. Enter your bedtime and wake-up time above.</li>');
    updateSleepPreview();
  }
  function updateSleepPreview() {
    const m = sleepMinutes($('#bed').value, $('#wake').value);
    $('#sleepPreview').textContent = m === null ? ($('#bed').value && $('#wake').value ? 'Bedtime and wake-up time can’t be the same.' : '')
      : `Sleep time: ${fmtDur(m)}${crossesMidnight($('#bed').value, $('#wake').value) ? ' (crosses midnight)' : ''}`;
  }

  function renderActivity() {
    const m = actTotal(sel), g = prefs.activityGoal, p = pct(m, g);
    put('#activitySummary', `<div class="card-split">${ring(p, `Activity ${p}% of goal`, 'var(--teal-ink)')}
      <div><p class="big">${fmtNum(m)} <small>min</small></p><p class="note">of ${g} min goal${m >= g && m > 0 ? ' · goal reached' : ''}</p>
      <button class="chip" data-action="goal" data-kind="activity" data-fid="g-act">Change goal</button></div></div>`);
    const all = [];
    Object.keys(records).sort().reverse().forEach(k => [...records[k].activityEntries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).forEach(e => all.push({ k, e })));
    put('#actList', all.length ? all.slice(0, 20).map(({ k, e }) => itemHTML({
      title: `${cap(e.type)} · ${e.minutes} min`, sub: `${esc(fmtDay(k))}${e.notes ? ' · ' + esc(e.notes) : ''}`,
      id: e.id, edit: 'act-edit', del: 'act-del', label: `${e.type} on ${fmtDay(k)}`
    })).join('') : '<li class="empty">No activity logged yet. Even a short walk counts.</li>');
    put('#badgesActivity', badgesHTML(b => b.group === 'activity' || b.id === 'streak3' || b.id === 'streak7'));
  }

  function renderFood() {
    const n = day(sel).fruitVeg, g = prefs.fvGoal;
    put('#fvTracker', `<div class="fv"><button class="icon-btn big-btn" data-action="fv-dec" data-fid="fv-dec" aria-label="Remove one serving" ${n ? '' : 'disabled'}>${icon('minus')}</button>
      <div class="fv-mid"><p class="big">${n} <small>of ${g}</small></p><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${g}" aria-valuenow="${Math.min(n, g)}" aria-label="Fruit and vegetable servings"><span style="width:${pct(n, g)}%"></span></div></div>
      <button class="icon-btn big-btn" data-action="fv-inc" data-fid="fv-inc" aria-label="Add one serving">${icon('plus')}</button></div>
      <p class="note">One serving is roughly a small fruit, or a handful of vegetables or leaves. Your goal is adjustable. <button class="link" data-action="goal" data-kind="fv" data-fid="g-fv">Change goal</button></p>`);
    put('#habitListFood', habitListHTML(sel, 'food'));
  }

  function renderMood() {
    const all = [];
    Object.keys(records).sort().reverse().forEach(k => [...records[k].moodEntries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).forEach(e => all.push({ k, e })));
    put('#moodList', all.length ? all.slice(0, 30).map(({ k, e }) => {
      const m = MOODS.find(x => x.id === e.mood);
      return itemHTML({
        title: `<span aria-hidden="true">${m.emoji}</span> ${esc(m.label)}`,
        sub: `${esc(fmtDay(k))}${e.createdAt ? ', ' + esc(new Date(e.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) : ''}${e.note ? '<br>' + esc(e.note) : ''}`,
        id: e.id, del: 'mood-del', label: `${m.label} check-in on ${fmtDay(k)}`
      });
    }).join('') : '<li class="empty">No check-ins yet. Pick how you feel above. It only takes a few seconds.</li>');
    renderContacts();
  }

  function showSupport(moodId) {
    const c = $('#supportCard');
    if (moodId === 'low' || moodId === 'struggling') {
      c.hidden = false;
      c.innerHTML = `<h2>Thanks for being honest</h2><p>Everyone has hard days. It can help to talk to someone you trust, such as a parent, relative, teacher or school counsellor. Try the breathing exercise below too.</p>${contactsHTML()}`;
    } else { c.hidden = true; c.innerHTML = ''; }
  }

  function contactsHTML() {
    const c = prefs.contacts, out = [];
    const tel = p => 'tel:' + p.replace(/[^\d+]/g, '');
    if (c.adultPhone.trim()) out.push(`<a class="btn small ghost" href="${esc(tel(c.adultPhone))}">${icon('phone')} Call ${esc(c.adultName || 'trusted adult')}</a>`);
    else if (c.adultName) out.push(`<p class="note">Trusted adult: ${esc(c.adultName)}</p>`);
    if (c.counPhone.trim()) out.push(`<a class="btn small ghost" href="${esc(tel(c.counPhone))}">${icon('phone')} Call ${esc(c.counName || 'school counsellor')}</a>`);
    else if (c.counName) out.push(`<p class="note">School counsellor: ${esc(c.counName)}</p>`);
    return out.length ? `<div class="chips">${out.join('')}</div>` : '<p class="note">Add a trusted adult or counsellor under “People I can talk to” below.</p>';
  }
  function renderContacts() { put('#contactsShow', contactsHTML()); }

  function badgesHTML(filter = () => true) {
    const s = stats();
    return BADGES.filter(filter).map(b => {
      const on = b.test(s);
      return `<div class="badge ${on ? 'on' : ''}">${icon('award')}<strong>${esc(b.name)}</strong><small>${esc(b.desc)}</small><span class="state">${on ? 'Earned' : 'Not yet'}</span></div>`;
    }).join('');
  }

  /* ----- progress ----- */
  let rangeError = '';
  function getRange() {
    const mode = $('#rangeSel').value, t = today();
    let from, to = t;
    if (mode === 'custom') {
      from = $('#rFrom').value; to = $('#rTo').value || t;
      if (!validKey(from) || !validKey(to)) return { error: 'Choose a start and end date.' };
      if (from > to) return { error: 'The start date must be on or before the end date.' };
      if (to > t) to = t;
      if (rangeKeys(from, to, 93).length > 92) return { error: 'Please choose 92 days or fewer.' };
    } else from = addDays(t, -(Number(mode) - 1));
    return { from, to, keys: rangeKeys(from, to) };
  }
  function seriesFor(keys) {
    return {
      water: keys.map(k => day(k).waterEntries.length ? waterTotal(k) : null),
      sleep: keys.map(k => day(k).sleepEntries.length ? sleepTotal(k) / 60 : null),
      act: keys.map(k => day(k).activityEntries.length ? actTotal(k) : null),
      habit: keys.map(k => hasData(k) ? habitPct(k) : null)
    };
  }
  const cnt = a => a.filter(v => v != null).length;
  const fmtH = h => fmtDur(Math.round(h * 60));

  function renderProgress() {
    const r = getRange();
    rangeError = r.error || '';
    setErr('#rangeErr', rangeError);
    $('#customRange').hidden = $('#rangeSel').value !== 'custom';
    if (r.error) {
      ['#progSummary', '#progHabits', '#progCompare'].forEach(s => put(s, ''));
    } else {
      const s = seriesFor(r.keys), n = r.keys.length;
      const stat = (label, val, sub) => `<div class="card stat"><span>${label}</span><strong>${val}</strong><small>${sub}</small></div>`;
      const aw = avg(s.water), as = avg(s.sleep), aa = avg(s.act);
      put('#progSummary',
        stat('Water per day', aw == null ? '–' : fmtNum(aw) + ' ml', aw == null ? 'Nothing logged in this period' : `average over ${cnt(s.water)} logged day${cnt(s.water) > 1 ? 's' : ''}`) +
        stat('Sleep per night', as == null ? '–' : fmtH(as), as == null ? 'Nothing logged in this period' : `average over ${cnt(s.sleep)} logged night${cnt(s.sleep) > 1 ? 's' : ''}`) +
        stat('Activity per day', aa == null ? '–' : fmtNum(aa) + ' min', aa == null ? 'Nothing logged in this period' : `${fmtNum(s.act.reduce((x, v) => x + (v || 0), 0))} min in total`) +
        stat('Days with entries', `${cnt(s.habit)} of ${n}`, `${fmtDay(r.from, { month: 'short', day: 'numeric' })} to ${fmtDay(r.to, { month: 'short', day: 'numeric' })}`));

      const ah = avg(s.habit);
      put('#progHabits', ah == null ? '<p class="empty">No habits logged in this period yet.</p>' :
        `<div class="card-split">${ring(Math.round(ah), `Average habit completion ${Math.round(ah)}%`)}<p class="note">Average completion on the ${cnt(s.habit)} day${cnt(s.habit) > 1 ? 's' : ''} you logged something.</p></div>
         <ul class="habit-stats">${HABITS.map(h => { const c = r.keys.filter(k => day(k).habitsCompleted.includes(h.id)).length; return `<li><span>${esc(h.label)}</span><div class="bar"><span style="width:${pct(c, n)}%"></span></div><small>${c} of ${n} days</small></li>`; }).join('')}</ul>`);

      const prevKeys = rangeKeys(addDays(r.from, -n), addDays(r.from, -1));
      const p = seriesFor(prevKeys);
      const row = (label, cur, prev, fmt, diffFmt) => {
        if (cur == null) return `<li><strong>${label}:</strong> nothing logged in this period.</li>`;
        if (prev == null) return `<li><strong>${label}:</strong> ${fmt(cur)} on average. No earlier data to compare yet.</li>`;
        const d = cur - prev;
        return `<li><strong>${label}:</strong> ${fmt(cur)} on average, compared with ${fmt(prev)} in the ${n} days before${Math.abs(d) < 0.01 ? ' (about the same)' : ` (${d > 0 ? '+' : '−'}${diffFmt(Math.abs(d))})`}.</li>`;
      };
      put('#progCompare', `<ul class="bullets">${row('Water', aw, avg(p.water), v => fmtNum(v) + ' ml', v => fmtNum(v) + ' ml')}${row('Sleep', as, avg(p.sleep), fmtH, fmtH)}${row('Activity', aa, avg(p.act), v => fmtNum(v) + ' min', v => fmtNum(v) + ' min')}${row('Habits', ah, avg(p.habit), v => Math.round(v) + '%', v => Math.round(v) + ' points')}</ul>
        <p class="note">Averages count only the days you logged. Small ups and downs are normal.</p>`);
    }

    const st = stats();
    put('#progStreaks', st.activeDays ? `<div class="stat-grid">
      <div class="stat"><span>Logging streak</span><strong>${st.log.current} day${st.log.current === 1 ? '' : 's'}</strong><small>Longest: ${st.log.longest}</small></div>
      <div class="stat"><span>Water goal streak</span><strong>${st.waterStreak.current} day${st.waterStreak.current === 1 ? '' : 's'}</strong><small>Longest: ${st.waterStreak.longest}</small></div></div>
      <p class="note">A streak counts days in a row with at least one entry. Today still counts until midnight, and missing a day is okay. Just start again.</p>` : '<p class="empty">Log something today to start your first streak.</p>');

    const wk = weekKeys(today()), ws = seriesFor(wk), logged = wk.filter(hasData).length;
    if (!logged) put('#weeklySummary', '<p class="empty">Nothing logged in the last 7 days yet. Your weekly summary will appear once you add some entries.</p>');
    else {
      const lines = [`You logged something on <strong>${logged} of the last 7 days</strong>.`];
      if (cnt(ws.water)) lines.push(`Water: averaged <strong>${fmtNum(avg(ws.water))} ml</strong> on ${cnt(ws.water)} logged day${cnt(ws.water) > 1 ? 's' : ''}; goal reached on ${wk.filter(k => waterTotal(k) > 0 && waterTotal(k) >= prefs.waterGoal).length}.`);
      if (cnt(ws.sleep)) lines.push(`Sleep: averaged <strong>${fmtH(avg(ws.sleep))}</strong> over ${cnt(ws.sleep)} logged night${cnt(ws.sleep) > 1 ? 's' : ''}.`);
      if (cnt(ws.act)) lines.push(`Activity: <strong>${fmtNum(ws.act.reduce((x, v) => x + (v || 0), 0))} min</strong> across ${cnt(ws.act)} day${cnt(ws.act) > 1 ? 's' : ''}.`);
      if (avg(ws.habit) != null) lines.push(`Habits: about <strong>${Math.round(avg(ws.habit))}%</strong> completed on days you logged.`);
      put('#weeklySummary', `<ul class="bullets">${lines.map(l => `<li>${l}</li>`).join('')}</ul>`);
    }
    put('#badgesAll', badgesHTML());
  }

  /* ============ 7. CHARTS ============ */
  const charts = {};
  function barChart(id, labels, data, { goal, unit, desc }) {
    const cv = $('#' + id), fb = cv.parentElement.querySelector('.chart-fallback');
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    if (typeof Chart === 'undefined') { fb.hidden = false; cv.hidden = true; return; }
    fb.hidden = true; cv.hidden = false;
    cv.setAttribute('aria-label', desc);
    const css = getComputedStyle(document.documentElement), v = n => css.getPropertyValue(n).trim();
    const datasets = [{ type: 'bar', label: unit, data, backgroundColor: v('--teal'), borderRadius: 8, maxBarThickness: 38 }];
    if (goal) datasets.push({ type: 'line', label: 'Your goal', data: labels.map(() => goal), borderColor: v('--chart-line'), borderDash: [6, 4], borderWidth: 2, pointRadius: 0 });
    const f = n => (Math.round(n * 10) / 10).toLocaleString();
    charts[id] = new Chart(cv, {
      type: 'bar', data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: reduceMotion ? false : { duration: 350 },
        plugins: {
          legend: { display: !!goal, labels: { color: v('--muted'), boxWidth: 14 } },
          tooltip: { callbacks: { label: c => c.dataset.type === 'line' ? `Goal: ${f(c.parsed.y)} ${unit}` : `${f(c.parsed.y)} ${unit}` } }
        },
        scales: {
          x: { ticks: { color: v('--muted'), maxRotation: 0, autoSkip: true }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: v('--muted') }, grid: { color: v('--line') }, title: { display: true, text: unit, color: v('--muted') } }
        }
      }
    });
  }
  const labelsFor = keys => keys.map(k => keys.length <= 7 ? fmtDay(k, { weekday: 'short' }) : fmtDay(k, { month: 'short', day: 'numeric' }));
  const roundH = h => h == null ? null : Math.round(h * 100) / 100;

  function renderCharts() {
    if (view === 'habits' && tab === 'sleep') {
      const wk = weekKeys(sel), s = seriesFor(wk);
      barChart('chartSleepWeek', labelsFor(wk), s.sleep.map(roundH), { goal: prefs.sleepGoal, unit: 'hours', desc: 'Bar chart of hours slept over the 7 days ending ' + fmtDay(sel) });
      $('#sleepWeekNote').textContent = cnt(s.sleep) ? `Average on logged nights: ${fmtH(avg(s.sleep))}. Missing bars mean no sleep was logged.` : 'No sleep logged in this 7-day window yet.';
    }
    if (view === 'habits' && tab === 'activity') {
      const wk = weekKeys(sel), s = seriesFor(wk);
      barChart('chartActWeek', labelsFor(wk), s.act, { goal: prefs.activityGoal, unit: 'minutes', desc: 'Bar chart of activity minutes over the 7 days ending ' + fmtDay(sel) });
      $('#actWeekNote').textContent = cnt(s.act) ? `${fmtNum(s.act.reduce((x, v) => x + (v || 0), 0))} minutes across ${cnt(s.act)} day${cnt(s.act) > 1 ? 's' : ''} in this window.` : 'No activity logged in this 7-day window yet.';
    }
    if (view === 'progress') {
      const r = getRange();
      if (r.error) return;
      const s = seriesFor(r.keys), L = labelsFor(r.keys), span = `from ${fmtDay(r.from)} to ${fmtDay(r.to)}`;
      barChart('chartWater', L, s.water, { goal: prefs.waterGoal, unit: 'ml', desc: 'Bar chart of water logged per day ' + span });
      barChart('chartSleep', L, s.sleep.map(roundH), { goal: prefs.sleepGoal, unit: 'hours', desc: 'Bar chart of hours slept per day ' + span });
      barChart('chartAct', L, s.act, { goal: prefs.activityGoal, unit: 'minutes', desc: 'Bar chart of activity minutes per day ' + span });
    }
  }

  /* ============ 8. MINDCARE: breathing ============ */
  const PHASES = [{ t: 'Breathe in', s: 4, scale: 1.4 }, { t: 'Hold', s: 4, scale: 1.4 }, { t: 'Breathe out', s: 6, scale: 1 }];
  const breath = { timer: null, phase: 0, left: 0, cycles: 0, running: false };
  const bEl = { c: $('#breathCircle'), label: $('#breathLabel'), count: $('#breathCount'), cycles: $('#breathCycles'), start: $('#breathStart'), pause: $('#breathPause') };

  function breathApply() {
    const p = PHASES[breath.phase];
    bEl.c.style.transition = reduceMotion ? 'none' : `transform ${breath.left}s ease-in-out`;
    bEl.c.style.transform = `scale(${p.scale})`;
    bEl.label.textContent = p.t; bEl.count.textContent = breath.left;
  }
  function breathButtons() {
    bEl.start.disabled = breath.running; bEl.pause.disabled = !breath.running;
    bEl.start.textContent = breath.left && !breath.running ? 'Resume' : 'Start';
    bEl.cycles.textContent = breath.cycles ? `${breath.cycles} full breath${breath.cycles > 1 ? 's' : ''} completed` : '';
  }
  function breathStart() {
    if (breath.running) return;
    if (!breath.left) { breath.phase = 0; breath.left = PHASES[0].s; }
    breath.running = true; breathApply();
    breath.timer = setInterval(() => {
      breath.left--;
      if (breath.left <= 0) {
        breath.phase = (breath.phase + 1) % PHASES.length;
        if (breath.phase === 0) breath.cycles++;
        breath.left = PHASES[breath.phase].s; breathApply(); breathButtons();
      } else bEl.count.textContent = breath.left;
    }, 1000);
    breathButtons();
  }
  function breathPause() {
    if (!breath.running) return;
    clearInterval(breath.timer); breath.running = false;
    const cur = getComputedStyle(bEl.c).transform;
    bEl.c.style.transition = 'none'; bEl.c.style.transform = cur === 'none' ? 'scale(1)' : cur;
    bEl.label.textContent = 'Paused'; breathButtons();
  }
  function breathReset() {
    clearInterval(breath.timer);
    Object.assign(breath, { timer: null, phase: 0, left: 0, cycles: 0, running: false });
    bEl.c.style.transition = 'none'; bEl.c.style.transform = 'scale(1)';
    bEl.label.textContent = 'Ready when you are'; bEl.count.textContent = '';
    breathButtons();
  }

  /* ============ 9. SETTINGS ============ */
  function applyTheme() {
    const root = document.documentElement;
    prefs.theme === 'system' ? root.removeAttribute('data-theme') : root.setAttribute('data-theme', prefs.theme);
    const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    const m = $('meta[name="theme-color"]'); if (m) m.content = dark ? '#0C1A22' : '#123B50';
  }
  function fillSettings() {
    $('#setName').value = prefs.name;
    $$('input[name="setGoal"]').forEach(i => { i.checked = prefs.goals.includes(i.value); });
    $('#setWater').value = prefs.waterGoal; $('#setSleep').value = prefs.sleepGoal;
    $('#setAct').value = prefs.activityGoal; $('#setFv').value = prefs.fvGoal;
    $('#setTheme').value = prefs.theme;
  }
  function fillContacts() {
    const c = prefs.contacts;
    $('#cAdultName').value = c.adultName; $('#cAdultPhone').value = c.adultPhone;
    $('#cCounName').value = c.counName; $('#cCounPhone').value = c.counPhone;
  }
  function saveSettings(e) {
    e.preventDefault();
    const num = (id, min, max, int, label) => {
      const raw = $(id).value, v = Number(raw);
      if (raw === '' || !isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) throw new Error(`${label} must be ${int ? 'a whole number' : 'a number'} from ${min} to ${max}.`);
      return v;
    };
    try {
      const n = {
        waterGoal: num('#setWater', 250, 6000, true, 'Water goal'), sleepGoal: num('#setSleep', 4, 14, false, 'Sleep goal'),
        activityGoal: num('#setAct', 5, 300, true, 'Activity goal'), fvGoal: num('#setFv', 1, 15, true, 'Fruit and veg goal')
      };
      Object.assign(prefs, n, { name: $('#setName').value.trim().slice(0, 30), goals: $$('input[name="setGoal"]:checked').map(i => i.value), theme: $('#setTheme').value });
      setErr('#settingsErr', '');
      if (!savePrefs()) return;
      applyTheme(); renderAll(); toast('Settings saved.');
    } catch (err) { setErr('#settingsErr', err.message); }
  }
  function saveContacts(e) {
    e.preventDefault();
    const ok = p => p === '' || /^[+\d][\d\s()-]{2,24}$/.test(p);
    const c = { adultName: $('#cAdultName').value.trim(), adultPhone: $('#cAdultPhone').value.trim(), counName: $('#cCounName').value.trim(), counPhone: $('#cCounPhone').value.trim() };
    if (!ok(c.adultPhone) || !ok(c.counPhone)) { setErr('#contactsErr', 'Phone numbers can only use digits, spaces, + ( ) and -.'); return; }
    setErr('#contactsErr', '');
    prefs.contacts = c; savePrefs(); renderMood(); toast('Contacts saved on this device.');
  }

  /* ============ 10. REMINDERS ============ */
  let lastWater = Date.now(), lastBed = '';
  function reminderHTML(scope, kind) {
    const r = prefs.reminders;
    const water = `<div class="rem"><label class="switch"><input type="checkbox" data-rem="water-on" data-fid="${scope}-won" ${r.water.on ? 'checked' : ''}><span>Hydration reminder</span></label>
      <label class="inline">Every <select data-rem="water-every" data-fid="${scope}-wevery" aria-label="Minutes between hydration reminders">${[30, 60, 90, 120, 180, 240].map(m => `<option value="${m}" ${m === r.water.every ? 'selected' : ''}>${m}</option>`).join('')}</select> minutes</label></div>`;
    const bed = `<div class="rem"><label class="switch"><input type="checkbox" data-rem="bed-on" data-fid="${scope}-bon" ${r.bed.on ? 'checked' : ''}><span>Bedtime reminder</span></label>
      <label class="inline">At <input type="time" data-rem="bed-time" data-fid="${scope}-btime" value="${esc(r.bed.time)}" aria-label="Bedtime reminder time"></label></div>`;
    return kind === 'water' ? water : kind === 'bed' ? bed : water + bed;
  }
  function renderReminders() {
    put('#remWaterTracker', reminderHTML('tw', 'water') + '<p class="note">Appears only while HealthMate is open.</p>');
    put('#remBedTracker', reminderHTML('tb', 'bed') + '<p class="note">Appears only while HealthMate is open.</p>');
    put('#remProfile', reminderHTML('pf'));
  }
  function renderNotifStatus() {
    let msg, btn = '';
    if (!('Notification' in window)) msg = 'This browser does not support notifications. Reminders will show inside the app instead.';
    else if (Notification.permission === 'granted') msg = 'Notifications are allowed for HealthMate.';
    else if (Notification.permission === 'denied') msg = 'Notifications are blocked. You can allow them in your browser’s site settings. Until then, reminders show inside the app.';
    else { msg = 'Notifications have not been allowed yet.'; btn = `<button class="btn small ghost" data-action="notif-request" data-fid="notif-btn">${icon('bell')} Allow notifications</button>`; }
    put('#notifStatus', `<p class="note">${esc(msg)}</p>${btn}`);
  }
  async function askPermission() {
    if (!('Notification' in window)) return;
    try { if (Notification.permission === 'default') await Notification.requestPermission(); } catch (e) { /* ignore */ }
    renderNotifStatus(); renderHome();
  }
  async function reminderFeedback() {
    await askPermission();
    if (!('Notification' in window)) toast('Reminder saved. This browser can’t show notifications, so it will appear inside the app while it is open.');
    else if (Notification.permission === 'granted') toast('Reminder saved. It will show while HealthMate is open.');
    else toast('Reminder saved, but notifications are not allowed, so it will appear inside the app while it is open.');
  }
  function onReminderChange(t) {
    const r = prefs.reminders, k = t.dataset.rem;
    let on = false;
    if (k === 'water-on') { r.water.on = t.checked; on = t.checked; lastWater = Date.now(); }
    else if (k === 'water-every') { const v = Number(t.value); if ([30, 60, 90, 120, 180, 240].includes(v)) { r.water.every = v; lastWater = Date.now(); } }
    else if (k === 'bed-on') { r.bed.on = t.checked; on = t.checked; }
    else if (k === 'bed-time') { if (timeToMin(t.value) === null) { toast('Enter a valid time.', 'error'); renderReminders(); return; } r.bed.time = t.value; }
    savePrefs(); renderReminders(); renderHome();
    if (on) reminderFeedback(); else toast('Reminder settings saved.');
  }
  function notify(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: 'icon-192.png' }); return; } catch (e) { /* fall through to in-app */ }
    }
    toast(`${title}. ${body}`);
  }
  function checkReminders() {
    const now = new Date(), r = prefs.reminders;
    if (r.water.on && now.getHours() >= 7 && now.getHours() < 21 && Date.now() - lastWater >= r.water.every * 60000) {
      lastWater = Date.now();
      notify('Time for some water', `You have had ${fmtNum(waterTotal(today()))} ml today.`);
    }
    const stamp = `${today()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (r.bed.on && stamp.endsWith(r.bed.time) && lastBed !== stamp) { lastBed = stamp; notify('Bedtime soon', 'Time to wind down and put your screens away.'); }
  }

  /* ============ 11. NAVIGATION + EVENTS ============ */
  function showView(v, push = true) {
    if (!VIEWS.includes(v)) v = 'home';
    view = v;
    VIEWS.forEach(n => { $('#view-' + n).hidden = n !== v; });
    $$('.nav-btn').forEach(b => { b.dataset.view === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
    document.title = `${$('#view-' + v).dataset.title} · HealthMate`;
    if (push && location.hash !== '#' + v) location.hash = v;
    renderAll();
    if (window.HMX) window.HMX.onView(v);
    window.scrollTo(0, 0);
    const h = $('#view-' + v + ' h1'); (h || $('#main')).focus({ preventScroll: true });
  }
  function showTab(t) {
    tab = TABS.includes(t) ? t : 'water';
    TABS.forEach(n => {
      $('#tab-' + n).hidden = n !== tab;
      const b = $('#t-' + n); b.setAttribute('aria-selected', String(n === tab)); b.tabIndex = n === tab ? 0 : -1;
    });
    renderCharts();
  }
  function setSel(k) {
    if (!validKey(k) || k > today()) return;
    sel = k; $('#actDate').dataset.touched = ''; renderAll();
  }

  const ACTIONS = {
    nav: t => {
      if (t.dataset.view === 'habits' && t.dataset.tab) { sel = today(); $('#actDate').dataset.touched = ''; }
      showView(t.dataset.view);
      if (t.dataset.tab) showTab(t.dataset.tab);
    },
    'ob-next': () => obStep(obCur + 1), 'ob-back': () => obStep(obCur - 1), 'ob-skip': () => finishOnboarding(false),
    'dlg-cancel': () => dlg.close(),
    'date-prev': () => setSel(addDays(sel, -1)), 'date-next': () => setSel(addDays(sel, 1)), 'date-today': () => setSel(today()),
    'water-add': t => { const err = addWater(t.dataset.ml, validKey(t.dataset.date) ? t.dataset.date : sel); if (err) toast(err, 'error'); },
    'water-edit': t => editWater(t.dataset.id), 'water-del': t => deleteWithUndo('waterEntries', t.dataset.id, 'Drink'),
    'sleep-edit': t => editSleep(t.dataset.id), 'sleep-del': t => deleteWithUndo('sleepEntries', t.dataset.id, 'Sleep entry'),
    'act-edit': t => editActivity(t.dataset.id), 'act-del': t => deleteWithUndo('activityEntries', t.dataset.id, 'Activity'),
    'mood-del': t => deleteWithUndo('moodEntries', t.dataset.id, 'Check-in'),
    'mood-quick': t => { const err = saveMood(t.dataset.mood, ''); if (err) toast(err, 'error'); },
    goal: t => editGoal(t.dataset.kind),
    'fv-inc': () => { const d = dayW(sel); if (d.fruitVeg < 50) d.fruitVeg++; persist(); renderAll(); },
    'fv-dec': () => { const d = dayW(sel); if (d.fruitVeg > 0) d.fruitVeg--; persist(); renderAll(); },
    'export-json': () => exportData('json'), 'export-csv': () => exportData('csv'),
    'manage-records': openRecordManager,
    'rec-del': t => deleteRecord(t.dataset.cat, t.dataset.date, t.dataset.id),
    'clear-all': clearAll, 'notif-request': async () => { await askPermission(); toast(('Notification' in window && Notification.permission === 'granted') ? 'Notifications allowed.' : 'Notifications were not allowed.'); }
  };
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-action]');
    if (t && ACTIONS[t.dataset.action]) ACTIONS[t.dataset.action](t, e);
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset && t.dataset.habit) toggleHabit(t.dataset.date, t.dataset.habit, t.checked);
    else if (t.dataset && t.dataset.rem) onReminderChange(t);
  });
  window.addEventListener('hashchange', () => {
    const v = location.hash.slice(1);
    if (!$('#app').hidden && VIEWS.includes(v) && v !== view) showView(v, false);
  });

  /* tabs: keyboard (arrow keys) */
  $$('[role="tab"]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('.tabs').addEventListener('keydown', e => {
    const i = TABS.indexOf(tab);
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length; else if (e.key === 'ArrowLeft') n = (i + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = TABS.length - 1;
    if (n !== null) { e.preventDefault(); showTab(TABS[n]); $('#t-' + TABS[n]).focus(); }
  });

  /* forms */
  $('#dateInput').addEventListener('change', e => { if (e.target.value) setSel(e.target.value); else renderDateBar(); });
  $('#actDate').addEventListener('change', e => { e.target.dataset.touched = '1'; });
  $('#waterForm').addEventListener('submit', e => {
    e.preventDefault();
    const raw = $('#waterMl').value.trim();
    const err = raw === '' ? 'Enter an amount in millilitres.' : addWater(raw);
    setErr('#waterErr', err);
    if (!err) { $('#waterMl').value = ''; $('#waterMl').focus(); }
  });
  $('#sleepForm').addEventListener('submit', e => {
    e.preventDefault();
    const err = addSleep($('#bed').value, $('#wake').value);
    setErr('#sleepErr', err);
  });
  ['#bed', '#wake'].forEach(s => $(s).addEventListener('input', updateSleepPreview));
  $('#actForm').addEventListener('submit', e => {
    e.preventDefault();
    const err = addActivity({ type: $('#actType').value, minutes: $('#actMin').value, date: $('#actDate').value, notes: $('#actNote').value });
    setErr('#actErr', err);
    if (!err) { $('#actMin').value = ''; $('#actNote').value = ''; $('#actMin').focus(); }
  });
  $('#moodForm').addEventListener('submit', e => {
    e.preventDefault();
    const picked = $('input[name="mood"]:checked');
    const err = saveMood(picked ? picked.value : '', $('#moodNote').value);
    setErr('#moodErr', err);
    if (!err) { $('#moodNote').value = ''; if (picked) picked.checked = false; }
  });
  $('#contactsForm').addEventListener('submit', saveContacts);
  $('#settingsForm').addEventListener('submit', saveSettings);
  ['#rangeSel', '#rFrom', '#rTo'].forEach(s => $(s).addEventListener('change', () => { renderProgress(); renderCharts(); }));
  bEl.start.addEventListener('click', breathStart);
  bEl.pause.addEventListener('click', breathPause);
  $('#breathReset').addEventListener('click', breathReset);

  /* ----- onboarding ----- */
  let obCur = 1;
  function obStep(n) {
    obCur = Math.max(1, Math.min(3, n));
    $$('.ob-step').forEach(s => { s.hidden = Number(s.dataset.step) !== obCur; });
    const h = $(`.ob-step[data-step="${obCur}"] h1, .ob-step[data-step="${obCur}"] h2`);
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
  function showOnboarding() {
    $('#onboarding').hidden = false; $('#app').hidden = true;
    $('#obForm').reset(); obStep(1);
  }
  function finishOnboarding(withChoices) {
    prefs.onboarded = true;
    let wantsReminder = false;
    if (withChoices) {
      const fd = new FormData($('#obForm'));
      prefs.goals = fd.getAll('goal').filter(g => GOALS.some(x => x.id === g));
      prefs.name = String(fd.get('name') || '').trim().slice(0, 30);
      if (fd.get('remWater')) { prefs.reminders.water.on = true; wantsReminder = true; lastWater = Date.now(); }
      if (fd.get('remBed')) { prefs.reminders.bed.on = true; wantsReminder = true; }
    }
    savePrefs(); fillSettings(); fillContacts();
    startApp();
    if (wantsReminder) reminderFeedback();
    else toast(withChoices ? 'You’re all set.' : 'Welcome! You’re using HealthMate without an account.');
  }
  $('#obForm').addEventListener('submit', e => { e.preventDefault(); finishOnboarding(true); });

  /* ============ 12. BOOT ============ */
  function initMoodChoices() {
    $('#moodChoices').innerHTML = MOODS.map(m => `<label class="mood"><input type="radio" name="mood" value="${m.id}"><span><b aria-hidden="true">${m.emoji}</b><small>${m.label}</small></span></label>`).join('');
  }
  function startApp() {
    $('#onboarding').hidden = true; $('#app').hidden = false;
    const v = location.hash.slice(1);
    showTab('water');
    showView(VIEWS.includes(v) ? v : 'home', false);
    history.replaceState(null, '', '#' + view);
  }

  applyTheme(); initMoodChoices(); fillSettings(); fillContacts(); breathReset();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); renderCharts(); });
  setInterval(checkReminders, 30000);
  if (prefs.onboarded) startApp(); else showOnboarding();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('service-worker.js').catch(() => { /* offline mode is optional */ });
  }

  // Tiny hook so the test page / console can inspect state (read-only copies).
  window.HealthMateDebug = { go: v => showView(v), refresh: () => renderHome(), view: () => view, toast, records: () => JSON.parse(JSON.stringify(records)), prefs: () => JSON.parse(JSON.stringify(prefs)) };
})();
