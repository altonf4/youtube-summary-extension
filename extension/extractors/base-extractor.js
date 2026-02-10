/**
 * Base Extractor - Shared functionality for all content extractors
 * Handles: popup banner, floating button, sidebar injection, styles, navigation
 */

// Shared state
let sidebar = null;
let popupBanner = null;
let floatingButton = null;
let isSidebarOpen = false;
let bannerDismissedForUrl = null;
let isAnalyzing = false;
let analysisComplete = false;

/**
 * Get the current content type from the detector
 * @returns {string} - Content type identifier
 */
function getContentType() {
  return window.__contentSummaryType || 'unknown';
}

/**
 * Get content info stored by the detector
 * @returns {Object} - Content info object
 */
function getContentInfo() {
  return window.__contentSummaryInfo || {};
}

// Inject popup banner and floating button styles
function injectStyles() {
  if (document.getElementById('content-summary-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'content-summary-styles';
  styles.textContent = `
    #content-summary-popup {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 10001;
      background: white;
      border-radius: 50px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05);
      display: flex;
      align-items: center;
      padding: 6px 6px 6px 14px;
      gap: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: toastSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes toastSlideUp {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    #content-summary-popup.hiding {
      animation: toastSlideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes toastSlideDown {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(12px); }
    }

    #content-summary-float-btn {
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
      animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      transition: transform 0.15s, box-shadow 0.15s;
      opacity: 1;
    }

    #content-summary-float-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 28px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
      cursor: grab;
    }

    #content-summary-float-btn:active {
      transform: scale(0.95);
      cursor: grabbing;
    }

    #content-summary-float-btn svg {
      width: 22px;
      height: 22px;
      color: #374151;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }

    #content-summary-float-btn.hiding {
      animation: fadeOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes fadeOut {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(0.8); }
    }

    #content-summary-float-btn.analyzing {
      box-shadow: 0 4px 24px rgba(102, 126, 234, 0.3), 0 0 0 1px rgba(102, 126, 234, 0.2);
    }

    #content-summary-float-btn.analyzing::before {
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

    #content-summary-float-btn.analyzing svg {
      color: #667eea;
    }

    #content-summary-float-btn.complete {
      box-shadow: 0 4px 24px rgba(16, 185, 129, 0.3), 0 0 0 1px rgba(16, 185, 129, 0.2);
    }

    #content-summary-float-btn.complete svg {
      color: #10b981;
    }

    #content-summary-float-btn .complete-badge {
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

    #content-summary-float-btn .complete-badge svg {
      width: 12px;
      height: 12px;
      color: white;
    }

    @keyframes popIn {
      from { transform: scale(0); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    #content-summary-popup .toast-icon {
      width: 18px;
      height: 18px;
      color: #374151;
      flex-shrink: 0;
    }

    #content-summary-popup .toast-label {
      font-size: 13px;
      font-weight: 500;
      color: #374151;
      white-space: nowrap;
      cursor: pointer;
      transition: color 0.15s;
    }

    #content-summary-popup .toast-label:hover {
      color: #111827;
    }

    #content-summary-popup .popup-close {
      background: none;
      border: none;
      width: 28px;
      height: 28px;
      padding: 0;
      cursor: pointer;
      color: #9ca3af;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      flex-shrink: 0;
    }

    #content-summary-popup .popup-close:hover {
      background: #f3f4f6;
      color: #374151;
    }

    #content-summary-sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: 400px;
      height: 100vh;
      z-index: 10000;
      transform: translateX(100%);
      transition: transform 0.3s ease;
    }

    #content-summary-sidebar iframe {
      width: 100%;
      height: 100%;
      box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
    }
  `;
  document.head.appendChild(styles);
}

/**
 * Get display text for the popup based on content type
 * @param {string} contentType
 * @returns {{title: string, subtitle: string, buttonText: string}}
 */
function getPopupText(contentType) {
  switch (contentType) {
    case 'youtube_video':
      return {
        title: 'YouTube Summary Available',
        subtitle: 'Generate AI summary & save to Notes',
        buttonText: 'Summarize'
      };
    case 'article':
      return {
        title: 'Article Summary Available',
        subtitle: 'Generate AI summary of this article',
        buttonText: 'Summarize'
      };
    case 'video_with_captions':
      return {
        title: 'Video Summary Available',
        subtitle: 'Generate AI summary from captions',
        buttonText: 'Summarize'
      };
    case 'webpage':
      return {
        title: 'Page Summary Available',
        subtitle: 'Generate AI summary of this page',
        buttonText: 'Summarize'
      };
    default:
      return {
        title: 'AI Summary Available',
        subtitle: 'Generate AI summary of this content',
        buttonText: 'Summarize'
      };
  }
}

// Create popup banner (compact toast)
async function createPopupBanner() {
  const contentType = getContentType();
  const currentUrl = location.href;
  if (popupBanner || !contentType || contentType === 'unknown' || bannerDismissedForUrl === currentUrl) return;

  // Check if already dismissed this browser session
  try {
    const session = await chrome.storage.session.get(['toastDismissed']);
    if (session.toastDismissed) {
      // Session-dismissed: skip toast, show floating button directly
      createFloatingButton();
      return;
    }
  } catch {
    // chrome.storage.session not available, continue normally
  }

  injectStyles();

  const text = getPopupText(contentType);

  popupBanner = document.createElement('div');
  popupBanner.id = 'content-summary-popup';
  popupBanner.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
    </svg>
    <span class="toast-label">${text.buttonText}</span>
    <button class="popup-close" title="Dismiss">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  // Clicking the icon or label opens sidebar
  const openAction = () => {
    hidePopupBanner(false);
    openSidebar();
  };
  popupBanner.querySelector('.toast-icon').style.cursor = 'pointer';
  popupBanner.querySelector('.toast-icon').onclick = openAction;
  popupBanner.querySelector('.toast-label').onclick = openAction;

  popupBanner.querySelector('.popup-close').onclick = () => {
    bannerDismissedForUrl = currentUrl;
    // Dismiss for entire browser session
    try { chrome.storage.session.set({ toastDismissed: true }); } catch {}
    hidePopupBanner(true);
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
  floatingButton.id = 'content-summary-float-btn';
  floatingButton.title = 'AI Summary (drag to reposition)';
  floatingButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
    </svg>
  `;

  updateFloatingButtonState();

  const savedPos = getSavedButtonPosition();
  if (savedPos) {
    const savedTop = parseFloat(savedPos.top);
    const savedLeft = parseFloat(savedPos.left);
    const btnSize = 44;

    if (!isNaN(savedTop) && !isNaN(savedLeft) &&
        savedTop >= 0 && savedTop <= window.innerHeight - btnSize &&
        savedLeft >= 0 && savedLeft <= window.innerWidth - btnSize) {
      floatingButton.style.top = savedPos.top;
      floatingButton.style.right = 'auto';
      floatingButton.style.left = savedPos.left;
    } else {
      localStorage.removeItem('content-summary-btn-position');
    }
  }

  floatingButton.style.setProperty('opacity', '1', 'important');
  floatingButton.style.setProperty('animation', 'none', 'important');

  makeButtonDraggable(floatingButton);

  document.body.appendChild(floatingButton);
}

// Update floating button visual state
function updateFloatingButtonState() {
  if (!floatingButton) return;

  floatingButton.classList.remove('analyzing', 'complete');

  const existingBadge = floatingButton.querySelector('.complete-badge');
  if (existingBadge) existingBadge.remove();

  if (isAnalyzing) {
    floatingButton.classList.add('analyzing');
    floatingButton.title = 'Analyzing content...';
  } else if (analysisComplete) {
    floatingButton.classList.add('complete');
    floatingButton.title = 'Summary ready! Click to view';
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
    const saved = localStorage.getItem('content-summary-btn-position');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

// Save button position to localStorage
function saveButtonPosition(top, left) {
  try {
    localStorage.setItem('content-summary-btn-position', JSON.stringify({ top, left }));
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

    const rect = btn.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;

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

    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      hasMoved = true;
    }

    let newLeft = startLeft + deltaX;
    let newTop = startTop + deltaY;

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

    if (hasMoved) {
      saveButtonPosition(btn.style.top, btn.style.left);
    }
  });

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
  sidebar.id = 'content-summary-sidebar';
  sidebar.innerHTML = `
    <iframe
      src="${chrome.runtime.getURL('sidebar/sidebar.html')}"
      frameborder="0"
      allow="clipboard-write"
    ></iframe>
  `;

  document.body.appendChild(sidebar);

  const iframe = sidebar.querySelector('iframe');
  iframe.onload = () => {
    sendContentInfoToSidebar();
  };
}

// Open sidebar
function openSidebar() {
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

/**
 * Send content information to sidebar
 * Adapts the message based on content type
 */
function sendContentInfoToSidebar() {
  const contentType = getContentType();
  const info = getContentInfo();

  if (!contentType || contentType === 'unknown') return;

  const iframe = sidebar?.querySelector('iframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: 'CONTENT_INFO',
      contentType: contentType,
      // YouTube-specific fields
      videoId: info.videoId || null,
      // Common fields
      title: info.title || document.title,
      url: window.location.href,
      description: info.description || '',
      links: info.links || [],
      // Article-specific fields
      author: info.author || null,
      siteName: info.siteName || null,
      publishDate: info.publishDate || null,
      // For backward compatibility, also send as VIDEO_INFO
    }, '*');

    // Also send VIDEO_INFO for backward compatibility with existing sidebar code
    if (contentType === 'youtube_video') {
      iframe.contentWindow.postMessage({
        type: 'VIDEO_INFO',
        videoId: info.videoId,
        title: info.title || document.title,
        url: window.location.href,
        description: info.description || '',
        links: info.links || []
      }, '*');
    }
  }
}

// Clean up UI elements
function cleanupUI() {
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

  isAnalyzing = false;
  analysisComplete = false;
}

// Listen for progress updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROGRESS_UPDATE') {
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

    const iframe = sidebar?.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'PROGRESS_UPDATE',
        progress: message.progress
      }, '*');
    }
  }

  // Handle context menu triggered summarization
  if (message.type === 'SUMMARIZE_SELECTION') {
    // Store selection data
    window.__contentSummaryType = 'selected_text';
    window.__contentSummaryInfo = {
      title: document.title,
      selectedText: message.selectedText || window.getSelection().toString()
    };
    openSidebar();
  }
});

// Listen for messages from sidebar
window.addEventListener('message', async (event) => {
  if (event.data.type === 'REQUEST_VIDEO_INFO' || event.data.type === 'REQUEST_CONTENT_INFO') {
    sendContentInfoToSidebar();
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
    setTimeout(() => {
      if (!isSidebarOpen) {
        createFloatingButton();
      }
    }, 300);
  }

  // Delegate content extraction to the appropriate extractor
  if (event.data.type === 'GET_TRANSCRIPT' || event.data.type === 'GET_CONTENT') {
    try {
      const contentType = getContentType();
      let result;

      if (contentType === 'youtube_video' && typeof window.__youtubeExtractor !== 'undefined') {
        result = await window.__youtubeExtractor.extract();
      } else if (contentType === 'article' && typeof window.__articleExtractor !== 'undefined') {
        result = await window.__articleExtractor.extract();
      } else if (contentType === 'video_with_captions' && typeof window.__videoExtractor !== 'undefined') {
        result = await window.__videoExtractor.extract();
      } else if (contentType === 'selected_text' && typeof window.__selectionExtractor !== 'undefined') {
        result = await window.__selectionExtractor.extract();
      } else if (contentType === 'webpage' && typeof window.__webpageExtractor !== 'undefined') {
        result = await window.__webpageExtractor.extract();
      } else if (contentType === 'youtube_video') {
        // Fallback: load YouTube extractor dynamically
        await loadExtractor('youtube');
        if (typeof window.__youtubeExtractor !== 'undefined') {
          result = await window.__youtubeExtractor.extract();
        } else {
          throw new Error('YouTube extractor failed to load');
        }
      } else {
        throw new Error(`No extractor available for content type: ${contentType}`);
      }

      const iframe = sidebar?.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'TRANSCRIPT_RESULT',
          contentType: contentType,
          ...result
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

/**
 * Dynamically load an extractor script
 * @param {string} type - Extractor type: 'youtube', 'article', 'webpage', 'video', 'selection'
 */
async function loadExtractor(type) {
  const scriptMap = {
    youtube: 'extractors/youtube-extractor.js',
    article: 'extractors/article-extractor.js',
    webpage: 'extractors/webpage-extractor.js',
    video: 'extractors/video-extractor.js',
    selection: 'extractors/selection-extractor.js'
  };

  const scriptPath = scriptMap[type];
  if (!scriptPath) return;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(scriptPath);
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${type} extractor`));
    document.head.appendChild(script);
  });
}

// Export for use by content-detector and extractors
window.__baseExtractor = {
  createPopupBanner,
  hidePopupBanner,
  createFloatingButton,
  hideFloatingButton,
  openSidebar,
  closeSidebar,
  cleanupUI,
  updateFloatingButtonState,
  sendContentInfoToSidebar,
  loadExtractor,
  getContentType,
  getContentInfo,
  get isSidebarOpen() { return isSidebarOpen; },
  get isAnalyzing() { return isAnalyzing; },
  set isAnalyzing(val) { isAnalyzing = val; },
  get analysisComplete() { return analysisComplete; },
  set analysisComplete(val) { analysisComplete = val; },
  set bannerDismissedForUrl(val) { bannerDismissedForUrl = val; }
};
