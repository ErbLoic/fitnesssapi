const crypto = require('crypto');

const PROFILE_IMAGE_PREFIX = 'profile-images';
const OBJECT_KEY_PATTERN = /^profile-images\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$/;
const ALLOWED_CONTENT_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function getConfig() {
  return {
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME,
    publicBaseUrl: process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL,
  };
}

function hasR2Config() {
  const config = getConfig();
  return Boolean(
    config.endpoint
    && config.accessKeyId
    && config.secretAccessKey
    && config.bucketName
    && config.publicBaseUrl
  );
}

function assertR2Config() {
  if (hasR2Config()) return;

  const missing = Object.entries(getConfig())
    .filter(([, value]) => !value)
    .map(([key]) => key);

  const error = new Error(`Configuration Cloudflare R2 manquante: ${missing.join(', ')}`);
  error.statusCode = 503;
  error.code = 'r2_not_configured';
  throw error;
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function encodePathSegment(segment) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeObjectKey(objectKey) {
  return objectKey.split('/').map(encodePathSegment).join('/');
}

function getSigningKey(secretAccessKey, dateStamp, region, service) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, 'aws4_request');
}

function buildPublicUrl(objectKey) {
  const { publicBaseUrl } = getConfig();
  if (!publicBaseUrl) return null;
  return `${publicBaseUrl.replace(/\/$/, '')}/${encodeObjectKey(objectKey)}`;
}

function extractObjectKey(publicUrl) {
  const { publicBaseUrl } = getConfig();
  if (!publicUrl || !publicBaseUrl) return null;

  try {
    const base = new URL(publicBaseUrl.replace(/\/$/, '/'));
    const url = new URL(publicUrl);
    if (url.origin !== base.origin) return null;

    const basePath = base.pathname.replace(/\/$/, '');
    if (basePath && !url.pathname.startsWith(`${basePath}/`)) return null;

    const objectKey = decodeURIComponent(url.pathname.slice(basePath.length).replace(/^\//, ''));
    return OBJECT_KEY_PATTERN.test(objectKey) ? objectKey : null;
  } catch {
    return null;
  }
}

function assertObjectKey(objectKey) {
  if (!OBJECT_KEY_PATTERN.test(objectKey || '')) {
    const error = new Error('objectKey invalide');
    error.statusCode = 400;
    error.code = 'validation_error';
    throw error;
  }
}

function createObjectKey(userId, contentType) {
  const extension = ALLOWED_CONTENT_TYPES.get(contentType);
  if (!extension) {
    const error = new Error('Type image non supporte. Utilise image/jpeg, image/png ou image/webp.');
    error.statusCode = 400;
    error.code = 'validation_error';
    throw error;
  }

  return `${PROFILE_IMAGE_PREFIX}/${userId}/${crypto.randomUUID()}.${extension}`;
}

function createPresignedUrl({ method, objectKey, contentType, expiresInSeconds = 900 }) {
  assertR2Config();
  assertObjectKey(objectKey);

  const { endpoint, accessKeyId, secretAccessKey, bucketName } = getConfig();
  const endpointUrl = new URL(endpoint);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const signedHeaders = contentType ? 'content-type;host' : 'host';
  const canonicalUri = `/${encodePathSegment(bucketName)}/${encodeObjectKey(objectKey)}`;

  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  });
  params.sort();

  const canonicalHeaders = contentType
    ? `content-type:${contentType}\nhost:${endpointUrl.host}\n`
    : `host:${endpointUrl.host}\n`;

  const canonicalRequest = [
    method,
    canonicalUri,
    params.toString(),
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign, 'hex');
  params.set('X-Amz-Signature', signature);

  return `${endpointUrl.origin}${canonicalUri}?${params.toString()}`;
}

function createPresignedProfileUpload({ userId, contentType, expiresInSeconds = 900 }) {
  const objectKey = createObjectKey(userId, contentType);
  return {
    objectKey,
    uploadURL: createPresignedUrl({
      method: 'PUT',
      objectKey,
      contentType,
      expiresInSeconds,
    }),
    publicUrl: buildPublicUrl(objectKey),
  };
}

async function deleteObject(objectKey) {
  const deleteURL = createPresignedUrl({ method: 'DELETE', objectKey });
  const response = await fetch(deleteURL, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    const error = new Error(`Suppression R2 impossible (${response.status})`);
    error.statusCode = 502;
    error.code = 'r2_error';
    throw error;
  }
}

module.exports = {
  ALLOWED_CONTENT_TYPES,
  assertObjectKey,
  buildPublicUrl,
  createPresignedProfileUpload,
  deleteObject,
  extractObjectKey,
  hasR2Config,
};
