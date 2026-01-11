// YouTube Summary Sidebar - Main Logic

let currentVideoInfo = null;
let currentSummary = null;
let selectedLearnings = new Set();
let currentNoteId = null; // Cached note ID for updating existing notes

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

    // Show link count if links were found
    if (event.data.links && event.data.links.length > 0) {
      console.log(`Found ${event.data.links.length} links in description`);
    }
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

// Track completed stages and input tokens
let completedStages = new Set();
let cachedInputTokens = 0;

// Update progress UI based on stage
function updateProgressUI(progress) {
  const { stage, message, chars, inputTokens } = progress;

  // Cache input tokens when we receive them
  if (inputTokens) {
    cachedInputTokens = inputTokens;
  }

  // Update progress message
  const progressMessage = document.getElementById('progress-message');
  if (progressMessage) {
    progressMessage.textContent = message;
  }

  // Stage order for marking completed (streaming merged into waiting)
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
    } else if (elStage === stage || (stage === 'starting' && elStage === 'sending') || (stage === 'streaming' && elStage === 'waiting')) {
      // Keep "waiting" stage active during streaming since we removed the streaming UI
      el.classList.add('active');
    }
  });

  // Update token count display
  const tokensEl = document.getElementById('token-count');
  if (tokensEl) {
    if (stage === 'waiting') {
      // Show input tokens during waiting
      tokensEl.textContent = `~${cachedInputTokens.toLocaleString()} in`;
    } else if (stage === 'streaming' && chars) {
      // Show output tokens during streaming
      const outputTokens = Math.round(chars / 4);
      tokensEl.textContent = `~${outputTokens.toLocaleString()} out`;
    }
  }
}

// Reset progress UI
function resetProgressUI() {
  completedStages.clear();
  cachedInputTokens = 0;
  document.querySelectorAll('.progress-stage').forEach(el => {
    el.classList.remove('active', 'completed');
  });
  const tokensEl = document.getElementById('token-count');
  if (tokensEl) tokensEl.textContent = '';
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
      description: currentVideoInfo.description || '',
      descriptionLinks: currentVideoInfo.links || [],
      customInstructions: customInstructions
    });

    if (response.success) {
      currentSummary = response;
      displaySummary(response.summary, response.keyLearnings, response.relevantLinks || []);
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
function displaySummary(summary, keyLearnings, relevantLinks = []) {
  // Display summary text
  const summaryText = document.getElementById('summary-text');
  summaryText.textContent = summary;

  // Display relevant links if any
  const linksContainer = document.getElementById('relevant-links-list');
  const linksSection = document.getElementById('relevant-links-section');

  if (linksContainer && linksSection) {
    if (relevantLinks.length > 0) {
      linksContainer.innerHTML = '';
      relevantLinks.forEach((link, index) => {
        const linkItem = document.createElement('div');
        linkItem.className = 'link-item';
        linkItem.innerHTML = `
          <input type="checkbox" id="link-${index}" checked>
          <div class="link-content">
            <a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.text}</a>
            ${link.reason ? `<span class="link-reason">${link.reason}</span>` : ''}
          </div>
        `;
        linksContainer.appendChild(linkItem);
      });
      linksSection.style.display = 'block';
    } else {
      linksSection.style.display = 'none';
    }
  }

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

// Get selected relevant links
function getSelectedLinks() {
  const links = [];
  const linkItems = document.querySelectorAll('.link-item');

  linkItems.forEach((item, index) => {
    const checkbox = item.querySelector('input[type="checkbox"]');
    if (checkbox && checkbox.checked && currentSummary.relevantLinks && currentSummary.relevantLinks[index]) {
      links.push(currentSummary.relevantLinks[index]);
    }
  });

  return links;
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

  // Get selected links
  const linksToSave = getSelectedLinks();

  if (learningsToSave.length === 0 && !customNotes && linksToSave.length === 0) {
    showError('Please select at least one key learning, link, or add custom notes');
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
      relevantLinks: linksToSave,
      customNotes: customNotes,
      noteId: currentNoteId // Send cached note ID if we have one
    });

    if (response.success) {
      // Cache the note ID for future updates
      currentNoteId = response.noteId;

      // Save folder to suggestions
      saveFolderSuggestion(folderName);

      // Show success with created/updated status
      const action = response.created ? 'Created new note' : 'Updated existing note';
      document.getElementById('success-details').textContent =
        `${action} in "${folderName}" folder`;

      // Update success header based on action
      const successHeader = document.querySelector('.success-message h3');
      if (successHeader) {
        successHeader.textContent = response.created ? 'Saved to Apple Notes!' : 'Note Updated!';
      }

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
  currentNoteId = null; // Reset note ID for new summary
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
