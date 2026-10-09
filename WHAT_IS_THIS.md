# VayuGuard — What Is This Project? (Simple English)

---

## The Problem (What's Going Wrong Right Now?)

Every year from **October to February**, the air in Delhi and North India gets very, very dirty.  
This is called **smog** — a mix of smoke, dust, and tiny particles (called PM2.5) that you breathe in.

When kids run outside during recess or play football, they breathe **very fast**.  
During smog, breathing fast means their lungs suck in a huge amount of toxic particles.

Here's the crazy part:
- **Every school already knows** the air is bad.
- There are apps like AQI.in and SAFAR that show a number like `AQI: 380`.
- But **nobody tells the school what to actually DO about it**.

The school principal sees `AQI 380`, doesn't know if that's bad enough to cancel recess,  
makes a guess, and by the time they decide — **the kids are already outside**.

---

## Our Solution (What Does VayuGuard Do?)

Think of VayuGuard as a **smart assistant for the school principal**.

Here's what it does, step by step, in plain English:

### Step 1 — It reads the air quality data automatically
Every 15 minutes, VayuGuard checks official air quality stations in the city  
(run by the government). It reads the AQI number and saves it.

### Step 2 — It predicts what's going to happen next
Using the last few hours of data, VayuGuard guesses what the AQI will be  
in the **next 3–6 hours**. For example:

> "Right now it's 8:00 AM and AQI is 210.  
> But based on the trend, by 10:30 AM it will reach 400 (Severe)."

This is called a **short-horizon forecast**. It's like weather forecasting but for air.

### Step 3 — It looks at the school's timetable
VayuGuard knows the school's daily schedule:
- 9:00 AM — Morning Assembly (Outdoor)
- 11:00 AM — Primary Recess (Playground)
- 2:00 PM — Football Practice (Ground)

### Step 4 — It finds the dangerous overlap
VayuGuard now compares the forecast with the timetable:

> "At 11:00 AM, 400 children will be on the playground.  
> But our forecast says AQI will be 400+ at that exact time.  
> DANGER: This is a serious health risk."

### Step 5 — It automatically fixes the schedule
Using AI (Amazon Bedrock), VayuGuard rewrites the timetable to protect kids:

**Original:**
- 11:00 AM → Recess (Outdoor Playground)

**VayuGuard's Fix:**
- 11:00 AM → Quiet time in the auditorium (air-purified, indoors)
- 1:30 PM → Recess moved here (by 1:30 PM, wind clears the smog)

This is called the **Dynamic Schedule Inversion** — it flips dangerous outdoor time  
to a safe window without cancelling it entirely.

### Step 6 — It sends alerts automatically
By **7:15 AM** — before school even starts — VayuGuard sends:
- A message to the **school principal** with the updated timetable
- A message to **teachers** explaining which periods changed and why
- A **WhatsApp/SMS** to parents in **English and Hindi** saying:

  > "Dear Parent, today's air quality is predicted to be severe at 11 AM.  
  > We have moved recess to 1:30 PM to protect your child.  
  > No activities have been cancelled."

### Step 7 — It shows everything on a dashboard
There's a web page where the school admin can:
- See the **live AQI** right now
- See the **6-hour forecast line** (will air get worse or better?)
- See **both timetables** side by side (original vs. optimized)
- Click a slider to simulate "what if smog gets even worse?" 
- See a counter: "Today we prevented 840 student-hours of toxic exposure"

---

## Why Is This Better Than What Already Exists?

| Existing Apps (AQI.in, SAFAR, IQAir) | VayuGuard |
| :--- | :--- |
| Shows you a number: AQI 380 | Tells you what to DO: "Move recess to 1:30 PM" |
| Updates every hour | Checks every 15 minutes |
| No prediction of future air quality | Forecasts next 6 hours |
| No connection to your school | Knows your school's exact timetable |
| No alerts | Sends WhatsApp/SMS before school starts |
| You make the decision | It makes the decision for you, automatically |

---

## Who Uses This?

- **School Principal** — Gets the updated timetable automatically, no manual work needed.
- **Teachers** — Get a message on their phone about which periods changed.
- **Parents** — Get a bilingual notification explaining what changed and why.
- **School Board / Municipality** — Can see which schools acted and how much exposure was prevented.

---

## The Cool Technical Stuff (Still Simple)

We built this entirely on **Amazon Web Services (AWS)**, which means:

- **No server to buy or maintain** — everything runs automatically in the cloud
- **Costs under Rs. 50 per school per month** — cheaper than a coffee
- **Scales instantly** — can work for 1 school or 10,000 schools without any changes

The main AWS tools we use:

| AWS Tool | What It Does (Simple) |
| :--- | :--- |
| **AWS Lambda** | Small pieces of code that run automatically (no server needed) |
| **Amazon DynamoDB** | A super-fast database that stores air readings and school schedules |
| **Amazon EventBridge** | Like a timer — triggers our system every 15 minutes |
| **FastAPI pipeline** | Manages the order: Ingest → Forecast → Decide → Alert (runs as one pipeline today; `infra/template.yaml` has the Lambda-per-step version ready to deploy) |
| **Amazon Bedrock (AI)** | The AI brain that rewrites the school schedule and writes the alerts |
| **Amazon SNS** | Sends SMS messages to phones |
| **AWS Amplify** | Hosts our website/dashboard on the internet |
| **Amazon API Gateway** | The bridge between our website and the database |

---

## What Makes This Special?

1. **It acts before the problem happens** — not after kids are already outside.
2. **It gives a specific instruction**, not just a number.
3. **It does not cancel things** — it smartly moves them to a safe time.
4. **It communicates to everyone** — principal, teacher, and parent in their language.
5. **It measures its own impact** — tells you how much exposure it prevented.

---

## One-Line Summary

VayuGuard automatically rewrites school schedules before the school day starts  
to make sure no child ever runs in toxic smog again.

---

*This document is for anyone who wants to understand the project without any technical background.*
