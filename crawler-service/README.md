# Audomatic Crawler Service

This is a standalone Node.js service that handles website crawling with Puppeteer. It's designed to run on your Hostinger VPS alongside n8n.

## Features

- Fetches and parses sitemap.xml automatically
- Takes full-page screenshots of all pages
- Extracts design tokens (colors and typography)
- Uploads screenshots to Supabase Storage
- Saves all data to Supabase database
- Real-time status updates during crawl

## Setup

### 1. Install Dependencies

```bash
cd crawler-service
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here
PORT=3001
API_SECRET=choose_a_strong_secret_key
ALLOWED_ORIGIN=*
```

**Important**: Use the **Service Role Key** (not the anon key) from Supabase for full database access.

### 3. Run the Service

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### POST /crawl

Start a website crawl.

**Request:**
```json
{
  "auditId": "uuid-of-audit",
  "url": "https://example.com"
}
```

**Headers:**
```
X-API-Secret: your_secret_key
Content-Type: application/json
```

**Response:**
```json
{
  "message": "Crawl started successfully",
  "auditId": "uuid-of-audit",
  "url": "https://example.com"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "audomatic-crawler",
  "version": "1.0.0"
}
```

## Deployment on Hostinger VPS

### 1. Upload Files

Upload the `crawler-service` directory to your VPS:

```bash
scp -r crawler-service user@your-vps-ip:/home/user/
```

### 2. Install Dependencies on VPS

```bash
ssh user@your-vps-ip
cd /home/user/crawler-service
npm install
```

### 3. Run with PM2 (Process Manager)

Install PM2 globally:
```bash
npm install -g pm2
```

Start the service:
```bash
pm2 start server.js --name audomatic-crawler
pm2 save
pm2 startup
```

Check status:
```bash
pm2 status
pm2 logs audomatic-crawler
```

### 4. Configure Nginx (Optional)

If you want to proxy the service through Nginx:

```nginx
location /crawler/ {
    proxy_pass http://localhost:3001/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

## Usage with n8n

In your n8n workflow, use an HTTP Request node to call this service:

1. **Method**: POST
2. **URL**: `http://localhost:3001/crawl` (or your VPS URL)
3. **Headers**: 
   - `X-API-Secret`: your secret key
   - `Content-Type`: application/json
4. **Body**:
   ```json
   {
     "auditId": "{{$json.auditId}}",
     "url": "{{$json.url}}"
   }
   ```

## Troubleshooting

### Puppeteer/Chrome issues

If you get Chrome/Chromium errors on your VPS:

```bash
# Install Chrome dependencies
sudo apt-get update
sudo apt-get install -y \
  gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
  libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
  libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
  libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
  libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates \
  fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget
```

### Memory issues

If crawling large sites causes memory issues, add to your launch args in `crawler.js`:

```javascript
args: [
  '--max-old-space-size=4096', // Increase Node.js memory limit
  // ... other args
]
```

## Architecture

```
n8n Webhook 
    ↓
Crawler Service (Express)
    ↓
Puppeteer (crawl + screenshot)
    ↓
Supabase (Storage + Database)
    ↓
Frontend (Next.js) - Real-time updates
```








