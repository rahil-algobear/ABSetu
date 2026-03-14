"""
SMS Helper utilities for OTP and SMS operations
"""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class SMSHelper:
    """
    SMS Helper class for sending OTP and SMS messages.
    Uses singleton pattern for efficient resource management.

    In development mode (USE_LIVE_SMS=False), OTPs are printed to console.
    In production mode (USE_LIVE_SMS=True), OTPs are sent via Twilio.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SMSHelper, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._initialized = True

    def _ensure_initialized(self):
        """Lazy initialization of configuration and Twilio client."""
        if not hasattr(self, "use_live_sms"):
            self.use_live_sms = settings.USE_LIVE_SMS
            self.product_name = settings.PRODUCT_NAME

            if self.use_live_sms:
                try:
                    from twilio.rest import Client

                    self.twilio_client = Client(
                        settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN
                    )
                    self.from_number = settings.TWILIO_PHONE_NUMBER
                    logger.debug("SMSHelper initialized with live SMS enabled")
                except Exception as e:
                    logger.error(f"Failed to initialize Twilio: {e}")
                    self.use_live_sms = False
            else:
                logger.debug(
                    "SMSHelper initialized in development mode (console output)"
                )

    def send_otp(
        self, country_code: str, mobile_number: str, otp_code: str
    ) -> bool:
        """
        Send OTP via SMS or print to console in development mode.

        Returns:
            True if message was sent successfully (or in dev mode), False otherwise
        """
        self._ensure_initialized()

        to_number = f"{country_code}{mobile_number}"
        message = f"{otp_code} is your OTP code for {self.product_name}"

        if not self.use_live_sms:
            logger.info(f"[DEV] OTP for {to_number}: {otp_code}")
            return True

        # Production mode: send via Twilio
        try:
            logger.info(f"Sending OTP via SMS to {to_number}")
            self.twilio_client.messages.create(
                body=message, from_=self.from_number, to=to_number
            )
            return True
        except Exception as e:
            logger.error(f"Twilio error sending to {to_number}: {e}")
            logger.warning(f"[FALLBACK] OTP for {to_number}: {otp_code}")
            return False
