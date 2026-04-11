# n8n Workflow Setup

This directory contains the n8n workflow configuration for triggering website audits.

## Workflow Overview

The workflow handles:
1. **Webhook Trigger** - Receives POST requests from the frontend (with auditId already created)
2. **Trigger Crawler** - Calls the crawler service to start crawling
3. **Send Response** - Returns confirmation to the frontend

Note: The audit record is created by the frontend API (`/api/start-audit`) before calling n8n. This ensures the audit ID is available immediately for the redirect.

## Setup Instructions

### 1. Import Workflow

1. Log in to your n8n instance on Hostinger
2. Click **"Workflows"** → **"Import from File"**
3. Upload `audomatic-workflow.json`
4. The workflow will be imported

### 2. Configure Environment Variables

In your n8n instance, set the following environment variable:

```bash
CRAWLER_API_SECRET=your_crawler_service_secret
```

You can set this in your n8n docker-compose.yml or system environment:

```yaml
environment:
  - CRAWLER_API_SECRET=your_secret_key_here
```

### 3. Update Crawler Service URL

In the "Trigger Crawler Service" node:
- If the crawler runs on the same server as n8n: `http://localhost:3001/crawl`
- If on a different server: `http://your-server-ip:3001/crawl`
- If behind nginx: `https://your-domain.com/crawler/crawl`

### 4. Activate Webhook

1. Open the workflow in n8n
2. Click on the "Webhook Trigger" node
3. Copy the **Production Webhook URL**
4. Save this URL - you'll need it for the frontend `.env.local`

The URL will look like:
```
https://your-n8n-domain.com/webhook/audit-webhook
```

### 5. Activate the Workflow

1. Click the **"Active"** toggle in the top right
2. The workflow is now live and ready to receive requests

## Testing the Workflow

You can test the workflow using curl:

```bash
curl -X POST https://your-n8n-domain.com/webhook/audit-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "auditId": "00000000-0000-0000-0000-000000000001",
    "url": "https://example.com"
  }'
```

Expected response:
```json
{
  "success": true,
  "auditId": "00000000-0000-0000-0000-000000000001",
  "message": "Crawl triggered successfully"
}
```

## Workflow Diagram

```
Frontend (Next.js)
    ↓ Creates audit in Supabase (status: pending)
    ↓ POST with auditId + URL
n8n Webhook Trigger
    ↓
Trigger Crawler Service
    ↓ (async - crawler runs in background)
Send Response to Frontend
    ↓
Frontend redirects to /audit/[auditId]
```

## Troubleshooting

### Webhook returns 404
- Make sure the workflow is **Active**
- Check that the webhook path matches your URL

### Crawler service unreachable
- Verify the crawler service is running: `pm2 status`
- Check the URL in the "Trigger Crawler Service" node
- Test directly: `curl http://localhost:3001/health`

### Audit stuck in "pending" status
- Check n8n execution logs for errors
- Verify the crawler service received the request
- Check crawler logs: `pm2 logs audomatic-crawler`

## Advanced: Email Notifications

To add email notifications when an audit completes, you can add:

1. A **Wait** node (wait for audit status to be "completed")
2. A **Supabase** node to check audit status
3. An **Email** node to send notification

Or better yet, use Supabase Database Webhooks to trigger n8n when status changes to "completed".

## Security Notes

- The webhook is currently public (no authentication)
- For production, add authentication to the webhook
- Use environment variables for all secrets
- Never commit `.env` files to git
