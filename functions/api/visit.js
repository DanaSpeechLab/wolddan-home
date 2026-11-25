/**
 * 방문 한 번을 기록한다 (2026-11-25 김민영 — 누가 어디서 들어오는지 보려고).
 * Cloudflare Pages Function: POST /api/visit. 각 페이지 맨 아래의 짧은 스크립트가 부른다.
 *
 * - 누가 들어왔는지는 남기지 않는다. 쿠키도 쓰지 않는다.
 * - 지역은 Cloudflare 가 추정해 준 나라·시도 코드 둘뿐. IP · UA 원문은 남기지 않는다.
 * - 아래 키는 브라우저에 공개해도 되는 Supabase anon 키다(비밀값 아님).
 *   이 키로 할 수 있는 일은 DB 함수 site_record_visit 호출뿐이다.
 *
 * DB 함수: vocab-trainer 저장소 schema-visits.sql
 */
const SUPABASE_URL = 'https://ukdtkxfenukhcisrikwb.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrZHRreGZlbnVraGNpc3Jpa3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MDYwMjksImV4cCI6MjEwODQ4MjAyOX0.Fr3v0DC6bMhTp17MsD222KEfcDBZy8RbRQOeQOAxQNE';

const DISPLAY_MODES = ['browser', 'standalone', 'minimal-ui', 'fullscreen'];
const PATHS = ['/', '/vela'];

function clean(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  return t || null;
}

function deviceOf(ua) {
  const u = ua.toLowerCase();
  const os = /iphone|ipad|ipod/.test(u) ? 'ios'
    : /android/.test(u) ? 'android'
    : /windows/.test(u) ? 'windows'
    : /mac os x|macintosh/.test(u) ? 'mac'
    : /linux/.test(u) ? 'linux'
    : 'other';
  const kind = /ipad|tablet/.test(u) || (os === 'android' && !/mobile/.test(u)) ? 'tablet'
    : /iphone|ipod|mobile/.test(u) ? 'phone'
    : 'desktop';
  const browser = /kakaotalk/.test(u) ? 'kakao'
    : /naver/.test(u) ? 'naver'
    : /edg\//.test(u) ? 'edge'
    : /samsungbrowser/.test(u) ? 'samsung'
    : /firefox|fxios/.test(u) ? 'firefox'
    : /chrome|crios/.test(u) ? 'chrome'
    : /safari/.test(u) ? 'safari'
    : 'other';
  return { kind, os, browser };
}

const IN_APP = [
  ['kakao', /kakaotalk/i], ['naver', /naver\(inapp/i], ['instagram', /instagram/i],
  ['facebook', /fban|fbav|fb_iab/i], ['line', /\bline\/\d/i], ['band', /\bband\/\d/i], ['daum', /daumapps/i],
];
function inAppOf(ua) {
  for (const [name, re] of IN_APP) if (re.test(ua)) return name;
  if (/; wv\)/i.test(ua)) return 'webview';
  if (/(iphone|ipad|ipod)/i.test(ua) && /mobile\//i.test(ua) && !/safari\//i.test(ua)) return 'webview';
  return null;
}

export async function onRequestPost({ request }) {
  const done = new Response(null, { status: 204 });
  try {
    const body = await request.json().catch(() => null);
    const sessionKey = clean(body && body.sessionKey, 64);
    let path = clean(body && body.path, 200);
    if (path && path.length > 1) path = path.replace(/\/(index\.html)?$/, '') || '/';
    if (!sessionKey || !PATHS.includes(path)) return done;

    const ua = request.headers.get('user-agent') || '';
    const device = deviceOf(ua);
    const cf = request.cf || {};
    const country = cf.country && cf.country !== 'XX' && cf.country !== 'T1' ? cf.country : null;
    const displayMode = DISPLAY_MODES.includes(body.displayMode) ? body.displayMode : null;
    const utm = body.utm && typeof body.utm === 'object' ? body.utm : {};

    await fetch(SUPABASE_URL + '/rest/v1/rpc/site_record_visit', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_app: 'wolddan-home',
        p_session_key: sessionKey,
        p_path: path,
        p_referrer_host: clean(body.referrerHost, 120),
        p_country: country,
        p_region: cf.regionCode || null,
        p_device_kind: device.kind,
        p_device_os: device.os,
        p_device_browser: device.browser,
        p_in_app: inAppOf(ua),
        p_display_mode: displayMode,
        p_utm_source: clean(utm.source, 40),
        p_utm_medium: clean(utm.medium, 40),
        p_utm_campaign: clean(utm.campaign, 64),
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.warn('[visit] 기록 실패:', e && e.message ? e.message : e);
  }
  return done;
}
