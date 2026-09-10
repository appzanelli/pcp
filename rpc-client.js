(function () {
  function runner(success, failure) {
    return new Proxy({}, {
      get(_, prop) {
        if (prop === 'withSuccessHandler') return fn => runner(fn, failure);
        if (prop === 'withFailureHandler') return fn => runner(success, fn);
        return (...args) => fetch('/api/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: String(prop), args })
        }).then(async response => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok || body.error) throw new Error(body.error || `HTTP ${response.status}`);
          return body.result;
        }).then(value => success && success(value)).catch(error => failure ? failure(error) : console.error(error));
      }
    });
  }
  window.google = { script: { get run() { return runner(); } } };
})();
