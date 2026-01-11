// Background Service Worker
// Handles native messaging communication

const NATIVE_HOST_NAME = 'com.youtube.summary';

let nativePort = null;
let pendingRequests = new Map();
let requestIdCounter = 0;

// Connect to native messaging host
function connectNativeHost() {
  if (nativePort) {
    return nativePort;
  }

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    nativePort.onMessage.addListener((message) => {
      handleNativeMessage(message);
    });

    nativePort.onDisconnect.addListener(() => {
      console.log('Native host disconnected');
      if (chrome.runtime.lastError) {
        console.error('Disconnect error:', chrome.runtime.lastError.message);
      }
      nativePort = null;

      // Reject all pending requests
      pendingRequests.forEach((resolve, requestId) => {
        resolve({
          success: false,
          error: 'Native host disconnected'
        });
      });
      pendingRequests.clear();
    });

    console.log('Connected to native host');
    return nativePort;
  } catch (error) {
    console.error('Failed to connect to native host:', error);
    nativePort = null;
    return null;
  }
}

// Send message to native host
function sendToNativeHost(message) {
  return new Promise((resolve) => {
    const port = connectNativeHost();

    if (!port) {
      resolve({
        success: false,
        error: 'Could not connect to native messaging host. Please ensure the extension is properly installed.'
      });
      return;
    }

    const requestId = requestIdCounter++;
    message.requestId = requestId;

    // Store the resolver
    pendingRequests.set(requestId, resolve);

    // Send message
    try {
      port.postMessage(message);

      // Timeout after 2 minutes
      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          resolve({
            success: false,
            error: 'Request timeout - Claude Code took too long to respond'
          });
        }
      }, 120000);
    } catch (error) {
      pendingRequests.delete(requestId);
      resolve({
        success: false,
        error: `Failed to send message: ${error.message}`
      });
    }
  });
}

// Store progress callbacks for streaming updates
let progressCallbacks = new Map();

// Handle message from native host
function handleNativeMessage(message) {
  const { requestId, type, ...response } = message;

  // Handle progress updates (don't resolve the promise, just forward)
  if (type === 'progress' && requestId !== undefined) {
    const callback = progressCallbacks.get(requestId);
    if (callback) {
      callback(response.progress);
    }
    return;
  }

  // Handle final response
  if (requestId !== undefined && pendingRequests.has(requestId)) {
    const resolve = pendingRequests.get(requestId);
    pendingRequests.delete(requestId);
    progressCallbacks.delete(requestId);
    resolve(response);
  }
}

// Listen for messages from sidebar
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  // Handle async response
  (async () => {
    try {
      // Set up progress callback if this is a generateSummary request
      if (request.action === 'generateSummary' && tabId) {
        const requestId = requestIdCounter; // Will be assigned in sendToNativeHost

        // Register progress callback before sending
        const progressCallback = (progress) => {
          // Send progress to the tab
          chrome.tabs.sendMessage(tabId, {
            type: 'PROGRESS_UPDATE',
            progress: progress
          }).catch(() => {}); // Ignore errors if tab closed
        };

        // Store callback with next requestId
        progressCallbacks.set(requestIdCounter, progressCallback);
      }

      const response = await sendToNativeHost(request);
      sendResponse(response);
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  })();

  // Return true to indicate async response
  return true;
});

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube Summary Extension installed');
});

// Keep service worker alive by connecting on startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension started');
});
