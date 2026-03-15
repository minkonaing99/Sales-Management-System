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
if (!is_array($input) || $input === []) {
    Http::json(['error' => 'Invalid JSON data'], 400);
    exit;
}

try {
    ServiceCatalogStore::write($input);
    Http::json([
        'success' => true,
        'message' => 'Services data updated successfully!',
    ]);
} catch (Throwable $e) {
    Http::json(['error' => 'Failed to save changes.'], 500);
}
