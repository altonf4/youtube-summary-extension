// YouTube Summary Sidebar - Main Logic

let currentVideoInfo = null;
let currentSummary = null;
let selectedLearnings = new Set();
let currentNoteId = null; // Cached note ID for updating existing notes
let cachedTranscript = null; // Store transcript for search functionality
let cachedCreatorComments = []; // Store creator comments (high value)
let cachedViewerComments = []; // Store top viewer comments
let searchMatches = []; // Store search match positions
let currentMatchIndex = -1; // Current highlighted match index

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

  // Follow-up button
  document.getElementById('follow-up-btn').addEventListener('click', handleFollowUp);

  // Summary toggle button
  document.getElementById('toggle-summary-btn').addEventListener('click', toggleSummary);

  // Load folder suggestions from storage
  loadFolderSuggestions();

  // Fetch transcript immediately for preview
  fetchTranscriptForPreview();

  // Set up search functionality
  initTranscriptSearch();

  // New export button listeners
  const copyBtn = document.getElementById('copy-clipboard-btn');
  const downloadBtn = document.getElementById('download-md-btn');
  if (copyBtn) copyBtn.addEventListener('click', handleCopyToClipboard);
  if (downloadBtn) downloadBtn.addEventListener('click', handleDownloadMarkdown);

  // Check native host availability (for Apple Notes)
  checkNativeHostAvailability();
}

// Close sidebar (sends message to content script)
function closeSidebar() {
  window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*');
}

// Toggle summary visibility
function toggleSummary() {
  const summaryText = document.getElementById('summary-text');
  const toggleBtn = document.getElementById('toggle-summary-btn');

  if (summaryText && toggleBtn) {
    const isCollapsed = summaryText.classList.toggle('collapsed');
    toggleBtn.classList.toggle('expanded', !isCollapsed);
  }
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

// Track completed stages, input tokens, and elapsed time
let completedStages = new Set();
let cachedInputTokens = 0;
let elapsedTimer = null;
let elapsedStartTime = null;

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

  // Handle elapsed timer
  if (stage === 'waiting' && !elapsedTimer) {
    startElapsedTimer();
  } else if (stage === 'parsing' || stage === 'complete') {
    stopElapsedTimer();
  }

  // Update token count display
  const tokensEl = document.getElementById('token-count');
  if (tokensEl) {
    if (stage === 'waiting' || stage === 'streaming') {
      tokensEl.textContent = `~${cachedInputTokens.toLocaleString()} tokens`;
    }
  }
}

// Start elapsed timer
function startElapsedTimer() {
  if (elapsedTimer) return;

  elapsedStartTime = Date.now();
  const timerEl = document.getElementById('elapsed-time');

  const updateTimer = () => {
    if (!elapsedStartTime) return;
    const elapsed = Math.floor((Date.now() - elapsedStartTime) / 1000);
    if (timerEl) {
      timerEl.textContent = `${elapsed}s`;
    }
  };

  updateTimer();
  elapsedTimer = setInterval(updateTimer, 1000);
}

// Stop elapsed timer
function stopElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
  elapsedStartTime = null;
}

// Reset progress UI
function resetProgressUI() {
  completedStages.clear();
  cachedInputTokens = 0;
  stopElapsedTimer();
  document.querySelectorAll('.progress-stage').forEach(el => {
    el.classList.remove('active', 'completed');
  });
  const tokensEl = document.getElementById('token-count');
  if (tokensEl) tokensEl.textContent = '';
  const timerEl = document.getElementById('elapsed-time');
  if (timerEl) timerEl.textContent = '';
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

  // Notify parent that analysis started
  window.parent.postMessage({ type: 'ANALYSIS_STARTED' }, '*');

  try {
    // Step 1: Get transcript from content script (scrapes YouTube DOM)
    const transcriptResult = await requestTranscript();

    if (!transcriptResult.success) {
      throw new Error(transcriptResult.error || 'Failed to extract transcript');
    }

    // Cache comments if available
    if (transcriptResult.creatorComments) {
      cachedCreatorComments = transcriptResult.creatorComments;
      console.log(`Received ${cachedCreatorComments.length} creator comments`);
    }
    if (transcriptResult.viewerComments) {
      cachedViewerComments = transcriptResult.viewerComments;
      console.log(`Received ${cachedViewerComments.length} viewer comments`);
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
      creatorComments: cachedCreatorComments,
      viewerComments: cachedViewerComments,
      customInstructions: customInstructions
    });

    if (response.success) {
      currentSummary = response;
      displaySummary(response.summary, response.keyLearnings, response.relevantLinks || []);
      displayActionItems(response.actionItems || []);
      showSection(summarySection);
      // Notify parent that analysis completed
      window.parent.postMessage({ type: 'ANALYSIS_COMPLETE' }, '*');
    } else {
      throw new Error(response.error || 'Failed to generate summary');
    }
  } catch (error) {
    console.error('Error generating summary:', error);
    showError(error.message || 'Failed to generate summary. Please try again.');
    // Notify parent that analysis failed (reset state)
    window.parent.postMessage({ type: 'ANALYSIS_RESET' }, '*');
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

  // Populate searchable transcript area with cached transcript
  const searchableTranscript = document.getElementById('searchable-transcript');
  if (searchableTranscript && cachedTranscript) {
    searchableTranscript.textContent = cachedTranscript;
    searchableTranscript.dataset.populated = 'true';
  }
}

/**
 * Display action items with checkboxes and due date pickers
 * @param {string[]} actionItems - Array of action item strings
 */
function displayActionItems(actionItems) {
  const actionSection = document.getElementById('action-items-section');
  const actionList = document.getElementById('action-items-list');

  if (!actionSection || !actionList) return;

  if (!actionItems || actionItems.length === 0) {
    actionSection.style.display = 'none';
    return;
  }

  actionSection.style.display = 'block';
  actionList.innerHTML = '';

  // Get default due date from dropdown
  const defaultDueDays = parseInt(document.getElementById('default-due-days').value, 10) || 7;
  const defaultDueDate = new Date();
  defaultDueDate.setDate(defaultDueDate.getDate() + defaultDueDays);

  actionItems.forEach((item, index) => {
    const actionEl = document.createElement('div');
    actionEl.className = 'action-item';

    // Create checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `action-${index}`;
    checkbox.checked = true;

    // Create content container
    const contentDiv = document.createElement('div');
    contentDiv.className = 'action-content';

    // Create textarea for action text
    const textArea = document.createElement('textarea');
    textArea.className = 'action-text';
    textArea.id = `action-text-${index}`;
    textArea.value = item;
    textArea.rows = 2; // Start with 2 rows minimum

    // Auto-resize textarea to fit content (same as key learnings)
    const autoResize = () => {
      textArea.style.height = 'auto';
      textArea.style.height = textArea.scrollHeight + 'px';
    };
    textArea.addEventListener('input', autoResize);

    // Create due date container
    const dueDiv = document.createElement('div');
    dueDiv.className = 'action-due';

    const dueLabel = document.createElement('label');
    dueLabel.textContent = 'Due:';

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.id = `action-due-${index}`;
    dateInput.value = formatDateForInput(defaultDueDate);

    dueDiv.appendChild(dueLabel);
    dueDiv.appendChild(dateInput);

    contentDiv.appendChild(textArea);
    contentDiv.appendChild(dueDiv);

    actionEl.appendChild(checkbox);
    actionEl.appendChild(contentDiv);
    actionList.appendChild(actionEl);

    // Trigger initial resize after DOM renders
    setTimeout(autoResize, 10);
  });

  // Update default due dates when dropdown changes
  document.getElementById('default-due-days').addEventListener('change', (e) => {
    const days = parseInt(e.target.value, 10);
    const newDefaultDate = new Date();
    newDefaultDate.setDate(newDefaultDate.getDate() + days);

    // Update all date inputs that still have the old default
    document.querySelectorAll('.action-item input[type="date"]').forEach(input => {
      input.value = formatDateForInput(newDefaultDate);
    });
  });
}

/**
 * Format date for HTML date input (YYYY-MM-DD)
 * @param {Date} date - Date object
 * @returns {string} - Formatted date string
 */
function formatDateForInput(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Get selected action items with their due dates
 * @returns {Array<{text: string, dueDate: string|null}>} - Array of action items
 */
function getSelectedActionItems() {
  const items = [];
  const actionElements = document.querySelectorAll('.action-item');

  actionElements.forEach((el) => {
    const checkbox = el.querySelector('input[type="checkbox"]');
    const textArea = el.querySelector('.action-text');
    const dueDateInput = el.querySelector('input[type="date"]');

    if (checkbox && checkbox.checked && textArea && textArea.value.trim()) {
      items.push({
        text: textArea.value.trim(),
        dueDate: dueDateInput ? dueDateInput.value || null : null
      });
    }
  });

  return items;
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

// =====================================
// EXPORT: Markdown Formatter
// =====================================

/**
 * Format summary data as Markdown
 * @returns {string} Markdown formatted string
 */
function formatAsMarkdown() {
  const editedSummary = document.getElementById('summary-text').innerText.trim();
  const learnings = getEditedLearnings();
  const links = getSelectedLinks();
  const customNotes = getCustomNotesHtml();

  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let markdown = `# ${currentVideoInfo.title}\n\n`;
  markdown += `**URL:** ${currentVideoInfo.url}\n`;
  markdown += `**Date:** ${date}\n\n`;
  markdown += `## Summary\n\n${editedSummary || currentSummary.summary}\n\n`;
  markdown += `## Key Learnings\n\n`;

  learnings.forEach(learning => {
    markdown += `- ${learning}\n`;
  });

  if (links.length > 0) {
    markdown += `\n## Relevant Links\n\n`;
    links.forEach(link => {
      markdown += `- [${link.text}](${link.url})`;
      if (link.reason) markdown += ` - ${link.reason}`;
      markdown += '\n';
    });
  }

  if (customNotes) {
    // Convert HTML to simple markdown
    const plainNotes = customNotes
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?b>/gi, '**')
      .replace(/<\/?strong>/gi, '**')
      .replace(/<\/?i>/gi, '_')
      .replace(/<\/?em>/gi, '_')
      .replace(/<\/?u>/gi, '')
      .replace(/<li>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    markdown += `\n## My Notes\n\n${plainNotes}\n`;
  }

  markdown += `\n---\n*Generated with YouTube Summary Extension*\n`;

  return markdown;
}

// =====================================
// EXPORT: Copy to Clipboard
// =====================================

async function handleCopyToClipboard() {
  const copyBtn = document.getElementById('copy-clipboard-btn');
  if (!copyBtn) return;

  const originalHTML = copyBtn.innerHTML;

  try {
    const markdown = formatAsMarkdown();
    await navigator.clipboard.writeText(markdown);

    // Success feedback
    copyBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Copied!
    `;
    copyBtn.classList.add('success');

    setTimeout(() => {
      copyBtn.innerHTML = originalHTML;
      copyBtn.classList.remove('success');
    }, 2000);

  } catch (error) {
    console.error('Failed to copy:', error);
    copyBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      Failed
    `;
    setTimeout(() => {
      copyBtn.innerHTML = originalHTML;
    }, 2000);
  }
}

// =====================================
// EXPORT: Download as Markdown
// =====================================

function handleDownloadMarkdown() {
  const downloadBtn = document.getElementById('download-md-btn');
  if (!downloadBtn) return;

  const originalHTML = downloadBtn.innerHTML;
  const markdown = formatAsMarkdown();

  // Create safe filename from video title
  const safeTitle = currentVideoInfo.title
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);

  const filename = `${safeTitle}-summary.md`;

  // Create blob and download
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Success feedback
  downloadBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    Downloaded!
  `;
  downloadBtn.classList.add('success');

  setTimeout(() => {
    downloadBtn.innerHTML = originalHTML;
    downloadBtn.classList.remove('success');
  }, 2000);
}

// =====================================
// Native Host Availability Check
// =====================================

let nativeHostAvailable = null;

async function checkNativeHostAvailability() {
  const badge = document.getElementById('native-status-badge');
  const availableSection = document.getElementById('apple-notes-available');
  const unavailableSection = document.getElementById('apple-notes-unavailable');

  if (!badge) return;

  try {
    // Try a simple ping to native host
    const response = await sendNativeMessage({ action: 'listFolders' });

    if (response.success) {
      nativeHostAvailable = true;
      badge.textContent = 'Available';
      badge.className = 'native-status-badge available';
      if (availableSection) availableSection.style.display = 'block';
      if (unavailableSection) unavailableSection.style.display = 'none';
    } else {
      throw new Error('Native host not responding');
    }
  } catch (error) {
    nativeHostAvailable = false;
    badge.textContent = 'Not configured';
    badge.className = 'native-status-badge unavailable';
    if (availableSection) availableSection.style.display = 'none';
    if (unavailableSection) unavailableSection.style.display = 'block';
  }
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

  // Get selected action items
  const actionItemsToSave = getSelectedActionItems();

  if (learningsToSave.length === 0 && !customNotes && linksToSave.length === 0 && actionItemsToSave.length === 0) {
    showError('Please select at least one key learning, action item, link, or add custom notes');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    // Get edited summary from DOM (user may have edited it)
    const editedSummary = document.getElementById('summary-text').innerText.trim();

    const response = await sendNativeMessage({
      action: 'saveToNotes',
      folder: folderName,
      videoTitle: currentVideoInfo.title,
      videoUrl: currentVideoInfo.url,
      summary: editedSummary || currentSummary.summary,
      keyLearnings: learningsToSave,
      relevantLinks: linksToSave,
      actionItems: actionItemsToSave,
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
      let details = `${action} in "${folderName}" folder`;
      if (response.remindersCreated > 0) {
        details += ` and created ${response.remindersCreated} reminder${response.remindersCreated > 1 ? 's' : ''}`;
      }
      document.getElementById('success-details').textContent = details;

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
  // Notify parent to reset floating button state
  window.parent.postMessage({ type: 'ANALYSIS_RESET' }, '*');
}

// Handle new summary
function handleNewSummary() {
  currentSummary = null;
  currentNoteId = null; // Reset note ID for new summary
  selectedLearnings.clear();
  showSection(generateSection);
  // Notify parent to reset floating button state
  window.parent.postMessage({ type: 'ANALYSIS_RESET' }, '*');
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

/**
 * Handle follow-up prompt to extract more information
 * Sends additional query to Claude and appends new learnings
 */
async function handleFollowUp() {
  const followUpInput = document.getElementById('follow-up-input');
  const followUpBtn = document.getElementById('follow-up-btn');
  const followUpLoading = document.getElementById('follow-up-loading');
  const inputContainer = document.querySelector('.follow-up-input-container');

  const query = followUpInput.value.trim();
  if (!query) {
    followUpInput.focus();
    return;
  }

  if (!cachedTranscript || !currentVideoInfo) {
    showError('Transcript or video info not available');
    return;
  }

  // Show loading state
  followUpBtn.disabled = true;
  inputContainer.style.display = 'none';
  followUpLoading.style.display = 'flex';

  try {
    // Get current learnings to provide context
    const existingLearnings = getEditedLearnings();

    // Send follow-up request to native host
    const response = await sendNativeMessage({
      action: 'followUp',
      videoId: currentVideoInfo.videoId,
      title: currentVideoInfo.title,
      transcript: cachedTranscript,
      query: query,
      existingLearnings: existingLearnings
    });

    if (response.success && response.additionalLearnings) {
      // Append new learnings to the list
      appendNewLearnings(response.additionalLearnings);

      // Clear the input
      followUpInput.value = '';
    } else {
      throw new Error(response.error || 'Failed to extract additional information');
    }
  } catch (error) {
    console.error('Error in follow-up:', error);
    // Show error inline instead of switching sections
    const errorMsg = document.createElement('p');
    errorMsg.className = 'follow-up-error';
    errorMsg.textContent = error.message;
    errorMsg.style.color = '#ef4444';
    errorMsg.style.fontSize = '13px';
    errorMsg.style.padding = '8px 16px';
    inputContainer.parentNode.insertBefore(errorMsg, followUpLoading);
    setTimeout(() => errorMsg.remove(), 5000);
  } finally {
    // Hide loading, show input
    followUpLoading.style.display = 'none';
    inputContainer.style.display = 'flex';
    followUpBtn.disabled = false;
  }
}

/**
 * Append new learnings to the existing list with animation
 * @param {string[]} newLearnings - Array of new learning strings
 */
function appendNewLearnings(newLearnings) {
  const learningsList = document.getElementById('key-learnings-list');
  const existingCount = learningsList.querySelectorAll('.learning-item').length;

  newLearnings.forEach((learning, i) => {
    const index = existingCount + i;
    const learningItem = document.createElement('div');
    learningItem.className = 'learning-item new-item';

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

    // Select the new learning
    selectedLearnings.add(index);

    // Trigger initial resize
    setTimeout(() => {
      textArea.style.height = 'auto';
      textArea.style.height = textArea.scrollHeight + 'px';
    }, 0);
  });

  // Scroll to the first new item
  const firstNewItem = learningsList.querySelector('.new-item');
  if (firstNewItem) {
    firstNewItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * Fetch transcript for preview display (before summarization)
 * Shows the raw transcript in a scrollable area
 */
async function fetchTranscriptForPreview() {
  const transcriptContent = document.getElementById('transcript-content');
  const transcriptStatus = document.getElementById('transcript-status');

  if (!transcriptContent || !transcriptStatus) return;

  try {
    // Request transcript from content script
    const transcriptResult = await requestTranscript();

    if (transcriptResult.success && transcriptResult.transcript) {
      // Cache the transcript for search
      cachedTranscript = transcriptResult.transcript;

      // Display in preview area
      transcriptContent.textContent = transcriptResult.transcript;
      transcriptStatus.textContent = `${transcriptResult.transcript.length.toLocaleString()} chars`;
      transcriptStatus.classList.add('ready');
      transcriptStatus.classList.remove('error');
    } else {
      transcriptContent.innerHTML = `<p class="transcript-error">${transcriptResult.error || 'Transcript not available'}</p>`;
      transcriptStatus.textContent = 'Error';
      transcriptStatus.classList.add('error');
      transcriptStatus.classList.remove('ready');
    }
  } catch (error) {
    console.error('Error fetching transcript for preview:', error);
    transcriptContent.innerHTML = '<p class="transcript-error">Failed to load transcript</p>';
    transcriptStatus.textContent = 'Error';
    transcriptStatus.classList.add('error');
    transcriptStatus.classList.remove('ready');
  }
}

/**
 * Initialize transcript search functionality
 * Sets up search input, navigation buttons, and toggle
 */
function initTranscriptSearch() {
  const searchInput = document.getElementById('transcript-search-input');
  const searchResultsCount = document.getElementById('search-results-count');
  const prevBtn = document.getElementById('search-prev-btn');
  const nextBtn = document.getElementById('search-next-btn');
  const toggleBtn = document.getElementById('toggle-transcript-btn');
  const searchableTranscript = document.getElementById('searchable-transcript');

  if (!searchInput) return;

  // Debounced search
  let searchTimeout = null;
  searchInput.addEventListener('input', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      performSearch(searchInput.value);
    }, 200);
  });

  // Enter key to go to next match
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        navigateSearch(-1);
      } else {
        navigateSearch(1);
      }
    }
  });

  // Navigation buttons
  if (prevBtn) {
    prevBtn.addEventListener('click', () => navigateSearch(-1));
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => navigateSearch(1));
  }

  // Toggle transcript visibility
  if (toggleBtn && searchableTranscript) {
    toggleBtn.addEventListener('click', () => {
      const isExpanded = searchableTranscript.style.display !== 'none';
      searchableTranscript.style.display = isExpanded ? 'none' : 'block';
      toggleBtn.classList.toggle('expanded', !isExpanded);

      // Populate transcript content if expanding for first time
      if (!isExpanded && cachedTranscript && !searchableTranscript.dataset.populated) {
        searchableTranscript.textContent = cachedTranscript;
        searchableTranscript.dataset.populated = 'true';
      }
    });
  }
}

/**
 * Perform search in transcript and highlight matches
 * @param {string} query - Search query
 */
function performSearch(query) {
  const searchableTranscript = document.getElementById('searchable-transcript');
  const searchResultsCount = document.getElementById('search-results-count');
  const prevBtn = document.getElementById('search-prev-btn');
  const nextBtn = document.getElementById('search-next-btn');

  if (!searchableTranscript || !cachedTranscript) return;

  // Reset
  searchMatches = [];
  currentMatchIndex = -1;

  // Update navigation buttons state
  const updateNavButtons = () => {
    if (prevBtn) prevBtn.disabled = searchMatches.length === 0;
    if (nextBtn) nextBtn.disabled = searchMatches.length === 0;
  };

  if (!query || query.trim().length === 0) {
    // No search query - show plain text
    searchableTranscript.textContent = cachedTranscript;
    if (searchResultsCount) searchResultsCount.textContent = '';
    updateNavButtons();
    return;
  }

  // Escape regex special characters
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');

  // Find all matches
  let match;
  const tempRegex = new RegExp(escapedQuery, 'gi');
  while ((match = tempRegex.exec(cachedTranscript)) !== null) {
    searchMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0]
    });
  }

  // Show transcript area when searching
  searchableTranscript.style.display = 'block';
  const toggleBtn = document.getElementById('toggle-transcript-btn');
  if (toggleBtn) toggleBtn.classList.add('expanded');

  // Highlight matches
  if (searchMatches.length > 0) {
    const highlightedText = cachedTranscript.replace(regex, '<mark class="highlight">$1</mark>');
    searchableTranscript.innerHTML = highlightedText;
    if (searchResultsCount) searchResultsCount.textContent = `${searchMatches.length} found`;

    // Go to first match
    currentMatchIndex = 0;
    highlightCurrentMatch();
  } else {
    searchableTranscript.textContent = cachedTranscript;
    if (searchResultsCount) searchResultsCount.textContent = 'No matches';
  }

  updateNavButtons();
}

/**
 * Navigate to next/previous search match
 * @param {number} direction - 1 for next, -1 for previous
 */
function navigateSearch(direction) {
  if (searchMatches.length === 0) return;

  // Remove current highlight
  const searchableTranscript = document.getElementById('searchable-transcript');
  if (!searchableTranscript) return;

  // Update index
  currentMatchIndex += direction;
  if (currentMatchIndex >= searchMatches.length) currentMatchIndex = 0;
  if (currentMatchIndex < 0) currentMatchIndex = searchMatches.length - 1;

  highlightCurrentMatch();
}

/**
 * Highlight the current match and scroll to it
 */
function highlightCurrentMatch() {
  const searchableTranscript = document.getElementById('searchable-transcript');
  const searchResultsCount = document.getElementById('search-results-count');

  if (!searchableTranscript) return;

  // Remove existing current highlights
  const existingCurrent = searchableTranscript.querySelectorAll('.highlight.current');
  existingCurrent.forEach(el => el.classList.remove('current'));

  // Add current class to current match
  const highlights = searchableTranscript.querySelectorAll('.highlight');
  if (highlights[currentMatchIndex]) {
    highlights[currentMatchIndex].classList.add('current');

    // Scroll into view
    highlights[currentMatchIndex].scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }

  // Update count display
  if (searchResultsCount && searchMatches.length > 0) {
    searchResultsCount.textContent = `${currentMatchIndex + 1}/${searchMatches.length}`;
  }
}

// Initialize on load
init();
