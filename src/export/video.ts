import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  canEncodeVideo,
} from 'mediabunny';
import type { Project } from '../types';
import { ACTION_LABELS, DEFAULT_BOX_COLOR, DEFAULT_BOX_SHAPE } from '../types';
import { downloadBlob, fitRect, loadImage, sanitizeFilename } from '../utils';

const W = 1280;
const H = 720;
const CAPTION_H = 84;
const TITLE_SEC = 2.2;
const STEP_SEC = 3.6;

/**
 * Renders the manual onto a canvas (title card → each step with an animated
 * highlight) and exports MP4 when WebCodecs can encode it.
 */
export async function exportVideo(
  project: Project,
  onProgress?: (p: number) => void,
): Promise<void> {
  const images = await Promise.all(project.steps.map((s) => loadImage(s.image)));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const total = TITLE_SEC + project.steps.length * STEP_SEC;

  try {
    const mp4 = await renderMp4(canvas, draw, total, onProgress);
    downloadBlob(sanitizeFilename(project.title) + '.mp4', mp4);
    return;
  } catch (err) {
    console.warn('MP4 export unavailable; falling back to WebM.', err);
  }

  const mime =
    ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) =>
      MediaRecorder.isTypeSupported(m),
    ) ?? '';
  if (!mime) throw new Error('이 브라우저는 영상 녹화를 지원하지 않습니다');

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 6_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start(250);

  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    function frame() {
      const t = (performance.now() - t0) / 1000;
      if (t >= total) {
        resolve();
        return;
      }
      draw(t);
      onProgress?.(Math.min(1, t / total));
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  recorder.stop();
  stream.getTracks().forEach((tr) => tr.stop());
  await stopped;

  downloadBlob(
    sanitizeFilename(project.title) + '.webm',
    new Blob(chunks, { type: 'video/webm' }),
  );

  function draw(t: number) {
    ctx.fillStyle = '#f2f4f6';
    ctx.fillRect(0, 0, W, H);

    if (t < TITLE_SEC) {
      drawTitleCard(t / TITLE_SEC);
      return;
    }
    const st = t - TITLE_SEC;
    const stepIdx = Math.floor(st / STEP_SEC);
    if (stepIdx >= project.steps.length) {
      drawStep(project.steps.length - 1, 1);
      return;
    }
    drawStep(stepIdx, (st - stepIdx * STEP_SEC) / STEP_SEC);
  }

  function drawTitleCard(p: number) {
    const alpha = Math.min(1, p * 3);
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#191f28';
    ctx.font = 'bold 54px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
    fillWrapped(project.title, W / 2, H / 2 - 20, W - 200, 66);
    ctx.fillStyle = '#3182f6';
    ctx.fillRect(W / 2 - 60, H / 2 + 56, 120, 5);
    ctx.globalAlpha = 1;
  }


  function drawStep(i: number, p: number) {
    const step = project.steps[i];
    const img = images[i];

    // fade-in on step change
    const alpha = Math.min(1, p * 6);
    ctx.globalAlpha = alpha;

    const areaH = H - CAPTION_H;
    const fit = fitRect(img.naturalWidth, img.naturalHeight, W - 40, areaH - 30);
    const dx = 20 + fit.x;
    const dy = 15 + fit.y;
    ctx.drawImage(img, dx, dy, fit.w, fit.h);

    if (step.box) {
      const bx = dx + step.box.x * fit.w;
      const by = dy + step.box.y * fit.h;
      const bw = step.box.w * fit.w;
      const bh = step.box.h * fit.h;

      // dim everything except the highlighted region
      ctx.save();
      ctx.beginPath();
      ctx.rect(dx, dy, fit.w, fit.h);
      ctx.rect(bx, by, bw, bh);
      ctx.clip('evenodd');
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(dx, dy, fit.w, fit.h);
      ctx.restore();

      // pulsing border
      const pulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 4);
      const boxColor = step.boxColor ?? DEFAULT_BOX_COLOR;
      const boxShape = step.boxShape ?? DEFAULT_BOX_SHAPE;
      ctx.save();
      ctx.strokeStyle = boxColor;
      ctx.lineWidth = 4 + pulse * 3;
      ctx.shadowColor = boxColor;
      ctx.shadowBlur = 10 + pulse * 18;
      strokeBox(bx, by, bw, bh, boxShape);
      ctx.restore();

      // click ripple animation at the box center
      if (
        step.action === 'click' ||
        step.action === 'doubleclick' ||
        step.action === 'rightclick'
      ) {
        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        const ripple = (p * 2) % 1;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 8 + ripple * 34, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(49,130,246,${(1 - ripple) * 0.9})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
      }

      // corner action tag at the box bottom-right
      if (step.showBoxLabel !== false) {
        drawTag(bx, by, bw, bh, step.action, boxColor);
      }
    }

    // caption bar
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, H - CAPTION_H, W, CAPTION_H);
    ctx.fillStyle = '#3182f6';
    // progress within the whole video
    ctx.fillRect(0, H - CAPTION_H, W * ((i + p) / project.steps.length), 4);

    // badge
    const label = ACTION_LABELS[step.action];
    ctx.font = 'bold 20px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
    const bw2 = ctx.measureText(label).width + 28;
    roundRect(24, H - CAPTION_H + 22, bw2, 36, 12);
    ctx.fillStyle = '#e8f3ff';
    ctx.fill();
    ctx.fillStyle = '#3182f6';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 38, H - CAPTION_H + 41);

    // description
    ctx.font = '24px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
    ctx.fillStyle = '#191f28';
    const desc = step.description || '';
    ctx.fillText(truncate(desc, W - bw2 - 180), 38 + bw2 + 16, H - CAPTION_H + 41);

    // counter
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8b95a1';
    ctx.fillText(`${i + 1} / ${project.steps.length}`, W - 24, H - CAPTION_H + 41);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Pill with action icon + label, anchored to the box bottom-right
  function drawTag(
    bx: number,
    by: number,
    bw: number,
    bh: number,
    action: string,
    color: string,
  ) {
    const label = ACTION_LABELS[action as keyof typeof ACTION_LABELS];
    ctx.save();
    ctx.font = 'bold 18px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
    const iconW = 16;
    const gap = 6;
    const padX = 11;
    const tagH = 32;
    const textW = ctx.measureText(label).width;
    const tagW = padX * 2 + iconW + gap + textW;
    let tx = bx + bw - tagW;
    tx = Math.max(8, Math.min(tx, W - 8 - tagW));
    let ty = by + bh + 8;
    if (ty + tagH > H - CAPTION_H - 6) ty = by - tagH - 8;
    if (ty < 6) ty = 6;
    roundRect(tx, ty, tagW, tagH, 10);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    drawActionIcon(tx + padX, ty + tagH / 2, iconW, action);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, tx + padX + iconW + gap, ty + tagH / 2 + 1);
    ctx.restore();
  }

  function strokeBox(
    x: number,
    y: number,
    width: number,
    height: number,
    shape: string,
  ): void {
    if (shape === 'circle') {
      ctx.beginPath();
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    if (shape === 'rounded') {
      roundRect(x, y, width, height, 16);
      ctx.stroke();
      return;
    }
    ctx.strokeRect(x, y, width, height);
  }

  // Vector action icon (white stroke) matching the app's SVG icons
  function drawActionIcon(x: number, y: number, size: number, action: string) {
    const s = size / 24;
    ctx.save();
    ctx.translate(x, y - size / 2);
    ctx.scale(s, s);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (action === 'click' || action === 'doubleclick') {
      ctx.beginPath();
      ctx.moveTo(5, 3);
      ctx.lineTo(5, 19);
      ctx.lineTo(9, 15);
      ctx.lineTo(12, 21);
      ctx.lineTo(14, 20);
      ctx.lineTo(11, 14);
      ctx.lineTo(17, 14);
      ctx.closePath();
      ctx.stroke();
    } else if (action === 'rightclick') {
      roundRect(6, 2, 12, 20, 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(12, 2);
      ctx.lineTo(12, 10);
      ctx.stroke();
    } else if (action === 'type') {
      ctx.beginPath();
      ctx.moveTo(6, 7);
      ctx.lineTo(6, 5);
      ctx.lineTo(18, 5);
      ctx.lineTo(18, 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(12, 5);
      ctx.lineTo(12, 19);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(9, 19);
      ctx.lineTo(15, 19);
      ctx.stroke();
    } else if (action === 'scroll') {
      ctx.beginPath();
      ctx.moveTo(12, 4);
      ctx.lineTo(12, 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(7, 9);
      ctx.lineTo(12, 4);
      ctx.lineTo(17, 9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(7, 15);
      ctx.lineTo(12, 20);
      ctx.lineTo(17, 15);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(12, 12, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(12, 11);
      ctx.lineTo(12, 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(12, 7.8, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function truncate(text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let s = text;
    while (s.length > 0 && ctx.measureText(s + '…').width > maxWidth) {
      s = s.slice(0, -1);
    }
    return s + '…';
  }

  function fillWrapped(text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
    let line = '';
    let cy = y;
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxWidth) {
        ctx.fillText(line, x, cy);
        line = ch;
        cy += lineHeight;
      } else {
        line += ch;
      }
    }
    if (line) ctx.fillText(line, x, cy);
  }
}

async function renderMp4(
  canvas: HTMLCanvasElement,
  draw: (time: number) => void,
  total: number,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const canEncodeAvc = await canEncodeVideo('avc', {
    width: W,
    height: H,
    bitrate: QUALITY_HIGH,
  });
  if (!canEncodeAvc) {
    throw new Error('이 브라우저는 MP4 인코딩을 지원하지 않습니다');
  }

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat(),
    target,
  });
  const source = new CanvasSource(canvas, {
    codec: 'avc',
    bitrate: QUALITY_HIGH,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source);
  await output.start();

  const frameRate = 30;
  const frameDuration = 1 / frameRate;
  const frameCount = Math.ceil(total * frameRate);
  for (let frame = 0; frame <= frameCount; frame++) {
    const time = Math.min(total, frame * frameDuration);
    draw(time);
    await source.add(time, frameDuration);
    onProgress?.(Math.min(1, time / total));
  }

  await output.finalize();
  if (!target.buffer) {
    throw new Error('MP4 파일 생성에 실패했습니다');
  }
  return new Blob([target.buffer], { type: 'video/mp4' });
}

