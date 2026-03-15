<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

require_once './dbinfo.php'; // your PDO connection

try {
    // Pull raw int plus a computed boolean for a painless shim
    $stmt = $pdo->query("
        SELECT 
            product_id,
            product_name,
            duration,
            renew AS renew_int,
            (renew <> 0) AS renew_bool,
            supplier,
            wholesale,
            retail,
            note,
            link
        FROM ws_products_catalog
        ORDER BY product_name ASC
    ");

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$r) {
        // Integers
        $r['product_id'] = isset($r['product_id']) ? (int)$r['product_id'] : null;
        $r['duration']   = isset($r['duration']) ? (int)$r['duration'] : null;

        // Keep raw int for new code…
        $r['renew_int']  = isset($r['renew_int']) ? (int)$r['renew_int'] : 0;

        // …and expose legacy boolean for existing UI
        // (cast via int; strings like "0"/"1" are common from PDO)
        $r['renew']      = isset($r['renew_bool']) ? ((int)$r['renew_bool'] === 1) : false;

        // Money as numbers
        $r['wholesale']  = isset($r['wholesale']) ? (float)$r['wholesale'] : 0.0;
        $r['retail']     = isset($r['retail']) ? (float)$r['retail'] : 0.0;

        // Nullable strings
        $r['supplier']   = $r['supplier'] ?? null;
        $r['note']       = $r['note'] ?? null;
        $r['link']       = $r['link'] ?? null;

        // Drop the helper column from output
        unset($r['renew_bool']);
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
