# HealthMate — Your Daily Companion for a Healthier Life

A student wellness app for **UN SDG 3: Good Health and Well-Being**. Built with plain HTML, CSS and JavaScript, no build step. Data is saved in the browser's LocalStorage.

## Run it

Service workers and the install prompt need `http://` or `https://`, so use a tiny local server rather than double-clicking the file:

```bash
cd healthmate
python3 -m http.server 8000      # or: npx serve
```

Open <http://localhost:8000>. To preview the 393 × 852 phone size, open DevTools → device toolbar → iPhone 16 (or set a custom 393 × 852 size). Widths of 900 px and above switch to a sidebar layout.

`index.html` also opens directly from disk. Everything works except offline caching and installing.

**Internet is needed once** to fetch Chart.js and the Inter/Poppins fonts from CDNs. After that the service worker caches them. If Chart.js is unavailable, charts show a clear message and the rest of the app keeps working.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | All screens, dialogs and the SVG icon set |
| `style.css` | Design tokens, light/dark themes, responsive layout |
| `core.js` | Pure helper functions (dates, sleep maths, streaks, CSV). No DOM, so they're easy to test |
| `ai.js` | Pure logic for HealthMate AI (data summary, emergency detection, demo replies) and watch helpers (heart-rate parsing, brand list) |
| `extras.js` | AI Assistant view, My Watch view (Web Bluetooth + demo mode) and the Home cards |
| `backend/ai-proxy/` | Optional server that keeps the AI API key secret (Supabase Edge Function) |
| `docs/` | `backend-setup.md`, `smartwatch-setup.md` |
| `script.js` | App logic: storage, trackers, rendering, charts, reminders, settings |
| `manifest.json`, `service-worker.js`, `icon*.png/svg` | Installable PWA + offline support |
| `tests.js`, `tests.html` | Unit tests for `core.js` |

## What's implemented

- **Five tabs:** Home, AI Assistant, Habits, My Watch, Profile. MindCare and Progress are on Home and in the desktop sidebar. Dark mode is the default for new users.
- **HealthMate AI:** chat with typing indicator, six quick actions, saved history, New conversation, past conversations, "Show earlier messages". **Demo mode** uses simple built-in rules on your own logs and is labelled "not a live AI". An optional backend (see `docs/backend-setup.md`) gives real AI replies, labelled "AI-generated". Emergency wording is caught first and shows 1990 / 1333 (Sri Lanka, to be checked locally). Wellness guidance only, no diagnosis.
- **My Watch:** brand/model picker with how each family connects, permissions with explanations, Connect / Sync now / Disconnect / Reconnect, battery and last-sync time, live heart rate over Web Bluetooth for watches that share it, daily heart-rate trends, troubleshooting, and a labelled **demo mode**. Steps, distance, calories, sleep stages, SpO₂ and stress show "Not supported" because a browser cannot read them (see `docs/smartwatch-setup.md`).

- **Onboarding:** logo, tagline, goal picker, optional name and reminders, privacy notice, "continue without an account".
- **Home:** greeting and date, rings for water, sleep and activity, habit checklist, mood shortcut, weekly preview, quick actions, reminder status, empty state for new users.
- **Habits tabs:**
  - **Water:** quick-add and custom ml, edit/delete with Undo, adjustable goal, daily and weekly summary, optional reminder.
  - **Sleep:** bedtime and wake time with automatic duration, midnight crossing, duplicate check, weekly chart, routine tips, optional bedtime reminder. Entries are labelled "Entered manually".
  - **Activity:** five activity types, minutes, date, notes, adjustable goal, weekly chart, badges, history with edit/delete.
  - **Food:** balanced plate, Sri Lankan meal and snack ideas, food groups, fruit and veg counter, habit checklist.
- **MindCare:** mood check-in with optional private note, history with delete, breathing exercise (Start / Pause / Resume / Reset), relaxation, exam-stress and study-break tips, editable trusted-adult and counsellor contacts.
- **Progress:** 7 / 14 / 30 days or custom dates, Chart.js charts for water, sleep and activity, habit completion, comparison with your own previous period, streaks, weekly summary, 10 badges.
- **Profile:** name, goals, targets, theme (system/light/dark), reminders, notification permission status, privacy information, JSON and CSV export, record-by-record deletion, "Clear all data" with confirmation.

### How the numbers are calculated

- Everything is computed from stored records. Days with no entries show as gaps (not zeros) and are left out of averages.
- Sleep is saved on the day you **woke up**. Duration = (wake − bedtime) mod 24 h, so 23:30 → 06:15 is 6 h 45 min. Identical times and durations over 16 h are rejected.
- The weekly preview counts four daily goals: water ≥ goal, sleep ≥ goal, activity ≥ goal, and at least 75% of habits ticked.
- A streak is consecutive days with at least one entry. Today keeps the streak alive until midnight.
- Default targets (1500 ml water, 8 h sleep, 60 min activity, 5 fruit/veg servings) are only starting points. Every one is editable.

### Data model

```jsonc
// localStorage "healthmate.records.v1": records keyed by date
{ "2026-10-12": {
    "date": "2026-10-12",
    "waterEntries":    [{ "id": "…", "ml": 250, "createdAt": 1760000000000 }],
    "sleepEntries":    [{ "id": "…", "bedtime": "23:30", "wake": "06:15", "minutes": 405, "crossedMidnight": true, "source": "manual", "createdAt": 0 }],
    "activityEntries": [{ "id": "…", "type": "walking", "minutes": 30, "notes": "", "createdAt": 0 }],
    "habitsCompleted": ["breakfast"],
    "moodEntries":     [{ "id": "…", "mood": "good", "note": "", "createdAt": 0 }],
    "fruitVeg": 2 } }
// localStorage "healthmate.prefs.v1": name, goals, targets, theme, reminders, contacts
```

Stored data is validated when loaded, and invalid entries are dropped. All user text is HTML-escaped before it is displayed. CSV export neutralises spreadsheet formulas.

## Testing

```bash
node tests.js        # 47 unit tests: sleep maths, ranges, streaks, CSV, escaping, emergency detection, heart-rate parsing, AI summaries
```

The tests also run in a browser at `tests.html`. In development I additionally ran a scripted browser walkthrough (headless Chromium at 393 × 852 and 1280 × 800). It covered onboarding, every navigation item, water add/edit/delete, input validation, sleep across midnight and duplicate blocking, activity logging and duplicate blocking, fruit/veg and habit percentages, mood save and support card, breathing start/pause/reset, invalid date ranges, persistence after reload, settings validation, theme change, the record manager, "Clear all data", and the desktop layout. No console errors.

**Also tested for the new features** (headless Chromium, 393 × 852 and 1280 × 800, no console errors): quick actions, emergency reply, new conversation, backend address validation, watch connect/disconnect/demo using a **simulated** Bluetooth device, reload (never auto-connects), no horizontal overflow.

**Not covered by my automated run:** a real smartwatch, a real AI backend, Chart.js rendering (my test environment had no internet, so I only tested the fallback message), real browser notifications, PWA install and offline caching, and screen-reader testing. Please check these yourself before presenting:

1. Open the app online, go to Progress and Habits → Sleep/Activity, and confirm charts draw.
2. Reload with DevTools → Network → Offline and confirm the app still opens.
3. Tab through a screen with the keyboard and check the focus ring is always visible.

## Privacy and limitations

- Records are saved **only in this browser**. LocalStorage is **not encrypted**, and clearing browser data deletes it. Do not use a shared computer for private mood notes.
- There is no account, server or tracking. Nothing is uploaded.
- Sleep, activity and water are **manual entries**. The app does not read any sensor, count steps or measure heart rate.
- **Reminders only work while the app is open.** Reliable background notifications need a push server, which this version does not have. If notifications are blocked or unsupported, reminders appear inside the app and the app says so.
- MindCare is not therapy and does not diagnose. The helpline numbers shown for Sri Lanka (1333, 1990) should be checked against your school's information before use.
- Food and activity content is general education. Targets are adjustable and should be set with a parent, teacher or doctor.
- Cloud sync, accounts, and steps/sleep/SpO₂ from a watch are **not** implemented. They are not simulated either. Demo replies and demo watch numbers are always labelled as such.
- The AI backend and any real watch connection need extra setup (see `docs/`). A real model is only used after you add a backend and tick the consent box.
- This is a web app (PWA). The spec's React Native/Expo version with HealthKit and Health Connect is a separate native build.

## Optional: adding Firebase later

Not included. If you extend the project, keep it honest and safe:

1. Create a Firebase project, enable **Authentication** (email/password) and **Firestore**.
2. Add the web-app config to your code. These keys identify the project and are not secrets. Never put admin or service-account credentials in frontend code.
3. Store data under `users/{uid}/records/{date}` and lock it to the owner:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

4. Add sign-out, "delete my cloud data", and a consent screen before uploading anything. Keep LocalStorage as the offline fallback.
5. Check with your school before collecting data from under-18s in the cloud.
