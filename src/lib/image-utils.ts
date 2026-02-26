/**
 * Reads the raw EXIF orientation tag from the first 64 KB of a JPEG file.
 * Returns 1 (upright / no rotation needed) for non-JPEGs or missing tags.
 */
async function readExifOrientation(file: File): Promise<number> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer) { resolve(1); return; }

        const view = new DataView(buffer);

        // Must start with JPEG SOI marker 0xFFD8
        if (view.getUint16(0) !== 0xFFD8) { resolve(1); return; }

        let offset = 2;
        while (offset + 4 <= view.byteLength) {
          const marker = view.getUint16(offset);
          offset += 2;

          if (marker === 0xFFE1) {
            // APP1 segment — check for "Exif\0\0" header
            const segLength = view.getUint16(offset);
            if (
              segLength < 8 ||
              offset + 8 > view.byteLength ||
              view.getUint32(offset + 2) !== 0x45786966 || // "Exif"
              view.getUint16(offset + 6) !== 0x0000        // null terminator
            ) {
              resolve(1); return;
            }

            const tiffStart = offset + 8;
            const littleEndian = view.getUint16(tiffStart) === 0x4949;
            const firstIFD = view.getUint32(tiffStart + 4, littleEndian);
            const numEntries = view.getUint16(tiffStart + firstIFD, littleEndian);

            for (let i = 0; i < numEntries; i++) {
              const entryOffset = tiffStart + firstIFD + 2 + i * 12;
              if (entryOffset + 12 > view.byteLength) break;
              const tag = view.getUint16(entryOffset, littleEndian);
              if (tag === 0x0112) {
                resolve(view.getUint16(entryOffset + 8, littleEndian));
                return;
              }
            }
            resolve(1); return;
          }

          // Skip non-APP1 segments
          if ((marker & 0xFF00) !== 0xFF00) { resolve(1); return; }
          if (offset + 2 > view.byteLength) { resolve(1); return; }
          offset += view.getUint16(offset);
        }
        resolve(1);
      } catch {
        resolve(1);
      }
    };

    reader.onerror = () => resolve(1);
    // Only the first 64 KB is needed to find the EXIF block
    reader.readAsArrayBuffer(file.slice(0, 65536));
  });
}

/** Load a File into an HTMLImageElement via a temporary object URL. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

/**
 * Normalizes the orientation of a JPEG photo by baking the EXIF rotation
 * into the pixel data via Canvas, then returning a new File.
 *
 * This is necessary because Supabase's CDN strips EXIF metadata when serving
 * images, so the CSS `image-orientation: from-image` trick has nothing to read.
 * Storing a correctly-rotated JPEG ensures every viewer sees the right orientation.
 *
 * Non-JPEG files are returned unchanged.
 */
export async function normalizeImageOrientation(file: File): Promise<File> {
  const isJpeg =
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    /\.(jpg|jpeg)$/i.test(file.name);

  if (!isJpeg) return file;

  const orientation = await readExifOrientation(file);

  // 1 = normal upright — nothing to do
  if (orientation <= 1) return file;

  try {
    const img = await loadImage(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // Orientations 5–8 require swapping width ↔ height
    const swap = orientation >= 5;
    canvas.width  = swap ? img.naturalHeight : img.naturalWidth;
    canvas.height = swap ? img.naturalWidth  : img.naturalHeight;

    // Apply the affine transform that cancels out the EXIF rotation/mirror
    //   orientation: transform needed
    //   2  mirror-x
    //   3  rotate 180°
    //   4  mirror-y
    //   5  mirror-x + rotate -90°
    //   6  rotate 90°  (most common: portrait shot on a landscape-first phone)
    //   7  mirror-x + rotate 90°
    //   8  rotate -90°
    switch (orientation) {
      case 2: ctx.transform(-1,  0,  0,  1, canvas.width, 0); break;
      case 3: ctx.transform(-1,  0,  0, -1, canvas.width, canvas.height); break;
      case 4: ctx.transform( 1,  0,  0, -1, 0, canvas.height); break;
      case 5: ctx.transform( 0,  1,  1,  0, 0, 0); break;
      case 6: ctx.transform( 0,  1, -1,  0, canvas.height, 0); break;
      case 7: ctx.transform( 0, -1, -1,  0, canvas.height, canvas.width); break;
      case 8: ctx.transform( 0, -1,  1,  0, 0, canvas.width); break;
    }

    ctx.drawImage(img, 0, 0);

    return new Promise<File>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: file.lastModified,
            }));
          } else {
            resolve(file); // canvas failed — use original
          }
        },
        'image/jpeg',
        0.92 // slight compression to avoid bloating rotated files
      );
    });
  } catch (err) {
    console.warn('[image-utils] Orientation normalization failed, using original:', err);
    return file;
  }
}

/**
 * Load an image from a URL (with CORS) and return it as an HTMLImageElement.
 * Use crossOrigin = 'anonymous' so the image can be drawn to a canvas.
 */
function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for rotation'));
    img.src = url;
  });
}

/**
 * Rotate an image from a URL by 90° (clockwise) or -90° (counter-clockwise).
 * Draws to canvas and returns a JPEG Blob. Use this to re-upload the rotated image
 * so rotation persists without needing a rotation_degrees column.
 */
export async function rotateImageByUrl(
  imageUrl: string,
  deltaDegrees: 90 | -90
): Promise<Blob> {
  const img = await loadImageFromUrl(imageUrl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  const w = img.naturalWidth;
  const h = img.naturalHeight;

  if (deltaDegrees === 90) {
    canvas.width = h;
    canvas.height = w;
    ctx.translate(h, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0);
  } else {
    canvas.width = h;
    canvas.height = w;
    ctx.translate(0, w);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, 0, 0);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      0.92
    );
  });
}
