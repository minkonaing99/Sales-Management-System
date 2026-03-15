<?php
// api/ws_sale_update_inline.php
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
    $allowedFields = ['customer', 'email', 'manager', 'note'];
    $updateFields = [];
    $updateValues = [];

    // Build update query dynamically based on provided fields
    foreach ($allowedFields as $field) {
        if (isset($data[$field])) {
            $updateFields[] = "$field = ?";
            $updateValues[] = $data[$field] === '' ? null : trim($data[$field]);
        }
    }

    if (empty($updateFields)) {
        throw new RuntimeException('No valid fields to update');
    }

    // Validate email format if provided
    if (isset($data['email']) && $data['email'] !== '' && !filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Invalid email format');
    }

    // Check if sale exists
    $checkStmt = $pdo->prepare("SELECT sale_id FROM ws_sale_overview WHERE sale_id = ?");
    $checkStmt->execute([$sale_id]);

    if (!$checkStmt->fetch()) {
        throw new RuntimeException('Sale not found');
    }

    // Update the sale
    $sql = "UPDATE ws_sale_overview SET " . implode(', ', $updateFields) . " WHERE sale_id = ?";
    $updateValues[] = $sale_id;

    $updateStmt = $pdo->prepare($sql);
    $updateStmt->execute($updateValues);

    if ($updateStmt->rowCount() === 0) {
        throw new RuntimeException('No changes made to sale');
    }

    echo json_encode([
        'success' => true,
        'message' => 'Wholesale sale updated successfully'
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
