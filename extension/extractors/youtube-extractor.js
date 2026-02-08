/**
 * YouTube Extractor
 * Handles transcript extraction, comment extraction, and YouTube-specific metadata
 * Extracted from the original content.js
 */

(function() {
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
    const descriptionContainer = document.querySelector('#description-inner, ytd-text-inline-expander #plain-snippet-text, #description .content');

    if (descriptionContainer) {
      return descriptionContainer.innerText || descriptionContainer.textContent || '';
    }

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

        if (href && !href.includes('youtube.com/hashtag') &&
            !href.startsWith('https://www.youtube.com/watch') &&
            !href.includes('/channel/') &&
            !href.includes('/c/') &&
            text.length > 0) {
          links.push({ url: href, text: text });
        }
      });
    }

    return links;
  }

  /**
   * Extract top comments from the video
   * Prioritizes creator comments/replies
   * @param {number} maxComments - Maximum number of comments to extract
   * @returns {Promise<Object>} - Object with creatorComments and viewerComments arrays
   */
  async function extractTopComments(maxComments = 20) {
    const creatorComments = [];
    const viewerComments = [];

    try {
      let commentSection = document.querySelector('ytd-comments#comments');
      if (!commentSection) {
        return { creatorComments: [], viewerComments: [] };
      }

      const commentThreads = document.querySelectorAll('ytd-comment-thread-renderer');
      if (commentThreads.length === 0) {
        return { creatorComments: [], viewerComments: [] };
      }

      commentThreads.forEach(thread => {
        try {
          processComment(thread.querySelector('#comment'), false);
          const replies = thread.querySelectorAll('ytd-comment-renderer');
          replies.forEach(reply => processComment(reply, true));
        } catch (e) {
          // Skip problematic comments
        }
      });

      function processComment(commentEl, isReply) {
        if (!commentEl) return;

        const body = commentEl.querySelector('#body');
        if (!body) return;

        const textElement = body.querySelector('#content-text');
        const text = textElement ? textElement.textContent.trim() : '';

        if (!text || text.length < 10) return;

        const authorBadge = commentEl.querySelector('#author-comment-badge, ytd-author-comment-badge-renderer');
        const isCreator = !!authorBadge;

        const likeElement = body.querySelector('#vote-count-middle');
        let likes = 0;
        if (likeElement) {
          const likeText = likeElement.textContent.trim();
          if (likeText) {
            if (likeText.includes('K')) {
              likes = parseFloat(likeText) * 1000;
            } else if (likeText.includes('M')) {
              likes = parseFloat(likeText) * 1000000;
            } else {
              likes = parseInt(likeText, 10) || 0;
            }
          }
        }

        const authorElement = body.querySelector('#author-text span, #author-text');
        const author = authorElement ? authorElement.textContent.trim() : 'Unknown';

        const comment = {
          text: text,
          likes: likes,
          author: author,
          isReply: isReply
        };

        if (isCreator) {
          creatorComments.push(comment);
        } else {
          viewerComments.push(comment);
        }
      }

      viewerComments.sort((a, b) => b.likes - a.likes);

      return {
        creatorComments: creatorComments.slice(0, 10),
        viewerComments: viewerComments.slice(0, maxComments)
      };

    } catch (error) {
      console.error('Error extracting comments:', error);
      return { creatorComments: [], viewerComments: [] };
    }
  }

  // Extract transcript from YouTube's DOM
  async function extractTranscript() {
    let transcriptPanel = document.querySelector('ytd-transcript-segment-list-renderer');

    if (!transcriptPanel) {
      await openTranscriptPanel();
      await waitForElement('ytd-transcript-segment-list-renderer', 10000);
      transcriptPanel = document.querySelector('ytd-transcript-segment-list-renderer');
    }

    if (!transcriptPanel) {
      throw new Error('Could not open transcript panel. This video may not have captions available.');
    }

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
    const scrollY = window.scrollY;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlPosition = document.documentElement.style.position;
    const originalHtmlTop = document.documentElement.style.top;
    const originalHtmlWidth = document.documentElement.style.width;

    document.documentElement.style.position = 'fixed';
    document.documentElement.style.top = `-${scrollY}px`;
    document.documentElement.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const unlockScroll = () => {
      document.documentElement.style.position = originalHtmlPosition;
      document.documentElement.style.top = originalHtmlTop;
      document.documentElement.style.width = originalHtmlWidth;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
      window.scrollTo(0, scrollY);
    };

    try {
      const moreButton = document.querySelector('#expand, tp-yt-paper-button#expand');
      if (moreButton) {
        moreButton.click();
        await sleep(500);
      }

      const showTranscriptButton = findShowTranscriptButton();

      if (showTranscriptButton) {
        showTranscriptButton.click();
        await sleep(1000);
        unlockScroll();
        return;
      }

      const transcriptButtonAlt = document.querySelector('button[aria-label*="transcript" i], button[aria-label*="Transcript" i]');
      if (transcriptButtonAlt) {
        transcriptButtonAlt.click();
        await sleep(1000);
        unlockScroll();
        return;
      }

      const menuButton = document.querySelector('#button-shape button, ytd-menu-renderer yt-button-shape button');
      if (menuButton) {
        menuButton.click();
        await sleep(500);

        const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item');
        for (const item of menuItems) {
          if (item.textContent.toLowerCase().includes('transcript')) {
            item.click();
            await sleep(1000);
            unlockScroll();
            return;
          }
        }
      }

      unlockScroll();
      throw new Error('Could not find "Show transcript" button. Please manually click "Show transcript" under the video description.');
    } catch (error) {
      unlockScroll();
      throw error;
    }
  }

  // Find the "Show transcript" button
  function findShowTranscriptButton() {
    const buttons = document.querySelectorAll('ytd-video-description-transcript-section-renderer button, #description button, ytd-structured-description-content-renderer button');
    for (const btn of buttons) {
      if (btn.textContent.toLowerCase().includes('transcript')) {
        return btn;
      }
    }

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

  /**
   * Gather YouTube metadata for content info
   * @returns {Object} - YouTube content info
   */
  function gatherMetadata() {
    const videoId = getVideoId();
    if (!videoId) return null;

    return {
      videoId: videoId,
      title: getVideoTitle(),
      description: getVideoDescription(),
      links: getDescriptionLinks()
    };
  }

  /**
   * Main extract function - called by base-extractor when sidebar requests content
   * @returns {Promise<Object>} - Extraction result with transcript and comments
   */
  async function extract() {
    const transcript = await extractTranscript();

    let commentsData = { creatorComments: [], viewerComments: [] };
    try {
      commentsData = await extractTopComments(20);
      console.log(`Extracted ${commentsData.creatorComments.length} creator comments, ${commentsData.viewerComments.length} viewer comments`);
    } catch (commentError) {
      console.log('Could not extract comments:', commentError.message);
    }

    return {
      success: true,
      transcript: transcript,
      creatorComments: commentsData.creatorComments,
      viewerComments: commentsData.viewerComments
    };
  }

  // Export the extractor
  window.__youtubeExtractor = {
    extract,
    gatherMetadata,
    getVideoId,
    getVideoTitle,
    getVideoDescription,
    getDescriptionLinks,
    extractTopComments,
    extractTranscript
  };
})();
