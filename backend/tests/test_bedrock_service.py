import pytest

from services.bedrock_service import BedrockService, extract_json_object


# ─── extract_json_object: parsing Bedrock's raw text response ──────────────

def test_extract_json_object_plain():
    assert extract_json_object('{"a": 1, "b": "x"}') == {"a": 1, "b": "x"}


def test_extract_json_object_with_surrounding_prose():
    text = 'Sure, here is the schedule:\n{"a": 1}\nLet me know if you need changes.'
    assert extract_json_object(text) == {"a": 1}


def test_extract_json_object_fenced_with_json_tag():
    text = '```json\n{"a": 1, "nested": {"b": 2}}\n```'
    assert extract_json_object(text) == {"a": 1, "nested": {"b": 2}}


def test_extract_json_object_fenced_without_language_tag():
    text = '```\n{"a": 1}\n```'
    assert extract_json_object(text) == {"a": 1}


def test_extract_json_object_raises_when_no_json_present():
    with pytest.raises(ValueError):
        extract_json_object("I could not generate a schedule for that input.")


def test_extract_json_object_raises_on_empty_string():
    with pytest.raises(ValueError):
        extract_json_object("")


# ─── Deterministic fallback engine: attribute-driven, not period_id-driven ──

SCHOOL = {"student_count": 100, "indoor_venues": ["Main Hall"]}


def make_period(period_id, is_outdoor, intensity="Moderate", activity_type="Class", duration_mins=30, name=None):
    return {
        "period_id": period_id,
        "name": name or f"Period {period_id}",
        "time": "09:00 AM - 09:30 AM",
        "duration_mins": duration_mins,
        "current_venue": "Playground",
        "is_outdoor": is_outdoor,
        "intensity": intensity,
        "activity_type": activity_type,
    }


@pytest.fixture
def service():
    # No AWS credentials in the test environment, so this always exercises
    # the deterministic fallback engine directly via its public entrypoint.
    return BedrockService()


def test_indoor_period_is_left_unchanged(service):
    schedule = [make_period(1, is_outdoor=False, intensity="Sedentary")]
    result = service._generate_resilient_optimized_schedule(schedule, current_aqi=400, school_info=SCHOOL, evaluation={})
    assert result["optimized_schedule"][0]["status"] == "NORMAL_INDOOR"
    assert result["summary"]["modifications_count"] == 0


def test_high_intensity_outdoor_relocates_above_its_threshold(service):
    schedule = [make_period(1, is_outdoor=True, intensity="High")]
    below = service._generate_resilient_optimized_schedule(schedule, current_aqi=249, school_info=SCHOOL, evaluation={})
    above = service._generate_resilient_optimized_schedule(schedule, current_aqi=250, school_info=SCHOOL, evaluation={})
    assert below["optimized_schedule"][0]["status"] == "UNCHANGED"
    assert above["optimized_schedule"][0]["status"] == "RELOCATED_INDOORS"


def test_extreme_intensity_has_a_higher_safety_threshold_than_high(service):
    # Extreme-exertion activities should only relocate at a higher AQI than
    # high-intensity ones - this is the whole point of being intensity-driven.
    schedule = [make_period(1, is_outdoor=True, intensity="Extreme")]
    at_high_threshold = service._generate_resilient_optimized_schedule(
        schedule, current_aqi=260, school_info=SCHOOL, evaluation={}
    )
    assert at_high_threshold["optimized_schedule"][0]["status"] == "UNCHANGED"


def test_transit_period_always_gets_staggered_regardless_of_aqi(service):
    schedule = [make_period(1, is_outdoor=True, intensity="Moderate", activity_type="Transit & Staging")]
    clean_air = service._generate_resilient_optimized_schedule(schedule, current_aqi=10, school_info=SCHOOL, evaluation={})
    assert clean_air["optimized_schedule"][0]["status"] == "SAFETY_PROTOCOL_ENGAGED"
    assert clean_air["summary"]["modifications_count"] == 1


def test_works_for_a_schedule_with_unfamiliar_period_ids(service):
    # The old implementation keyed hazard logic on period_id in {1, 3, 5, 7};
    # this schedule uses entirely different ids and must still work correctly.
    schedule = [
        make_period(101, is_outdoor=True, intensity="High", name="Afternoon Drill"),
        make_period(202, is_outdoor=False, intensity="Sedentary", name="Library Hour"),
    ]
    result = service._generate_resilient_optimized_schedule(schedule, current_aqi=300, school_info=SCHOOL, evaluation={})
    statuses = {p["name"]: p["status"] for p in result["optimized_schedule"]}
    assert statuses["Afternoon Drill"] == "RELOCATED_INDOORS"
    assert statuses["Library Hour"] == "NORMAL_INDOOR"


def test_fallback_output_is_honestly_labeled_not_live(service):
    schedule = [make_period(1, is_outdoor=True, intensity="High")]
    result = service._generate_resilient_optimized_schedule(schedule, current_aqi=300, school_info=SCHOOL, evaluation={})
    assert result["live_ai"] is False
    assert "fallback" in result["engine"].lower() or "deterministic" in result["engine"].lower()
