<?php
// api/ws_sales_table.php
declare(strict_types=1);

require __DIR__ . '/session_bootstrap.php';
require __DIR__ . '/auth.php';
require_once dirname(__DIR__) . '/app/bootstrap.php';

use Digimium\Core\ResponseCache;

auth_require_login(['admin', 'owner', 'staff']);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=30, must-revalidate');

require __DIR__ . '/dbinfo.php';

try {
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        throw new RuntimeException('PDO connection not initialized. Check dbinfo.php');
    }

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $limit = isset($_GET['limit']) ? max(1, (int)$_GET['limit']) : 500;
    if ($limit > 2000) {
        $limit = 2000;
    }
    $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0; // legacy support
    $cursor = trim((string)($_GET['cursor'] ?? ''));
    $q = trim((string)($_GET['q'] ?? ''));
    if (strlen($q) > 100) {
        $q = substr($q, 0, 100);
    }

    $fpStmt = $pdo->query('SELECT COALESCE(MAX(sale_id),0) AS max_id, COUNT(*) AS cnt FROM ws_sale_overview');
    $fp = $fpStmt->fetch();
    $fingerprint = ((int)($fp['max_id'] ?? 0)) . ':' . ((int)($fp['cnt'] ?? 0));

    $cacheKey = 'ws_sales_table:v3:' . $fingerprint . ':l' . $limit . ':o' . $offset . ':c' . $cursor . ':q' . strtolower($q);
    $etag = '"' . sha1($cacheKey) . '"';
    header('ETag: ' . $etag);

    $ifNoneMatch = trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
    if ($ifNoneMatch !== '' && $ifNoneMatch === $etag) {
        http_response_code(304);
        exit;
    }

    $cached = ResponseCache::get($cacheKey, 30);
    if (is_string($cached)) {
        echo $cached;
        exit;
    }

    $cursorDate = null;
    $cursorId = null;
    if ($cursor !== '') {
        $decoded = base64_decode(strtr($cursor, '-_', '+/'), true);
        if (is_string($decoded) && strpos($decoded, '|') !== false) {
            [$cd, $ci] = explode('|', $decoded, 2);
            $cd = trim((string)$cd);
            $ci = trim((string)$ci);
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $cd) && ctype_digit($ci)) {
                $cursorDate = $cd;
                $cursorId = (int)$ci;
            }
        }
    }

    $sql = "
        SELECT
            sale_id,
            sale_product,
            duration,
            quantity,
            renew,
            customer,
            email,
            purchased_date,
            expired_date,
            manager,
            note,
            price,
            profit
        FROM ws_sale_overview
    ";

    $where = [];
    $params = [];
    if ($q !== '') {
        $where[] = '(sale_product LIKE :q1 OR customer LIKE :q2 OR email LIKE :q3 OR manager LIKE :q4 OR purchased_date LIKE :q5 OR expired_date LIKE :q6)';
        $qLike = '%' . $q . '%';
        $params[':q1'] = $qLike;
        $params[':q2'] = $qLike;
        $params[':q3'] = $qLike;
        $params[':q4'] = $qLike;
        $params[':q5'] = $qLike;
        $params[':q6'] = $qLike;
    }
    if ($cursorDate !== null && $cursorId !== null) {
        $where[] = '(purchased_date < :cursor_date OR (purchased_date = :cursor_date AND sale_id < :cursor_id))';
        $params[':cursor_date'] = $cursorDate;
        $params[':cursor_id'] = $cursorId;
    }
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }

    $sql .= ' ORDER BY purchased_date DESC, sale_id DESC';

    if ($cursor === '' && $offset > 0) {
        $sql .= ' LIMIT :limit OFFSET :offset';
        $stmt = $pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
    } else {
        $sql .= ' LIMIT :limit_plus_one';
        $stmt = $pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit_plus_one', $limit + 1, PDO::PARAM_INT);
        $stmt->execute();
    }

    $rows = $stmt->fetchAll();
    $hasMore = false;
    if ($cursor !== '' || $offset === 0) {
        if (count($rows) > $limit) {
            $hasMore = true;
            array_pop($rows);
        }
    }

    foreach ($rows as &$r) {
        $r['sale_id'] = isset($r['sale_id']) ? (int)$r['sale_id'] : null;
        $r['duration'] = isset($r['duration']) ? (int)$r['duration'] : null;
        $r['quantity'] = isset($r['quantity']) ? (int)$r['quantity'] : 1;
        $r['renew'] = isset($r['renew']) ? (int)$r['renew'] : 0;
        $r['price'] = isset($r['price']) ? (float)$r['price'] : 0.0;
        $r['profit'] = isset($r['profit']) ? (float)$r['profit'] : 0.0;
        $r['sale_product'] = $r['sale_product'] ?? null;
        $r['customer'] = $r['customer'] ?? null;
        $r['email'] = $r['email'] ?? null;
        $r['purchased_date'] = $r['purchased_date'] ?? null;
        $r['expired_date'] = $r['expired_date'] ?? null;
        $r['manager'] = $r['manager'] ?? null;
        $r['note'] = $r['note'] ?? null;
    }
    unset($r);

    $nextCursor = null;
    if ($hasMore && !empty($rows)) {
        $last = $rows[count($rows) - 1];
        $token = ($last['purchased_date'] ?? '') . '|' . (string)($last['sale_id'] ?? '');
        $nextCursor = rtrim(strtr(base64_encode($token), '+/', '-_'), '=');
    }

    $payload = json_encode(
        [
            'success' => true,
            'data' => $rows,
            'meta' => [
                'limit' => $limit,
                'has_more' => $hasMore,
                'next_cursor' => $nextCursor,
            ],
        ],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION
    );
    if (!is_string($payload)) {
        throw new RuntimeException('Failed to encode JSON payload.');
    }

    ResponseCache::put($cacheKey, $payload);
    echo $payload;
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(
        ['success' => false, 'error' => $e->getMessage()],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
}
