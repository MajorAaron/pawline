// Pawline landing page — email capture + smooth scroll.
(function () {
  const form = document.getElementById('signup-form');
  const msg = document.getElementById('signup-msg');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    if (!email) return;
    msg.hidden = true;
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'pawline-landing' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Subscribe failed');
      msg.textContent = 'You’re on the list. We’ll email you when full Pawline is ready.';
      msg.className = 'signup-msg success';
      msg.hidden = false;
      form.reset();
      if (window.posthog) posthog.capture('landing_signup');
    } catch (err) {
      msg.textContent = err.message || 'Couldn’t save your email.';
      msg.className = 'signup-msg error';
      msg.hidden = false;
    }
  });

  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      window.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
    });
  });
})();
