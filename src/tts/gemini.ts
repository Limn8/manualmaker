const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
const GEMINI_TTS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_PCM_SAMPLE_RATE = 24000;
const GEMINI_PCM_CHANNELS = 1;
const GEMINI_PCM_BITS_PER_SAMPLE = 16;

export async function requestGeminiSpeech(
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
        sample_rate: GEMINI_PCM_SAMPLE_RATE,
      },
      store: false,
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

  const audio = extractGeminiAudio(data);
  if (!audio?.data) {
    throw new Error(`Gemini TTS 응답에 오디오 데이터가 없습니다: ${summarizeGeminiResponse(data)}`);
  }
  return audioBase64ToArrayBuffer(audio.data, audio.mime_type);
}

type GeminiTtsResponse = {
  output_audio?: {
    data?: string;
    mime_type?: string;
  };
  steps?: Array<{
    type?: string;
    error?: {
      message?: string;
    };
    content?: Array<{
      type?: string;
      data?: string;
      mime_type?: string;
    }>;
  }>;
  status?: string;
  error?: {
    message?: string;
  };
};

function extractGeminiAudio(data: GeminiTtsResponse): { data: string; mime_type?: string } | null {
  if (data.output_audio?.data) {
    return { data: data.output_audio.data, mime_type: data.output_audio.mime_type };
  }
  for (const step of data.steps ?? []) {
    for (const content of step.content ?? []) {
      if (content.type === 'audio' && content.data) {
        return { data: content.data, mime_type: content.mime_type };
      }
    }
  }
  return null;
}

function summarizeGeminiResponse(data: GeminiTtsResponse): string {
  const stepError = data.steps?.find((step) => step.error?.message)?.error?.message;
  const contentTypes = data.steps
    ?.flatMap((step) => step.content ?? [])
    .map((content) => content.type)
    .filter(Boolean)
    .join(', ');
  return [
    data.status ? `status=${data.status}` : '',
    stepError ? `stepError=${stepError}` : '',
    contentTypes ? `contentTypes=${contentTypes}` : '',
  ]
    .filter(Boolean)
    .join(' / ') || 'empty response';
}

function audioBase64ToArrayBuffer(value: string, mimeType?: string): ArrayBuffer {
  const bytes = base64ToBytes(value);
  if (mimeType?.includes('wav') || mimeType?.includes('mpeg') || mimeType?.includes('mp3')) {
    return copyToArrayBuffer(bytes);
  }
  return pcmBytesToWavArrayBuffer(bytes);
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function pcmBytesToWavArrayBuffer(pcm: Uint8Array): ArrayBuffer {
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
