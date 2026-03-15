<?php
// api/ws_product_insertion.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST'); // POST only

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Use POST.']);
    exit;
}

require_once __DIR__ . '/session_bootstrap.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/dbinfo.php';

auth_require_login(['admin', 'owner']);

try {
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        throw new RuntimeException('PDO connection not initialized. Check dbinfo.php');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // Read JSON body
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new InvalidArgumentException('Invalid JSON payload.');
    }

    // Helpers
    $MAX_VARCHAR = 255;
    $MAX_URL_LEN = 2083;
    $ALLOWED_RENEW = [0, 1, 2, 3, 4, 5, 12];

    $trimOrNull = function ($v) {
        if ($v === null) return null;
        $s = trim((string)$v);
        return $s === '' ? null : $s;
    };
    $toInt = function ($v) {
        if ($v === '' || $v === null || $v === false) return null;
        if (!is_numeric($v)) return null;
        return (int)$v;
    };
    $toDecimalString = function ($v) {
        if ($v === '' || $v === null || $v === false) return null;
        if (!is_numeric($v)) return null;
        return number_format((float)$v, 2, '.', ''); // DECIMAL(10,2) safe string
    };


    // Extract & normalize
    $product_name = $trimOrNull($data['product_name'] ?? null);
    $duration     = $toInt($data['duration'] ?? null);

    // renew: numbers only (0,1,2,3,4,5,12). Default to 0 if missing/empty.
    $renewRaw = $data['renew'] ?? null;
    $renew    = ($renewRaw === '' || $renewRaw === null) ? 0 : $toInt($renewRaw);

    $supplier     = $trimOrNull($data['supplier'] ?? null);
    $wholesaleStr = $toDecimalString($data['wholesale'] ?? null);
    $retailStr    = $toDecimalString($data['retail'] ?? null);
    $note         = $trimOrNull($data['note'] ?? null);
    $link         = $trimOrNull($data['link'] ?? null);

    // Make link forgiving
    if ($link !== null) {
        if (!preg_match('~^https?://~i', $link)) {
            $link = 'https://' . $link;
        }
        $link = preg_replace('/\s+/', '%20', $link);
    }

    // Validate
    $errors = [];
    if (!$product_name) {
        $errors['product_name'] = 'Product name is required.';
    } elseif (mb_strlen($product_name) > $MAX_VARCHAR) {
        $errors['product_name'] = "Max {$MAX_VARCHAR} characters.";
    }

    if (!is_int($duration) || $duration < 1) {
        $errors['duration'] = 'Duration must be an integer ≥ 1.';
    }

    if (!is_int($renew) || !in_array($renew, $ALLOWED_RENEW, true)) {
        $errors['renew'] = 'Renew must be one of 0,1,2,3,4,5,12.';
    }

    if ($supplier !== null && mb_strlen($supplier) > $MAX_VARCHAR) {
        $errors['supplier'] = "Max {$MAX_VARCHAR} characters.";
    }

    if ($wholesaleStr === null || (float)$wholesaleStr < 0) {
        $errors['wholesale'] = 'Wholesale must be a number ≥ 0.';
    }

    if ($retailStr === null) {
        $errors['retail'] = 'Retail price is required.';
    } elseif ((float)$retailStr <= (float)$wholesaleStr) {
        $errors['retail'] = 'Retail must be greater than wholesale.';
    }

    if ($errors) {
        http_response_code(422);
        echo json_encode(['success' => false, 'errors' => $errors]);
        exit;
    }

    // Insert into wholesale table
    $sql = "
        INSERT INTO ws_products_catalog
            (product_name, duration, renew, supplier, wholesale, retail, note, link)
        VALUES
            (:product_name, :duration, :renew, :supplier, :wholesale, :retail, :note, :link)
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':product_name' => $product_name,
        ':duration'     => $duration,
        ':renew'        => $renew, // integer only
        ':supplier'     => $supplier,
        ':wholesale'    => $wholesaleStr,
        ':retail'       => $retailStr,
        ':note'         => $note,
        ':link'         => $link
    ]);

    $id = (int)$pdo->lastInsertId();

    http_response_code(201);
    echo json_encode(['success' => true, 'id' => $id]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
