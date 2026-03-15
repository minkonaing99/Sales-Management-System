<?php

declare(strict_types=1);
// Product Showcase CMS page (admin/owner):
// - "Visual Editor" list is loaded from JSON in the storefront project
// - "Add Service" form submits to `api_json/*` endpoints
// - UI behavior is centralized in `js/product_showcase.js`
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
    <title>Digimium • Product Showcase</title>
    <link rel="stylesheet" href="./style/style.min.css">
    <link rel="stylesheet" href="./style/wholesale.min.css">
    <link rel="stylesheet" href="./style/product_showcase.css">
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





        <!-- new -->
        <div class="sticky-menubar">
            <section class="era-table-card mb">
                <div class="menu-bar">
                    <h2 class="era-table-title">
                        <span class="btn-active" id="visual_editor">Visual Editor</span>
                    </h2>

                    <div class="btn-group">

                        <button id="addServiceBtn" class="iconLabelBtn catalogPage"><img src="./assets/add.svg" alt="">
                            <span class="btnLabel">Add Service</span></button>
                    </div>
                </div>
            </section>

            <!-- Add Service Tab -->
            <section class="era-table-card add_page" aria-labelledby="">
                <div class="era-table-wrap">
                    <div class="form-header">
                        <h2>Add New Service</h2>
                        <p>Fill in the details below to create a new service</p>
                    </div>

                    <form class="service-form" id="serviceForm">
                        <div class="form-grid">
                            <!-- Left Column: Basic Information -->
                            <div class="form-column">
                                <div class="form-section">
                                    <h3>Basic Information</h3>
                                    <div class="basic-table">

                                        <div class="basic-row">
                                            <div class="basic-col">
                                                Placement
                                            </div>
                                            <div class="basic-col">
                                                <select name="services_placement" id="services_placement">
                                                    <option value="otherServices">Other Services</option>
                                                    <option value="popularServices">Popular Services</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div class="basic-row">
                                            <div class="basic-col">
                                                Service Photo
                                            </div>
                                            <div class="basic-col">
                                                <input type="file" name="services_photo" id="services_photo" accept="image/*">
                                            </div>
                                        </div>



                                    </div>
                                    <div class="basic-row">
                                        <div class="basic-col">
                                        </div>
                                        <div class="basic-col">
                                            <small>Upload a square image (recommended: 400x400px)</small>
                                            <div id="photo_preview"></div>
                                        </div>
                                    </div>
                                    <div class="basic-row">
                                        <div class="basic-col">
                                            Service Name
                                        </div>
                                        <div class="basic-col">
                                            <input type="text" name="services_name" id="services_name" placeholder="Enter service name" required>
                                        </div>
                                    </div>
                                    <div class="basic-row">
                                        <div class="basic-col">
                                            Service Description
                                        </div>
                                        <div class="basic-col">
                                            <textarea name="services_description" id="services_description" placeholder="Describe the service..." rows="6" required></textarea>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Middle Column: Pricing Plans -->
                            <div class="form-column">
                                <div class="form-section">
                                    <h3>Pricing Plans</h3>
                                    <div class="pricing-table">
                                        <div class="pricing-row">
                                            <div class="pricing-col">
                                                <select name="pricing_duration[]" required>
                                                    <option value="">Select Duration</option>
                                                    <option value="1_month">1 Month</option>
                                                    <option value="2_months">2 Months</option>
                                                    <option value="3_months">3 Months</option>
                                                    <option value="6_months">6 Months</option>
                                                    <option value="12_months">12 Months</option>
                                                </select>
                                            </div>
                                            <div class="pricing-col">
                                                <input type="number" name="pricing_price[]" placeholder="90000" required>
                                            </div>
                                            <div class="pricing-col">
                                                <button type="button" class="btn btn-danger" onclick="this.parentElement.parentElement.remove()">Remove</button>
                                            </div>
                                        </div>
                                    </div>
                                    <button type="button" id="addPricingBtn" class="btn btn-secondary">Add Pricing Plan</button>
                                </div>
                            </div>

                            <!-- Right Column: Service Features -->
                            <div class="form-column">
                                <div class="form-section">
                                    <h3>Service Features</h3>
                                    <div class="features-table">
                                        <div class="features-row">
                                            <div class="features-col">
                                                <input type="text" name="features[]" placeholder="Enter feature" required>
                                            </div>
                                            <div class="features-col">
                                                <button type="button" class="btn btn-danger" onclick="this.parentElement.parentElement.remove()">Remove</button>
                                            </div>
                                        </div>
                                    </div>
                                    <button type="button" id="addFeatureBtn" class="btn btn-secondary">Add Feature</button>
                                </div>
                            </div>
                        </div>

                        <!-- Form Actions -->
                        <div class="form-actions">
                            <button type="submit" class="btn btn-primary">Create Service</button>
                            <button type="button" id="closeFormBtn" class="btn btn-secondary">Close</button>
                        </div>
                    </form>
                </div>
            </section>

            <!-- Visual Editor Tab -->
            <section class=" era-table-card visual_page" aria-labelledby="product_catalog">
                <div class="era-table-wrap">
                    <h2>Popular Services</h2>
                    <div id="popularServices" class="services-grid">
                        <!-- Services will be loaded here by JavaScript -->
                    </div>

                    <h2>Other Services</h2>
                    <div id="otherServices" class="services-grid">
                        <!-- Services will be loaded here by JavaScript -->
                    </div>
                </div>
            </section>






    </main>

    <script src="./js/nav.js"></script>
    <script src="./js/product_showcase.js?v=<?php echo time(); ?>"></script>

</body>

</html>
