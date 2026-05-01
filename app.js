// Pawline tool client logic
(function () {
  const stopsInput = document.getElementById('stops-input');
  const sampleBtn = document.getElementById('sample-btn');
  const optimizeBtn = document.getElementById('optimize-btn');
  const stopCountEl = document.getElementById('stop-count');
  const statusEl = document.getElementById('status');
  const routeOutput = document.getElementById('route-output');
  const routeSummary = document.getElementById('route-summary');
  const routeActions = document.getElementById('route-actions');
  const mapsLink = document.getElementById('maps-link');
  const copyBtn = document.getElementById('copy-btn');
  const signupForm = document.getElementById('signup-form');
  const signupMsg = document.getElementById('signup-msg');
  const recentList = document.getElementById('recent-list');

  const MAX_STOPS = 15;

  const SAMPLE = `1245 N Williams St, Denver CO 80218 | dogs:2 | code:1247
3050 E Colfax Ave, Denver CO 80206 | dogs:1
2200 E 17th Ave, Denver CO 80206 | dogs:3 | code:9911
4150 E Mississippi Ave, Glendale CO 80246
1750 S Pearl St, Denver CO 80210 | dogs:1
850 S Broadway, Denver CO 80209 | dogs:2
2650 E 6th Ave, Denver CO 80206 | dogs:1 | code:6633
3100 W 38th Ave, Denver CO 80211 | dogs:2
1420 N Logan St, Denver CO 80203 | dogs:1
3700 S Logan St, Englewood CO 80113 | dogs:4 | code:0822`;

  function parseStops(raw) {
    return raw.split('\n').map(line => line.trim()).filter(Boolean).slice(0, MAX_STOPS);
  }

  function updateStopCount() {
    const stops = parseStops(stopsInput.value);
    stopCountEl.textContent = stops.length;
    stopCountEl.style.color = stops.length > MAX_STOPS ? 'var(--danger)' : '';
  }

  stopsInput.addEventListener('input', updateStopCount);

  sampleBtn.addEventListener('click', () => {
    stopsInput.value = SAMPLE;
    updateStopCount();
    if (window.posthog) posthog.capture('demo_sample_loaded');
  });

  function showStatus(html, cls) {
    statusEl.innerHTML = html;
    statusEl.className = cls || '';
    statusEl.hidden = false;
    routeOutput.hidden = true;
    routeSummary.hidden = true;
    routeActions.hidden = true;
  }

  function showLoading() {
    showStatus('<div class="spinner"></div><p>Optimizing your route&hellip;<br><small>Gemini is working on the order.</small></p>', 'status-loading');
  }

  function showError(msg) {
    showStatus('<div class="status-error"><strong>Hmm:</strong> ' + escapeHtml(msg) + '</div>');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderRoute(payload) {
    statusEl.hidden = true;

    const ordered = payload.ordered_stops || [];
    routeOutput.innerHTML = '';
    ordered.forEach(stop => {
      const li = document.createElement('li');
      const addr = document.createElement('div');
      addr.className = 'stop-addr';
      addr.textContent = stop.address;
      li.appendChild(addr);
      const inner = document.createElement('div');
      inner.style.flex = '1';
      inner.appendChild(addr);
      const metaParts = [];
      if (stop.dogs) metaParts.push(stop.dogs + ' dog' + (stop.dogs > 1 ? 's' : ''));
      if (stop.code) metaParts.push('Gate: ' + stop.code);
      if (metaParts.length) {
        const meta = document.createElement('div');
        meta.className = 'stop-meta';
        meta.textContent = metaParts.join(' &middot; ').replace(/&middot;/g, '·');
        inner.appendChild(meta);
      }
      if (stop.reason) {
        const rsn = document.createElement('div');
        rsn.className = 'stop-reason';
        rsn.textContent = stop.reason;
        inner.appendChild(rsn);
      }
      li.innerHTML = '';
      li.appendChild(inner);
      routeOutput.appendChild(li);
    });
    routeOutput.hidden = false;

    const summary = [];
    if (payload.total_stops) summary.push('<strong>' + payload.total_stops + '</strong> stops');
    if (payload.estimated_drive_minutes) summary.push('~<strong>' + payload.estimated_drive_minutes + ' min</strong> drive time');
    if (payload.estimated_distance_miles) summary.push('~<strong>' + payload.estimated_distance_miles + ' mi</strong>');
    if (payload.notes) summary.push('<em>' + escapeHtml(payload.notes) + '</em>');
    routeSummary.innerHTML = summary.join(' &middot; ');
    routeSummary.hidden = false;

    const addresses = ordered.map(s => s.address);
    if (addresses.length >= 2) {
      const url = 'https://www.google.com/maps/dir/' + addresses.map(a => encodeURIComponent(a)).join('/');
      mapsLink.href = url;
      routeActions.hidden = false;
    }
  }

  optimizeBtn.addEventListener('click', async () => {
    const stops = parseStops(stopsInput.value);
    if (stops.length < 2) {
      showError('Add at least 2 stops to optimize.');
      return;
    }
    if (stops.length > MAX_STOPS) {
      showError('Demo is capped at ' + MAX_STOPS + ' stops. Trim your list or grab early access for more.');
      return;
    }
    optimizeBtn.disabled = true;
    showLoading();
    if (window.posthog) posthog.capture('demo_optimize_clicked', { stop_count: stops.length });

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops_raw: stops })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Request failed (' + res.status + ')');
      }
      renderRoute(data);
      loadRecent();
      if (window.posthog) posthog.capture('demo_route_returned', {
        stops: data.total_stops,
        minutes: data.estimated_drive_minutes
      });
    } catch (err) {
      showError(err.message || 'Something went wrong. Try again in a sec.');
      if (window.posthog) posthog.capture('demo_error', { message: String(err.message) });
    } finally {
      optimizeBtn.disabled = false;
    }
  });

  copyBtn.addEventListener('click', () => {
    const lines = [];
    routeOutput.querySelectorAll('.stop-addr').forEach((el, i) => {
      lines.push((i + 1) + '. ' + el.textContent);
    });
    if (!lines.length) return;
    navigator.clipboard.writeText(lines.join('\n'));
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy route'; }, 1600);
  });

  signupForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    if (!email) return;
    signupMsg.hidden = true;
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'pawline-tool' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Subscribe failed');
      signupMsg.textContent = 'You’re on the list. We’ll email you when full Pawline is ready.';
      signupMsg.className = 'signup-msg success';
      signupMsg.hidden = false;
      signupForm.reset();
      if (window.posthog) posthog.capture('demo_signup');
    } catch (err) {
      signupMsg.textContent = err.message || 'Couldn’t save your email.';
      signupMsg.className = 'signup-msg error';
      signupMsg.hidden = false;
    }
  });

  async function loadRecent() {
    try {
      const res = await fetch('/api/history?limit=5');
      const data = await res.json();
      if (!data.routes || !data.routes.length) {
        recentList.innerHTML = '<li class="recent-empty">No routes yet. Be the first to try the demo above.</li>';
        return;
      }
      recentList.innerHTML = '';
      data.routes.forEach(r => {
        const li = document.createElement('li');
        const left = document.createElement('span');
        left.innerHTML = '<strong>' + r.total_stops + ' stops</strong>';
        const right = document.createElement('span');
        right.className = 'meta';
        right.textContent = (r.estimated_minutes ? '~' + r.estimated_minutes + ' min · ' : '') + r.created_at;
        li.appendChild(left);
        li.appendChild(right);
        recentList.appendChild(li);
      });
    } catch {
      recentList.innerHTML = '<li class="recent-empty">Recent runs unavailable right now.</li>';
    }
  }

  // Boot
  updateStopCount();
  loadRecent();
})();
