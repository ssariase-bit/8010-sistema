// Respaldo semanal Supabase → Google Drive
// Sistema Operativo 8010 Urban Living + Kubik Living 8i8
// Corre en GitHub Actions (Node 20+, sin dependencias externas).
// Secretos requeridos: SUPABASE_SERVICE_ROLE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON
// Variable: DRIVE_FOLDER_ID
// IMPORTANTE: este script NO imprime datos de la base en los logs (el repo es público).

import crypto from 'node:crypto';

const SUPABASE_URL = 'https://ikvcillgdzlymvlrgjai.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SA = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const FOLDER_ID = process.env.DRIVE_FOLDER_ID;

const TABLAS = [
  'rack', 'facturacion', 'novedades', 'cotizaciones', 'housekeeping',
  'control_personal', 'personal', 'mantenimiento', 'turnos', 'contratos',
  'caja', 'recibos_magnifique', 'listado_cargos', 'entrega_efectivos',
  'transportes', 'reembolsos', 'requisiciones', 'visitantes', 'maletas',
  'prestamos_tec', 'desayunos', 'capsulas', 'saldos_aptos', 'check_carpetas',
  'profiles', 'config',
];

if (!KEY || !SA || !FOLDER_ID) {
  console.error('Faltan secretos/variables de entorno.');
  process.exit(1);
}

// ---------- 1. Dump de Supabase (service_role: ambos edificios, sin RLS) ----------
async function fetchAll(tabla) {
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  let rows = [];
  let offset = 0;
  let useOrder = true;
  for (;;) {
    const url = `${SUPABASE_URL}/rest/v1/${tabla}?select=*&limit=1000&offset=${offset}` +
      (useOrder ? '&order=id' : '');
    const r = await fetch(url, { headers });
    if (!r.ok) {
      if (useOrder && offset === 0) { useOrder = false; continue; } // tabla sin columna id
      throw new Error(`Tabla ${tabla}: HTTP ${r.status}`);
    }
    const d = await r.json();
    rows = rows.concat(d);
    if (d.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

const fecha = new Date().toISOString().slice(0, 10);
const dump = {
  _meta: {
    generado: new Date().toISOString(),
    sistema: '8010 Urban Living + Kubik Living 8i8',
    edificios: 'ambos (service_role, sin RLS)',
    origen: 'GitHub Actions - respaldo semanal automatico',
    conteos: {},
  },
};

for (const t of TABLAS) {
  dump[t] = await fetchAll(t);
  dump._meta.conteos[t] = dump[t].length;
}

const json = JSON.stringify(dump);
const mb = (Buffer.byteLength(json) / 1048576).toFixed(2);
// Solo tamaño en logs — nunca conteos ni datos (repo público).
console.log(`Dump generado: ${TABLAS.length} tablas, ${mb} MB`);

// ---------- 2. Token de Google (service account, JWT RS256) ----------
function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const claims = b64url(JSON.stringify({
  iss: SA.client_email,
  scope: 'https://www.googleapis.com/auth/drive',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
}));
const signature = crypto.createSign('RSA-SHA256')
  .update(`${header}.${claims}`)
  .sign(SA.private_key);
const jwt = `${header}.${claims}.${b64url(signature)}`;

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  }),
});
if (!tokenRes.ok) {
  console.error(`Error obteniendo token de Google: HTTP ${tokenRes.status}`);
  process.exit(1);
}
const { access_token } = await tokenRes.json();

// ---------- 3. Subida resumable a Drive ----------
const nombre = `backup_8010_kubik_${fecha}.json`;
const initRes = await fetch(
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({
      name: nombre,
      parents: [FOLDER_ID],
      mimeType: 'application/json',
    }),
  },
);
if (!initRes.ok) {
  console.error(`Error iniciando subida a Drive: HTTP ${initRes.status} — ${await initRes.text()}`);
  process.exit(1);
}
const uploadUrl = initRes.headers.get('location');

const putRes = await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: json,
});
if (!putRes.ok) {
  console.error(`Error subiendo archivo a Drive: HTTP ${putRes.status} — ${await putRes.text()}`);
  process.exit(1);
}
const file = await putRes.json();
console.log(`OK: ${nombre} (${mb} MB) subido a Drive, id ${file.id}`);
