<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/bootstrap.php';

use Digimium\Core\Http;

const IDLE_TIMEOUT_SECONDS = 15 * 60;
const ABSOLUTE_TIMEOUT_SECONDS = 8 * 60 * 60;
const REGENERATE_EVERY_SECONDS = 5 * 60;

function auth_is_logged_in(): bool
{
    return isset($_SESSION['auth']) && $_SESSION['auth'] === true
        && isset($_SESSION['user']['username'], $_SESSION['user']['role']);
}

function auth_mark_login(array $dbUserRow): void
{
    $_SESSION['auth'] = true;
    $_SESSION['user'] = [
        'id' => (int)$dbUserRow['user_id'],
        'username' => (string)$dbUserRow['username'],
        'role' => strtolower((string)$dbUserRow['role']),
    ];

    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $ipMask = preg_replace('~^((\d+\.){2}).*$~', '$1', $ip);
    $_SESSION['fingerprint'] = hash('sha256', $ua . '|' . $ipMask);

    $now = time();
    $_SESSION['created_at'] = $now;
    $_SESSION['last_seen_at'] = $now;
    $_SESSION['last_regen_at'] = $now;

    session_regenerate_id(true);
}

function auth_require_login(array $allowedRoles = []): void
{
    if (!auth_is_logged_in()) {
        auth_fail();
    }

    $now = time();
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $ipMask = preg_replace('~^((\d+\.){2}).*$~', '$1', $ip);
    $expected = hash('sha256', $ua . '|' . $ipMask);

    if (!hash_equals((string)($_SESSION['fingerprint'] ?? ''), $expected)) {
        auth_fail();
    }

    if (($now - (int)($_SESSION['created_at'] ?? 0)) > ABSOLUTE_TIMEOUT_SECONDS) {
        auth_fail();
    }

    if (($now - (int)($_SESSION['last_seen_at'] ?? 0)) > IDLE_TIMEOUT_SECONDS) {
        auth_fail();
    }

    if (($now - (int)($_SESSION['last_regen_at'] ?? 0)) > REGENERATE_EVERY_SECONDS) {
        session_regenerate_id(true);
        $_SESSION['last_regen_at'] = $now;
    }

    if ($allowedRoles) {
        $role = strtolower((string)($_SESSION['user']['role'] ?? ''));
        $allowed = array_map('strtolower', $allowedRoles);
        if (!in_array($role, $allowed, true)) {
            if (Http::acceptsJson()) {
                Http::json(['success' => false, 'error' => 'Forbidden'], 403);
                exit;
            }
            http_response_code(403);
            exit('Forbidden');
        }
    }

    $_SESSION['last_seen_at'] = $now;
}

function auth_fail(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();

    if (Http::acceptsJson()) {
        Http::json(['success' => false, 'error' => 'Unauthorized'], 401);
        exit;
    }

    header('Location: index.php');
    exit;
}
