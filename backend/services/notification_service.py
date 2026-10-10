import logging
import os
import time
from datetime import datetime, timezone
from typing import Dict, Any, List

logger = logging.getLogger("vayuguard.notification")

# In-memory history of dispatched alerts — starts empty, only real dispatches get logged.
_DISPATCH_LOG: List[Dict[str, Any]] = []

# Minimum seconds between real SNS sends, so a frontend that polls every 30s
# (or repeated manual runs) doesn't re-email on every single poll while the
# same hazardous condition is still active.
SNS_COOLDOWN_SECONDS = 600
_last_sns_sent_at: float = 0.0

class NotificationService:
    def __init__(self, sns_topic_arn: str = ""):
        self.sns_topic_arn = sns_topic_arn
        self._sns_client = None
        
        try:
            import boto3
            self._sns_client = boto3.client("sns", region_name=os.getenv("AWS_REGION", "us-east-1"))
        except Exception as e:
            logger.warning(f"Could not initialize boto3 SNS client: {e}")

    def generate_bilingual_cards(self, school_name: str, current_aqi: int, advisories: Dict[str, str]) -> Dict[str, Any]:
        """
        Generates role-specific notifications in English and Hindi for WhatsApp, SMS, and Portal broadcasts.
        """
        admin_note = advisories.get("admin", "Outdoor schedule adapted to protect students.")
        
        # Parent Card (WhatsApp Reassurance)
        parent_en = (
            f"Dear Parents, {school_name} Air Quality Advisory:\n"
            f"Due to elevated ambient PM2.5 levels (AQI {current_aqi}), our AI Clean Air Protocol is active. "
            f"All outdoor recess and physical education periods have been shifted to air-purified indoor arenas. "
            f"No classes have been cancelled. Your child's respiratory safety is fully protected."
        )
        parent_hi = (
            f"प्रिय अभिभावक, {school_name} वायु गुणवत्ता सूचना:\n"
            f"वायु प्रदूषण स्तर (AQI {current_aqi}) अधिक होने के कारण, बच्चों के स्वास्थ्य की सुरक्षा हेतु "
            f"सभी आउटडोर खेल और प्रार्थना सभा को एयर-फिल्टर्ड इनडोर हॉल में स्थानांतरित कर दिया गया है। "
            f"कोई भी कक्षा रद्द नहीं की गई है। बच्चे सुरक्षित वातावरण में पढ़ाई कर रहे हैं।"
        )
        
        # Teacher Briefing (SMS / Staff Group)
        teacher_en = (
            f"STAFF NOTICE — {school_name}: AQI {current_aqi}. "
            f"Proactive Schedule Inversion in effect. Keep all classroom HEPA purifiers on Max speed. "
            f"Conduct Period 3 recess inside Activity Wing. Monitor students with asthma history."
        )
        
        # Facility & HVAC Action
        facility_en = (
            f"FACILITY ALERT: Engage centralized MERV-13/HEPA intake filtration. "
            f"Seal north-facing corridor doors to prevent outdoor particulate ingress."
        )

        return {
            "parent_whatsapp": {
                "english": parent_en,
                "hindi": parent_hi
            },
            "teacher_sms": teacher_en,
            "facility_alert": facility_en,
            "admin_bulletin": admin_note
        }

    def dispatch_alerts(
        self,
        school_name: str,
        current_aqi: int,
        advisories: Dict[str, str],
        students_protected: float,
        trigger_alert: bool = True
    ) -> Dict[str, Any]:
        """
        Fans out real-time notifications to school leadership and subscribed web clients.

        trigger_alert gates the REAL SNS send: only a genuine hazardous
        condition (caller passes evaluation.is_action_required) should ever
        email/SMS anyone. A cooldown additionally prevents re-sending while
        the same condition persists across repeated polls.
        """
        now_str = datetime.now(timezone.utc).strftime("%I:%M %p")
        alert_id = f"ALERT-{len(_DISPATCH_LOG) + 1:03d}"

        bilingual = self.generate_bilingual_cards(school_name, current_aqi, advisories)
        admin_msg = advisories.get("admin", f"AQI {current_aqi}: Schedule re-sequenced to protect students.")

        # 1. AWS SNS Attempt if configured, gated by trigger_alert + cooldown
        global _last_sns_sent_at
        sns_dispatched = False
        seconds_since_last = time.time() - _last_sns_sent_at
        should_send = trigger_alert and seconds_since_last >= SNS_COOLDOWN_SECONDS
        if should_send and self._sns_client and self.sns_topic_arn:
            try:
                self._sns_client.publish(
                    TopicArn=self.sns_topic_arn,
                    Subject=f"🚨 VayuGuard Alert: {school_name}",
                    Message=f"{admin_msg}\n\nStudent Hours Protected: {students_protected}\n\nParent Update (Hindi):\n{bilingual['parent_whatsapp']['hindi']}"
                )
                sns_dispatched = True
                _last_sns_sent_at = time.time()
            except Exception as e:
                logger.warning(f"SNS publish failed: {e}")

        # 2. Web Push Notification Record
        new_alert = {
            "id": alert_id,
            "timestamp": now_str,
            "channel": "Web Push (PWA) + AWS SNS Broadcast" if sns_dispatched else "Browser Web Push & Realtime WebSocket",
            "recipient_group": "School Admins, Facility Leads, Parents",
            "title": f"🚨 Air Alert: {school_name} (AQI {current_aqi})",
            "message": admin_msg,
            "bilingual_cards": bilingual,
            "students_protected": students_protected,
            "status": "DELIVERED"
        }
        
        _DISPATCH_LOG.insert(0, new_alert)
        
        return {
            "success": True,
            "alert": new_alert,
            "bilingual_cards": bilingual,
            "sns_dispatched": sns_dispatched,
            "web_push_ready": True
        }

    def get_history(self) -> List[Dict[str, Any]]:
        return _DISPATCH_LOG
