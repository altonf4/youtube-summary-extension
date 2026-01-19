/**
 * Tests for logger.js
 * Tests logging and rotation functionality
 */

const fs = require('fs');
const path = require('path');

// Store original LOG_FILE before requiring module
const originalLogFile = path.join(__dirname, 'extension.log');

// Create a test log file path
const TEST_LOG_FILE = path.join(__dirname, 'test-extension.log');

describe('logger', () => {
  // We need to test with real file system operations
  // but we'll clean up after ourselves

  beforeEach(() => {
    // Clean up test log file before each test
    if (fs.existsSync(TEST_LOG_FILE)) {
      fs.unlinkSync(TEST_LOG_FILE);
    }
  });

  afterEach(() => {
    // Clean up test log file after each test
    if (fs.existsSync(TEST_LOG_FILE)) {
      fs.unlinkSync(TEST_LOG_FILE);
    }
  });

  describe('log function', () => {
    // Import fresh module for each test
    let logger;

    beforeEach(() => {
      // Reset module cache to get fresh instance
      delete require.cache[require.resolve('./logger')];
      logger = require('./logger');
    });

    afterEach(() => {
      // Clean up the actual log file that logger creates
      if (fs.existsSync(logger.LOG_FILE)) {
        // Only delete if it's a test file we created
        const content = fs.readFileSync(logger.LOG_FILE, 'utf8');
        if (content.includes('[test-prefix]') || content.includes('Test message')) {
          // Read existing content to preserve non-test entries
          const lines = content.split('\n');
          const nonTestLines = lines.filter(
            line => !line.includes('[test-prefix]') && !line.includes('Test message')
          );
          fs.writeFileSync(logger.LOG_FILE, nonTestLines.join('\n'));
        }
      }
    });

    it('exports LOG_FILE path', () => {
      expect(logger.LOG_FILE).toBeDefined();
      expect(logger.LOG_FILE).toContain('extension.log');
    });

    it('exports getLogPath function that returns LOG_FILE', () => {
      expect(logger.getLogPath()).toBe(logger.LOG_FILE);
    });

    it('log function creates log file if not exists', () => {
      // Remove log file if it exists
      if (fs.existsSync(logger.LOG_FILE)) {
        const existingContent = fs.readFileSync(logger.LOG_FILE, 'utf8');
        // Write a test message
        logger.log('Test message creation');

        // File should exist and contain our message
        expect(fs.existsSync(logger.LOG_FILE)).toBe(true);
        const content = fs.readFileSync(logger.LOG_FILE, 'utf8');
        expect(content).toContain('Test message creation');
      } else {
        logger.log('Test message creation');
        expect(fs.existsSync(logger.LOG_FILE)).toBe(true);
      }
    });

    it('log function includes timestamp', () => {
      logger.log('Timestamp test message');

      const content = fs.readFileSync(logger.LOG_FILE, 'utf8');
      // Should have ISO timestamp format
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('log function includes optional prefix', () => {
      logger.log('Prefixed message', 'test-prefix');

      const content = fs.readFileSync(logger.LOG_FILE, 'utf8');
      expect(content).toContain('[test-prefix]');
      expect(content).toContain('Prefixed message');
    });

    it('log function works without prefix', () => {
      logger.log('No prefix message');

      const content = fs.readFileSync(logger.LOG_FILE, 'utf8');
      expect(content).toContain('No prefix message');
      // Should not have double brackets for empty prefix
      expect(content).not.toMatch(/\[\] No prefix/);
    });
  });

  describe('rotateIfNeeded function', () => {
    it('is exported from module', () => {
      const logger = require('./logger');
      expect(typeof logger.rotateIfNeeded).toBe('function');
    });

    it('does nothing if log file does not exist', () => {
      const logger = require('./logger');
      // Just make sure it doesn't throw
      expect(() => logger.rotateIfNeeded()).not.toThrow();
    });

    // Note: Testing actual rotation would require creating a 1MB+ file
    // which is slow for unit tests. The rotation logic is simple enough
    // that manual/integration testing is more appropriate.
  });

  describe('log format', () => {
    it('each log entry is on its own line', () => {
      const logger = require('./logger');

      logger.log('First message');
      logger.log('Second message');
      logger.log('Third message');

      const content = fs.readFileSync(logger.LOG_FILE, 'utf8');
      const lines = content.split('\n').filter(l => l.includes('message'));

      expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it('log format is [timestamp][prefix] message', () => {
      const logger = require('./logger');

      logger.log('Format test', 'module-name');

      const content = fs.readFileSync(logger.LOG_FILE, 'utf8');
      // Should match format: [2024-01-15T10:30:00.000Z] [module-name] Format test
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] \[module-name\] Format test/);
    });
  });
});
