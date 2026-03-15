<?php
// api/products_table.php
declare(strict_types=1);

require __DIR__ . '/session_bootstrap.php';
require __DIR__ . '/auth.php';

auth_require_login(['admin', 'owner', 'staff']);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/dbinfo.php';

try {
    $hasStoreCol = (bool)$pdo
        ->query("SHOW COLUMNS FROM products_catalog LIKE 'store'")
        ->fetch(PDO::FETCH_ASSOC);

    $storeSelect = $hasStoreCol ? "store" : "0 AS store";

    // Pull raw int plus a computed boolean for a painless shim
    $stmt = $pdo->query("
        SELECT 
            product_id,
            product_name,
            duration,
            renew AS renew_int,
            supplier,
            wholesale,
            retail,
            note,
            link,
            {$storeSelect}
        FROM products_catalog
        ORDER BY product_name ASC
    ");

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$r) {
        // Integers
        $r['product_id'] = isset($r['product_id']) ? (int)$r['product_id'] : null;
        $r['duration']   = isset($r['duration']) ? (int)$r['duration'] : null;
        $r['store']      = isset($r['store']) ? (int)$r['store'] : 0;

        // Keep raw int for new code…
        $r['renew_int']  = isset($r['renew_int']) ? (int)$r['renew_int'] : 0;

        // …and expose legacy boolean for existing UI
        // (cast via int; strings like "0"/"1" are common from PDO)
        $r['renew']      = ((int)$r['renew_int'] === 1);

        // Money as numbers
        $r['wholesale']  = isset($r['wholesale']) ? (float)$r['wholesale'] : 0.0;
        $r['retail']     = isset($r['retail']) ? (float)$r['retail'] : 0.0;

        // Nullable strings
        $r['supplier']   = $r['supplier'] ?? null;
        $r['note']       = $r['note'] ?? null;
        $r['link']       = $r['link'] ?? null;

        // Drop the helper column from output
    }
    unset($r);

    echo json_encode([
        'success' => true,
        'data'    => $rows
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
