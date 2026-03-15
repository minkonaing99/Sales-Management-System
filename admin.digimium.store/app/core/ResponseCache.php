<?php

declare(strict_types=1);

namespace Digimium\Core;

final class ResponseCache
{
    private const EXT = '.json';

    public static function get(string $key, int $ttlSeconds): ?string
    {
        $path = self::pathForKey($key);
        if (!is_file($path)) {
            return null;
        }

        $raw = @file_get_contents($path);
        if (!is_string($raw) || $raw === '') {
            return null;
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            @unlink($path);
            return null;
        }

        $createdAt = (int)($decoded['created_at'] ?? 0);
        $value = $decoded['value'] ?? null;
        if ($createdAt <= 0 || !is_string($value)) {
            @unlink($path);
            return null;
        }

        if ((time() - $createdAt) > $ttlSeconds) {
            @unlink($path);
            return null;
        }

        return $value;
    }

    public static function put(string $key, string $value): void
    {
        $path = self::pathForKey($key);
        $dir = dirname($path);
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            return;
        }

        $payload = json_encode([
            'created_at' => time(),
            'value' => $value,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($payload) || $payload === '') {
            return;
        }

        $tmp = $path . '.tmp';
        if (@file_put_contents($tmp, $payload, LOCK_EX) === false) {
            return;
        }

        @rename($tmp, $path);
    }

    private static function pathForKey(string $key): string
    {
        $safe = hash('sha256', $key);
        return Config::rootPath('app/cache/response/' . $safe . self::EXT);
    }
}
