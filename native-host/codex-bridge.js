/**
 * OpenAI Codex CLI Bridge
 * Mirrors the surface of claude-bridge.js so host.js can route either
 * provider transparently. Codex CLI uses OAuth credentials cached by
 * `codex login` in ~/.codex/auth.json — we just spawn it.
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const logger = require('./logger');
const claudeBridge = require('./claude-bridge');

/**
 * Generate summary using Codex CLI.
 * Reuses the prompt builders from claude-bridge so output format stays in sync.
 */
async function generateSummary(videoTitle, transcript, description = '', descriptionLinks = [], creatorComments = [], viewerComments = [], customInstructions = null, onProgress = () => {}, options = {}) {
  const log = (msg) => logger.log(msg, 'codex-bridge');
  const { model, contentType, author, siteName, publishDate, templateSections } = options;

  try {
    onProgress({ stage: 'preparing', message: 'Preparing content...' });

    let prompt;
    if (contentType === 'article' || contentType === 'webpage') {
      prompt = claudeBridge.createArticlePrompt(videoTitle, transcript, description, descriptionLinks, customInstructions, { author, siteName, publishDate, contentType, templateSections });
    } else if (contentType === 'selected_text') {
      prompt = claudeBridge.createSelectionPrompt(videoTitle, transcript, customInstructions, { templateSections });
    } else {
      prompt = claudeBridge.createPrompt(videoTitle, transcript, description, descriptionLinks, creatorComments, viewerComments, customInstructions, { templateSections });
    }
    log(`Prompt length: ${prompt.length} characters (contentType: ${contentType || 'youtube_video'})`);

    const response = await callCodex(prompt, onProgress, { model });
    log(`CLI response received: ${response.length} characters`);

    onProgress({ stage: 'parsing', message: 'Extracting insights...' });
    const parsed = claudeBridge.parseResponse(response, descriptionLinks, templateSections);
    log(`Parsed summary: ${parsed.summary.length} chars, ${parsed.keyLearnings.length} learnings, ${parsed.actionItems.length} actions, ${parsed.relevantLinks.length} links`);

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
    return { success: false, error: error.message };
  }
}

/**
 * Generate follow-up using Codex CLI.
 */
async function generateFollowUp(videoTitle, transcript, query, existingLearnings = [], options = {}) {
  const log = (msg) => logger.log(msg, 'codex-bridge:followup');
  const { model } = options;

  try {
    const prompt = claudeBridge.createFollowUpPrompt(videoTitle, transcript, query, existingLearnings);
    log(`Follow-up prompt length: ${prompt.length} characters`);

    const response = await callCodex(prompt, () => {}, { model });
    log(`CLI response received: ${response.length} characters`);

    const parsed = claudeBridge.parseFollowUpResponse(response);
    log(`Parsed ${parsed.insights.length} insights, ${parsed.actions.length} actions`);

    return {
      success: true,
      insights: parsed.insights,
      actions: parsed.actions
    };
  } catch (error) {
    log(`ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Multi-turn chat using Codex CLI.
 * Codex `exec` is one-shot, so we serialize the full conversation each call.
 */
async function chat(prompt, options = {}) {
  const log = (msg) => logger.log(msg, 'codex-bridge:chat');
  const { model } = options;

  try {
    log(`Chat prompt length: ${prompt.length} characters`);
    const response = await callCodex(prompt, () => {}, { model });
    log(`Chat response: ${response.length} characters`);
    return { success: true, reply: response.trim() };
  } catch (error) {
    log(`ERROR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Spawn `codex exec`, write prompt to stdin, return final agent message.
 * Uses --ephemeral (no session files) and --output-last-message <tmpfile> so
 * we get the clean assistant reply without scraping codex's TUI output.
 */
function callCodex(prompt, onProgress = () => {}, options = {}) {
  return new Promise((resolve, reject) => {
    const codexCommand = findCodexCommand();
    if (!codexCommand) {
      reject(new Error('Codex CLI not found. Install with `npm i -g @openai/codex` and run `codex login`.'));
      return;
    }

    onProgress({ stage: 'starting', message: 'Starting Codex CLI...' });

    // Codex defaults to gpt-5; allow override via options.model.
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--color', 'never',
      '--ephemeral'
    ];
    if (options.model) {
      args.push('-m', options.model);
    }

    // Final message lands in this file — much cleaner than parsing stdout.
    const tmpFile = path.join(os.tmpdir(), `codex-out-${process.pid}-${Date.now()}.txt`);
    args.push('--output-last-message', tmpFile);

    const child = spawn(codexCommand, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' }
    });

    let stderr = '';
    let stdoutBytes = 0;
    let firstChunkSeen = false;

    child.stdout.on('data', (data) => {
      stdoutBytes += data.length;
      if (!firstChunkSeen) {
        firstChunkSeen = true;
        onProgress({ stage: 'streaming', message: 'Receiving response...', chars: stdoutBytes });
      } else {
        onProgress({ stage: 'streaming', message: 'Receiving response...', chars: stdoutBytes });
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      let body = '';
      try {
        if (fs.existsSync(tmpFile)) {
          body = fs.readFileSync(tmpFile, 'utf8');
          fs.unlinkSync(tmpFile);
        }
      } catch {
        // ignore
      }

      if (code !== 0) {
        const detail = stderr.trim() || 'No error output captured';
        reject(new Error(`Codex exited with code ${code}. Details: ${detail}`));
        return;
      }

      if (!body) {
        // Fallback: codex didn't write the output file (e.g. early failure
        // or stdin not consumed). Surface stderr so the user sees something
        // actionable instead of a silent empty reply.
        reject(new Error(`Codex returned no output.${stderr ? ` Details: ${stderr.trim()}` : ''}`));
        return;
      }

      onProgress({ stage: 'processing', message: 'Processing response...' });
      resolve(body);
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to spawn Codex: ${error.message}`));
    });

    const estimatedInputTokens = Math.round(prompt.length / 4);
    onProgress({ stage: 'sending', message: 'Sending to Codex...', inputTokens: estimatedInputTokens });
    child.stdin.write(prompt);
    child.stdin.end();
    onProgress({ stage: 'waiting', message: 'Codex is analyzing...', inputTokens: estimatedInputTokens });

    setTimeout(() => {
      child.kill();
      reject(new Error('Codex request timed out'));
    }, 120000);
  });
}

/**
 * Find codex command. Codex ships as a Node CLI, so it may live anywhere
 * Node's bin dir lives (Homebrew, Homebrew Cellar, npm prefix, bun, ~/.local).
 * We check the static common locations first, then fall back to `which`,
 * then to glob-scanning Homebrew's Node Cellar (because homebrew-installed
 * Node bundles codex at /opt/homebrew/Cellar/node/<version>/bin/codex).
 */
function findCodexCommand() {
  const candidates = [
    'codex',
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    path.join(os.homedir(), '.local/bin/codex'),
    path.join(os.homedir(), '.bun/bin/codex')
  ];

  // Best-effort: pick up codex from Homebrew's Node Cellar. Safari runs us
  // out of a LaunchAgent whose PATH was captured at install time and may
  // not include the Cellar bin dir.
  try {
    const cellars = fs.readdirSync('/opt/homebrew/Cellar/node');
    for (const v of cellars) {
      candidates.push(`/opt/homebrew/Cellar/node/${v}/bin/codex`);
    }
  } catch {
    // No homebrew Node, fine.
  }

  // Likewise for npm's resolved global prefix.
  try {
    const prefix = execSync('npm prefix -g 2>/dev/null', { encoding: 'utf8' }).trim();
    if (prefix) candidates.push(path.join(prefix, 'bin', 'codex'));
  } catch {
    // No npm in PATH, skip.
  }

  for (const cmd of candidates) {
    try {
      if (path.isAbsolute(cmd)) {
        if (fs.existsSync(cmd)) {
          fs.accessSync(cmd, fs.constants.X_OK);
          return cmd;
        }
      } else {
        execSync(`which ${cmd}`, { stdio: 'ignore' });
        return cmd;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Check whether codex auth.json exists. We can't easily verify token validity
 * without spending tokens, so we check the file as a proxy.
 */
function isLoggedIn() {
  const authPath = path.join(os.homedir(), '.codex', 'auth.json');
  return fs.existsSync(authPath);
}

module.exports = {
  generateSummary,
  generateFollowUp,
  chat,
  findCodexCommand,
  isLoggedIn
};
