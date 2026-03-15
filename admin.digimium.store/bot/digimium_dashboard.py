import logging
from datetime import time as dtime

from creds import BOT_TOKEN
from db import BANGKOK_TZ, is_db_ready
from handlers import (
    button_handler,
    expiring_handler,
    renewals_handler,
    set_commands,
    start,
    summary_handler,
    text_handler,
)
from notifications import auto_send_daily_notifications
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    MessageHandler,
    filters,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def main():
    if not is_db_ready():
        logger.error("Database pool not initialized. Exiting.")
        return

    app = ApplicationBuilder().token(BOT_TOKEN).post_init(set_commands).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("summary", summary_handler))
    app.add_handler(CommandHandler("expiring", expiring_handler))
    app.add_handler(CommandHandler("renewals", renewals_handler))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_handler))

    app.job_queue.run_daily(auto_send_daily_notifications, time=dtime(hour=6, minute=0, tzinfo=BANGKOK_TZ))
    logger.info("Bot running with auto-scheduler...")
    app.run_polling()


if __name__ == "__main__":
    main()
