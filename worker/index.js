// Sabre Worker: home hub + one Brand Room per brand, all saved in one D1 database (binding "DB").
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const BRANDS = {
  hub: 'Sabre',
  actyva: 'Actyva',
  kemon: 'Kemon',
  solfine: 'Solfine',
  'hanz-de-fuko': 'Hanz de Fuko',
  joico: 'Joico',
};
const COLLS = ['posts', 'events', 'meta', 'tasks', 'links', 'people', 'approvals', 'brand', 'audit'];
const SORTED_BY_TIME = ['events', 'audit'];

// Only these people can be tagged. Emails go to the tagged person only.
const PEOPLE = {
  ade: { name: 'Ade', email: 'ade@sixunderground.net.au' },
  hayley: { name: 'Hayley', email: 'hayley@sixunderground.net.au' },
  stasa: { name: 'Stasa', email: 'stasa@sixunderground.net.au' },
};

let ready = false;
async function setup(db) {
  if (ready) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS docs (scope TEXT NOT NULL, coll TEXT NOT NULL, id TEXT NOT NULL, at INTEGER, data TEXT NOT NULL, PRIMARY KEY (scope, coll, id))'),
    db.prepare('CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, type TEXT, data TEXT NOT NULL, at INTEGER)'),
  ]);
  ready = true;
}

async function notify(req, env, scope) {
  const b = await req.json();
  const who = [...new Set((b.mentions || []).map(m => String(m).toLowerCase()))].filter(m => PEOPLE[m]).slice(0, 6);
  if (!who.length) return json({ error: 'nobody tagged' }, 400);
  if (!env.EMAIL && !env.NOTIFY_WEBHOOK_URL) return json({ error: 'email not set up yet' }, 503);
  const room = BRANDS[scope] || 'Sabre';
  const by = b.by === 'client' ? 'The client' : 'Six Underground';
  const text = String(b.text || '').slice(0, 2000);
  const title = String(b.postTitle || 'a post').slice(0, 200);
  const link = `https://sabre.sixunderground.net.au/${scope === 'hub' ? '' : scope + '/'}`;
  const results = await Promise.all(who.map(async k => {
    const msg = {
      subject: `You were tagged in the ${room} Brand Room: ${title}`,
      body: `${by} tagged you on "${title}":\n\n${text}\n\nOpen the ${room} Brand Room: ${link}`,
    };
    try {
      if (env.EMAIL) {
        try {
          await env.EMAIL.send({ to: PEOPLE[k].email, from: { email: 'notifications@sixunderground.net.au', name: `${room} Brand Room` }, subject: msg.subject, text: msg.body });
          return true;
        } catch (e) {
          if (!env.NOTIFY_WEBHOOK_URL) { console.log('email send failed: ' + (e && e.message || e)); return false; }
        }
      }
      const r = await fetch(env.NOTIFY_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: PEOPLE[k].email, name: PEOPLE[k].name, subject: msg.subject, body: msg.body }) });
      return r.ok;
    } catch (e) { return false; }
  }));
  return results.every(Boolean) ? json({ ok: true }) : json({ error: 'email failed' }, 502);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname.startsWith('/_blob/')) {
      try {
        await setup(env.DB);
        const id = decodeURIComponent(url.pathname.slice(7));
        const row = await env.DB.prepare('SELECT type, data FROM assets WHERE id = ?').bind(id).first();
        if (!row) return new Response('Not found', { status: 404 });
        const bin = Uint8Array.from(atob(row.data), c => c.charCodeAt(0));
        return new Response(bin, { headers: { 'content-type': row.type || 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
      } catch (e) { return new Response('Error', { status: 500 }); }
    }

    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    try {
      await setup(env.DB);
      const parts = url.pathname.split('/').filter(Boolean); // ['api', scope, coll, id?]

      if (req.method === 'POST' && parts[1] === 'assets' && parts.length === 2) {
        const body = await req.json();
        const data = String(body.data || '');
        if (!data || data.length > 1500000) return json({ error: 'image too large' }, 413);
        const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        await env.DB.prepare('INSERT INTO assets (id, type, data, at) VALUES (?1, ?2, ?3, ?4)').bind(id, String(body.type || 'image/jpeg').slice(0, 40), data, Date.now()).run();
        return json({ id });
      }

      const scope = parts[1];
      if (!BRANDS[scope]) return json({ error: 'unknown room' }, 404);
      const coll = parts[2];

      if (req.method === 'POST' && coll === 'notify') return await notify(req, env, scope);
      if (!COLLS.includes(coll)) return json({ error: 'not found' }, 404);
      const id = parts[3] ? decodeURIComponent(parts[3]) : null;

      if (req.method === 'GET' && !id) {
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '1000', 10) || 1000, 1000);
        const order = SORTED_BY_TIME.includes(coll) ? 'ORDER BY at DESC' : '';
        const { results } = await env.DB.prepare(`SELECT id, data FROM docs WHERE scope = ?1 AND coll = ?2 ${order} LIMIT ?3`).bind(scope, coll, limit).all();
        return json(results.map(r => ({ id: r.id, data: JSON.parse(r.data) })));
      }
      if (req.method === 'PUT' && id) {
        const body = await req.json();
        await env.DB.prepare('INSERT INTO docs (scope, coll, id, at, data) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(scope, coll, id) DO UPDATE SET at = ?4, data = ?5')
          .bind(scope, coll, id, (body && body.at) || Date.now(), JSON.stringify(body)).run();
        return json({ ok: true });
      }
      if (req.method === 'DELETE' && id) {
        await env.DB.prepare('DELETE FROM docs WHERE scope = ?1 AND coll = ?2 AND id = ?3').bind(scope, coll, id).run();
        return json({ ok: true });
      }
      return json({ error: 'not allowed' }, 405);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  },
};
