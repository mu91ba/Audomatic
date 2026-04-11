# Audomatic - Automated Website Audit Tool

A micro-SaaS application that automates website audits by crawling sites, extracting design tokens, capturing screenshots, and creating interactive visual sitemaps.

## Features

- 🗺️ **Visual Sitemap** - Interactive canvas showing site structure with screenshots
- 🎨 **Design Token Extraction** - Automatically extract colors and typography
- 📸 **Full-Page Screenshots** - Capture every page on the site
- 🔄 **Real-Time Updates** - Watch pages appear as they're crawled
- 📝 **Annotations** - Add sticky notes to the canvas (coming soon)
- 🎯 **Drag & Zoom** - Full canvas controls like Miro/FigJam

## Architecture

```
Frontend (Next.js + React Flow)
    ↓
n8n Webhook (Orchestration)
    ↓
Crawler Service (Node.js + Puppeteer)
    ↓
Supabase (Database + Storage)
```

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React Flow, shadcn/ui, Tailwind CSS
- **Backend**: Node.js + Express + Puppeteer
- **Database**: Supabase (PostgreSQL + Storage + Realtime)
- **Orchestration**: n8n (self-hosted)
- **Deployment**: Vercel (frontend), Hostinger VPS (crawler + n8n)

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- Supabase account
- n8n instance (self-hosted on Hostinger VPS)
- Vercel account (optional, for deployment)

### 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the migration:
   ```bash
   # Copy content from: supabase/migrations/001_initial_schema.sql
   ```
3. Verify the `screenshots` storage bucket was created
4. Note your project URL and anon key

### 2. Crawler Service Setup

The crawler service runs on your Hostinger VPS:

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Navigate to the project
cd /path/to/audomatic/crawler-service

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env

# Add your values:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_KEY=your_service_role_key
# PORT=3001
# API_SECRET=your_secure_secret_key

# Start with PM2 (process manager)
npm install -g pm2
pm2 start server.js --name audomatic-crawler
pm2 save
pm2 startup
```

### 3. n8n Setup

1. Import the workflow from `n8n/audomatic-workflow.json`
2. Set environment variable:
   ```bash
   CRAWLER_API_SECRET=your_crawler_secret_key
   ```
3. Update the "Trigger Crawler Service" node URL if needed
4. Activate the workflow
5. Copy the webhook URL (you'll need it for the frontend)

### 4. Frontend Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
nano .env.local

# Add your values:
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
# NEXT_PUBLIC_N8N_WEBHOOK_URL=https://your-n8n.com/webhook/audit-webhook

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - NEXT_PUBLIC_N8N_WEBHOOK_URL
```

## Usage

1. **Start an Audit**
   - Go to the homepage
   - Enter a website URL (e.g., `https://example.com`)
   - Click "Start Audit"

2. **Watch the Canvas**
   - You'll be redirected to the audit page
   - Pages will appear in real-time as they're crawled
   - The sitemap builds automatically with parent-child relationships

3. **View Design Tokens**
   - Click "Design Tokens" button
   - Browse extracted colors and typography
   - See usage frequency and inconsistencies

4. **Interact with Canvas**
   - **Zoom**: Mouse wheel or zoom controls
   - **Pan**: Click and drag
   - **View Page**: Click screenshot to see full version
   - **Visit Page**: Click external link icon

## Project Structure

```
Audomatic/
├── app/                      # Next.js app directory
│   ├── api/                  # API routes
│   │   └── start-audit/      # Audit creation endpoint
│   ├── audit/[id]/           # Audit canvas page
│   └── page.tsx              # Homepage
├── components/               # React components
│   ├── ui/                   # shadcn/ui components
│   ├── audit-canvas.tsx      # Main canvas component
│   ├── page-node.tsx         # Custom React Flow node
│   └── design-token-panel.tsx # Design tokens sidebar
├── lib/                      # Utilities
│   ├── supabase.ts          # Supabase client
│   ├── utils.ts             # Helper functions
│   └── layout.ts            # Canvas layout algorithm
├── crawler-service/          # Standalone crawler service
│   ├── server.js            # Express server
│   ├── crawler.js           # Main crawling logic
│   ├── sitemap-parser.js    # Sitemap fetching
│   └── page-utils.js        # Page processing utilities
├── n8n/                      # n8n workflow configuration
│   ├── audomatic-workflow.json
│   └── README.md
└── supabase/                 # Database migrations
    └── migrations/
        └── 001_initial_schema.sql
```

## How It Works

### Workflow

1. **User submits URL** → Frontend creates audit in Supabase (status: pending)
2. **Frontend triggers n8n** → Webhook receives request
3. **n8n calls crawler service** → Passes audit ID and URL
4. **Crawler fetches sitemap** → Parses all page URLs
5. **For each page**:
   - Opens in headless Chrome
   - Handles popups/modals
   - Waits for full page load
   - Takes full-page screenshot
   - Extracts design tokens (colors, fonts)
   - Uploads screenshot to Supabase Storage
   - Saves page data to database
6. **Real-time updates** → Frontend receives updates via Supabase Realtime
7. **Canvas renders** → Pages appear as tree structure
8. **Audit completes** → Status updated to 'completed'

### Design Token Extraction

The crawler analyzes every element on each page:

- **Colors**: Text color, background color, border color
- **Typography**: Font families, weights, sizes

It calculates:
- **Frequency**: High/medium/low based on usage
- **Flags**: Highlights inconsistencies (colors/sizes used ≤3 times)

## Troubleshooting

### Crawler Issues

```bash
# Check crawler service status
pm2 status
pm2 logs audomatic-crawler

# Restart crawler
pm2 restart audomatic-crawler

# Test crawler health
curl http://localhost:3001/health
```

### n8n Issues

- Verify workflow is **Active**
- Check webhook URL matches `.env.local`
- Test webhook directly with curl
- Check n8n execution logs

### Frontend Issues

```bash
# Clear Next.js cache
rm -rf .next
npm run dev

# Check environment variables
cat .env.local
```

### Database Issues

- Verify migration ran successfully
- Check Supabase dashboard for data
- Verify RLS policies allow access

## Development

```bash
# Run frontend in development mode
npm run dev

# Run crawler service in development mode
cd crawler-service
npm run dev

# Build frontend for production
npm run build
npm start
```

## Environment Variables

### Frontend (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_N8N_WEBHOOK_URL=your_n8n_webhook_url
```

### Crawler Service (.env)
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_role_key
PORT=3001
API_SECRET=your_secret_key
ALLOWED_ORIGIN=*
```

### n8n (Environment)
```env
CRAWLER_API_SECRET=your_secret_key
```

## Future Enhancements

- [ ] Sticky notes on canvas
- [ ] User authentication
- [ ] Multiple audits/projects
- [ ] Export canvas as PNG/PDF
- [ ] Schedule recurring audits
- [ ] Compare audits over time
- [ ] AI-powered insights
- [ ] Accessibility audit
- [ ] Performance metrics
- [ ] SEO analysis

## License

MIT

## Support

For issues or questions, please create an issue in the repository.

