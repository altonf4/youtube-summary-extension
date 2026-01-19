/**
 * Tests for apple-notes.js
 * Tests formatting and escaping functions
 */

const {
  formatNoteContent,
  escapeForAppleScript,
  escapeHtml,
  formatDisplayDate
} = require('./apple-notes');

describe('apple-notes', () => {
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
      const input = 'He said "hello"\nThen\\left';
      const expected = 'He said \\"hello\\"\\nThen\\\\left';
      expect(escapeForAppleScript(input)).toBe(expected);
    });

    it('returns empty string for empty input', () => {
      expect(escapeForAppleScript('')).toBe('');
    });

    it('handles normal text without escaping', () => {
      expect(escapeForAppleScript('normal text')).toBe('normal text');
    });
  });

  describe('escapeHtml', () => {
    it('escapes ampersands', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('escapes less than signs', () => {
      expect(escapeHtml('a < b')).toBe('a &lt; b');
    });

    it('escapes greater than signs', () => {
      expect(escapeHtml('a > b')).toBe('a &gt; b');
    });

    it('escapes double quotes', () => {
      expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
    });

    it('escapes single quotes', () => {
      expect(escapeHtml("it's")).toBe('it&#039;s');
    });

    it('handles HTML tags', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('handles multiple special characters', () => {
      const input = '<div class="test">Tom & Jerry\'s</div>';
      const expected = '&lt;div class=&quot;test&quot;&gt;Tom &amp; Jerry&#039;s&lt;/div&gt;';
      expect(escapeHtml(input)).toBe(expected);
    });

    it('returns empty string for empty input', () => {
      expect(escapeHtml('')).toBe('');
    });
  });

  describe('formatDisplayDate', () => {
    // Note: formatDisplayDate parses ISO dates which are interpreted as UTC
    // The output depends on local timezone, so we test the format rather than exact values
    it('formats ISO date string to readable format', () => {
      const result = formatDisplayDate('2024-03-15');
      // Should match format like "Mar 14, 2024" or "Mar 15, 2024" (timezone dependent)
      expect(result).toMatch(/^Mar 1[45], 2024$/);
    });

    it('returns a properly formatted date string', () => {
      const result = formatDisplayDate('2024-01-05');
      // Should match format like "Jan X, 2024"
      expect(result).toMatch(/^Jan \d{1,2}, 2024$/);
    });

    it('handles various dates with correct format', () => {
      const result = formatDisplayDate('2024-12-31');
      // Should match format like "Dec 30, 2024" or "Dec 31, 2024" (timezone dependent)
      expect(result).toMatch(/^Dec 3[01], 2024$/);
    });
  });

  describe('formatNoteContent', () => {
    const basicParams = {
      title: 'Test Video Title',
      url: 'https://youtube.com/watch?v=123',
      summary: 'This is the summary.',
      keyLearnings: ['Learning 1', 'Learning 2']
    };

    it('includes title in H1 tag', () => {
      const result = formatNoteContent(
        basicParams.title,
        basicParams.url,
        basicParams.summary,
        basicParams.keyLearnings
      );

      expect(result).toContain('<h1>Test Video Title</h1>');
    });

    it('includes clickable URL', () => {
      const result = formatNoteContent(
        basicParams.title,
        basicParams.url,
        basicParams.summary,
        basicParams.keyLearnings
      );

      expect(result).toContain(`<a href="${basicParams.url}">`);
      expect(result).toContain('URL:</b>');
    });

    it('includes summary in paragraph', () => {
      const result = formatNoteContent(
        basicParams.title,
        basicParams.url,
        basicParams.summary,
        basicParams.keyLearnings
      );

      expect(result).toContain('<h2>Summary</h2>');
      expect(result).toContain('This is the summary.');
    });

    it('includes key learnings as list items', () => {
      const result = formatNoteContent(
        basicParams.title,
        basicParams.url,
        basicParams.summary,
        basicParams.keyLearnings
      );

      expect(result).toContain('<h2>Key Learnings</h2>');
      expect(result).toContain('<li>Learning 1</li>');
      expect(result).toContain('<li>Learning 2</li>');
    });

    it('includes action items when provided', () => {
      const actionItems = [
        { text: 'Task 1', dueDate: '2024-03-15' },
        { text: 'Task 2', dueDate: null }
      ];

      const result = formatNoteContent(
        basicParams.title,
        basicParams.url,
        basicParams.summary,
        basicParams.keyLearnings,
        [],
        actionItems
      );

      expect(result).toContain('<h2>Action Items</h2>');
      expect(result).toContain('Task 1');
      // Date may be Mar 14 or Mar 15 depending on timezone
      expect(result).toMatch(/\(Due: Mar 1[45], 2024\)/);
      expect(result).toContain('Task 2');
    });

    it('omits action items section when empty', () => {
      const result = formatNoteContent(
        basicParams.title,
        basicParams.url,
        basicParams.summary,
        basicParams.keyLearnings,
        [],
        []
      );

      expect(result).not.toContain('<h2>Action Items</h2>');
    });

    it('includes relevant links when provided', () => {
      const links = [
        { text: 'Docs', url: 'https://docs.example.com', reason: 'Good documentation' },
        { text: 'Tutorial', url: 'https://tutorial.example.com' }
      ];

      const result = formatNoteContent(
        basicParams.title,
        basicParams.url,
        basicParams.summary,
        basicParams.keyLearnings,
        links
      );

      expect(result).toContain('<h2>Relevant Links</h2>');
      expect(result).toContain('<a href="https://docs.example.com">Docs</a>');
      expect(result).toContain('Good documentation');
      expect(result).toContain('<a href="https://tutorial.example.com">Tutorial</a>');
    });

    it('omits relevant links section when empty', () => {
      const result = formatNoteContent(
        basicParams.title,
        basicParams.url,
        basicParams.summary,
        basicParams.keyLearnings,
        []
      );

      expect(result).not.toContain('<h2>Relevant Links</h2>');
    });

    it('includes custom notes when provided', () => {
      const customNotes = '<p>My personal notes here</p>';

      const result = formatNoteContent(
        basicParams.title,
        basicParams.url,
        basicParams.summary,
        basicParams.keyLearnings,
        [],
        [],
        customNotes
      );

      expect(result).toContain('<h2>My Notes</h2>');
      expect(result).toContain('My personal notes here');
    });

    it('omits custom notes section when not provided', () => {
      const result = formatNoteContent(
        basicParams.title,
        basicParams.url,
        basicParams.summary,
        basicParams.keyLearnings
      );

      expect(result).not.toContain('<h2>My Notes</h2>');
    });

    it('escapes HTML in user-provided content', () => {
      const result = formatNoteContent(
        '<script>alert("xss")</script>',
        basicParams.url,
        'Summary with <b>tags</b>',
        ['Learning with <script>bad</script>']
      );

      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>alert');
    });

    it('converts newlines in summary to <br> tags', () => {
      const result = formatNoteContent(
        basicParams.title,
        basicParams.url,
        'Line 1\nLine 2\nLine 3',
        basicParams.keyLearnings
      );

      expect(result).toContain('Line 1<br>Line 2<br>Line 3');
    });

    it('includes current date', () => {
      const result = formatNoteContent(
        basicParams.title,
        basicParams.url,
        basicParams.summary,
        basicParams.keyLearnings
      );

      expect(result).toContain('Saved:</b>');
      // Should contain a date format like "January 15, 2024"
      expect(result).toMatch(/\w+ \d{1,2}, \d{4}/);
    });

    it('includes attribution footer', () => {
      const result = formatNoteContent(
        basicParams.title,
        basicParams.url,
        basicParams.summary,
        basicParams.keyLearnings
      );

      expect(result).toContain('Generated with Claude Code');
    });
  });
});
