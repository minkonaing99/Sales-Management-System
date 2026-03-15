<?php
// api/sales_minimal.php
declare(strict_types=1);

require __DIR__ . '/session_bootstrap.php';
require __DIR__ . '/auth.php';
require_once dirname(__DIR__) . '/app/bootstrap.php';

use Digimium\Core\ResponseCache;

auth_require_login(['admin', 'owner', 'staff']);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=45, must-revalidate');

ob_start();

try {
    ini_set('display_errors', '0');
    error_reporting(E_ALL);

    require_once __DIR__ . '/dbinfo.php';

    if (!isset($pdo) || !($pdo instanceof PDO)) {
        throw new RuntimeException('DB connection ($pdo) not initialized.');
    }

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $fpRetail = $pdo->query('SELECT COALESCE(MAX(sale_id),0) AS max_id, COUNT(*) AS cnt FROM sale_overview')->fetch();
    $fpWs = $pdo->query('SELECT COALESCE(MAX(sale_id),0) AS max_id, COUNT(*) AS cnt FROM ws_sale_overview')->fetch();
    $fingerprint =
        ((int)($fpRetail['max_id'] ?? 0)) . ':' . ((int)($fpRetail['cnt'] ?? 0)) . '|' .
        ((int)($fpWs['max_id'] ?? 0)) . ':' . ((int)($fpWs['cnt'] ?? 0));

    $cacheKey = 'sales_minimal:v2:' . $fingerprint;
    $etag = '"' . sha1($cacheKey) . '"';
    header('ETag: ' . $etag);

    $ifNoneMatch = trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
    if ($ifNoneMatch !== '' && $ifNoneMatch === $etag) {
        ob_end_clean();
        http_response_code(304);
        exit;
    }

    $cached = ResponseCache::get($cacheKey, 45);
    if (is_string($cached)) {
        ob_end_clean();
        echo $cached;
        exit;
    }

    $hasRetailStoreCol = (bool)$pdo
        ->query("SHOW COLUMNS FROM sale_overview LIKE 'store'")
        ->fetchColumn();

    $retailStoreSelect = $hasRetailStoreCol ? 'store' : '0 AS store';

    $stmt = $pdo->query("
        SELECT
            sale_id,
            CONCAT('Retail - ', sale_product) as sale_product,
            price,
            profit,
            purchased_date,
            expired_date,
            customer,
            email,
            renew,
            duration,
            {$retailStoreSelect},
            'retail' as sale_type
        FROM sale_overview

        UNION ALL

        SELECT
            sale_id,
            CONCAT('Wholesale - ', sale_product) as sale_product,
            price,
            profit,
            purchased_date,
            expired_date,
            customer,
            email,
            renew,
            duration,
            2 as store,
            'wholesale' as sale_type
        FROM ws_sale_overview

        ORDER BY purchased_date DESC, sale_id DESC
    ");

    $rows = $stmt->fetchAll();

    foreach ($rows as &$r) {
        $r['sale_id'] = isset($r['sale_id']) ? (int)$r['sale_id'] : null;
        $r['sale_product'] = $r['sale_product'] ?? null;
        $r['price'] = isset($r['price']) ? (float)$r['price'] : 0.0;
        $r['profit'] = isset($r['profit']) ? (float)$r['profit'] : 0.0;
        $r['purchased_date'] = $r['purchased_date'] ?? null;
        $r['expired_date'] = $r['expired_date'] ?? null;
        $r['customer'] = $r['customer'] ?? null;
        $r['email'] = $r['email'] ?? null;
        $r['renew'] = isset($r['renew']) ? (int)$r['renew'] : 0;
        $r['duration'] = isset($r['duration']) ? (int)$r['duration'] : null;
        $r['store'] = isset($r['store']) ? (int)$r['store'] : 0;
        $r['sale_type'] = $r['sale_type'] ?? 'retail';
    }
    unset($r);

    $payload = json_encode(
        ['success' => true, 'data' => $rows],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION
    );
    if (!is_string($payload)) {
        throw new RuntimeException('Failed to encode summary payload.');
    }

    ResponseCache::put($cacheKey, $payload);
    ob_end_clean();
    echo $payload;
} catch (Throwable $e) {
    ob_end_clean();
    http_response_code(500);
    error_log('sales_minimal.php error: ' . $e->getMessage());
    echo json_encode(
        ['success' => false, 'error' => $e->getMessage()],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
}
