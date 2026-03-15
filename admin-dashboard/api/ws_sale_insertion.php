<?php
// api/ws_sale_insertion.php
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
    $errors = [];

    if (empty($data['sale_product'])) {
        $errors['sale_product'] = 'Product is required';
    }

    if (empty($data['customer'])) {
        $errors['customer'] = 'Customer is required';
    }

    if (empty($data['purchased_date'])) {
        $errors['purchased_date'] = 'Purchase date is required';
    }

    if (!isset($data['price']) || !is_numeric($data['price']) || $data['price'] < 0) {
        $errors['price'] = 'Valid price is required';
    }

    if (!isset($data['profit']) || !is_numeric($data['profit'])) {
        $errors['profit'] = 'Valid profit is required';
    }

    if (!empty($errors)) {
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'errors' => $errors
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    // Prepare data
    $sale_product = trim($data['sale_product']);
    $duration = isset($data['duration']) && is_numeric($data['duration']) ? (int)$data['duration'] : null;
    $quantity = isset($data['quantity']) && is_numeric($data['quantity']) ? (int)$data['quantity'] : 1;
    $renew = isset($data['renew']) && is_numeric($data['renew']) ? (int)$data['renew'] : 0;
    $customer = trim($data['customer']);
    $email = !empty($data['email']) ? trim($data['email']) : null;
    $purchased_date = $data['purchased_date'];
    $expired_date = !empty($data['expired_date']) ? $data['expired_date'] : null;
    $manager = !empty($data['manager']) ? trim($data['manager']) : null;
    $note = !empty($data['note']) ? trim($data['note']) : null;
    $price = (float)$data['price'];
    $profit = (float)$data['profit'];

    // Validate email format if provided
    if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors['email'] = 'Invalid email format';
    }

    // Validate date formats
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $purchased_date)) {
        $errors['purchased_date'] = 'Invalid purchase date format (YYYY-MM-DD)';
    }

    if ($expired_date && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $expired_date)) {
        $errors['expired_date'] = 'Invalid expired date format (YYYY-MM-DD)';
    }

    if (!empty($errors)) {
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'errors' => $errors
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    // Insert into database
    $sql = "INSERT INTO ws_sale_overview (
                sale_product, duration, quantity, renew, customer, email, 
                purchased_date, expired_date, manager, note, price, profit
            ) VALUES (
                :sale_product, :duration, :quantity, :renew, :customer, :email,
                :purchased_date, :expired_date, :manager, :note, :price, :profit
            )";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':sale_product' => $sale_product,
        ':duration' => $duration,
        ':quantity' => $quantity,
        ':renew' => $renew,
        ':customer' => $customer,
        ':email' => $email,
        ':purchased_date' => $purchased_date,
        ':expired_date' => $expired_date,
        ':manager' => $manager,
        ':note' => $note,
        ':price' => $price,
        ':profit' => $profit
    ]);

    $sale_id = $pdo->lastInsertId();

    echo json_encode([
        'success' => true,
        'message' => 'Wholesale sale created successfully',
        'sale_id' => $sale_id
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
