<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/api/session_bootstrap.php';
require_once dirname(__DIR__) . '/api/auth.php';

use Digimium\Core\Http;
use Digimium\Core\ServiceCatalogStore;

auth_require_login(['admin', 'owner']);
Http::requireMethod(['POST']);

$input = Http::jsonBody();
$category = (string)($input['category'] ?? '');
$index = isset($input['index']) ? (int)$input['index'] : -1;

$map = [
    'popularServices' => 'popular',
    'otherServices' => 'other',
    'popular' => 'popular',
    'other' => 'other',
];
$category = $map[$category] ?? '';

if ($category === '' || $index < 0) {
    Http::json(['error' => 'Category and index are required'], 400);
    exit;
}

$data = ServiceCatalogStore::read();
if ($data === []) {
    Http::json(['error' => 'Services file not found'], 404);
    exit;
}

if (!isset($data[0][$category][$index])) {
    Http::json(['error' => 'Service not found'], 404);
    exit;
}

$service = $data[0][$category][$index];
$photoUrl = (string)($service['photo_url'] ?? '');
if ($photoUrl !== '') {
    $filename = basename($photoUrl);
    if ($filename !== '') {
        $path = rtrim(ServiceCatalogStore::imageDir(), '/\\') . DIRECTORY_SEPARATOR . $filename;
        if (is_file($path)) {
            @unlink($path);
        }
    }
}

array_splice($data[0][$category], $index, 1);

try {
    ServiceCatalogStore::write($data);
    Http::json([
        'success' => true,
        'message' => 'Service deleted successfully!',
    ]);
} catch (Throwable $e) {
    Http::json(['error' => 'Failed to delete service.'], 500);
}
