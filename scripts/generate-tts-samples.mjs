import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
const GEMINI_TTS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const OUT_DIR = path.resolve('public/tts-samples');
const SAMPLE_TEXT = '매뉴얼메이커';

const VOICES = [
  'Kore',
  'Puck',
  'Aoede',
  'Leda',
  'Callirrhoe',
  'Charon',
  'Achird',
  'Laomedeia',
  'Vindemiatrix',
  'Sulafat',
];

const apiKey = await readApiKey();
if (!apiKey) {
  throw new Error('Gemini API key가 필요합니다.');
}

await mkdir(OUT_DIR, { recursive: true });

for (const voice of VOICES) {
  const audio = await requestGeminiSpeech(apiKey, voice);
  const outPath = path.join(OUT_DIR, `${voice}.wav`);
  await writeFile(outPath, audio);
  console.log(`saved ${outPath}`);
}

async function readApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  return readHiddenLine('Gemini API key: ');
}

function readHiddenLine(prompt) {
  return new Promise((resolve) => {
    let value = '';
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function onData(char) {
      if (char === '\r' || char === '\n') {
        cleanup();
        process.stdout.write('\n');
        resolve(value.trim());
        return;
      }
      if (char === '\u0003') {
        cleanup();
        process.stdout.write('\n');
        process.exit(130);
      }
      if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    }

    function cleanup() {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    process.stdin.on('data', onData);
  });
}

async function requestGeminiSpeech(key, voice) {
  const response = await fetch(GEMINI_TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify({
      model: GEMINI_TTS_MODEL,
      input: `한국어로 자연스럽게 읽어줘: ${SAMPLE_TEXT}`,
      response_format: {
        type: 'audio',
        sample_rate: SAMPLE_RATE,
      },
      store: false,
      generation_config: {
        speech_config: [
          {
            voice,
          },
        ],
      },
    }),
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
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
  const bytes = base64ToBytes(audio.data);
  if (audio.mime_type?.includes('wav')) return bytes;
  return pcmBytesToWav(bytes);
}

function extractGeminiAudio(data) {
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

function summarizeGeminiResponse(data) {
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

function base64ToBytes(value) {
  const base64 = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  return Buffer.from(base64, 'base64');
}

function pcmBytesToWav(pcm) {
  const header = makeWavHeader(pcm.byteLength);
  return Buffer.concat([header, pcm]);
}

function makeWavHeader(dataLength) {
  const byteRate = (SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8;
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}
