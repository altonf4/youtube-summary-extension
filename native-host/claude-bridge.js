/**
 * Claude Code CLI Bridge
 * Integrates with Claude Code to generate summaries
 */

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const logger = require('./logger');
const anthropicClient = require('./anthropic-client');

/**
 * Generate summary using Claude Code CLI
 * @param {string} videoTitle - YouTube video title
 * @param {string} transcript - Video transcript
 * @param {string} description - Video description
 * @param {Array} descriptionLinks - Links extracted from description
 * @param {Array} creatorComments - Comments/replies from the video creator
 * @param {Array} viewerComments - Top comments from viewers
 * @param {string|null} customInstructions - Custom analysis instructions from user
 * @param {function} onProgress - Progress callback
 * @returns {Promise<Object>} - Summary, key learnings, and relevant links
 */
async function generateSummary(videoTitle, transcript, description = '', descriptionLinks = [], creatorComments = [], viewerComments = [], customInstructions = null, onProgress = () => {}, options = {}) {
  const log = (msg) => logger.log(msg, 'claude-bridge');
  const { apiKey, model, contentType, author, siteName, publishDate, templateSections } = options;

  try {
    onProgress({ stage: 'preparing', message: 'Preparing content...' });

    // Select prompt based on content type
    let prompt;
    if (contentType === 'article' || contentType === 'webpage') {
      prompt = createArticlePrompt(videoTitle, transcript, description, descriptionLinks, customInstructions, { author, siteName, publishDate, contentType, templateSections });
    } else if (contentType === 'selected_text') {
      prompt = createSelectionPrompt(videoTitle, transcript, customInstructions, { templateSections });
    } else {
      // Default: YouTube video or video_with_captions
      prompt = createPrompt(videoTitle, transcript, description, descriptionLinks, creatorComments, viewerComments, customInstructions, { templateSections });
    }
    log(`Prompt length: ${prompt.length} characters (contentType: ${contentType || 'youtube_video'})`);
    log(`Including ${creatorComments?.length || 0} creator comments, ${viewerComments?.length || 0} viewer comments in prompt`);

    // Try direct API first, fall back to CLI
    let response;
    try {
      log('Attempting direct Anthropic API call...');
      response = await anthropicClient.callAnthropicAPI(prompt, {
        apiKey,
        model: model || 'sonnet',
        onProgress
      });
      log(`API response received: ${response.length} characters`);
    } catch (apiErr) {
      log(`API call failed: ${apiErr.message}, falling back to CLI...`);
      onProgress({ stage: 'starting', message: 'Falling back to Claude CLI...' });

      // Fall back to CLI
      const claudeCmd = findClaudeCodeCommand();
      log(`Using Claude command: ${claudeCmd}`);
      response = await callClaudeCode(prompt, onProgress, { model });
      log(`CLI response received: ${response.length} characters`);
    }

    // Parse the response
    onProgress({ stage: 'parsing', message: 'Extracting insights...' });
    const parsed = parseResponse(response, descriptionLinks, templateSections);
    log(`Parsed summary: ${parsed.summary.length} chars, ${parsed.keyLearnings.length} learnings, ${parsed.actionItems.length} action items, ${parsed.relevantLinks.length} links`);

    onProgress({ stage: 'complete', message: 'Done!' });

    return {
      success: true,
      summary: parsed.summary,
      keyLearnings: parsed.keyLearnings,
      actionItems: parsed.actionItems,
      relevantLinks: parsed.relevantLinks
    };

  } catch (error) {
    log(`ERROR: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Default analysis instructions when user hasn't customized
 */
const DEFAULT_INSTRUCTIONS = `Analyze this YouTube video and extract the most valuable insights.

Focus on:
- Main arguments and conclusions
- Actionable advice and recommendations
- Interesting facts or statistics mentioned
- Key concepts explained

Make the summary engaging and the learnings practical.`;

/**
 * Build output format instructions from template sections
 * @param {Array|null} templateSections - Array of section configs from user template
 * @param {Object} context - Context flags: hasCreatorComments, hasLinks, contentLabel
 * @returns {{formatInstructions: string, sectionHeaders: string[]}} - Format string and list of section headers
 */
function buildOutputFormat(templateSections, context = {}) {
  const { hasCreatorComments, hasLinks, contentLabel } = context;

  // If no template sections, return null (use hardcoded default)
  if (!templateSections || templateSections.length === 0) {
    return null;
  }

  const enabledSections = templateSections.filter(s => s.enabled);
  if (enabledSections.length === 0) {
    return null;
  }

  let format = '\nIMPORTANT: You MUST format your response EXACTLY as follows (this format is required for parsing):\n';
  const sectionHeaders = [];

  enabledSections.forEach(section => {
    const header = section.label.toUpperCase();
    sectionHeaders.push(header);

    format += `\n${header}:\n`;

    // Map section IDs to appropriate instructions
    switch (section.id) {
      case 'summary':
        format += `[Write a concise summary - 2-3 paragraphs covering the main points.]\n`;
        break;
      case 'key_learnings':
        format += `- [First key insight or takeaway]\n- [Second key insight]\n- [Continue as appropriate]\n`;
        break;
      case 'action_items':
        format += `- [Specific actionable task - start with a verb like "Try", "Implement", "Research"]\n- [Another concrete next step]\n(If no clear action items, write "No specific action items identified")\n`;
        break;
      case 'creator_additions':
        if (hasCreatorComments) {
          format += `[List valuable insights from creator comments not in the transcript]\n- [Creator insight 1]\n`;
        }
        break;
      case 'relevant_links':
        if (hasLinks) {
          format += `[Review the links above. Include useful resources. Format: link number + reason.]\n- 1. [Why this link is useful]\n`;
        } else {
          format += `(No links provided)\n`;
        }
        break;
      default:
        // Custom section - use format hint
        if (section.format === 'bullets') {
          format += `- [${section.label} item 1]\n- [${section.label} item 2]\n`;
        } else {
          format += `[Write ${section.label.toLowerCase()} content here]\n`;
        }
    }
  });

  const headerList = enabledSections.map(s => `${s.label.toUpperCase()}:`).join(', ');
  format += `\nAlways include these sections with the exact headers shown above: ${headerList}`;

  return { formatInstructions: format, sectionHeaders };
}

/**
 * Create prompt for Claude - wraps user instructions with system format
 * @param {string} videoTitle - Video title
 * @param {string} transcript - Transcript text
 * @param {string} description - Video description
 * @param {Array} descriptionLinks - Links from description
 * @param {Array} creatorComments - Comments/replies from the video creator (high value)
 * @param {Array} viewerComments - Top comments from viewers (use cautiously)
 * @param {string|null} customInstructions - User's custom instructions
 * @param {Object} opts - Options: templateSections
 * @returns {string} - Formatted prompt
 */
function createPrompt(videoTitle, transcript, description = '', descriptionLinks = [], creatorComments = [], viewerComments = [], customInstructions = null, opts = {}) {
  // Truncate transcript if too long (Claude has token limits)
  const maxTranscriptLength = 50000; // ~12,500 tokens
  const truncatedTranscript = transcript.length > maxTranscriptLength
    ? transcript.substring(0, maxTranscriptLength) + '...[truncated]'
    : transcript;

  // Truncate description if too long
  const maxDescLength = 5000;
  const truncatedDescription = description.length > maxDescLength
    ? description.substring(0, maxDescLength) + '...[truncated]'
    : description;

  // Format links for prompt
  const linksSection = descriptionLinks.length > 0
    ? `\n\nLinks from Description:\n${descriptionLinks.map((l, i) => `${i + 1}. ${l.text}: ${l.url}`).join('\n')}`
    : '';

  // Format creator comments (these are high value - from the video creator themselves)
  let creatorSection = '';
  if (creatorComments && creatorComments.length > 0) {
    const validCreatorComments = creatorComments.filter(c => c.text.length >= 15);
    if (validCreatorComments.length > 0) {
      creatorSection = `\n\n**CREATOR COMMENTS/REPLIES** (These are from the video creator - treat as authoritative additions/clarifications to the video content):\n${validCreatorComments.map((c, i) => `${i + 1}. "${c.text}"`).join('\n')}`;
    }
  }

  // Format top viewer comments (use cautiously - may contain jokes/memes)
  let viewerSection = '';
  if (viewerComments && viewerComments.length > 0) {
    // Only include substantive comments with good engagement
    const usefulComments = viewerComments
      .filter(c => c.text.length >= 30 && c.likes >= 10) // Meaningful length and engagement
      .slice(0, 10); // Limit to save tokens

    if (usefulComments.length > 0) {
      viewerSection = `\n\nTop Viewer Comments (for context only - may include jokes/memes, so only use if genuinely insightful):\n${usefulComments.map((c, i) => `${i + 1}. [${c.likes} likes] "${c.text}"`).join('\n')}`;
    }
  }

  // Use custom instructions or default
  const instructions = customInstructions || DEFAULT_INSTRUCTIONS;

  // Determine if we have creator comments to influence output
  const hasCreatorComments = creatorComments && creatorComments.length > 0;

  // Try template-driven output format
  const { templateSections } = opts;
  const templateFormat = buildOutputFormat(templateSections, {
    hasCreatorComments,
    hasLinks: descriptionLinks.length > 0
  });

  // Build prompt
  let prompt = `You are analyzing a YouTube video transcript. Follow these analysis instructions from the user:

---
${instructions}
---

Video Title: ${videoTitle}

${truncatedDescription ? `Video Description:\n${truncatedDescription}` : ''}${linksSection}${creatorSection}${viewerSection}

Transcript:
${truncatedTranscript}
`;

  if (templateFormat) {
    // Template-driven output format
    prompt += templateFormat.formatInstructions;
  } else {
    // Default hardcoded format
    prompt += `
IMPORTANT: You MUST format your response EXACTLY as follows (this format is required for parsing):

SUMMARY:
[Write your summary here - 2-3 paragraphs based on the instructions above. Focus primarily on the transcript content.${hasCreatorComments ? ' If the creator provided clarifications or additions in their comments, you may incorporate those.' : ''}]

KEY LEARNINGS:
- [First key learning or takeaway from the VIDEO CONTENT]
- [Second key learning or takeaway]
- [Third key learning or takeaway]
- [Continue with more learnings as appropriate]

ACTION ITEMS:
- [Specific actionable task the viewer should do - start with a verb like "Try", "Implement", "Research", etc.]
- [Another concrete next step with clear deliverable]
- [Continue with 3-5 action items maximum]
(Each action item should be a specific, concrete task that someone can actually do - not a general concept. If no clear action items can be derived from the video, write "No specific action items identified")
${hasCreatorComments ? `
CREATOR ADDITIONS:
[If the video creator added valuable information in their comments that wasn't in the transcript, list those separately here. If their comments just thanked viewers or were not substantive, write "No additional insights from creator comments"]
- [Creator insight 1]
- [Creator insight 2]` : ''}

RELEVANT LINKS:
[Review the links from the video description above. Include ANY links that could be useful resources for someone interested in this video's topic - tools, documentation, courses, related content, etc. Be generous - if a link might be helpful, include it. Format each as: the link number followed by a brief reason.]
- 1. [Why this link is useful]
- 2. [Why this link is useful]
(If no links were provided in the description, write "No links provided")

Always include SUMMARY:, KEY LEARNINGS:, ACTION ITEMS:, and RELEVANT LINKS: sections with the exact headers shown above.${hasCreatorComments ? ' Include CREATOR ADDITIONS: section only if creator comments contained valuable additional information.' : ''}`;
  }

  return prompt;
}

/**
 * Create prompt for article/webpage content
 * @param {string} title - Page title
 * @param {string} text - Article/page text
 * @param {string} description - Meta description
 * @param {Array} links - Links found on page
 * @param {string|null} customInstructions - User's custom instructions
 * @param {Object} meta - Metadata: author, siteName, publishDate, contentType
 * @returns {string} - Formatted prompt
 */
function createArticlePrompt(title, text, description = '', links = [], customInstructions = null, meta = {}) {
  const { author, siteName, publishDate, contentType, templateSections } = meta;

  // Truncate text if too long
  const maxLength = 50000;
  const truncatedText = text.length > maxLength
    ? text.substring(0, maxLength) + '...[truncated]'
    : text;

  const maxDescLength = 2000;
  const truncatedDescription = description.length > maxDescLength
    ? description.substring(0, maxDescLength) + '...[truncated]'
    : description;

  const instructions = customInstructions || DEFAULT_INSTRUCTIONS;

  const contentLabel = contentType === 'article' ? 'web article' : 'web page';

  let metaSection = '';
  if (author) metaSection += `Author: ${author}\n`;
  if (siteName) metaSection += `Source: ${siteName}\n`;
  if (publishDate) metaSection += `Published: ${publishDate}\n`;

  const linksSection = links.length > 0
    ? `\n\nLinks found on page:\n${links.map((l, i) => `${i + 1}. ${l.text}: ${l.url}`).join('\n')}`
    : '';

  // Try template-driven output format
  const templateFormat = buildOutputFormat(templateSections, {
    hasLinks: links.length > 0,
    contentLabel
  });

  let prompt = `You are analyzing a ${contentLabel}. Follow these analysis instructions from the user:

---
${instructions}
---

Title: ${title}

${metaSection}${truncatedDescription ? `Description:\n${truncatedDescription}\n` : ''}${linksSection}

Content:
${truncatedText}
`;

  if (templateFormat) {
    prompt += templateFormat.formatInstructions;
  } else {
    prompt += `
IMPORTANT: You MUST format your response EXACTLY as follows (this format is required for parsing):

SUMMARY:
[Write a concise summary of this ${contentLabel} - 2-3 paragraphs covering the main points and arguments.]

KEY LEARNINGS:
- [First key insight or takeaway]
- [Second key insight or takeaway]
- [Continue with more as appropriate]

ACTION ITEMS:
- [Specific actionable task based on the content - start with a verb]
- [Another concrete next step]
(If no clear action items, write "No specific action items identified")

RELEVANT LINKS:
${links.length > 0 ? `[Review the links above. Include useful resources. Format: link number + reason.]
- 1. [Why this link is useful]` : '(No links found on this page)'}

Always include SUMMARY:, KEY LEARNINGS:, ACTION ITEMS:, and RELEVANT LINKS: sections with the exact headers shown above.`;
  }

  return prompt;
}

/**
 * Create prompt for selected text summarization
 * @param {string} pageTitle - Page title for context
 * @param {string} selectedText - The selected text
 * @param {string|null} customInstructions - User's custom instructions
 * @returns {string} - Formatted prompt
 */
function createSelectionPrompt(pageTitle, selectedText, customInstructions = null, opts = {}) {
  const maxLength = 50000;
  const truncatedText = selectedText.length > maxLength
    ? selectedText.substring(0, maxLength) + '...[truncated]'
    : selectedText;

  const instructions = customInstructions || 'Analyze and summarize the selected text, extracting key insights.';
  const { templateSections } = opts;

  // Try template-driven output format
  const templateFormat = buildOutputFormat(templateSections, {
    hasLinks: false
  });

  let prompt = `You are analyzing a text selection from a web page. Follow these analysis instructions from the user:

---
${instructions}
---

Page: ${pageTitle}

Selected Text:
${truncatedText}
`;

  if (templateFormat) {
    prompt += templateFormat.formatInstructions;
  } else {
    prompt += `
IMPORTANT: You MUST format your response EXACTLY as follows (this format is required for parsing):

SUMMARY:
[Write a concise summary of the selected text - 1-2 paragraphs.]

KEY LEARNINGS:
- [First key insight]
- [Second key insight]
- [Continue as appropriate]

ACTION ITEMS:
- [Actionable task if applicable]
(If no clear action items, write "No specific action items identified")

RELEVANT LINKS:
(No links provided)

Always include SUMMARY:, KEY LEARNINGS:, ACTION ITEMS:, and RELEVANT LINKS: sections with the exact headers shown above.`;
  }

  return prompt;
}

/**
 * Call Claude Code CLI with progress tracking
 * @param {string} prompt - Prompt to send
 * @param {function} onProgress - Progress callback
 * @returns {Promise<string>} - Claude's response
 */
function callClaudeCode(prompt, onProgress = () => {}, options = {}) {
  return new Promise((resolve, reject) => {
    // Find claude-code executable
    const claudeCommand = findClaudeCodeCommand();

    if (!claudeCommand) {
      reject(new Error('Claude CLI not found. Please ensure it is installed and in your PATH.'));
      return;
    }

    onProgress({ stage: 'starting', message: 'Starting Claude CLI...' });

    // Spawn Claude process (use --print for non-interactive mode)
    const cliModel = options.model || 'sonnet';
    const claudeProcess = spawn(claudeCommand, ['--print', '--model', cliModel], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CLAUDE_CODE_HEADLESS: '1' // Run in headless mode if supported
      }
    });

    let stdout = '';
    let stderr = '';
    let firstChunkReceived = false;
    let chunkCount = 0;

    claudeProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      chunkCount++;

      if (!firstChunkReceived) {
        firstChunkReceived = true;
        onProgress({ stage: 'streaming', message: 'Receiving response...', chars: stdout.length });
      } else {
        onProgress({ stage: 'streaming', message: 'Receiving response...', chars: stdout.length, chunks: chunkCount });
      }
    });

    claudeProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claudeProcess.on('close', (code) => {
      if (code !== 0) {
        const errorDetails = stderr || stdout || 'No error output captured';
        reject(new Error(`Claude exited with code ${code}. Details: ${errorDetails}`));
      } else {
        onProgress({ stage: 'processing', message: 'Processing response...' });
        resolve(stdout);
      }
    });

    claudeProcess.on('error', (error) => {
      reject(new Error(`Failed to spawn Claude: ${error.message}`));
    });

    // Send prompt to Claude Code via stdin
    const estimatedInputTokens = Math.round(prompt.length / 4);
    onProgress({ stage: 'sending', message: 'Sending to Claude...', inputTokens: estimatedInputTokens });
    claudeProcess.stdin.write(prompt);
    claudeProcess.stdin.end();
    onProgress({ stage: 'waiting', message: 'Claude is analyzing...', inputTokens: estimatedInputTokens });

    // Timeout after 2 minutes
    setTimeout(() => {
      claudeProcess.kill();
      reject(new Error('Claude Code request timed out'));
    }, 120000);
  });
}

/**
 * Find Claude command in PATH
 * @returns {string|null} - Path to claude or null
 */
function findClaudeCodeCommand() {
  // Common locations for claude - check newer locations first
  const possiblePaths = [
    path.join(os.homedir(), '.claude/local/claude'), // New Claude CLI location (preferred)
    'claude', // In PATH
    '/usr/local/bin/claude',
    path.join(os.homedir(), '.local/bin/claude'),
    '/opt/homebrew/bin/claude' // Old npm-installed version
  ];

  const { execSync } = require('child_process');
  const fs = require('fs');

  for (const cmdPath of possiblePaths) {
    try {
      // For absolute paths, check if file exists and is executable
      if (path.isAbsolute(cmdPath)) {
        if (fs.existsSync(cmdPath)) {
          fs.accessSync(cmdPath, fs.constants.X_OK);
          return cmdPath;
        }
      } else {
        // For command names, use which
        execSync(`which ${cmdPath}`, { stdio: 'ignore' });
        return cmdPath;
      }
    } catch {
      continue;
    }
  }

  return 'claude'; // Fallback to assuming it's in PATH
}

/**
 * Map template sections to parser labels
 * @param {Array|null} templateSections - Template sections array
 * @returns {Object} - Label mapping: { summary, keyLearnings, actionItems, creatorAdditions, relevantLinks }
 */
function getParseLabels(templateSections) {
  // Default labels (used when no template)
  const defaults = {
    summary: 'SUMMARY',
    keyLearnings: 'KEY LEARNINGS',
    actionItems: 'ACTION ITEMS',
    creatorAdditions: 'CREATOR ADDITIONS',
    relevantLinks: 'RELEVANT LINKS'
  };

  if (!templateSections || templateSections.length === 0) {
    return defaults;
  }

  // Map section IDs to their custom labels (uppercased to match prompt format)
  const labelMap = {};
  templateSections.forEach(s => {
    if (s.enabled) {
      labelMap[s.id] = s.label.toUpperCase();
    }
  });

  return {
    summary: labelMap.summary || defaults.summary,
    keyLearnings: labelMap.key_learnings || defaults.keyLearnings,
    actionItems: labelMap.action_items || defaults.actionItems,
    creatorAdditions: labelMap.creator_additions || defaults.creatorAdditions,
    relevantLinks: labelMap.relevant_links || defaults.relevantLinks
  };
}

/**
 * Parse Claude's response
 * @param {string} response - Raw response from Claude
 * @param {Array} descriptionLinks - Original links from description for matching
 * @param {Array|null} templateSections - Template sections for custom label matching
 * @returns {Object} - Parsed summary, key learnings, creator additions, and relevant links
 */
function parseResponse(response, descriptionLinks = [], templateSections = null) {
  // Clean up the response
  const cleaned = response.trim();

  // Build label mapping from template sections (if available)
  const labels = getParseLabels(templateSections);

  // Build regex for section boundaries - headers must be at line start
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const allHeaders = [labels.summary, labels.keyLearnings, labels.actionItems, labels.creatorAdditions, labels.relevantLinks]
    .filter(Boolean)
    .map(escapeRegex)
    .join('|');
  // Use (?=\n...:) to match headers at line boundaries, not within text
  const boundaryPattern = allHeaders ? `(?=\\n(?:${allHeaders}):|$)` : '(?=$)';

  // Extract summary section
  const summaryMatch = cleaned.match(new RegExp(`${escapeRegex(labels.summary)}:\\s*([\\s\\S]*?)${boundaryPattern}`, 'i'));
  const summary = summaryMatch
    ? summaryMatch[1].trim()
    : cleaned.substring(0, 500); // Fallback

  // Extract key learnings
  const learningsMatch = cleaned.match(new RegExp(`${escapeRegex(labels.keyLearnings)}:\\s*([\\s\\S]*?)${boundaryPattern}`, 'i'));
  let keyLearnings = [];

  if (learningsMatch) {
    const learningsText = learningsMatch[1].trim();
    keyLearnings = learningsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('•') || /^\d+\./.test(line))
      .map(line => line.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, ''))
      .filter(line => line.length > 0);
  }

  // Extract action items
  const actionItemsMatch = cleaned.match(new RegExp(`${escapeRegex(labels.actionItems)}:\\s*([\\s\\S]*?)${boundaryPattern}`, 'i'));
  let actionItems = [];

  if (actionItemsMatch) {
    const actionText = actionItemsMatch[1].trim();
    // Check if Claude said there were no action items
    const skipPhrases = ['no specific', 'no action', 'none identified', 'n/a', 'no clear'];
    const shouldSkip = skipPhrases.some(phrase => actionText.toLowerCase().includes(phrase));

    if (!shouldSkip) {
      actionItems = actionText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('-') || line.startsWith('•') || /^\d+\./.test(line))
        .map(line => line.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, ''))
        .filter(line => line.length > 0);
    }
  }

  // Extract creator additions (if present)
  let creatorAdditions = [];
  if (labels.creatorAdditions) {
    const creatorMatch = cleaned.match(new RegExp(`${escapeRegex(labels.creatorAdditions)}:\\s*([\\s\\S]*?)${boundaryPattern}`, 'i'));

    if (creatorMatch) {
      const creatorText = creatorMatch[1].trim();
      const skipPhrases = ['no additional', 'none', 'n/a', 'not substantive'];
      const shouldSkip = skipPhrases.some(phrase => creatorText.toLowerCase().includes(phrase));

      if (!shouldSkip) {
        creatorAdditions = creatorText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('-') || line.startsWith('•') || /^\d+\./.test(line))
          .map(line => line.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, ''))
          .filter(line => line.length > 0);
      }
    }
  }

  // If we have creator additions, mark them and add to learnings
  if (creatorAdditions.length > 0) {
    const markedAdditions = creatorAdditions.map(addition => `[From Creator] ${addition}`);
    keyLearnings = keyLearnings.concat(markedAdditions);
  }

  // Extract relevant links
  const linksMatch = cleaned.match(new RegExp(`${escapeRegex(labels.relevantLinks)}:\\s*([\\s\\S]*?)$`, 'i'));
  let relevantLinks = [];

  if (linksMatch && descriptionLinks.length > 0) {
    const linksText = linksMatch[1].trim();

    // Skip if Claude said "None", "No links", etc.
    const skipPhrases = ['none', 'no links', 'no relevant', 'not provided', 'n/a'];
    const shouldSkip = skipPhrases.some(phrase => linksText.toLowerCase().includes(phrase));

    if (!shouldSkip) {
      // Split by lines and look for any line containing a number
      const lines = linksText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

      lines.forEach(line => {
        // Try to extract link number from various formats:
        // "- 1. Description", "1. Description", "• 1: Description", "Link 1 - Description", etc.
        const numMatch = line.match(/^[-•*]?\s*(?:Link\s*)?(\d+)[\.\:\-\s]/i);
        if (numMatch) {
          const linkIndex = parseInt(numMatch[1], 10) - 1; // Convert to 0-based index
          if (linkIndex >= 0 && linkIndex < descriptionLinks.length) {
            const originalLink = descriptionLinks[linkIndex];
            // Extract Claude's description - remove the number prefix
            const reason = line
              .replace(/^[-•*]\s*/, '')
              .replace(/^(?:Link\s*)?\d+[\.\:\-\s]+/i, '')
              .trim();

            // Only add if we haven't already added this link
            if (!relevantLinks.some(l => l.url === originalLink.url)) {
              relevantLinks.push({
                ...originalLink,
                reason: reason || 'Relevant to video content'
              });
            }
          }
        }
      });
    }
  }

  // Ensure we have at least some key learnings
  if (keyLearnings.length === 0) {
    keyLearnings = [
      'No key learnings could be extracted from the response.',
      'Please try generating the summary again.'
    ];
  }

  return {
    summary: summary || 'Summary could not be generated.',
    keyLearnings,
    actionItems,
    relevantLinks
  };
}

/**
 * Generate follow-up insights based on user query
 * @param {string} videoTitle - YouTube video title
 * @param {string} transcript - Video transcript
 * @param {string} query - User's follow-up question
 * @param {string[]} existingLearnings - Already extracted learnings
 * @returns {Promise<Object>} - Object with insights and actions arrays
 */
async function generateFollowUp(videoTitle, transcript, query, existingLearnings = [], options = {}) {
  const log = (msg) => logger.log(msg, 'claude-bridge:followup');
  const { apiKey, model } = options;

  try {
    // Create follow-up prompt
    const prompt = createFollowUpPrompt(videoTitle, transcript, query, existingLearnings);
    log(`Follow-up prompt length: ${prompt.length} characters`);

    // Try direct API first, fall back to CLI
    let response;
    try {
      log('Attempting direct Anthropic API call for follow-up...');
      response = await anthropicClient.callAnthropicAPI(prompt, {
        apiKey,
        model: model || 'sonnet'
      });
      log(`API response received: ${response.length} characters`);
    } catch (apiErr) {
      log(`API call failed: ${apiErr.message}, falling back to CLI...`);
      const claudeCmd = findClaudeCodeCommand();
      log(`Using Claude command: ${claudeCmd}`);
      response = await callClaudeCode(prompt, () => {}, { model });
      log(`CLI response received: ${response.length} characters`);
    }

    // Parse the follow-up response (returns { insights: string[], actions: string[] })
    const parsed = parseFollowUpResponse(response);
    log(`Parsed ${parsed.insights.length} insights, ${parsed.actions.length} actions`);

    return {
      success: true,
      insights: parsed.insights,
      actions: parsed.actions
    };

  } catch (error) {
    log(`ERROR: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create prompt for follow-up query
 * @param {string} videoTitle - Video title
 * @param {string} transcript - Transcript text
 * @param {string} query - User's question
 * @param {string[]} existingLearnings - Already extracted learnings
 * @returns {string} - Formatted prompt
 */
function createFollowUpPrompt(videoTitle, transcript, query, existingLearnings) {
  // Truncate transcript if too long
  const maxTranscriptLength = 50000;
  const truncatedTranscript = transcript.length > maxTranscriptLength
    ? transcript.substring(0, maxTranscriptLength) + '...[truncated]'
    : transcript;

  const existingList = existingLearnings.length > 0
    ? `\n\nAlready extracted learnings (avoid repeating these):\n${existingLearnings.map((l, i) => `${i + 1}. ${l}`).join('\n')}`
    : '';

  return `You are analyzing a YouTube video transcript to answer a follow-up question.

Video Title: ${videoTitle}
${existingList}

Transcript:
${truncatedTranscript}

User's Question: ${query}

Based on the transcript, extract additional information that answers the user's question.

IMPORTANT: Classify each item as either an "insight" or "action":
- insight: Facts, concepts, statistics, explanations, or observations from the video
- action: Concrete tasks the viewer should do (start with verbs like Try, Implement, Research, etc.)

Return your response as JSON in this exact format:
{
  "items": [
    { "type": "insight", "text": "Your insight here" },
    { "type": "action", "text": "Your action item here" }
  ]
}

Only include information actually mentioned or directly inferable from the transcript.`;
}

/**
 * Parse follow-up response to extract learnings, with insight/action classification
 * @param {string} response - Raw response from Claude
 * @returns {{insights: string[], actions: string[]}} - Object with insights and actions arrays
 */
function parseFollowUpResponse(response) {
  const cleaned = response.trim();

  // Try to extract JSON from response (handle markdown code blocks)
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                    cleaned.match(/(\{[\s\S]*"items"[\s\S]*\})/);

  if (jsonMatch) {
    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);
      if (parsed.items && Array.isArray(parsed.items)) {
        return {
          insights: parsed.items
            .filter(i => i.type === 'insight' && typeof i.text === 'string')
            .map(i => i.text),
          actions: parsed.items
            .filter(i => i.type === 'action' && typeof i.text === 'string')
            .map(i => i.text)
        };
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: treat all as insights (existing behavior for plain text responses)
  const plainTextLearnings = parseAsPlainText(cleaned);
  return {
    insights: plainTextLearnings,
    actions: []
  };
}

/**
 * Parse plain text response to extract learnings (fallback for non-JSON responses)
 * @param {string} text - Cleaned response text
 * @returns {string[]} - Array of learning strings
 */
function parseAsPlainText(text) {
  // Extract bullet points
  const learnings = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('-') || line.startsWith('•') || /^\d+\./.test(line))
    .map(line => line.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, ''))
    .filter(line => line.length > 0);

  // If no bullet points found, try to split by sentences
  if (learnings.length === 0 && text.length > 0) {
    // Just return the whole response as one learning if it's reasonable length
    if (text.length < 500) {
      return [text];
    }
    // Otherwise split by periods
    const sentences = text.split(/\.\s+/)
      .filter(s => s.length > 20)
      .slice(0, 5)
      .map(s => s.trim() + (s.endsWith('.') ? '' : '.'));
    return sentences;
  }

  return learnings;
}

module.exports = {
  generateSummary,
  generateFollowUp,
  // Exported for testing
  createPrompt,
  createArticlePrompt,
  createSelectionPrompt,
  parseResponse,
  createFollowUpPrompt,
  parseFollowUpResponse,
  parseAsPlainText,
  buildOutputFormat,
  getParseLabels,
  DEFAULT_INSTRUCTIONS
};
