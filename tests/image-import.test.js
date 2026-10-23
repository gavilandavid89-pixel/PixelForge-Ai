import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightImageFile } from '../src/image-import.js';

function file(bytes, name, type) {
  const blob = new Blob([bytes], { type });
  Object.defineProperty(blob, 'name', { value: name });
  return blob;
}
function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return bytes;
}
function gifHeader(width, height) {
  const bytes = Buffer.alloc(10); bytes.write('GIF89a', 0, 'ascii');
  bytes.writeUInt16LE(width, 6); bytes.writeUInt16LE(height, 8); return bytes;
}
function jpegHeader(width, height) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, (height >> 8) & 255, height & 255, (width >> 8) & 255, width & 255, 0x03, 0x01, 0x11, 0x00]);
}
function webpHeader(width, height) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0, 'ascii'); bytes.writeUInt32LE(22, 4); bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8X', 12, 'ascii'); bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3); bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

test('preflight reads PNG dimensions without decoding pixels', async () => {
  assert.deepEqual(await preflightImageFile(file(pngHeader(2, 3), 'sample.png', 'image/png')), { width: 2, height: 3, format: 'png' });
});
test('preflight reads GIF logical-screen dimensions', async () => {
  assert.deepEqual(await preflightImageFile(file(gifHeader(5, 7), 'sample.gif', 'image/gif')), { width: 5, height: 7, format: 'gif' });
});
test('preflight reads JPEG start-of-frame dimensions', async () => {
  assert.deepEqual(await preflightImageFile(file(jpegHeader(2, 3), 'sample.jpg', 'image/jpeg')), { width: 2, height: 3, format: 'jpeg' });
});
test('preflight reads extended WebP dimensions', async () => {
  assert.deepEqual(await preflightImageFile(file(webpHeader(2, 3), 'sample.webp', 'image/webp')), { width: 2, height: 3, format: 'webp' });
});
test('oversized compressed-image dimensions are rejected before browser decoding', async () => {
  await assert.rejects(preflightImageFile(file(pngHeader(2049, 1), 'oversized.png', 'image/png')), /safe limit/);
});
test('malformed headers and unsupported extensions are rejected closed', async () => {
  await assert.rejects(preflightImageFile(file(Buffer.alloc(24), 'broken.png', 'image/png')), /header is incomplete or invalid/);
  const badIhdr = pngHeader(2, 3); badIhdr.writeUInt32BE(12, 8);
  await assert.rejects(preflightImageFile(file(badIhdr, 'bad-ihdr.png', 'image/png')), /header is incomplete or invalid/);
  await assert.rejects(preflightImageFile(file(Buffer.alloc(32), 'drawing.svg', 'image/svg+xml')), /Supported image imports/);
});
