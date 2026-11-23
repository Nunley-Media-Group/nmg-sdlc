import { describe, expect, it } from '@jest/globals';
import { retryingRun } from '../sdlc-execute.mjs';

// Runs one `gh` call through `retryingRun` with a runner that always returns `response`; `sleep` records each backoff delay.
function runAlwaysFailing(response) {
  const calls = [];
  const sleeps = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    return response;
  };
  const wrapped = retryingRun(run, { sleep: (milliseconds) => sleeps.push(milliseconds) });
  const result = wrapped('gh', ['issue', 'view', '42'], {});
  return { result, calls, sleeps };
}

const failure = (stderr) => ({ status: 1, stdout: '', stderr });

describe('@SCN001 an issue number is not a transient failure (AC1, #603)', () => {
  it.each([502, 503, 504])(
    'runs once without a backoff sleep and returns the failure when the output names issue number %i',
    (number) => {
      const response = failure(`GraphQL: Could not resolve to an issue or pull request with the number of ${number}. (repository.issue)`);
      const { result, calls, sleeps } = runAlwaysFailing(response);
      expect(calls).toHaveLength(1);
      expect(sleeps).toEqual([]);
      expect(result).toEqual(response);
    },
  );
});

describe('@SCN002 real HTTP 5xx failures are still retried (AC2, #603)', () => {
  it.each([
    'HTTP 502',
    'HTTP 503',
    'HTTP 504',
    '502 Bad Gateway',
    '503 Service Unavailable',
    '504 Gateway Timeout',
  ])('runs four times with backoff sleeps of 1000, 2000 and 4000 ms for the output "%s"', (stderr) => {
    const response = failure(stderr);
    const { result, calls, sleeps } = runAlwaysFailing(response);
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(result).toEqual(response);
  });
});

describe('@SCN003 other transient signals are unchanged (AC3, #603)', () => {
  it.each([
    'request timed out',
    'connection reset by peer',
    'connection refused',
    'could not resolve host: api.github.com',
    'TLS handshake timeout',
    'unexpected EOF',
  ])('runs four times with backoff sleeps of 1000, 2000 and 4000 ms for the output "%s"', (stderr) => {
    const { calls, sleeps } = runAlwaysFailing(failure(stderr));
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });

  it('runs four times with backoff sleeps of 1000, 2000 and 4000 ms for a spawn error with code EPIPE', () => {
    const { calls, sleeps } = runAlwaysFailing({ status: 1, stdout: '', stderr: '', error: { code: 'EPIPE' } });
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });
});
