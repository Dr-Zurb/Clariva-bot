import dns from 'dns';
import {
  installLookupFallback,
  lookupWithDirectFallback,
  type LookupDeps,
} from '../../../src/config/system-lookup';

function missed(code: string): NodeJS.ErrnoException {
  const error = new Error(`getaddrinfo ${code}`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function deps(overrides: Partial<LookupDeps> = {}): LookupDeps {
  return {
    lookup: (_hostname, _options, callback) => {
      callback(null, '203.0.113.5', 4);
    },
    resolve4: (_hostname, callback) => {
      callback(missed('ENOTFOUND'), []);
    },
    resolve6: (_hostname, callback) => {
      callback(missed('ENOTFOUND'), []);
    },
    ...overrides,
  };
}

describe('lookupWithDirectFallback', () => {
  it('keeps the system resolver result when that lookup works', () => {
    const resolve4 = jest.fn();
    return new Promise<void>((resolve, reject) => {
      lookupWithDirectFallback('example.test', {}, (error, address, family) => {
        try {
          expect(error).toBeNull();
          expect(address).toBe('203.0.113.5');
          expect(family).toBe(4);
          expect(resolve4).not.toHaveBeenCalled();
          resolve();
        } catch (failure) {
          reject(failure);
        }
      }, deps({ resolve4: resolve4 as unknown as LookupDeps['resolve4'] }));
    });
  });

  it('uses a direct A lookup when the system resolver misses', () => {
    return new Promise<void>((resolve, reject) => {
      lookupWithDirectFallback(
        'example.test',
        {},
        (error, address, family) => {
          try {
            expect(error).toBeNull();
            expect(address).toBe('203.0.113.10');
            expect(family).toBe(4);
            resolve();
          } catch (failure) {
            reject(failure);
          }
        },
        deps({
          lookup: (_hostname, _options, callback) => {
            callback(missed('ENOTFOUND'));
          },
          resolve4: (_hostname, callback) => {
            callback(null, ['203.0.113.10', '203.0.113.11']);
          },
        })
      );
    });
  });

  it('returns every direct address when the caller asked for all', () => {
    return new Promise<void>((resolve, reject) => {
      lookupWithDirectFallback(
        'example.test',
        { all: true },
        (error, address) => {
          try {
            expect(error).toBeNull();
            expect(address).toEqual([
              { address: '203.0.113.10', family: 4 },
              { address: '203.0.113.11', family: 4 },
            ]);
            resolve();
          } catch (failure) {
            reject(failure);
          }
        },
        deps({
          lookup: (_hostname, _options, callback) => {
            callback(missed('ENOTFOUND'));
          },
          resolve4: (_hostname, callback) => {
            callback(null, ['203.0.113.10', '203.0.113.11']);
          },
        })
      );
    });
  });

  it('keeps the original error when direct lookup also misses', () => {
    const error = missed('ENOTFOUND');
    return new Promise<void>((resolve, reject) => {
      lookupWithDirectFallback(
        'example.test',
        { family: 4 },
        (received) => {
          try {
            expect(received).toBe(error);
            resolve();
          } catch (failure) {
            reject(failure);
          }
        },
        deps({
          lookup: (_hostname, _options, callback) => {
            callback(error);
          },
        })
      );
    });
  });

  it('does not bypass a system error that is not a miss', () => {
    const error = missed('ECONNREFUSED');
    const resolve4 = jest.fn();
    return new Promise<void>((resolve, reject) => {
      lookupWithDirectFallback(
        'example.test',
        {},
        (received) => {
          try {
            expect(received).toBe(error);
            expect(resolve4).not.toHaveBeenCalled();
            resolve();
          } catch (failure) {
            reject(failure);
          }
        },
        deps({
          lookup: (_hostname, _options, callback) => {
            callback(error);
          },
          resolve4: resolve4 as unknown as LookupDeps['resolve4'],
        })
      );
    });
  });
});

describe('installLookupFallback', () => {
  const realLookup = dns.lookup;
  const realPromisesLookup = dns.promises.lookup;

  afterEach(() => {
    dns.lookup = realLookup;
    dns.promises.lookup = realPromisesLookup;
  });

  it('patches both lookup entry points', () => {
    installLookupFallback();
    installLookupFallback();
    expect(dns.lookup).not.toBe(realLookup);
    expect(dns.promises.lookup).not.toBe(realPromisesLookup);
  });
});
