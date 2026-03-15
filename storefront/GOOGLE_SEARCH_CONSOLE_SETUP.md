# Google Search Console Setup Guide for Digimium.store

## Step 1: Access Google Search Console

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Sign in with your Google account
3. Click "Start now"

## Step 2: Add Property

1. Click "Add property"
2. Choose property type: **Domain** (recommended) or **URL prefix**
3. Enter your domain: `digimium.store`
4. Click "Continue"

## Step 3: Verify Ownership

### Option A: HTML File (Recommended)

1. Download the HTML verification file
2. Upload it to your website root directory (`/`)
3. Make sure it's accessible at `https://digimium.store/your-verification-file.html`
4. Click "Verify"

### Option B: HTML Tag

1. Copy the HTML tag provided
2. Add it to the `<head>` section of your `index.html`
3. Click "Verify"

### Option C: DNS Record

1. Add the TXT record to your domain's DNS settings
2. Wait for DNS propagation (up to 48 hours)
3. Click "Verify"

## Step 4: Submit Sitemap

1. In Search Console, go to **Sitemaps**
2. Click "Add a new sitemap"
3. Enter: `https://digimium.store/sitemap.xml`
4. Click "Submit"

## Step 5: Link with Google Analytics

1. In Search Console, go to **Settings** → **Associations**
2. Click "Associate" next to Google Analytics
3. Select your Google Analytics property
4. Click "Confirm"

## Step 6: Set Up URL Inspection

1. Go to **URL Inspection**
2. Enter your homepage URL: `https://digimium.store/`
3. Click "Request Indexing"
4. Repeat for important pages

## Step 7: Monitor Performance

### Key Metrics to Watch:

- **Impressions**: How often your site appears in search results
- **Clicks**: How many clicks your site gets from search
- **CTR**: Click-through rate
- **Average position**: Average ranking position
- **Index coverage**: How many pages are indexed

## Step 8: Set Up Email Notifications

1. Go to **Settings** → **Preferences**
2. Enable email notifications for:
   - Manual actions
   - Mobile usability issues
   - Sitemap errors
   - Security issues

## Step 9: Submit New Content

### For New Pages:

1. Use URL Inspection tool
2. Enter the new URL
3. Click "Request Indexing"

### For Updated Content:

1. Update your sitemap.xml
2. Resubmit sitemap in Search Console
3. Use URL Inspection for important pages

## Troubleshooting

### Common Issues:

- **Verification failed**: Check file path or DNS settings
- **Sitemap errors**: Verify sitemap.xml is accessible
- **No data**: Wait 24-48 hours after verification
- **Indexing issues**: Check for robots.txt or meta robots issues

### Best Practices:

1. Submit sitemap immediately after verification
2. Monitor for crawl errors
3. Fix mobile usability issues
4. Request indexing for important pages
5. Keep sitemap updated

## Next Steps

1. Set up Google Analytics (if not done)
2. Link Analytics with Search Console
3. Monitor performance regularly
4. Fix any issues found
5. Optimize based on search data
