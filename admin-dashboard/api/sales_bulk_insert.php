<?php
// api/sales_bulk_insert.php
declare(strict_types=1);

require __DIR__ . '/session_bootstrap.php';
require __DIR__ . '/auth.php';

auth_require_login(['admin', 'owner', 'staff']);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Use POST.']);
    exit;
}

require __DIR__ . '/dbinfo.php';

try {
    // Read JSON input
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if (!is_array($data) || !isset($data['sales'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON payload. Expected "sales" array.']);
        exit;
    }

    $sales = $data['sales'];
    if (!is_array($sales) || empty($sales)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Sales array is empty or invalid.']);
        exit;
    }

    $pdo->beginTransaction();

    $insertedCount = 0;
    $errors = [];

    // Prepare the insert statement
    $stmt = $pdo->prepare("
        INSERT INTO sale_overview (
            sale_product, duration, renew, customer, email, 
            purchased_date, expired_date, manager, note, price, profit
        ) VALUES (
            :sale_product, :duration, :renew, :customer, :email,
            :purchased_date, :expired_date, :manager, :note, :price, :profit
        )
    ");

    foreach ($sales as $index => $sale) {
        $rowNumber = $index + 1;

        try {
            // Validate required fields
            if (empty($sale['sale_product'])) {
                $errors[] = "Row {$rowNumber}: Product name is required";
                continue;
            }
            if (empty($sale['customer'])) {
                $errors[] = "Row {$rowNumber}: Customer name is required";
                continue;
            }
            if (empty($sale['purchased_date'])) {
                $errors[] = "Row {$rowNumber}: Purchase date is required";
                continue;
            }
            if (empty($sale['price']) || $sale['price'] <= 0) {
                $errors[] = "Row {$rowNumber}: Valid price is required";
                continue;
            }

            // Validate date format
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $sale['purchased_date'])) {
                $errors[] = "Row {$rowNumber}: Invalid purchase date format (YYYY-MM-DD). Received: '{$sale['purchased_date']}'";
                continue;
            }

            if (!empty($sale['expired_date']) && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $sale['expired_date'])) {
                $errors[] = "Row {$rowNumber}: Invalid expired date format (YYYY-MM-DD)";
                continue;
            }

            // Validate email format if provided
            if (!empty($sale['email']) && !filter_var($sale['email'], FILTER_VALIDATE_EMAIL)) {
                $errors[] = "Row {$rowNumber}: Invalid email format";
                continue;
            }

            // Execute the insert
            $result = $stmt->execute([
                'sale_product' => $sale['sale_product'],
                'duration' => (int)($sale['duration'] ?? 0),
                'renew' => (int)($sale['renew'] ?? 0),
                'customer' => $sale['customer'],
                'email' => $sale['email'] ?? null,
                'purchased_date' => $sale['purchased_date'],
                'expired_date' => $sale['expired_date'] ?? null,
                'manager' => $sale['manager'] ?? null,
                'note' => $sale['note'] ?? null,
                'price' => (float)$sale['price'],
                'profit' => (float)($sale['profit'] ?? 0)
            ]);

            if ($result) {
                $insertedCount++;
            } else {
                $errors[] = "Row {$rowNumber}: Failed to insert sale";
            }
        } catch (PDOException $e) {
            $errors[] = "Row {$rowNumber}: Database error - " . $e->getMessage();
        }
    }

    if (!empty($errors)) {
        $pdo->rollBack();
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'error' => 'Validation errors occurred',
            'details' => $errors,
            'inserted_count' => $insertedCount,
            'debug_data' => $sales // Add debug data to see what was received
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => "Successfully inserted {$insertedCount} sales records.",
        'inserted_count' => $insertedCount
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Internal server error: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
