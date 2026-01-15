/**
 * Claude Code CLI Bridge
 * Integrates with Claude Code to generate summaries
 */

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const logger = require('./logger');

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
async function generateSummary(videoTitle, transcript, description = '', descriptionLinks = [], creatorComments = [], viewerComments = [], customInstructions = null, onProgress = () => {}) {
  const log = (msg) => logger.log(msg, 'claude-bridge');

  try {
    onProgress({ stage: 'preparing', message: 'Preparing transcript...' });

    // Craft the prompt with custom instructions wrapped in system format
    const prompt = createPrompt(videoTitle, transcript, description, descriptionLinks, creatorComments, viewerComments, customInstructions);
    log(`Prompt length: ${prompt.length} characters`);
    log(`Including ${creatorComments?.length || 0} creator comments, ${viewerComments?.length || 0} viewer comments in prompt`);

    // Find claude command
    const claudeCmd = findClaudeCodeCommand();
    log(`Using Claude command: ${claudeCmd}`);

    // Call Claude with progress tracking
    log('Calling Claude CLI...');
    const response = await callClaudeCode(prompt, onProgress);
    log(`Response received: ${response.length} characters`);

    // Parse the response
    onProgress({ stage: 'parsing', message: 'Extracting insights...' });
    const parsed = parseResponse(response, descriptionLinks);
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
 * Create prompt for Claude - wraps user instructions with system format
 * @param {string} videoTitle - Video title
 * @param {string} transcript - Transcript text
 * @param {string} description - Video description
 * @param {Array} descriptionLinks - Links from description
 * @param {Array} creatorComments - Comments/replies from the video creator (high value)
 * @param {Array} viewerComments - Top comments from viewers (use cautiously)
 * @param {string|null} customInstructions - User's custom instructions
 * @returns {string} - Formatted prompt
 */
function createPrompt(videoTitle, transcript, description = '', descriptionLinks = [], creatorComments = [], viewerComments = [], customInstructions = null) {
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

  // Wrap user instructions with system prompt that enforces output format
  return `You are analyzing a YouTube video transcript. Follow these analysis instructions from the user:

---
${instructions}
---

Video Title: ${videoTitle}

${truncatedDescription ? `Video Description:\n${truncatedDescription}` : ''}${linksSection}${creatorSection}${viewerSection}

Transcript:
${truncatedTranscript}

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

/**
 * Call Claude Code CLI with progress tracking
 * @param {string} prompt - Prompt to send
 * @param {function} onProgress - Progress callback
 * @returns {Promise<string>} - Claude's response
 */
function callClaudeCode(prompt, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    // Find claude-code executable
    const claudeCommand = findClaudeCodeCommand();

    if (!claudeCommand) {
      reject(new Error('Claude CLI not found. Please ensure it is installed and in your PATH.'));
      return;
    }

    onProgress({ stage: 'starting', message: 'Starting Claude CLI...' });

    // Spawn Claude process (use --print for non-interactive mode, sonnet model for cost efficiency)
    const claudeProcess = spawn(claudeCommand, ['--print', '--model', 'sonnet'], {
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
 * Parse Claude's response
 * @param {string} response - Raw response from Claude
 * @param {Array} descriptionLinks - Original links from description for matching
 * @returns {Object} - Parsed summary, key learnings, creator additions, and relevant links
 */
function parseResponse(response, descriptionLinks = []) {
  // Clean up the response
  const cleaned = response.trim();

  // Extract summary section
  const summaryMatch = cleaned.match(/SUMMARY:\s*([\s\S]*?)(?=KEY LEARNINGS:|$)/i);
  const summary = summaryMatch
    ? summaryMatch[1].trim()
    : cleaned.substring(0, 500); // Fallback

  // Extract key learnings (stop at ACTION ITEMS, CREATOR ADDITIONS or RELEVANT LINKS)
  const learningsMatch = cleaned.match(/KEY LEARNINGS:\s*([\s\S]*?)(?=ACTION ITEMS:|CREATOR ADDITIONS:|RELEVANT LINKS:|$)/i);
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

  // Extract action items (stop at CREATOR ADDITIONS or RELEVANT LINKS)
  const actionItemsMatch = cleaned.match(/ACTION ITEMS:\s*([\s\S]*?)(?=CREATOR ADDITIONS:|RELEVANT LINKS:|$)/i);
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
  const creatorMatch = cleaned.match(/CREATOR ADDITIONS:\s*([\s\S]*?)(?=RELEVANT LINKS:|$)/i);
  let creatorAdditions = [];

  if (creatorMatch) {
    const creatorText = creatorMatch[1].trim();
    // Check if Claude said there were no additions
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

  // If we have creator additions, mark them and add to learnings
  if (creatorAdditions.length > 0) {
    const markedAdditions = creatorAdditions.map(addition => `[From Creator] ${addition}`);
    keyLearnings = keyLearnings.concat(markedAdditions);
  }

  // Extract relevant links
  const linksMatch = cleaned.match(/RELEVANT LINKS:\s*([\s\S]*?)$/i);
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
 * @returns {Promise<Object>} - Additional learnings
 */
async function generateFollowUp(videoTitle, transcript, query, existingLearnings = []) {
  const log = (msg) => logger.log(msg, 'claude-bridge:followup');

  try {
    // Create follow-up prompt
    const prompt = createFollowUpPrompt(videoTitle, transcript, query, existingLearnings);
    log(`Follow-up prompt length: ${prompt.length} characters`);

    // Find claude command
    const claudeCmd = findClaudeCodeCommand();
    log(`Using Claude command: ${claudeCmd}`);

    // Call Claude (simpler, no progress tracking needed for follow-up)
    log('Calling Claude CLI for follow-up...');
    const response = await callClaudeCode(prompt, () => {});
    log(`Response received: ${response.length} characters`);

    // Parse the follow-up response
    const additionalLearnings = parseFollowUpResponse(response);
    log(`Parsed ${additionalLearnings.length} additional learnings`);

    return {
      success: true,
      additionalLearnings
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

Based on the transcript, provide additional key learnings or insights that answer the user's question. Focus specifically on what they asked for.

IMPORTANT: Format your response as a bullet list of learnings/insights. Each item should be on its own line starting with a dash (-).

Example format:
- First insight or learning point
- Second insight or learning point
- Third insight or learning point

Only include information that is actually mentioned or can be directly inferred from the transcript. Be specific and actionable where possible.`;
}

/**
 * Parse follow-up response to extract learnings
 * @param {string} response - Raw response from Claude
 * @returns {string[]} - Array of learning strings
 */
function parseFollowUpResponse(response) {
  const cleaned = response.trim();

  // Extract bullet points
  const learnings = cleaned
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('-') || line.startsWith('•') || /^\d+\./.test(line))
    .map(line => line.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, ''))
    .filter(line => line.length > 0);

  // If no bullet points found, try to split by sentences
  if (learnings.length === 0 && cleaned.length > 0) {
    // Just return the whole response as one learning if it's reasonable length
    if (cleaned.length < 500) {
      return [cleaned];
    }
    // Otherwise split by periods
    const sentences = cleaned.split(/\.\s+/)
      .filter(s => s.length > 20)
      .slice(0, 5)
      .map(s => s.trim() + (s.endsWith('.') ? '' : '.'));
    return sentences;
  }

  return learnings;
}

module.exports = {
  generateSummary,
  generateFollowUp
};
