# Digital Subscription Management System

This project is a digital subscription management system built around three connected parts:

- a customer-facing storefront for browsing subscription services
- an internal admin dashboard for managing products, sales, renewals, and staff access
- a Telegram bot for quick operational summaries and renewal-focused notifications

The project is designed to replace spreadsheet-heavy sales tracking with a more structured workflow for a subscription business handling both retail and wholesale orders.

## How The System Works

The public website presents the available digital services and pricing in a clean storefront experience. Service cards are loaded from structured JSON data, grouped into featured and secondary categories, and displayed with pricing, features, and service descriptions.

The admin dashboard acts as the operational center. Staff log in with role-based access and work from dedicated pages for sales entry, product management, reporting, and user administration. Retail and wholesale data flows are handled separately but exposed through the same dashboard UI.

The Telegram bot connects to the same business data and gives quick access to summaries, expiring subscriptions, and renewals. It also supports scheduled notifications so the team can monitor time-sensitive subscription activity without always opening the dashboard.

## Main Components

### `storefront`

This is the customer-facing website.

Its main purpose is to present subscription products clearly and help customers explore available services such as streaming, productivity, and AI tools. The site emphasizes presentation, search visibility, and mobile-friendly browsing.

Key functions:

- displays service listings from structured JSON content
- separates services into popular and other categories
- shows pricing, features, and short descriptions for each service
- includes SEO-focused metadata, structured data, sitemap, and social sharing tags
- uses responsive layouts and animated service cards for a polished browsing experience

### `admin-dashboard`

This is the internal business dashboard.

It centralizes the daily operational work that would otherwise be spread across spreadsheets or manual records. The dashboard is organized into focused pages rather than one overloaded admin screen.

#### Sales Overview

The sales overview page is the main working screen for day-to-day entry and monitoring.

Key functions:

- records retail and wholesale sales from separate workflows
- supports customer name, email, date, seller, amount, notes, and store/source tracking
- lets staff search customer records and refresh live data
- displays sales in table and mobile-friendly list formats
- supports editing and deleting sales entries through connected API endpoints

#### Product Catalog

The product catalog page manages the subscription offerings sold through the business.

Key functions:

- creates and edits products for both retail and wholesale flows
- stores duration, renewable period, supplier, notes, link, wholesale price, and retail price
- maintains structured product records for cleaner order entry and more consistent pricing

#### Summary Dashboard

The summary page focuses on business visibility and follow-up work.

Key functions:

- shows KPI cards for sales, profit, order count, and average profit per order
- supports date-range filtering and comparison views
- highlights subscriptions that are expiring soon
- highlights subscriptions that need renewal action
- displays daily and 30-day charts for sales, profit, and product performance

#### User Management

The user management page is restricted to owner-level access.

Key functions:

- lists admin users and their roles
- creates new staff/admin accounts
- tracks user status, creation time, and last login
- enforces role-based access between staff, admin, and owner accounts

#### Admin Architecture

Beyond the visible pages, the admin app includes a cleaner internal foundation for handling configuration and data access.

Key functions:

- central bootstrap for shared application setup
- centralized configuration and database access
- authenticated API endpoints for dashboard operations
- protected JSON update flows for storefront-related content

### `telegram-bot` and `admin-dashboard/bot`

These Python bot components extend the admin workflow into Telegram.

Key functions:

- provides command-based summaries
- reports expiring subscriptions
- reports renewals that need action
- schedules automatic daily notifications
- connects directly to the business database for live operational data

## Core Business Use Cases

The system supports the typical workflow of a subscription-selling business:

1. maintain a product catalog with pricing and renewal metadata
2. publish offerings through the storefront
3. record incoming sales from the admin dashboard
4. monitor expiring subscriptions and renewal timing
5. review performance through summary KPIs and charts
6. manage team access with role-based permissions
7. receive operational updates through Telegram

## What The Project Solves

This project is built to reduce friction in subscription operations. Instead of relying on scattered manual records, it organizes products, sales, renewal timing, and reporting into a single workflow.

In practical terms, the system helps:

- reduce manual sales-entry overhead
- make product pricing and duration data more consistent
- improve visibility into expiring subscriptions and renewals
- give staff and owners faster access to sales performance data
- support daily operations through both web and Telegram interfaces

## Technology Overview

- Frontend: HTML, CSS, JavaScript
- Admin/backend: PHP
- Data layer: MySQL and JSON-based storefront content
- Automation: Python Telegram bot
- Hosting/infrastructure target: Apache-style PHP deployment with database-backed admin services

## Repository Structure

```text
digimium/
├── storefront/             # Customer-facing storefront
├── admin-dashboard/       # Admin dashboard and APIs
├── telegram-bot/               # Telegram bot entry point
└── database_backup.rar         # Database backup artifact
```

## Summary

This repository contains a small business operations platform for digital subscription sales. Its storefront helps present products clearly, its admin dashboard handles the operational workload, and its Telegram bot extends reporting and renewal monitoring into a faster communication channel.
