import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import type { Project } from '../types';
import {
  ACTION_LABELS,
  DEFAULT_BOX_COLOR,
  DEFAULT_BOX_SHAPE,
  DEFAULT_VIDEO_DUBBING_ENABLED,
  DEFAULT_VIDEO_STEP_SEC,
  DEFAULT_VIDEO_TTS_VOICE,
} from '../types';
import { downloadBlob, fitRect, loadImage, sanitizeFilename } from '../utils';

const W = 1280;
const H = 720;
const RASTER_SCALE = 1.5;
const VIDEO_BITRATE = 18_000_000;
const AUDIO_BITRATE = 192_000;
const MIN_CAPTION_H = 84;
const MAX_CAPTION_H = H - 180;
const TITLE_SEC = 2.2;
const TTS_TAIL_SEC = 0.35;
const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
const GEMINI_TTS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_PCM_SAMPLE_RATE = 24000;
const GEMINI_PCM_CHANNELS = 1;
const GEMINI_PCM_BITS_PER_SAMPLE = 16;

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
  canvas.width = W * RASTER_SCALE;
  canvas.height = H * RASTER_SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(RASTER_SCALE, RASTER_SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const stepSec = Math.min(30, Math.max(1, project.videoStepSec ?? DEFAULT_VIDEO_STEP_SEC));
  const dubbingEnabled = project.videoDubbingEnabled ?? DEFAULT_VIDEO_DUBBING_ENABLED;
  const narrations = dubbingEnabled
    ? await fetchNarrations(project, (p) => onProgress?.(p * 0.2))
    : null;
  const stepDurations = project.steps.map((_, index) => {
    const audioDuration = narrations?.buffers[index]?.duration ?? 0;
    return Math.max(stepSec, audioDuration + TTS_TAIL_SEC);
  });
  const stepOffsets = makeStepOffsets(stepDurations);
  const stepsTotal = stepDurations.reduce((sum, duration) => sum + duration, 0);
  const narrationAudio = narrations
    ? makeTimelineAudio(narrations.context, narrations.buffers, stepOffsets, TITLE_SEC + stepsTotal)
    : null;

  const total = TITLE_SEC + stepsTotal;

  try {
    const mp4 = await renderMp4(canvas, draw, total, narrationAudio, (p) => {
      onProgress?.(narrations ? 0.2 + p * 0.8 : p);
    });
    downloadBlob(sanitizeFilename(project.title) + '.mp4', mp4);
    narrations?.context.close().catch(() => {});
    return;
  } catch (err) {
    if (narrationAudio) {
      narrations?.context.close().catch(() => {});
      throw err;
    }
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
    videoBitsPerSecond: 18_000_000,
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
  narrations?.context.close().catch(() => {});

  function draw(t: number) {
    ctx.fillStyle = '#f2f4f6';
    ctx.fillRect(0, 0, W, H);

    if (t < TITLE_SEC) {
      drawTitleCard(t / TITLE_SEC);
      return;
    }
    const st = t - TITLE_SEC;
    const stepIdx = findStepIndex(st, stepOffsets, stepDurations);
    if (stepIdx >= project.steps.length) {
      drawStep(project.steps.length - 1, 1);
      return;
    }
    const stepStart = stepOffsets[stepIdx];
    const stepDuration = stepDurations[stepIdx] || stepSec;
    drawStep(stepIdx, (st - stepStart) / stepDuration);
  }

  function drawTitleCard(p: number) {
    const alpha = Math.min(1, p * 3);
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#191f28';
    ctx.font = 'bold 54px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
    const titleLines = wrapTextLines(project.title, W - 200);
    const titleY = H / 2 - ((titleLines.length - 1) * 66) / 2 - 20;
    drawTextLines(titleLines, W / 2, titleY, 66, 'center');
    ctx.fillStyle = '#3182f6';
    ctx.fillRect(W / 2 - 60, titleY + titleLines.length * 66 + 10, 120, 5);
    ctx.globalAlpha = 1;
  }


  function drawStep(i: number, p: number) {
    const step = project.steps[i];
    const img = images[i];

    // fade-in on step change
    const alpha = Math.min(1, p * 6);
    ctx.globalAlpha = alpha;

    const label = ACTION_LABELS[step.action];
    ctx.font = 'bold 20px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
    const badgeW = ctx.measureText(label).width + 28;
    const descX = 38 + badgeW + 16;
    const descMaxW = W - descX - 160;
    ctx.font = '24px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
    const descLines = wrapTextLines(step.description || '', descMaxW);
    const textLineCount = Math.max(1, descLines.length);
    const captionH = Math.min(
      MAX_CAPTION_H,
      Math.max(MIN_CAPTION_H, 44 + textLineCount * 30 + 18),
    );
    const capY = H - captionH;

    const areaH = H - captionH;
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
        drawTag(bx, by, bw, bh, step.action, boxColor, captionH);
      }
    }

    // caption bar
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, capY, W, captionH);
    ctx.fillStyle = '#3182f6';
    // progress within the whole video
    ctx.fillRect(0, capY, W * ((i + p) / project.steps.length), 4);

    // badge
    ctx.font = 'bold 20px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
    roundRect(24, capY + 22, badgeW, 36, 12);
    ctx.fillStyle = '#e8f3ff';
    ctx.fill();
    ctx.fillStyle = '#3182f6';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 38, capY + 41);

    // description
    ctx.font = '24px "Pretendard Variable", Pretendard, "Segoe UI", "Malgun Gothic", sans-serif';
    ctx.fillStyle = '#191f28';
    drawTextLines(descLines, descX, capY + 39, 30, 'left');

    // counter
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8b95a1';
    ctx.fillText(`${i + 1} / ${project.steps.length}`, W - 24, capY + 41);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
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
    captionH: number,
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
    if (ty + tagH > H - captionH - 6) ty = by - tagH - 8;
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

  function drawTextLines(
    lines: readonly string[],
    x: number,
    y: number,
    lineHeight: number,
    align: CanvasTextAlign,
  ): void {
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    lines.forEach((line, index) => {
      ctx.fillText(line, x, y + index * lineHeight);
    });
  }

  function wrapTextLines(text: string, maxWidth: number): string[] {
    const paragraphs = text.length > 0 ? text.split(/\r?\n/) : [''];
    const lines: string[] = [];
    paragraphs.forEach((paragraph) => {
      let line = '';
      for (const ch of paragraph) {
        const next = line + ch;
        if (line && ctx.measureText(next).width > maxWidth) {
          lines.push(line);
          line = ch;
        } else {
          line = next;
        }
      }
      lines.push(line);
    });
    return lines;
  }
}

async function renderMp4(
  canvas: HTMLCanvasElement,
  draw: (time: number) => void,
  total: number,
  audioBuffer: AudioBuffer | null,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const canEncodeAvc = await canEncodeVideo('avc', {
    width: canvas.width,
    height: canvas.height,
    bitrate: VIDEO_BITRATE,
  });
  if (!canEncodeAvc) {
    throw new Error('이 브라우저는 MP4 인코딩을 지원하지 않습니다');
  }
  if (audioBuffer) {
    const canEncodeAac = await canEncodeAudio('aac', {
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
      bitrate: AUDIO_BITRATE,
    });
    if (!canEncodeAac) {
      throw new Error('이 브라우저는 더빙 포함 MP4 인코딩을 지원하지 않습니다');
    }
  }

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat(),
    target,
  });
  const source = new CanvasSource(canvas, {
    codec: 'avc',
    bitrate: VIDEO_BITRATE,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source);
  const audioSource = audioBuffer
    ? new AudioBufferSource({
        codec: 'aac',
        bitrate: AUDIO_BITRATE,
      })
    : null;
  if (audioSource) output.addAudioTrack(audioSource);
  await output.start();
  if (audioBuffer && audioSource) {
    await audioSource.add(audioBuffer);
  }

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

type NarrationResult = {
  context: AudioContext;
  buffers: AudioBuffer[];
};

async function fetchNarrations(
  project: Project,
  onProgress?: (p: number) => void,
): Promise<NarrationResult> {
  const apiKey = project.videoGeminiApiKey?.trim();
  if (!apiKey) {
    throw new Error('더빙을 포함하려면 영상 내보내기 창에 Gemini API key를 입력하세요.');
  }

  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) {
    throw new Error('이 브라우저는 오디오 더빙을 지원하지 않습니다.');
  }

  const context = new AudioContextCtor();
  const voice = project.videoTtsVoice?.trim() || DEFAULT_VIDEO_TTS_VOICE;
  const buffers: AudioBuffer[] = [];

  try {
    for (let i = 0; i < project.steps.length; i++) {
      const audioBytes = await requestGeminiNarrationAudio(apiKey, {
        text: makeNarrationText(project, i),
        voice,
      });
      buffers.push(await context.decodeAudioData(audioBytes.slice(0)));
      onProgress?.((i + 1) / project.steps.length);
    }
  } catch (err) {
    await context.close().catch(() => {});
    throw err;
  }

  return { context, buffers };
}

function makeNarrationText(project: Project, index: number): string {
  const step = project.steps[index];
  const description = step.description.trim();
  const fallback = `${index + 1}단계. ${ACTION_LABELS[step.action]}합니다.`;
  const text = description || fallback;
  return text.length > 600 ? text.slice(0, 600) : text;
}

async function requestGeminiNarrationAudio(
  apiKey: string,
  payload: { text: string; voice: string },
): Promise<ArrayBuffer> {
  const response = await fetch(GEMINI_TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      model: GEMINI_TTS_MODEL,
      input: `한국어로 자연스럽게 읽어줘: ${payload.text}`,
      response_format: {
        type: 'audio',
      },
      generation_config: {
        speech_config: [
          {
            voice: payload.voice,
          },
        ],
      },
    }),
  });
  const raw = await response.text();
  let data: GeminiTtsResponse;
  try {
    data = JSON.parse(raw) as GeminiTtsResponse;
  } catch {
    throw new Error(`Gemini TTS 응답을 해석할 수 없습니다: ${raw.slice(0, 120)}`);
  }
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `Gemini TTS 요청 실패 (${response.status})`);
  }

  const pcmBase64 = data.output_audio?.data;
  if (!pcmBase64) throw new Error('Gemini TTS 응답에 output_audio.data가 없습니다.');
  return pcmBase64ToWavArrayBuffer(pcmBase64);
}

type GeminiTtsResponse = {
  output_audio?: {
    data?: string;
  };
  error?: {
    message?: string;
  };
};

function pcmBase64ToWavArrayBuffer(value: string): ArrayBuffer {
  const pcm = base64ToBytes(value);
  const header = makeWavHeader(pcm.byteLength);
  const wav = new Uint8Array(header.byteLength + pcm.byteLength);
  wav.set(header, 0);
  wav.set(pcm, header.byteLength);
  return wav.buffer;
}

function base64ToBytes(value: string): Uint8Array {
  const base64 = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function makeWavHeader(dataLength: number): Uint8Array {
  const byteRate = (GEMINI_PCM_SAMPLE_RATE * GEMINI_PCM_CHANNELS * GEMINI_PCM_BITS_PER_SAMPLE) / 8;
  const blockAlign = (GEMINI_PCM_CHANNELS * GEMINI_PCM_BITS_PER_SAMPLE) / 8;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, GEMINI_PCM_CHANNELS, true);
  view.setUint32(24, GEMINI_PCM_SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, GEMINI_PCM_BITS_PER_SAMPLE, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function makeStepOffsets(stepDurations: readonly number[]): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const duration of stepDurations) {
    offsets.push(cursor);
    cursor += duration;
  }
  return offsets;
}

function findStepIndex(
  time: number,
  stepOffsets: readonly number[],
  stepDurations: readonly number[],
): number {
  for (let i = 0; i < stepOffsets.length; i++) {
    if (time < stepOffsets[i] + stepDurations[i]) return i;
  }
  return stepOffsets.length;
}

function makeTimelineAudio(
  context: AudioContext,
  buffers: readonly AudioBuffer[],
  stepOffsets: readonly number[],
  total: number,
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const channels = Math.max(1, ...buffers.map((buffer) => buffer.numberOfChannels));
  const length = Math.ceil(total * sampleRate);
  const timeline = context.createBuffer(channels, length, sampleRate);

  buffers.forEach((buffer, index) => {
    const start = Math.floor((TITLE_SEC + stepOffsets[index]) * sampleRate);
    const copyLength = Math.min(buffer.length, length - start);
    if (copyLength <= 0) return;
    for (let ch = 0; ch < channels; ch++) {
      const source = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
      timeline.getChannelData(ch).set(source.subarray(0, copyLength), start);
    }
  });

  return timeline;
}
