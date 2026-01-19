/**
 * Tests for apple-reminders.js
 * Tests escaping and input validation
 */

const { escapeForAppleScript } = require('./apple-reminders');

describe('apple-reminders', () => {
  describe('escapeForAppleScript', () => {
    it('escapes backslashes', () => {
      expect(escapeForAppleScript('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('escapes double quotes', () => {
      expect(escapeForAppleScript('say "hello"')).toBe('say \\"hello\\"');
    });

    it('escapes newlines', () => {
      expect(escapeForAppleScript('line1\nline2')).toBe('line1\\nline2');
    });

    it('escapes carriage returns', () => {
      expect(escapeForAppleScript('line1\rline2')).toBe('line1\\rline2');
    });

    it('handles multiple escape characters together', () => {
      const input = 'Task: "Buy groceries"\nNote\\path';
      const expected = 'Task: \\"Buy groceries\\"\\nNote\\\\path';
      expect(escapeForAppleScript(input)).toBe(expected);
    });

    it('returns empty string for null input', () => {
      expect(escapeForAppleScript(null)).toBe('');
    });

    it('returns empty string for undefined input', () => {
      expect(escapeForAppleScript(undefined)).toBe('');
    });

    it('returns empty string for empty string input', () => {
      expect(escapeForAppleScript('')).toBe('');
    });

    it('handles normal text without escaping', () => {
      expect(escapeForAppleScript('normal text')).toBe('normal text');
    });

    it('handles special characters in reminder titles', () => {
      const title = 'Review "Chapter 5" & take notes\nSchedule follow-up';
      const escaped = escapeForAppleScript(title);

      expect(escaped).toContain('\\"Chapter 5\\"');
      expect(escaped).toContain('\\n');
      // Note: & is not escaped for AppleScript
      expect(escaped).toContain('&');
    });

    it('handles URLs in reminder body', () => {
      const url = 'https://youtube.com/watch?v=abc123&t=120';
      const escaped = escapeForAppleScript(url);

      // URL should remain mostly unchanged except for any quotes
      expect(escaped).toBe(url);
    });

    it('handles complex video titles', () => {
      const title = 'How to "10x" Your Productivity\\Workflow Tips';
      const expected = 'How to \\"10x\\" Your Productivity\\\\Workflow Tips';

      expect(escapeForAppleScript(title)).toBe(expected);
    });
  });
});
