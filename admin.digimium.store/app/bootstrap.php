<?php

declare(strict_types=1);

if (!defined('DIGIMIUM_APP_BOOTSTRAPPED')) {
    define('DIGIMIUM_APP_BOOTSTRAPPED', true);
    define('DIGIMIUM_ROOT', dirname(__DIR__));

    require_once __DIR__ . '/core/Config.php';
    require_once __DIR__ . '/core/Database.php';
    require_once __DIR__ . '/core/Http.php';
    require_once __DIR__ . '/core/ResponseCache.php';
    require_once __DIR__ . '/core/ServiceCatalogStore.php';

    Digimium\Core\Config::boot(DIGIMIUM_ROOT . DIRECTORY_SEPARATOR . '.env');
}
