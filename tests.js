/* Run with:  node tests.js   (or open tests.html in a browser) */
(function (root) {
  const HM = root.HM || require('./core.js');
  if (!HM.ai) { try { require('./ai.js'); } catch (e) { /* browser: ai.js is loaded by tests.html */ } }
  const AI = HM.ai;
  let pass = 0, fail = 0; const out = [];
  const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)})`}`); };

  eq('sleep 22:00 -> 06:30 = 510 min', HM.sleepMinutes('22:00', '06:30'), 510);
  eq('sleep crossing midnight 23:45 -> 00:15 = 30 min', HM.sleepMinutes('23:45', '00:15'), 30);
  eq('sleep same day 01:00 -> 07:00 = 360', HM.sleepMinutes('01:00', '07:00'), 360);
  eq('identical times are invalid', HM.sleepMinutes('08:00', '08:00'), null);
  eq('bad time is invalid', HM.sleepMinutes('25:00', '06:00'), null);
  eq('crossesMidnight true', HM.crossesMidnight('22:00', '06:00'), true);
  eq('crossesMidnight false', HM.crossesMidnight('01:00', '06:00'), false);
  eq('fmtDur 510', HM.fmtDur(510), '8 h 30 min');
  eq('fmtDur 480', HM.fmtDur(480), '8 h');
  eq('fmtDur 45', HM.fmtDur(45), '45 min');
  eq('avg ignores nulls', HM.avg([1000, null, 2000]), 1500);
  eq('avg of nothing is null (no invented data)', HM.avg([null, null]), null);
  eq('pct clamps at 100', HM.pct(3000, 1500), 100);
  eq('pct normal', HM.pct(750, 1500), 50);
  eq('pct with zero goal', HM.pct(5, 0), 0);
  eq('addDays across month end', HM.addDays('2026-10-31', 1), '2026-11-01');
  eq('addDays across year end', HM.addDays('2026-12-31', 1), '2027-01-01');
  eq('validKey rejects 2026-02-30', HM.validKey('2026-02-30'), false);
  eq('validKey accepts leap day', HM.validKey('2028-02-29'), true);
  eq('rangeKeys inclusive', HM.rangeKeys('2026-10-10', '2026-10-12'), ['2026-10-10', '2026-10-11', '2026-10-12']);
  eq('rangeKeys reversed is empty', HM.rangeKeys('2026-10-12', '2026-10-10'), []);
  eq('streak current (today logged)', HM.streaks(new Set(['2026-10-10', '2026-10-11', '2026-10-12']), '2026-10-12'), { current: 3, longest: 3 });
  eq('streak stays alive if only yesterday logged', HM.streaks(new Set(['2026-10-10', '2026-10-11']), '2026-10-12'), { current: 2, longest: 2 });
  eq('streak broken by a gap', HM.streaks(new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10']), '2026-10-12'), { current: 0, longest: 3 });
  eq('streak empty', HM.streaks(new Set(), '2026-10-12'), { current: 0, longest: 0 });
  eq('esc blocks HTML', HM.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  eq('csv defuses formulas', HM.csvCell('=SUM(A1)'), "'=SUM(A1)");
  eq('csv quotes commas and quotes', HM.csvCell('a,"b"'), '"a,""b"""');
  const rec = { '2026-10-12': { date: '2026-10-12', waterEntries: [{ id: 'a', ml: 250, createdAt: 0 }], sleepEntries: [], activityEntries: [{ id: 'b', type: 'walking', minutes: 30, notes: 'with dog', createdAt: 0 }], habitsCompleted: ['breakfast'], moodEntries: [], fruitVeg: 2 } };
  eq('csv row count (header + water + activity + habit + fruit_veg)', HM.toCSV(rec).split('\r\n').length, 5);

  // ---- AI assistant + watch helpers ----
  eq('emergency: chest pain', AI.emergency('I have chest pain and feel dizzy'), true);
  eq('emergency: self-harm wording', AI.emergency('I want to end my life'), true);
  eq('emergency: ordinary question is not flagged', AI.emergency('How much water should I drink?'), false);
  eq('emergency reply mentions 1990', /1990/.test(AI.emergencyReply('chest pain').text), true);
  eq('heart rate 8-bit', AI.parseHeartRate([0, 72]), 72);
  eq('heart rate 16-bit', AI.parseHeartRate([1, 150, 0]), 150);
  eq('heart rate: no skin contact is ignored', AI.parseHeartRate([4, 70]), null);
  eq('heart rate: implausible value is ignored', AI.parseHeartRate([0, 0]), null);
  eq('heart rate: truncated packet', AI.parseHeartRate([1, 80]), null);
  eq('hrStats ignores junk', AI.hrStats([60, null, 80, NaN]), { min: 60, max: 80, avg: 70, n: 2 });
  eq('hrStats of nothing is null', AI.hrStats([]), null);
  const prefs = { waterGoal: 1500, sleepGoal: 8, activityGoal: 60 };
  const none = AI.summarize({}, prefs, '2026-10-12', 7);
  eq('summary with no data has null averages', [none.daysLogged, none.sleepAvgMin, none.waterAvg, none.actAvg], [0, null, null, null]);
  eq('no-data reply admits it has nothing', /nothing is logged/.test(AI.demoReply('analyze', none, '').text), true);
  const rec2 = { '2026-10-11': { date: '2026-10-11', waterEntries: [{ id: 'a', ml: 1000, createdAt: 0 }], sleepEntries: [{ id: 's', bedtime: '23:00', wake: '06:00', minutes: 420, createdAt: 0 }], activityEntries: [], habitsCompleted: [], moodEntries: [{ id: 'm', mood: 'low', note: 'private', createdAt: 0 }], fruitVeg: 0 } };
  const sum = AI.summarize(rec2, prefs, '2026-10-12', 7);
  eq('summary averages only logged days', [sum.daysLogged, sum.sleepAvgMin, sum.waterAvg, sum.actAvg], [1, 420, 1000, null]);
  eq('summary never contains note text', JSON.stringify(sum).includes('private'), false);
  eq('reply does not invent activity data', /Activity:/.test(AI.demoReply('analyze', sum, '').text), false);
  eq('emergency text overrides quick action', AI.demoReply('sleep', sum, 'I cannot breathe').kind, 'emergency');
  eq('payload drops error bubbles', AI.payload([{ role: 'user', text: 'hi', kind: 'text' }, { role: 'assistant', text: 'oops', kind: 'error' }], sum, 'Sam').messages.length, 1);

  out.push(`\n${pass} passed, ${fail} failed`);
  if (typeof document !== 'undefined') { const pre = document.createElement('pre'); pre.textContent = out.join('\n'); document.body.appendChild(pre); }
  else { console.log(out.join('\n')); if (fail) process.exit(1); }
})(typeof window !== 'undefined' ? window : globalThis);
