<?php
// api/ws_sale_delete.php
declare(strict_types=1);

require __DIR__ . '/session_bootstrap.php';
require __DIR__ . '/auth.php';

auth_require_login(['admin', 'owner', 'staff']);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/dbinfo.php';

try {
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        throw new RuntimeException('PDO connection not initialized. Check dbinfo.php');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Get JSON input
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (!$data) {
        throw new RuntimeException('Invalid JSON input');
    }

    // Validate required fields
    if (!isset($data['id']) || !is_numeric($data['id'])) {
        throw new RuntimeException('Valid sale ID is required');
    }

    $sale_id = (int)$data['id'];

    // Check if sale exists
    $checkStmt = $pdo->prepare("SELECT sale_id FROM ws_sale_overview WHERE sale_id = ?");
    $checkStmt->execute([$sale_id]);

    if (!$checkStmt->fetch()) {
        throw new RuntimeException('Sale not found');
    }

    // Delete the sale
    $deleteStmt = $pdo->prepare("DELETE FROM ws_sale_overview WHERE sale_id = ?");
    $deleteStmt->execute([$sale_id]);

    if ($deleteStmt->rowCount() === 0) {
        throw new RuntimeException('Failed to delete sale');
    }

    echo json_encode([
        'success' => true,
        'message' => 'Wholesale sale deleted successfully'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
