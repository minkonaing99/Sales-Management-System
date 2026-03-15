# Google Analytics Setup Guide for Digimium.store

## Step 1: Create Google Analytics Account

1. Go to [Google Analytics](https://analytics.google.com/)
2. Click "Start measuring"
3. Sign in with your Google account
4. Click "Create Account"
5. Enter account details:
   - Account name: `Digimium`
   - Data sharing settings: Choose your preferences

## Step 2: Create Property

1. Click "Create Property"
2. Enter property details:
   - Property name: `Digimium Store`
   - Reporting time zone: Your timezone
   - Currency: Your currency
3. Click "Next"
4. Enter business details:
   - Business size: Small business
   - Business category: E-commerce
   - Business objectives: Select relevant options
5. Click "Create"

## Step 3: Set Up Data Stream

1. Choose platform: **Web**
2. Enter website details:
   - Website URL: `https://digimium.store`
   - Stream name: `Digimium Store Website`
3. Click "Create stream"

## Step 4: Get Measurement ID

1. Copy your Measurement ID (starts with "G-")
2. Replace `G-XXXXXXXXXX` in your `index.html` file with your actual Measurement ID

## Step 5: Verify Installation

1. Go to your website
2. Open browser developer tools (F12)
3. Go to Network tab
4. Refresh the page
5. Look for requests to `google-analytics.com` or `googletagmanager.com`

## Step 6: Set Up Goals (Optional)

1. In Google Analytics, go to Admin → Goals
2. Click "New Goal"
3. Set up goals like:
   - Contact form submissions
   - Service page visits
   - Social media clicks

## Step 7: Enable Enhanced E-commerce (If Applicable)

1. Go to Admin → E-commerce Settings
2. Enable Enhanced E-commerce reporting
3. Add e-commerce tracking code if you have a shopping cart

## Troubleshooting

### If Analytics isn't working:

1. Check if the Measurement ID is correct
2. Verify the tracking code is in the `<head>` section
3. Check for ad blockers
4. Wait 24-48 hours for data to appear

### Common Issues:

- **No data showing**: Wait 24-48 hours
- **Wrong domain**: Verify the website URL in the data stream
- **Blocked by ad blocker**: Test in incognito mode

## Next Steps

1. Set up Google Search Console
2. Link Google Analytics with Search Console
3. Set up conversion tracking
4. Create custom reports
