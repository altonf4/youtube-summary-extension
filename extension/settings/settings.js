// Default analysis instructions (user-customizable part)
const DEFAULT_INSTRUCTIONS = `Analyze this YouTube video and extract the most valuable insights.

Focus on:
- Main arguments and conclusions
- Actionable advice and recommendations
- Interesting facts or statistics mentioned
- Key concepts explained

Make the summary engaging and the learnings practical.`;

// DOM Elements
const promptTextarea = document.getElementById('prompt-template');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-prompt-btn');
const saveStatus = document.getElementById('save-status');
const remindersCheckedCheckbox = document.getElementById('reminders-checked-default');

// Audio settings elements
const apiKeyInput = document.getElementById('elevenlabs-api-key');
const toggleApiKeyBtn = document.getElementById('toggle-api-key');
const voiceSelect = document.getElementById('elevenlabs-voice');
const voiceStatus = document.getElementById('voice-status');
const audioIncludeSummary = document.getElementById('audio-include-summary');
const audioIncludeLearnings = document.getElementById('audio-include-learnings');
const audioIncludeActions = document.getElementById('audio-include-actions');

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
    // Default to true (checked) if not set
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

// Reset to default
function resetPrompt() {
  if (confirm('Reset to default instructions?')) {
    promptTextarea.value = DEFAULT_INSTRUCTIONS;
    saveSettings();
  }
}

// Handle example button clicks
function setupExampleButtons() {
  const exampleBtns = document.querySelectorAll('.example-btn');
  exampleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      promptTextarea.value = prompt;
      // Highlight the textarea briefly
      promptTextarea.style.borderColor = '#667eea';
      promptTextarea.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.2)';
      setTimeout(() => {
        promptTextarea.style.borderColor = '';
        promptTextarea.style.boxShadow = '';
      }, 1000);
    });
  });
}

// Event listeners
saveBtn.addEventListener('click', saveSettings);
resetBtn.addEventListener('click', resetPrompt);

// Keyboard shortcut to save (Ctrl/Cmd + S)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveSettings();
  }
});

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

// Initialize
loadSettings();
setupExampleButtons();
setupAudioSettings();
