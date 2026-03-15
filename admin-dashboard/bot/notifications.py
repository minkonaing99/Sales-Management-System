import logging

from creds import CHANNEL_ID
from db import (
    escape_markdown,
    format_date_readable,
    get_bangkok_today,
    get_expiring_soon_products,
    get_renewals_due_soon,
    parse_date_safe,
)
from telegram.ext import ContextTypes

logger = logging.getLogger(__name__)

EXPIRING_WINDOW_DAYS = 2


def process_expiring_data(data, max_days=EXPIRING_WINDOW_DAYS):
    today = get_bangkok_today()
    soon = []

    for row in data:
        try:
            expired_date = parse_date_safe(row["expired_date"])
            days_left = (expired_date - today).days
            if 0 <= days_left <= max_days:
                row["days_left"] = days_left
                row["expired_date"] = expired_date.strftime("%Y-%m-%d")
                soon.append(row)
        except Exception as e:
            logger.error(f"Error parsing expiring row: {row} -> {e}")
            continue

    return sorted(soon, key=lambda x: x["days_left"])


def format_expiring_message(items, title="Expiring Products"):
    if not items:
        return [f"No {title.lower()} within {EXPIRING_WINDOW_DAYS} days."]

    messages = []
    products_per_message = 15

    for i in range(0, len(items), products_per_message):
        batch = items[i : i + products_per_message]
        message_number = (i // products_per_message) + 1
        current_message = f"*{title}:*\n\n" if message_number == 1 else f"*{title} (Part {message_number}):*\n\n"

        for idx, item in enumerate(batch, i + 1):
            days_text = "Today!" if item["days_left"] == 0 else f"{item['days_left']} day(s)"
            purchased_date = format_date_readable(item["purchased_date"])
            expired_date = format_date_readable(item["expired_date"])
            item_text = (
                f"{idx}. Product: {escape_markdown(item['sale_product'])}\n"
                f"Customer: `{escape_markdown(item['customer'])}`\n"
                f"Email: `{escape_markdown(item['email'] or '-')}`\n"
                f"{purchased_date} to {expired_date}\n"
                f"Ends in: {days_text}\n\n"
            )
            current_message += item_text
        messages.append(current_message.strip())

    return messages


def format_renewals_message(renewals):
    if not renewals:
        return ["No renewals due within 2 days."]

    messages = []
    products_per_message = 15

    for i in range(0, len(renewals), products_per_message):
        batch = renewals[i : i + products_per_message]
        message_number = (i // products_per_message) + 1
        current_message = (
            "*Renewals Due Soon:*\n\n"
            if message_number == 1
            else f"*Renewals Due Soon (Part {message_number}):*\n\n"
        )

        for idx, item in enumerate(batch, i + 1):
            days_text = "Today!" if item["days_left"] == 0 else f"{item['days_left']} day(s)"
            purchased_date = format_date_readable(item["purchased_date"])
            expired_date = format_date_readable(item["expired_date"])
            next_due = format_date_readable(item["next_due"])
            item_text = (
                f"{idx}. Product: {escape_markdown(item['sale_product'])}\n"
                f"Customer: `{escape_markdown(item['customer'])}`\n"
                f"Email: `{escape_markdown(item['email'] or '-')}`\n"
                f"{purchased_date} to {expired_date}\n"
                f"Next Due: {next_due}\n"
                f"Due in: {days_text}\n\n"
            )
            current_message += item_text
        messages.append(current_message.strip())

    return messages


async def auto_send_daily_notifications(context: ContextTypes.DEFAULT_TYPE):
    try:
        expiring_data = get_expiring_soon_products()
        expiring_soon = process_expiring_data(expiring_data)
        renewals = get_renewals_due_soon()

        for message in format_expiring_message(expiring_soon):
            await context.bot.send_message(chat_id=CHANNEL_ID, text=message, parse_mode="Markdown")

        for message in format_renewals_message(renewals):
            await context.bot.send_message(chat_id=CHANNEL_ID, text=message, parse_mode="Markdown")
    except Exception as e:
        logger.error(f"Error in auto_send_daily_notifications: {e}")
