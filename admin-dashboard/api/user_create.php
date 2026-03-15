<?php
// api/user_create.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/dbinfo.php'; // defines $pdo

function json_fail(string $msg, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}
function json_ok(array $data = [], int $code = 200): void
{
    http_response_code($code);
    echo json_encode(['success' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

// ---- Read JSON body ----
$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '[]', true);
if (!is_array($body)) $body = [];

$username = trim((string)($body['username'] ?? ''));
$password = (string)($body['password'] ?? '');
$roleIn   = trim((string)($body['role'] ?? 'Staff'));

// ---- Validate username ----
if ($username === '') json_fail('Username is required.', 422);
if (mb_strlen($username) < 3 || mb_strlen($username) > 50) {
    json_fail('Username must be 3–50 characters.', 422);
}
// Optional: restrict characters
if (!preg_match('/^[A-Za-z0-9._-]+$/', $username)) {
    json_fail('Username can only contain letters, numbers, dot, underscore, and hyphen.', 422);
}

// ---- Validate password (>=10, one uppercase, one number, one special) ----
if ($password === '') json_fail('Password is required.', 422);
if (mb_strlen($password) < 10) json_fail('Password must be at least 10 characters.', 422);
if (!preg_match('/[A-Z]/', $password)) json_fail('Password needs at least one uppercase letter.', 422);
if (!preg_match('/\d/', $password))  json_fail('Password needs at least one number.', 422);
if (!preg_match('/[^A-Za-z0-9]/', $password)) json_fail('Password needs at least one special character.', 422);

// ---- Normalize role to match ENUM('Owner','Admin','Staff') ----
$map = [
    'owner' => 'Owner',
    'admin' => 'Admin',
    'staff' => 'Staff'
];
$roleKey = strtolower($roleIn);
$role = $map[$roleKey] ?? 'Staff';

// ---- Hash password ----
$algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
$hash = password_hash($password, $algo);
if ($hash === false) json_fail('Failed to hash password.', 500);

// ---- Insert ----
$sql = "INSERT INTO users (username, pass_hash, role) VALUES (:u, :h, :r)";
try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':u' => $username,
        ':h' => $hash,
        ':r' => $role
    ]);
    $id = (int)$pdo->lastInsertId();
    json_ok(['user_id' => $id, 'username' => $username, 'role' => $role], 201);
} catch (Throwable $e) {
    // Duplicate username (unique key)
    if ((string)$e->getCode() === '23000') {
        json_fail('Username is already taken.', 409);
    }
    // Uncomment for quick debugging (remove in prod):
    // json_fail('Failed to create user: '.$e->getMessage(), 500);
    json_fail('Failed to create user.', 500);
}
