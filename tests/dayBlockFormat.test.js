import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDayBlock } from '../utils/constants.ts';
import { dedupeDateBlocks } from '../utils/textManager.ts';

test('buildDayBlock does not create double blank lines between sections', () => {
  const out = buildDayBlock({
    dateStr: '2025-12-17',
    events: ['09:00 AM - Meeting'],
    doing: ['- Task'],
    done: [],
    notes: [],
  });

  // No triple-newline sequences in a freshly generated block
  assert.equal(out.includes('\n\n\n'), false);

  // Has the expected headers in order
  assert.match(out, /\[EVENTS\]\n09:00 AM - Meeting\n\n\[DOING\]\n- Task\n\n\[DONE\]\n\n\[NOTES\]\n/);
});

test('dedupeDateBlocks does not add double blank lines between days', () => {
  const input = [
    '2025-12-16',
    '========================================',
    '[EVENTS]',
    '',
    '[DOING]',
    '',
    '[DONE]',
    '',
    '[NOTES]',
    '',
    '',
    '2025-12-17',
    '========================================',
    '[EVENTS]',
    '',
    '[DOING]',
    '',
    '[DONE]',
    '',
    '[NOTES]',
    '',
  ].join('\n');

  const out = dedupeDateBlocks(input);

  // Ensure only a single blank line before the next date header (no 2+ empty lines)
  assert.equal(/\n\n\n2025-12-17/.test(out), false);
  assert.equal(/\n\n2025-12-17/.test(out), true);
});


