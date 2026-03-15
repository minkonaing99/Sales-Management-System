<?php
// api/sales_export_csv.php
declare(strict_types=1);

// --- debug switch ---
$debug = isset($_GET['debug']) && $_GET['debug'] !== '0';
if ($debug) {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
    error_reporting(E_ALL);
}

function fail(int $code, string $msg, bool $debug): void
{
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    echo $debug ? $msg : 'Export failed.';
    exit;
}

// ---- Load PDO from your bootstrap (dbinfo.php) ----
$pdo = null;
$tried = [];
$tryPaths = [
    __DIR__ . '/../dbinfo.php',
    __DIR__ . '/dbinfo.php',
    dirname(__DIR__) . '/dbinfo.php',
];

$loaded = false;

require_once __DIR__ . '/session_bootstrap.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/dbinfo.php';

auth_require_login(['admin', 'owner']);

// ---- Query (no sale_id in export) ----
$sql = "
    SELECT
        sale_product,
        duration,
        customer,
        email,
        purchased_date,
        expired_date,
        manager,
        note,
        price
    FROM sale_overview
    WHERE expired_date BETWEEN CURDATE() - INTERVAL 7 DAY
                          AND CURDATE() + INTERVAL 3 DAY
    ORDER BY expired_date DESC
    LIMIT 50
";

try {
    $stmt = $pdo->query($sql);
} catch (Throwable $e) {
    fail(500, 'Query failed: ' . $e->getMessage(), $debug);
}

// ---- Send CSV headers only after success ----
$filename = 'sales_export_' . date('Ymd_His') . '.csv';
header('Content-Type: text/csv; charset=UTF-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('X-Content-Type-Options: nosniff');

// UTF-8 BOM (Excel-friendly)
echo "\xEF\xBB\xBF";

$out = fopen('php://output', 'w');
if ($out === false) {
    fail(500, 'Unable to open output stream.', $debug);
}

// Header row
$headers = [
    'sale_product',
    'duration',
    'customer',
    'email',
    'purchased_date',
    'expired_date',
    'manager',
    'note',
    'price',
];
fputcsv($out, $headers);

// Stream rows
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    // Normalize types
    $sale_product   = $row['sale_product'] ?? '';
    $duration       = isset($row['duration']) ? (int)$row['duration'] : '';
    $customer       = $row['customer'] ?? '';
    $email          = $row['email'] ?? '';
    $purchased_date = $row['purchased_date'] ?? '';
    $expired_date   = $row['expired_date'] ?? '';
    $manager        = $row['manager'] ?? '';
    $note           = $row['note'] ?? '';
    $price          = isset($row['price'])  ? number_format((float)$row['price'],  2, '.', '') : '0.00';

    fputcsv($out, [
        $sale_product,
        $duration === '' ? '' : $duration,
        $customer,
        $email,
        $purchased_date,
        $expired_date,
        $manager,
        $note,
        $price,
    ]);
}

fclose($out);
