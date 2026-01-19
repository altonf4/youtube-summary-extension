/**
 * ElevenLabs Text-to-Speech integration
 * Handles audio generation and voice listing
 */

const https = require('https');

const ELEVENLABS_API_BASE = 'api.elevenlabs.io';

/**
 * Generate speech from text using ElevenLabs API
 * @param {string} text - Text to convert to speech
 * @param {string} voiceId - ElevenLabs voice ID
 * @param {string} apiKey - ElevenLabs API key
 * @returns {Promise<{success: boolean, audio?: string, error?: string}>}
 */
async function generateSpeech(text, voiceId, apiKey) {
  if (!text || !voiceId || !apiKey) {
    return { success: false, error: 'Missing required parameters' };
  }

  // Truncate text if too long (ElevenLabs limit ~5000 chars)
  const maxChars = 5000;
  const truncatedText = text.length > maxChars
    ? text.substring(0, maxChars) + '...'
    : text;

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      text: truncatedText,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    });

    const options = {
      hostname: ELEVENLABS_API_BASE,
      port: 443,
      path: `/v1/text-to-speech/${voiceId}/stream`,
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          const audioBuffer = Buffer.concat(chunks);
          const base64Audio = audioBuffer.toString('base64');
          resolve({ success: true, audio: base64Audio });
        } else {
          let errorMsg = `ElevenLabs API error: ${res.statusCode}`;
          try {
            const body = Buffer.concat(chunks).toString('utf8');
            const json = JSON.parse(body);
            if (json.detail) {
              errorMsg = json.detail.message || json.detail;
            }
          } catch (e) {
            // Ignore parse errors
          }
          resolve({ success: false, error: errorMsg });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ success: false, error: `Network error: ${error.message}` });
    });

    req.setTimeout(120000, () => {
      req.destroy();
      resolve({ success: false, error: 'Request timed out (2 minutes)' });
    });

    req.write(postData);
    req.end();
  });
}

/**
 * List available voices for the account
 * @param {string} apiKey - ElevenLabs API key
 * @returns {Promise<{success: boolean, voices?: Array<{id: string, name: string}>, error?: string}>}
 */
async function listVoices(apiKey) {
  if (!apiKey) {
    return { success: false, error: 'API key is required' };
  }

  return new Promise((resolve) => {
    const options = {
      hostname: ELEVENLABS_API_BASE,
      port: 443,
      path: '/v1/voices',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'xi-api-key': apiKey
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            const voices = (json.voices || []).map(v => ({
              id: v.voice_id,
              name: v.name,
              category: v.category || 'custom'
            }));
            resolve({ success: true, voices });
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse voice list' });
          }
        } else if (res.statusCode === 401) {
          resolve({ success: false, error: 'Invalid API key' });
        } else {
          resolve({ success: false, error: `API error: ${res.statusCode}` });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ success: false, error: `Network error: ${error.message}` });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ success: false, error: 'Request timed out' });
    });

    req.end();
  });
}

module.exports = {
  generateSpeech,
  listVoices
};
