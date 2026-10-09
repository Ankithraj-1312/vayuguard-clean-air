import os
import time
import requests
import logging
from decimal import Decimal
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

logger = logging.getLogger("vayuguard.aqi")


def _to_decimal(value: Any) -> Any:
    """DynamoDB's boto3 resource API requires Decimal instead of float."""
    if isinstance(value, float):
        return Decimal(str(value))
    return value


def _from_decimal(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    return value

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
        self._table = None

        try:
            import boto3
            if os.getenv("AWS_ACCESS_KEY_ID"):
                dynamodb = boto3.resource("dynamodb", region_name=os.getenv("AWS_REGION", "us-east-1"))
                self._table = dynamodb.Table(os.getenv("TABLE_NAME", "vayuguard-telemetry"))
        except Exception as e:
            logger.warning(f"Could not initialize DynamoDB table: {e}")

    def get_stations(self) -> List[Dict[str, str]]:
        return POPULAR_STATIONS

    def _persist_reading(self, station: str, reading: Dict[str, Any]) -> None:
        if not self._table:
            return
        try:
            self._table.put_item(Item={
                "PK": f"STATION#{station}",
                "SK": f"READING#{reading['updated_at']}",
                "aqi": _to_decimal(reading["aqi"]),
                "pm25": _to_decimal(reading["pm25"]),
                "pm10": _to_decimal(reading["pm10"]),
                "source": "WAQI_LIVE"
            })
        except Exception as e:
            logger.warning(f"DynamoDB write failed for {station}: {e}")

    def _query_history(self, station: str, limit: int = 20) -> Optional[List[Dict[str, Any]]]:
        if not self._table:
            return None
        try:
            from boto3.dynamodb.conditions import Key
            resp = self._table.query(
                KeyConditionExpression=Key("PK").eq(f"STATION#{station}"),
                ScanIndexForward=True,
                Limit=limit
            )
            items = resp.get("Items", [])
            if not items:
                return None
            return [
                {
                    "timestamp": item["SK"].replace("READING#", ""),
                    "aqi": int(_from_decimal(item["aqi"])),
                    "pm25": _from_decimal(item["pm25"])
                }
                for item in items
            ]
        except Exception as e:
            logger.warning(f"DynamoDB query failed for {station}: {e}")
            return None

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
                        self._persist_reading(target_station, result)
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

    def get_history(self, station: Optional[str] = None):
        target_station = station if station else self.station
        live_history = self._query_history(target_station)
        if live_history:
            return live_history
        return _READING_HISTORY
