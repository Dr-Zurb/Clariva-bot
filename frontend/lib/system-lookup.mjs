import dns from "node:dns";

/**
 * macOS getaddrinfo can answer "no such record" for a host that still
 * resolves through the DNS servers in resolv.conf. Next's server calls
 * Supabase Auth with that lookup, so local sign-in dies while the deployed
 * site, on a resolver that works, signs in normally.
 */

let originalLookup = null;
const noted = new Set();

function records(resolve, hostname) {
  return new Promise((done) => {
    resolve(hostname, (error, addresses) => {
      if (error || !addresses || addresses.length === 0) {
        done(null);
        return;
      }
      done(addresses);
    });
  });
}

function deliver(callback, addresses, family, all) {
  if (all) {
    callback(
      null,
      addresses.map((address) => ({ address, family }))
    );
    return;
  }
  callback(null, addresses[0], family);
}

export function lookupWithDirectFallback(hostname, options, callback, deps, onFallback) {
  const all = options.all === true;
  const family = options.family ?? 0;

  deps.lookup(hostname, options, (error, address, resolvedFamily) => {
    if (!error) {
      callback(null, address, resolvedFamily);
      return;
    }
    if (error.code !== "ENOTFOUND" && error.code !== "EAI_AGAIN") {
      callback(error);
      return;
    }

    void (async () => {
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

function noteFallback(hostname) {
  if (noted.has(hostname)) return;
  noted.add(hostname);
  console.warn(`System DNS missed ${hostname}; used a direct lookup`);
}

function patchedLookup(hostname, options, callback) {
  let normalized = {};
  let done = callback;
  if (typeof options === "function") {
    done = options;
  } else if (typeof options === "number") {
    normalized = { family: options };
  } else if (options) {
    normalized = options;
  }

  lookupWithDirectFallback(
    hostname,
    normalized,
    done,
    {
      lookup: originalLookup,
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

function patchedPromisesLookup(hostname, options) {
  const normalized = options ?? {};
  return new Promise((resolve, reject) => {
    patchedLookup(hostname, normalized, (error, address, family) => {
      if (error) {
        reject(error);
        return;
      }
      if (normalized.all) {
        resolve(address);
        return;
      }
      resolve({ address, family: family ?? 4 });
    });
  });
}

/** Safe to call more than once. Patches both lookup entry points. */
export function installLookupFallback() {
  if (!originalLookup) {
    originalLookup = dns.lookup.bind(dns);
  }
  dns.lookup = patchedLookup;
  dns.promises.lookup = patchedPromisesLookup;
}
