# Supabase Setup Instructions

## Step 1: Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in
2. Create a new project
3. Note down your project URL and anon key

## Step 2: Run Database Migration

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the contents of `migrations/001_initial_schema.sql`
5. Click **Run** to execute the migration

## Step 3: Verify Storage Bucket

1. Navigate to **Storage** in the Supabase dashboard
2. Verify that the `screenshots` bucket was created
3. The bucket should be set to **Public** access

## Step 4: Configure Environment Variables

1. Copy `.env.example` to `.env.local` in the project root
2. Update the following values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Database Schema Overview

### Tables

- **audits**: Stores website audit information
- **pages**: Stores individual page data with screenshots
- **design_tokens**: Stores extracted colors and typography
- **sticky_notes**: Stores user annotations on the canvas

### Storage

- **screenshots bucket**: Stores full-page screenshots of each crawled page

## Next Steps

After completing the Supabase setup, you'll need to:
1. Set up the Edge Function for the crawler (Phase 2)
2. Configure n8n workflow (Phase 3)








