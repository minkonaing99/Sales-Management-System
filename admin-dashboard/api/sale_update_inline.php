<?php

declare(strict_types=1);

require __DIR__ . '/session_bootstrap.php';
require __DIR__ . '/auth.php';

auth_require_login(['admin', 'owner', 'staff']);

// Always JSON, never HTML
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

ob_start(); // capture any accidental output

// Convert warnings/notices into exceptions so we can JSON them
set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) return false;
    throw new ErrorException($message, 0, $severity, $file, $line);
});

function json_fail(string $msg, int $code = 400): void
{
    http_response_code($code);
    // nuke any previous output so we only emit JSON
    if (ob_get_length() !== false) {
        ob_clean();
    }
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    // end buffering
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    exit;
}
function json_ok(array $data = []): void
{
    if (ob_get_length() !== false) {
        ob_clean();
    }
    echo json_encode(['success' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    while (ob_get_level() > 0) {
        ob_end_flush();
    }
    exit;
}

try {
    // Method guard
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_fail('Method not allowed. Use POST.', 405);
    }

    // DB bootstrap (your file defines $pdo)
    require_once __DIR__ . '/dbinfo.php';
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        json_fail('Database connection not available.', 500);
    }

    // Parse JSON body
    $raw  = file_get_contents('php://input') ?: '';
    $body = json_decode($raw, true);
    if (!is_array($body)) $body = [];

    $allowed = ['customer', 'email', 'manager', 'note'];

    // id (accept id | sale_id | saleId)
    $id = $body['id'] ?? ($body['sale_id'] ?? ($body['saleId'] ?? null));
    $id = filter_var($id, FILTER_VALIDATE_INT);
    if (!$id || $id < 1) json_fail('Invalid or missing "id".', 422);

    // Support both shapes: {id, field, value} OR {id, customer/email/manager/note}
    $field = $body['field'] ?? null;
    $value = $body['value'] ?? null;
    if (!$field) {
        foreach ($allowed as $k) {
            if (array_key_exists($k, $body)) {
                $field = $k;
                $value = $body[$k];
                break;
            }
        }
    }
    if (!$field || !in_array($field, $allowed, true)) {
        json_fail('Missing or unsupported "field". Allowed: customer, email, manager, note.', 422);
    }

    // normalize value
    if ($value !== null && !is_string($value)) {
        if (is_scalar($value)) $value = (string)$value;
        else json_fail('Invalid value type.', 422);
    }
    $value = is_string($value) ? trim($value) : null;

    // field-level validation
    switch ($field) {
        case 'customer':
            if ($value === null || $value === '') json_fail('"customer" cannot be empty.', 422);
            if (mb_strlen($value) > 255) json_fail('"customer" too long (max 255).', 422);
            break;

        case 'email':
            if ($value === '') $value = null; // allow clearing
            if ($value !== null) {
                if (!filter_var($value, FILTER_VALIDATE_EMAIL)) json_fail('Invalid email format.', 422);
                if (mb_strlen($value) > 255) json_fail('"email" too long (max 255).', 422);
            }
            break;

        case 'manager':
            if ($value === '') $value = null; // allow clearing
            if ($value !== null && mb_strlen($value) > 255) json_fail('"manager" too long (max 255).', 422);
            break;

        case 'note':
            if ($value === '') $value = null; // allow clearing
            // TEXT is large; cap if you want
            break;
    }

    // Safe because $field is whitelisted above
    $sql = "UPDATE sale_overview SET {$field} = :val WHERE sale_id = :id LIMIT 1";
    $stmt = $pdo->prepare($sql);
    $value === null
        ? $stmt->bindValue(':val', null, PDO::PARAM_NULL)
        : $stmt->bindValue(':val', $value, PDO::PARAM_STR);
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();

    if ($stmt->rowCount() === 0) {
        // unchanged or missing id — check existence
        $check = $pdo->prepare("SELECT COUNT(*) FROM sale_overview WHERE sale_id = :id");
        $check->execute([':id' => $id]);
        if ((int)$check->fetchColumn() === 0) {
            json_fail('Sale not found.', 404);
        }
        // unchanged → still OK
    }

    json_ok([
        'id'    => $id,
        'field' => $field,
        'value' => $value, // normalized (null if cleared)
    ]);
} catch (Throwable $e) {
    // Turn any PHP warning/notice/error into a JSON error
    json_fail('Update failed: ' . $e->getMessage(), 500);
}
