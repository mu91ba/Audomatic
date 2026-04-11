# Quick Start Guide

## 🚀 Get Running in 5 Minutes

### 1. Database Setup (2 minutes)

1. Go to [supabase.com](https://supabase.com) → Create project
2. SQL Editor → New Query → Paste content from `supabase/migrations/001_initial_schema.sql` → Run
3. Get your credentials: Settings → API
   - Copy Project URL
   - Copy anon public key
   - Copy service_role key (keep secret!)

### 2. Configure Environment (1 minute)

Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=paste_your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=paste_your_anon_key
NEXT_PUBLIC_N8N_WEBHOOK_URL=http://your-n8n/webhook/audit-webhook
```

### 3. Start Development Server (30 seconds)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## ⚠️ Important Notes

**For Full Functionality**, you also need:

1. **Crawler Service** running on your VPS
   - Follow `crawler-service/README.md`
   - Required for actual crawling

2. **n8n Workflow** set up
   - Follow `n8n/README.md`
   - Required to trigger crawls

**Without these**, you can:
- ✅ See the UI/interface
- ✅ Submit URLs (creates audit in database)
- ❌ Crawling won't actually start
- ❌ No pages will appear on canvas

---

## 📋 Complete Setup Order

1. ✅ **Supabase** (database) - Required first
2. ✅ **Frontend** (this app) - Can start now
3. 🔄 **Crawler Service** (VPS) - Do this next
4. 🔄 **n8n** (VPS) - Then do this
5. 🎉 **Test end-to-end** - Finally test everything

---

## 🧪 Test Without Full Setup

Want to test the UI without setting up crawler/n8n?

1. Set up Supabase (step 1 above)
2. Configure `.env.local` (step 2 above)
3. Run `npm run dev`
4. Manually insert test data into Supabase:

```sql
-- Create test audit
INSERT INTO audits (id, url, status, created_at) 
VALUES ('00000000-0000-0000-0000-000000000001', 'https://example.com', 'completed', NOW());

-- Create test page
INSERT INTO pages (audit_id, url, title, screenshot_url, level, parent_url)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'https://example.com',
  'Example Domain',
  'https://placehold.co/1440x900/png',
  0,
  NULL
);
```

Then visit: `http://localhost:3000/audit/00000000-0000-0000-0000-000000000001`

---

## 🆘 Need Help?

1. Check `SETUP_GUIDE.md` for detailed step-by-step instructions
2. Check `README.md` for troubleshooting
3. Look at individual README files in `crawler-service/` and `n8n/`

---

## ✨ Quick Commands

```bash
# Start development
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Check for TypeScript errors
npx tsc --noEmit

# Format code
npx prettier --write .
```








