/* HealthMate AI — pure logic (no DOM). Attaches to HM.ai.
   1. summarize()   builds a small summary of the user's own logged data (this is all a remote AI would ever see)
   2. emergency()   detects messages that need emergency services, BEFORE any AI is called
   3. demoReply()   a local, rule-based "demo" assistant. It is NOT a live AI model and says so. */
(function (root) {
  'use strict';
  const HM = root.HM || require('./core.js');

  const ACTIONS = [
    { id: 'analyze', label: 'Analyze My Health', prompt: 'Analyze my health from my logged data.' },
    { id: 'sleep', label: 'Improve My Sleep', prompt: 'How can I improve my sleep?' },
    { id: 'workout', label: 'Create a Workout Plan', prompt: 'Create a beginner workout plan for me.' },
    { id: 'water', label: 'Hydration Advice', prompt: 'Give me hydration advice.' },
    { id: 'stress', label: 'Reduce Stress', prompt: 'Help me reduce stress.' },
    { id: 'week', label: 'Summarize My Week', prompt: 'Summarize my week.' }
  ];

  const EMERGENCY = [
    /chest pain|pain in (my )?chest|crushing chest/i,
    /can'?t breathe|cannot breathe|struggling to breathe|trouble breathing|short(ness)? of breath/i,
    /stroke|face (is )?droop|slurred speech|sudden weakness/i,
    /unconscious|passed out|not responding|seizure|convulsion/i,
    /severe bleeding|bleeding (a lot|heavily|won'?t stop)|coughing up blood/i,
    /overdose|took too many (pills|tablets)|poison(ed|ing)?/i,
    /suicid|kill myself|end my life|want to die|hurt myself|self[- ]harm/i,
    /anaphyla|throat (is )?(closing|swelling)|severe allergic/i
  ];
  const emergency = text => EMERGENCY.some(rx => rx.test(String(text || '')));
  const selfHarmWords = text => /suicid|kill myself|end my life|want to die|hurt myself|self[- ]harm/i.test(String(text || ''));

  /** Summary of the last `days` days. Days with no entries are skipped, never counted as zero. */
  function summarize(records, prefs, todayKey, days = 7) {
    const keys = HM.rangeKeys(HM.addDays(todayKey, -(days - 1)), todayKey);
    const per = keys.map(k => {
      const d = records[k];
      if (!d) return { k, has: false };
      const water = d.waterEntries.reduce((a, e) => a + e.ml, 0);
      const sleep = d.sleepEntries.reduce((a, e) => a + e.minutes, 0);
      const act = d.activityEntries.reduce((a, e) => a + e.minutes, 0);
      return {
        k, has: true,
        water: d.waterEntries.length ? water : null,
        sleep: d.sleepEntries.length ? sleep : null,
        act: d.activityEntries.length ? act : null,
        mood: d.moodEntries.length ? d.moodEntries[d.moodEntries.length - 1].mood : null
      };
    });
    const daysLogged = per.filter(p => p.has).length;
    const col = f => per.map(p => (p.has ? p[f] : null));
    const sleepAvgMin = HM.avg(col('sleep'));
    const waterAvg = HM.avg(col('water'));
    const actAvg = HM.avg(col('act'));
    const activeDays = per.filter(p => p.act && p.act >= prefs.activityGoal).length;
    const moods = per.map(p => p.mood).filter(Boolean);
    const lowMoods = moods.filter(m => m === 'low' || m === 'struggling').length;
    return {
      days, daysLogged,
      sleepAvgMin: sleepAvgMin === null ? null : Math.round(sleepAvgMin),
      sleepDays: col('sleep').filter(x => x !== null).length,
      waterAvg: waterAvg === null ? null : Math.round(waterAvg),
      waterDays: col('water').filter(x => x !== null).length,
      actAvg: actAvg === null ? null : Math.round(actAvg),
      actDays: col('act').filter(x => x !== null).length,
      activeDays, moodCount: moods.length, lowMoods,
      goals: { water: prefs.waterGoal, sleep: prefs.sleepGoal, activity: prefs.activityGoal }
    };
  }

  const DISCLAIMER = 'General wellness information, not medical advice. If something worries you, talk to a doctor or another trusted adult.';

  function emergencyReply(text) {
    const harm = selfHarmWords(text);
    return {
      kind: 'emergency',
      text: (harm
        ? 'I’m really sorry you’re feeling this way. You deserve support right now, and I’m not able to give that on my own. Please tell a trusted adult near you, or contact a crisis line or emergency service straight away.\n\n'
        : 'What you describe could be serious, and I can’t assess it. Please get urgent help now rather than waiting for an app.\n\n')
        + 'Call your local emergency number or go to the nearest hospital. In Sri Lanka, the ambulance service is 1990 and the National Mental Health Helpline is 1333 (numbers can change, so check them with your school). If you are somewhere else, use your local emergency number.'
    };
  }

  const need = (s, f) => s[f] === null;

  function demoReply(intent, s, text) {
    if (emergency(text)) return emergencyReply(text);
    const g = s.goals;
    const L = [];
    const noData = s.daysLogged === 0;
    const sleepLine = need(s, 'sleepAvgMin') ? null
      : `Sleep: about ${HM.fmtDur(s.sleepAvgMin)} on the ${s.sleepDays} day${s.sleepDays === 1 ? '' : 's'} you logged it (your goal is ${g.sleep} h).`;
    const waterLine = need(s, 'waterAvg') ? null
      : `Water: about ${s.waterAvg} ml on the ${s.waterDays} day${s.waterDays === 1 ? '' : 's'} you logged it (goal ${g.water} ml).`;
    const actLine = need(s, 'actAvg') ? null
      : `Activity: about ${s.actAvg} min on the ${s.actDays} day${s.actDays === 1 ? '' : 's'} you logged it (goal ${g.activity} min).`;

    switch (intent) {
      case 'analyze':
      case 'week': {
        if (noData) return { kind: 'text', text: 'I can’t analyse anything yet because nothing is logged for the last 7 days. Log some water, sleep or activity and ask me again. I only use what you enter, and I won’t guess the rest.' };
        L.push(intent === 'week' ? `Here is your last ${s.days} days. You logged something on ${s.daysLogged} of them.` : `Here is what your last ${s.days} days of entries show.`);
        [sleepLine, waterLine, actLine].forEach(x => x && L.push('• ' + x));
        if (s.moodCount) L.push(`• Mood: ${s.moodCount} check-in${s.moodCount === 1 ? '' : 's'}${s.lowMoods ? `, ${s.lowMoods} of them low` : ''}.`);
        const missing = [need(s, 'sleepAvgMin') && 'sleep', need(s, 'waterAvg') && 'water', need(s, 'actAvg') && 'activity'].filter(Boolean);
        if (missing.length) L.push(`Nothing logged for ${missing.join(', ')}, so I can’t say anything about it.`);
        const tips = [];
        if (!need(s, 'sleepAvgMin') && s.sleepAvgMin < g.sleep * 60 - 30) tips.push('Sleep is a little under your goal. Try moving bedtime 15 minutes earlier this week.');
        if (!need(s, 'waterAvg') && s.waterAvg < g.water * 0.8) tips.push('Water is under your goal. A glass with each meal is an easy start.');
        if (!need(s, 'actAvg') && s.actAvg < g.activity * 0.6) tips.push('Activity is well under your goal. A 10-minute walk after lunch counts.');
        if (s.lowMoods >= 2) tips.push('You noted low moods more than once. Consider talking to someone you trust, such as a parent, teacher or counsellor.');
        if (!tips.length && !missing.length) tips.push('You are close to your own targets. Keep the routine going.');
        if (tips.length) L.push('\nOne small step at a time:\n' + tips.map(x => '• ' + x).join('\n'));
        L.push('\nThese are averages of your own manual entries, not measurements from a device.');
        break;
      }
      case 'sleep':
        L.push('Some general sleep habits that help many people:');
        L.push('• Keep a regular bedtime and wake time, even on weekends.\n• Put screens away 30–60 minutes before bed.\n• Keep the room cool, dark and quiet.\n• Limit caffeine, especially in the afternoon.\n• Get daylight in the morning.');
        L.push(sleepLine ? '\n' + sleepLine : '\nI don’t have sleep entries yet, so I can’t comment on your own pattern. Log a few nights first.');
        L.push('\nIf you often sleep badly for weeks, or feel very tired in the day, please talk to a doctor.');
        break;
      case 'workout':
        L.push('A gentle 3-day starter plan (about 20–30 minutes each). Adjust it to how you feel and check with a parent, teacher or doctor first if you have any health condition:');
        L.push('• Day 1: brisk walk, 20–30 min.\n• Day 2: bodyweight circuit: 10 squats, 8 knee push-ups, 20 s plank, 10 lunges. Repeat 2–3 rounds.\n• Day 3: easy jog/walk intervals or cycling, 20 min.\n• Rest or stretch on the other days.');
        L.push(actLine ? '\n' + actLine : '\nLog a few activities and I can tailor this to what you already do.');
        L.push('\nStop and rest if you feel dizzy, sharp pain or unusually breathless.');
        break;
      case 'water':
        L.push('Hydration basics: needs vary with weather, activity and body size, so treat your goal as a starting point.');
        L.push('• Drink a glass when you wake up and with each meal.\n• Keep a bottle where you study.\n• Drink more when it is hot or when you exercise.\n• Pale yellow urine is a rough sign you are doing fine.');
        L.push(waterLine ? '\n' + waterLine : '\nI have no water entries yet. Tap +250 ml on Home when you drink and I’ll use that.');
        break;
      case 'stress':
        L.push('Some quick ways to ease stress:');
        L.push('• Slow breathing: in for 4 seconds, out for 6, for one minute (the Breathing exercise in MindCare guides you).\n• Take a short walk or stretch.\n• Break study into 25-minute blocks with 5-minute breaks.\n• Write down what is worrying you, then pick one small next step.\n• Talk to someone you trust.');
        if (s.lowMoods >= 2) L.push('\nYou have logged low moods more than once recently. That is worth sharing with a parent, teacher or counsellor.');
        L.push('\nIf stress feels too heavy to cope with, please reach out to a counsellor or doctor.');
        break;
      default:
        return demoFree(text, s);
    }
    L.push('\n' + DISCLAIMER);
    return { kind: 'text', text: L.join('\n') };
  }

  /** Free-text fallback for demo mode: route by keyword or admit the limit. */
  function demoFree(text, s) {
    const t = String(text || '').toLowerCase();
    const map = [['sleep|tired|insomnia|bed', 'sleep'], ['water|hydrat|thirst', 'water'], ['workout|exercise|gym|run|fitness', 'workout'],
      ['stress|anxious|worried|exam|calm|overwhelm', 'stress'], ['week|summary|summar', 'week'], ['analy|health|how am i', 'analyze']];
    for (const [rx, id] of map) if (new RegExp(rx).test(t)) return demoReply(id, s, '');
    return { kind: 'text', text: 'I’m a demo assistant without a live AI model, so I can only help with the six topics on the buttons above (health check, sleep, workouts, water, stress, weekly summary). Connect a backend in Profile to get open-ended answers.\n\n' + DISCLAIMER };
  }

  /** What is sent to a remote AI backend: a small summary only, never raw notes or mood text. */
  function payload(history, summary, name) {
    return {
      messages: history.filter(m => (m.role === 'user' || m.role === 'assistant') && m.kind !== 'error').slice(-12).map(m => ({ role: m.role, content: String(m.text).slice(0, 2000) })),
      summary,
      firstName: name ? String(name).slice(0, 30) : ''
    };
  }


  /* ---------- Watch helpers (pure) ---------- */
  /** Parse a Bluetooth "Heart Rate Measurement" characteristic value (array/Uint8Array). Returns bpm or null when the sensor has no valid reading. */
  function parseHeartRate(bytes) {
    if (!bytes || bytes.length < 2) return null;
    const flags = bytes[0];
    const wide = (flags & 0x01) === 1;
    if (wide && bytes.length < 3) return null;
    const contactSupported = (flags & 0x04) !== 0, contact = (flags & 0x02) !== 0;
    if (contactSupported && !contact) return null;
    const bpm = wide ? bytes[1] | (bytes[2] << 8) : bytes[1];
    return bpm >= 25 && bpm <= 240 ? bpm : null;
  }

  /** Average/min/max of a list of bpm numbers. Null if empty. */
  function hrStats(list) {
    const v = list.filter(x => typeof x === 'number' && isFinite(x));
    if (!v.length) return null;
    return { min: Math.min(...v), max: Math.max(...v), avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), n: v.length };
  }

  /** How each watch family is normally connected. Typical, not a promise: models differ, so the app tells users to verify. */
  const BRANDS = [
    { id: 'apple', name: 'Apple Watch', maker: 'Apple', method: 'Apple HealthKit', native: true,
      note: 'Health data is shared through HealthKit, which only a native iOS app can read. A web app or PWA cannot connect to an Apple Watch.' },
    { id: 'samsung', name: 'Galaxy Watch', maker: 'Samsung', method: 'Health Connect (Android)', native: true,
      note: 'Usually reached through Samsung Health syncing to Android Health Connect, read by a native Android app. Check your Samsung Health settings.' },
    { id: 'wearos', name: 'Pixel Watch / Wear OS', maker: 'Google and partners', method: 'Health Connect (Android)', native: true,
      note: 'Read through Android Health Connect by a native Android app, with the user’s permission.' },
    { id: 'garmin', name: 'Garmin', maker: 'Garmin', method: 'Garmin developer APIs, or heart-rate broadcast', native: true,
      note: 'Garmin’s official APIs need a developer application. Many models can also broadcast live heart rate over Bluetooth, which this web app can read in a supported browser.' },
    { id: 'fitbit', name: 'Fitbit', maker: 'Google / Fitbit', method: 'Official Fitbit / Google health API', native: true,
      note: 'Use the manufacturer’s official API and check Google’s current developer documentation, because the platform is changing.' },
    { id: 'polar', name: 'Polar', maker: 'Polar', method: 'Standard Bluetooth heart rate, or Polar’s SDK', native: false,
      note: 'Polar devices commonly support the standard Bluetooth heart-rate profile, so live heart rate may work here in a supported browser.' },
    { id: 'huawei', name: 'Huawei / Honor', maker: 'Huawei', method: 'Huawei Health Kit (developer account)', native: true,
      note: 'Needs a Huawei developer account and a native app. Some models may offer heart-rate broadcast; check the watch settings.' },
    { id: 'zepp', name: 'Amazfit / Xiaomi', maker: 'Zepp Health / Xiaomi', method: 'Health Connect sync or heart-rate broadcast, if the model offers it', native: true,
      note: 'Support varies by model. Check whether your companion app syncs to Health Connect or the watch can broadcast heart rate.' },
    { id: 'other', name: 'Other / not sure', maker: 'Unknown', method: 'Standard Bluetooth heart-rate profile, if the watch can broadcast it', native: false,
      note: 'Look for “broadcast heart rate” or “heart rate sharing” in the watch settings. If it is not there, this web app cannot connect to it.' }
  ];

  const api = { BRANDS, parseHeartRate, hrStats, ACTIONS, emergency, summarize, demoReply, emergencyReply, payload, DISCLAIMER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HM = root.HM || HM; root.HM.ai = api;
})(typeof window !== 'undefined' ? window : globalThis);
