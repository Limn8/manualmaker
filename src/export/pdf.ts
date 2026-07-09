import { jsPDF } from 'jspdf';
import type { Project, Step } from '../types';
import { ACTION_LABELS } from '../types';
import { fitRect, loadImage, sanitizeFilename } from '../utils';

const PAGE_W = 1600;
const PAGE_H = 1000;
const CAPTION_H = 150;
const MARGIN = 40;

/**
 * Renders each step (image + highlight box + caption) onto a canvas and adds
 * it to the PDF as a full-page image. Rendering text via canvas means Korean
 * text works without embedding fonts into jsPDF.
 */
export async function exportPdf(
  project: Project,
  onProgress?: (p: number) => void,
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [PAGE_W / 2, PAGE_H / 2],
  });

  // Title page
  doc.addImage(renderTitlePage(project), 'JPEG', 0, 0, PAGE_W / 2, PAGE_H / 2);

  for (let i = 0; i < project.steps.length; i++) {
    const step = project.steps[i];
    const img = await loadImage(step.image);
    doc.addPage([PAGE_W / 2, PAGE_H / 2], 'landscape');
    doc.addImage(
      renderStepPage(step, img, i, project.steps.length),
      'JPEG',
      0,
      0,
      PAGE_W / 2,
      PAGE_H / 2,
    );
    onProgress?.((i + 1) / project.steps.length);
  }

  doc.save(sanitizeFilename(project.title) + '.pdf');
}

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  return [canvas, ctx];
}

function renderTitlePage(project: Project): string {
  const [canvas, ctx] = makeCanvas();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.fillStyle = '#3182f6';
  ctx.fillRect(0, PAGE_H - 16, PAGE_W, 16);
  ctx.fillStyle = '#e8f3ff';
  ctx.beginPath();
  ctx.arc(PAGE_W / 2, PAGE_H / 2 - 190, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = '64px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('📸', PAGE_W / 2, PAGE_H / 2 - 182);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#191f28';
  ctx.font = 'bold 72px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
  wrapText(ctx, project.title, PAGE_W / 2, PAGE_H / 2 - 20, PAGE_W - 300, 90);
  ctx.font = '32px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
  ctx.fillStyle = '#8b95a1';
  ctx.fillText(`${project.steps.length}개 스텝 · ManualMaker로 제작`, PAGE_W / 2, PAGE_H / 2 + 80);
  return canvas.toDataURL('image/jpeg', 0.9);
}

function renderStepPage(
  step: Step,
  img: HTMLImageElement,
  index: number,
  total: number,
): string {
  const [canvas, ctx] = makeCanvas();

  // image area
  const areaW = PAGE_W - MARGIN * 2;
  const areaH = PAGE_H - CAPTION_H - MARGIN * 2;
  const fit = fitRect(img.naturalWidth, img.naturalHeight, areaW, areaH);
  const dx = MARGIN + fit.x;
  const dy = MARGIN + fit.y;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 24;
  ctx.drawImage(img, dx, dy, fit.w, fit.h);
  ctx.restore();
  ctx.strokeStyle = '#d9dce3';
  ctx.lineWidth = 2;
  ctx.strokeRect(dx, dy, fit.w, fit.h);

  // highlight box
  if (step.box) {
    const bx = dx + step.box.x * fit.w;
    const by = dy + step.box.y * fit.h;
    const bw = step.box.w * fit.w;
    const bh = step.box.h * fit.h;
    ctx.save();
    ctx.strokeStyle = '#3182f6';
    ctx.lineWidth = 6;
    ctx.shadowColor = 'rgba(49,130,246,0.55)';
    ctx.shadowBlur = 16;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.restore();
  }

  // caption bar
  const capY = PAGE_H - CAPTION_H;
  ctx.fillStyle = '#f9fafb';
  ctx.fillRect(0, capY, PAGE_W, CAPTION_H);
  ctx.fillStyle = '#3182f6';
  ctx.fillRect(0, capY, 8, CAPTION_H);

  // step number circle
  ctx.beginPath();
  ctx.arc(MARGIN + 40, capY + CAPTION_H / 2, 36, 0, Math.PI * 2);
  ctx.fillStyle = '#3182f6';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index + 1), MARGIN + 40, capY + CAPTION_H / 2 + 2);

  // caption text
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#111318';
  ctx.font = 'bold 34px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
  const label = `[${ACTION_LABELS[step.action]}]`;
  const labelW = ctx.measureText(label).width;
  ctx.fillStyle = '#3182f6';
  ctx.fillText(label, MARGIN + 110, capY + 62);
  ctx.fillStyle = '#191f28';
  ctx.font = '32px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
  const desc = step.description || '';
  wrapText(ctx, desc, MARGIN + 130 + labelW, capY + 62, PAGE_W - MARGIN * 2 - 160 - labelW, 42, 'left');
  ctx.fillStyle = '#9aa3b2';
  ctx.font = '24px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${index + 1} / ${total}`, PAGE_W - MARGIN, capY + CAPTION_H - 28);

  return canvas.toDataURL('image/jpeg', 0.85);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: 'center' | 'left' = 'center',
): void {
  const prevAlign = ctx.textAlign;
  ctx.textAlign = align;
  const chars = text.split('');
  let line = '';
  let cy = y;
  for (const ch of chars) {
    if (ch === '\n' || ctx.measureText(line + ch).width > maxWidth) {
      ctx.fillText(line, x, cy);
      line = ch === '\n' ? '' : ch;
      cy += lineHeight;
    } else {
      line += ch;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  ctx.textAlign = prevAlign;
}
