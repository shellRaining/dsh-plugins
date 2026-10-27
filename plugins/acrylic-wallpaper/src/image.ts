// Untrusted image input: check the container header before decoding, bound
// pixel counts, then re-encode at most 3840px so storage never keeps the original.
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_SIDE = 16384;
const MAX_EDGE = 3840;

type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';
interface ImageHeader { type: ImageType; width: number; height: number }

function dimensions(type: ImageType, width: number, height: number): ImageHeader {
  if (!width || !height || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
    throw new Error('Image exceeds dimension limits (16384 per side, 40 million pixels)');
  }
  return { type, width, height };
}

function validateImageHeader(input: ArrayBuffer | Uint8Array): ImageHeader {
  const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null;
  if (!bytes) throw new TypeError('Expected ArrayBuffer or Uint8Array');
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('Image must be between 1 byte and 20 MiB');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const byte = (offset: number): number => bytes[offset] ?? 0;
  const text = (offset: number, value: string) => [...value].every((char, i) => bytes[offset + i] === char.charCodeAt(0));
  const invalid = (): never => { throw new Error('Invalid or unsupported image header; use PNG, JPEG or WebP'); };

  if (byte(0) === 137 && text(1, 'PNG\r\n\x1a\n')) {
    if (bytes.length < 33 || view.getUint32(8) !== 13 || !text(12, 'IHDR')) return invalid();
    return dimensions('image/png', view.getUint32(16), view.getUint32(20));
  }
  if (byte(0) === 0xff && byte(1) === 0xd8) {
    let offset = 2;
    // Both bytes and marker count are bounded, including malicious fill-byte runs.
    for (let markers = 0; markers < 4096 && offset < bytes.length; markers++) {
      if (bytes[offset++] !== 0xff) return invalid();
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) return invalid();
      const marker = byte(offset++);
      if (marker === 0 || marker === 0xd8 || marker === 0xd9 || marker === 0xda) return invalid();
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return invalid();
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return invalid();
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8 || !byte(offset + 7) || length !== 8 + 3 * byte(offset + 7)) return invalid();
        return dimensions('image/jpeg', view.getUint16(offset + 5), view.getUint16(offset + 3));
      }
      offset += length;
    }
    return invalid();
  }
  if (bytes.length >= 12 && text(0, 'RIFF') && text(8, 'WEBP')) {
    const end = view.getUint32(4, true) + 8;
    if (end !== bytes.length) return invalid();
    for (let offset = 12, chunks = 0; offset + 8 <= end && chunks < 4096; chunks++) {
      const size = view.getUint32(offset + 4, true);
      const start = offset + 8;
      if (start + size + (size & 1) > end) return invalid();
      if (text(offset, 'VP8X')) {
        if (size !== 10) return invalid();
        const uint24 = (i: number) => byte(i) + byte(i + 1) * 256 + byte(i + 2) * 65536;
        return dimensions('image/webp', uint24(start + 4) + 1, uint24(start + 7) + 1);
      }
      if (text(offset, 'VP8 ')) {
        if (size < 10 || (byte(start) & 1) || !text(start + 3, '\x9d\x01\x2a')) return invalid();
        return dimensions('image/webp', view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff);
      }
      if (text(offset, 'VP8L')) {
        if (size < 5 || byte(start) !== 0x2f || byte(start + 4) >> 5) return invalid();
        const bits = view.getUint32(start + 1, true);
        return dimensions('image/webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      }
      offset = start + size + (size & 1);
    }
  }
  return invalid();
}

export interface PreparedImage { name: string; image: Blob }

type Canvas = OffscreenCanvas | HTMLCanvasElement;

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (!(file instanceof Blob)) throw new TypeError('Expected an image Blob or File');
  if (!file.size || file.size > MAX_BYTES) throw new Error('Image must be between 1 byte and 20 MiB');
  const bytes = await file.arrayBuffer();
  const header = validateImageHeader(bytes);
  if (typeof globalThis.createImageBitmap !== 'function') throw new Error('Image decoding is unavailable');
  const bitmap = await globalThis.createImageBitmap(new Blob([bytes], { type: header.type }));
  try {
    dimensions(header.type, bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas: Canvas | undefined = typeof globalThis.OffscreenCanvas === 'function'
      ? new globalThis.OffscreenCanvas(width, height)
      : globalThis.document?.createElement('canvas');
    if (!canvas) throw new Error('Canvas is unavailable');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!context) throw new Error('Canvas rendering is unavailable');
    context.drawImage(bitmap, 0, 0, width, height);
    const encode = (type: string): Promise<Blob | null> => 'convertToBlob' in canvas
      ? canvas.convertToBlob({ type, quality: 0.9 })
      : new Promise((resolve, reject) => {
        try { canvas.toBlob(resolve, type, 0.9); } catch (error) { reject(error); }
      });
    let image: Blob | null | undefined;
    try { image = await encode('image/webp'); } catch { /* PNG is the portable fallback. */ }
    if (!image?.size || !['image/webp', 'image/png'].includes(image.type)) image = await encode('image/png');
    if (!(image instanceof Blob) || !image.size || !['image/webp', 'image/png'].includes(image.type)) {
      throw new Error('Image encoding failed');
    }
    const name = (file as Partial<File>).name;
    return { name: typeof name === 'string' ? name : '', image };
  } finally {
    bitmap.close();
  }
}
