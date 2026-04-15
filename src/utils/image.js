// Resize + recompress an image file to a small JPEG data URL suitable for
// storing directly in a Firestore user document. This avoids needing
// Firebase Storage (which requires the paid Blaze plan on new projects).
//
// 256x256 JPEG at quality 0.82 is typically 15-30 KB — comfortably under
// Firestore's 1 MB per-document limit.
export async function fileToResizedDataUrl(file, {
  maxSize = 256,
  quality = 0.82,
  mimeType = 'image/jpeg'
} = {}) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image must be under 10 MB before resizing.');
  }

  const bitmap = await loadImage(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSize);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // White background for any transparency so the resulting JPEG looks right.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);

  if (bitmap.close) bitmap.close();

  const dataUrl = canvas.toDataURL(mimeType, quality);

  // Hard cap: if somehow the result is still larger than ~700 KB, reject it.
  // Firestore doc limit is 1 MB total; we need room for other fields.
  if (dataUrl.length > 700_000) {
    throw new Error('That image is too large even after resizing. Try a smaller one.');
  }
  return dataUrl;
}

function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function fitWithin(w, h, max) {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = Math.min(max / w, max / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}
