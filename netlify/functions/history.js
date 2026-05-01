// Pawline /api/history — returns recent demo route runs (no PII).

exports.handler = async function (event) {
  const headers = { 'Content-Type': 'application/json' };
  const url = (process.env.TURSO_DB_URL || '').replace(/^libsql:\/\//, 'https://');
  const token = process.env.TURSO_DB_TOKEN;
  if (!url || !token) {
    return { statusCode: 200, headers, body: JSON.stringify({ routes: [] }) };
  }

  const limit = Math.min(parseInt((event.queryStringParameters && event.queryStringParameters.limit) || '5', 10) || 5, 20);

  const body = {
    requests: [
      {
        type: 'execute',
        stmt: {
          sql: 'SELECT total_stops, estimated_minutes, created_at FROM pawline_routes ORDER BY id DESC LIMIT ?',
          args: [{ type: 'integer', value: String(limit) }]
        }
      },
      { type: 'close' }
    ]
  };

  try {
    const r = await fetch(url + '/v2/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    const rows = (((data.results || [])[0] || {}).response || {}).result;
    const routes = (rows && rows.rows ? rows.rows : []).map(row => ({
      total_stops: parseInt(row[0].value, 10) || 0,
      estimated_minutes: parseInt(row[1].value, 10) || null,
      created_at: timeAgo(row[2].value)
    }));
    return { statusCode: 200, headers, body: JSON.stringify({ routes }) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ routes: [] }) };
  }
};

function timeAgo(ts) {
  if (!ts) return '';
  const now = Date.now();
  let then = Date.parse(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z');
  if (Number.isNaN(then)) return ts;
  const sec = Math.max(1, Math.floor((now - then) / 1000));
  if (sec < 60) return sec + 's ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const day = Math.floor(hr / 24);
  return day + 'd ago';
}
