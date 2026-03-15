<?php
// api/sale_insertion.php
declare(strict_types=1);

require __DIR__ . '/session_bootstrap.php';
require __DIR__ . '/auth.php';

auth_require_login(['admin', 'owner', 'staff']);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Use POST.']);
    exit;
}

require __DIR__ . '/dbinfo.php';

try {
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        throw new RuntimeException('PDO connection not initialized. Check dbinfo.php');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // Read JSON
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON payload.']);
        exit;
    }

    // Helpers
    $MAX_VARCHAR = 255;
    $ALLOWED_RENEW = [0, 1, 2, 3, 4, 5, 6, 12];

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
    $toDecStr = function ($v) {
        if ($v === '' || $v === null || $v === false) return null;
        if (!is_numeric($v)) return null;
        return number_format((float)$v, 2, '.', ''); // DECIMAL(10,2) safe string
    };
    $isYmd = function ($s) {
        if (!is_string($s) || $s === '') return false;
        $dt = DateTime::createFromFormat('Y-m-d', $s);
        return $dt && $dt->format('Y-m-d') === $s;
    };
    $addMonthsYmd = function (string $ymd, int $months) {
        // End-of-month safe add
        $dt = DateTime::createFromFormat('Y-m-d', $ymd, new DateTimeZone('UTC'));
        if (!$dt) return null;
        $day = (int)$dt->format('d');
        $dt->modify('first day of this month');
        $dt->modify("+{$months} month");
        // clamp to month end
        $lastDay = (int)$dt->format('t');
        $dt->setDate((int)$dt->format('Y'), (int)$dt->format('m'), min($day, $lastDay));
        return $dt->format('Y-m-d');
    };

    // Extract + normalize
    $sale_product   = $trimOrNull($data['sale_product'] ?? null); // name snapshot
    $duration       = $toInt($data['duration'] ?? null);

    // renew is now INTEGER (0,1,2,3,4,5,6,12); default 0 if missing
    $renewRaw = $data['renew'] ?? 0;
    $renew    = is_numeric($renewRaw) ? (int)$renewRaw : 0;

    $customer       = $trimOrNull($data['customer'] ?? null);
    $email          = $trimOrNull($data['email'] ?? null);
    $purchased_date = $trimOrNull($data['purchased_date'] ?? null);
    $expired_date   = $trimOrNull($data['expired_date'] ?? null); // optional; compute if missing
    $manager        = $trimOrNull($data['manager'] ?? null);
    $note           = $trimOrNull($data['note'] ?? null);
    $priceStr       = $toDecStr($data['price'] ?? null);
    $profitStr      = $toDecStr($data['profit'] ?? null);
    $store          = $toInt($data['store'] ?? null);

    // Validate
    $errors = [];

    if (!in_array($store, [0, 1, 2, 3, 4, 5], true)) {
        $errors['store'] = 'Invalid store selected.';
    }

    if (!$sale_product) {
        $errors['sale_product'] = 'Product is required.';
    } elseif (mb_strlen($sale_product) > $MAX_VARCHAR) {
        $errors['sale_product'] = "Max {$MAX_VARCHAR} characters.";
    }

    if (!is_int($duration) || $duration < 1) {
        $errors['duration'] = 'Duration must be an integer ≥ 1 (months).';
    }

    // renew must be allowed integer
    if (!in_array($renew, $ALLOWED_RENEW, true)) {
        $errors['renew'] = 'Renew must be one of 0,1,2,3,4,5,6,12.';
    }

    if (!$customer) {
        $errors['customer'] = 'Customer is required.';
    } elseif (mb_strlen($customer) > $MAX_VARCHAR) {
        $errors['customer'] = "Max {$MAX_VARCHAR} characters.";
    }

    if (!$purchased_date || !$isYmd($purchased_date)) {
        $errors['purchased_date'] = 'Purchase date must be YYYY-MM-DD.';
    }

    if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors['email'] = 'Invalid email address.';
    }

    if ($manager !== null && mb_strlen($manager) > $MAX_VARCHAR) {
        $errors['manager'] = "Max {$MAX_VARCHAR} characters.";
    }

    if ($note !== null && mb_strlen($note) > 65535) {
        $errors['note'] = 'Note is too long.';
    }

    if ($priceStr === null || (float)$priceStr < 0) {
        $errors['price'] = 'Price must be a number ≥ 0.';
    }
    if ($profitStr === null) {
        $errors['profit'] = 'Profit must be provided (number).';
    }

    // Compute expired_date if not provided and we have valid inputs
    if (!$expired_date && isset($purchased_date, $duration) && $isYmd($purchased_date) && is_int($duration) && $duration >= 1) {
        $expired_date = $addMonthsYmd($purchased_date, $duration);
    }
    if ($expired_date !== null && !$isYmd($expired_date)) {
        $errors['expired_date'] = 'Expired date must be YYYY-MM-DD.';
    }

    if ($errors) {
        http_response_code(422);
        echo json_encode(['success' => false, 'errors' => $errors]);
        exit;
    }

    // Insert
    $sql = "
        INSERT INTO sale_overview
            (sale_product, duration, renew, customer, email, purchased_date, expired_date, manager, note, price, profit, store)
        VALUES
            (:sale_product, :duration, :renew, :customer, :email, :purchased_date, :expired_date, :manager, :note, :price, :profit, :store)
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':sale_product'   => $sale_product,
        ':duration'       => $duration,
        ':renew'          => $renew, // store integer (0/1/2/3/4/5/6/12), no boolean coercion
        ':customer'       => $customer,
        ':email'          => $email,
        ':purchased_date' => $purchased_date,
        ':expired_date'   => $expired_date,
        ':manager'        => $manager,
        ':note'           => $note,
        ':price'          => $priceStr,
        ':profit'         => $profitStr,
        ':store'          => $store
    ]);

    $id = (int)$pdo->lastInsertId();
    http_response_code(201);
    echo json_encode(['success' => true, 'id' => $id]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
