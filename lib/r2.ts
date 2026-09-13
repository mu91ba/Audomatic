/**
 * Cloudflare R2 helpers for the Next.js app (server-side only).
 *
 * Screenshots moved off Supabase Storage — the free plan's 1 GB cap was
 * exhausted by uncompressed full-page PNGs. The crawler writes objects under
 * `${auditId}/`; this module removes them when an audit is deleted, which the
 * old code never did (audit rows were deleted but files were orphaned forever).
 *
 * Required env (Vercel project settings — NOT prefixed NEXT_PUBLIC_, these
 * must never reach the browser):
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET
 */

import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'

const REQUIRED_ENV = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
] as const

let client: S3Client | null = null

export function isR2Configured(): boolean {
  return REQUIRED_ENV.every(k => !!process.env[k])
}

function getClient(): S3Client {
  if (!client) {
    const missing = REQUIRED_ENV.filter(k => !process.env[k])
    if (missing.length) {
      throw new Error(`R2 is not configured — missing env: ${missing.join(', ')}`)
    }
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  }
  return client
}

/**
 * Audit ids are Postgres uuids. This is enforced rather than assumed because
 * the value becomes an object-key prefix: an empty or wildcard-ish auditId
 * would match every object in the bucket and delete the lot.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidAuditId(auditId: unknown): auditId is string {
  return typeof auditId === 'string' && UUID_RE.test(auditId)
}

/** S3 DeleteObjects accepts at most 1000 keys per request. */
const DELETE_BATCH = 1000

/**
 * Delete every screenshot belonging to one audit.
 * Returns the number of objects removed.
 */
export async function deleteAuditScreenshots(auditId: string): Promise<number> {
  if (!isValidAuditId(auditId)) {
    throw new Error('Refusing to delete: auditId is not a valid uuid')
  }

  const s3 = getClient()
  const Bucket = process.env.R2_BUCKET!
  const Prefix = `${auditId}/`

  let deleted = 0
  let ContinuationToken: string | undefined

  do {
    const listed = await s3.send(
      new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken })
    )

    const keys = (listed.Contents ?? [])
      .map(o => o.Key)
      .filter((k): k is string => typeof k === 'string' && k.startsWith(Prefix))

    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      const batch = keys.slice(i, i + DELETE_BATCH)
      const res = await s3.send(
        new DeleteObjectsCommand({
          Bucket,
          Delete: { Objects: batch.map(Key => ({ Key })), Quiet: true },
        })
      )
      if (res.Errors?.length) {
        throw new Error(
          `R2 delete failed for ${res.Errors.length} object(s): ` +
            res.Errors.slice(0, 3)
              .map(e => `${e.Key} (${e.Code})`)
              .join(', ')
        )
      }
      deleted += batch.length
    }

    ContinuationToken = listed.IsTruncated
      ? listed.NextContinuationToken
      : undefined
  } while (ContinuationToken)

  return deleted
}
