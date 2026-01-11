// YouTube Summary Sidebar - Main Logic

let currentVideoInfo = null;
let currentSummary = null;
let selectedLearnings = new Set();

// UI Elements
const videoTitle = document.getElementById('video-title');
const generateBtn = document.getElementById('generate-btn');
const saveBtn = document.getElementById('save-btn');
const retryBtn = document.getElementById('retry-btn');
const newSummaryBtn = document.getElementById('new-summary-btn');
const backToEditBtn = document.getElementById('back-to-edit-btn');
const folderInput = document.getElementById('folder-input');

// Sections
const generateSection = document.getElementById('generate-section');
const loadingSection = document.getElementById('loading-section');
const summarySection = document.getElementById('summary-section');
const successSection = document.getElementById('success-section');
const errorSection = document.getElementById('error-section');

// Initialize
function init() {
  // Request video info from content script
  window.parent.postMessage({ type: 'REQUEST_VIDEO_INFO' }, '*');

  // Set up event listeners
  generateBtn.addEventListener('click', handleGenerateSummary);
  saveBtn.addEventListener('click', handleSaveToNotes);
  retryBtn.addEventListener('click', handleRetry);
  newSummaryBtn.addEventListener('click', handleNewSummary);
  backToEditBtn.addEventListener('click', handleBackToEdit);

  // Settings button
  document.getElementById('settings-btn').addEventListener('click', openSettings);

  // Close button
  document.getElementById('close-btn').addEventListener('click', closeSidebar);

  // Load folder suggestions from storage
  loadFolderSuggestions();
}

// Close sidebar (sends message to content script)
function closeSidebar() {
  window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*');
}

// Open settings page
function openSettings() {
  chrome.runtime.openOptionsPage();
}

// Load custom analysis instructions from storage
async function loadAnalysisInstructions() {
  try {
    const result = await chrome.storage.sync.get(['analysisInstructions']);
    return result.analysisInstructions || null;
  } catch (error) {
    console.error('Error loading analysis instructions:', error);
    return null;
  }
}

// Pending transcript request resolver
let pendingTranscriptResolver = null;

// Listen for messages from content script
window.addEventListener('message', (event) => {
  if (event.data.type === 'VIDEO_INFO') {
    currentVideoInfo = event.data;
    videoTitle.textContent = event.data.title;
  }

  if (event.data.type === 'TRANSCRIPT_RESULT') {
    if (pendingTranscriptResolver) {
      pendingTranscriptResolver(event.data);
      pendingTranscriptResolver = null;
    }
  }

  if (event.data.type === 'PROGRESS_UPDATE') {
    updateProgressUI(event.data.progress);
  }
});

// Track completed stages
let completedStages = new Set();

// Update progress UI based on stage
function updateProgressUI(progress) {
  const { stage, message, chars } = progress;

  // Update progress message
  const progressMessage = document.getElementById('progress-message');
  if (progressMessage) {
    progressMessage.textContent = message;
  }

  // Stage order for marking completed
  const stageOrder = ['preparing', 'sending', 'starting', 'waiting', 'streaming', 'parsing', 'complete'];
  const currentIndex = stageOrder.indexOf(stage);

  // Mark previous stages as completed
  stageOrder.forEach((s, index) => {
    if (index < currentIndex) {
      completedStages.add(s);
    }
  });

  // Update all stage elements
  document.querySelectorAll('.progress-stage').forEach(el => {
    const elStage = el.dataset.stage;
    el.classList.remove('active', 'completed');

    if (completedStages.has(elStage)) {
      el.classList.add('completed');
    } else if (elStage === stage || (stage === 'starting' && elStage === 'sending')) {
      el.classList.add('active');
    }
  });

  // Update streaming chars count
  if (stage === 'streaming' && chars) {
    const charsEl = document.getElementById('streaming-chars');
    if (charsEl) {
      charsEl.textContent = `${(chars / 1000).toFixed(1)}k`;
    }
  }
}

// Reset progress UI
function resetProgressUI() {
  completedStages.clear();
  document.querySelectorAll('.progress-stage').forEach(el => {
    el.classList.remove('active', 'completed');
  });
  const charsEl = document.getElementById('streaming-chars');
  if (charsEl) charsEl.textContent = '';
  const progressMessage = document.getElementById('progress-message');
  if (progressMessage) progressMessage.textContent = 'Starting...';
}

// Request transcript from content script (which scrapes YouTube DOM)
function requestTranscript() {
  return new Promise((resolve) => {
    pendingTranscriptResolver = resolve;
    window.parent.postMessage({ type: 'GET_TRANSCRIPT' }, '*');

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingTranscriptResolver) {
        pendingTranscriptResolver({
          success: false,
          error: 'Transcript request timed out. Please ensure the video has captions.'
        });
        pendingTranscriptResolver = null;
      }
    }, 30000);
  });
}

// Show specific section
function showSection(section) {
  [generateSection, loadingSection, summarySection, successSection, errorSection].forEach(s => {
    s.style.display = 'none';
  });
  section.style.display = 'block';
}

// Handle Generate Summary
async function handleGenerateSummary() {
  if (!currentVideoInfo) {
    showError('Video information not available. Please refresh the page.');
    return;
  }

  resetProgressUI();
  showSection(loadingSection);

  try {
    // Step 1: Get transcript from content script (scrapes YouTube DOM)
    const transcriptResult = await requestTranscript();

    if (!transcriptResult.success) {
      throw new Error(transcriptResult.error || 'Failed to extract transcript');
    }

    // Load custom analysis instructions
    const customInstructions = await loadAnalysisInstructions();

    // Step 2: Send transcript to native host for Claude processing
    const response = await sendNativeMessage({
      action: 'generateSummary',
      videoId: currentVideoInfo.videoId,
      title: currentVideoInfo.title,
      transcript: transcriptResult.transcript,
      customInstructions: customInstructions
    });

    if (response.success) {
      currentSummary = response;
      displaySummary(response.summary, response.keyLearnings);
      showSection(summarySection);
    } else {
      throw new Error(response.error || 'Failed to generate summary');
    }
  } catch (error) {
    console.error('Error generating summary:', error);
    showError(error.message || 'Failed to generate summary. Please try again.');
  }
}

// Update loading message
function updateLoadingMessage(message) {
  const loadingText = loadingSection.querySelector('p');
  if (loadingText) {
    loadingText.textContent = message;
  }
}

// Display summary and key learnings
function displaySummary(summary, keyLearnings) {
  // Display summary text
  const summaryText = document.getElementById('summary-text');
  summaryText.textContent = summary;

  // Display key learnings as editable checkboxes
  const learningsList = document.getElementById('key-learnings-list');
  learningsList.innerHTML = '';

  keyLearnings.forEach((learning, index) => {
    const learningItem = document.createElement('div');
    learningItem.className = 'learning-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `learning-${index}`;
    checkbox.checked = true;
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedLearnings.add(index);
      } else {
        selectedLearnings.delete(index);
      }
    });

    // Use textarea for editable learnings
    const textArea = document.createElement('textarea');
    textArea.className = 'learning-text';
    textArea.id = `learning-text-${index}`;
    textArea.value = learning;
    textArea.rows = 1;

    // Auto-resize textarea
    textArea.addEventListener('input', () => {
      textArea.style.height = 'auto';
      textArea.style.height = textArea.scrollHeight + 'px';
    });

    learningItem.appendChild(checkbox);
    learningItem.appendChild(textArea);
    learningsList.appendChild(learningItem);

    // Initially select all learnings
    selectedLearnings.add(index);

    // Trigger initial resize
    setTimeout(() => {
      textArea.style.height = 'auto';
      textArea.style.height = textArea.scrollHeight + 'px';
    }, 0);
  });

  // Clear custom notes editor
  document.getElementById('custom-notes-editor').innerHTML = '';

  // Initialize rich editor toolbar
  initRichEditor();
}

// Initialize rich text editor
function initRichEditor() {
  const toolbar = document.querySelector('.editor-toolbar');
  const editor = document.getElementById('custom-notes-editor');

  toolbar.querySelectorAll('button[data-command]').forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const command = button.getAttribute('data-command');
      document.execCommand(command, false, null);
      editor.focus();
      updateToolbarState();
    });
  });

  // Update toolbar state on selection change
  editor.addEventListener('keyup', updateToolbarState);
  editor.addEventListener('mouseup', updateToolbarState);

  // Handle keyboard shortcuts
  editor.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          document.execCommand('bold', false, null);
          break;
        case 'i':
          e.preventDefault();
          document.execCommand('italic', false, null);
          break;
        case 'u':
          e.preventDefault();
          document.execCommand('underline', false, null);
          break;
      }
      updateToolbarState();
    }
  });
}

// Update toolbar button states based on current selection
function updateToolbarState() {
  const toolbar = document.querySelector('.editor-toolbar');
  toolbar.querySelectorAll('button[data-command]').forEach(button => {
    const command = button.getAttribute('data-command');
    if (['bold', 'italic', 'underline'].includes(command)) {
      if (document.queryCommandState(command)) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    }
  });
}

// Get edited key learnings
function getEditedLearnings() {
  const learnings = [];
  const items = document.querySelectorAll('.learning-item');

  items.forEach((item, index) => {
    const checkbox = item.querySelector('input[type="checkbox"]');
    const textArea = item.querySelector('.learning-text');

    if (checkbox.checked && textArea.value.trim()) {
      learnings.push(textArea.value.trim());
    }
  });

  return learnings;
}

// Get custom notes HTML
function getCustomNotesHtml() {
  const editor = document.getElementById('custom-notes-editor');
  return editor.innerHTML.trim();
}

// Handle Save to Apple Notes
async function handleSaveToNotes() {
  const folderName = folderInput.value.trim() || 'YouTube Summaries';

  if (!currentSummary || !currentVideoInfo) {
    showError('No summary available to save');
    return;
  }

  // Get edited learnings (already filtered by checkbox state)
  const learningsToSave = getEditedLearnings();

  // Get custom notes
  const customNotes = getCustomNotesHtml();

  if (learningsToSave.length === 0 && !customNotes) {
    showError('Please select at least one key learning or add custom notes');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const response = await sendNativeMessage({
      action: 'saveToNotes',
      folder: folderName,
      videoTitle: currentVideoInfo.title,
      videoUrl: currentVideoInfo.url,
      summary: currentSummary.summary,
      keyLearnings: learningsToSave,
      customNotes: customNotes
    });

    if (response.success) {
      // Save folder to suggestions
      saveFolderSuggestion(folderName);

      // Show success
      document.getElementById('success-details').textContent =
        `Saved to "${folderName}" folder in Apple Notes`;
      showSection(successSection);
    } else {
      throw new Error(response.error || 'Failed to save to Apple Notes');
    }
  } catch (error) {
    console.error('Error saving to notes:', error);
    showError(error.message || 'Failed to save to Apple Notes. Please try again.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
      </svg>
      Save to Apple Notes
    `;
  }
}

// Send message to background script (which communicates with native host)
function sendNativeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// Show error
function showError(message) {
  document.getElementById('error-text').textContent = message;
  showSection(errorSection);
}

// Handle retry
function handleRetry() {
  showSection(generateSection);
}

// Handle new summary
function handleNewSummary() {
  currentSummary = null;
  selectedLearnings.clear();
  showSection(generateSection);
}

// Handle back to edit (preserves all content)
function handleBackToEdit() {
  showSection(summarySection);
}

// Load folder suggestions from both storage and Apple Notes
async function loadFolderSuggestions() {
  try {
    const datalist = document.getElementById('folder-suggestions');
    datalist.innerHTML = '';

    // Create a set to track unique folders
    const allFolders = new Set();

    // Load from local storage (previously used folders)
    const result = await chrome.storage.local.get(['folderSuggestions']);
    const storedSuggestions = result.folderSuggestions || [];
    storedSuggestions.forEach(folder => allFolders.add(folder));

    // Fetch existing Apple Notes folders
    try {
      const response = await sendNativeMessage({ action: 'listFolders' });
      if (response.success && response.folders) {
        response.folders.forEach(folder => allFolders.add(folder));
      }
    } catch (error) {
      console.error('Error fetching Apple Notes folders:', error);
    }

    // Add all folders to datalist
    Array.from(allFolders).sort().forEach(folder => {
      const option = document.createElement('option');
      option.value = folder;
      datalist.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading folder suggestions:', error);
  }
}

// Save folder suggestion to storage
async function saveFolderSuggestion(folderName) {
  try {
    const result = await chrome.storage.local.get(['folderSuggestions']);
    const suggestions = result.folderSuggestions || [];

    if (!suggestions.includes(folderName)) {
      suggestions.unshift(folderName);
      // Keep only last 10 suggestions
      const trimmed = suggestions.slice(0, 10);
      await chrome.storage.local.set({ folderSuggestions: trimmed });
      loadFolderSuggestions();
    }
  } catch (error) {
    console.error('Error saving folder suggestion:', error);
  }
}

// Initialize on load
init();
