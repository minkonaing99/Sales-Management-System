<?php
// api/user_list.php
declare(strict_types=1);

require __DIR__ . '/session_bootstrap.php';
require __DIR__ . '/auth.php';

auth_require_login(['admin', 'owner']);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/dbinfo.php';

try {
    // Fetch web users
    $webStmt = $pdo->prepare(
        "SELECT user_id, username, is_active, role, last_login_at, created_at
         FROM users where role != 'Owner'
         ORDER BY username ASC "
    );
    $webStmt->execute();
    $webUsers = $webStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Fetch bot users
    $botStmt = $pdo->prepare(
        "SELECT id, telegram_id, username, is_active, last_login, created_at
         FROM bot_users
         ORDER BY username ASC"
    );
    $botStmt->execute();
    $botUsers = $botStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Format web users
    $formattedWebUsers = array_map(function ($row) {
        return [
            'id' => $row['user_id'],
            'username' => $row['username'],
            'telegram_id' => '-', // Web users don't have telegram ID
            'is_active' => (bool)$row['is_active'],
            'role' => $row['role'],
            'last_login' => $row['last_login_at'] ? date('Y-m-d H:i:s', strtotime($row['last_login_at'])) : 'Never',
            'created_at' => date('Y-m-d H:i:s', strtotime($row['created_at'])),
            'type' => 'web'
        ];
    }, $webUsers);

    // Format bot users
    $formattedBotUsers = array_map(function ($row) {
        return [
            'id' => $row['id'],
            'username' => $row['username'],
            'telegram_id' => $row['telegram_id'],
            'is_active' => (bool)$row['is_active'],
            'role' => 'Bot User', // Bot users have a fixed role
            'last_login' => $row['last_login'] ? date('Y-m-d H:i:s', strtotime($row['last_login'])) : 'Never',
            'created_at' => date('Y-m-d H:i:s', strtotime($row['created_at'])),
            'type' => 'bot'
        ];
    }, $botUsers);

    // Combine both arrays
    $allUsers = array_merge($formattedWebUsers, $formattedBotUsers);

    // Sort by username
    usort($allUsers, function ($a, $b) {
        return strcasecmp($a['username'], $b['username']);
    });

    echo json_encode(['success' => true, 'data' => $allUsers], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to load users.'], JSON_UNESCAPED_UNICODE);
}
