# 🛡️ VayuGuard: Dynamic Clean Air Intelligence & School Timetable Orchestrator

[![AWS Bedrock](https://img.shields.io/badge/AWS_Bedrock-Nova_Lite-FF9900?logo=amazon-aws&logoColor=white)](https://aws.amazon.com/bedrock/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React_19_+_Vite-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Environmental Hacks 2026 Submission**  
> **Track:** Air (Air Quality, Exposure Reduction, Pediatric Health, Proactive Scheduling)

---

## 🎯 The Problem

Every winter across North India and urban centers worldwide, millions of schoolchildren inhale hazardous concentrations of $\text{PM}_{2.5}$ and $\text{PM}_{10}$ particulates during morning smog inversions. 

Conventional air quality apps (e.g. AQI.in, SAFAR, IQAir) only display **passive numbers** (e.g., *AQI 380*). By the time school principals or teachers notice, **children are already outside running during morning assembly and primary recess** — breathing at high tidal ventilation rates ($38\text{--}52\,\text{L/min}$) that deposit toxic soot deep into their alveolar lung tissue.

---

## 💡 The Solution: Active AI Orchestration

**VayuGuard** is an automated clean-air safety platform built on AWS. Rather than stopping at passive charts, it **actively rewires the daily school timetable**:

1. **Live WAQI & Sensor Ingest**: Ingests real-time air quality feeds across 10 regional stations with circuit-breaker (last-known-good) caching, and persists every reading to **Amazon DynamoDB**.
2. **Short-Horizon Diurnal Forecast**: Predicts boundary-layer thermal trapping and afternoon wind dispersion windows.
3. **Amazon Bedrock AI Rewiring**: Calls Amazon Bedrock (Nova Lite by default — swappable to Claude via one env var, using Bedrock's model-agnostic Converse API) to intelligently shift high-exertion outdoor activities (Assembly, Recess, Sports) into air-filtered indoor arenas or safer afternoon windows **without canceling academic time**. If Bedrock is unreachable (e.g. account-level model restrictions), a deterministic rule-based engine takes over and is labeled honestly as such in the UI — never misreported as live AI.
4. **Alert Dispatcher**: Broadcasts real alerts via **Amazon SNS** to subscribed staff/parents, plus bilingual (English/Hindi) advisory cards in the dashboard.
5. **Pediatric Inhalation Metrics**: Quantifies student-hours protected and $\text{PM}_{2.5}$ inhalation avoided (along with cigarette equivalents).

---

## ⚡ AWS Cloud-Native Architecture

```
[ WAQI Air Quality Stations / CPCB ]
                │
                ▼ (Every 15 mins via EventBridge)
      ┌──────────────────┐
      │   AWS Lambda     │ ──▶ Ingest & Diurnal Boundary Forecast
      └─────────┬────────┘
                │
                ▼
      ┌──────────────────┐
      │ Amazon DynamoDB  │ ──▶ Live AQI telemetry store (PK/SK single-table)
      └─────────┬────────┘
                │
                ▼
      ┌──────────────────┐
      │  Amazon Bedrock  │ ──▶ Timetable Optimization Engine (Nova Lite / Claude via Converse API)
      └─────────┬────────┘
                │
                ▼
      ┌──────────────────┐
      │   Amazon SNS     │ ──▶ Real-time staff/parent alert broadcast
      └──────────────────┘

  Frontend: React + Vite dashboard calling the FastAPI backend directly.
```

> **Current submission status:** DynamoDB and SNS are wired to real AWS resources and verified working end-to-end. Bedrock integration is implemented and will activate automatically once model access is approved on this AWS account (new-account restriction, not a code issue) — until then the app runs on its deterministic fallback engine, which is clearly labeled as such everywhere in the UI and API responses. `infra/template.yaml` (AWS SAM) defines the deployable Lambda/DynamoDB/SNS/EventBridge stack.

---

## 🚀 Quick Start (Run Locally)

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Start the Backend API
```bash
cd backend
pip install -r requirements.txt
python app.py
```
*Backend runs on `http://127.0.0.1:8000` with interactive Swagger docs at `http://127.0.0.1:8000/docs`.*

### 2. Start the Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:5173`.*

---

## 📡 Key API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/aqi/current` | Real-time sensor reading with simulated spike parameter |
| `GET` | `/api/aqi/forecast` | 6-hour forward diurnal exposure prediction |
| `POST` | `/api/pipeline/run` | End-to-end trigger: Ingest $\rightarrow$ Forecast $\rightarrow$ Bedrock AI Optimization $\rightarrow$ SNS Dispatch |
| `POST` | `/api/health/calculate-risk` | Calculates tidal lung volume and $\text{PM}_{2.5}$ cigarette equivalents |
| `GET` | `/api/scenarios` | Returns demo what-if scenarios (Inversion, Stubble wave, etc.) |
| `GET` | `/api/schedule/export` | Exports timetable in JSON, Markdown, or CSV |

---

## 🏆 Presentation Demo Walkthrough

1. **Dashboard Overview**: Inspect the real-time count-up gauge, severity status, and Before/After timetable comparison.
2. **Live Sensor Map Tab**: Switch between 10 monitoring stations across India with the animated radar sweep and telemetry inspector.
3. **What-If Inversion Slider / Scenarios**: Click *Winter Thermal Inversion (+175 AQI)* to test instant schedule re-sequencing.
4. **Pediatric Calculator Tab**: Toggle student age group and HEPA filtration to view calculated inhaled mass and cigarette equivalents.
5. **WhatsApp Notices Tab**: Review parent reassurance cards generated in English & Hindi with 1-click copy buttons.
6. **Judge Architecture Modal**: Click the top-right button to view the complete AWS serverless infrastructure blueprint.

---

## 🤖 AI Tools Disclosure

This project was built with AI coding assistance from **Claude (Anthropic) via Claude Code**, used for architecture guidance, code generation, debugging, AWS wiring, and documentation. Per the hackathon rules, this is disclosed here as required.

---

## 📄 License
MIT License. Developed for **Environmental Hacks 2026**.
