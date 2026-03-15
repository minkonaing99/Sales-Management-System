<?php
// api/bot_user_delete.php
declare(strict_types=1);

require __DIR__ . '/session_bootstrap.php';
require __DIR__ . '/auth.php';

auth_require_login(['admin', 'owner']);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/dbinfo.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$bot_user_id = $input['bot_user_id'] ?? null;

if (!$bot_user_id) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Bot User ID is required'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    // Check if bot user exists
    $checkStmt = $pdo->prepare("SELECT id, username FROM bot_users WHERE id = ?");
    $checkStmt->execute([$bot_user_id]);
    $botUser = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$botUser) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Bot user not found'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Delete the bot user
    $stmt = $pdo->prepare("DELETE FROM bot_users WHERE id = ?");
    $stmt->execute([$bot_user_id]);

    if ($stmt->rowCount() > 0) {
        echo json_encode(['success' => true, 'message' => 'Bot user deleted successfully'], JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to delete bot user'], JSON_UNESCAPED_UNICODE);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to delete bot user.'], JSON_UNESCAPED_UNICODE);
}
