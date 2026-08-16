import { formatRelativeTime } from './format-relative-time';

const NOW = Date.parse('2027-03-05T12:00:00Z');

describe('formatRelativeTime', () => {
  it('renders seconds ago', () => {
    expect(formatRelativeTime(new Date(NOW - 30 * 1000).toISOString(), NOW)).toBe('30 seconds ago');
  });

  it('renders minutes ago', () => {
    expect(formatRelativeTime(new Date(NOW - 5 * 60 * 1000).toISOString(), NOW)).toBe(
      '5 minutes ago',
    );
  });

  it('renders hours ago', () => {
    expect(formatRelativeTime(new Date(NOW - 3 * 60 * 60 * 1000).toISOString(), NOW)).toBe(
      '3 hours ago',
    );
  });

  it('renders days ago, using "yesterday" at exactly one day', () => {
    expect(formatRelativeTime(new Date(NOW - 24 * 60 * 60 * 1000).toISOString(), NOW)).toBe(
      'yesterday',
    );
    expect(formatRelativeTime(new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString(), NOW)).toBe(
      '3 days ago',
    );
  });

  it('renders weeks ago', () => {
    expect(formatRelativeTime(new Date(NOW - 14 * 24 * 60 * 60 * 1000).toISOString(), NOW)).toBe(
      '2 weeks ago',
    );
  });

  it('renders future instants as "in N ..."', () => {
    expect(formatRelativeTime(new Date(NOW + 3 * 60 * 60 * 1000).toISOString(), NOW)).toBe(
      'in 3 hours',
    );
  });
});
