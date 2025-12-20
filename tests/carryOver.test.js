import test from 'node:test';
import assert from 'node:assert/strict';

import { getCarryOverDoingItems } from '../utils/textManager.ts';

test('getCarryOverDoingItems pulls unfinished DOING from most recent prior date', () => {
  const content = [
    '2025-12-19',
    '========================================',
    '[EVENTS]',
    '',
    '[DOING]',
    '- Task A',
    'x Task B',
    'Plain task C',
    '',
    '[DONE]',
    'x Something else',
    '',
    '[NOTES]',
    '',
    '',
    '2025-12-20',
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

  const out = getCarryOverDoingItems(content, '2025-12-20');
  assert.deepEqual(out, ['- Task A', 'Plain task C']);
});

test('getCarryOverDoingItems returns empty when no prior date exists', () => {
  const content = [
    '2025-12-20',
    '========================================',
    '[EVENTS]',
    '',
    '[DOING]',
    '- Task A',
    '',
    '[DONE]',
    '',
    '[NOTES]',
    '',
  ].join('\n');

  const out = getCarryOverDoingItems(content, '2025-12-20');
  assert.deepEqual(out, []);
});

