import os
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from config import settings
from services.aqi_service import AQIService, POPULAR_STATIONS
from services.forecast_service import ForecastService
from services.evaluator_service import EvaluatorService, DEFAULT_SCHOOL_SCHEDULE
from services.bedrock_service import BedrockService
from services.notification_service import NotificationService

app = FastAPI(
    title="VayuGuard API",
    description="Proactive Clean Air Intelligence & Schedule Orchestration Engine",
    version=settings.VERSION
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize service instances
aqi_service = aqi_service = AQIService(token=settings.WAQI_TOKEN, station=settings.DEFAULT_STATION)
forecast_service = ForecastService()
evaluator_service = EvaluatorService()
bedrock_service = BedrockService(region=settings.AWS_REGION, model_id=settings.BEDROCK_MODEL_ID)
notification_service = NotificationService(sns_topic_arn=settings.SNS_TOPIC_ARN)

class PipelineRunRequest(BaseModel):
    spike_aqi: int = 0
    station: Optional[str] = None

class HealthRiskRequest(BaseModel):
    aqi: int = 250
    duration_minutes: int = 45
    intensity: str = "High"
    age_group: str = "primary" # primary, middle, senior
    has_indoor_hepa: bool = False

PRESET_SCENARIOS = [
    {
        "id": "severe-inversion",
        "title": "Severe Winter Thermal Inversion",
        "description": "Cold morning air traps toxic particulate smog at ground level (< 100m boundary layer).",
        "spike_aqi": 175,
        "base_aqi": 380,
        "category": "Severe"
    },
    {
        "id": "stubble-wave",
        "title": "Crop Residue Stubble Smoke Surge",
        "description": "North-westerly winds bring concentrated farm residue plume across northern plains.",
        "spike_aqi": 110,
        "base_aqi": 310,
        "category": "Very Poor"
    },
    {
        "id": "post-rain",
        "title": "Post-Monsoon Wash-out Window",
        "description": "Rain precipitation clears airborne aerosols, providing safe outdoor windows.",
        "spike_aqi": -100,
        "base_aqi": 65,
        "category": "Satisfactory"
    },
    {
        "id": "moderate-haze",
        "title": "Standard Urban Traffic Haze",
        "description": "Moderate vehicular and dust emissions without severe inversion.",
        "spike_aqi": 0,
        "base_aqi": 165,
        "category": "Moderate"
    }
]

@app.get("/")
def health_check():
    return {
        "service": settings.APP_NAME,
        "status": "healthy",
        "version": settings.VERSION,
        "aws_region": settings.AWS_REGION,
        "school": settings.DEFAULT_SCHOOL["name"]
    }

@app.get("/api/stations")
def get_available_stations():
    return {
        "current_station": aqi_service.station,
        "stations": aqi_service.get_stations()
    }

@app.get("/api/school")
def get_school_profile():
    return settings.DEFAULT_SCHOOL

@app.get("/api/aqi/current")
def get_current_aqi(
    spike: int = Query(0, description="Simulated spike in AQI points"),
    station: Optional[str] = Query(None, description="Station ID or slug")
):
    return aqi_service.get_current_reading(simulated_spike=spike, station=station)

@app.get("/api/aqi/forecast")
def get_aqi_forecast(
    spike: int = Query(0, description="Simulated spike"),
    station: Optional[str] = Query(None, description="Station ID or slug")
):
    current = aqi_service.get_current_reading(simulated_spike=spike, station=station)
    history = aqi_service.get_history()
    forecast = forecast_service.generate_6h_forecast(
        current_aqi=current["aqi"],
        historical_readings=history,
        simulated_spike=spike
    )
    return {
        "station_id": current.get("station_id", station or aqi_service.station),
        "station_name": current.get("station_name", "Station"),
        "current_aqi": current["aqi"],
        "category": current["category"],
        "color": current["color"],
        "forecast": forecast
    }

@app.get("/api/schedule/default")
def get_default_schedule():
    return {
        "school": settings.DEFAULT_SCHOOL,
        "schedule": DEFAULT_SCHOOL_SCHEDULE
    }

@app.get("/api/scenarios")
def get_scenarios():
    """Returns preset simulation profiles for what-if demonstrations."""
    return {"scenarios": PRESET_SCENARIOS}

@app.post("/api/health/calculate-risk")
def calculate_pediatric_risk(req: HealthRiskRequest):
    """Calculates child lung particulate inhalation volume and cigarette equivalents."""
    return evaluator_service.calculate_student_inhalation(
        aqi=req.aqi,
        duration_minutes=req.duration_minutes,
        intensity=req.intensity,
        age_group=req.age_group,
        has_indoor_hepa=req.has_indoor_hepa
    )

@app.get("/api/notifications/bilingual-preview")
def get_bilingual_preview(
    aqi: int = Query(280, description="AQI level"),
    school_name: str = Query("Delhi Model Academy", description="School Name")
):
    """Generates preview of bilingual notifications for WhatsApp and SMS."""
    advisories = {
        "admin": f"Air quality index {aqi} triggers Proactive Clean Air Protocol. Recess moved indoors."
    }
    return notification_service.generate_bilingual_cards(school_name, aqi, advisories)

@app.get("/api/schedule/export")
def export_schedule(format: str = Query("json", description="json, markdown, or csv")):
    """Exports the schedule in multiple formats for integration or printing."""
    if format == "markdown":
        md = "# VayuGuard — Daily Schedule Master\n\n"
        md += "| Period | Time | Subject / Activity | Venue | Type | Intensity |\n"
        md += "| :--- | :--- | :--- | :--- | :--- | :--- |\n"
        for p in DEFAULT_SCHOOL_SCHEDULE:
            md += f"| {p['period_id']} | {p['time']} | {p['name']} | {p['current_venue']} | {'Outdoor' if p['is_outdoor'] else 'Indoor'} | {p['intensity']} |\n"
        return {"format": "markdown", "content": md}
    elif format == "csv":
        csv_rows = ["Period,Time,Activity,Venue,IsOutdoor,Intensity"]
        for p in DEFAULT_SCHOOL_SCHEDULE:
            csv_rows.append(f"{p['period_id']},{p['time']},\"{p['name']}\",\"{p['current_venue']}\",{p['is_outdoor']},{p['intensity']}")
        return {"format": "csv", "content": "\n".join(csv_rows)}
    return {
        "format": "json",
        "school": settings.DEFAULT_SCHOOL,
        "schedule": DEFAULT_SCHOOL_SCHEDULE
    }

@app.post("/api/pipeline/run")
def run_full_pipeline(req: Optional[PipelineRunRequest] = None):
    """
    Executes the entire end-to-end VayuGuard Pipeline for any specified station:
    1. Ingest AQI Data (Live/LKG/Simulated for chosen station)
    2. Compute 6-Hour Forward Forecast
    3. Evaluate School Schedule Overlaps
    4. Call Amazon Bedrock Schedule Optimizer
    5. Dispatch Multi-Channel Notifications (SNS + Web Push + Bilingual Cards)
    """
    spike_val = req.spike_aqi if req else 0
    station_val = req.station if (req and req.station) else None
    
    # Step 1: Ingest
    current = aqi_service.get_current_reading(simulated_spike=spike_val, station=station_val)
    history = aqi_service.get_history()
    
    # Step 2: Forecast
    forecast = forecast_service.generate_6h_forecast(
        current_aqi=current["aqi"],
        historical_readings=history,
        simulated_spike=spike_val
    )
    
    # Step 3: Evaluate
    evaluation = evaluator_service.evaluate_risk(
        schedule=DEFAULT_SCHOOL_SCHEDULE,
        forecast=forecast,
        current_aqi=current["aqi"]
    )
    
    # Step 4: Bedrock Optimization
    optimization = bedrock_service.optimize_schedule(
        school_info=settings.DEFAULT_SCHOOL,
        current_aqi=current["aqi"],
        forecast=forecast,
        original_schedule=DEFAULT_SCHOOL_SCHEDULE,
        evaluation=evaluation
    )
    
    # Step 5: Dispatch Notifications
    student_hours = optimization["summary"]["student_hours_protected"]
    dispatch_res = notification_service.dispatch_alerts(
        school_name=settings.DEFAULT_SCHOOL["name"],
        current_aqi=current["aqi"],
        advisories=optimization["advisory_cards"],
        students_protected=student_hours
    )
    
    return {
        "status": "SUCCESS",
        "station_id": current.get("station_id", station_val or aqi_service.station),
        "current_reading": current,
        "forecast": forecast,
        "evaluation": evaluation,
        "optimization": optimization,
        "notification": dispatch_res
    }

@app.get("/api/notifications")
def get_notifications():
    return notification_service.get_history()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
