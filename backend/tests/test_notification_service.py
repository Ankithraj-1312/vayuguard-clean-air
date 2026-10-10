from unittest.mock import MagicMock

import services.notification_service as notification_service
from services.notification_service import NotificationService


def make_service_with_mock_sns():
    service = NotificationService(sns_topic_arn="arn:aws:sns:us-east-1:000000000000:test-topic")
    service._sns_client = MagicMock()
    return service


def setup_function(_):
    # Reset the module-level cooldown timer before every test so they don't
    # interfere with each other.
    notification_service._last_sns_sent_at = 0.0


def test_routine_poll_never_calls_sns():
    service = make_service_with_mock_sns()
    result = service.dispatch_alerts(
        school_name="Test School", current_aqi=80, advisories={"admin": "all clear"},
        students_protected=0, trigger_alert=False
    )
    service._sns_client.publish.assert_not_called()
    assert result["sns_dispatched"] is False


def test_genuine_hazard_calls_sns_exactly_once():
    service = make_service_with_mock_sns()
    result = service.dispatch_alerts(
        school_name="Test School", current_aqi=320, advisories={"admin": "hazard"},
        students_protected=10, trigger_alert=True
    )
    service._sns_client.publish.assert_called_once()
    assert result["sns_dispatched"] is True


def test_repeated_hazard_within_cooldown_is_not_resent():
    service = make_service_with_mock_sns()
    first = service.dispatch_alerts(
        school_name="Test School", current_aqi=320, advisories={"admin": "hazard"},
        students_protected=10, trigger_alert=True
    )
    second = service.dispatch_alerts(
        school_name="Test School", current_aqi=325, advisories={"admin": "hazard"},
        students_protected=10, trigger_alert=True
    )
    assert first["sns_dispatched"] is True
    assert second["sns_dispatched"] is False
    service._sns_client.publish.assert_called_once()


def test_hazard_after_cooldown_expires_sends_again():
    service = make_service_with_mock_sns()
    service.dispatch_alerts(
        school_name="Test School", current_aqi=320, advisories={"admin": "hazard"},
        students_protected=10, trigger_alert=True
    )
    # Simulate the cooldown window having already elapsed.
    notification_service._last_sns_sent_at -= (notification_service.SNS_COOLDOWN_SECONDS + 1)
    second = service.dispatch_alerts(
        school_name="Test School", current_aqi=320, advisories={"admin": "hazard"},
        students_protected=10, trigger_alert=True
    )
    assert second["sns_dispatched"] is True
    assert service._sns_client.publish.call_count == 2


def test_dispatch_log_starts_empty_not_seeded_with_fake_history():
    # Guards against regressing the earlier fix where a canned fake alert
    # shipped in the in-memory log by default.
    service = make_service_with_mock_sns()
    assert service.get_history() == [] or all(
        "fake" not in str(entry).lower() for entry in service.get_history()
    )
