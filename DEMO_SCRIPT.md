# VayuGuard — 3-Minute Demo Video Script

**Total runtime: 3:00 (hard limit per rules). Record in one take if possible; cut only at the marked breaks.**

| Time | Screen (what to show) | Voiceover (read this, word for word) |
|---|---|---|
| **0:00–0:20** | Split screen or quick cut: a news photo/clip of Delhi smog next to a generic AQI app showing just a number like "AQI 380." | *"Every winter, North Indian schools face this: an AQI number. Three hundred eighty. Nobody tells the principal what that means for today's schedule — so kids end up outside anyway, before anyone decides. That's the gap VayuGuard closes."* |
| **0:20–0:45** | Cut to the live dashboard at your Amplify URL (`main.d3d19bldh9dql2.amplifyapp.com`). Point at the station name, AQI number, and the **green "● LIVE"** badge. | *"This is VayuGuard, running live right now. Not a mockup — this reading just came from a real government air quality station, fetched a few seconds ago. That LIVE badge matters: if the feed ever goes stale, it tells you honestly instead of guessing."* |
| **0:45–1:15** | Trigger a scenario preset (the "Severe Winter Thermal Inversion" button). Show the AQI spike, then the schedule flip from outdoor to indoor venues, and the **"⚡ SIMULATED"** badge appearing. | *"Let's simulate a smog spike — clearly labeled simulated, never passed off as a real reading. Watch the schedule: morning assembly, recess, and PE all move indoors automatically, because the system knows exactly which activities are too risky at this exertion level, not just that the air is bad."* |
| **1:15–1:35** | Show the triggered alert — open your email/phone and show the real SNS notification that arrived. | *"That re-optimization isn't just a UI change — it fired a real alert through Amazon SNS, the same second it happened. This is what a school admin or a parent would actually receive."* |
| **1:35–2:00** | Switch to the AWS Console: show the CloudFormation stack `vayuguard` (status: UPDATE_COMPLETE), then the Lambda functions list, then the DynamoDB table with real items inside. | *"Here's where it actually runs: AWS Lambda behind API Gateway serves this entire backend, DynamoDB stores every real reading, and a scheduled EventBridge rule ingests fresh air quality data every fifteen minutes — even when nobody's watching."* |
| **2:00–2:25** | Cut back to the dashboard, show the Bedrock engine badge (whatever it currently says — "Deterministic Safety Engine" if still blocked, or live model name if access came through). | *"The schedule logic is designed to call Amazon Bedrock for AI-driven optimization. [IF STILL BLOCKED: say this instead →] Right now this AWS account is under a new-account model access restriction, so it's running its documented fallback — and it tells you that honestly, right here, instead of pretending. [IF BEDROCK WORKS: say this instead →] And here — Bedrock just generated this schedule live, you can see the model name right there."* |
| **2:25–2:45** | Show the "Honest Fallbacks" README section on screen (scroll to it), or the LIVE/CACHED/SIMULATED badges side by side if you have a second clip. | *"That's the core design decision behind VayuGuard: every fallback is visible, never silent. If the AI, the live feed, or anything else isn't working, the system says so — because an air-safety tool that lies about its own confidence is worse than one that's simply honest."* |
| **2:45–3:00** | Final shot: dashboard showing the modifications summary / student-hours figure, then fade to a title card with the GitHub repo link. | *"VayuGuard: turning a number nobody acts on into a decision somebody actually makes — built, deployed, and running on AWS. Thank you."* |

---

## Notes before you record

- **Pick the Bedrock line based on reality at recording time** — don't say both; the script has a bracket for each case. If it's still blocked, say so plainly; it's a strength (honesty), not a weakness to hide.
- **Rehearse the 0:45–1:15 scenario trigger once off-camera first** — confirm the SNS email actually arrives within a few seconds before you record, so you're not waiting live.
- **Keep a stopwatch visible** (phone or a second monitor) — going over 3:00 risks disqualifying that criterion entirely per the rules.
- **Have the AWS Console tab pre-loaded and logged in** before recording, scrolled to the right place (CloudFormation stack page, Lambda list, DynamoDB table item view) so you're not fumbling navigation on camera.
- **Say numbers out loud exactly as the UI shows them** — if the AQI reads 71, say 71, not a rounded "around 70." Precision reads as authenticity.
