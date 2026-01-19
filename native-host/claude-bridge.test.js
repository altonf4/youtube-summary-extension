/**
 * Tests for claude-bridge.js
 * Tests the prompt creation and response parsing functions
 */

const {
  createPrompt,
  parseResponse,
  createFollowUpPrompt,
  parseFollowUpResponse,
  parseAsPlainText,
  DEFAULT_INSTRUCTIONS
} = require('./claude-bridge');

describe('claude-bridge', () => {
  describe('createPrompt', () => {
    it('creates a basic prompt with video title and transcript', () => {
      const prompt = createPrompt('Test Video', 'This is a transcript');

      expect(prompt).toContain('Test Video');
      expect(prompt).toContain('This is a transcript');
      expect(prompt).toContain('SUMMARY:');
      expect(prompt).toContain('KEY LEARNINGS:');
      expect(prompt).toContain('ACTION ITEMS:');
      expect(prompt).toContain('RELEVANT LINKS:');
    });

    it('includes custom instructions when provided', () => {
      const customInstructions = 'Focus on technical details only';
      const prompt = createPrompt('Test Video', 'Transcript', '', [], [], [], customInstructions);

      expect(prompt).toContain(customInstructions);
      expect(prompt).not.toContain(DEFAULT_INSTRUCTIONS);
    });

    it('uses default instructions when custom not provided', () => {
      const prompt = createPrompt('Test Video', 'Transcript');

      expect(prompt).toContain('Main arguments and conclusions');
    });

    it('truncates long transcripts at 50000 characters', () => {
      const longTranscript = 'a'.repeat(60000);
      const prompt = createPrompt('Test Video', longTranscript);

      expect(prompt).toContain('...[truncated]');
      expect(prompt.length).toBeLessThan(longTranscript.length + 5000);
    });

    it('truncates long descriptions at 5000 characters', () => {
      const longDescription = 'b'.repeat(6000);
      const prompt = createPrompt('Test Video', 'Transcript', longDescription);

      expect(prompt).toContain('...[truncated]');
    });

    it('includes description links when provided', () => {
      const links = [
        { text: 'Link 1', url: 'https://example.com/1' },
        { text: 'Link 2', url: 'https://example.com/2' }
      ];
      const prompt = createPrompt('Test Video', 'Transcript', 'Description', links);

      expect(prompt).toContain('Links from Description:');
      expect(prompt).toContain('1. Link 1: https://example.com/1');
      expect(prompt).toContain('2. Link 2: https://example.com/2');
    });

    it('includes creator comments with proper formatting', () => {
      const creatorComments = [
        { text: 'This is an important clarification from me', likes: 100 }
      ];
      const prompt = createPrompt('Test Video', 'Transcript', '', [], creatorComments, []);

      expect(prompt).toContain('CREATOR COMMENTS/REPLIES');
      expect(prompt).toContain('authoritative additions');
      expect(prompt).toContain('This is an important clarification from me');
      expect(prompt).toContain('CREATOR ADDITIONS:');
    });

    it('filters out short creator comments (< 15 chars)', () => {
      const creatorComments = [
        { text: 'Short', likes: 100 },
        { text: 'This is a longer valid comment', likes: 50 }
      ];
      const prompt = createPrompt('Test Video', 'Transcript', '', [], creatorComments, []);

      expect(prompt).not.toContain('"Short"');
      expect(prompt).toContain('This is a longer valid comment');
    });

    it('includes viewer comments with filtering (>= 30 chars, >= 10 likes)', () => {
      const viewerComments = [
        { text: 'Short', likes: 100 },
        { text: 'This comment is long enough but has few likes', likes: 5 },
        { text: 'This is a great comment with good engagement', likes: 50 }
      ];
      const prompt = createPrompt('Test Video', 'Transcript', '', [], [], viewerComments);

      expect(prompt).toContain('Top Viewer Comments');
      expect(prompt).toContain('[50 likes]');
      expect(prompt).toContain('This is a great comment with good engagement');
      expect(prompt).not.toContain('[5 likes]');
    });

    it('omits creator additions section when no creator comments', () => {
      const prompt = createPrompt('Test Video', 'Transcript');

      expect(prompt).not.toContain('CREATOR ADDITIONS:');
    });
  });

  describe('parseResponse', () => {
    it('parses a well-formatted response', () => {
      const response = `
SUMMARY:
This is the summary of the video.

KEY LEARNINGS:
- First learning
- Second learning
- Third learning

ACTION ITEMS:
- Try implementing feature X
- Research topic Y

RELEVANT LINKS:
- 1. Useful documentation
- 2. Related tutorial
      `;

      const descriptionLinks = [
        { text: 'Docs', url: 'https://docs.example.com' },
        { text: 'Tutorial', url: 'https://tutorial.example.com' }
      ];

      const result = parseResponse(response, descriptionLinks);

      expect(result.summary).toBe('This is the summary of the video.');
      expect(result.keyLearnings).toHaveLength(3);
      expect(result.keyLearnings[0]).toBe('First learning');
      expect(result.actionItems).toHaveLength(2);
      expect(result.actionItems[0]).toBe('Try implementing feature X');
      expect(result.relevantLinks).toHaveLength(2);
      expect(result.relevantLinks[0].url).toBe('https://docs.example.com');
    });

    it('handles bullet points with various formats', () => {
      const response = `
SUMMARY:
Summary text.

KEY LEARNINGS:
• Bullet with dot
- Bullet with dash
1. Numbered item

ACTION ITEMS:
- Action one

RELEVANT LINKS:
None
      `;

      const result = parseResponse(response);

      expect(result.keyLearnings).toHaveLength(3);
      expect(result.keyLearnings).toContain('Bullet with dot');
      expect(result.keyLearnings).toContain('Bullet with dash');
      expect(result.keyLearnings).toContain('Numbered item');
    });

    it('handles "no action items" responses', () => {
      const response = `
SUMMARY:
Summary text.

KEY LEARNINGS:
- Learning one

ACTION ITEMS:
No specific action items identified.

RELEVANT LINKS:
None
      `;

      const result = parseResponse(response);

      expect(result.actionItems).toHaveLength(0);
    });

    it('handles creator additions and marks them', () => {
      const response = `
SUMMARY:
Summary text.

KEY LEARNINGS:
- Regular learning

CREATOR ADDITIONS:
- Creator shared this insight
- Another creator insight

ACTION ITEMS:
- Do something

RELEVANT LINKS:
None
      `;

      const result = parseResponse(response);

      expect(result.keyLearnings).toContain('Regular learning');
      expect(result.keyLearnings).toContain('[From Creator] Creator shared this insight');
      expect(result.keyLearnings).toContain('[From Creator] Another creator insight');
    });

    it('handles "no creator additions" responses', () => {
      const response = `
SUMMARY:
Summary text.

KEY LEARNINGS:
- Learning

CREATOR ADDITIONS:
No additional insights from creator comments.

ACTION ITEMS:
- Action

RELEVANT LINKS:
None
      `;

      const result = parseResponse(response);

      // Should only have the regular learning, no creator marked items
      expect(result.keyLearnings).toHaveLength(1);
      expect(result.keyLearnings[0]).toBe('Learning');
    });

    it('matches links by number from description', () => {
      const response = `
SUMMARY:
Summary.

KEY LEARNINGS:
- Learning

ACTION ITEMS:
- Action

RELEVANT LINKS:
- 1. Great documentation
- 3. Helpful resource
      `;

      const descriptionLinks = [
        { text: 'Docs', url: 'https://docs.example.com' },
        { text: 'Blog', url: 'https://blog.example.com' },
        { text: 'Resource', url: 'https://resource.example.com' }
      ];

      const result = parseResponse(response, descriptionLinks);

      expect(result.relevantLinks).toHaveLength(2);
      expect(result.relevantLinks[0].url).toBe('https://docs.example.com');
      expect(result.relevantLinks[0].reason).toBe('Great documentation');
      expect(result.relevantLinks[1].url).toBe('https://resource.example.com');
    });

    it('returns fallback when no key learnings found', () => {
      const response = `
SUMMARY:
Just a summary without learnings.
      `;

      const result = parseResponse(response);

      expect(result.keyLearnings.length).toBeGreaterThan(0);
      expect(result.keyLearnings[0]).toContain('No key learnings');
    });

    it('handles malformed response gracefully', () => {
      const response = 'Random text without any formatting';

      const result = parseResponse(response);

      expect(result.summary).toBeTruthy();
      expect(result.keyLearnings).toBeDefined();
      expect(result.actionItems).toBeDefined();
      expect(result.relevantLinks).toBeDefined();
    });
  });

  describe('createFollowUpPrompt', () => {
    it('creates prompt with query and transcript', () => {
      const prompt = createFollowUpPrompt(
        'Test Video',
        'This is the transcript',
        'What tools were mentioned?',
        []
      );

      expect(prompt).toContain('Test Video');
      expect(prompt).toContain('This is the transcript');
      expect(prompt).toContain('What tools were mentioned?');
      expect(prompt).toContain('follow-up question');
    });

    it('includes existing learnings to avoid repetition', () => {
      const existingLearnings = ['Learning 1', 'Learning 2'];
      const prompt = createFollowUpPrompt(
        'Test Video',
        'Transcript',
        'What else?',
        existingLearnings
      );

      expect(prompt).toContain('Already extracted learnings');
      expect(prompt).toContain('Learning 1');
      expect(prompt).toContain('Learning 2');
      expect(prompt).toContain('avoid repeating');
    });

    it('truncates long transcripts', () => {
      const longTranscript = 'a'.repeat(60000);
      const prompt = createFollowUpPrompt('Test', longTranscript, 'Query', []);

      expect(prompt).toContain('...[truncated]');
    });

    it('requests JSON format with insight/action classification', () => {
      const prompt = createFollowUpPrompt('Test Video', 'Transcript', 'Query', []);

      expect(prompt).toContain('insight');
      expect(prompt).toContain('action');
      expect(prompt).toContain('"items"');
      expect(prompt).toContain('"type"');
      expect(prompt).toContain('JSON');
    });
  });

  describe('parseFollowUpResponse', () => {
    describe('JSON parsing', () => {
      it('parses valid JSON response with insights and actions', () => {
        const response = `{
          "items": [
            { "type": "insight", "text": "First insight from video" },
            { "type": "action", "text": "Try implementing this feature" },
            { "type": "insight", "text": "Second insight here" },
            { "type": "action", "text": "Research more about this topic" }
          ]
        }`;

        const result = parseFollowUpResponse(response);

        expect(result.insights).toHaveLength(2);
        expect(result.actions).toHaveLength(2);
        expect(result.insights[0]).toBe('First insight from video');
        expect(result.insights[1]).toBe('Second insight here');
        expect(result.actions[0]).toBe('Try implementing this feature');
        expect(result.actions[1]).toBe('Research more about this topic');
      });

      it('parses JSON wrapped in markdown code blocks', () => {
        const response = `Here are the insights:

\`\`\`json
{
  "items": [
    { "type": "insight", "text": "Important fact" },
    { "type": "action", "text": "Implement the solution" }
  ]
}
\`\`\`

Hope this helps!`;

        const result = parseFollowUpResponse(response);

        expect(result.insights).toHaveLength(1);
        expect(result.actions).toHaveLength(1);
        expect(result.insights[0]).toBe('Important fact');
        expect(result.actions[0]).toBe('Implement the solution');
      });

      it('parses JSON wrapped in code blocks without json label', () => {
        const response = `\`\`\`
{
  "items": [
    { "type": "insight", "text": "A fact from the video" }
  ]
}
\`\`\``;

        const result = parseFollowUpResponse(response);

        expect(result.insights).toHaveLength(1);
        expect(result.actions).toHaveLength(0);
        expect(result.insights[0]).toBe('A fact from the video');
      });

      it('handles JSON with only insights (no actions)', () => {
        const response = `{
          "items": [
            { "type": "insight", "text": "Insight one" },
            { "type": "insight", "text": "Insight two" }
          ]
        }`;

        const result = parseFollowUpResponse(response);

        expect(result.insights).toHaveLength(2);
        expect(result.actions).toHaveLength(0);
      });

      it('handles JSON with only actions (no insights)', () => {
        const response = `{
          "items": [
            { "type": "action", "text": "Do this first" },
            { "type": "action", "text": "Then do this" }
          ]
        }`;

        const result = parseFollowUpResponse(response);

        expect(result.insights).toHaveLength(0);
        expect(result.actions).toHaveLength(2);
      });

      it('handles empty items array', () => {
        const response = `{ "items": [] }`;

        const result = parseFollowUpResponse(response);

        expect(result.insights).toHaveLength(0);
        expect(result.actions).toHaveLength(0);
      });
    });

    describe('fallback to plain text', () => {
      it('falls back to plain text when JSON is invalid', () => {
        const response = `{
          "items": [
            { "type": "insight", "text": "Unclosed JSON
        `;

        const result = parseFollowUpResponse(response);

        // Should fall back to plain text parsing, treating as insights
        expect(result.insights).toBeDefined();
        expect(result.actions).toEqual([]);
      });

      it('falls back when response has no items array', () => {
        const response = `{ "data": "wrong format" }`;

        const result = parseFollowUpResponse(response);

        expect(result.insights).toBeDefined();
        expect(result.actions).toEqual([]);
      });

      it('extracts bullet points as insights in fallback mode', () => {
        const response = `
- First insight
- Second insight
- Third insight
        `;

        const result = parseFollowUpResponse(response);

        expect(result.insights).toHaveLength(3);
        expect(result.actions).toHaveLength(0);
        expect(result.insights[0]).toBe('First insight');
        expect(result.insights[1]).toBe('Second insight');
      });

      it('handles numbered lists as insights in fallback mode', () => {
        const response = `
1. First point
2. Second point
3. Third point
        `;

        const result = parseFollowUpResponse(response);

        expect(result.insights).toHaveLength(3);
        expect(result.insights[0]).toBe('First point');
      });

      it('returns whole response as insight if short and no bullets', () => {
        const response = 'This is a single paragraph response.';

        const result = parseFollowUpResponse(response);

        expect(result.insights).toHaveLength(1);
        expect(result.insights[0]).toBe('This is a single paragraph response.');
        expect(result.actions).toHaveLength(0);
      });

      it('splits long non-bullet response into sentence insights', () => {
        // Response must be > 500 chars to trigger sentence splitting
        const sentences = [
          'First sentence here is interesting and provides valuable context about the topic being discussed in great detail and depth',
          'Second sentence with more detail about specific aspects that were mentioned during the video presentation today',
          'Third sentence explains further concepts and ideas that relate to the main topic at hand in the discussion',
          'Fourth sentence provides additional examples and clarifications for better understanding of the material',
          'Fifth sentence concludes with important takeaways and final thoughts on the matter that was discussed'
        ];
        const response = sentences.join('. ') + '.';

        expect(response.length).toBeGreaterThan(500);

        const result = parseFollowUpResponse(response);

        expect(result.insights.length).toBeGreaterThan(1);
        expect(result.insights.length).toBeLessThanOrEqual(5);
        expect(result.insights[0]).toContain('First sentence');
        expect(result.actions).toHaveLength(0);
      });

      it('handles mixed format with bullets as insights', () => {
        const response = `
Here are the insights:
- First bullet point
• Second with dot
- Third point
        `;

        const result = parseFollowUpResponse(response);

        expect(result.insights).toHaveLength(3);
        expect(result.actions).toHaveLength(0);
      });
    });
  });

  describe('parseAsPlainText', () => {
    it('extracts bullet points from text', () => {
      const text = `
- First item
- Second item
- Third item
      `;

      const result = parseAsPlainText(text);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe('First item');
    });

    it('handles numbered lists', () => {
      const text = `
1. First
2. Second
      `;

      const result = parseAsPlainText(text);

      expect(result).toHaveLength(2);
    });

    it('returns short text as single item', () => {
      const text = 'Short response';

      const result = parseAsPlainText(text);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('Short response');
    });

    it('splits long text into sentences', () => {
      const sentences = [
        'This is a fairly long first sentence that provides valuable context about the topic being discussed in great detail',
        'This is another sentence with more information about specific aspects that were mentioned during the presentation',
        'A third sentence adds more detail to the topic at hand and explains the concepts further for better understanding',
        'Fourth sentence continues the explanation with additional examples and clarifications that help illustrate the point',
        'Fifth sentence wraps up the discussion with important takeaways and final thoughts on the matter discussed'
      ];
      const text = sentences.join('. ') + '.';

      expect(text.length).toBeGreaterThan(500);

      const result = parseAsPlainText(text);

      expect(result.length).toBeGreaterThan(1);
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });
});
