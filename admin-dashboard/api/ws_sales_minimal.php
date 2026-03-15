<?php
// api/ws_sales_minimal.php
declare(strict_types=1);

require __DIR__ . '/session_bootstrap.php';
require __DIR__ . '/auth.php';

auth_require_login(['admin', 'owner', 'staff']);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// Buffer output so we can discard HTML warnings/notices and still return JSON.
ob_start();

try {
    // Don't echo PHP warnings to the client; log them instead.
    ini_set('display_errors', '0');
    error_reporting(E_ALL);

    // Use your existing PDO bootstrap
    require_once __DIR__ . '/dbinfo.php';  // must define $pdo = new PDO(...)

    if (!isset($pdo) || !($pdo instanceof PDO)) {
        throw new RuntimeException('DB connection ($pdo) not initialized.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Query only wholesale sales
    $stmt = $pdo->query("
        SELECT
            sale_id,
            sale_product,
            price,
            profit,
            purchased_date,
            expired_date,
            customer,
            email,
            renew,
            duration
        FROM ws_sale_overview
        ORDER BY purchased_date DESC, sale_id DESC
    ");

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$r) {
        $r['sale_id']        = isset($r['sale_id'])        ? (int)$r['sale_id']        : null;
        $r['sale_product']   = $r['sale_product']          ?? null;
        $r['price']          = isset($r['price'])          ? (float)$r['price']        : 0.0;
        $r['profit']         = isset($r['profit'])         ? (float)$r['profit']       : 0.0;

        // Dates / strings
        $r['purchased_date'] = $r['purchased_date']        ?? null; // "YYYY-MM-DD"
        $r['expired_date']   = $r['expired_date']          ?? null; // "YYYY-MM-DD" or null
        $r['customer']       = $r['customer']              ?? null;
        $r['email']          = $r['email']                 ?? null;

        // Renew is INT (0,1,2,3,4,5,6,12); do NOT coerce to boolean
        $r['renew']          = isset($r['renew'])          ? (int)$r['renew']          : 0;

        // Duration as INT (months)
        $r['duration']       = isset($r['duration'])       ? (int)$r['duration']       : null;
    }
    unset($r);

    // Success: discard buffered HTML (if any) and return JSON
    ob_end_clean();
    echo json_encode(
        ['success' => true, 'data' => $rows],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION
    );
} catch (Throwable $e) {
    // Error: discard buffered HTML and return JSON error
    ob_end_clean();
    http_response_code(500);
    error_log('ws_sales_minimal.php error: ' . $e->getMessage());
    echo json_encode(
        ['success' => false, 'error' => $e->getMessage()],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
}
