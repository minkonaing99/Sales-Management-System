<?php

declare(strict_types=1);

namespace Digimium\Core;

use RuntimeException;

final class ServiceCatalogStore
{
    public static function dataFile(): string
    {
        return Config::storefrontPath('data/services.json');
    }

    public static function imageDir(): string
    {
        return Config::storefrontPath('images/services');
    }

    public static function publicImageUrl(string $filename): string
    {
        return '/images/services/' . ltrim($filename, '/\\');
    }

    public static function read(): array
    {
        $path = self::dataFile();
        if (!is_file($path)) {
            return [];
        }

        $raw = file_get_contents($path);
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    public static function write(array $data): void
    {
        $path = self::dataFile();
        $dir = dirname($path);
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new RuntimeException('Failed to create services directory.');
        }

        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('Failed to encode services JSON.');
        }

        $tmp = $path . '.tmp';
        if (file_put_contents($tmp, $json, LOCK_EX) === false) {
            throw new RuntimeException('Failed to write temporary services file.');
        }
        if (!rename($tmp, $path)) {
            @unlink($tmp);
            throw new RuntimeException('Failed to replace services file.');
        }
    }
}
