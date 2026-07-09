/**
 * ManualMaker Qwen TTS proxy for Google Apps Script.
 *
 * Setup:
 * 1. Apps Script > Project Settings > Script properties:
 *    DASHSCOPE_API_KEY = sk-...
 * 2. Deploy > New deployment > Web app:
 *    Execute as: Me
 *    Who has access: Anyone with the link
 * 3. Paste the Web app URL into ManualMaker's video export dialog.
 */

const DASHSCOPE_TTS_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const apiKey = props.getProperty('DASHSCOPE_API_KEY');
    if (!apiKey) throw new Error('DASHSCOPE_API_KEY script property is missing.');

    const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    const text = String(body.text || '').trim();
    if (!text) throw new Error('text is required.');

    const qwenResponse = UrlFetchApp.fetch(DASHSCOPE_TTS_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + apiKey,
      },
      payload: JSON.stringify({
        model: body.model || 'qwen3-tts-flash',
        input: {
          text,
          voice: body.voice || 'Cherry',
          language_type: body.language_type || 'Korean',
        },
      }),
      muteHttpExceptions: true,
    });

    const qwenStatus = qwenResponse.getResponseCode();
    const qwenJson = JSON.parse(qwenResponse.getContentText());
    if (qwenStatus < 200 || qwenStatus >= 300 || qwenJson.status_code !== 200) {
      throw new Error(qwenJson.message || qwenJson.code || 'Qwen TTS request failed.');
    }

    const audioUrl = qwenJson.output && qwenJson.output.audio && qwenJson.output.audio.url;
    if (!audioUrl) throw new Error('Qwen response did not include output.audio.url.');

    const audioResponse = UrlFetchApp.fetch(audioUrl, { muteHttpExceptions: true });
    const audioStatus = audioResponse.getResponseCode();
    if (audioStatus < 200 || audioStatus >= 300) {
      throw new Error('Failed to download generated audio: ' + audioStatus);
    }

    const audioBlob = audioResponse.getBlob();
    return jsonOutput({
      ok: true,
      mimeType: audioBlob.getContentType() || 'audio/wav',
      audioBase64: Utilities.base64Encode(audioBlob.getBytes()),
      requestId: qwenJson.request_id,
    });
  } catch (err) {
    return jsonOutput({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function doGet() {
  return jsonOutput({ ok: true, service: 'ManualMaker Qwen TTS proxy' });
}

function jsonOutput(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
