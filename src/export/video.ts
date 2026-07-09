import type { Project } from '../types';
import { ACTION_LABELS } from '../types';
import { downloadBlob, fitRect, loadImage, sanitizeFilename } from '../utils';

const W = 1280;
const H = 720;
const CAPTION_H = 84;
const TITLE_SEC = 2.2;
const STEP_SEC = 3.6;
const OUTRO_SEC = 2.0;

/**
 * Renders the tutorial onto a canvas (title card → each step with an animated
 * highlight → outro) and records it with MediaRecorder into a WebM file.
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

  const total = TITLE_SEC + project.steps.length * STEP_SEC + OUTRO_SEC;

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
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, 0, W, H);

    if (t < TITLE_SEC) {
      drawTitleCard(t / TITLE_SEC);
      return;
    }
    const st = t - TITLE_SEC;
    const stepIdx = Math.floor(st / STEP_SEC);
    if (stepIdx >= project.steps.length) {
      drawOutro();
      return;
    }
    drawStep(stepIdx, (st - stepIdx * STEP_SEC) / STEP_SEC);
  }

  function drawTitleCard(p: number) {
    const alpha = Math.min(1, p * 3);
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px "Segoe UI", "Malgun Gothic", sans-serif';
    fillWrapped(project.title, W / 2, H / 2 - 30, W - 200, 66);
    ctx.font = '26px "Segoe UI", "Malgun Gothic", sans-serif';
    ctx.fillStyle = '#9aa3b2';
    ctx.fillText(`${project.steps.length}개 스텝 튜토리얼`, W / 2, H / 2 + 60);
    ctx.fillStyle = '#4f7cff';
    ctx.fillRect(W / 2 - 60, H / 2 + 100, 120, 5);
    ctx.globalAlpha = 1;
  }

  function drawOutro() {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px "Segoe UI", "Malgun Gothic", sans-serif';
    ctx.fillText('🎉', W / 2, H / 2 - 60);
    ctx.fillText('튜토리얼 완료!', W / 2, H / 2 + 20);
    ctx.font = '26px "Segoe UI", "Malgun Gothic", sans-serif';
    ctx.fillStyle = '#9aa3b2';
    ctx.fillText(project.title, W / 2, H / 2 + 70);
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
      ctx.save();
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 4 + pulse * 3;
      ctx.shadowColor = 'rgba(255,59,48,0.8)';
      ctx.shadowBlur = 10 + pulse * 18;
      ctx.strokeRect(bx, by, bw, bh);
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
        ctx.strokeStyle = `rgba(255,255,255,${(1 - ripple) * 0.9})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fill();
        ctx.restore();
      }
    }

    // caption bar
    ctx.fillStyle = '#1a1d24';
    ctx.fillRect(0, H - CAPTION_H, W, CAPTION_H);
    ctx.fillStyle = '#4f7cff';
    // progress within the whole video
    ctx.fillRect(0, H - CAPTION_H, W * ((i + p) / project.steps.length), 4);

    // badge
    const label = ACTION_LABELS[step.action];
    ctx.font = 'bold 20px "Segoe UI", "Malgun Gothic", sans-serif';
    const bw2 = ctx.measureText(label).width + 28;
    roundRect(24, H - CAPTION_H + 22, bw2, 36, 18);
    ctx.fillStyle = '#4f7cff';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 38, H - CAPTION_H + 41);

    // description
    ctx.font = '24px "Segoe UI", "Malgun Gothic", sans-serif';
    ctx.fillStyle = '#e8eaf0';
    const desc = step.description || '';
    ctx.fillText(truncate(desc, W - bw2 - 180), 38 + bw2 + 16, H - CAPTION_H + 41);

    // counter
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9aa3b2';
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
