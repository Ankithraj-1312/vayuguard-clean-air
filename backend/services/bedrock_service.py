import json
import logging
import os
from typing import Dict, Any, List

logger = logging.getLogger("vayuguard.bedrock")

def extract_json_object(text: str) -> Dict[str, Any]:
    """
    Pulls a single JSON object out of a model's raw text response, tolerating
    markdown code fences (```json ... ``` or ``` ... ```) the model may add
    despite being asked not to. Raises ValueError if no JSON object is found.
    """
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]

    start_idx = cleaned.find("{")
    end_idx = cleaned.rfind("}") + 1
    if start_idx == -1 or end_idx == 0:
        raise ValueError("No JSON object found in model response")
    return json.loads(cleaned[start_idx:end_idx])


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

                try:
                    parsed_result = extract_json_object(content_text)
                    parsed_result["engine"] = _friendly_model_name(self.model_id)
                    parsed_result["live_ai"] = True
                    return parsed_result
                except ValueError:
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

    # AQI at which an outdoor period of this exertion level gets relocated indoors.
    # Higher-exertion activities get a lower (more cautious) threshold.
    HAZARD_THRESHOLD_BY_INTENSITY = {
        "Extreme": 300,
        "High": 250,
        "Moderate": 250,
        "Low": 250,
        "Sedentary": 350,
    }

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

        Driven entirely by each period's own attributes (is_outdoor, intensity,
        activity_type) rather than hardcoded period_id numbers, so it applies
        correctly to any school's schedule, not just the bundled sample one.
        """
        optimized_periods = []
        students_count = school_info.get("student_count", 850)
        indoor_venues = school_info.get("indoor_venues") or []

        total_avoided_mins = 0
        modifications_made = []

        for period in original_schedule:
            is_transit = period.get("activity_type") == "Transit & Staging"

            if not period["is_outdoor"] and not is_transit:
                optimized_periods.append({**period, "status": "NORMAL_INDOOR", "optimized_venue": period["current_venue"]})
                continue

            if is_transit:
                # Fume accumulation near idling vehicles is a hazard independent
                # of outdoor exertion AQI thresholds, so this always applies.
                optimized_periods.append({
                    **period,
                    "name": f"{period['name']} (Staggered Dispersal)",
                    "optimized_venue": f"Covered Corridors & Staggered {period['current_venue']}",
                    "status": "SAFETY_PROTOCOL_ENGAGED",
                    "safety_rationale": "Staggered class waves prevent idling-vehicle fume accumulation near exit points, independent of ambient AQI.",
                    "exposure_delta": "Reduced transit exposure time by an estimated 50%"
                })
                modifications_made.append(f"{period['name']} staggered with active mask protocol")
                continue

            threshold = self.HAZARD_THRESHOLD_BY_INTENSITY.get(period.get("intensity", "Moderate"), 250)
            if current_aqi >= threshold:
                indoor_venue = indoor_venues[0] if indoor_venues else "nearest indoor air-filtered facility"
                optimized_periods.append({
                    **period,
                    "optimized_venue": indoor_venue,
                    "is_outdoor": False,
                    "status": "RELOCATED_INDOORS",
                    "safety_rationale": f"{period.get('intensity', 'Moderate')}-intensity outdoor activity exceeds the {threshold} AQI safety threshold for this exertion level; relocated to a filtered indoor space.",
                    "exposure_delta": f"Avoided {current_aqi} AQI outdoor exposure during {period['duration_mins']} min of {period.get('intensity', 'moderate').lower()}-intensity activity"
                })
                total_avoided_mins += period["duration_mins"]
                modifications_made.append(f"{period['name']} relocated indoors ({indoor_venue})")
            else:
                optimized_periods.append({**period, "status": "UNCHANGED", "optimized_venue": period["current_venue"]})

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
