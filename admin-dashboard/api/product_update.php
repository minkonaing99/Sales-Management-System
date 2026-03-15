<?php
// api/product_update.php
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
        throw new RuntimeException('PDO connection not initialized.');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $hasStoreCol = (bool)$pdo
        ->query("SHOW COLUMNS FROM products_catalog LIKE 'store'")
        ->fetch(PDO::FETCH_ASSOC);

    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON payload.']);
        exit;
    }

    // Required: id
    $id = isset($data['id']) ? (int)$data['id'] : 0;
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing or invalid id.']);
        exit;
    }

    // Optional updatable fields
    $MAX_VARCHAR = 255;
    $MAX_URL_LEN = 2083;

    $trimOrNull = function ($v) {
        if ($v === null) return null;
        $s = trim((string)$v);
        return $s === '' ? null : $s;
    };
    $toInt      = function ($v) {
        if ($v === '' || $v === null || $v === false) return null;
        if (!is_numeric($v)) return null;
        return (int)$v;
    };
    $toDecStr   = function ($v) {
        if ($v === '' || $v === null || $v === false) return null;
        if (!is_numeric($v)) return null;
        return number_format((float)$v, 2, '.', '');
    };

    // renew: accept 1/0, true/false, "yes"/"no"
    $toRenewInt = function ($v) {
        if ($v === '' || $v === null) return null;
        if (is_bool($v)) return $v ? 1 : 0;
        if (is_numeric($v)) return (int)$v;
        $s = strtolower(trim((string)$v));
        if ($s === 'yes' || $s === 'true') return 1;
        if ($s === 'no' || $s === 'false') return 0;
        return null;
    };

    $fields = [];
    $params = [':id' => $id];
    $errors = [];

    // product_name
    if (array_key_exists('product_name', $data)) {
        $product_name = $trimOrNull($data['product_name']);
        if (!$product_name) $errors['product_name'] = 'Product name cannot be empty.';
        elseif (mb_strlen($product_name) > $MAX_VARCHAR) $errors['product_name'] = "Max {$MAX_VARCHAR} characters.";
        else {
            $fields[] = 'product_name = :product_name';
            $params[':product_name'] = $product_name;
        }
    }

    // duration
    if (array_key_exists('duration', $data)) {
        $duration = $toInt($data['duration']);
        if (!is_int($duration) || $duration < 1) $errors['duration'] = 'Duration must be an integer ≥ 1.';
        else {
            $fields[] = 'duration = :duration';
            $params[':duration'] = $duration;
        }
    }

    // renew (INT now)
    if (array_key_exists('renew', $data)) {
        $renew = $toRenewInt($data['renew']);
        if (!is_int($renew) || $renew < 0) {
            $errors['renew'] = 'Renew must be an integer ≥ 0.';
        } else {
            $fields[] = 'renew = :renew';
            $params[':renew'] = $renew;
        }
    }

    // store
    if ($hasStoreCol && array_key_exists('store', $data)) {
        $store = (int)$data['store'];
        if (!in_array($store, [0, 1, 2], true)) {
            $errors['store'] = 'Store must be 0 (Void), 1 (Digimium), or 2 (Dmarwal).';
        } else {
            $fields[] = 'store = :store';
            $params[':store'] = $store;
        }
    }

    // supplier
    if (array_key_exists('supplier', $data)) {
        $supplier = $trimOrNull($data['supplier']);
        if ($supplier !== null && mb_strlen($supplier) > $MAX_VARCHAR) $errors['supplier'] = "Max {$MAX_VARCHAR} characters.";
        else {
            $fields[] = 'supplier = :supplier';
            $params[':supplier'] = $supplier;
        }
    }

    // wholesale
    if (array_key_exists('wholesale', $data)) {
        $wholesale = $toDecStr($data['wholesale']);
        if ($wholesale === null || (float)$wholesale < 0) $errors['wholesale'] = 'Wholesale must be a number ≥ 0.';
        else {
            $fields[] = 'wholesale = :wholesale';
            $params[':wholesale'] = $wholesale;
        }
    }

    // retail
    if (array_key_exists('retail', $data)) {
        $retail = $toDecStr($data['retail']);
        if ($retail === null) $errors['retail'] = 'Retail price is required.';
        else {
            $params[':retail'] = $retail;
            $fields[] = 'retail = :retail';
        }
    }

    // note
    if (array_key_exists('note', $data)) {
        $note = $trimOrNull($data['note']);
        $fields[] = 'note = :note';
        $params[':note'] = $note;
    }

    // link (normalize)
    if (array_key_exists('link', $data)) {
        $link = $trimOrNull($data['link']);
        if ($link !== null) {
            if (!preg_match('~^https?://~i', $link)) $link = 'https://' . $link;
            $link = preg_replace('/\s+/', '%20', $link);
        }
        $fields[] = 'link = :link';
        $params[':link'] = $link;
    }

    if ($errors) {
        http_response_code(422);
        echo json_encode(['success' => false, 'errors' => $errors]);
        exit;
    }

    if (!$fields) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No updatable fields provided.']);
        exit;
    }

    // Enforce retail > wholesale when changed
    if (in_array('retail = :retail', $fields, true) || in_array('wholesale = :wholesale', $fields, true)) {
        $curr = $pdo->prepare('SELECT wholesale, retail FROM products_catalog WHERE product_id = :id');
        $curr->execute([':id' => $id]);
        $row = $curr->fetch();
        if (!$row) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Record not found.']);
            exit;
        }
        $finalWholesale = isset($params[':wholesale']) ? (float)$params[':wholesale'] : (float)$row['wholesale'];
        $finalRetail    = isset($params[':retail'])    ? (float)$params[':retail']    : (float)$row['retail'];
        if ($finalRetail <= $finalWholesale) {
            http_response_code(422);
            echo json_encode(['success' => false, 'errors' => ['retail' => 'Retail must be greater than wholesale.']]);
            exit;
        }
    }

    $sql = 'UPDATE products_catalog SET ' . implode(', ', $fields) . ' WHERE product_id = :id';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    if ($stmt->rowCount() === 0) {
        $exists = $pdo->prepare('SELECT 1 FROM products_catalog WHERE product_id = :id');
        $exists->execute([':id' => $id]);
        if (!$exists->fetchColumn()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Record not found.']);
            exit;
        }
        // no-op update
    }

    // Return updated row
    $storeSelect = $hasStoreCol ? 'store' : '0 AS store';
    $out = $pdo->prepare("SELECT product_id, product_name, duration, renew, supplier, wholesale, retail, note, link, {$storeSelect} FROM products_catalog WHERE product_id = :id");
    $out->execute([':id' => $id]);
    $row = $out->fetch();

    echo json_encode(['success' => true, 'row' => $row]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
