// Pawline /api/analyze — Gemini-powered route optimizer for pet waste service stops.
// Zero deps, fetch only.

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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

  const stops = Array.isArray(body.stops_raw) ? body.stops_raw : [];
  if (stops.length < 2) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Need at least 2 stops.' }) };
  }
  if (stops.length > 15) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Demo limit is 15 stops.' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'AI not configured.' }) };
  }

  const parsed = stops.map(parseStopLine);

  const prompt = buildPrompt(parsed);

  let result;
  try {
    const r = await fetch(GEMINI_URL + '?key=' + encodeURIComponent(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      })
    });
    if (!r.ok) {
      const errText = await r.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI error', detail: errText.slice(0, 200) }) };
    }
    const json = await r.json();
    const text = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0].text) || '';
    try {
      result = JSON.parse(text);
    } catch (e) {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) result = JSON.parse(m[0]);
      else throw new Error('Could not parse AI response');
    }
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI failed: ' + err.message }) };
  }

  // Validate + normalize result
  if (!result || !Array.isArray(result.ordered_stops)) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI response malformed.' }) };
  }
  result.total_stops = result.ordered_stops.length;
  if (typeof result.estimated_drive_minutes !== 'number') result.estimated_drive_minutes = null;
  if (typeof result.estimated_distance_miles !== 'number') result.estimated_distance_miles = null;

  // Save to Turso (best effort, don't block response)
  try {
    await saveRoute(result);
  } catch (e) {
    console.error('save failed', e);
  }

  return { statusCode: 200, headers, body: JSON.stringify(result) };
};

function parseStopLine(line) {
  const parts = line.split('|').map(s => s.trim()).filter(Boolean);
  const address = parts[0];
  const stop = { address };
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const m = p.match(/^(\w+)\s*:\s*(.+)$/);
    if (m) {
      const k = m[1].toLowerCase();
      const v = m[2];
      if (k === 'dogs') stop.dogs = parseInt(v, 10) || null;
      else if (k === 'code') stop.code = v;
      else stop[k] = v;
    }
  }
  return stop;
}

function buildPrompt(parsed) {
  return [
    'You are a route optimizer for a pet waste removal service.',
    'You will be given a list of customer stops, each with an address and optional metadata.',
    'Reorder them into the most efficient driving route, starting from the first listed stop (assume that\'s closest to depot).',
    'Use general geographic intuition based on city/zip in the address. You are not given exact coordinates.',
    'Where two stops have the same zip, group them together. Prefer routing within neighborhoods before jumping zips.',
    '',
    'Return STRICT JSON of this shape:',
    '{',
    '  "ordered_stops": [{"address": str, "dogs": int|null, "code": str|null, "reason": str (one short phrase, e.g. "same neighborhood as previous")}],',
    '  "estimated_drive_minutes": int (rough estimate),',
    '  "estimated_distance_miles": int (rough estimate),',
    '  "notes": "one sentence with a useful observation about the route"',
    '}',
    '',
    'Stops:',
    JSON.stringify(parsed, null, 2)
  ].join('\n');
}

async function saveRoute(result) {
  const url = process.env.TURSO_DB_URL;
  const token = process.env.TURSO_DB_TOKEN;
  if (!url || !token) return;
  const httpUrl = url.replace(/^libsql:\/\//, 'https://');

  const body = {
    requests: [
      {
        type: 'execute',
        stmt: {
          sql: 'INSERT INTO pawline_routes (business_name, total_stops, estimated_minutes, optimized_route_json) VALUES (?, ?, ?, ?)',
          args: [
            { type: 'text', value: 'demo' },
            { type: 'integer', value: String(result.total_stops || 0) },
            { type: 'integer', value: String(result.estimated_drive_minutes || 0) },
            { type: 'text', value: JSON.stringify(result.ordered_stops || []).slice(0, 8000) }
          ]
        }
      },
      { type: 'close' }
    ]
  };

  await fetch(httpUrl + '/v2/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(body)
  });
}
