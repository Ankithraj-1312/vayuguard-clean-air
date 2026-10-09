import os
from pydantic import BaseModel
from typing import List, Dict, Any

class Settings:
    APP_NAME: str = "VayuGuard"
    VERSION: str = "1.0.0"
    
    # AQI Data Configuration - Loaded strictly from environment
    WAQI_TOKEN: str = os.getenv("WAQI_TOKEN", "demo")
    DEFAULT_STATION: str = os.getenv("DEFAULT_STATION", "delhi/anand-vihar")
    
    # AWS Configuration
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    DYNAMODB_TABLE: str = os.getenv("TABLE_NAME", "vayuguard")
    SNS_TOPIC_ARN: str = os.getenv("SNS_TOPIC_ARN", "")
    BEDROCK_MODEL_ID: str = os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20241022-v2:0")
    
    # Safety Thresholds (India National AQI Standard)
    AQI_MODERATE: int = 100
    AQI_POOR: int = 200
    AQI_VERY_POOR: int = 300
    AQI_SEVERE: int = 400
    
    # Default School Profile
    DEFAULT_SCHOOL = {
        "id": "DELHI_MODEL_ACADEMY",
        "name": "Delhi Model Academy (Senior Wing)",
        "location": "Anand Vihar, New Delhi",
        "student_count": 850,
        "grade_range": "Grades 1 - 12",
        "outdoor_venues": ["Main Sports Ground", "Junior Playground", "Open Assembly Stage"],
        "indoor_venues": ["Multi-Purpose Auditorium", "Indoor Gymnasium", "Activity Hall A & B"]
    }

settings = Settings()
