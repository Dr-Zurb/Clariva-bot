import dns from 'dns';

/**
 * macOS getaddrinfo can answer "no such record" for a host that the DNS
 * servers in resolv.conf still resolve. Node fetch, HTTPS, and most clients
 * use that system lookup, so the process cannot reach Supabase and refuses
 * to boot. When the system lookup misses, ask those DNS servers directly.
 */

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address?: string | dns.LookupAddress[],
  family?: number
) => void;

type SystemLookup = (
  hostname: string,
  options: dns.LookupOptions,
  callback: LookupCallback
) => void;

type ResolveRecords = (
  hostname: string,
  callback: (error: NodeJS.ErrnoException | null, addresses: string[]) => void
) => void;

export interface LookupDeps {
  lookup: SystemLookup;
  resolve4: ResolveRecords;
  resolve6: ResolveRecords;
}

let originalLookup: SystemLookup | null = null;

function records(
  resolve: ResolveRecords,
  hostname: string
): Promise<string[] | null> {
  return new Promise((resolveRecords) => {
    resolve(hostname, (error, addresses) => {
      if (error || !addresses || addresses.length === 0) {
        resolveRecords(null);
        return;
      }
      resolveRecords(addresses);
    });
  });
}

function deliver(
  callback: LookupCallback,
  addresses: string[],
  family: number,
  all: boolean
): void {
  if (all) {
    callback(
      null,
      addresses.map((address) => ({ address, family }))
    );
    return;
  }
  callback(null, addresses[0], family);
}

export function lookupWithDirectFallback(
  hostname: string,
  options: dns.LookupOptions,
  callback: LookupCallback,
  deps: LookupDeps,
  onFallback?: (hostname: string) => void
): void {
  const all = options.all === true;
  const family = options.family ?? 0;

  deps.lookup(hostname, options, (error, address, resolvedFamily) => {
    if (!error) {
      callback(null, address, resolvedFamily);
      return;
    }
    if (error.code !== 'ENOTFOUND' && error.code !== 'EAI_AGAIN') {
      callback(error);
      return;
    }

    void (async (): Promise<void> => {
      try {
        const want4 = family === 0 || family === 4;
        const want6 = family === 0 || family === 6;
        const ipv4 = want4 ? await records(deps.resolve4, hostname) : null;
        if (ipv4) {
          onFallback?.(hostname);
          deliver(callback, ipv4, 4, all);
          return;
        }
        const ipv6 = want6 ? await records(deps.resolve6, hostname) : null;
        if (ipv6) {
          onFallback?.(hostname);
          deliver(callback, ipv6, 6, all);
          return;
        }
        callback(error);
      } catch {
        callback(error);
      }
    })();
  });
}

function patchedLookup(
  hostname: string,
  options?: dns.LookupOptions | number | LookupCallback,
  callback?: LookupCallback
): void {
  let normalized: dns.LookupOptions;
  let done: LookupCallback;
  if (typeof options === 'function') {
    normalized = {};
    done = options;
  } else if (typeof options === 'number') {
    normalized = { family: options };
    done = callback as LookupCallback;
  } else {
    normalized = options ?? {};
    done = callback as LookupCallback;
  }

  lookupWithDirectFallback(
    hostname,
    normalized,
    done,
    {
      lookup: originalLookup as SystemLookup,
      resolve4: (name, doneResolve) => {
        dns.resolve4(name, doneResolve);
      },
      resolve6: (name, doneResolve) => {
        dns.resolve6(name, doneResolve);
      },
    },
    noteFallback
  );
}

const noted = new Set<string>();

function noteFallback(hostname: string): void {
  if (noted.has(hostname)) return;
  noted.add(hostname);
  void import('./logger')
    .then(({ logger }) => {
      logger.warn({ hostname }, 'System DNS missed this host; used a direct lookup');
    })
    .catch(() => undefined);
}

function patchedPromisesLookup(
  hostname: string,
  options?: dns.LookupOptions
): Promise<{ address: string; family: number } | dns.LookupAddress[]> {
  const normalized = options ?? {};
  return new Promise((resolve, reject) => {
    patchedLookup(hostname, normalized, (error, address, family) => {
      if (error) {
        reject(error);
        return;
      }
      if (normalized.all) {
        resolve(address as dns.LookupAddress[]);
        return;
      }
      resolve({ address: address as string, family: family ?? 4 });
    });
  });
}

/**
 * Install the fallback for this process. Safe to call more than once.
 * dns.promises.lookup does not call dns.lookup, so both entry points are patched.
 */
export function installLookupFallback(): void {
  if (!originalLookup) {
    originalLookup = dns.lookup as unknown as SystemLookup;
  }
  dns.lookup = patchedLookup as typeof dns.lookup;
  dns.promises.lookup = patchedPromisesLookup as typeof dns.promises.lookup;
}
