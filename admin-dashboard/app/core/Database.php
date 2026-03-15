<?php

declare(strict_types=1);

namespace Digimium\Core;

use PDO;
use PDOException;
use RuntimeException;

final class Database
{
    private static ?PDO $pdo = null;

    public static function connection(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $host = Config::get('DIGIMIUM_DB_HOST', 'localhost');
        $port = Config::int('DIGIMIUM_DB_PORT', 3307);
        $name = Config::get('DIGIMIUM_DB_NAME', 'digimium_panel');
        $user = Config::get('DIGIMIUM_DB_USER', 'root');
        $pass = Config::get('DIGIMIUM_DB_PASS', '');

        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $name);

        try {
            self::$pdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            throw new RuntimeException('Database connection failed.');
        }

        return self::$pdo;
    }
}
