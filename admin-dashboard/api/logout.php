<?php

declare(strict_types=1);

require_once __DIR__ . '/session_bootstrap.php';
require_once __DIR__ . '/remember.php'; // to clear remember-me cookie

// --- Logout routine ---
function do_logout(): void
{
    // 1) Clear remember-me cookie
    remember_forget_cookie();

    // 2) Wipe all session data
    $_SESSION = [];

    // 3) Remove the PHP session cookie
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'],
            $params['domain'],
            $params['secure'],
            $params['httponly']
        );
    }

    // 4) Destroy the session storage on the server
    session_destroy();

    // 5) Bust browser cache so back button won’t serve protected content
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
}

// --- Handle methods ---
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'POST') {
    // Ajax logout (your fetch)
    do_logout();
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => true]);
    exit;
}

if ($method === 'GET') {
    // Direct link fallback
    do_logout();
    // Use relative path that matches your JS redirect
    header('Location: ./index.php', true, 303);
    exit;
}

// Anything else: nope.
http_response_code(405);
header('Allow: GET, POST');
echo 'Method Not Allowed';
