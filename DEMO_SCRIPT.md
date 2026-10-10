# VayuGuard — Demo Video Script (Scene-by-Scene)

**Hard limit: 3:00 total.** Scene times are budgets, not exact cuts — leave a little air between scenes when you edit. Voiceover word counts assume ~150 words/minute (ElevenLabs' natural default pace); adjust the ElevenLabs speed slider if your generated clip runs long or short against the screen recording.

Generate each scene's voiceover as its own separate ElevenLabs clip (not one giant block) — it's much easier to resync one 20-second clip against its screen recording than to chop one 3-minute audio file into eight pieces.

---

## Scene 1 — The Problem (0:00–0:18, ~18s, 45 words)

**Screen:** Open on a static image or short clip of Delhi smog (a news photo works fine), then cut/transition to a plain screenshot of a generic AQI app showing just a bare number — something like "AQI: 380" with no other context. Hold each for about 2–3 seconds.

**Voiceover:**
> "Every winter, North Indian schools face this: an AQI number. Three hundred eighty. Nobody tells the principal what that means for today's schedule — so kids end up outside anyway, before anyone decides."

---

## Scene 2 — The Live Dashboard (0:18–0:40, ~22s, 55 words)

**Screen:** Cut to your Amplify-hosted dashboard, already loaded (`main.d3d19bldh9dql2.amplifyapp.com`). Let the page sit for a beat so the viewer sees the real station name and AQI number render. Then move your cursor to point directly at the green **"● LIVE"** badge near the top of the AQI card. Hold on it for 2 seconds.

**Voiceover:**
> "This is VayuGuard, running live right now. Not a mockup — this reading just came from a real government air quality station, fetched moments ago. That LIVE badge matters: if the feed ever goes stale, it tells you honestly, instead of guessing."

---

## Scene 3 — Triggering a Hazard (0:40–1:10, ~30s, 75 words)

**Screen:** Click the **"Severe Winter Thermal Inversion"** preset scenario button. Show the AQI number jumping upward in real time. Then scroll/pan to the schedule view and show the venue changes — outdoor periods (assembly, recess, PE) flipping to indoor venues. Point the cursor at the **"⚡ SIMULATED"** badge that appears once the spike is active.

**Voiceover:**
> "Let's simulate a smog spike — clearly labeled simulated, never passed off as a real reading. Watch the schedule: morning assembly, recess, and PE all move indoors automatically. Not just a generic 'air is bad' warning — the system knows exactly which activities are too risky at this exertion level, and which ones are still fine."

---

## Scene 4 — The Real Alert (1:10–1:30, ~20s, 50 words)

**Screen:** Cut to your phone or your email inbox, showing the actual SNS notification that arrived from the scenario you just triggered. Zoom in on the subject line and message body so it's readable.

**Voiceover:**
> "That re-optimization isn't just a UI change — it fired a real alert through Amazon SNS, the same moment it happened. This is what a school admin, or a parent, would actually receive on their phone."

---

## Scene 5 — Proof It's on AWS (1:30–1:55, ~25s, 62 words)

**Screen:** Switch to the AWS Console. Show, in order: the CloudFormation stack page for `vayuguard` (status should read `UPDATE_COMPLETE`), then the Lambda functions list filtered to "vayuguard," then the DynamoDB table `VayuGuardTelemetry` with real items open in the item explorer.

**Voiceover:**
> "Here's where it actually runs. AWS Lambda behind API Gateway serves this entire backend. DynamoDB stores every real reading, like these. And a scheduled EventBridge rule ingests fresh air quality data every fifteen minutes, even when nobody's watching the dashboard at all."

---

## Scene 6 — Measurable Impact (1:55–2:20, ~25s, 62 words)

**Screen:** Cut back to the dashboard's optimization summary card from the Scene 3 hazard trigger — the one showing modifications count, total avoided outdoor minutes, and the student-hours-protected figure. Point the cursor at each number as you mention it.

**Voiceover:**
> "This isn't just a schedule swap — it's a measured outcome. Four periods re-sequenced, saving over a hundred minutes of outdoor exposure, protecting well over a thousand student-hours from hazardous air, all computed from the real ventilation and exertion data behind each activity — not a guess."

---

## Scene 7 — The Differentiator (2:20–2:45, ~25s, 62 words)

**Screen:** Scroll to the README's "Honest Fallbacks" section on GitHub (or screen-record it locally), showing the table of LIVE / CACHED / SIMULATED states. Alternatively, quickly flash all three badges side by side if you have separate clips of each.

**Voiceover:**
> "That's the core design decision behind VayuGuard: every fallback is visible, never silent. If the AI, the live feed, or anything else isn't working, the system says so — because an air-safety tool that lies about its own confidence is worse than one that's simply honest."

---

## Scene 8 — Close (2:45–3:00, ~15s, 38 words)

**Screen:** Final shot of the dashboard's summary card (modifications count, student-hours figure), then fade to a simple title card: project name, tagline, and the GitHub repo URL.

**Voiceover:**
> "VayuGuard: turning a number nobody acts on into a decision somebody actually makes — built, deployed, and running on AWS. Thank you."

---

## Before You Record / Generate

- **Rehearse the Scene 3 trigger once off-camera** — confirm the SNS email actually lands within a few seconds, so Scene 4's screenshot is ready to go rather than you waiting live on camera.
- **Pre-load and pre-scroll every screen** named above before you start recording video — the Console pages especially, so there's no fumbling/searching on screen.
- **Say numbers exactly as the UI shows them** when you narrate live, or when checking the AI-generated voiceover against the screen — if the AQI reads 71, the voiceover shouldn't say "around 70."
- **Total check:** 18 + 22 + 30 + 20 + 25 + 25 + 25 + 15 = 180 seconds = exactly 3:00. Trim Scene 5 or 7 by a few seconds each if your edit runs long — those have the most slack.
