import time
import requests
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

logger = logging.getLogger("vayuguard.aqi")

POPULAR_STATIONS = [
    {"id": "delhi/anand-vihar", "name": "Delhi — Anand Vihar", "city": "Delhi"},
    {"id": "delhi/punjabi-bagh", "name": "Delhi — Punjabi Bagh", "city": "Delhi"},
    {"id": "delhi/r.k.-puram", "name": "Delhi — R.K. Puram", "city": "Delhi"},
    {"id": "delhi/mandir-marg", "name": "Delhi — Mandir Marg", "city": "Delhi"},
    {"id": "mumbai", "name": "Mumbai — US Consulate / City", "city": "Mumbai"},
    {"id": "kolkata", "name": "Kolkata — Victoria / Central", "city": "Kolkata"},
    {"id": "bengaluru", "name": "Bengaluru — BTM / City", "city": "Bengaluru"},
    {"id": "patna", "name": "Patna — DRM Office", "city": "Patna"},
    {"id": "hyderabad", "name": "Hyderabad — Central University", "city": "Hyderabad"},
    {"id": "lucknow", "name": "Lucknow — Talkatora", "city": "Lucknow"}
]

# In-memory Last Known Good (LKG) cache per station
_LKG_CACHE_MAP: Dict[str, Any] = {}

_DEFAULT_LKG: Dict[str, Any] = {
    "aqi": 342,
    "pm25": 284.5,
    "pm10": 412.0,
    "temp": 19.4,
    "humidity": 68,
    "station_name": "Anand Vihar, Delhi - CPCB",
    "updated_at": datetime.now(timezone.utc).isoformat(),
    "is_cached": True,
    "status": "Very Poor"
}

_READING_HISTORY = [
    {"timestamp": "06:00", "aqi": 220, "pm25": 175.0},
    {"timestamp": "07:00", "aqi": 265, "pm25": 210.0},
    {"timestamp": "08:00", "aqi": 310, "pm25": 255.0},
    {"timestamp": "09:00", "aqi": 342, "pm25": 284.5}
]

def classify_aqi(aqi: int) -> Dict[str, str]:
    if aqi <= 50:
        return {"category": "Good", "color": "#10b981", "action_level": "Normal"}
    elif aqi <= 100:
        return {"category": "Satisfactory", "color": "#84cc16", "action_level": "Normal"}
    elif aqi <= 200:
        return {"category": "Moderate", "color": "#eab308", "action_level": "Caution for Sensitive"}
    elif aqi <= 300:
        return {"category": "Poor", "color": "#f97316", "action_level": "Limit Strenuous Outdoors"}
    elif aqi <= 400:
        return {"category": "Very Poor", "color": "#ef4444", "action_level": "Move All Activities Indoors"}
    else:
        return {"category": "Severe+", "color": "#7f1d1d", "action_level": "Emergency School Protocol"}

class AQIService:
    def __init__(self, token: str = "", station: str = "delhi/anand-vihar"):
        self.token = token
        self.station = station

    def get_stations(self) -> List[Dict[str, str]]:
        return POPULAR_STATIONS

    def get_current_reading(self, force_fresh: bool = False, simulated_spike: int = 0, station: Optional[str] = None) -> Dict[str, Any]:
        target_station = station if station else self.station
        
        # Check cache map
        cached = _LKG_CACHE_MAP.get(target_station, _DEFAULT_LKG)
        
        # If simulated spike is requested for live demo
        if simulated_spike > 0:
            spiked_aqi = min(500, cached["aqi"] + simulated_spike)
            classification = classify_aqi(spiked_aqi)
            return {
                "aqi": spiked_aqi,
                "pm25": round(cached["pm25"] * (spiked_aqi / max(1, cached["aqi"])), 1),
                "pm10": round(cached["pm10"] * (spiked_aqi / max(1, cached["aqi"])), 1),
                "temp": cached.get("temp", 18.5),
                "humidity": cached.get("humidity", 70),
                "station_id": target_station,
                "station_name": f"{cached['station_name']} (Simulated Inversion Spike)",
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "is_cached": False,
                "is_simulated": True,
                "category": classification["category"],
                "color": classification["color"],
                "action_level": classification["action_level"]
            }

        # Try live WAQI API
        if self.token:
            try:
                url = f"https://api.waqi.info/feed/{target_station}/?token={self.token}"
                resp = requests.get(url, timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("status") == "ok":
                        d = data["data"]
                        aqi_val = int(d.get("aqi", 250))
                        iaqi = d.get("iaqi", {})
                        pm25_val = iaqi.get("pm25", {}).get("v", aqi_val * 0.8)
                        pm10_val = iaqi.get("pm10", {}).get("v", aqi_val * 1.2)
                        
                        classification = classify_aqi(aqi_val)
                        result = {
                            "aqi": aqi_val,
                            "pm25": float(pm25_val),
                            "pm10": float(pm10_val),
                            "temp": iaqi.get("t", {}).get("v", 24.0),
                            "humidity": iaqi.get("h", {}).get("v", 58.0),
                            "station_id": target_station,
                            "station_name": d.get("city", {}).get("name", target_station),
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                            "is_cached": False,
                            "category": classification["category"],
                            "color": classification["color"],
                            "action_level": classification["action_level"]
                        }
                        _LKG_CACHE_MAP[target_station] = result
                        return result
            except Exception as e:
                logger.warning(f"Live AQI API failed for station {target_station}, using fallback: {e}")

        # Fallback to defensive LKG
        classification = classify_aqi(cached["aqi"])
        return {
            **cached,
            "station_id": target_station,
            "category": classification["category"],
            "color": classification["color"],
            "action_level": classification["action_level"]
        }

    def get_history(self):
        return _READING_HISTORY
