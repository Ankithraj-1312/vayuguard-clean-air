from typing import List, Dict, Any

DEFAULT_SCHOOL_SCHEDULE = [
    {
        "period_id": 1,
        "name": "Morning Assembly & National Anthem",
        "time": "08:15 AM - 08:45 AM",
        "start_hour": 8,
        "duration_mins": 30,
        "activity_type": "Outdoor Gathering",
        "intensity": "Low",
        "current_venue": "Open Assembly Grounds",
        "is_outdoor": True
    },
    {
        "period_id": 2,
        "name": "Classroom Academic Block 1 (Math/Science)",
        "time": "08:45 AM - 10:15 AM",
        "start_hour": 9,
        "duration_mins": 90,
        "activity_type": "Classroom Instruction",
        "intensity": "Sedentary",
        "current_venue": "Main School Academic Wing",
        "is_outdoor": False
    },
    {
        "period_id": 3,
        "name": "Primary & Middle School Recess",
        "time": "10:15 AM - 10:55 AM",
        "start_hour": 10,
        "duration_mins": 40,
        "activity_type": "High-Exertion Free Play",
        "intensity": "High",
        "current_venue": "Junior Playground",
        "is_outdoor": True
    },
    {
        "period_id": 4,
        "name": "Classroom Academic Block 2 (Languages/Social)",
        "time": "10:55 AM - 12:30 PM",
        "start_hour": 11,
        "duration_mins": 95,
        "activity_type": "Classroom Instruction",
        "intensity": "Sedentary",
        "current_venue": "Main School Academic Wing",
        "is_outdoor": False
    },
    {
        "period_id": 5,
        "name": "Physical Education (PE) & Football Training",
        "time": "12:30 PM - 01:15 PM",
        "start_hour": 12,
        "duration_mins": 45,
        "activity_type": "Cardio / Aerobic Exertion",
        "intensity": "Extreme",
        "current_venue": "Senior Sports Arena",
        "is_outdoor": True
    },
    {
        "period_id": 6,
        "name": "Indoor Library, Lab & Club Activities",
        "time": "01:15 PM - 02:00 PM",
        "start_hour": 13,
        "duration_mins": 45,
        "activity_type": "Quiet Study / Laboratory",
        "intensity": "Low",
        "current_venue": "Central Library & Computer Lab",
        "is_outdoor": False
    },
    {
        "period_id": 7,
        "name": "Senior Dispersal & School Bus Boarding",
        "time": "02:00 PM - 02:30 PM",
        "start_hour": 14,
        "duration_mins": 30,
        "activity_type": "Transit & Staging",
        "intensity": "Moderate",
        "current_venue": "Front Gate & Bus Parking Zone",
        "is_outdoor": True
    }
]

# Ventilation rates in liters per minute (L/min) by exertion level and age group
VENTILATION_RATES_L_MIN = {
    "primary": {"Sedentary": 6.5, "Low": 12.0, "Moderate": 22.0, "High": 38.0, "Extreme": 52.0},
    "middle":  {"Sedentary": 7.5, "Low": 14.0, "Moderate": 28.0, "High": 48.0, "Extreme": 65.0},
    "senior":  {"Sedentary": 8.5, "Low": 16.0, "Moderate": 32.0, "High": 56.0, "Extreme": 78.0},
}

class EvaluatorService:
    @staticmethod
    def evaluate_risk(schedule: List[Dict[str, Any]], forecast: List[Dict[str, Any]], current_aqi: int) -> Dict[str, Any]:
        """
        Cross-checks school timetable against forecasted AQI values to identify
        dangerous exposure overlaps where children exert outdoors during severe smog.
        """
        flagged_periods = []
        safe_windows = []
        total_exposed_minutes = 0
        
        for period in schedule:
            if not period["is_outdoor"]:
                continue
                
            # Find matching forecast
            p_hour = period.get("start_hour", 10)
            matched_forecast = None
            if forecast:
                for f in forecast:
                    f_hour = int(f["time"].split(":")[0]) if ":" in f["time"] else 12
                    if f_hour == p_hour:
                        matched_forecast = f
                        break
                if not matched_forecast and forecast:
                    matched_forecast = forecast[0]
            
            projected_aqi = matched_forecast["predicted_aqi"] if matched_forecast else current_aqi
            
            # Exposure threshold is AQI >= 250 (Poor/Very Poor/Severe)
            if projected_aqi >= 250 or current_aqi >= 250:
                total_exposed_minutes += period["duration_mins"]
                
                flagged_periods.append({
                    "period_id": period["period_id"],
                    "name": period["name"],
                    "time": period["time"],
                    "venue": period["current_venue"],
                    "projected_aqi": projected_aqi,
                    "intensity": period["intensity"],
                    "action_required": "Relocate or Invert Schedule",
                    "reason": f"High exertion in {projected_aqi} AQI air causes deep alveolar PM2.5 deposition."
                })
            else:
                safe_windows.append(period["time"])

        # Calculate estimated particulate mass inhalation
        pm25_estimate = round(current_aqi * 0.72, 1) # approx PM2.5 µg/m3
        approx_inhalation_grams = round((pm25_estimate * (total_exposed_minutes / 60.0) * 0.038 * 850) / 1_000_000, 3)

        return {
            "is_action_required": len(flagged_periods) > 0,
            "current_aqi": current_aqi,
            "total_hazardous_outdoor_minutes": total_exposed_minutes,
            "flagged_periods_count": len(flagged_periods),
            "flagged_periods": flagged_periods,
            "safe_windows": safe_windows,
            "estimated_pm25_grams_at_risk": approx_inhalation_grams
        }

    @staticmethod
    def calculate_student_inhalation(
        aqi: int,
        duration_minutes: int,
        intensity: str = "High",
        age_group: str = "primary",
        has_indoor_hepa: bool = False
    ) -> Dict[str, Any]:
        """
        Calculates pediatric inhaled particulate mass (PM2.5 microgram and cigarette equivalents)
        based on child age, exertion level, and HEPA filtration status.
        """
        # Estimated ambient PM2.5 in ug/m3
        pm25_conc = round(aqi * 0.72, 1)
        if has_indoor_hepa:
            pm25_conc = max(5.0, round(pm25_conc * 0.12, 1)) # 88% HEPA reduction

        # Ventilation rate in m3/min (1000 L = 1 m3)
        rates = VENTILATION_RATES_L_MIN.get(age_group.lower(), VENTILATION_RATES_L_MIN["primary"])
        l_min = rates.get(intensity, 25.0)
        m3_min = l_min / 1000.0

        # Total inhaled air in cubic meters
        total_volume_m3 = round(m3_min * duration_minutes, 3)

        # Micrograms of PM2.5 inhaled
        pm25_inhaled_ug = round(pm25_conc * total_volume_m3, 2)

        # 1 cigarette is roughly equivalent to inhaling ~22 ug of PM2.5
        cig_equiv = round(pm25_inhaled_ug / 22.0, 2)

        return {
            "aqi": aqi,
            "pm25_concentration_ug_m3": pm25_conc,
            "duration_minutes": duration_minutes,
            "age_group": age_group,
            "intensity": intensity,
            "air_inhaled_m3": total_volume_m3,
            "pm25_inhaled_ug": pm25_inhaled_ug,
            "cigarette_equivalent": cig_equiv,
            "hepa_active": has_indoor_hepa
        }
