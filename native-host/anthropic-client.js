/**
 * Anthropic API Client
 * Handles OAuth credential loading from Claude Code and direct API calls.
 * Falls back to user-provided API key if OAuth is unavailable.
 * Uses Node.js built-in https module (zero dependencies).
 */

const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

const ANTHROPIC_API_HOST = 'api.anthropic.com';
const ANTHROPIC_API_VERSION = '2023-06-01';

/**
 * Load OAuth credentials from Claude Code's credential storage.
 * Tries macOS Keychain first, then falls back to credentials file.
 * @returns {string|null} OAuth token or null if not available
 */
function loadOAuthCredentials() {
  const log = (msg) => logger.log(msg, 'anthropic-client');

  // Try macOS Keychain first
  try {
    const keychainResult = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
      { encoding: 'utf8', timeout: 5000 }
    ).trim();

    if (keychainResult) {
      const parsed = JSON.parse(keychainResult);
      // Look for an OAuth token in the credentials
      if (parsed.oauth_token) {
        log('Loaded OAuth token from macOS Keychain');
        return parsed.oauth_token;
      }
      // Some versions store it differently
      if (parsed.claudeAiOauth && parsed.claudeAiOauth.accessToken) {
        log('Loaded OAuth token from macOS Keychain (claudeAiOauth)');
        return parsed.claudeAiOauth.accessToken;
      }
    }
  } catch (err) {
    // Keychain not available or credentials not found
    log(`Keychain lookup failed: ${err.message}`);
  }

  // Fallback: try credentials file
  const credentialsPaths = [
    path.join(os.homedir(), '.claude', '.credentials.json'),
    path.join(os.homedir(), '.claude', 'credentials.json')
  ];

  for (const credPath of credentialsPaths) {
    try {
      if (fs.existsSync(credPath)) {
        const content = fs.readFileSync(credPath, 'utf8');
        const parsed = JSON.parse(content);

        if (parsed.oauth_token) {
          log(`Loaded OAuth token from ${credPath}`);
          return parsed.oauth_token;
        }
        if (parsed.claudeAiOauth && parsed.claudeAiOauth.accessToken) {
          log(`Loaded OAuth token from ${credPath} (claudeAiOauth)`);
          return parsed.claudeAiOauth.accessToken;
        }
      }
    } catch (err) {
      log(`Failed to read ${credPath}: ${err.message}`);
    }
  }

  log('No OAuth credentials found');
  return null;
}

/**
 * Check if a token is an OAuth token (vs API key)
 * @param {string} token - Token to check
 * @returns {boolean} True if token is an OAuth token
 */
function isOAuthToken(token) {
  return Boolean(token && token.startsWith('sk-ant-oat'));
}

/**
 * Resolve a short model name to a full Anthropic model ID
 * @param {string} shortName - Short name like 'sonnet', 'opus', 'haiku'
 * @returns {string} Full model ID
 */
function resolveModelName(shortName) {
  const modelMap = {
    'sonnet': 'claude-sonnet-4-20250514',
    'opus': 'claude-opus-4-20250514',
    'haiku': 'claude-haiku-4-20250514'
  };

  if (!shortName) return modelMap.sonnet;
  const lower = shortName.toLowerCase();
  return modelMap[lower] || shortName;
}

/**
 * Call the Anthropic Messages API
 * @param {string} prompt - User prompt text
 * @param {Object} options - Options
 * @param {string} [options.apiKey] - User-provided API key (used if no OAuth)
 * @param {string} [options.model] - Model short name or full ID
 * @param {number} [options.maxTokens=8192] - Max tokens to generate
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<string>} Response text
 */
async function callAnthropicAPI(prompt, options = {}) {
  const log = (msg) => logger.log(msg, 'anthropic-client');
  const { apiKey, model, maxTokens = 8192, onProgress = () => {} } = options;

  // Determine which token to use: OAuth first, then API key
  let token = loadOAuthCredentials();
  let usingOAuth = isOAuthToken(token);

  if (!token && apiKey) {
    token = apiKey;
    usingOAuth = false;
  }

  if (!token) {
    throw new Error('No Anthropic credentials available. Please set up Claude Code OAuth or enter an API key in settings.');
  }

  const resolvedModel = resolveModelName(model);
  log(`Using ${usingOAuth ? 'OAuth' : 'API key'} auth, model: ${resolvedModel}`);

  // Build request
  const requestBody = buildRequestBody(prompt, resolvedModel, maxTokens, usingOAuth);

  // Make the request with retry on 401
  try {
    onProgress({ stage: 'sending', message: 'Sending to Claude API...' });
    const response = await makeRequest(token, usingOAuth, requestBody);
    return response;
  } catch (err) {
    // On 401, try reloading credentials once (token may have been refreshed)
    if (err.statusCode === 401 && usingOAuth) {
      log('Got 401, reloading OAuth credentials and retrying...');
      token = loadOAuthCredentials();
      if (token && isOAuthToken(token)) {
        try {
          const response = await makeRequest(token, true, requestBody);
          return response;
        } catch (retryErr) {
          log(`Retry failed: ${retryErr.message}`);
          throw retryErr;
        }
      }
    }
    throw err;
  }
}

/**
 * Build the Messages API request body
 * @param {string} prompt - User prompt
 * @param {string} model - Full model ID
 * @param {number} maxTokens - Max tokens
 * @param {boolean} usingOAuth - Whether using OAuth (requires system prompt)
 * @returns {string} JSON string of request body
 */
function buildRequestBody(prompt, model, maxTokens, usingOAuth) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'user', content: prompt }
    ]
  };

  // OAuth requires a system prompt for Claude Code
  if (usingOAuth) {
    body.system = 'You are Claude Code, Anthropic\'s official CLI for Claude.';
  }

  return JSON.stringify(body);
}

/**
 * Make an HTTPS request to the Anthropic API
 * @param {string} token - Auth token (OAuth or API key)
 * @param {boolean} usingOAuth - Whether token is OAuth
 * @param {string} requestBody - JSON request body
 * @returns {Promise<string>} Response text content
 */
function makeRequest(token, usingOAuth, requestBody) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_API_VERSION,
      'Content-Length': Buffer.byteLength(requestBody)
    };

    if (usingOAuth) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['anthropic-beta'] = 'oauth-2025-04-20';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      headers['User-Agent'] = 'YouTubeSummaryExtension/1.0';
      headers['X-App'] = 'youtube-summary-extension';
    } else {
      headers['x-api-key'] = token;
    }

    const options = {
      hostname: ANTHROPIC_API_HOST,
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            // Extract text from the response
            const textContent = json.content
              ?.filter(block => block.type === 'text')
              ?.map(block => block.text)
              ?.join('\n');

            if (textContent) {
              resolve(textContent);
            } else {
              reject(new Error('No text content in API response'));
            }
          } catch (parseErr) {
            reject(new Error(`Failed to parse API response: ${parseErr.message}`));
          }
        } else {
          let errorMsg = `Anthropic API error: ${res.statusCode}`;
          try {
            const json = JSON.parse(data);
            if (json.error && json.error.message) {
              errorMsg = json.error.message;
            }
          } catch (e) {
            // Use raw status code error
          }

          const err = new Error(errorMsg);
          err.statusCode = res.statusCode;
          reject(err);
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Network error: ${error.message}`));
    });

    // 2-minute timeout matching existing CLI behavior
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error('Anthropic API request timed out (2 minutes)'));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Check which authentication method is available
 * @param {string} [apiKey] - Optional user-provided API key
 * @returns {{method: string, available: boolean}} Auth status
 */
function checkAuthStatus(apiKey) {
  const oauthToken = loadOAuthCredentials();

  if (oauthToken && isOAuthToken(oauthToken)) {
    return { method: 'oauth', available: true };
  }

  if (apiKey) {
    return { method: 'api_key', available: true };
  }

  // Check if CLI is available as fallback
  try {
    const { execSync } = require('child_process');
    execSync('which claude 2>/dev/null || test -f ~/.claude/local/claude', { timeout: 3000 });
    return { method: 'cli', available: true };
  } catch {
    return { method: 'none', available: false };
  }
}

module.exports = {
  loadOAuthCredentials,
  isOAuthToken,
  resolveModelName,
  callAnthropicAPI,
  checkAuthStatus,
  // Exported for testing
  buildRequestBody,
  makeRequest
};
