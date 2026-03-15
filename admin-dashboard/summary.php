<?php

declare(strict_types=1);
// Summary dashboard for admin/owner roles.
// The page itself is mostly static markup; all KPIs/tables/charts are populated
// client-side by `js/summary_table.js` and `js/deplay_chart.js`.
require __DIR__ . '/api/session_bootstrap.php';
require __DIR__ . '/api/auth.php';

auth_require_login(['admin', 'owner']);

$role = ucfirst($_SESSION['user']['role'] ?? '');
$user = htmlspecialchars($_SESSION['user']['username'] ?? 'Guest', ENT_QUOTES);
?>

<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Digimium • Summary</title>
    <link rel="stylesheet" href="./style/style.min.css?v=<?php echo filemtime(__DIR__ . '/style/style.min.css'); ?>">
    <link rel="stylesheet" href="./style/summary.min.css?v=<?php echo filemtime(__DIR__ . '/style/summary.min.css'); ?>">


</head>

<body>
    <header id="navbar">
        <div class="logo" aria-label="Home">
            <a href="./sales_overview.php"><img src="./assets/logo_digimium.png" alt="Logo"></a>
        </div>

        <nav aria-label="Primary">
            <div class="nav-links" id="navLinks">
                <a href="sales_overview.php">Sales Overview</a>
                <?php if (in_array(($_SESSION['user']['role'] ?? ''), ['admin', 'owner'])): ?>
                    <a href="product_catalog.php" aria-label="Product Catalog">Product Catalog</a>
                    <a href="product_showcase.php" aria-label="Product Showcase">Product Showcase</a>
                    <a href="summary.php" aria-label="Summary">Summary</a>
                <?php endif; ?>
                <?php if (in_array(($_SESSION['user']['role'] ?? ''), ['owner'])): ?>
                    <a href="user_list.php" aria-label="User List">User List</a>
                <?php endif; ?>
                <a href="#" aria-label="LogOut" id="logoutBtn">Log Out</a>


            </div>

            <button class="burger" id="burger" aria-label="Menu Toggle">
                <div></div>
                <div></div>
                <div></div>
            </button>
        </nav>
    </header>

    <main class="page" role="main">


        <section class="era-table-card mb " aria-labelledby="tbl-title">
            <div class="menu-bar">
                <h2 id="tbl-title" class="era-table-title">Summary</h2>
                <div class="summary-filter-bar" aria-label="Summary period filter">
                    <label for="summary_preset">Preset</label>
                    <select id="summary_preset">
                        <option value="today" selected>Today</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="this_month">This Month</option>
                        <option value="last_month">Last Month</option>
                        <option value="custom">Custom</option>
                    </select>
                    <label for="summary_from_date">From</label>
                    <input type="date" id="summary_from_date">
                    <label for="summary_to_date">To</label>
                    <input type="date" id="summary_to_date">
                    <button id="summary_apply_range" type="button">Apply</button>
                    <label class="summary-compare-toggle">
                        <input type="checkbox" id="summary_compare_toggle">
                        <span>Compare</span>
                    </label>
                </div>
            </div>
            <!-- KPI Summary -->
            <div class="kpi-grid">
                <article class="kpi-card" data-kpi="period_sales">
                    <div class="kpi-label">Period Sales</div>
                    <div class="kpi-value" data-target="0" data-suffix=" Ks">0
                    </div>
                    <div class="kpi-compare">-</div>
                </article>

                <article class="kpi-card" data-kpi="period_profits">
                    <div class="kpi-label">Period Profits</div>
                    <div class="kpi-value" data-target="0" data-suffix=" Ks">0</div>
                    <div class="kpi-compare">-</div>
                </article>

                <article class="kpi-card" data-kpi="period_orders">
                    <div class="kpi-label">Period Orders</div>
                    <div class="kpi-value" data-target="0">0</div>
                    <div class="kpi-compare">-</div>
                </article>

                <article class="kpi-card" data-kpi="avg_profit_order">
                    <div class="kpi-label">Avg Profit / Order</div>
                    <div class="kpi-value" data-target="0" data-suffix=" Ks">0</div>
                    <div class="kpi-compare">-</div>
                </article>
            </div>
        </section>

        <section class="era-table-card mb destop-table" aria-labelledby="tbl-title">
            <div class="menu-bar">
                <h2 id="tbl-title" class="era-table-title">Expire Soon</h2>
                <div class="expire-filter-bar" aria-label="Expire date filter">
                    <label for="expire_from_date">From</label>
                    <input type="date" id="expire_from_date">
                    <label for="expire_to_date">To</label>
                    <input type="date" id="expire_to_date">
                </div>
            </div>

            <!-- Table -->
            <div class="era-table-wrap">
                <table class="era-table" role="table" aria-label="Subscriptions table">
                    <thead>
                        <tr>
                            <th class="era-num">#</th>
                            <th>Product</th>
                            <th style="text-align: center;">Customer</th>
                            <th class="era-email">Email</th>
                            <th style="text-align: center;">Purchased</th>
                            <th style="text-align: center;">End Date</th>
                            <th style="text-align: right;">Date Left</th>
                        </tr>
                    </thead>
                    <tbody id="expire_soon">
                    </tbody>
                </table>
            </div>
        </section>

        <section class="era-table-card mb destop-table" aria-labelledby="tbl-title">
            <div class="menu-bar">
                <h2 id="tbl-title" class="era-table-title">Need Renewable</h2>
            </div>

            <!-- Table -->
            <div class="era-table-wrap">
                <table class="era-table" role="table" aria-label="Subscriptions table">
                    <thead>
                        <tr>
                            <th class="era-num">#</th>
                            <th>Product</th>
                            <th style="text-align: center;">Customer</th>
                            <th class="era-email">Email</th>
                            <th style="text-align: center;">Purchased</th>
                            <th style="text-align: center;">Renewable Date</th>
                            <th style="text-align: center;">End Date</th>
                            <th style="text-align: right;">Date Left</th>
                        </tr>
                    </thead>
                    <tbody id="need_renew">

                    </tbody>
                </table>
            </div>
        </section>

        <div class="subs-list mb">
            <div class="menu-bar">
                <h2 id="tbl-title" class="era-table-title">Expired item</h2>
            </div>
            <div id="expired-item">

            </div>
        </div>


        <div class="subs-list mb">
            <div class="menu-bar">
                <h2 id="tbl-title" class="era-table-title">Renew Item</h2>
            </div>
            <div id="renewal-item">
            </div>
        </div>

        <section class="era-table-card mb" aria-labelledby="tbl-title">
            <div class="menu-bar">
                <h2 id="tbl-title" class="era-table-title">Daily Product Sold</h2>
            </div>

            <!-- Table -->
            <div class="era-table-wrap">

                <div class="charts-row">
                    <div class="chart-card"><canvas id="chartDailySales" aria-label="Daily Sales by Product"></canvas>
                    </div>
                    <div class="chart-card"><canvas id="chartDailyProfit" aria-label="Daily Profit by Product"></canvas>
                    </div>
                    <div class="chart-card"><canvas id="chartDailyCount" aria-label="Daily Count by Product"></canvas>
                    </div>
                </div>
            </div>
        </section>


        <section class="era-table-card mb" aria-labelledby="tbl-title">
            <div class="menu-bar">
                <h2 id="tbl-title" class="era-table-title">30-day Sales & Profit Summary</h2>
            </div>

            <div class="era-table-wrap">
                <div class="chart-card"
                    style="height:360px;background:transparent;border:1px solid #1b1f2a;border-radius:12px;padding:10px;">
                    <canvas id="salesProfitLine" aria-label="Daily Sales & Profit (Last 30 Days)"></canvas>
                </div>
            </div>
        </section>




    </main>

    <div id="kpiDrilldownModal" class="summary-modal" aria-hidden="true">
        <div class="summary-modal-panel">
            <div class="summary-modal-header">
                <h3 id="kpiDrilldownTitle">KPI Drilldown</h3>
                <button id="kpiDrilldownClose" type="button" aria-label="Close">x</button>
            </div>
            <div class="era-table-wrap">
                <table class="era-table" role="table" aria-label="KPI Drilldown table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Product</th>
                            <th>Customer</th>
                            <th>Purchased</th>
                            <th style="text-align:right;">Price</th>
                            <th style="text-align:right;">Profit</th>
                        </tr>
                    </thead>
                    <tbody id="kpi_drilldown_body"></tbody>
                </table>
            </div>
        </div>
    </div>

    <script src="./js/nav.js?v=<?php echo filemtime(__DIR__ . '/js/nav.js'); ?>"></script>
    <script src="./js/summary_table.js?v=<?php echo filemtime(__DIR__ . '/js/summary_table.js'); ?>"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
    <script src="./js/deplay_chart.js?v=<?php echo filemtime(__DIR__ . '/js/deplay_chart.js'); ?>"></script>

</body>

</html>
