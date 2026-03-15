<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/api/session_bootstrap.php';
require_once dirname(__DIR__) . '/api/auth.php';

use Digimium\Core\Http;
use Digimium\Core\ServiceCatalogStore;

auth_require_login(['admin', 'owner']);
Http::requireMethod(['POST']);

$name = trim((string)($_POST['name'] ?? ''));
$description = trim((string)($_POST['description'] ?? ''));
$category = trim((string)($_POST['category'] ?? ''));
$isEditing = isset($_POST['is_editing']) && $_POST['is_editing'] === 'true';
$originalCategory = trim((string)($_POST['original_category'] ?? ''));
$originalIndex = isset($_POST['original_index']) ? (int)$_POST['original_index'] : -1;

$prices = isset($_POST['price']) && is_array($_POST['price']) ? $_POST['price'] : [];
$features = isset($_POST['features']) && is_array($_POST['features']) ? $_POST['features'] : [];

$categoryMap = [
    'popularServices' => 'popular',
    'otherServices' => 'other',
    'popular' => 'popular',
    'other' => 'other',
];
$normalizedCategory = $categoryMap[$category] ?? '';
$normalizedOriginalCategory = $categoryMap[$originalCategory] ?? '';

if ($name === '' || $normalizedCategory === '') {
    Http::json(['error' => 'Name and category are required'], 400);
    exit;
}

$currentData = ServiceCatalogStore::read();
if ($currentData === []) {
    $currentData = [['popular' => [], 'other' => []]];
}
if (!isset($currentData[0]['popular']) || !is_array($currentData[0]['popular'])) {
    $currentData[0]['popular'] = [];
}
if (!isset($currentData[0]['other']) || !is_array($currentData[0]['other'])) {
    $currentData[0]['other'] = [];
}

$photoUrl = '';
if (isset($_FILES['photo']) && ($_FILES['photo']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
    $uploaded = $_FILES['photo'];
    $ext = strtolower((string)pathinfo((string)$uploaded['name'], PATHINFO_EXTENSION));

    if (!in_array($ext, ['jpg', 'jpeg', 'png'], true)) {
        Http::json(['error' => 'Only JPG and PNG files are allowed'], 400);
        exit;
    }
    if ((int)$uploaded['size'] > 1024 * 1024) {
        Http::json(['error' => 'File size must be less than 1MB'], 400);
        exit;
    }

    $uploadDir = ServiceCatalogStore::imageDir();
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
        Http::json(['error' => 'Failed to create upload directory'], 500);
        exit;
    }

    $safeName = preg_replace('/[^a-z0-9]+/i', '', strtolower($name)) ?: ('svc' . time());
    $filename = $safeName . '.' . $ext;
    $fullPath = rtrim($uploadDir, '/\\') . DIRECTORY_SEPARATOR . $filename;

    if (!move_uploaded_file((string)$uploaded['tmp_name'], $fullPath)) {
        Http::json(['error' => 'Failed to save uploaded file'], 500);
        exit;
    }

    $photoUrl = ServiceCatalogStore::publicImageUrl($filename);
}

$serviceData = [
    'name' => $name,
    'price' => array_values($prices),
    'features' => array_values($features),
    'description' => $description,
    'photo_url' => $photoUrl,
];

if ($isEditing) {
    if (
        $normalizedOriginalCategory === '' ||
        $originalIndex < 0 ||
        !isset($currentData[0][$normalizedOriginalCategory][$originalIndex])
    ) {
        Http::json(['error' => 'Invalid service to edit'], 400);
        exit;
    }

    if ($serviceData['photo_url'] === '') {
        $serviceData['photo_url'] = (string)($currentData[0][$normalizedOriginalCategory][$originalIndex]['photo_url'] ?? '');
    }

    array_splice($currentData[0][$normalizedOriginalCategory], $originalIndex, 1);
    $currentData[0][$normalizedCategory][] = $serviceData;
} else {
    $currentData[0][$normalizedCategory][] = $serviceData;
}

try {
    ServiceCatalogStore::write($currentData);
    Http::json([
        'success' => true,
        'message' => $isEditing ? 'Service updated successfully!' : 'New service added successfully!',
        'service' => $serviceData,
    ]);
} catch (Throwable $e) {
    Http::json(['error' => 'Failed to save service.'], 500);
}
