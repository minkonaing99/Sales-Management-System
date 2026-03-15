import logging

from creds import BOT_PASSWORD
from db import execute_query

logger = logging.getLogger(__name__)


def check_user_auth(telegram_id):
    query = "SELECT id FROM bot_users WHERE telegram_id = %s AND is_active = TRUE"
    try:
        result = execute_query(query, (telegram_id,), fetch_type="one")
        return result is not None
    except Exception as e:
        logger.error(f"Error checking user auth: {e}")
        return False


def save_authenticated_user(telegram_id, username):
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
    if password == BOT_PASSWORD:
        return True
    logger.warning(f"Invalid password attempt for username: {username}")
    return False
