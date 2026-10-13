/* HealthMate core helpers — pure functions with no DOM access, so they can be tested easily. */
(function (root) {
  'use strict';

  const pad = n => String(n).padStart(2, '0');
  const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = k => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d); };
  const validKey = k => /^\d{4}-\d{2}-\d{2}$/.test(k) && dkey(parseKey(k)) === k;
  const today = () => dkey(new Date());
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };

  /** Every date key from `from` to `to` (inclusive). Returns [] for invalid input. */
  function rangeKeys(from, to, cap = 92) {
    if (!validKey(from) || !validKey(to) || from > to) return [];
    const out = [];
    let k = from;
    while (k <= to && out.length < cap) { out.push(k); k = addDays(k, 1); }
    return out;
  }

  /** Escape text before putting it into innerHTML. */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const uid = () => (root.crypto && root.crypto.randomUUID)
    ? root.crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  /** "HH:MM" -> minutes after midnight, or null if invalid. */
  function timeToMin(t) {
    const m = /^(\d{2}):(\d{2})$/.exec(t || '');
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    return h > 23 || mi > 59 ? null : h * 60 + mi;
  }

  /** Sleep length in minutes. Handles sleep that crosses midnight (23:00 -> 06:30). Null if invalid or identical times. */
  function sleepMinutes(bed, wake) {
    const b = timeToMin(bed), w = timeToMin(wake);
    if (b === null || w === null || b === w) return null;
    return (w - b + 1440) % 1440;
  }
  const crossesMidnight = (bed, wake) => {
    const b = timeToMin(bed), w = timeToMin(wake);
    return b !== null && w !== null && w < b;
  };

  function fmtDur(min) {
    if (min == null || !isFinite(min)) return '–';
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h ? `${h} h${m ? ' ' + m + ' min' : ''}` : `${m} min`;
  }

  /** Average of the real numbers in a list (null and NaN are ignored). Null if nothing to average. */
  function avg(list) {
    const v = list.filter(x => typeof x === 'number' && isFinite(x));
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  }

  const pct = (v, goal) => goal > 0 ? Math.max(0, Math.min(100, Math.round(v / goal * 100))) : 0;

  /** Current and longest run of consecutive days in a Set of date keys. A streak stays alive until the end of today. */
  function streaks(activeKeys, todayKey) {
    let current = 0;
    let k = activeKeys.has(todayKey) ? todayKey : addDays(todayKey, -1);
    while (activeKeys.has(k)) { current++; k = addDays(k, -1); }
    let longest = 0, run = 0, prev = null;
    for (const key of [...activeKeys].sort()) {
      run = prev && addDays(prev, 1) === key ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = key;
    }
    return { current, longest };
  }

  /** CSV-safe cell (quotes values, and defuses spreadsheet formulas that start with = + - @). */
  function csvCell(v) {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /** All records as one flat CSV table. */
  function toCSV(records) {
    const rows = [['date', 'category', 'value', 'unit', 'details', 'id', 'created_at']];
    const iso = t => (typeof t === 'number' ? new Date(t).toISOString() : '');
    for (const k of Object.keys(records).sort()) {
      const d = records[k];
      d.waterEntries.forEach(e => rows.push([k, 'water', e.ml, 'ml', '', e.id, iso(e.createdAt)]));
      d.sleepEntries.forEach(e => rows.push([k, 'sleep', e.minutes, 'minutes', `${e.bedtime} to ${e.wake}; source: ${e.source || 'manual'}`, e.id, iso(e.createdAt)]));
      d.activityEntries.forEach(e => rows.push([k, 'activity', e.minutes, 'minutes', `${e.type}${e.notes ? '; ' + e.notes : ''}`, e.id, iso(e.createdAt)]));
      d.moodEntries.forEach(e => rows.push([k, 'mood', e.mood, '', e.note || '', e.id, iso(e.createdAt)]));
      d.habitsCompleted.forEach(h => rows.push([k, 'habit', h, '', 'completed', '', '']));
      if (d.fruitVeg) rows.push([k, 'fruit_veg', d.fruitVeg, 'servings', '', '', '']);
    }
    return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  }

  const api = { pad, dkey, parseKey, validKey, today, addDays, rangeKeys, esc, uid, timeToMin, sleepMinutes, crossesMidnight, fmtDur, avg, pct, streaks, csvCell, toCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HM = api;
})(typeof window !== 'undefined' ? window : globalThis);
