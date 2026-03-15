<?php

declare(strict_types=1);

require_once __DIR__ . '/session_bootstrap.php'; // has session_start + secure ini
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/remember.php';
require_once __DIR__ . '/dbinfo.php';


$username = trim((string)($_POST['username'] ?? ''));
$password = (string)($_POST['password'] ?? '');

if ($username === '' || $password === '') {
    http_response_code(400);
    exit('Username and password are required.');
}

try {
    // users(user_id, username, pass_hash, role, is_active, last_login_at)
    $stmt = $pdo->prepare("
        SELECT user_id, username, pass_hash, role, is_active
        FROM users
        WHERE username = :username
        LIMIT 1
    ");
    $stmt->execute([':username' => $username]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    $active = $row && (int)$row['is_active'] === 1;
    $ok = $active && password_verify($password, $row['pass_hash'] ?? '');

    if (!$ok) {
        http_response_code(401);
        exit('Invalid username or password.');
    }

    auth_mark_login($row);
    remember_issue_cookie((int)$row['user_id'], (string)$row['username'], (string)$row['role']);


    $_SESSION['username']  = $_SESSION['user']['username'];
    $_SESSION['privilege'] = $_SESSION['user']['role'];

    // ✂️ Removed: logincode + the three client cookies (they’re tamperable)
    // If you absolutely must keep a display cookie, at least set safe flags:
    // setcookie('username', $_SESSION['username'], [
    //     'expires'  => time() + 604800,
    //     'path'     => '/',
    //     'secure'   => !empty($_SERVER['HTTPS']),
    //     'httponly' => true,
    //     'samesite' => 'Lax',
    // ]);

    // Touch last_login_at
    $upd = $pdo->prepare("UPDATE users SET last_login_at = NOW() WHERE user_id = :id");
    $upd->execute([':id' => (int)$row['user_id']]);

    exit('success');
} catch (PDOException $e) {
    http_response_code(500);
    exit('Database error.');
}
