<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/bootstrap.php';

use Digimium\Core\Config;

const REMEMBER_COOKIE = 'era_remember';
const REMEMBER_DAYS = 7;

function remember_secret(): string
{
    return Config::get('DIGIMIUM_REMEMBER_SECRET', 'change-me-please-32bytes-min') ?: 'change-me-please-32bytes-min';
}

function b64u(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function b64u_dec(string $str): string
{
    $pad = 4 - (strlen($str) % 4);
    if ($pad < 4) {
        $str .= str_repeat('=', $pad);
    }
    return base64_decode(strtr($str, '-_', '+/'), true) ?: '';
}

function remember_cookie_opts(): array
{
    return [
        'expires' => time() + REMEMBER_DAYS * 86400,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Lax',
    ];
}

function remember_issue_cookie(int $userId, string $username, string $role): void
{
    $payload = [
        'uid' => $userId,
        'u' => $username,
        'r' => strtolower($role),
        'iat' => time(),
        'exp' => time() + REMEMBER_DAYS * 86400,
        'uah' => hash('sha256', $_SERVER['HTTP_USER_AGENT'] ?? ''),
    ];

    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) {
        return;
    }

    $sig = hash_hmac('sha256', $json, remember_secret(), true);
    $token = b64u($json) . '.' . b64u($sig);
    setcookie(REMEMBER_COOKIE, $token, remember_cookie_opts());
}

function remember_try_login_from_cookie(): bool
{
    if (!empty($_SESSION['auth'])) {
        return true;
    }

    $raw = $_COOKIE[REMEMBER_COOKIE] ?? '';
    if ($raw === '' || strpos($raw, '.') === false) {
        return false;
    }

    [$p64, $s64] = explode('.', $raw, 2);
    $json = b64u_dec($p64);
    $sig = b64u_dec($s64);
    if ($json === '' || $sig === '') {
        return false;
    }

    $calc = hash_hmac('sha256', $json, remember_secret(), true);
    if (!hash_equals($sig, $calc)) {
        remember_forget_cookie();
        return false;
    }

    $data = json_decode($json, true);
    if (!is_array($data)) {
        remember_forget_cookie();
        return false;
    }

    $uid = $data['uid'] ?? null;
    $usr = (string)($data['u'] ?? '');
    $rol = (string)($data['r'] ?? '');
    $exp = $data['exp'] ?? 0;

    if (!is_int($uid)) {
        $uid = ctype_digit((string)$uid) ? (int)$uid : null;
    }
    if (!is_int($exp)) {
        $exp = ctype_digit((string)$exp) ? (int)$exp : 0;
    }

    if ($uid === null || $usr === '' || $rol === '' || $exp <= 0 || $exp < time()) {
        remember_forget_cookie();
        return false;
    }

    $uahCookie = (string)($data['uah'] ?? '');
    if ($uahCookie !== '') {
        $uahNow = hash('sha256', $_SERVER['HTTP_USER_AGENT'] ?? '');
        if (!hash_equals($uahCookie, $uahNow)) {
            return false;
        }
    }

    $_SESSION['auth'] = true;
    $_SESSION['user'] = [
        'id' => (int)$uid,
        'username' => $usr,
        'role' => strtolower($rol),
    ];

    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $ipMask = preg_replace('~^((\d+\.){2}).*$~', '$1', $ip);
    $_SESSION['fingerprint'] = hash('sha256', $ua . '|' . $ipMask);

    $now = time();
    $_SESSION['created_at'] = $_SESSION['created_at'] ?? $now;
    $_SESSION['last_seen_at'] = $now;
    $_SESSION['last_regen_at'] = $now;
    session_regenerate_id(true);

    return true;
}

function remember_forget_cookie(): void
{
    if (!isset($_COOKIE[REMEMBER_COOKIE])) {
        return;
    }

    setcookie(REMEMBER_COOKIE, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}
