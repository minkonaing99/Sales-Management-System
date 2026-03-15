import asyncio
import nest_asyncio
import logging
from creds import BOT_TOKEN, DB_CONFIG, CHANNEL_ID, BOT_PASSWORD
from mysql.connector.pooling import MySQLConnectionPool
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo
from telegram import (
    Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand
)
from telegram.ext import (
    ApplicationBuilder, CommandHandler, CallbackQueryHandler,
    MessageHandler, ContextTypes, filters
)


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

nest_asyncio.apply()

# Global constants
BANGKOK_TZ = ZoneInfo("Asia/Bangkok")
BATCH_SIZE = 10



# Database connection pool
try:
    db_pool = MySQLConnectionPool(
        pool_name="digimium_pool",
        pool_size=10,
        pool_reset_session=True,
        **DB_CONFIG
    )
    logger.info("Database connection pool created successfully")
except Exception as e:
    logger.error(f"Failed to create database pool: {e}")
    db_pool = None

# Utility functions
def get_bangkok_now():
    """Get current time in Bangkok timezone"""
    return datetime.now(BANGKOK_TZ)

def get_bangkok_today():
    """Get current date in Bangkok timezone"""
    return get_bangkok_now().date()

def parse_date_safe(date_value):
    """Safely parse date from various formats"""
    if isinstance(date_value, str):
        return datetime.strptime(date_value, "%Y-%m-%d").date()
    elif isinstance(date_value, datetime):
        return date_value.date()
    elif isinstance(date_value, date):
        return date_value
    else:
        raise ValueError(f"Unsupported date format: {type(date_value)}")

def format_date_readable(date_value):
    """Format date to readable format (dd MMM yyyy)"""
    if isinstance(date_value, str):
        date_obj = datetime.strptime(date_value, '%Y-%m-%d')
    else:
        date_obj = date_value
    return date_obj.strftime('%d %b %Y')

def escape_markdown(text):
    """Escape text for Markdown formatting"""
    return str(text).replace('_', '\\_').replace('*', '\\*').replace('[', '\\[')

def get_db_connection():
    """Get database connection from pool with error handling"""
    if not db_pool:
        raise RuntimeError("Database pool not initialized")
    return db_pool.get_connection()

def execute_query(query, params=None, fetch_type='all', dictionary=False):
    """Execute database query with proper error handling and connection management"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=dictionary, buffered=True)
        
        if params:
            cursor.execute(query, params)
        else:
            cursor.execute(query)
        
        # Commit the transaction for non-select queries
        if fetch_type != 'all' and fetch_type != 'one':
            conn.commit()
        
        if fetch_type == 'all':
            result = cursor.fetchall()
        elif fetch_type == 'one':
            result = cursor.fetchone()
        else:
            result = None
            
        return result
    except Exception as e:
        logger.error(f"Database query error: {e}")
        logger.error(f"Query: {query}")
        if params:
            logger.error(f"Params: {params}")
        # Rollback on error
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

def fetch_products_by_type(product_type=None):
    """Fetch products with optional type filter - optimized version"""
    if product_type == 'retail':
        query = """
            SELECT 
                CONCAT('R-', product_id) as product_id, 
                product_name, 
                duration, 
                wholesale, 
                retail,
                'retail' as product_type
            FROM products_catalog 
            ORDER BY product_name
        """
    elif product_type == 'wholesale':
        query = """
            SELECT 
                CONCAT('WS-', product_id) as product_id, 
                product_name, 
                duration, 
                wholesale, 
                retail,
                'wholesale' as product_type
            FROM ws_products_catalog
            ORDER BY product_name
        """
    else:
        # Fetch all products
        query = """
            SELECT 
                CONCAT('R-', product_id) as product_id, 
                CONCAT('Retail - ', product_name) as product_name, 
                duration, 
                wholesale, 
                retail,
                'retail' as product_type
            FROM products_catalog 
            
            UNION ALL
            
            SELECT 
                CONCAT('WS-', product_id) as product_id, 
                CONCAT('Wholesale - ', product_name) as product_name, 
                duration, 
                wholesale, 
                retail,
                'wholesale' as product_type
            FROM ws_products_catalog
            
            ORDER BY product_name
        """
    
    return execute_query(query, dictionary=True)

def fetch_products():
    """Fetch all products from both retail and wholesale products_catalog tables"""
    return fetch_products_by_type()

def fetch_retail_products():
    """Fetch only retail products from products_catalog table"""
    return fetch_products_by_type('retail')

def fetch_wholesale_products():
    """Fetch only wholesale products from ws_products_catalog table"""
    return fetch_products_by_type('wholesale')

def fetch_product_details(product_id):
    """Fetch product details by ID from either retail or wholesale table"""
    if product_id.startswith('R-'):
        actual_id = product_id.replace('R-', '')
        query = "SELECT *, 'retail' as product_type FROM products_catalog WHERE product_id = %s"
    elif product_id.startswith('WS-'):
        actual_id = product_id.replace('WS-', '')
        query = "SELECT *, 'wholesale' as product_type FROM ws_products_catalog WHERE product_id = %s"
    else:
        # Fallback to retail table for backward compatibility
        actual_id = product_id
        query = "SELECT *, 'retail' as product_type FROM products_catalog WHERE product_id = %s"
    
    return execute_query(query, (actual_id,), fetch_type='one', dictionary=True)

def get_summary_data(date_str):
    """Get summary data for a specific date from both retail and wholesale tables"""
    query = """
        SELECT SUM(price), SUM(profit)
        FROM (
            SELECT price, profit FROM sale_overview WHERE purchased_date = %s
            UNION ALL
            SELECT price, profit FROM ws_sale_overview WHERE purchased_date = %s
        ) combined_sales
    """
    
    try:
        result = execute_query(query, (date_str, date_str), fetch_type='one')
        
        if result and result[0] is not None:
            total_sales = float(result[0])
            total_profit = float(result[1] or 0)
            return total_sales, total_profit
        return 0, 0
        
    except Exception as e:
        logger.error(f"Error in get_summary_data: {e}")
        return None, None

def get_monthly_summary():
    """Get monthly summary data from both retail and wholesale tables"""
    current_month = get_bangkok_now().strftime('%Y-%m')
    query = """
        SELECT SUM(price), SUM(profit), COUNT(*)
        FROM (
            SELECT price, profit FROM sale_overview WHERE purchased_date LIKE %s
            UNION ALL
            SELECT price, profit FROM ws_sale_overview WHERE purchased_date LIKE %s
        ) combined_sales
    """
    
    try:
        result = execute_query(query, (f"{current_month}%", f"{current_month}%"), fetch_type='one')
        
        if result and result[0] is not None:
            monthly_sales = float(result[0])
            monthly_profit = float(result[1] or 0)
            monthly_count = int(result[2] or 0)
        else:
            monthly_sales = 0
            monthly_profit = 0
            monthly_count = 0

        return monthly_sales, monthly_profit, monthly_count

    except Exception as e:
        logger.error(f"Error in get_monthly_summary: {e}")
        return 0, 0, 0

def get_today_sales_details():
    """Get detailed sales for today from both retail and wholesale tables"""
    today = get_bangkok_now().strftime('%Y-%m-%d')
    query = """
        SELECT 
            CONCAT('Retail - ', sale_product) as sale_product, 
            customer, 
            price, 
            profit, 
            manager,
            'retail' as sale_type
        FROM sale_overview
        WHERE purchased_date = %s
        
        UNION ALL
        
        SELECT 
            CONCAT('Wholesale - ', sale_product) as sale_product, 
            customer, 
            price, 
            profit, 
            manager,
            'wholesale' as sale_type
        FROM ws_sale_overview
        WHERE purchased_date = %s
        
        ORDER BY price DESC
    """
    
    try:
        return execute_query(query, (today, today), dictionary=True)
    except Exception as e:
        logger.error(f"Error in get_today_sales_details: {e}")
        return []

# Authentication functions
def check_user_auth(telegram_id):
    """Check if user is authenticated"""
    query = "SELECT id FROM bot_users WHERE telegram_id = %s AND is_active = TRUE"
    try:
        result = execute_query(query, (telegram_id,), fetch_type='one')
        return result is not None
    except Exception as e:
        logger.error(f"Error checking user auth: {e}")
        return False

def save_authenticated_user(telegram_id, username):
    """Save authenticated user to database"""
    query = """
        INSERT INTO bot_users (telegram_id, username) 
        VALUES (%s, %s) 
        ON DUPLICATE KEY UPDATE 
        username = VALUES(username), 
        last_login = CURRENT_TIMESTAMP
    """
    try:
        execute_query(query, (telegram_id, username), fetch_type=None)
        return True
    except Exception as e:
        logger.error(f"Error saving authenticated user: {e}")
        return False

def validate_credentials(username, password):
    """Validate username and password against bot credentials"""
    # Check if password matches the bot password from creds.py
    if password == BOT_PASSWORD:
        return True
    logger.warning(f"Invalid password attempt for username: {username}")
    return False



def get_expiring_soon_products():
    """Get products that are expiring soon from both retail and wholesale tables"""
    query = """
        SELECT 
            CONCAT('Retail - ', sale_product) as sale_product, 
            customer, 
            email, 
            purchased_date, 
            expired_date,
            'retail' as sale_type
        FROM sale_overview
        WHERE expired_date IS NOT NULL
        
        UNION ALL
        
        SELECT 
            CONCAT('Wholesale - ', sale_product) as sale_product, 
            customer, 
            email, 
            purchased_date, 
            expired_date,
            'wholesale' as sale_type
        FROM ws_sale_overview
        WHERE expired_date IS NOT NULL
        
        ORDER BY expired_date ASC
    """
    
    try:
        return execute_query(query, dictionary=True)
    except Exception as e:
        logger.error(f"Error in get_expiring_soon_products: {e}")
        return []

def calculate_expired_date(purchased_date, duration_months):
    """Calculate expired date based on purchase date and duration"""
    try:
        if isinstance(purchased_date, str):
            purchased_date = datetime.strptime(purchased_date, '%Y-%m-%d')
        
        # Add months properly (handles end-of-month cases)
        year = purchased_date.year
        month = purchased_date.month + int(duration_months)
        day = purchased_date.day
        
        # Handle year rollover
        while month > 12:
            year += 1
            month -= 12
        
        # Handle end-of-month cases (e.g., Jan 31 + 1 month = Feb 28/29)
        try:
            expired_date = purchased_date.replace(year=year, month=month, day=day)
        except ValueError:
            # If the day doesn't exist in the target month, use the last day of that month
            if month == 12:
                next_month = datetime(year + 1, 1, 1)
            else:
                next_month = datetime(year, month + 1, 1)
            expired_date = next_month - timedelta(days=1)
        
        return expired_date.strftime('%Y-%m-%d')
    except Exception as e:
        logger.error(f"Error calculating expired date: {e}")
        return None

def save_sale(data):
    """Save a new sale to either sale_overview or ws_sale_overview table based on product type"""
    try:
        # Calculate expired_date if not provided
        if not data.get('expired_date'):
            expired_date = calculate_expired_date(data['purchased_date'], data['duration'])
            if not expired_date:
                return False
            data['expired_date'] = expired_date
        
        # Determine which table to use based on product type
        table_name = "ws_sale_overview" if data.get('product_type') == 'wholesale' else "sale_overview"
        
        if data.get('product_type') == 'wholesale':
            # Use quantity directly from data
            quantity = data.get('quantity', 1)
            
            query = f"""
                INSERT INTO {table_name}
                (sale_product, duration, quantity, renew, customer, email, purchased_date, expired_date, manager, note, price, profit)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            params = (
                data['sale_product'], data['duration'], quantity, data['renew'], data['customer'],
                data['email'], data['purchased_date'], data['expired_date'],
                data['manager'], data['note'], data['price'], data['profit']
            )
        else:
            # Retail sales don't have quantity field
            query = f"""
                INSERT INTO {table_name}
                (sale_product, duration, renew, customer, email, purchased_date, expired_date, manager, note, price, profit)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            params = (
                data['sale_product'], data['duration'], data['renew'], data['customer'],
                data['email'], data['purchased_date'], data['expired_date'],
                data['manager'], data['note'], data['price'], data['profit']
            )
        
        execute_query(query, params, fetch_type=None)
        return True
        
    except Exception as e:
        logger.error(f"Error in save_sale: {e}")
        return False

def get_renewals_due_soon():
    """Get subscriptions that need renewal within 3 days from both retail and wholesale tables"""
    query = """
        SELECT 
            CONCAT('Retail - ', sale_product) as sale_product, 
            customer, 
            email, 
            purchased_date, 
            expired_date, 
            duration, 
            renew,
            'retail' as sale_type
        FROM sale_overview
        WHERE renew > 0 AND expired_date IS NOT NULL
        
        UNION ALL
        
        SELECT 
            CONCAT('Wholesale - ', sale_product) as sale_product, 
            customer, 
            email, 
            purchased_date, 
            expired_date, 
            duration, 
            renew,
            'wholesale' as sale_type
        FROM ws_sale_overview
        WHERE renew > 0 AND expired_date IS NOT NULL
        
        ORDER BY expired_date ASC
    """
    
    try:
        results = execute_query(query, dictionary=True)
        
        renewals = []
        today = get_bangkok_today()
        
        for row in results:
            try:
                # Parse dates
                purchased_date = parse_date_safe(row['purchased_date'])
                expired_date = parse_date_safe(row['expired_date'])
                
                renew_months = int(row['renew'])
                duration = int(row['duration'])
                
                # Skip if renew >= duration (no renewals needed)
                if renew_months >= duration:
                    continue
                
                # Calculate next due date
                next_due = calculate_next_due_date(purchased_date, renew_months, today)
                if not next_due:
                    continue
                
                # Check if next due is within 2 days
                days_left = (next_due - today).days
                if 0 <= days_left <= 2:
                    # Check if it's not already expiring soon
                    days_to_expiry = (expired_date - today).days
                    if days_to_expiry > 3:  # Not expiring soon
                        renewals.append({
                            'sale_product': row['sale_product'],
                            'customer': row['customer'],
                            'email': row['email'],
                            'purchased_date': purchased_date,
                            'expired_date': expired_date,
                            'next_due': next_due,
                            'days_left': days_left,
                            'renew': renew_months,
                            'sale_type': row['sale_type']
                        })
                        
            except Exception as e:
                logger.error(f"Error processing renewal row: {row} -> {e}")
                continue
        
        # Sort by days left, then by next due date
        renewals.sort(key=lambda x: (x['days_left'], x['next_due']))
        return renewals
        
    except Exception as e:
        logger.error(f"Error in get_renewals_due_soon: {e}")
        return []

def calculate_next_due_date(purchased_date, renew_months, base_date):
    """Calculate next due date for renewal"""
    try:
        # Start from purchase date
        due_date = purchased_date
        
        # Keep adding renew_months until we're at or after base_date
        while due_date < base_date:
            # Add months to due_date
            year = due_date.year
            month = due_date.month + renew_months
            day = due_date.day
            
            # Handle year rollover
            while month > 12:
                year += 1
                month -= 12
            
            # Handle end-of-month cases
            try:
                due_date = due_date.replace(year=year, month=month, day=day)
            except ValueError:
                # If the day doesn't exist in the target month, use the last day
                if month == 12:
                    next_month = datetime(year + 1, 1, 1)
                else:
                    next_month = datetime(year, month + 1, 1)
                due_date = (next_month - timedelta(days=1)).date()
        
        return due_date
        
    except Exception as e:
        logger.error(f"Error calculating next due date: {e}")
        return None

def process_expiring_data(data, max_days=1):
    """Process expiring data and filter by days left"""
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
    """Format expiring items into a message - 15 products per message"""
    if not items:
        return [f"No {title.lower()} within 2 days."]
    
    messages = []
    products_per_message = 15
    
    for i in range(0, len(items), products_per_message):
        batch = items[i:i + products_per_message]
        message_number = (i // products_per_message) + 1
        
        if message_number == 1:
            current_message = f"*{title}:*\n\n"
        else:
            current_message = f"*{title} (Part {message_number}):*\n\n"
        
        for idx, item in enumerate(batch, i + 1):
            days_text = "Today!" if item["days_left"] == 0 else f"{item['days_left']} day(s)"
            
            purchased_date = format_date_readable(item['purchased_date'])
            expired_date = format_date_readable(item['expired_date'])
            
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
    """Format renewals into a message - 15 products per message"""
    if not renewals:
        return ["No renewals due within 2 days."]
    
    messages = []
    products_per_message = 15
    
    for i in range(0, len(renewals), products_per_message):
        batch = renewals[i:i + products_per_message]
        message_number = (i // products_per_message) + 1
        
        if message_number == 1:
            current_message = "*Renewals Due Soon:*\n\n"
        else:
            current_message = f"*Renewals Due Soon (Part {message_number}):*\n\n"
        
        for idx, item in enumerate(batch, i + 1):
            days_text = "Today!" if item["days_left"] == 0 else f"{item['days_left']} day(s)"
            
            purchased_date = format_date_readable(item['purchased_date'])
            expired_date = format_date_readable(item['expired_date'])
            next_due = format_date_readable(item['next_due'])
            
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

async def send_batched_messages(context, messages, chat_id):
    """Send messages in batches to avoid Telegram limits"""
    for i in range(0, len(messages), BATCH_SIZE):
        batch = messages[i:i + BATCH_SIZE]
        message_text = "\n".join(batch)
        
        try:
            await context.bot.send_message(
                chat_id=chat_id, 
                text=message_text, 
                parse_mode="Markdown"
            )
        except Exception as e:
            logger.error(f"Failed to send batch starting at #{i+1}: {e}")

async def auto_send_daily_notifications(context: ContextTypes.DEFAULT_TYPE):
    """Automatically send daily notifications for expiring products and renewals"""
    try:
        # Get expiring products
        expiring_data = get_expiring_soon_products()
        expiring_soon = process_expiring_data(expiring_data)

        # Get renewals due soon
        renewals = get_renewals_due_soon()

        # Send expiring products notification
        expiring_messages = format_expiring_message(expiring_soon)
        for message in expiring_messages:
            await context.bot.send_message(
                chat_id=CHANNEL_ID, 
                text=message, 
                parse_mode="Markdown"
            )

        # Send renewals notification
        renewals_messages = format_renewals_message(renewals)
        for message in renewals_messages:
            await context.bot.send_message(
                chat_id=CHANNEL_ID, 
                text=message, 
                parse_mode="Markdown"
            )
        
    except Exception as e:
        logger.error(f"Error in auto_send_daily_notifications: {e}")

# === HANDLERS ===
async def auth_required(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Check if user is authenticated"""
    telegram_id = update.effective_user.id
    
    if not check_user_auth(telegram_id):
        # Check if user is in login flow
        if not context.user_data.get('login_flow'):
            await start_login_flow(update, context)
            return False
    return True

async def start_login_flow(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Start login process"""
    context.user_data['login_flow'] = True
    context.user_data['login_step'] = 'username'
    
    await update.message.reply_text(
        "🔐 *Authentication Required*\n\n"
        "Please enter your username:",
        parse_mode="Markdown"
    )

async def handle_login(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle login input"""
    if not context.user_data.get('login_flow'):
        return
    
    step = context.user_data.get('login_step')
    
    if step == 'username':
        context.user_data['temp_username'] = update.message.text
        context.user_data['login_step'] = 'password'
        await update.message.reply_text("Please enter your password:")
        
    elif step == 'password':
        username = context.user_data.get('temp_username')
        password = update.message.text
        telegram_id = update.effective_user.id
        
        # Validate against your user database
        if validate_credentials(username, password):
            if save_authenticated_user(telegram_id, username):
                # Clear login flow
                context.user_data.clear()
                
                await update.message.reply_text(
                    "✅ *Authentication successful!*\n\n"
                    "You can now use all bot features.",
                    parse_mode="Markdown"
                )
                
                # Show main menu
                await show_main_menu(update, context)
            else:
                logger.error(f"Failed to save authenticated user to database for telegram_id={telegram_id}")
                await update.message.reply_text("❌ Error saving authentication. Please try again.")
                context.user_data['login_step'] = 'username'
                await update.message.reply_text("Please enter your username:")
        else:
            await update.message.reply_text(
                "❌ *Invalid credentials*\n\n"
                "Please try again with correct username and password.",
                parse_mode="Markdown"
            )
            # Restart login flow
            context.user_data['login_step'] = 'username'
            await update.message.reply_text("Please enter your username:")

async def show_main_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show main menu after authentication"""
    keyboard = [
        [InlineKeyboardButton("Add Retail Sale", callback_data='add_retail_sale')],
        [InlineKeyboardButton("Add Wholesale Sale", callback_data='add_wholesale_sale')],
        [InlineKeyboardButton("View Summary", callback_data='summary')],
        [InlineKeyboardButton("Expiring Products", callback_data='expiring')],
        [InlineKeyboardButton("Renewals Due Soon", callback_data='renewals')]
    ]
    await update.message.reply_text(
        "Welcome to Digimium Dashboard Bot!\nChoose an option:", 
        reply_markup=InlineKeyboardMarkup(keyboard)
    )

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Start command handler"""
    # Check authentication first
    if not await auth_required(update, context):
        return
    
    await show_main_menu(update, context)

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle button callbacks"""
    query = update.callback_query
    await query.answer()

    # Check authentication first
    if not await auth_required(update, context):
        return

    try:
        if query.data == 'add_retail_sale':
            products = fetch_retail_products()
            keyboard = []
            row = []
            
            for i, product in enumerate(products, 1):
                row.append(InlineKeyboardButton(
                    product['product_name'], 
                    callback_data=f"product_{product['product_id']}"
                ))
                if i % 2 == 0:
                    keyboard.append(row)
                    row = []
            
            if row:
                keyboard.append(row)
            
            await query.edit_message_text(
                "Select a retail product:",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )

        elif query.data == 'add_wholesale_sale':
            products = fetch_wholesale_products()
            keyboard = []
            row = []
            
            for i, product in enumerate(products, 1):
                row.append(InlineKeyboardButton(
                    product['product_name'], 
                    callback_data=f"product_{product['product_id']}"
                ))
                if i % 2 == 0:
                    keyboard.append(row)
                    row = []
            
            if row:
                keyboard.append(row)
            
            await query.edit_message_text(
                "Select a wholesale product:",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )

        elif query.data == 'summary':
            # Show today's summary with sales details
            today = get_bangkok_now().strftime('%Y-%m-%d')
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

        elif query.data == 'expiring':
            # Show expiring products
            await expiring_handler(update, context)

        elif query.data == 'renewals':
            # Show renewals due soon
            await renewals_handler(update, context)

        elif query.data.startswith("product_"):
            # Product selected, get details and start input flow
            product_id = query.data.replace("product_", "")
            product = fetch_product_details(product_id)
            
            if product:
                context.user_data.update({
                    "flow": "add_sale", 
                    "product": product, 
                    "awaiting": True
                })
                
                # Check if it's a wholesale product to show different input format
                if product.get('product_type') == 'wholesale':
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
                    parse_mode="Markdown"
                )
            else:
                await query.edit_message_text("Product not found.")
                
    except Exception as e:
        logger.error(f"Error in button_handler: {e}")
        await query.edit_message_text("An error occurred. Please try again.")

async def text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle text input for sale creation"""
    # Check if user is in login flow
    if context.user_data.get("login_flow"):
        await handle_login(update, context)
        return
    
    # Check if user is awaiting sale input
    if not context.user_data.get("awaiting"):
        return

    # Check authentication for sale creation
    if not await auth_required(update, context):
        return

    try:
        lines = [l.strip() for l in update.message.text.splitlines() if l.strip()]
        product = context.user_data['product']
        product_type = product.get('product_type', 'retail')

        # Different handling for wholesale vs retail
        if product_type == 'wholesale':
            # Wholesale format: Customer, Email, Manager, Quantity, [Optional] Custom Price per unit
            if len(lines) >= 4:
                customer, email, manager = lines[0], lines[1], lines[2]
                
                # Parse quantity
                try:
                    quantity = int(lines[3])
                    if quantity <= 0:
                        await update.message.reply_text("❌ Quantity must be a positive number. Please try again:")
                        return
                except ValueError:
                    await update.message.reply_text("❌ Invalid quantity format. Please enter a number. Please try again:")
                    return
                
                # Parse optional price per unit
                price_per_unit = float(lines[4]) if len(lines) >= 5 and lines[4].replace('.', '').isdigit() else float(product['retail'])
                
                # Calculate total price and profit
                total_price = price_per_unit * quantity
                profit_per_unit = price_per_unit - float(product['wholesale'])
                total_profit = profit_per_unit * quantity
                
                # Create note with quantity info
                note = f"Quantity: {quantity} units @ {price_per_unit} Ks each"
                
                # Store quantity in data for database insertion
                quantity_for_db = quantity
                
            else:
                await update.message.reply_text("Invalid input format for wholesale. Please provide at least: Customer, Email, Manager, Quantity\n\nPlease try again with the correct format:")
                return
        else:
            # Retail format: Customer, Email, Manager, [Optional] Custom Price
            if len(lines) >= 3:
                customer, email, manager = lines[0], lines[1], lines[2]
                
                # Parse optional price
                total_price = float(lines[3]) if len(lines) >= 4 and lines[3].replace('.', '').isdigit() else float(product['retail'])
                
                # Calculate profit
                total_profit = total_price - float(product['wholesale'])
                
                # No quantity for retail
                note = ''
                quantity_for_db = 1  # Default quantity for retail
            else:
                await update.message.reply_text("Invalid input format for retail. Please provide at least: Customer, Email, Manager\n\nPlease try again with the correct format:")
                return
        
        today = get_bangkok_now()
        
        data = {
            'sale_product': product['product_name'],
            'duration': product['duration'],
            'renew': product['renew'],  # Get renew from product catalog
            'customer': customer,
            'email': email,
            'purchased_date': today.strftime('%Y-%m-%d'),
            'expired_date': None,  # Will be calculated in save_sale
            'manager': manager,
            'note': note,
            'price': total_price,
            'profit': total_profit,
            'product_type': product_type,
            'quantity': quantity_for_db
        }
        
        if save_sale(data):
            if product_type == 'wholesale':
                await update.message.reply_text(f"✅ Wholesale sale saved successfully!\nQuantity: {quantity} units\nTotal: {total_price} Ks")
            else:
                await update.message.reply_text("✅ Sale saved successfully!")
        else:
            await update.message.reply_text("❌ Failed to save sale.")
        
        # Clear the context after successful save
        context.user_data.clear()
        
    except Exception as e:
        logger.error(f"Error in text_handler: {e}")
        await update.message.reply_text("❌ An error occurred. Please try again.")

async def expiring_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle expiring products command"""
    # Check authentication first
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
            # For callback queries, we can only edit the first message
            await update.callback_query.edit_message_text(messages[0], parse_mode="Markdown")
            # Send additional messages as new messages
            for message in messages[1:]:
                await update.callback_query.message.reply_text(message, parse_mode="Markdown")
        else:
            # For regular commands, send all messages
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
    """Handle renewals due soon command"""
    # Check authentication first
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
            # For callback queries, we can only edit the first message
            await update.callback_query.edit_message_text(messages[0], parse_mode="Markdown")
            # Send additional messages as new messages
            for message in messages[1:]:
                await update.callback_query.message.reply_text(message, parse_mode="Markdown")
        else:
            # For regular commands, send all messages
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
    """Handle summary command"""
    # Check authentication first
    if not await auth_required(update, context):
        return
        
    try:
        if context.args:
            date_str = context.args[0]
            datetime.strptime(date_str, '%Y-%m-%d')  # Validate format
        else:
            date_str = get_bangkok_now().strftime('%Y-%m-%d')

    except ValueError:
        await update.message.reply_text("Invalid date format. Use `/summary YYYY-MM-DD`", parse_mode="Markdown")
        return

    try:
        # Get daily summary
        daily_sales, daily_profit = get_summary_data(date_str)
        
        # Get monthly summary
        monthly_sales, monthly_profit, monthly_count = get_monthly_summary()
        
        # Get today's detailed sales
        today_sales_details = get_today_sales_details()

        if daily_sales is None:
            await update.message.reply_text("Failed to fetch summary.")
            return

        # Build response
        response = f"*Sales Summary for {date_str}*\n\n"
        
        # Daily summary
        response += f"*Daily Summary:*\n"
        response += f"Sales: {int(daily_sales)} Ks\n"
        response += f"Profit: {int(daily_profit)} Ks\n\n"
        
        # Monthly summary
        current_month = get_bangkok_now().strftime('%B %Y')
        response += f"*Monthly Summary ({current_month}):*\n"
        response += f"Total Sales: {int(monthly_sales)} Ks\n"
        response += f"Total Profit: {int(monthly_profit)} Ks\n"
        response += f"Total Orders: {monthly_count}\n\n"

        await update.message.reply_text(response, parse_mode="Markdown")
        
        # Send today's sales details in batches of 10
        if today_sales_details:
            batch_size = 10
            for i in range(0, len(today_sales_details), batch_size):
                batch = today_sales_details[i:i + batch_size]
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
        await update.message.reply_text("❌ An error occurred while fetching summary.")



async def set_commands(app):
    """Set bot commands"""
    await app.bot.set_my_commands([
        BotCommand("start", "Start the bot"),
        BotCommand("summary", "Get sales summary"),
        BotCommand("expiring", "Check expiring products"),
        BotCommand("renewals", "Check renewals due soon")
    ])

async def main():
    """Main function"""
    if not db_pool:
        logger.error("Database pool not initialized. Exiting.")
        return
        
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    await set_commands(app)

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("summary", summary_handler))
    app.add_handler(CommandHandler("expiring", expiring_handler))
    app.add_handler(CommandHandler("renewals", renewals_handler))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_handler))

    # Schedule daily notifications check at 6 AM Bangkok time
    from datetime import time as dtime
    bangkok_6am = dtime(hour=6, minute=0, tzinfo=BANGKOK_TZ)
    app.job_queue.run_daily(
        auto_send_daily_notifications,
        time=bangkok_6am
    )

    logger.info("Bot running with auto-scheduler...")
    await app.run_polling()

# ✅ Entry point
if __name__ == '__main__':
    asyncio.run(main())
