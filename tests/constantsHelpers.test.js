import test from 'node:test';
import assert from 'node:assert/strict';

import { extractDatesFromContent, contentHasDate, isEmptyTemplate } from '../utils/constants.ts';

test('extractDatesFromContent returns unique dates newest-first', () => {
  const content = `2025-01-01
========================================
[EVENTS]

2025-01-03
========================================
[NOTES]
hello

2025-01-03
[DOING]
x done`;

  const dates = extractDatesFromContent(content);
  assert.deepEqual(dates, ['2025-01-03', '2025-01-01']);
});

test('contentHasDate matches date at start of line', () => {
  const content = `2025-01-01
========================================
[NOTES]
hi
`;
  assert.equal(contentHasDate(content, '2025-01-01'), true);
  assert.equal(contentHasDate(content, '2025-01-02'), false);
});

test('isEmptyTemplate true for empty single-day skeleton', () => {
  const skeleton = `2025-01-01
========================================
[EVENTS]

[DOING]

[DONE]

[NOTES]
`;
  assert.equal(isEmptyTemplate(skeleton), true);
});

test('isEmptyTemplate false when any section has content', () => {
  const notEmpty = `2025-01-01
========================================
[NOTES]
some note
`;
  assert.equal(isEmptyTemplate(notEmpty), false);
});

