<?php
// api/ws_sales_export_csv.php
declare(strict_types=1);

require __DIR__ . '/session_bootstrap.php';
require __DIR__ . '/auth.php';

auth_require_login(['admin', 'owner']);

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="wholesale_sales_' . date('Y-m-d') . '.csv"');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/dbinfo.php';

try {
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        throw new RuntimeException('PDO connection not initialized. Check dbinfo.php');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $sql = "SELECT 
                sale_product,
                duration,
                quantity,
                customer,
                email,
                purchased_date,
                expired_date,
                manager,
                note,
                price
            FROM ws_sale_overview 
            ORDER BY purchased_date DESC, sale_id DESC LIMIT 200";

    $stmt = $pdo->query($sql);
    $sales = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Create output stream
    $output = fopen('php://output', 'w');

    // Add BOM for UTF-8
    fprintf($output, chr(0xEF) . chr(0xBB) . chr(0xBF));

    // CSV headers
    fputcsv($output, [
        'Product',
        'Duration',
        'Quantity',
        'Customer',
        'Email',
        'Purchase Date',
        'Expired Date',
        'Manager',
        'Note',
        'Price (Ks)'
    ]);

    // CSV data rows
    foreach ($sales as $sale) {
        fputcsv($output, [
            $sale['sale_product'],
            $sale['duration'] ?? '',
            $sale['quantity'],
            $sale['customer'],
            $sale['email'] ?? '',
            $sale['purchased_date'],
            $sale['expired_date'] ?? '',
            $sale['manager'] ?? '',
            $sale['note'] ?? '',
            number_format($sale['price'], 0)
        ]);
    }

    fclose($output);
} catch (Throwable $e) {
    http_response_code(500);
    echo "Error: " . $e->getMessage();
}
