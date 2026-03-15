<?php

declare(strict_types=1);

namespace Digimium\Core;

final class Config
{
    private static array $env = [];
    private static bool $booted = false;

    public static function boot(string $envFile): void
    {
        if (self::$booted) {
            return;
        }

        self::$booted = true;
        self::$env = self::parseEnv($envFile);
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        $value = self::$env[$key] ?? getenv($key);
        if ($value === false || $value === null || $value === '') {
            return $default;
        }
        return (string)$value;
    }

    public static function int(string $key, int $default): int
    {
        $value = self::get($key);
        if ($value === null || !is_numeric($value)) {
            return $default;
        }
        return (int)$value;
    }

    public static function bool(string $key, bool $default): bool
    {
        $value = strtolower((string)self::get($key, $default ? 'true' : 'false'));
        return in_array($value, ['1', 'true', 'yes', 'on'], true);
    }

    public static function rootPath(string $relative = ''): string
    {
        $path = DIGIMIUM_ROOT;
        if ($relative !== '') {
            $path .= DIRECTORY_SEPARATOR . ltrim($relative, '/\\');
        }
        return $path;
    }

    public static function storefrontPath(string $relative = ''): string
    {
        $configured = self::get('DIGIMIUM_STOREFRONT_PATH');
        $base = $configured ?: dirname(DIGIMIUM_ROOT) . DIRECTORY_SEPARATOR . 'digimium.store';
        if ($relative === '') {
            return $base;
        }
        return rtrim($base, '/\\') . DIRECTORY_SEPARATOR . ltrim($relative, '/\\');
    }

    private static function parseEnv(string $path): array
    {
        if (!is_file($path)) {
            return [];
        }

        $out = [];
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            return [];
        }

        foreach ($lines as $line) {
            $trim = trim($line);
            if ($trim === '' || str_starts_with($trim, '#')) {
                continue;
            }

            $parts = explode('=', $trim, 2);
            if (count($parts) !== 2) {
                continue;
            }

            $key = trim($parts[0]);
            $val = trim($parts[1]);
            $val = trim($val, "\"'");
            $out[$key] = $val;

            if (getenv($key) === false) {
                putenv($key . '=' . $val);
            }
        }

        return $out;
    }
}
