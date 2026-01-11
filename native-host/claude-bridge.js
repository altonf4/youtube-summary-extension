/**
 * Claude Code CLI Bridge
 * Integrates with Claude Code to generate summaries
 */

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

/**
 * Generate summary using Claude Code CLI
 * @param {string} videoTitle - YouTube video title
 * @param {string} transcript - Video transcript
 * @param {string} description - Video description
 * @param {Array} descriptionLinks - Links extracted from description
 * @param {string|null} customInstructions - Custom analysis instructions from user
 * @param {function} onProgress - Progress callback
 * @returns {Promise<Object>} - Summary, key learnings, and relevant links
 */
async function generateSummary(videoTitle, transcript, description = '', descriptionLinks = [], customInstructions = null, onProgress = () => {}) {
  const fs = require('fs');
  const logFile = require('path').join(process.env.HOME, '.youtube-summary-extension.log');

  const log = (msg) => {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] [claude-bridge] ${msg}\n`);
  };

  try {
    onProgress({ stage: 'preparing', message: 'Preparing transcript...' });

    // Craft the prompt with custom instructions wrapped in system format
    const prompt = createPrompt(videoTitle, transcript, description, descriptionLinks, customInstructions);
    log(`Prompt length: ${prompt.length} characters`);

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
    log(`Parsed summary: ${parsed.summary.length} chars, ${parsed.keyLearnings.length} learnings, ${parsed.relevantLinks.length} links`);

    onProgress({ stage: 'complete', message: 'Done!' });

    return {
      success: true,
      summary: parsed.summary,
      keyLearnings: parsed.keyLearnings,
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
 * @param {string|null} customInstructions - User's custom instructions
 * @returns {string} - Formatted prompt
 */
function createPrompt(videoTitle, transcript, description = '', descriptionLinks = [], customInstructions = null) {
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

  // Use custom instructions or default
  const instructions = customInstructions || DEFAULT_INSTRUCTIONS;

  // Wrap user instructions with system prompt that enforces output format
  return `You are analyzing a YouTube video transcript. Follow these analysis instructions from the user:

---
${instructions}
---

Video Title: ${videoTitle}

${truncatedDescription ? `Video Description:\n${truncatedDescription}` : ''}${linksSection}

Transcript:
${truncatedTranscript}

IMPORTANT: You MUST format your response EXACTLY as follows (this format is required for parsing):

SUMMARY:
[Write your summary here - 2-3 paragraphs based on the instructions above]

KEY LEARNINGS:
- [First key learning or takeaway]
- [Second key learning or takeaway]
- [Third key learning or takeaway]
- [Continue with more learnings as appropriate]

RELEVANT LINKS:
[Review the links from the video description above. Include ANY links that could be useful resources for someone interested in this video's topic - tools, documentation, courses, related content, etc. Be generous - if a link might be helpful, include it. Format each as: the link number followed by a brief reason.]
- 1. [Why this link is useful]
- 2. [Why this link is useful]
(If no links were provided in the description, write "No links provided")

Always include SUMMARY:, KEY LEARNINGS:, and RELEVANT LINKS: sections with the exact headers shown above.`;
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

    // Spawn Claude process (use --print for non-interactive mode, default model)
    const claudeProcess = spawn(claudeCommand, ['--print'], {
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
    onProgress({ stage: 'sending', message: 'Sending to Claude...', promptLength: prompt.length });
    claudeProcess.stdin.write(prompt);
    claudeProcess.stdin.end();
    onProgress({ stage: 'waiting', message: 'Waiting for Claude to think...' });

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
  // Common locations for claude
  const possiblePaths = [
    'claude', // In PATH
    '/usr/local/bin/claude',
    path.join(os.homedir(), '.local/bin/claude'),
    '/opt/homebrew/bin/claude'
  ];

  const { execSync } = require('child_process');

  for (const cmdPath of possiblePaths) {
    try {
      execSync(`which ${cmdPath}`, { stdio: 'ignore' });
      return cmdPath;
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
 * @returns {Object} - Parsed summary, key learnings, and relevant links
 */
function parseResponse(response, descriptionLinks = []) {
  // Clean up the response
  const cleaned = response.trim();

  // Extract summary section
  const summaryMatch = cleaned.match(/SUMMARY:\s*([\s\S]*?)(?=KEY LEARNINGS:|$)/i);
  const summary = summaryMatch
    ? summaryMatch[1].trim()
    : cleaned.substring(0, 500); // Fallback

  // Extract key learnings
  const learningsMatch = cleaned.match(/KEY LEARNINGS:\s*([\s\S]*?)(?=RELEVANT LINKS:|$)/i);
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
    relevantLinks
  };
}

module.exports = {
  generateSummary
};
