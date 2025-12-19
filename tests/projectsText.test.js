import test from 'node:test';
import assert from 'node:assert/strict';

import { formatProjectsAsText } from '../utils/projectsText.ts';

test('formatProjectsAsText renders header and empty hint', () => {
  const out = formatProjectsAsText([]);
  assert.match(out, /^\[PROJECTS\]\n/);
});

test('formatProjectsAsText renders project lines with status and optional reason', () => {
  const out = formatProjectsAsText([
    {
      id: '1',
      user_id: 'u',
      name: 'AssistantOS',
      description: 'local AI assistant replacing cloud services',
      status: 'active',
      blocking_or_reason: 'mobile app connectivity',
      created_at: 'now',
      updated_at: 'now',
    },
    {
      id: '2',
      user_id: 'u',
      name: 'MonoFocus',
      description: 'calendar note-taking app',
      status: 'shipped',
      blocking_or_reason: null,
      created_at: 'now',
      updated_at: 'now',
    },
  ]);

  assert.match(out, /\nAssistantOS #active - local AI assistant replacing cloud services\n  - blocking: mobile app connectivity\n/);
  assert.match(out, /\nMonoFocus #shipped - calendar note-taking app\n/);
});

