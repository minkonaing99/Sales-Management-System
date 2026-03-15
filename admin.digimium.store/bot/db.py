import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from creds import DB_CONFIG
from mysql.connector.pooling import MySQLConnectionPool

logger = logging.getLogger(__name__)

BANGKOK_TZ = ZoneInfo("Asia/Bangkok")

try:
    db_pool = MySQLConnectionPool(
        pool_name="digimium_pool",
        pool_size=10,
        pool_reset_session=True,
        **DB_CONFIG,
    )
    logger.info("Database connection pool created successfully")
except Exception as e:
    logger.error(f"Failed to create database pool: {e}")
    db_pool = None


def is_db_ready():
    return db_pool is not None


def get_bangkok_now():
    return datetime.now(BANGKOK_TZ)


def get_bangkok_today():
    return get_bangkok_now().date()


def parse_date_safe(date_value):
    if isinstance(date_value, str):
        return datetime.strptime(date_value, "%Y-%m-%d").date()
    if isinstance(date_value, datetime):
        return date_value.date()
    if isinstance(date_value, date):
        return date_value
    raise ValueError(f"Unsupported date format: {type(date_value)}")


def format_date_readable(date_value):
    date_obj = datetime.strptime(date_value, "%Y-%m-%d") if isinstance(date_value, str) else date_value
    return date_obj.strftime("%d %b %Y")


def escape_markdown(text):
    return str(text).replace("_", "\\_").replace("*", "\\*").replace("[", "\\[")


def get_db_connection():
    if not db_pool:
        raise RuntimeError("Database pool not initialized")
    return db_pool.get_connection()


def execute_query(query, params=None, fetch_type="all", dictionary=False):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=dictionary, buffered=True)

        if params:
            cursor.execute(query, params)
        else:
            cursor.execute(query)

        if fetch_type not in ("all", "one"):
            conn.commit()

        if fetch_type == "all":
            return cursor.fetchall()
        if fetch_type == "one":
            return cursor.fetchone()
        return None
    except Exception as e:
        logger.error(f"Database query error: {e}")
        logger.error(f"Query: {query}")
        if params:
            logger.error(f"Params: {params}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()


def fetch_products_by_type(product_type=None):
    if product_type == "retail":
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
    elif product_type == "wholesale":
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


def fetch_retail_products():
    return fetch_products_by_type("retail")


def fetch_wholesale_products():
    return fetch_products_by_type("wholesale")


def fetch_product_details(product_id):
    if product_id.startswith("R-"):
        actual_id = product_id.replace("R-", "")
        query = "SELECT *, 'retail' as product_type FROM products_catalog WHERE product_id = %s"
    elif product_id.startswith("WS-"):
        actual_id = product_id.replace("WS-", "")
        query = "SELECT *, 'wholesale' as product_type FROM ws_products_catalog WHERE product_id = %s"
    else:
        actual_id = product_id
        query = "SELECT *, 'retail' as product_type FROM products_catalog WHERE product_id = %s"
    return execute_query(query, (actual_id,), fetch_type="one", dictionary=True)


def get_summary_data(date_str):
    query = """
        SELECT SUM(price), SUM(profit)
        FROM (
            SELECT price, profit FROM sale_overview WHERE purchased_date = %s
            UNION ALL
            SELECT price, profit FROM ws_sale_overview WHERE purchased_date = %s
        ) combined_sales
    """
    try:
        result = execute_query(query, (date_str, date_str), fetch_type="one")
        if result and result[0] is not None:
            return float(result[0]), float(result[1] or 0)
        return 0, 0
    except Exception as e:
        logger.error(f"Error in get_summary_data: {e}")
        return None, None


def get_monthly_summary():
    current_month = get_bangkok_now().strftime("%Y-%m")
    query = """
        SELECT SUM(price), SUM(profit), COUNT(*)
        FROM (
            SELECT price, profit FROM sale_overview WHERE purchased_date LIKE %s
            UNION ALL
            SELECT price, profit FROM ws_sale_overview WHERE purchased_date LIKE %s
        ) combined_sales
    """
    try:
        result = execute_query(query, (f"{current_month}%", f"{current_month}%"), fetch_type="one")
        if result and result[0] is not None:
            return float(result[0]), float(result[1] or 0), int(result[2] or 0)
        return 0, 0, 0
    except Exception as e:
        logger.error(f"Error in get_monthly_summary: {e}")
        return 0, 0, 0


def get_today_sales_details():
    today = get_bangkok_now().strftime("%Y-%m-%d")
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


def get_expiring_soon_products():
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
    try:
        if isinstance(purchased_date, str):
            purchased_date = datetime.strptime(purchased_date, "%Y-%m-%d")

        year = purchased_date.year
        month = purchased_date.month + int(duration_months)
        day = purchased_date.day

        while month > 12:
            year += 1
            month -= 12

        try:
            expired_date = purchased_date.replace(year=year, month=month, day=day)
        except ValueError:
            next_month = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
            expired_date = next_month - timedelta(days=1)

        return expired_date.strftime("%Y-%m-%d")
    except Exception as e:
        logger.error(f"Error calculating expired date: {e}")
        return None


def save_sale(data):
    try:
        if not data.get("expired_date"):
            expired_date = calculate_expired_date(data["purchased_date"], data["duration"])
            if not expired_date:
                return False
            data["expired_date"] = expired_date

        table_name = "ws_sale_overview" if data.get("product_type") == "wholesale" else "sale_overview"
        if data.get("product_type") == "wholesale":
            quantity = data.get("quantity", 1)
            query = f"""
                INSERT INTO {table_name}
                (sale_product, duration, quantity, renew, customer, email, purchased_date, expired_date, manager, note, price, profit)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            params = (
                data["sale_product"],
                data["duration"],
                quantity,
                data["renew"],
                data["customer"],
                data["email"],
                data["purchased_date"],
                data["expired_date"],
                data["manager"],
                data["note"],
                data["price"],
                data["profit"],
            )
        else:
            query = f"""
                INSERT INTO {table_name}
                (sale_product, duration, renew, customer, email, purchased_date, expired_date, manager, note, price, profit, store)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            params = (
                data["sale_product"],
                data["duration"],
                data["renew"],
                data["customer"],
                data["email"],
                data["purchased_date"],
                data["expired_date"],
                data["manager"],
                data["note"],
                data["price"],
                data["profit"],
                1,
            )

        execute_query(query, params, fetch_type=None)
        return True
    except Exception as e:
        logger.error(f"Error in save_sale: {e}")
        return False


def calculate_next_due_date(purchased_date, renew_months, base_date):
    try:
        due_date = purchased_date
        while due_date < base_date:
            year = due_date.year
            month = due_date.month + renew_months
            day = due_date.day
            while month > 12:
                year += 1
                month -= 12
            try:
                due_date = due_date.replace(year=year, month=month, day=day)
            except ValueError:
                next_month = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
                due_date = (next_month - timedelta(days=1)).date()
        return due_date
    except Exception as e:
        logger.error(f"Error calculating next due date: {e}")
        return None


def get_renewals_due_soon():
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
                purchased_date = parse_date_safe(row["purchased_date"])
                expired_date = parse_date_safe(row["expired_date"])
                renew_months = int(row["renew"])
                duration = int(row["duration"])

                if renew_months >= duration:
                    continue

                next_due = calculate_next_due_date(purchased_date, renew_months, today)
                if not next_due:
                    continue

                days_left = (next_due - today).days
                if 0 <= days_left <= 2:
                    days_to_expiry = (expired_date - today).days
                    if days_to_expiry > 3:
                        renewals.append(
                            {
                                "sale_product": row["sale_product"],
                                "customer": row["customer"],
                                "email": row["email"],
                                "purchased_date": purchased_date,
                                "expired_date": expired_date,
                                "next_due": next_due,
                                "days_left": days_left,
                                "renew": renew_months,
                                "sale_type": row["sale_type"],
                            }
                        )
            except Exception as e:
                logger.error(f"Error processing renewal row: {row} -> {e}")
                continue

        renewals.sort(key=lambda x: (x["days_left"], x["next_due"]))
        return renewals
    except Exception as e:
        logger.error(f"Error in get_renewals_due_soon: {e}")
        return []
