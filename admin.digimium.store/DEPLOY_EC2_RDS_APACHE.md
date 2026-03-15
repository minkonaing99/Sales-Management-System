# Deploy on AWS EC2 + RDS (Apache2, PHP)

This guide deploys `admin.digimium.new` on Ubuntu EC2 with Apache2 and Amazon RDS MySQL.

## 1. Prerequisites

- AWS account
- Domain name (optional but recommended)
- SSH key pair (`.pem`)
- Project code in Git

## 2. Create RDS (MySQL)

1. Open AWS Console -> `RDS` -> `Create database`.
2. Engine: `MySQL` (or MariaDB if you use it).
3. Use `Production` or `Dev/Test` template.
4. Set DB name, username, password.
5. In connectivity:

- VPC: same VPC as EC2
- Public access: `No` (recommended)
- Security group: allow MySQL `3306` only from EC2 security group

6. Create DB and wait until status is `Available`.
7. Copy the RDS endpoint (example: `mydb.xxxxx.ap-southeast-1.rds.amazonaws.com`).

## 3. Create EC2 (Ubuntu)

1. Open AWS Console -> `EC2` -> `Launch instance`.
2. AMI: `Ubuntu 22.04 LTS` (recommended).
3. Instance type: at least `t3.micro` for demo.
4. Attach/create security group with:

- `22` SSH from your IP
- `80` HTTP from `0.0.0.0/0`
- `443` HTTPS from `0.0.0.0/0`

5. Launch and connect:

```bash
ssh -i /path/to/key.pem ubuntu@<EC2_PUBLIC_IP>
```

## 4. Install Apache + PHP

```bash
sudo apt update
sudo apt install -y apache2 php php-cli php-mysql php-curl php-mbstring php-xml unzip git
sudo a2enmod rewrite headers deflate expires
sudo systemctl enable apache2
sudo systemctl restart apache2
```

## 5. Deploy project files

```bash
cd /var/www
sudo git clone <YOUR_REPO_URL> admin.digimium.new
sudo chown -R www-data:www-data /var/www/admin.digimium.new
sudo find /var/www/admin.digimium.store -type d -exec chmod 755 {} \;
sudo find /var/www/admin.digimium.store -type f -exec chmod 644 {} \;
```

## 6. Configure environment

```bash
cd /var/www/admin.digimium.new
sudo cp .env.example .env
sudo nano .env
```

Set at least:

```dotenv
DB_HOST=<RDS_ENDPOINT>
DB_PORT=3306
DB_NAME=<DB_NAME>
DB_USER=<DB_USER>
DB_PASS=<DB_PASSWORD>
APP_ENV=production
APP_DEBUG=false
```

## 7. Apache VirtualHost

Create site config:

```bash
sudo nano /etc/apache2/sites-available/admin.digimium.store.conf
```

Use:

```apache
<VirtualHost *:80>
    ServerName admin.digimium.store
    ServerAdmin webmaster@localhost
    DocumentRoot /var/www/admin.digimium.new

    <Directory /var/www/admin.digimium.new>
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/admin_digimium_error.log
    CustomLog ${APACHE_LOG_DIR}/admin_digimium_access.log combined
</VirtualHost>
```

Enable site:

```bash
sudo a2dissite 000-default.conf
sudo a2ensite admin.digimium.store.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

## 8. Import database schema

From local machine (or upload file first):

```bash
mysql -h <RDS_ENDPOINT> -u <DB_USER> -p <DB_NAME> < "new database.sql"
```

If command runs on EC2, make sure MySQL client is installed:

```bash
sudo apt install -y mysql-client
```

## 9. Optional: HTTPS with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d admin.digimium.store
```

Auto-renew test:

```bash
sudo certbot renew --dry-run
```

## 10. Verify deployment

- Open `http://admin.digimium.store` (or EC2 IP).
- Test login.
- Test pages:
- `/sales_overview.php`
- `/product_catalog.php`
- `/product_showcase.php`
- `/summary.php`
- `/user_list.php`
- Check browser Network tab for failed API calls.
- Check logs if issues:

```bash
sudo tail -f /var/log/apache2/admin_digimium_error.log
sudo tail -f /var/log/apache2/admin_digimium_access.log
```

## 11. Security checklist

- Keep `.env` out of Git (already ignored).
- Restrict RDS SG to EC2 SG only.
- Keep EC2 SSH (`22`) limited to your IP.
- Set `APP_DEBUG=false` in production.
- Keep OS packages updated:

```bash
sudo apt update && sudo apt upgrade -y
```

## 12. Update deployment

```bash
cd /var/www/admin.digimium.new
sudo git pull
sudo chown -R www-data:www-data /var/www/admin.digimium.new
sudo systemctl reload apache2
```
