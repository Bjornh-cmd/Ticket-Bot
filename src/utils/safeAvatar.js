/**
 * Secure avatar validation for dashboard branding uploads.
 * Accepts PNG / JPEG / WebP / GIF / ICO (PNG-inside). Hard size limit.
 * Validated in memory only; stored outside the public web root.
 */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICO_MAGIC = Buffer.from([0x00, 0x00, 0x01, 0x00]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const GIF87 = Buffer.from('GIF87a');
const GIF89 = Buffer.from('GIF89a');
const WEBP_RIFF = Buffer.from('RIFF');
const WEBP_WEBP = Buffer.from('WEBP');

/** Discord guild avatar practical limit */
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

function isPngBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 33 && buffer.subarray(0, 8).equals(PNG_MAGIC);
}

function isIcoBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 6 && buffer.subarray(0, 4).equals(ICO_MAGIC);
}

function isJpegBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 3 && buffer.subarray(0, 3).equals(JPEG_MAGIC);
}

function isGifBuffer(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).equals(GIF87) || buffer.subarray(0, 6).equals(GIF89))
  );
}

function isWebpBuffer(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(WEBP_RIFF) &&
    buffer.subarray(8, 12).equals(WEBP_WEBP)
  );
}

function assertPngStructure(buffer) {
  const length = buffer.readUInt32BE(8);
  const type = buffer.subarray(12, 16).toString('ascii');
  if (type !== 'IHDR' || length < 13) {
    throw new Error('Invalid PNG structure');
  }
  const head = buffer.subarray(0, Math.min(512, buffer.length)).toString('latin1').toLowerCase();
  if (head.includes('<svg') || head.includes('<!doctype') || head.includes('<html')) {
    throw new Error('Unsafe file content');
  }
  return buffer;
}

function pngFromIco(buffer) {
  const count = buffer.readUInt16LE(4);
  if (count < 1 || count > 64) throw new Error('Invalid ICO');

  let best = null;
  let bestSize = -1;

  for (let i = 0; i < count; i++) {
    const entryOffset = 6 + i * 16;
    if (entryOffset + 16 > buffer.length) throw new Error('Invalid ICO directory');
    const bytesInRes = buffer.readUInt32LE(entryOffset + 8);
    const imgOffset = buffer.readUInt32LE(entryOffset + 12);
    if (bytesInRes < 24 || imgOffset < 0 || imgOffset + bytesInRes > buffer.length) {
      throw new Error('Invalid ICO entry');
    }
    const slice = buffer.subarray(imgOffset, imgOffset + bytesInRes);
    if (!isPngBuffer(slice)) continue;
    if (bytesInRes > bestSize) {
      bestSize = bytesInRes;
      best = slice;
    }
  }

  if (!best) {
    throw new Error('ICO must contain a PNG image');
  }
  return assertPngStructure(Buffer.from(best));
}

/**
 * @param {Buffer} buffer
 * @param {string} [originalName]
 * @returns {Buffer} Discord-safe image buffer
 */
function assertSafeAvatar(buffer, originalName = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 6) {
    throw new Error('Empty or invalid file');
  }
  if (buffer.length > MAX_AVATAR_BYTES) {
    throw new Error('File too large (max 8MB)');
  }

  const name = String(originalName || '').toLowerCase().trim();
  if (name) {
    const okExt =
      name.endsWith('.png') ||
      name.endsWith('.ico') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.gif') ||
      name.endsWith('.webp');
    if (!okExt) throw new Error('Only image files allowed (.png .ico .jpg .gif .webp)');
  }

  if (isPngBuffer(buffer)) return assertPngStructure(buffer);
  if (isIcoBuffer(buffer)) return pngFromIco(buffer);
  if (isJpegBuffer(buffer)) return buffer;
  if (isGifBuffer(buffer)) return buffer;
  if (isWebpBuffer(buffer)) return buffer;

  throw new Error('Unrecognized or unsafe image type');
}

function isSafeAvatarMagic(buffer) {
  try {
    assertSafeAvatar(buffer);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  PNG_MAGIC,
  ICO_MAGIC,
  MAX_AVATAR_BYTES,
  MAX_PNG_BYTES: MAX_AVATAR_BYTES,
  assertSafeAvatar,
  assertSafePng: assertSafeAvatar,
  isSafeAvatarMagic,
  isPngMagic: isSafeAvatarMagic,
};
