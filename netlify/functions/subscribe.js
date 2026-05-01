// Pawline /api/subscribe — store email in Turso subscribers, send Resend confirmation.

exports.handler = async function (event) {
  const headers = { 'Content-Type': 'application/json' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const email = (body.email || '').trim().toLowerCase();
  const source = body.source || 'pawline';
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid email required' }) };
  }

  const url = (process.env.TURSO_DB_URL || '').replace(/^libsql:\/\//, 'https://');
  const token = process.env.TURSO_DB_TOKEN;
  const ideaSlug = process.env.IDEA_SLUG || 'pawline';

  if (!url || !token) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'DB not configured' }) };
  }

  const insertBody = {
    requests: [
      {
        type: 'execute',
        stmt: {
          sql: 'INSERT INTO subscribers (email, idea_slug, source) VALUES (?, ?, ?) ON CONFLICT(email, idea_slug) DO NOTHING',
          args: [
            { type: 'text', value: email },
            { type: 'text', value: ideaSlug },
            { type: 'text', value: source }
          ]
        }
      },
      { type: 'close' }
    ]
  };

  try {
    const r = await fetch(url + '/v2/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(insertBody)
    });
    if (!r.ok) {
      const txt = await r.text();
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'DB insert failed', detail: txt.slice(0, 200) }) };
    }
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'DB error: ' + e.message }) };
  }

  // Send confirmation email (best effort)
  try {
    await sendConfirmation(email);
  } catch (e) {
    console.error('email send failed', e);
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};

async function sendConfirmation(email) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromDomain = process.env.RESEND_FROM_DOMAIN || 'majorsolutions.studio';
  if (!apiKey) return;

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#1B2421;line-height:1.55">
      <h1 style="color:#2D6A4F;letter-spacing:-0.01em;margin:0 0 12px">You're on the Pawline list</h1>
      <p>Thanks for trying the demo. We're building Pawline for the small operators who quietly run the unsexy backbone of the pet care world &mdash; and we'd love your input.</p>
      <p>Here's what's coming:</p>
      <ul style="padding-left:18px">
        <li>Full CSV import with up to 500 yards</li>
        <li>Multi-tech route splitting (yes, with gate codes)</li>
        <li>Re-plan in one click when customers pause or move</li>
        <li>QuickBooks &amp; Stripe sync</li>
      </ul>
      <p>If you have 5 minutes, reply with two things: how many yards do you currently service, and how long do you spend planning routes each week? Founder reads every reply.</p>
      <p>&mdash; The Pawline team</p>
      <hr style="border:none;border-top:1px solid #DCE0D6;margin:24px 0">
      <p style="color:#5A6964;font-size:0.85rem">A Major Solutions Studio project &middot; <a href="https://majorsolutions.studio" style="color:#2D6A4F">majorsolutions.studio</a></p>
    </div>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      from: 'Pawline <hello@' + fromDomain + '>',
      to: [email],
      subject: 'Welcome to the Pawline list',
      html: html
    })
  });
}
