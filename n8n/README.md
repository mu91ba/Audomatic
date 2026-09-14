# n8n

n8n runs in docker on the VPS behind Traefik at
`https://n8n.srv1051800.hstgr.cloud`. It powers exactly one feature: the
**Export to Google Sheets** button on the audit page.

It is **not** in the crawl path. `/api/start-audit` calls the crawler directly.
The old "frontend → n8n → crawler" trigger workflow has been deleted; if you
find references to `webhook/audit-webhook` anywhere, they are stale.

## Export workflow

`export-workflow.json` — webhook `POST /webhook/export-audit`.

1. **Export Webhook** — receives `{ auditId, auditUrl }` from
   `app/api/export-audit/route.ts`
2. **Validate Secret** — compares the `x-export-secret` header
3. **Fetch Pages** — Supabase REST: `/rest/v1/pages?audit_id=eq.<id>&order=level.asc`
4. **Build Sheet Rows** → **Create Spreadsheet** → **Move to Audit Sheets
   Folder** → **Append Rows**
5. **Respond with URL** — returns `{ spreadsheetUrl }`

The app treats this call as synchronous with a 30s timeout.

## Maintenance

The **Fetch Pages** node has the Supabase project URL and service-role key
**hardcoded** in its URL and its `apikey` / `Authorization` headers. Anything
that changes the Supabase project or rotates that key requires editing this node
in the n8n UI, or the export breaks with no signal in the app beyond a failed
request.

The committed JSON is a reference copy and may lag the live workflow. Do not
commit a live service-role key into it.
