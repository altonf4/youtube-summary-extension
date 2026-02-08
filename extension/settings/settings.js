/**
 * Settings Page - Template-based configuration
 * Manages per-content-type output templates with customizable sections
 */

// ============================================================
// Default Templates
// ============================================================

const DEFAULT_TEMPLATES = {
  youtube_video: {
    name: 'YouTube Video',
    instructions: `Analyze this YouTube video and extract the most valuable insights.

Focus on:
- Main arguments and conclusions
- Actionable advice and recommendations
- Interesting facts or statistics mentioned
- Key concepts explained

Make the summary engaging and the learnings practical.`,
    sections: [
      { id: 'summary', label: 'Summary', enabled: true, format: 'paragraphs' },
      { id: 'key_learnings', label: 'Key Learnings', enabled: true, format: 'bullets' },
      { id: 'action_items', label: 'Action Items', enabled: true, format: 'bullets' },
      { id: 'creator_additions', label: 'Creator Additions', enabled: true, format: 'bullets' },
      { id: 'relevant_links', label: 'Relevant Links', enabled: true, format: 'bullets' }
    ]
  },
  article: {
    name: 'Article',
    instructions: `Summarize this article and extract the most important insights.

Focus on:
- The main thesis and arguments
- Key evidence and supporting points
- Practical takeaways
- Any notable quotes or data

Keep the summary concise but comprehensive.`,
    sections: [
      { id: 'summary', label: 'Summary', enabled: true, format: 'paragraphs' },
      { id: 'key_learnings', label: 'Key Points', enabled: true, format: 'bullets' },
      { id: 'action_items', label: 'Action Items', enabled: true, format: 'bullets' },
      { id: 'relevant_links', label: 'Relevant Links', enabled: true, format: 'bullets' }
    ]
  },
  webpage: {
    name: 'Web Page',
    instructions: `Summarize this web page content and extract useful information.

Focus on:
- Main purpose and content of the page
- Key information presented
- Useful takeaways

Be concise and focus on the most valuable content.`,
    sections: [
      { id: 'summary', label: 'Summary', enabled: true, format: 'paragraphs' },
      { id: 'key_learnings', label: 'Key Points', enabled: true, format: 'bullets' },
      { id: 'action_items', label: 'Action Items', enabled: true, format: 'bullets' },
      { id: 'relevant_links', label: 'Relevant Links', enabled: true, format: 'bullets' }
    ]
  },
  selected_text: {
    name: 'Selected Text',
    instructions: `Analyze and summarize the selected text, extracting key insights.

Focus on:
- Main ideas and arguments
- Important details
- Practical implications`,
    sections: [
      { id: 'summary', label: 'Summary', enabled: true, format: 'paragraphs' },
      { id: 'key_learnings', label: 'Key Insights', enabled: true, format: 'bullets' },
      { id: 'action_items', label: 'Action Items', enabled: true, format: 'bullets' }
    ]
  },
  video_with_captions: {
    name: 'Video with Captions',
    instructions: `Analyze this video transcript and extract the most valuable insights.

Focus on:
- Main topics covered
- Key concepts explained
- Actionable advice
- Important details and examples

Make the summary clear and the learnings practical.`,
    sections: [
      { id: 'summary', label: 'Summary', enabled: true, format: 'paragraphs' },
      { id: 'key_learnings', label: 'Key Learnings', enabled: true, format: 'bullets' },
      { id: 'action_items', label: 'Action Items', enabled: true, format: 'bullets' },
      { id: 'relevant_links', label: 'Relevant Links', enabled: true, format: 'bullets' }
    ]
  }
};

/**
 * Presets per content type
 */
const PRESETS = {
  youtube_video: [
    { name: 'Default', instructions: DEFAULT_TEMPLATES.youtube_video.instructions },
    { name: 'Educational', instructions: 'Focus on educational content: key concepts, definitions, examples, and learning progression. Extract study-worthy insights.' },
    { name: 'Tutorial', instructions: 'Focus on step-by-step instructions, tools/technologies mentioned, code examples, and practical implementation details.' },
    { name: 'Business', instructions: 'Focus on business strategies, market insights, growth tactics, ROI data, and actionable business recommendations.' }
  ],
  article: [
    { name: 'Default', instructions: DEFAULT_TEMPLATES.article.instructions },
    { name: 'Research Paper', instructions: 'Focus on methodology, findings, statistical significance, limitations, and implications for future research.' },
    { name: 'News', instructions: 'Focus on the 5 Ws (who, what, when, where, why), key facts, quotes from sources, and broader implications.' },
    { name: 'Technical', instructions: 'Focus on technical concepts, architecture decisions, implementation details, performance considerations, and best practices.' }
  ],
  webpage: [
    { name: 'Default', instructions: DEFAULT_TEMPLATES.webpage.instructions },
    { name: 'Documentation', instructions: 'Focus on API methods, configuration options, usage examples, and common patterns.' },
    { name: 'Product Page', instructions: 'Focus on features, pricing, comparisons with alternatives, pros and cons.' }
  ],
  selected_text: [
    { name: 'Explain', instructions: 'Explain the selected text in simple terms. Break down complex concepts and provide context.' },
    { name: 'Analyze', instructions: 'Provide a critical analysis of the selected text. Examine arguments, evidence, and logical consistency.' },
    { name: 'Simplify', instructions: 'Rewrite and simplify the selected text. Make it accessible to a general audience while preserving key meaning.' }
  ],
  video_with_captions: [
    { name: 'Default', instructions: DEFAULT_TEMPLATES.video_with_captions.instructions },
    { name: 'Lecture', instructions: 'Focus on the academic content: key theories, evidence, and arguments presented.' },
    { name: 'Workshop', instructions: 'Focus on practical exercises, demonstrations, and hands-on techniques shown.' }
  ]
};

// ============================================================
// State
// ============================================================

let currentTemplates = {};
let currentType = 'youtube_video';

// ============================================================
// DOM Elements
// ============================================================

const promptTextarea = document.getElementById('prompt-template');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-template-btn');
const saveStatus = document.getElementById('save-status');
const remindersCheckedCheckbox = document.getElementById('reminders-checked-default');
const templateTypeSelect = document.getElementById('template-type-select');
const sectionsListEl = document.getElementById('template-sections-list');
const presetsListEl = document.getElementById('template-presets-list');
const formatPreviewEl = document.getElementById('format-preview-content');

// Claude API settings elements
const anthropicApiKeyInput = document.getElementById('anthropic-api-key');
const toggleAnthropicKeyBtn = document.getElementById('toggle-anthropic-key');
const claudeModelSelect = document.getElementById('claude-model');
const authStatusDot = document.getElementById('auth-status-dot');
const authStatusText = document.getElementById('auth-status-text');

// Audio settings elements
const apiKeyInput = document.getElementById('elevenlabs-api-key');
const toggleApiKeyBtn = document.getElementById('toggle-api-key');
const voiceSelect = document.getElementById('elevenlabs-voice');
const voiceStatus = document.getElementById('voice-status');
const audioIncludeSummary = document.getElementById('audio-include-summary');
const audioIncludeLearnings = document.getElementById('audio-include-learnings');
const audioIncludeActions = document.getElementById('audio-include-actions');

// ============================================================
// Template Management
// ============================================================

/**
 * Get deep copy of default templates
 * @returns {Object} - Fresh copy of defaults
 */
function getDefaultTemplates() {
  return JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
}

/**
 * Load templates from storage, migrating from old format if needed
 * @returns {Promise<Object>} - Templates object
 */
async function loadTemplates() {
  const result = await chrome.storage.sync.get(['templates', 'analysisInstructions']);

  if (result.templates) {
    // Merge with defaults to pick up any new content types or sections
    const merged = getDefaultTemplates();
    for (const [type, template] of Object.entries(result.templates)) {
      if (merged[type]) {
        merged[type].instructions = template.instructions || merged[type].instructions;
        if (template.sections) {
          merged[type].sections = template.sections;
        }
      }
    }
    return merged;
  }

  // Migration: if old analysisInstructions exists, use it for youtube_video
  if (result.analysisInstructions) {
    const templates = getDefaultTemplates();
    templates.youtube_video.instructions = result.analysisInstructions;
    return templates;
  }

  return getDefaultTemplates();
}

/**
 * Save current template state back to textarea before switching
 */
function saveCurrentTemplateToState() {
  if (currentTemplates[currentType]) {
    currentTemplates[currentType].instructions = promptTextarea.value;
    // Sections are already updated in-place via event handlers
  }
}

/**
 * Render the template editor for the selected content type
 */
function renderTemplate() {
  const template = currentTemplates[currentType];
  if (!template) return;

  // Update instructions textarea
  promptTextarea.value = template.instructions;

  // Render sections
  renderSections(template.sections);

  // Render presets
  renderPresets();

  // Update format preview
  updateFormatPreview();
}

/**
 * Render the sections list with checkboxes and editable labels
 * @param {Array} sections - Array of section objects
 */
function renderSections(sections) {
  sectionsListEl.innerHTML = '';

  sections.forEach((section, index) => {
    const item = document.createElement('div');
    item.className = `section-item${section.enabled ? '' : ' disabled'}`;
    item.dataset.index = index;

    item.innerHTML = `
      <span class="drag-handle" title="Drag to reorder">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="8" y1="6" x2="16" y2="6"></line>
          <line x1="8" y1="12" x2="16" y2="12"></line>
          <line x1="8" y1="18" x2="16" y2="18"></line>
        </svg>
      </span>
      <input type="checkbox" class="section-toggle" ${section.enabled ? 'checked' : ''}>
      <input type="text" class="section-label-input" value="${section.label}">
      <select class="section-format">
        <option value="paragraphs" ${section.format === 'paragraphs' ? 'selected' : ''}>Paragraphs</option>
        <option value="bullets" ${section.format === 'bullets' ? 'selected' : ''}>Bullets</option>
      </select>
    `;

    // Toggle handler
    const toggle = item.querySelector('.section-toggle');
    toggle.addEventListener('change', () => {
      section.enabled = toggle.checked;
      item.classList.toggle('disabled', !toggle.checked);
      updateFormatPreview();
    });

    // Label handler
    const labelInput = item.querySelector('.section-label-input');
    labelInput.addEventListener('input', () => {
      section.label = labelInput.value;
      updateFormatPreview();
    });

    // Format handler
    const formatSelect = item.querySelector('.section-format');
    formatSelect.addEventListener('change', () => {
      section.format = formatSelect.value;
      updateFormatPreview();
    });

    sectionsListEl.appendChild(item);
  });

  // Setup drag-and-drop reordering
  setupDragReorder();
}

/**
 * Setup drag and drop for section reordering
 */
function setupDragReorder() {
  let dragItem = null;

  sectionsListEl.querySelectorAll('.section-item').forEach(item => {
    const handle = item.querySelector('.drag-handle');

    handle.addEventListener('mousedown', (e) => {
      dragItem = item;
      item.style.opacity = '0.5';
      e.preventDefault();
    });
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragItem) return;

    const items = [...sectionsListEl.querySelectorAll('.section-item')];
    const afterElement = items.find(child => {
      const box = child.getBoundingClientRect();
      const offset = e.clientY - box.top - box.height / 2;
      return offset < 0 && child !== dragItem;
    });

    if (afterElement) {
      sectionsListEl.insertBefore(dragItem, afterElement);
    } else {
      sectionsListEl.appendChild(dragItem);
    }
  });

  document.addEventListener('mouseup', () => {
    if (!dragItem) return;
    dragItem.style.opacity = '';
    dragItem = null;

    // Update sections order from DOM
    const template = currentTemplates[currentType];
    if (template) {
      const newOrder = [];
      sectionsListEl.querySelectorAll('.section-item').forEach(item => {
        const index = parseInt(item.dataset.index);
        newOrder.push(template.sections[index]);
      });
      template.sections = newOrder;
      // Re-render with updated indices
      renderSections(template.sections);
    }
  });
}

/**
 * Render preset buttons for the current content type
 */
function renderPresets() {
  presetsListEl.innerHTML = '';
  const presets = PRESETS[currentType] || [];

  presets.forEach(preset => {
    const btn = document.createElement('button');
    btn.className = 'example-btn';
    btn.textContent = preset.name;
    btn.addEventListener('click', () => {
      promptTextarea.value = preset.instructions;
      currentTemplates[currentType].instructions = preset.instructions;
      // Brief highlight
      promptTextarea.style.borderColor = '#667eea';
      promptTextarea.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.2)';
      setTimeout(() => {
        promptTextarea.style.borderColor = '';
        promptTextarea.style.boxShadow = '';
      }, 1000);
    });
    presetsListEl.appendChild(btn);
  });
}

/**
 * Update the format preview based on enabled sections
 */
function updateFormatPreview() {
  const template = currentTemplates[currentType];
  if (!template || !formatPreviewEl) return;

  const enabledSections = template.sections.filter(s => s.enabled);
  let preview = '';

  enabledSections.forEach((section, i) => {
    if (i > 0) preview += '\n\n';
    preview += `${section.label.toUpperCase()}:\n`;
    if (section.format === 'paragraphs') {
      preview += `[${section.label} content here]`;
    } else {
      preview += `- [${section.label} item 1]\n- [${section.label} item 2]\n- ...`;
    }
  });

  formatPreviewEl.textContent = preview || '(No sections enabled)';
}

// ============================================================
// Settings Load / Save
// ============================================================

/**
 * Load all settings from storage
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get([
      'remindersCheckedByDefault',
      'anthropicApiKey',
      'claudeModel',
      'elevenlabsApiKey',
      'elevenlabsVoiceId',
      'audioIncludeSummary',
      'audioIncludeLearnings',
      'audioIncludeActions'
    ]);

    // Load templates
    currentTemplates = await loadTemplates();
    renderTemplate();

    // Reminders default
    remindersCheckedCheckbox.checked = result.remindersCheckedByDefault !== false;

    // Claude API settings
    if (anthropicApiKeyInput) {
      anthropicApiKeyInput.value = result.anthropicApiKey || '';
    }
    if (claudeModelSelect) {
      claudeModelSelect.value = result.claudeModel || 'sonnet';
    }

    // Check auth status after loading settings
    checkAuthStatus(result.anthropicApiKey);

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
    currentTemplates = getDefaultTemplates();
    renderTemplate();
    remindersCheckedCheckbox.checked = true;
  }
}

/**
 * Save all settings to storage
 */
async function saveSettings() {
  try {
    // Save current template state from textarea
    saveCurrentTemplateToState();

    // Also save as legacy analysisInstructions for backward compatibility
    const youtubeInstructions = currentTemplates.youtube_video?.instructions || '';

    await chrome.storage.sync.set({
      templates: currentTemplates,
      analysisInstructions: youtubeInstructions,
      remindersCheckedByDefault: remindersCheckedCheckbox.checked,
      anthropicApiKey: anthropicApiKeyInput ? anthropicApiKeyInput.value : '',
      claudeModel: claudeModelSelect ? claudeModelSelect.value : 'sonnet',
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

/**
 * Reset current template to defaults
 */
function resetTemplate() {
  if (confirm(`Reset "${DEFAULT_TEMPLATES[currentType]?.name}" template to defaults?`)) {
    const defaults = getDefaultTemplates();
    currentTemplates[currentType] = defaults[currentType];
    renderTemplate();
    saveSettings();
  }
}

// ============================================================
// Template Type Selector
// ============================================================

if (templateTypeSelect) {
  templateTypeSelect.addEventListener('change', () => {
    // Save current before switching
    saveCurrentTemplateToState();
    currentType = templateTypeSelect.value;
    renderTemplate();
  });
}

// ============================================================
// Event Listeners
// ============================================================

saveBtn.addEventListener('click', saveSettings);
if (resetBtn) resetBtn.addEventListener('click', resetTemplate);

// Keyboard shortcut to save (Ctrl/Cmd + S)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveSettings();
  }
});

// ============================================================
// ElevenLabs Voice Loading
// ============================================================

async function loadVoices(apiKey, selectedVoiceId = null) {
  if (!voiceSelect || !voiceStatus) return;

  voiceSelect.disabled = true;
  voiceSelect.innerHTML = '<option value="">Loading voices...</option>';
  voiceStatus.textContent = '';

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'xi-api-key': apiKey
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const json = await response.json();
    const voices = (json.voices || []).map(v => ({
      id: v.voice_id,
      name: v.name,
      category: v.category || 'custom'
    }));

    if (voices.length > 0) {
      voiceSelect.innerHTML = '';

      const premade = voices.filter(v => v.category === 'premade');
      const cloned = voices.filter(v => v.category !== 'premade');

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
      voiceStatus.textContent = `${voices.length} voices available`;
      voiceStatus.style.color = '#10b981';

      if (selectedVoiceId) {
        voiceSelect.value = selectedVoiceId;
      }
    } else {
      voiceSelect.innerHTML = '<option value="">No voices found</option>';
      voiceStatus.textContent = 'No voices available';
      voiceStatus.style.color = '#ef4444';
    }
  } catch (error) {
    console.error('Error loading voices:', error);
    voiceSelect.innerHTML = '<option value="">Error loading voices</option>';
    voiceStatus.textContent = error.message || 'Connection error';
    voiceStatus.style.color = '#ef4444';
  }
}

// ============================================================
// Audio Settings
// ============================================================

function setupAudioSettings() {
  if (!apiKeyInput) return;

  if (toggleApiKeyBtn) {
    toggleApiKeyBtn.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      toggleApiKeyBtn.title = isPassword ? 'Hide API key' : 'Show API key';
    });
  }

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

// ============================================================
// Anthropic API Settings
// ============================================================

function setupAnthropicSettings() {
  if (!anthropicApiKeyInput) return;

  if (toggleAnthropicKeyBtn) {
    toggleAnthropicKeyBtn.addEventListener('click', () => {
      const isPassword = anthropicApiKeyInput.type === 'password';
      anthropicApiKeyInput.type = isPassword ? 'text' : 'password';
      toggleAnthropicKeyBtn.title = isPassword ? 'Hide API key' : 'Show API key';
    });
  }

  let authCheckTimeout = null;
  anthropicApiKeyInput.addEventListener('input', () => {
    if (authCheckTimeout) clearTimeout(authCheckTimeout);
    authCheckTimeout = setTimeout(() => {
      checkAuthStatus(anthropicApiKeyInput.value.trim());
    }, 500);
  });
}

/**
 * Check auth status by sending checkAuth to native host
 * @param {string} [apiKey] - Optional API key to check
 */
async function checkAuthStatus(apiKey) {
  if (!authStatusDot || !authStatusText) return;

  authStatusDot.className = 'auth-status-dot checking';
  authStatusText.textContent = 'Checking...';

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'checkAuth',
        anthropicApiKey: apiKey || ''
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (response && response.success) {
      const methodLabels = {
        oauth: 'OAuth (Claude Code)',
        api_key: 'API Key',
        cli: 'CLI Fallback',
        none: 'Not configured'
      };

      authStatusDot.className = `auth-status-dot ${response.available ? 'connected' : 'disconnected'}`;
      authStatusText.textContent = methodLabels[response.authMethod] || response.authMethod;
    } else {
      authStatusDot.className = 'auth-status-dot disconnected';
      authStatusText.textContent = 'Not configured';
    }
  } catch (error) {
    authStatusDot.className = 'auth-status-dot disconnected';
    authStatusText.textContent = 'Connection error';
  }
}

// ============================================================
// Initialize
// ============================================================

loadSettings();
setupAnthropicSettings();
setupAudioSettings();
