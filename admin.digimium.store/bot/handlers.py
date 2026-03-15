import logging
from datetime import datetime

from auth import check_user_auth, save_authenticated_user, validate_credentials
from db import (
    fetch_product_details,
    fetch_retail_products,
    fetch_wholesale_products,
    get_bangkok_now,
    get_expiring_soon_products,
    get_monthly_summary,
    get_renewals_due_soon,
    get_summary_data,
    get_today_sales_details,
    save_sale,
)
from notifications import format_expiring_message, format_renewals_message, process_expiring_data
from telegram import BotCommand, InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

logger = logging.getLogger(__name__)


async def auth_required(update: Update, context: ContextTypes.DEFAULT_TYPE):
    telegram_id = update.effective_user.id
    if not check_user_auth(telegram_id):
        if not context.user_data.get("login_flow"):
            await start_login_flow(update, context)
            return False
    return True


async def start_login_flow(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["login_flow"] = True
    context.user_data["login_step"] = "username"

    target = update.message
    if target is None and update.callback_query:
        target = update.callback_query.message

    if target:
        await target.reply_text(
            "Authentication Required\n\nPlease enter your username:",
            parse_mode="Markdown",
        )


async def handle_login(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.user_data.get("login_flow"):
        return

    step = context.user_data.get("login_step")

    if step == "username":
        context.user_data["temp_username"] = update.message.text
        context.user_data["login_step"] = "password"
        await update.message.reply_text("Please enter your password:")
    elif step == "password":
        username = context.user_data.get("temp_username")
        password = update.message.text
        telegram_id = update.effective_user.id

        if validate_credentials(username, password):
            if save_authenticated_user(telegram_id, username):
                context.user_data.clear()
                await update.message.reply_text(
                    "Authentication successful!\n\nYou can now use all bot features.",
                    parse_mode="Markdown",
                )
                await show_main_menu(update, context)
            else:
                logger.error(f"Failed to save authenticated user to database for telegram_id={telegram_id}")
                await update.message.reply_text("Error saving authentication. Please try again.")
                context.user_data["login_step"] = "username"
                await update.message.reply_text("Please enter your username:")
        else:
            await update.message.reply_text(
                "Invalid credentials.\n\nPlease try again with correct username and password.",
                parse_mode="Markdown",
            )
            context.user_data["login_step"] = "username"
            await update.message.reply_text("Please enter your username:")


async def show_main_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("Add Retail Sale", callback_data="add_retail_sale")],
        [InlineKeyboardButton("Add Wholesale Sale", callback_data="add_wholesale_sale")],
        [InlineKeyboardButton("View Summary", callback_data="summary")],
        [InlineKeyboardButton("Expiring Products", callback_data="expiring")],
        [InlineKeyboardButton("Renewals Due Soon", callback_data="renewals")],
    ]
    await update.message.reply_text(
        "Welcome to Digimium Dashboard Bot!\nChoose an option:",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await auth_required(update, context):
        return
    await show_main_menu(update, context)


async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if not await auth_required(update, context):
        return

    try:
        if query.data == "add_retail_sale":
            products = fetch_retail_products()
            keyboard = []
            row = []
            for i, product in enumerate(products, 1):
                row.append(
                    InlineKeyboardButton(
                        product["product_name"],
                        callback_data=f"product_{product['product_id']}",
                    )
                )
                if i % 2 == 0:
                    keyboard.append(row)
                    row = []
            if row:
                keyboard.append(row)
            await query.edit_message_text("Select a retail product:", reply_markup=InlineKeyboardMarkup(keyboard))

        elif query.data == "add_wholesale_sale":
            products = fetch_wholesale_products()
            keyboard = []
            row = []
            for i, product in enumerate(products, 1):
                row.append(
                    InlineKeyboardButton(
                        product["product_name"],
                        callback_data=f"product_{product['product_id']}",
                    )
                )
                if i % 2 == 0:
                    keyboard.append(row)
                    row = []
            if row:
                keyboard.append(row)
            await query.edit_message_text("Select a wholesale product:", reply_markup=InlineKeyboardMarkup(keyboard))

        elif query.data == "summary":
            today = get_bangkok_now().strftime("%Y-%m-%d")
            total_sales, total_profit = get_summary_data(today)
            today_sales_details = get_today_sales_details()

            if total_sales is not None:
                response = f"*Summary for {today}:*\n\n"
                response += f"Total Sales: {int(total_sales)} Ks\n"
                response += f"Total Profit: {int(total_profit)} Ks\n\n"
                if today_sales_details:
                    response += f"*Today's Sales ({len(today_sales_details)} orders):*\n\n"
                    for idx, sale in enumerate(today_sales_details, 1):
                        response += f"{idx}. {sale['sale_product']}\n"
                        response += f"Customer: {sale['customer']}\n"
                        response += f"Price: {int(sale['price'])} Ks\n\n"
                else:
                    response += "*Today's Sales:* No sales today"
            else:
                response = "Failed to fetch summary data."
            await query.edit_message_text(response, parse_mode="Markdown")

        elif query.data == "expiring":
            await expiring_handler(update, context)
        elif query.data == "renewals":
            await renewals_handler(update, context)
        elif query.data.startswith("product_"):
            product_id = query.data.replace("product_", "")
            product = fetch_product_details(product_id)
            if product:
                context.user_data.update({"flow": "add_sale", "product": product, "awaiting": True})
                if product.get("product_type") == "wholesale":
                    input_format = (
                        "Please enter the following (one per line):\n"
                        "Customer Name\n"
                        "Email\n"
                        "Manager\n"
                        "Quantity\n"
                        "[Optional] Custom Price per unit"
                    )
                else:
                    input_format = (
                        "Please enter the following (one per line):\n"
                        "Customer Name\n"
                        "Email\n"
                        "Manager\n"
                        "[Optional] Custom Price"
                    )

                await query.edit_message_text(
                    f"*Product:* {product['product_name']}\n"
                    f"*Type:* {product.get('product_type', 'retail').title()}\n"
                    f"*Duration:* {product['duration']} months\n"
                    f"*Wholesale:* {product['wholesale']} Ks\n"
                    f"*Retail:* {product['retail']} Ks\n\n"
                    f"{input_format}",
                    parse_mode="Markdown",
                )
            else:
                await query.edit_message_text("Product not found.")
    except Exception as e:
        logger.error(f"Error in button_handler: {e}")
        await query.edit_message_text("An error occurred. Please try again.")


async def text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if context.user_data.get("login_flow"):
        await handle_login(update, context)
        return

    if not context.user_data.get("awaiting"):
        return

    if not await auth_required(update, context):
        return

    try:
        lines = [l.strip() for l in update.message.text.splitlines() if l.strip()]
        product = context.user_data["product"]
        product_type = product.get("product_type", "retail")

        if product_type == "wholesale":
            if len(lines) < 4:
                await update.message.reply_text(
                    "Invalid input for wholesale. Use: Customer, Email, Manager, Quantity, [Optional] Custom Price per unit"
                )
                return
            customer, email, manager = lines[0], lines[1], lines[2]
            try:
                quantity = int(lines[3])
                if quantity <= 0:
                    await update.message.reply_text("Quantity must be a positive number. Please try again:")
                    return
            except ValueError:
                await update.message.reply_text("Invalid quantity format. Please enter a number:")
                return

            price_per_unit = float(lines[4]) if len(lines) >= 5 and lines[4].replace(".", "").isdigit() else float(
                product["retail"]
            )
            total_price = price_per_unit * quantity
            profit_per_unit = price_per_unit - float(product["wholesale"])
            total_profit = profit_per_unit * quantity
            note = f"Quantity: {quantity} units @ {price_per_unit} Ks each"
            quantity_for_db = quantity
        else:
            if len(lines) < 3:
                await update.message.reply_text(
                    "Invalid input for retail. Use: Customer, Email, Manager, [Optional] Custom Price"
                )
                return
            customer, email, manager = lines[0], lines[1], lines[2]
            total_price = float(lines[3]) if len(lines) >= 4 and lines[3].replace(".", "").isdigit() else float(
                product["retail"]
            )
            total_profit = total_price - float(product["wholesale"])
            note = ""
            quantity_for_db = 1

        today = get_bangkok_now()
        data = {
            "sale_product": product["product_name"],
            "duration": product["duration"],
            "renew": product["renew"],
            "customer": customer,
            "email": email,
            "purchased_date": today.strftime("%Y-%m-%d"),
            "expired_date": None,
            "manager": manager,
            "note": note,
            "price": total_price,
            "profit": total_profit,
            "product_type": product_type,
            "quantity": quantity_for_db,
        }

        if save_sale(data):
            if product_type == "wholesale":
                await update.message.reply_text(
                    f"Wholesale sale saved successfully!\nQuantity: {quantity} units\nTotal: {total_price} Ks"
                )
            else:
                await update.message.reply_text("Sale saved successfully!")
        else:
            await update.message.reply_text("Failed to save sale.")

        context.user_data.clear()
    except Exception as e:
        logger.error(f"Error in text_handler: {e}")
        await update.message.reply_text("An error occurred. Please try again.")


async def expiring_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await auth_required(update, context):
        return
    try:
        data = get_expiring_soon_products()
        soon = process_expiring_data(data)
        if not soon:
            response = "No products expiring within 2 days."
            if update.callback_query:
                await update.callback_query.edit_message_text(response)
            else:
                await update.message.reply_text(response)
            return

        messages = format_expiring_message(soon)
        if update.callback_query:
            await update.callback_query.edit_message_text(messages[0], parse_mode="Markdown")
            for message in messages[1:]:
                await update.callback_query.message.reply_text(message, parse_mode="Markdown")
        else:
            for message in messages:
                await update.message.reply_text(message, parse_mode="Markdown")
    except Exception as e:
        logger.error(f"Error in expiring_handler: {e}")
        error_msg = "An error occurred while fetching expiring products."
        if update.callback_query:
            await update.callback_query.edit_message_text(error_msg)
        else:
            await update.message.reply_text(error_msg)


async def renewals_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await auth_required(update, context):
        return
    try:
        renewals = get_renewals_due_soon()
        if not renewals:
            response = "No subscriptions due for renewal within 2 days."
            if update.callback_query:
                await update.callback_query.edit_message_text(response)
            else:
                await update.message.reply_text(response)
            return

        messages = format_renewals_message(renewals)
        if update.callback_query:
            await update.callback_query.edit_message_text(messages[0], parse_mode="Markdown")
            for message in messages[1:]:
                await update.callback_query.message.reply_text(message, parse_mode="Markdown")
        else:
            for message in messages:
                await update.message.reply_text(message, parse_mode="Markdown")
    except Exception as e:
        logger.error(f"Error in renewals_handler: {e}")
        error_msg = "An error occurred while fetching renewals."
        if update.callback_query:
            await update.callback_query.edit_message_text(error_msg)
        else:
            await update.message.reply_text(error_msg)


async def summary_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await auth_required(update, context):
        return

    try:
        if context.args:
            date_str = context.args[0]
            datetime.strptime(date_str, "%Y-%m-%d")
        else:
            date_str = get_bangkok_now().strftime("%Y-%m-%d")
    except ValueError:
        await update.message.reply_text("Invalid date format. Use `/summary YYYY-MM-DD`", parse_mode="Markdown")
        return

    try:
        daily_sales, daily_profit = get_summary_data(date_str)
        monthly_sales, monthly_profit, monthly_count = get_monthly_summary()
        today_sales_details = get_today_sales_details()

        if daily_sales is None:
            await update.message.reply_text("Failed to fetch summary.")
            return

        response = f"*Sales Summary for {date_str}*\n\n"
        response += "*Daily Summary:*\n"
        response += f"Sales: {int(daily_sales)} Ks\n"
        response += f"Profit: {int(daily_profit)} Ks\n\n"
        current_month = get_bangkok_now().strftime("%B %Y")
        response += f"*Monthly Summary ({current_month}):*\n"
        response += f"Total Sales: {int(monthly_sales)} Ks\n"
        response += f"Total Profit: {int(monthly_profit)} Ks\n"
        response += f"Total Orders: {monthly_count}\n\n"
        await update.message.reply_text(response, parse_mode="Markdown")

        if today_sales_details:
            batch_size = 10
            for i in range(0, len(today_sales_details), batch_size):
                batch = today_sales_details[i : i + batch_size]
                batch_response = f"*Today's Sales ({len(today_sales_details)} orders):*\n\n"
                for j, sale in enumerate(batch, i + 1):
                    batch_response += f"{j}. {sale['sale_product']}\n"
                    batch_response += f"Customer: {sale['customer']}\n"
                    batch_response += f"Price: {int(sale['price'])} Ks\n\n"
                await update.message.reply_text(batch_response, parse_mode="Markdown")
        else:
            await update.message.reply_text("*Today's Sales:* No sales today", parse_mode="Markdown")
    except Exception as e:
        logger.error(f"Error in summary_handler: {e}")
        await update.message.reply_text("An error occurred while fetching summary.")


async def set_commands(app):
    await app.bot.set_my_commands(
        [
            BotCommand("start", "Start the bot"),
            BotCommand("summary", "Get sales summary"),
            BotCommand("expiring", "Check expiring products"),
            BotCommand("renewals", "Check renewals due soon"),
        ]
    )
