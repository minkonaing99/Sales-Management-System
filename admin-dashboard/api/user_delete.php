<?php
// api/user_delete.php
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
$user_id = $input['user_id'] ?? null;

if (!$user_id) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'User ID is required'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    // Check if user exists and is not the current user
    $current_user_id = $_SESSION['user']['id'] ?? null;

    if ($user_id == $current_user_id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Cannot delete your own account'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Check if user exists
    $checkStmt = $pdo->prepare("SELECT user_id, username, role FROM users WHERE user_id = ?");
    $checkStmt->execute([$user_id]);
    $user = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'User not found'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Prevent deletion of owner accounts
    if ($user['role'] === 'Owner') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Cannot delete owner accounts'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Delete the user
    $stmt = $pdo->prepare("DELETE FROM users WHERE user_id = ?");
    $stmt->execute([$user_id]);

    if ($stmt->rowCount() > 0) {
        echo json_encode(['success' => true, 'message' => 'User deleted successfully'], JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to delete user'], JSON_UNESCAPED_UNICODE);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to delete user.'], JSON_UNESCAPED_UNICODE);
}
