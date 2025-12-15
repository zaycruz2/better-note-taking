import test from 'node:test';
import assert from 'node:assert/strict';

import { formatOutlookEvent } from '../services/outlookCalendar.js';

test('formatOutlookEvent formats all-day events', () => {
  const out = formatOutlookEvent(
    { subject: 'Offsite', isAllDay: true, start: { dateTime: '2025-12-15T00:00:00.0000000' } },
    '2025-12-15'
  );
  assert.equal(out, 'All Day - Offsite');
});

test('formatOutlookEvent formats timed events', () => {
  const out = formatOutlookEvent(
    { subject: 'Standup', isAllDay: false, start: { dateTime: '2025-12-15T10:00:00.000Z' } },
    '2025-12-15'
  );
  assert.match(out, /- Standup$/);
});


