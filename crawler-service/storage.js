/**
 * Screenshot storage — Cloudflare R2 (S3-compatible).
 *
 * Replaces the previous Supabase Storage bucket. Supabase's free plan caps
 * file storage at 1 GB, which uncompressed full-page PNGs exhausted. R2's
 * free tier is 10 GB with no egress charges.
 *
 * Required env (set in crawler-service/.env on the VPS):
 *   R2_ACCOUNT_ID          Cloudflare account id
 *   R2_ACCESS_KEY_ID       R2 API token key id
 *   R2_SECRET_ACCESS_KEY   R2 API token secret
 *   R2_BUCKET              bucket name, e.g. sightmap-screenshots
 *   R2_PUBLIC_BASE_URL     public origin, e.g. https://img.example.com
 *                          (no trailing slash)
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const REQUIRED_ENV = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_BASE_URL',
];

let client = null;

/**
 * Throw early with a readable message if the VPS .env is incomplete.
 * Called once at the start of a crawl so a misconfigured deploy fails the
 * audit with a clear reason instead of dying mid-upload or crash-looping pm2.
 */
function assertStorageConfig() {
  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `R2 storage is not configured — missing env: ${missing.join(', ')}`
    );
  }
}

function getClient() {
  if (!client) {
    assertStorageConfig();
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

/**
 * WebP cannot encode either dimension above 16383px. Full-page screenshots
 * of long pages routinely exceed that, so tall captures fall back to JPEG,
 * which allows up to 65535px. Both compress roughly 10x better than PNG for
 * this kind of content.
 */
const WEBP_MAX_DIMENSION = 16383;

function pickScreenshotFormat(pageHeightPx, pageWidthPx = 0) {
  const tooTall = pageHeightPx > WEBP_MAX_DIMENSION;
  const tooWide = pageWidthPx > WEBP_MAX_DIMENSION;

  if (tooTall || tooWide) {
    return { type: 'jpeg', quality: 82, ext: 'jpg', contentType: 'image/jpeg' };
  }
  return { type: 'webp', quality: 70, ext: 'webp', contentType: 'image/webp' };
}

/**
 * Upload one screenshot and return its public URL.
 *
 * @param {string} key    object key, e.g. `${auditId}/${filename}`
 * @param {Buffer} body   image bytes
 * @param {string} contentType
 * @returns {Promise<string>} public URL
 */
async function uploadScreenshot(key, body, contentType) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Keys are namespaced by audit id (a fresh UUID per audit), so a given
      // key never changes content once written.
      CacheControl: 'public, max-age=31536000',
    })
  );

  const base = process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
  return `${base}/${key}`;
}

module.exports = {
  assertStorageConfig,
  pickScreenshotFormat,
  uploadScreenshot,
};
