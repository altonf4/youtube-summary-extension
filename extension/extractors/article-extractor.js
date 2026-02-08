/**
 * Article Extractor
 * Extracts clean article text from web pages.
 * Uses Mozilla's Readability.js when available, falling back to DOM heuristics.
 */

(function() {
  /**
   * Extract article content from the page
   * Strategy order:
   * 1. Mozilla Readability.js (if loaded via extension/lib/readability.js)
   * 2. DOM heuristics fallback (<article>, main content selectors, body cleanup)
   * @returns {Promise<Object>} - Extraction result with transcript and metadata
   */
  async function extract() {
    // Try Readability first, then fall back to heuristics
    const result = extractWithReadability() || extractWithHeuristics();

    if (!result || !result.text || result.text.length < 100) {
      throw new Error('Could not extract article content from this page.');
    }

    return {
      success: true,
      transcript: result.text, // Use 'transcript' field for compatibility with existing flow
      title: result.title || document.title,
      byline: result.byline || '',
      siteName: result.siteName || '',
      excerpt: result.excerpt || '',
      creatorComments: [],
      viewerComments: []
    };
  }

  /**
   * Extract article content using Mozilla's Readability.js
   * Readability must be loaded as a global (window.Readability) before this runs.
   * @returns {Object|null} - Extracted content or null if Readability is unavailable/fails
   */
  function extractWithReadability() {
    if (typeof Readability === 'undefined') {
      return null;
    }

    try {
      var documentClone = document.cloneNode(true);
      var reader = new Readability(documentClone);
      var article = reader.parse();

      if (!article || !article.textContent) {
        return null;
      }

      return {
        text: cleanText(article.textContent),
        title: article.title || '',
        byline: article.byline || '',
        siteName: article.siteName || '',
        excerpt: article.excerpt || ''
      };
    } catch (e) {
      // Readability failed, fall back to heuristics
      console.warn('Readability.js extraction failed, using fallback:', e.message);
      return null;
    }
  }

  /**
   * Extract article content using DOM heuristics (fallback)
   * Uses progressively simpler strategies:
   * 1. <article> element content
   * 2. Main content area selectors
   * 3. Body text with nav/footer/sidebar cleanup
   * @returns {Object|null} - Extracted content or null
   */
  function extractWithHeuristics() {
    var text = extractArticleText();
    if (!text) {
      return null;
    }
    return {
      text: text,
      title: document.title,
      byline: '',
      siteName: '',
      excerpt: ''
    };
  }

  /**
   * Extract article text using DOM heuristics
   * @returns {string} - Extracted text
   */
  function extractArticleText() {
    // Strategy 1: Use <article> element
    var article = document.querySelector('article');
    if (article) {
      return cleanText(article.innerText);
    }

    // Strategy 2: Use common main content selectors
    var mainSelectors = [
      'main',
      '[role="main"]',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.content-body',
      '.story-body',
      '#article-body',
      '.article-body',
      '.post-body'
    ];

    for (var i = 0; i < mainSelectors.length; i++) {
      var el = document.querySelector(mainSelectors[i]);
      if (el && el.innerText.length > 200) {
        return cleanText(el.innerText);
      }
    }

    // Strategy 3: Body text with cleanup (remove nav, footer, sidebar, ads)
    var body = document.body.cloneNode(true);
    var removeSelectors = [
      'nav', 'header', 'footer', 'aside',
      '.sidebar', '.navigation', '.menu', '.ad', '.advertisement',
      '.social-share', '.comments', '.related-posts',
      'script', 'style', 'noscript', 'iframe'
    ];

    removeSelectors.forEach(function(selector) {
      body.querySelectorAll(selector).forEach(function(el) { el.remove(); });
    });

    return cleanText(body.innerText);
  }

  /**
   * Clean extracted text by collapsing whitespace
   * @param {string} text - Raw text to clean
   * @returns {string} - Cleaned text
   */
  function cleanText(text) {
    return text
      .replace(/\n{3,}/g, '\n\n')  // Collapse multiple newlines
      .replace(/\t+/g, ' ')         // Replace tabs with spaces
      .replace(/ {2,}/g, ' ')       // Collapse multiple spaces
      .trim();
  }

  window.__articleExtractor = {
    extract,
    extractArticleText,
    extractWithReadability
  };
})();
