<?php
// api/fetch_product_options.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/dbinfo.php';

try {
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        throw new RuntimeException('PDO connection not initialized. Check dbinfo.php');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $stmt = $pdo->query("
        SELECT
            product_id,
            product_name,
            duration,
            renew,
            wholesale AS wc_price,
            retail    AS retail_price
        FROM products_catalog
        ORDER BY product_name ASC
    ");

    $rows = $stmt->fetchAll();

    // Normalize types (renew as INT now)
    foreach ($rows as &$r) {
        $r['product_id']   = isset($r['product_id']) ? (int)$r['product_id'] : null;
        $r['product_name'] = $r['product_name'] ?? null;
        $r['duration']     = isset($r['duration']) ? (int)$r['duration'] : null;
        $r['renew']        = isset($r['renew']) ? (int)$r['renew'] : 0; // <-- INT (0/1)
        $r['wc_price']     = isset($r['wc_price']) ? (float)$r['wc_price'] : 0.0;
        $r['retail_price'] = isset($r['retail_price']) ? (float)$r['retail_price'] : 0.0;
    }
    unset($r);

    echo json_encode(
        ['status' => 'success', 'products' => $rows],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION
    );
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(
        ['status' => 'error', 'message' => $e->getMessage()],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
}
