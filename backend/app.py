import os
import atexit
import logging
from datetime import datetime

import requests
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler

load_dotenv()

from app import create_app

app = create_app()
logger = logging.getLogger(__name__)

# Only run in-process wake pings when deployed (APP_URL set to a real backend URL).
# On Render free tier, external pings are still required to prevent spin-down.
def _should_run_wake_ping() -> bool:
    url = (os.getenv("APP_URL") or "").strip().lower()
    if not url:
        return False
    return not url.startswith("http://localhost") and "localhost" not in url


def wake_up_app():
    """Ping our own /health when app is already running. Does NOT prevent Render sleep:
    when the instance is spun down, this scheduler is suspended. Use an external
    cron (e.g. UptimeRobot, cron-job.org) to hit your Render URL every 9 min."""
    try:
        app_url = os.getenv("APP_URL", "http://localhost:5000")
        health_url = f"{app_url.rstrip('/')}/health"
        response = requests.get(health_url, timeout=9)
        if response.status_code == 200:
            logger.info("Successfully pinged %s at %s", health_url, datetime.now())
        else:
            logger.warning(
                "Failed to ping %s (status code: %s) at %s",
                health_url, response.status_code, datetime.now(),
            )
    except Exception as e:
        logger.exception("Error pinging app: %s", e)


scheduler = BackgroundScheduler(timezone="UTC")
if _should_run_wake_ping():
    scheduler.add_job(
        wake_up_app,
        "interval",
        minutes=9,
        id="wake_up_app",
        misfire_grace_time=120,
        coalesce=True,
    )
    scheduler.start()
    atexit.register(lambda: scheduler.shutdown(wait=True))
else:
    logger.debug("Wake ping disabled (APP_URL not set or is localhost)")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(
        host="0.0.0.0",
        port=port,
        debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true",
    )
