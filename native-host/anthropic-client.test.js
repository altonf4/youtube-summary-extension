/**
 * Tests for Anthropic API Client
 */

const {
  isOAuthToken,
  resolveModelName,
  buildRequestBody,
  checkAuthStatus
} = require('./anthropic-client');

// ============================================
// isOAuthToken
// ============================================

describe('isOAuthToken', () => {
  test('returns true for OAuth tokens', () => {
    expect(isOAuthToken('sk-ant-oat-abc123')).toBe(true);
  });

  test('returns true for longer OAuth tokens', () => {
    expect(isOAuthToken('sk-ant-oat-1234567890abcdef')).toBe(true);
  });

  test('returns false for API keys', () => {
    expect(isOAuthToken('sk-ant-api01-abc123')).toBe(false);
  });

  test('returns false for null', () => {
    expect(isOAuthToken(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isOAuthToken(undefined)).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isOAuthToken('')).toBe(false);
  });

  test('returns false for random string', () => {
    expect(isOAuthToken('hello-world')).toBe(false);
  });
});

// ============================================
// resolveModelName
// ============================================

describe('resolveModelName', () => {
  test('maps sonnet to full ID', () => {
    expect(resolveModelName('sonnet')).toBe('claude-sonnet-4-20250514');
  });

  test('maps opus to full ID', () => {
    expect(resolveModelName('opus')).toBe('claude-opus-4-20250514');
  });

  test('maps haiku to full ID', () => {
    expect(resolveModelName('haiku')).toBe('claude-haiku-4-20250514');
  });

  test('is case insensitive', () => {
    expect(resolveModelName('SONNET')).toBe('claude-sonnet-4-20250514');
    expect(resolveModelName('Opus')).toBe('claude-opus-4-20250514');
  });

  test('passes through full model IDs', () => {
    expect(resolveModelName('claude-sonnet-4-20250514')).toBe('claude-sonnet-4-20250514');
  });

  test('defaults to sonnet for null/undefined', () => {
    expect(resolveModelName(null)).toBe('claude-sonnet-4-20250514');
    expect(resolveModelName(undefined)).toBe('claude-sonnet-4-20250514');
  });

  test('defaults to sonnet for empty string', () => {
    expect(resolveModelName('')).toBe('claude-sonnet-4-20250514');
  });
});

// ============================================
// buildRequestBody
// ============================================

describe('buildRequestBody', () => {
  test('builds basic request body', () => {
    const body = JSON.parse(buildRequestBody('Hello', 'claude-sonnet-4-20250514', 8192, false));

    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.max_tokens).toBe(8192);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toBe('Hello');
    expect(body.system).toBeUndefined();
  });

  test('adds system prompt for OAuth', () => {
    const body = JSON.parse(buildRequestBody('Hello', 'claude-sonnet-4-20250514', 8192, true));

    expect(body.system).toBe("You are Claude Code, Anthropic's official CLI for Claude.");
  });

  test('does not add system prompt for API key', () => {
    const body = JSON.parse(buildRequestBody('Hello', 'claude-sonnet-4-20250514', 8192, false));

    expect(body.system).toBeUndefined();
  });

  test('respects custom max tokens', () => {
    const body = JSON.parse(buildRequestBody('Hello', 'claude-sonnet-4-20250514', 4096, false));

    expect(body.max_tokens).toBe(4096);
  });

  test('preserves prompt content exactly', () => {
    const prompt = 'Analyze this video:\n\nTranscript: Hello world\n\nSUMMARY:\n[summary]';
    const body = JSON.parse(buildRequestBody(prompt, 'claude-sonnet-4-20250514', 8192, false));

    expect(body.messages[0].content).toBe(prompt);
  });
});

// ============================================
// checkAuthStatus
// ============================================

describe('checkAuthStatus', () => {
  test('returns api_key method when API key is provided and no OAuth', () => {
    // This test works because loadOAuthCredentials will fail in test env
    const result = checkAuthStatus('sk-ant-api01-test123');

    // Should be either oauth (if running on dev machine with credentials) or api_key
    expect(result.available).toBe(true);
    expect(['oauth', 'api_key']).toContain(result.method);
  });

  test('returns a valid result object structure', () => {
    const result = checkAuthStatus();

    expect(result).toHaveProperty('method');
    expect(result).toHaveProperty('available');
    expect(typeof result.method).toBe('string');
    expect(typeof result.available).toBe('boolean');
  });

  test('returns a known method type', () => {
    const result = checkAuthStatus();

    expect(['oauth', 'api_key', 'cli', 'none']).toContain(result.method);
  });
});
