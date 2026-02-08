/**
 * Content Detector - Lightweight script that runs on all pages
 * Detects content type and triggers the appropriate extractor
 *
 * Content types:
 * - youtube_video: YouTube video page with /watch?v= URL
 * - video_with_captions: Page with <video> + <track> subtitle elements
 * - article: Page with <article> tag, og:type=article meta, or article-like structure
 * - selected_text: Triggered via context menu (handled by background.js)
 * - webpage: Fallback for any other page with meaningful text
 */

// State
let lastUrl = location.href;
let detectionDone = false;

/**
 * Detect the content type of the current page
 * @returns {string|null} - Content type or null if page should be skipped
 */
function detectContentType() {
  const hostname = location.hostname;
  const pathname = location.pathname;
  const url = location.href;

  // YouTube video detection
  if ((hostname.includes('youtube.com') || hostname.includes('youtu.be')) &&
      (new URLSearchParams(location.search).has('v') || pathname.startsWith('/watch'))) {
    return 'youtube_video';
  }

  // Skip non-content pages (search engines, social feeds, etc.)
  if (isNonContentPage()) {
    return null;
  }

  // Video with captions detection
  const videos = document.querySelectorAll('video');
  for (const video of videos) {
    const tracks = video.querySelectorAll('track[kind="captions"], track[kind="subtitles"]');
    if (tracks.length > 0) {
      return 'video_with_captions';
    }
  }

  // Article detection
  if (isArticlePage()) {
    return 'article';
  }

  // Webpage fallback - only if there's meaningful text content
  if (hasSubstantialContent()) {
    return 'webpage';
  }

  return null;
}

/**
 * Check if the page is a non-content page that should be skipped
 * @returns {boolean}
 */
function isNonContentPage() {
  const hostname = location.hostname;
  const skipHosts = [
    'google.com', 'bing.com', 'duckduckgo.com', // Search engines
    'mail.google.com', 'outlook.live.com', // Email
    'docs.google.com', 'sheets.google.com', // Google Workspace
    'drive.google.com',
    'chrome://', 'about:', 'chrome-extension://', // Browser pages
    'localhost', '127.0.0.1' // Local development
  ];

  for (const host of skipHosts) {
    if (hostname.includes(host) || location.href.startsWith(host)) {
      return true;
    }
  }

  // Skip if page is mostly a web app (few text nodes relative to elements)
  return false;
}

/**
 * Check if the page is an article
 * @returns {boolean}
 */
function isArticlePage() {
  // Check for <article> element
  if (document.querySelector('article')) {
    return true;
  }

  // Check for og:type article meta tag
  const ogType = document.querySelector('meta[property="og:type"]');
  if (ogType && ogType.content === 'article') {
    return true;
  }

  // Check for common article indicators
  const hasAuthor = !!document.querySelector(
    'meta[name="author"], meta[property="article:author"], [rel="author"], .author, .byline'
  );
  const hasPublishDate = !!document.querySelector(
    'meta[property="article:published_time"], time[datetime], .publish-date, .date'
  );

  // If has both author and publish date, likely an article
  if (hasAuthor && hasPublishDate) {
    return true;
  }

  return false;
}

/**
 * Check if page has substantial text content worth summarizing
 * @returns {boolean}
 */
function hasSubstantialContent() {
  const body = document.body;
  if (!body) return false;

  // Quick check: get visible text length (rough estimate)
  const text = body.innerText || '';
  // At least 500 characters of text to be worth summarizing
  return text.length > 500;
}

/**
 * Run detection and show UI if appropriate
 */
function runDetection() {
  if (detectionDone) return;

  const contentType = detectContentType();

  if (!contentType) return;

  detectionDone = true;

  // Store content type for use by base-extractor
  window.__contentSummaryType = contentType;

  // For YouTube, eagerly load the YouTube extractor and gather metadata
  if (contentType === 'youtube_video') {
    loadYouTubeExtractor();
  } else {
    // For non-YouTube content, store basic page info
    window.__contentSummaryInfo = {
      title: getPageTitle(),
      description: getPageDescription(),
      author: getPageAuthor(),
      siteName: getSiteName(),
      publishDate: getPublishDate(),
      links: []
    };

    // Show popup banner after a short delay
    setTimeout(() => {
      if (window.__baseExtractor) {
        window.__baseExtractor.createPopupBanner();
      }
    }, 1500);
  }
}

/**
 * Load YouTube extractor and set up YouTube-specific behavior
 */
function loadYouTubeExtractor() {
  // YouTube extractor is loaded as a content script, so it should already be available
  // But we wait for it to initialize
  const waitForExtractor = () => {
    if (window.__youtubeExtractor) {
      const metadata = window.__youtubeExtractor.gatherMetadata();
      if (metadata) {
        window.__contentSummaryInfo = metadata;
      }

      // Show popup banner
      setTimeout(() => {
        if (window.__baseExtractor) {
          window.__baseExtractor.createPopupBanner();
        }
      }, 1500);
    } else {
      // Retry briefly
      setTimeout(waitForExtractor, 100);
    }
  };

  waitForExtractor();
}

/**
 * Get page title from meta tags or document title
 * @returns {string}
 */
function getPageTitle() {
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle && ogTitle.content) return ogTitle.content;

  const twitterTitle = document.querySelector('meta[name="twitter:title"]');
  if (twitterTitle && twitterTitle.content) return twitterTitle.content;

  return document.title || 'Untitled';
}

/**
 * Get page description from meta tags
 * @returns {string}
 */
function getPageDescription() {
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc && ogDesc.content) return ogDesc.content;

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && metaDesc.content) return metaDesc.content;

  return '';
}

/**
 * Get page author from meta tags
 * @returns {string|null}
 */
function getPageAuthor() {
  const authorMeta = document.querySelector('meta[name="author"]');
  if (authorMeta && authorMeta.content) return authorMeta.content;

  const articleAuthor = document.querySelector('meta[property="article:author"]');
  if (articleAuthor && articleAuthor.content) return articleAuthor.content;

  const byline = document.querySelector('.author, .byline, [rel="author"]');
  if (byline && byline.textContent.trim()) return byline.textContent.trim();

  return null;
}

/**
 * Get site name from meta tags
 * @returns {string|null}
 */
function getSiteName() {
  const ogSite = document.querySelector('meta[property="og:site_name"]');
  if (ogSite && ogSite.content) return ogSite.content;

  return location.hostname.replace('www.', '');
}

/**
 * Get publish date from meta tags
 * @returns {string|null}
 */
function getPublishDate() {
  const articleDate = document.querySelector('meta[property="article:published_time"]');
  if (articleDate && articleDate.content) return articleDate.content;

  const timeEl = document.querySelector('time[datetime]');
  if (timeEl && timeEl.getAttribute('datetime')) return timeEl.getAttribute('datetime');

  return null;
}

// Handle URL changes (SPAs like YouTube)
function onUrlChange() {
  const contentType = window.__contentSummaryType;

  // Clean up UI
  if (window.__baseExtractor) {
    window.__baseExtractor.cleanupUI();
  }

  // Reset detection
  detectionDone = false;
  window.__contentSummaryType = null;
  window.__contentSummaryInfo = {};

  // For YouTube, reset banner dismissed state for new videos
  if (contentType === 'youtube_video') {
    const urlParams = new URLSearchParams(location.search);
    const newVideoId = urlParams.get('v');
    // Only reset if it's a different video
    if (newVideoId) {
      window.__baseExtractor.bannerDismissedForUrl = null;
    }
  }

  // Re-detect after page settles
  setTimeout(runDetection, 1000);
}

// URL change detection via MutationObserver
const urlObserver = new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    onUrlChange();
  }
});

// YouTube-specific navigation events
document.addEventListener('yt-navigate-finish', () => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    onUrlChange();
  }
});

// Back/forward navigation
window.addEventListener('popstate', () => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    onUrlChange();
  }
});

// Initialize
function init() {
  // Wait for base-extractor to be loaded
  const waitForBase = () => {
    if (window.__baseExtractor) {
      runDetection();

      // Observe URL changes
      if (document.body) {
        urlObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
    } else {
      setTimeout(waitForBase, 50);
    }
  };

  waitForBase();
}

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
