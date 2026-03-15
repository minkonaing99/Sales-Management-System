<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/bootstrap.php';

use Digimium\Core\Config;

$secureCookie = Config::bool('DIGIMIUM_SESSION_SECURE', !empty($_SERVER['HTTPS']));
$sameSite = Config::get('DIGIMIUM_SESSION_SAMESITE', 'Lax') ?: 'Lax';
$sessionName = Config::get('DIGIMIUM_SESSION_NAME', 'ERASESSID') ?: 'ERASESSID';
$gcMaxLife = Config::int('DIGIMIUM_SESSION_MAX_LIFETIME', 28800);

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', $sameSite);
ini_set('session.cookie_secure', $secureCookie ? '1' : '0');
ini_set('session.cookie_lifetime', '0');
ini_set('session.gc_maxlifetime', (string)$gcMaxLife);

session_name($sessionName);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
