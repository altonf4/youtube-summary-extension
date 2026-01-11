// YouTube Summary Extension - Content Script
// Injects sidebar into YouTube video pages

let sidebar = null;
let popupBanner = null;
let floatingButton = null;
let isSidebarOpen = false;
let bannerDismissedForVideo = null;
let isAnalyzing = false;
let analysisComplete = false;

// Extract video ID from YouTube URL
function getVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

// Extract video title from page
function getVideoTitle() {
  const titleElement = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
  return titleElement ? titleElement.textContent : 'Unknown Title';
}

// Extract video description from page
function getVideoDescription() {
  // Try to get the description - it might need to be expanded first
  const descriptionContainer = document.querySelector('#description-inner, ytd-text-inline-expander #plain-snippet-text, #description .content');

  if (descriptionContainer) {
    return descriptionContainer.innerText || descriptionContainer.textContent || '';
  }

  // Alternative selector for expanded description
  const expandedDesc = document.querySelector('ytd-text-inline-expander .yt-core-attributed-string');
  if (expandedDesc) {
    return expandedDesc.innerText || expandedDesc.textContent || '';
  }

  return '';
}

// Extract links from video description
function getDescriptionLinks() {
  const links = [];
  const descriptionContainer = document.querySelector('#description-inner, ytd-text-inline-expander, #description .content');

  if (descriptionContainer) {
    const anchorElements = descriptionContainer.querySelectorAll('a[href]');
    anchorElements.forEach(anchor => {
      const href = anchor.href;
      const text = anchor.textContent.trim();

      // Filter out YouTube internal links and empty links
      if (href && !href.includes('youtube.com/hashtag') &&
          !href.startsWith('https://www.youtube.com/watch') &&
          !href.includes('/channel/') &&
          !href.includes('/c/') &&
          text.length > 0) {
        links.push({
          url: href,
          text: text
        });
      }
    });
  }

  return links;
}

// Inject popup banner styles
function injectStyles() {
  if (document.getElementById('youtube-summary-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'youtube-summary-styles';
  styles.textContent = `
    #youtube-summary-popup {
      position: fixed;
      top: 16px;
      right: 20px;
      z-index: 10001;
      background: white;
      border-radius: 50px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
      display: flex;
      align-items: center;
      padding: 8px 12px 8px 16px;
      gap: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      max-width: 420px;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    #youtube-summary-popup.hiding {
      animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes slideUp {
      from {
        opacity: 1;
        transform: translateY(0);
      }
      to {
        opacity: 0;
        transform: translateY(-20px);
      }
    }

    #youtube-summary-float-btn {
      position: fixed;
      top: 16px;
      right: 20px;
      z-index: 10001;
      width: 44px;
      height: 44px;
      background: white;
      border: none;
      border-radius: 50%;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      transition: transform 0.15s, box-shadow 0.15s;
    }

    #youtube-summary-float-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 28px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
      cursor: grab;
    }

    #youtube-summary-float-btn:active {
      transform: scale(0.95);
      cursor: grabbing;
    }

    #youtube-summary-float-btn svg {
      width: 22px;
      height: 22px;
      color: #374151;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: scale(0.8);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    #youtube-summary-float-btn.hiding {
      animation: fadeOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes fadeOut {
      from {
        opacity: 1;
        transform: scale(1);
      }
      to {
        opacity: 0;
        transform: scale(0.8);
      }
    }

    /* Analyzing state - spinning progress ring */
    #youtube-summary-float-btn.analyzing {
      box-shadow: 0 4px 24px rgba(102, 126, 234, 0.3), 0 0 0 1px rgba(102, 126, 234, 0.2);
    }

    #youtube-summary-float-btn.analyzing::before {
      content: '';
      position: absolute;
      top: -3px;
      left: -3px;
      right: -3px;
      bottom: -3px;
      border-radius: 50%;
      border: 3px solid transparent;
      border-top-color: #667eea;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    #youtube-summary-float-btn.analyzing svg {
      color: #667eea;
    }

    /* Complete state - green with badge */
    #youtube-summary-float-btn.complete {
      box-shadow: 0 4px 24px rgba(16, 185, 129, 0.3), 0 0 0 1px rgba(16, 185, 129, 0.2);
    }

    #youtube-summary-float-btn.complete svg {
      color: #10b981;
    }

    #youtube-summary-float-btn .complete-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 18px;
      height: 18px;
      background: #10b981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      animation: popIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    }

    #youtube-summary-float-btn .complete-badge svg {
      width: 12px;
      height: 12px;
      color: white;
    }

    @keyframes popIn {
      from {
        transform: scale(0);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }

    #youtube-summary-popup .popup-icon {
      width: 36px;
      height: 36px;
      background: #f3f4f6;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    #youtube-summary-popup .popup-icon svg {
      width: 20px;
      height: 20px;
      color: #374151;
    }

    #youtube-summary-popup .popup-content {
      flex: 1;
      min-width: 0;
    }

    #youtube-summary-popup .popup-title {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #youtube-summary-popup .popup-subtitle {
      font-size: 12px;
      color: #6b7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #youtube-summary-popup .popup-btn {
      background: #111827;
      color: white;
      border: none;
      border-radius: 20px;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s;
      flex-shrink: 0;
    }

    #youtube-summary-popup .popup-btn:hover {
      background: #374151;
      transform: scale(1.02);
    }

    #youtube-summary-popup .popup-btn:active {
      transform: scale(0.98);
    }

    #youtube-summary-popup .popup-close {
      background: none;
      border: none;
      padding: 6px;
      cursor: pointer;
      color: #9ca3af;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      flex-shrink: 0;
    }

    #youtube-summary-popup .popup-close:hover {
      background: #f3f4f6;
      color: #374151;
    }

    #youtube-summary-sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: 400px;
      height: 100vh;
      z-index: 10000;
      transform: translateX(100%);
      transition: transform 0.3s ease;
    }

    #youtube-summary-sidebar iframe {
      width: 100%;
      height: 100%;
      box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
    }
  `;
  document.head.appendChild(styles);
}

// Create popup banner
function createPopupBanner() {
  const videoId = getVideoId();
  if (popupBanner || !videoId || bannerDismissedForVideo === videoId) return;

  injectStyles();

  popupBanner = document.createElement('div');
  popupBanner.id = 'youtube-summary-popup';
  popupBanner.innerHTML = `
    <div class="popup-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
      </svg>
    </div>
    <div class="popup-content">
      <div class="popup-title">YouTube Summary Available</div>
      <div class="popup-subtitle">Generate AI summary & save to Notes</div>
    </div>
    <button class="popup-btn">Summarize</button>
    <button class="popup-close" title="Dismiss">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  // Add click handlers
  popupBanner.querySelector('.popup-btn').onclick = () => {
    hidePopupBanner(false);
    openSidebar();
  };

  popupBanner.querySelector('.popup-close').onclick = () => {
    bannerDismissedForVideo = videoId;
    hidePopupBanner(true); // Show floating button after dismissing
  };

  document.body.appendChild(popupBanner);
}

// Hide popup banner with animation
function hidePopupBanner(showFloatBtn = false) {
  if (!popupBanner) return;

  popupBanner.classList.add('hiding');
  setTimeout(() => {
    if (popupBanner) {
      popupBanner.remove();
      popupBanner = null;
    }
    // Show floating button after banner is hidden
    if (showFloatBtn) {
      createFloatingButton();
    }
  }, 300);
}

// Create floating button (shown after banner is dismissed)
function createFloatingButton() {
  if (floatingButton || isSidebarOpen) return;

  injectStyles();

  floatingButton = document.createElement('button');
  floatingButton.id = 'youtube-summary-float-btn';
  floatingButton.title = 'AI Summary (drag to reposition)';
  floatingButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
    </svg>
  `;

  // Apply state classes
  updateFloatingButtonState();

  // Load saved position
  const savedPos = getSavedButtonPosition();
  if (savedPos) {
    floatingButton.style.top = savedPos.top;
    floatingButton.style.right = 'auto';
    floatingButton.style.left = savedPos.left;
  }

  // Make draggable
  makeButtonDraggable(floatingButton);

  document.body.appendChild(floatingButton);
}

// Update floating button visual state
function updateFloatingButtonState() {
  if (!floatingButton) return;

  floatingButton.classList.remove('analyzing', 'complete');

  // Remove any existing badge
  const existingBadge = floatingButton.querySelector('.complete-badge');
  if (existingBadge) existingBadge.remove();

  if (isAnalyzing) {
    floatingButton.classList.add('analyzing');
    floatingButton.title = 'Analyzing video...';
  } else if (analysisComplete) {
    floatingButton.classList.add('complete');
    floatingButton.title = 'Summary ready! Click to view';
    // Add checkmark badge
    const badge = document.createElement('div');
    badge.className = 'complete-badge';
    badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    floatingButton.appendChild(badge);
  } else {
    floatingButton.title = 'AI Summary (drag to reposition)';
  }
}

// Get saved button position from localStorage
function getSavedButtonPosition() {
  try {
    const saved = localStorage.getItem('youtube-summary-btn-position');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

// Save button position to localStorage
function saveButtonPosition(top, left) {
  try {
    localStorage.setItem('youtube-summary-btn-position', JSON.stringify({ top, left }));
  } catch {
    // Ignore storage errors
  }
}

// Make the floating button draggable
function makeButtonDraggable(btn) {
  let isDragging = false;
  let hasMoved = false;
  let startX, startY, startLeft, startTop;

  btn.addEventListener('mousedown', (e) => {
    isDragging = true;
    hasMoved = false;

    // Get current position
    const rect = btn.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;

    // Switch to left-based positioning for dragging
    btn.style.right = 'auto';
    btn.style.left = startLeft + 'px';
    btn.style.top = startTop + 'px';

    btn.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    // Check if moved enough to be considered a drag
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      hasMoved = true;
    }

    let newLeft = startLeft + deltaX;
    let newTop = startTop + deltaY;

    // Keep within viewport bounds
    const btnSize = 44;
    newLeft = Math.max(8, Math.min(window.innerWidth - btnSize - 8, newLeft));
    newTop = Math.max(8, Math.min(window.innerHeight - btnSize - 8, newTop));

    btn.style.left = newLeft + 'px';
    btn.style.top = newTop + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    btn.style.cursor = '';

    // Save position if moved
    if (hasMoved) {
      saveButtonPosition(btn.style.top, btn.style.left);
    }
  });

  // Handle click (only if not dragged)
  btn.addEventListener('click', (e) => {
    if (hasMoved) {
      e.preventDefault();
      e.stopPropagation();
      hasMoved = false;
      return;
    }
    hideFloatingButton();
    openSidebar();
  });
}

// Hide floating button with animation
function hideFloatingButton() {
  if (!floatingButton) return;

  floatingButton.classList.add('hiding');
  setTimeout(() => {
    if (floatingButton) {
      floatingButton.remove();
      floatingButton = null;
    }
  }, 200);
}

// Create sidebar iframe
function createSidebar() {
  if (sidebar) return;

  injectStyles();

  sidebar = document.createElement('div');
  sidebar.id = 'youtube-summary-sidebar';
  sidebar.innerHTML = `
    <iframe
      src="${chrome.runtime.getURL('sidebar/sidebar.html')}"
      frameborder="0"
      allow="clipboard-write"
    ></iframe>
  `;

  document.body.appendChild(sidebar);

  // Send video info to sidebar when iframe loads
  const iframe = sidebar.querySelector('iframe');
  iframe.onload = () => {
    sendVideoInfoToSidebar();
  };
}

// Open sidebar
function openSidebar() {
  // Hide floating button if visible
  if (floatingButton) {
    floatingButton.remove();
    floatingButton = null;
  }

  if (!sidebar) {
    createSidebar();
  }

  isSidebarOpen = true;
  sidebar.style.transform = 'translateX(0)';
}

// Close sidebar
function closeSidebar() {
  if (!sidebar) return;
  isSidebarOpen = false;
  sidebar.style.transform = 'translateX(100%)';
}

// Send video information to sidebar
function sendVideoInfoToSidebar() {
  const videoId = getVideoId();
  const title = getVideoTitle();
  const description = getVideoDescription();
  const descriptionLinks = getDescriptionLinks();

  if (!videoId) return;

  const iframe = sidebar?.querySelector('iframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: 'VIDEO_INFO',
      videoId: videoId,
      title: title,
      url: window.location.href,
      description: description,
      links: descriptionLinks
    }, '*');
  }
}

// Listen for URL changes (YouTube is a SPA)
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    onUrlChange();
  }
});

function onUrlChange() {
  const videoId = getVideoId();

  // Remove old popup banner, floating button, and sidebar on navigation
  if (popupBanner) {
    popupBanner.remove();
    popupBanner = null;
  }

  if (floatingButton) {
    floatingButton.remove();
    floatingButton = null;
  }

  if (sidebar) {
    sidebar.remove();
    sidebar = null;
    isSidebarOpen = false;
  }

  // Reset analysis state for new video
  isAnalyzing = false;
  analysisComplete = false;

  // Reset dismissed state for new video
  if (videoId !== bannerDismissedForVideo) {
    bannerDismissedForVideo = null;
  }

  // Show popup banner if on video page
  if (videoId) {
    setTimeout(createPopupBanner, 1500); // Wait for YouTube to render
  }
}

// Initialize
function init() {
  const videoId = getVideoId();

  if (videoId) {
    // Wait for page to fully load
    setTimeout(createPopupBanner, 1500);
  }

  // Observe URL changes
  urlObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Listen for progress updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROGRESS_UPDATE') {
    // Track analysis state based on progress
    const stage = message.progress?.stage;
    if (stage && stage !== 'complete') {
      isAnalyzing = true;
      analysisComplete = false;
      updateFloatingButtonState();
    } else if (stage === 'complete') {
      isAnalyzing = false;
      analysisComplete = true;
      updateFloatingButtonState();
    }

    // Forward to sidebar iframe
    const iframe = sidebar?.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'PROGRESS_UPDATE',
        progress: message.progress
      }, '*');
    }
  }
});

// Listen for messages from sidebar
window.addEventListener('message', async (event) => {
  if (event.data.type === 'REQUEST_VIDEO_INFO') {
    sendVideoInfoToSidebar();
  }

  if (event.data.type === 'ANALYSIS_STARTED') {
    isAnalyzing = true;
    analysisComplete = false;
    updateFloatingButtonState();
  }

  if (event.data.type === 'ANALYSIS_COMPLETE') {
    isAnalyzing = false;
    analysisComplete = true;
    updateFloatingButtonState();
  }

  if (event.data.type === 'ANALYSIS_RESET') {
    isAnalyzing = false;
    analysisComplete = false;
    updateFloatingButtonState();
  }

  if (event.data.type === 'CLOSE_SIDEBAR') {
    closeSidebar();
    // Show floating button after closing sidebar
    setTimeout(() => {
      if (!isSidebarOpen) {
        createFloatingButton();
      }
    }, 300);
  }

  if (event.data.type === 'GET_TRANSCRIPT') {
    try {
      const transcript = await extractTranscript();
      const iframe = sidebar?.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'TRANSCRIPT_RESULT',
          success: true,
          transcript: transcript
        }, '*');
      }
    } catch (error) {
      const iframe = sidebar?.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'TRANSCRIPT_RESULT',
          success: false,
          error: error.message
        }, '*');
      }
    }
  }
});

// Extract transcript from YouTube's DOM
async function extractTranscript() {
  // Check if transcript panel is already open
  let transcriptPanel = document.querySelector('ytd-transcript-segment-list-renderer');

  if (!transcriptPanel) {
    // Need to open the transcript panel
    await openTranscriptPanel();

    // Wait for transcript to load
    await waitForElement('ytd-transcript-segment-list-renderer', 10000);
    transcriptPanel = document.querySelector('ytd-transcript-segment-list-renderer');
  }

  if (!transcriptPanel) {
    throw new Error('Could not open transcript panel. This video may not have captions available.');
  }

  // Extract all transcript segments
  const segments = document.querySelectorAll('ytd-transcript-segment-renderer');

  if (segments.length === 0) {
    throw new Error('No transcript segments found. This video may not have captions.');
  }

  const transcriptParts = [];
  segments.forEach(segment => {
    const textElement = segment.querySelector('.segment-text');
    if (textElement) {
      transcriptParts.push(textElement.textContent.trim());
    }
  });

  const fullTranscript = transcriptParts.join(' ').replace(/\s+/g, ' ').trim();

  if (fullTranscript.length === 0) {
    throw new Error('Transcript is empty.');
  }

  return fullTranscript;
}

// Open the transcript panel
async function openTranscriptPanel() {
  // First, expand the description if needed
  const moreButton = document.querySelector('#expand, tp-yt-paper-button#expand');
  if (moreButton) {
    moreButton.click();
    await sleep(500);
  }

  // Look for "Show transcript" button
  const showTranscriptButton = findShowTranscriptButton();

  if (showTranscriptButton) {
    showTranscriptButton.click();
    await sleep(1000);
    return;
  }

  // Alternative: Try the engagement panel button in the actions bar
  const transcriptButtonAlt = document.querySelector('button[aria-label*="transcript" i], button[aria-label*="Transcript" i]');
  if (transcriptButtonAlt) {
    transcriptButtonAlt.click();
    await sleep(1000);
    return;
  }

  // Try clicking the ... menu and looking for transcript option
  const menuButton = document.querySelector('#button-shape button, ytd-menu-renderer yt-button-shape button');
  if (menuButton) {
    menuButton.click();
    await sleep(500);

    // Look for transcript option in menu
    const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item');
    for (const item of menuItems) {
      if (item.textContent.toLowerCase().includes('transcript')) {
        item.click();
        await sleep(1000);
        return;
      }
    }
  }

  throw new Error('Could not find "Show transcript" button. Please manually click "Show transcript" under the video description.');
}

// Find the "Show transcript" button
function findShowTranscriptButton() {
  // Look in description area
  const buttons = document.querySelectorAll('ytd-video-description-transcript-section-renderer button, #description button, ytd-structured-description-content-renderer button');
  for (const btn of buttons) {
    if (btn.textContent.toLowerCase().includes('transcript')) {
      return btn;
    }
  }

  // Look for any element with transcript in text
  const allButtons = document.querySelectorAll('button, yt-button-shape, tp-yt-paper-button');
  for (const btn of allButtons) {
    if (btn.textContent.toLowerCase().includes('show transcript')) {
      return btn;
    }
  }

  return null;
}

// Wait for an element to appear
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
