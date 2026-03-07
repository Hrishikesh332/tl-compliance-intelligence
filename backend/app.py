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


def wake_up_app():
    try:
        app_url = os.getenv('APP_URL', 'http://localhost:5000')
        health_url = f"{app_url}/health"
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


scheduler = BackgroundScheduler()
scheduler.add_job(wake_up_app, "interval", minutes=9)
scheduler.start()
atexit.register(lambda: scheduler.shutdown(wait=True))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(
        host="0.0.0.0",
        port=port,
        debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true",
    )
