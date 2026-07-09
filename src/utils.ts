export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned || 'manual';
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다'));
    img.src = src;
  });
}

/** Fit (sw, sh) into (dw, dh), centered. Returns draw rect. */
export function fitRect(
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}

interface NormalizedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageDrawRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export function focusedImageDrawRect(
  sourceW: number,
  sourceH: number,
  destW: number,
  destH: number,
  box: NormalizedBox | null,
): ImageDrawRect {
  const fullFit = fitRect(sourceW, sourceH, destW, destH);
  if (!box || sourceW <= destW * 1.25 || sourceH <= destH * 1.25) {
    return {
      sx: 0,
      sy: 0,
      sw: sourceW,
      sh: sourceH,
      dx: fullFit.x,
      dy: fullFit.y,
      dw: fullFit.w,
      dh: fullFit.h,
    };
  }

  const aspect = destW / destH;
  const bx = box.x * sourceW;
  const by = box.y * sourceH;
  const bw = Math.max(1, box.w * sourceW);
  const bh = Math.max(1, box.h * sourceH);
  const cx = bx + bw / 2;
  const cy = by + bh / 2;

  let cropW = Math.max(sourceW * 0.42, bw * 4.2, bh * aspect * 3.8);
  let cropH = cropW / aspect;
  if (cropH > sourceH) {
    cropH = Math.min(sourceH, Math.max(sourceH * 0.42, bh * 4.2, bw / aspect * 3.8));
    cropW = cropH * aspect;
  }
  cropW = Math.min(sourceW, cropW);
  cropH = Math.min(sourceH, cropH);

  const padX = Math.min(cropW * 0.18, Math.max(24, bw * 0.9));
  const padY = Math.min(cropH * 0.18, Math.max(24, bh * 0.9));
  let sx = clamp(cx - cropW / 2, bx + bw + padX - cropW, bx - padX);
  let sy = clamp(cy - cropH / 2, by + bh + padY - cropH, by - padY);
  sx = clamp(sx, 0, sourceW - cropW);
  sy = clamp(sy, 0, sourceH - cropH);

  const fit = fitRect(cropW, cropH, destW, destH);
  return {
    sx,
    sy,
    sw: cropW,
    sh: cropH,
    dx: fit.x,
    dy: fit.y,
    dw: fit.w,
    dh: fit.h,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
