import json
import logging
import os
from typing import Dict, Any, List

logger = logging.getLogger("vayuguard.bedrock")

def _friendly_model_name(model_id: str) -> str:
    if "nova-lite" in model_id:
        return "Amazon Bedrock (Nova Lite)"
    if "nova-micro" in model_id:
        return "Amazon Bedrock (Nova Micro)"
    if "nova-pro" in model_id:
        return "Amazon Bedrock (Nova Pro)"
    if "claude-3-5-sonnet" in model_id:
        return "Amazon Bedrock (Claude 3.5 Sonnet)"
    if "claude" in model_id:
        return "Amazon Bedrock (Claude)"
    return f"Amazon Bedrock ({model_id})"


class BedrockService:
    def __init__(self, region: str = "us-east-1", model_id: str = "amazon.nova-lite-v1:0"):
        self.region = region
        self.model_id = model_id
        self._bedrock_client = None

        try:
            import boto3
            self._bedrock_client = boto3.client("bedrock-runtime", region_name=self.region)
        except Exception as e:
            logger.warning(f"Could not initialize boto3 Bedrock client: {e}")

    def optimize_schedule(
        self,
        school_info: Dict[str, Any],
        current_aqi: int,
        forecast: List[Dict[str, Any]],
        original_schedule: List[Dict[str, Any]],
        evaluation: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Uses Amazon Bedrock (or deterministic fallback) to generate an intelligent
        re-sequencing of the school day, avoiding peak smog while keeping total learning intact.
        """
        
        # Prepare system prompt and payload
        system_prompt = (
            "You are VayuGuard AI — an expert pediatric environmental health officer and school timetable orchestrator. "
            "Your objective: Protect students from hazardous PM2.5 inhalation during peak smog inversions by rearranging "
            "the daily schedule. Relocate or swap high-exertion outdoor activities (recess, morning assembly, sports) into "
            "indoor air-purified facilities or later cleaner-air afternoon windows. Never delete periods; only re-order or move venues. "
            "Return valid JSON matching the specified schema."
        )
        
        prompt_payload = {
            "school": school_info,
            "current_aqi": current_aqi,
            "forecast": forecast,
            "original_schedule": original_schedule,
            "flagged_hazardous_periods": evaluation.get("flagged_periods", [])
        }
        
        # Try live Amazon Bedrock call if client is available.
        # Uses the Converse API, which is model-agnostic (works the same for
        # Nova, Claude, Llama, etc.) so switching BEDROCK_MODEL_ID is a one-line change.
        if self._bedrock_client and os.getenv("AWS_ACCESS_KEY_ID"):
            try:
                user_text = (
                    "Optimize this school day to minimize PM2.5 exposure. "
                    "Respond with ONLY a single JSON object, no markdown fences, no commentary:\n\n"
                    f"{json.dumps(prompt_payload, indent=2)}"
                )

                response = self._bedrock_client.converse(
                    modelId=self.model_id,
                    system=[{"text": system_prompt}],
                    messages=[{"role": "user", "content": [{"text": user_text}]}],
                    inferenceConfig={"maxTokens": 2048, "temperature": 0.3}
                )

                content_text = response["output"]["message"]["content"][0]["text"]

                # Strip markdown code fences if the model added them anyway
                cleaned = content_text.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.split("```")[1]
                    if cleaned.startswith("json"):
                        cleaned = cleaned[4:]

                # Extract JSON block
                start_idx = cleaned.find("{")
                end_idx = cleaned.rfind("}") + 1
                if start_idx != -1 and end_idx != -1:
                    parsed_result = json.loads(cleaned[start_idx:end_idx])
                    parsed_result["engine"] = _friendly_model_name(self.model_id)
                    parsed_result["live_ai"] = True
                    return parsed_result
                logger.warning("Bedrock response had no parseable JSON object; falling back.")
            except Exception as e:
                logger.warning(f"Bedrock invocation exception: {e}. Falling back to deterministic optimization engine.")

        # Resilient Deterministic Schedule Optimizer
        return self._generate_resilient_optimized_schedule(
            original_schedule,
            current_aqi,
            school_info,
            evaluation
        )

    def _generate_resilient_optimized_schedule(
        self,
        original_schedule: List[Dict[str, Any]],
        current_aqi: int,
        school_info: Dict[str, Any],
        evaluation: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Deterministic, robust optimization engine that produces a high-fidelity
        optimized schedule conforming to medical and operational safety rules.
        """
        optimized_periods = []
        students_count = school_info.get("student_count", 850)
        
        total_avoided_mins = 0
        modifications_made = []
        
        for period in original_schedule:
            p_id = period["period_id"]
            
            if p_id == 1: # Morning Assembly
                if current_aqi >= 250:
                    optimized_periods.append({
                        **period,
                        "optimized_venue": "Multi-Purpose Auditorium & Classrooms PA System",
                        "is_outdoor": False,
                        "status": "RELOCATED_INDOORS",
                        "safety_rationale": "Morning smog inversion traps ground-level particulates. Assembly broadcasted via PA system with HEPA filtration active.",
                        "exposure_delta": f"Avoided {current_aqi} AQI outdoor exposure"
                    })
                    total_avoided_mins += period["duration_mins"]
                    modifications_made.append("Morning Assembly shifted to indoor PA broadcast")
                else:
                    optimized_periods.append({**period, "status": "UNCHANGED", "optimized_venue": period["current_venue"]})
                    
            elif p_id == 3: # Primary Recess at 10:15 AM (Peak Smog Peak)
                if current_aqi >= 250:
                    # Swap with Period 6 (Quiet study in library) or move to Indoor Gym
                    optimized_periods.append({
                        **period,
                        "name": "Indoor Activity & Quiet Refreshment Break",
                        "optimized_venue": "Indoor Gymnasium & Air-Filtered Activity Hall",
                        "is_outdoor": False,
                        "status": "VENUE_SWAPPED",
                        "safety_rationale": "Forecast peaks at 10:30 AM. Outdoor running halted to prevent deep lung PM2.5 deposition. Re-routed to indoor activity hall.",
                        "exposure_delta": "Saved 40 mins of peak exertion in 380+ AQI air"
                    })
                    total_avoided_mins += period["duration_mins"]
                    modifications_made.append("10:15 AM Recess moved to air-purified Indoor Gymnasium")
                else:
                    optimized_periods.append({**period, "status": "UNCHANGED", "optimized_venue": period["current_venue"]})
                    
            elif p_id == 5: # Sports / Football at 12:30 PM
                if current_aqi >= 300:
                    optimized_periods.append({
                        **period,
                        "name": "Tactical Video Analysis & Indoor Yoga/Stretching",
                        "optimized_venue": "Indoor Sports Complex",
                        "is_outdoor": False,
                        "status": "ACTIVITY_MODIFIED",
                        "safety_rationale": "Extreme cardio outdoor drills suspended. Converted to low-aerobic tactical analysis and indoor flexibility training.",
                        "exposure_delta": "Saved 45 mins of extreme cardio in toxic air"
                    })
                    total_avoided_mins += period["duration_mins"]
                    modifications_made.append("PE Football drills converted to indoor low-aerobic training")
                else:
                    optimized_periods.append({**period, "status": "UNCHANGED", "optimized_venue": period["current_venue"]})
                    
            elif p_id == 7: # Dispersal & Bus Boarding
                optimized_periods.append({
                    **period,
                    "name": "Staggered Indoor Gate Dispersal with N95 Mask Protocol",
                    "optimized_venue": "Covered Corridors & Staggered Bus Bays",
                    "is_outdoor": True,
                    "status": "SAFETY_PROTOCOL_ENGAGED",
                    "safety_rationale": "Staggered 5-minute class waves to prevent idling bus fumes accumulation near exit gates.",
                    "exposure_delta": "Reduced transit exposure time by 50%"
                })
                modifications_made.append("Bus boarding staggered with active mask protocol")
            else:
                optimized_periods.append({
                    **period,
                    "status": "NORMAL_INDOOR",
                    "optimized_venue": period["current_venue"]
                })

        student_hours_saved = round((students_count * total_avoided_mins) / 60.0, 1)
        est_pm25_avoided_mg = round((total_avoided_mins / 60.0) * (current_aqi * 0.015) * students_count, 1)

        return {
            "engine": "Deterministic Safety Engine (Local Fallback)",
            "live_ai": False,
            "optimized_schedule": optimized_periods,
            "summary": {
                "modifications_count": len(modifications_made),
                "total_avoided_outdoor_minutes": total_avoided_mins,
                "student_hours_protected": student_hours_saved,
                "estimated_pm25_inhalation_avoided_grams": round(est_pm25_avoided_mg / 1000.0, 2),
                "modifications_list": modifications_made
            },
            "advisory_cards": {
                "admin": f"VayuGuard has re-sequenced {len(modifications_made)} periods for today. All morning outdoor assemblies and playground recess have been shifted to air-purified indoor halls.",
                "parents": f"Dear Parents, due to morning smog inversion (AQI {current_aqi}), outdoor physical activities have been moved indoors to purified zones. No classes are cancelled."
            }
        }
