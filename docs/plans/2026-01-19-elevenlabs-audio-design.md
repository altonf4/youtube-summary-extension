# ElevenLabs Audio Narration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add on-demand audio narration of summaries using ElevenLabs Text-to-Speech API.

**Architecture:** Speaker button in summary header triggers audio generation via native host → ElevenLabs API. Audio cached in memory, played via HTML5 Audio. Settings page stores API key, voice selection, and content preferences.

**Tech Stack:** ElevenLabs TTS API, Chrome Extension Storage API, HTML5 Audio, Node.js native host

---

## Task 1: Create ElevenLabs Module in Native Host

**Files:**
- Create: `native-host/elevenlabs.js`

**Step 1: Create the ElevenLabs module**

```javascript
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
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    });

    const options = {
      hostname: ELEVENLABS_API_BASE,
      port: 443,
      path: `/v1/text-to-speech/${voiceId}`,
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

    req.setTimeout(60000, () => {
      req.destroy();
      resolve({ success: false, error: 'Request timed out' });
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
```

**Step 2: Verify file created**

Run: `ls -la native-host/elevenlabs.js`
Expected: File exists with correct permissions

**Step 3: Commit**

```bash
git add native-host/elevenlabs.js
git commit -m "feat: add ElevenLabs TTS module for audio generation"
```

---

## Task 2: Add ElevenLabs Handlers to Native Host

**Files:**
- Modify: `native-host/host.js:10-12` (add require)
- Modify: `native-host/host.js:68-90` (add switch cases)

**Step 1: Add the require statement after line 13**

Add after the existing requires (line 13):

```javascript
const elevenlabs = require('./elevenlabs');
```

**Step 2: Add the handler cases in the switch statement (after line 83)**

Add before the `default:` case:

```javascript
      case 'generateAudio':
        response = await handleGenerateAudio(message);
        break;

      case 'listVoices':
        response = await handleListVoices(message);
        break;
```

**Step 3: Add handler functions before `sendResponse` function (around line 290)**

```javascript
// Handle generate audio action
async function handleGenerateAudio(message) {
  const { text, voiceId, apiKey } = message;

  if (!text) {
    return { success: false, error: 'Text is required' };
  }

  if (!voiceId) {
    return { success: false, error: 'Voice ID is required' };
  }

  if (!apiKey) {
    return { success: false, error: 'API key is required' };
  }

  try {
    logDebug(`Generating audio: ${text.length} chars with voice ${voiceId}`);
    const result = await elevenlabs.generateSpeech(text, voiceId, apiKey);

    if (result.success) {
      logDebug('Audio generated successfully');
    } else {
      logDebug(`Audio generation failed: ${result.error}`);
    }

    return result;
  } catch (error) {
    logDebug(`Error generating audio: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Handle list voices action
async function handleListVoices(message) {
  const { apiKey } = message;

  if (!apiKey) {
    return { success: false, error: 'API key is required' };
  }

  try {
    logDebug('Fetching ElevenLabs voices...');
    const result = await elevenlabs.listVoices(apiKey);

    if (result.success) {
      logDebug(`Found ${result.voices.length} voices`);
    } else {
      logDebug(`Failed to fetch voices: ${result.error}`);
    }

    return result;
  } catch (error) {
    logDebug(`Error fetching voices: ${error.message}`);
    return { success: false, error: error.message };
  }
}
```

**Step 4: Commit**

```bash
git add native-host/host.js
git commit -m "feat: add generateAudio and listVoices handlers to native host"
```

---

## Task 3: Add Audio Narration Settings UI

**Files:**
- Modify: `extension/settings/settings.html:75-76` (add new section)

**Step 1: Add new settings section after Action Items section (line 75)**

Insert after the closing `</section>` of Action Items section:

```html
      <!-- Audio Narration Settings -->
      <section class="setting-section">
        <h2>Audio Narration</h2>
        <p class="section-description">
          Generate audio versions of summaries using ElevenLabs Text-to-Speech.
        </p>

        <div class="form-group">
          <label for="elevenlabs-api-key">ElevenLabs API Key</label>
          <div class="password-input-container">
            <input type="password" id="elevenlabs-api-key" placeholder="Enter your API key...">
            <button type="button" id="toggle-api-key" class="toggle-visibility-btn" title="Show/hide API key">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
          <p class="setting-hint">Get your API key from <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank">elevenlabs.io</a></p>
        </div>

        <div class="form-group">
          <label for="elevenlabs-voice">Voice</label>
          <select id="elevenlabs-voice" disabled>
            <option value="">Enter API key to load voices</option>
          </select>
          <p class="setting-hint" id="voice-status"></p>
        </div>

        <div class="form-group">
          <label>Audio Content</label>
          <p class="setting-hint" style="margin-bottom: 12px; margin-left: 0;">Select which sections to include in audio narration:</p>
          <div class="checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" id="audio-include-summary" checked>
              <span>Summary</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="audio-include-learnings" checked>
              <span>Key Learnings</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" id="audio-include-actions">
              <span>Action Items</span>
            </label>
          </div>
        </div>
      </section>
```

**Step 2: Commit**

```bash
git add extension/settings/settings.html
git commit -m "feat: add Audio Narration section to settings HTML"
```

---

## Task 4: Add Audio Settings CSS

**Files:**
- Modify: `extension/settings/settings.css` (add at end)

**Step 1: Add CSS styles at the end of the file**

```css
/* Form Group */
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}

.form-group select,
.form-group input[type="text"],
.form-group input[type="password"] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  color: #374151;
  background: white;
}

.form-group select:focus,
.form-group input:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-group select:disabled {
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

/* Password Input Container */
.password-input-container {
  position: relative;
  display: flex;
  align-items: center;
}

.password-input-container input {
  flex: 1;
  padding-right: 44px;
}

.toggle-visibility-btn {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: #9ca3af;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.toggle-visibility-btn:hover {
  color: #6b7280;
  background: #f3f4f6;
}

/* Checkbox Group */
.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 14px;
  color: #374151;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #667eea;
}

/* Setting hint link */
.setting-hint a {
  color: #667eea;
  text-decoration: none;
}

.setting-hint a:hover {
  text-decoration: underline;
}
```

**Step 2: Commit**

```bash
git add extension/settings/settings.css
git commit -m "style: add CSS for audio narration settings"
```

---

## Task 5: Add Audio Settings JavaScript Logic

**Files:**
- Modify: `extension/settings/settings.js` (add new functionality)

**Step 1: Add DOM element references after line 17**

```javascript
// Audio settings elements
const apiKeyInput = document.getElementById('elevenlabs-api-key');
const toggleApiKeyBtn = document.getElementById('toggle-api-key');
const voiceSelect = document.getElementById('elevenlabs-voice');
const voiceStatus = document.getElementById('voice-status');
const audioIncludeSummary = document.getElementById('audio-include-summary');
const audioIncludeLearnings = document.getElementById('audio-include-learnings');
const audioIncludeActions = document.getElementById('audio-include-actions');
```

**Step 2: Update loadSettings function to load audio settings (modify existing function)**

Replace the `loadSettings` function:

```javascript
// Load settings on page load
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get([
      'analysisInstructions',
      'remindersCheckedByDefault',
      'elevenlabsApiKey',
      'elevenlabsVoiceId',
      'audioIncludeSummary',
      'audioIncludeLearnings',
      'audioIncludeActions'
    ]);

    promptTextarea.value = result.analysisInstructions || DEFAULT_INSTRUCTIONS;
    remindersCheckedCheckbox.checked = result.remindersCheckedByDefault !== false;

    // Audio settings
    if (apiKeyInput) {
      apiKeyInput.value = result.elevenlabsApiKey || '';
      if (result.elevenlabsApiKey) {
        loadVoices(result.elevenlabsApiKey, result.elevenlabsVoiceId);
      }
    }
    if (audioIncludeSummary) audioIncludeSummary.checked = result.audioIncludeSummary !== false;
    if (audioIncludeLearnings) audioIncludeLearnings.checked = result.audioIncludeLearnings !== false;
    if (audioIncludeActions) audioIncludeActions.checked = result.audioIncludeActions === true;

  } catch (error) {
    console.error('Error loading settings:', error);
    promptTextarea.value = DEFAULT_INSTRUCTIONS;
    remindersCheckedCheckbox.checked = true;
  }
}
```

**Step 3: Update saveSettings function to save audio settings**

Replace the `saveSettings` function:

```javascript
// Save settings
async function saveSettings() {
  try {
    await chrome.storage.sync.set({
      analysisInstructions: promptTextarea.value,
      remindersCheckedByDefault: remindersCheckedCheckbox.checked,
      elevenlabsApiKey: apiKeyInput ? apiKeyInput.value : '',
      elevenlabsVoiceId: voiceSelect ? voiceSelect.value : '',
      audioIncludeSummary: audioIncludeSummary ? audioIncludeSummary.checked : true,
      audioIncludeLearnings: audioIncludeLearnings ? audioIncludeLearnings.checked : true,
      audioIncludeActions: audioIncludeActions ? audioIncludeActions.checked : false
    });

    // Show save status
    saveStatus.textContent = 'Settings saved!';
    saveStatus.classList.add('visible');

    setTimeout(() => {
      saveStatus.classList.remove('visible');
    }, 3000);
  } catch (error) {
    console.error('Error saving settings:', error);
    saveStatus.textContent = 'Error saving settings';
    saveStatus.classList.add('visible');
    saveStatus.style.color = '#ef4444';
  }
}
```

**Step 4: Add voice loading and API key toggle functions at end of file**

```javascript
// Load voices from ElevenLabs
async function loadVoices(apiKey, selectedVoiceId = null) {
  if (!voiceSelect || !voiceStatus) return;

  voiceSelect.disabled = true;
  voiceSelect.innerHTML = '<option value="">Loading voices...</option>';
  voiceStatus.textContent = '';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'listVoices',
      apiKey: apiKey
    });

    if (response.success && response.voices) {
      voiceSelect.innerHTML = '';

      // Group voices by category
      const premade = response.voices.filter(v => v.category === 'premade');
      const cloned = response.voices.filter(v => v.category !== 'premade');

      if (premade.length > 0) {
        const group = document.createElement('optgroup');
        group.label = 'Premade Voices';
        premade.forEach(voice => {
          const option = document.createElement('option');
          option.value = voice.id;
          option.textContent = voice.name;
          group.appendChild(option);
        });
        voiceSelect.appendChild(group);
      }

      if (cloned.length > 0) {
        const group = document.createElement('optgroup');
        group.label = 'Your Voices';
        cloned.forEach(voice => {
          const option = document.createElement('option');
          option.value = voice.id;
          option.textContent = voice.name;
          group.appendChild(option);
        });
        voiceSelect.appendChild(group);
      }

      voiceSelect.disabled = false;
      voiceStatus.textContent = `${response.voices.length} voices available`;
      voiceStatus.style.color = '#10b981';

      // Restore selected voice
      if (selectedVoiceId) {
        voiceSelect.value = selectedVoiceId;
      }
    } else {
      voiceSelect.innerHTML = '<option value="">Failed to load voices</option>';
      voiceStatus.textContent = response.error || 'Could not load voices';
      voiceStatus.style.color = '#ef4444';
    }
  } catch (error) {
    console.error('Error loading voices:', error);
    voiceSelect.innerHTML = '<option value="">Error loading voices</option>';
    voiceStatus.textContent = 'Connection error';
    voiceStatus.style.color = '#ef4444';
  }
}

// Setup audio settings event listeners
function setupAudioSettings() {
  if (!apiKeyInput) return;

  // Toggle API key visibility
  if (toggleApiKeyBtn) {
    toggleApiKeyBtn.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      toggleApiKeyBtn.title = isPassword ? 'Hide API key' : 'Show API key';
    });
  }

  // Load voices when API key changes (debounced)
  let apiKeyTimeout = null;
  apiKeyInput.addEventListener('input', () => {
    if (apiKeyTimeout) clearTimeout(apiKeyTimeout);
    apiKeyTimeout = setTimeout(() => {
      const apiKey = apiKeyInput.value.trim();
      if (apiKey.length > 10) {
        loadVoices(apiKey);
      } else {
        voiceSelect.disabled = true;
        voiceSelect.innerHTML = '<option value="">Enter API key to load voices</option>';
        voiceStatus.textContent = '';
      }
    }, 500);
  });
}

// Add to initialization
setupAudioSettings();
```

**Step 5: Commit**

```bash
git add extension/settings/settings.js
git commit -m "feat: add audio settings logic with voice loading"
```

---

## Task 6: Add Speaker Button to Sidebar HTML

**Files:**
- Modify: `extension/sidebar/sidebar.html:147-156` (add audio button)

**Step 1: Update the summary header section**

Replace lines 147-156:

```html
        <div class="summary-content">
          <div class="summary-header">
            <h2>Summary <span class="edit-hint">(click to edit)</span></h2>
            <div class="summary-header-actions">
              <button id="audio-btn" class="audio-btn" title="Generate audio narration" disabled>
                <svg class="audio-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                </svg>
                <svg class="audio-loading hidden" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                </svg>
                <svg class="audio-stop hidden" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="6" y="6" width="12" height="12"></rect>
                </svg>
              </button>
              <button id="toggle-summary-btn" class="toggle-btn expanded" title="Show/hide summary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          </div>
          <div class="audio-player" id="audio-player" style="display: none;">
            <div class="audio-progress-container">
              <div class="audio-progress-bar" id="audio-progress-bar"></div>
            </div>
            <span class="audio-time" id="audio-time">0:00</span>
          </div>
          <div id="summary-text" class="summary-text" contenteditable="true"></div>
        </div>
```

**Step 2: Commit**

```bash
git add extension/sidebar/sidebar.html
git commit -m "feat: add audio button and player to sidebar HTML"
```

---

## Task 7: Add Audio Player CSS

**Files:**
- Modify: `extension/sidebar/styles.css` (add at end, around line 1637)

**Step 1: Add CSS for audio button and player**

```css
/* ============================================
   Audio Button & Player
   ============================================ */
.summary-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.audio-btn {
  background: transparent;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: var(--text-tertiary);
  border-radius: var(--radius-sm);
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.audio-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--accent);
}

.audio-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.audio-btn.loading {
  color: var(--accent);
}

.audio-btn.loading .audio-loading {
  display: block;
  animation: spin 1s linear infinite;
}

.audio-btn.loading .audio-icon,
.audio-btn.loading .audio-stop {
  display: none;
}

.audio-btn.playing {
  color: var(--accent);
  background: var(--accent-light);
}

.audio-btn.playing .audio-stop {
  display: block;
}

.audio-btn.playing .audio-icon,
.audio-btn.playing .audio-loading {
  display: none;
}

.audio-btn .audio-loading,
.audio-btn .audio-stop {
  display: none;
}

.hidden {
  display: none !important;
}

/* Audio Player */
.audio-player {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--accent-light);
  border-bottom: 1px solid var(--border-primary);
}

.audio-progress-container {
  flex: 1;
  height: 4px;
  background: var(--border-primary);
  border-radius: 2px;
  cursor: pointer;
  overflow: hidden;
}

.audio-progress-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  width: 0%;
  transition: width 0.1s linear;
}

.audio-time {
  font-size: 11px;
  color: var(--accent-text);
  font-weight: 500;
  min-width: 35px;
  text-align: right;
}

/* Audio Error State */
.audio-error {
  padding: 8px 16px;
  background: var(--error-light);
  color: var(--error-text);
  font-size: 12px;
  border-bottom: 1px solid var(--border-primary);
}
```

**Step 2: Commit**

```bash
git add extension/sidebar/styles.css
git commit -m "style: add CSS for audio button and player"
```

---

## Task 8: Add Audio Playback Logic to Sidebar

**Files:**
- Modify: `extension/sidebar/sidebar.js` (add audio functionality)

**Step 1: Add state variables after line 12**

```javascript
// Audio state
let audioElement = null;
let cachedAudioData = null;
let isAudioLoading = false;
```

**Step 2: Add audio button initialization in init() function, after line 46**

```javascript
  // Audio button
  const audioBtn = document.getElementById('audio-btn');
  if (audioBtn) {
    audioBtn.addEventListener('click', handleAudioClick);
  }

  // Check audio settings availability
  checkAudioAvailability();
```

**Step 3: Add audio functions before the `init()` call at the end of file**

```javascript
/**
 * Check if audio narration is available (API key configured)
 */
async function checkAudioAvailability() {
  const audioBtn = document.getElementById('audio-btn');
  if (!audioBtn) return;

  try {
    const settings = await chrome.storage.sync.get(['elevenlabsApiKey', 'elevenlabsVoiceId']);
    if (settings.elevenlabsApiKey && settings.elevenlabsVoiceId) {
      audioBtn.disabled = false;
      audioBtn.title = 'Generate audio narration';
    } else {
      audioBtn.disabled = true;
      audioBtn.title = 'Configure ElevenLabs in settings';
    }
  } catch (error) {
    console.error('Error checking audio availability:', error);
    audioBtn.disabled = true;
  }
}

/**
 * Handle audio button click
 */
async function handleAudioClick() {
  const audioBtn = document.getElementById('audio-btn');
  if (!audioBtn) return;

  // If playing, stop
  if (audioElement && !audioElement.paused) {
    stopAudio();
    return;
  }

  // If we have cached audio, play it
  if (cachedAudioData) {
    playAudio(cachedAudioData);
    return;
  }

  // Generate new audio
  await generateAudio();
}

/**
 * Generate audio from summary content
 */
async function generateAudio() {
  const audioBtn = document.getElementById('audio-btn');
  if (!audioBtn || isAudioLoading) return;

  isAudioLoading = true;
  audioBtn.classList.add('loading');
  audioBtn.disabled = true;

  // Remove any previous error
  const existingError = document.querySelector('.audio-error');
  if (existingError) existingError.remove();

  try {
    // Get settings
    const settings = await chrome.storage.sync.get([
      'elevenlabsApiKey',
      'elevenlabsVoiceId',
      'audioIncludeSummary',
      'audioIncludeLearnings',
      'audioIncludeActions'
    ]);

    if (!settings.elevenlabsApiKey || !settings.elevenlabsVoiceId) {
      throw new Error('Please configure ElevenLabs in settings');
    }

    // Build text content based on settings
    const textParts = [];

    if (settings.audioIncludeSummary !== false) {
      const summaryText = document.getElementById('summary-text');
      if (summaryText && summaryText.innerText.trim()) {
        textParts.push(summaryText.innerText.trim());
      }
    }

    if (settings.audioIncludeLearnings !== false) {
      const learnings = getEditedLearnings();
      if (learnings.length > 0) {
        textParts.push('Key Learnings:');
        learnings.forEach((learning, i) => {
          textParts.push(`${i + 1}. ${learning}`);
        });
      }
    }

    if (settings.audioIncludeActions === true) {
      const actions = getSelectedActionItems();
      if (actions.length > 0) {
        textParts.push('Action Items:');
        actions.forEach((action, i) => {
          textParts.push(`${i + 1}. ${action.text}`);
        });
      }
    }

    const text = textParts.join('\n\n');

    if (!text) {
      throw new Error('No content to narrate');
    }

    // Call native host
    const response = await sendNativeMessage({
      action: 'generateAudio',
      text: text,
      voiceId: settings.elevenlabsVoiceId,
      apiKey: settings.elevenlabsApiKey
    });

    if (response.success && response.audio) {
      cachedAudioData = response.audio;
      playAudio(response.audio);
    } else {
      throw new Error(response.error || 'Failed to generate audio');
    }

  } catch (error) {
    console.error('Error generating audio:', error);
    showAudioError(error.message);
  } finally {
    isAudioLoading = false;
    audioBtn.classList.remove('loading');
    audioBtn.disabled = false;
  }
}

/**
 * Play audio from base64 data
 * @param {string} base64Audio - Base64 encoded MP3
 */
function playAudio(base64Audio) {
  const audioBtn = document.getElementById('audio-btn');
  const audioPlayer = document.getElementById('audio-player');
  const progressBar = document.getElementById('audio-progress-bar');
  const audioTime = document.getElementById('audio-time');

  // Stop any existing audio
  if (audioElement) {
    audioElement.pause();
    audioElement = null;
  }

  // Create audio element
  audioElement = new Audio(`data:audio/mpeg;base64,${base64Audio}`);

  // Show player
  if (audioPlayer) audioPlayer.style.display = 'flex';
  if (audioBtn) audioBtn.classList.add('playing');

  // Update progress
  audioElement.addEventListener('timeupdate', () => {
    if (audioElement.duration) {
      const progress = (audioElement.currentTime / audioElement.duration) * 100;
      if (progressBar) progressBar.style.width = `${progress}%`;
      if (audioTime) audioTime.textContent = formatTime(audioElement.currentTime);
    }
  });

  // Handle end
  audioElement.addEventListener('ended', () => {
    stopAudio();
  });

  // Handle errors
  audioElement.addEventListener('error', (e) => {
    console.error('Audio playback error:', e);
    stopAudio();
    showAudioError('Playback error');
  });

  // Click on progress bar to seek
  const progressContainer = document.querySelector('.audio-progress-container');
  if (progressContainer) {
    progressContainer.addEventListener('click', (e) => {
      if (!audioElement || !audioElement.duration) return;
      const rect = progressContainer.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      audioElement.currentTime = percent * audioElement.duration;
    });
  }

  // Play
  audioElement.play().catch(error => {
    console.error('Failed to play audio:', error);
    stopAudio();
    showAudioError('Could not play audio');
  });
}

/**
 * Stop audio playback
 */
function stopAudio() {
  const audioBtn = document.getElementById('audio-btn');
  const audioPlayer = document.getElementById('audio-player');
  const progressBar = document.getElementById('audio-progress-bar');

  if (audioElement) {
    audioElement.pause();
    audioElement = null;
  }

  if (audioBtn) audioBtn.classList.remove('playing');
  if (audioPlayer) audioPlayer.style.display = 'none';
  if (progressBar) progressBar.style.width = '0%';
}

/**
 * Format seconds to mm:ss
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Show audio error message
 * @param {string} message
 */
function showAudioError(message) {
  // Remove existing error
  const existing = document.querySelector('.audio-error');
  if (existing) existing.remove();

  // Create error element
  const errorDiv = document.createElement('div');
  errorDiv.className = 'audio-error';
  errorDiv.textContent = message;

  // Insert after summary header
  const summaryContent = document.querySelector('.summary-content');
  const summaryHeader = document.querySelector('.summary-header');
  if (summaryContent && summaryHeader) {
    summaryHeader.insertAdjacentElement('afterend', errorDiv);
  }

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (errorDiv.parentNode) errorDiv.remove();
  }, 5000);
}

/**
 * Clear cached audio when summary changes
 */
function clearCachedAudio() {
  cachedAudioData = null;
  stopAudio();
}
```

**Step 4: Add call to clearCachedAudio in handleNewSummary function**

Find the `handleNewSummary` function and add `clearCachedAudio();` at the start:

```javascript
// Handle new summary
function handleNewSummary() {
  clearCachedAudio();
  currentSummary = null;
  // ... rest of function
}
```

**Step 5: Commit**

```bash
git add extension/sidebar/sidebar.js
git commit -m "feat: add audio generation and playback to sidebar"
```

---

## Task 9: Update FEATURES.md

**Files:**
- Modify: `FEATURES.md`

**Step 1: Add feature documentation**

Add a new section to FEATURES.md:

```markdown
## Audio Narration (ElevenLabs TTS)

**User Request:** "Add a feature where there's a playable audio version of the summary generated by ElevenLabs. When the summary is generated, on top of the summary there's a button to generate the audio version with ElevenLabs and immediately start playing it. It should only call ElevenLabs to generate it when I click the button, to avoid wasted ElevenLabs credits."

**Implementation:**
- Speaker button inline with Summary header
- Generates audio on-demand (not automatically) to save API credits
- Configurable in settings:
  - ElevenLabs API key (stored securely)
  - Voice selection (dropdown populated from API)
  - Content to include: Summary, Key Learnings, Action Items (checkboxes)
- Audio player with progress bar and time display
- Audio cached per session (cleared on new summary)

**Files Changed:**
- `native-host/elevenlabs.js` - New ElevenLabs API module
- `native-host/host.js` - Added generateAudio and listVoices handlers
- `extension/settings/settings.html` - Audio Narration settings section
- `extension/settings/settings.js` - Voice loading and settings logic
- `extension/settings/settings.css` - Settings styling
- `extension/sidebar/sidebar.html` - Audio button and player UI
- `extension/sidebar/sidebar.js` - Audio generation and playback
- `extension/sidebar/styles.css` - Audio player styling
```

**Step 2: Commit**

```bash
git add FEATURES.md
git commit -m "docs: add Audio Narration feature to FEATURES.md"
```

---

## Task 10: Final Testing & Push

**Step 1: Test the extension manually**

- [ ] Load extension in Chrome (chrome://extensions → Load unpacked)
- [ ] Open settings page and verify Audio Narration section appears
- [ ] Enter ElevenLabs API key and verify voices load
- [ ] Select a voice and save settings
- [ ] Open YouTube video and generate summary
- [ ] Verify speaker button is enabled
- [ ] Click speaker button and verify audio generates
- [ ] Verify audio plays with progress bar
- [ ] Click stop button to verify playback stops
- [ ] Click again to replay cached audio
- [ ] Generate new summary and verify cache clears

**Step 2: Push all commits**

```bash
git push origin main
```

---

## Summary of Files Changed

| File | Action | Description |
|------|--------|-------------|
| `native-host/elevenlabs.js` | Create | ElevenLabs API integration |
| `native-host/host.js` | Modify | Add generateAudio/listVoices handlers |
| `extension/settings/settings.html` | Modify | Add Audio Narration section |
| `extension/settings/settings.js` | Modify | Add voice loading and settings |
| `extension/settings/settings.css` | Modify | Add form group and checkbox styles |
| `extension/sidebar/sidebar.html` | Modify | Add audio button and player |
| `extension/sidebar/sidebar.js` | Modify | Add audio generation/playback |
| `extension/sidebar/styles.css` | Modify | Add audio button/player styles |
| `FEATURES.md` | Modify | Document new feature |
