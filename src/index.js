// ---------- ابزارها ----------
function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  
  function unauthorized(message = 'نیاز به ورود دارید') {
    return new Response(message, {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Admin Panel"' }
    });
  }
  
  async function checkAdmin(request, env) {
    const auth = request.headers.get('Authorization');
    if (!auth) return false;
    const [scheme, encoded] = auth.split(' ');
    if (scheme !== 'Basic' || !encoded) return false;
    try {
      const decoded = atob(encoded);
      const idx = decoded.indexOf(':');
      const user = decoded.slice(0, idx);
      const pass = decoded.slice(idx + 1);
      return user === 'admin' && pass === env.ADMIN_PASSWORD;
    } catch {
      return false;
    }
  }
  
  // فیلدهای حساس که نباید توی API پابلیک برگردن
  const PUBLIC_FIELDS = 'id, title_en, title_fa, authors, publish_year, pages, price, abbr, category, description, cover_file';
  const ADMIN_FIELDS = '*';
  
  export default {
    async fetch(request, env) {
      const url = new URL(request.url);
      const method = request.method;
  
      // ---------- API پابلیک ----------
      if (url.pathname === '/api/books' && method === 'GET') {
        const { results } = await env.DB.prepare(
          `SELECT ${PUBLIC_FIELDS} FROM books ORDER BY id`
        ).all();
        return json(results);
      }
  
      const bookMatch = url.pathname.match(/^\/api\/books\/(\d+)$/);
      if (bookMatch && method === 'GET') {
        const id = bookMatch[1];
        const row = await env.DB.prepare(
          `SELECT ${PUBLIC_FIELDS} FROM books WHERE id = ?`
        ).bind(id).first();
        if (!row) return json({ error: 'کتاب یافت نشد' }, 404);
        return json(row);
      }
  
      // لینک دانلود فقط با درخواست POST برمی‌گرده (نه توی GET عمومی)
      const unlockMatch = url.pathname.match(/^\/api\/books\/(\d+)\/unlock$/);
      if (unlockMatch && method === 'POST') {
        const id = unlockMatch[1];
        const row = await env.DB.prepare(
          `SELECT android_url, windows_url FROM books WHERE id = ?`
        ).bind(id).first();
        if (!row) return json({ error: 'کتاب یافت نشد' }, 404);
        return json(row);
      }
  
      // ---------- API ادمین ----------
      if (url.pathname.startsWith('/api/admin/')) {
        if (!(await checkAdmin(request, env))) return unauthorized();
  
        // لیست کامل
        if (url.pathname === '/api/admin/books' && method === 'GET') {
          const { results } = await env.DB.prepare(
            `SELECT ${ADMIN_FIELDS} FROM books ORDER BY id`
          ).all();
          return json(results);
        }
  
        // افزودن
        if (url.pathname === '/api/admin/books' && method === 'POST') {
          const b = await request.json();
          const result = await env.DB.prepare(`
            INSERT INTO books (title_en, title_fa, authors, publish_year, serial, training_id, pages, price, abbr, category, description, android_file, android_url, windows_file, windows_url, cover_file)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            b.title_en, b.title_fa, b.authors || null, b.publish_year || null,
            b.serial || null, b.training_id || null, b.pages || null, b.price,
            b.abbr || null, b.category || null, b.description || null,
            b.android_file || null, b.android_url || null,
            b.windows_file || null, b.windows_url || null, b.cover_file || null
          ).run();
          return json({ id: result.meta.last_row_id }, 201);
        }
  
        // ویرایش
        const editMatch = url.pathname.match(/^\/api\/admin\/books\/(\d+)$/);
        if (editMatch && method === 'PUT') {
          const id = editMatch[1];
          const b = await request.json();
          await env.DB.prepare(`
            UPDATE books SET
              title_en = ?, title_fa = ?, authors = ?, publish_year = ?, serial = ?,
              training_id = ?, pages = ?, price = ?, abbr = ?, category = ?, description = ?,
              android_file = ?, android_url = ?, windows_file = ?, windows_url = ?, cover_file = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            b.title_en, b.title_fa, b.authors || null, b.publish_year || null,
            b.serial || null, b.training_id || null, b.pages || null, b.price,
            b.abbr || null, b.category || null, b.description || null,
            b.android_file || null, b.android_url || null,
            b.windows_file || null, b.windows_url || null, b.cover_file || null,
            id
          ).run();
          return json({ ok: true });
        }
  
        // حذف
        if (editMatch && method === 'DELETE') {
          const id = editMatch[1];
          await env.DB.prepare(`DELETE FROM books WHERE id = ?`).bind(id).run();
          return json({ ok: true });
        }
  
        // آپلود جلد به R2
        if (url.pathname === '/api/admin/upload-cover' && method === 'POST') {
          const form = await request.formData();
          const file = form.get('cover');
          if (!file || typeof file === 'string') {
            return json({ error: 'فایل یافت نشد' }, 400);
          }
          const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
          const key = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          await env.COVERS.put(key, file.stream(), {
            httpMetadata: { contentType: file.type || 'image/jpeg' }
          });
          // آدرس عمومی از طریق روت /covers/*
          return json({ key, url: `/covers/${key.replace('covers/', '')}` });
        }
  
        return json({ error: 'مسیر یافت نشد' }, 404);
      }
  
      // ---------- سرو جلدها از R2 ----------
      if (url.pathname.startsWith('/covers/')) {
        const key = 'covers/' + url.pathname.slice('/covers/'.length);
        const obj = await env.COVERS.get(key);
        if (!obj) return new Response('Not found', { status: 404 });
        return new Response(obj.body, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable'
          }
        });
      }
  
      // ---------- بقیه مسیرها: فایل‌های استاتیک ----------
      return env.ASSETS.fetch(request);
    }
  };