import * as THREE from 'three';
import TWEEN from 'three/addons/libs/tween.module.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

const CONFIG = window.APP_CONFIG;
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly openid email profile';
const DEMO = new URLSearchParams(location.search).has('demo'); // ?demo loads ./data.csv without Google

const $ = (id) => document.getElementById(id);
let tokenClient = null;
let accessToken = null;

/* =========================================================
   1. Google Sign-In (Google Identity Services, OAuth token)
   ========================================================= */

function initGoogle() {
  if (!window.google?.accounts?.oauth2) {
    setTimeout(initGoogle, 100);
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: SCOPES,
    callback: async (resp) => {
      if (resp.error) return showLoginError('Sign-in failed: ' + resp.error);
      accessToken = resp.access_token;
      await onSignedIn();
    },
    error_callback: (err) => {
      $('googleBtn').disabled = false;
      if (err.type !== 'popup_closed') showLoginError('Sign-in failed: ' + err.type);
    },
  });
}

$('googleBtn').addEventListener('click', () => {
  if (DEMO) return onSignedIn();
  if (!tokenClient) return showLoginError('Google sign-in is still loading, try again in a moment.');
  $('loginError').hidden = true;
  $('googleBtn').disabled = true;
  tokenClient.requestAccessToken({ prompt: 'select_account' });
});

$('signOut').addEventListener('click', () => {
  if (accessToken) google.accounts.oauth2.revoke(accessToken, () => {});
  accessToken = null;
  location.reload();
});

function showLoginError(msg) {
  $('googleBtn').disabled = false;
  $('loginError').textContent = msg;
  $('loginError').hidden = false;
}

async function onSignedIn() {
  try {
    const rows = DEMO ? await loadLocalCsv() : await loadSheet();
    if (!DEMO) loadUserProfile();
    $('login').hidden = true;
    $('app').hidden = false;
    $('status').textContent = `${rows.length} records loaded from ${DEMO ? 'local CSV (demo)' : 'Google Sheets'}`;
    start(rows);
  } catch (e) {
    console.error(e);
    showLoginError(e.message);
  }
}

async function loadUserProfile() {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const u = await r.json();
    $('userName').textContent = u.name || u.email || '';
    if (u.picture) $('avatar').src = u.picture;
  } catch { /* profile is optional */ }
}

/* =========================================================
   2. Data: Google Sheets API (or local CSV for ?demo)
   ========================================================= */

async function loadSheet() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(CONFIG.SHEET_ID)}` +
              `/values/${encodeURIComponent(CONFIG.RANGE)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(`Could not read the Google Sheet (${r.status}): ${body.error?.message || r.statusText}`);
  }
  const { values = [] } = await r.json();
  return toRecords(values);
}

async function loadLocalCsv() {
  const text = await (await fetch('data.csv')).text();
  return toRecords(parseCsv(text));
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Map header names -> column index, so column order in the sheet doesn't matter
function toRecords(values) {
  const [header, ...body] = values;
  const idx = {};
  header.forEach((h, i) => { idx[h.trim().toLowerCase()] = i; });
  const col = (row, name) => (row[idx[name]] ?? '').toString().trim();

  return body
    .filter((row) => row.length && col(row, 'name'))
    .map((row) => {
      const worthText = col(row, 'net worth');
      return {
        name: col(row, 'name').replace(/ |�/g, ''),
        photo: col(row, 'photo'),
        age: col(row, 'age'),
        country: col(row, 'country'),
        interest: col(row, 'interest'),
        worthText,
        worth: parseFloat(worthText.replace(/[^0-9.]/g, '')) || 0,
      };
    });
}

/* =========================================================
   3. three.js scene (based on the css3d_periodictable demo)
   ========================================================= */

let camera, scene, renderer, controls;
const objects = [];
const targets = { table: [], sphere: [], helix: [], grid: [] };

function worthClass(w) {
  if (w > 200000) return 'high';   // Green  > $200K
  if (w >= 100000) return 'mid';   // Orange > $100K
  return 'low';                    // Red    < $100K
}

function makeTile(p) {
  const el = document.createElement('div');
  el.className = `element ${worthClass(p.worth)}`;
  el.innerHTML = `
    <div class="meta"><span>${esc(p.country)}</span><span>${esc(p.age)}</span></div>
    <img src="${esc(p.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">
    <div class="name">${esc(p.name)}</div>
    <div class="interest">${esc(p.interest)}</div>
    <div class="worth">${esc(p.worthText)}</div>`;
  el.querySelector('img').onerror = function () { this.style.visibility = 'hidden'; };
  return el;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function start(people) {
  camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 10000);
  camera.position.z = 3000;
  scene = new THREE.Scene();

  const n = people.length;
  const vector = new THREE.Vector3();

  people.forEach((p, i) => {
    // Tile, scattered randomly at start
    const obj = new CSS3DObject(makeTile(p));
    obj.position.set(Math.random() * 4000 - 2000, Math.random() * 4000 - 2000, Math.random() * 4000 - 2000);
    scene.add(obj);
    objects.push(obj);

    // --- TABLE: 20 columns x 10 rows ---
    const COLS = 20, ROWS = 10, TW = 140, TH = 180;
    const col = i % COLS, row = Math.floor(i / COLS);
    const t = new THREE.Object3D();
    t.position.x = (col - (COLS - 1) / 2) * TW;
    t.position.y = ((ROWS - 1) / 2 - row) * TH;
    targets.table.push(t);

    // --- SPHERE ---
    const phi = Math.acos(-1 + (2 * i) / n);
    const theta = Math.sqrt(n * Math.PI) * phi;
    const s = new THREE.Object3D();
    s.position.setFromSphericalCoords(800, phi, theta);
    vector.copy(s.position).multiplyScalar(2);
    s.lookAt(vector);
    targets.sphere.push(s);

    // --- DOUBLE HELIX: alternate tiles between two strands, 180° apart ---
    const strand = i % 2;
    const k = Math.floor(i / 2);                 // position along the strand
    const perStrand = Math.ceil(n / 2);
    const hTheta = k * 0.3 + strand * Math.PI;
    const hY = -(k * 11) + (perStrand * 11) / 2;
    const h = new THREE.Object3D();
    h.position.setFromCylindricalCoords(900, hTheta, hY);
    vector.set(h.position.x * 2, h.position.y, h.position.z * 2);
    h.lookAt(vector);
    targets.helix.push(h);

    // --- GRID: 5 (x) x 4 (y) x 10 (z) ---
    const GX = 5, GY = 4, GZ = 10;
    const gx = i % GX;
    const gy = Math.floor(i / GX) % GY;
    const gz = Math.floor(i / (GX * GY)) % GZ;
    const g = new THREE.Object3D();
    g.position.x = (gx - (GX - 1) / 2) * 300;
    g.position.y = ((GY - 1) / 2 - gy) * 320;
    g.position.z = 800 - gz * 400;
    targets.grid.push(g);
  });

  renderer = new CSS3DRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  $('container').appendChild(renderer.domElement);

  controls = new TrackballControls(camera, renderer.domElement);
  controls.minDistance = 500;
  controls.maxDistance = 8000;
  controls.addEventListener('change', render);

  document.querySelectorAll('#menu button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#menu button').forEach((b) => b.classList.toggle('active', b === btn));
      transform(targets[btn.dataset.layout], 2000);
    });
  });

  transform(targets.table, 2000);
  window.addEventListener('resize', onResize);
  animate();
}

function transform(list, duration) {
  TWEEN.removeAll();
  objects.forEach((obj, i) => {
    const t = list[i];
    new TWEEN.Tween(obj.position)
      .to({ x: t.position.x, y: t.position.y, z: t.position.z }, Math.random() * duration + duration)
      .easing(TWEEN.Easing.Exponential.InOut).start();
    new TWEEN.Tween(obj.rotation)
      .to({ x: t.rotation.x, y: t.rotation.y, z: t.rotation.z }, Math.random() * duration + duration)
      .easing(TWEEN.Easing.Exponential.InOut).start();
  });
  new TWEEN.Tween({}).to({}, duration * 2).onUpdate(render).start();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  render();
}

function animate() {
  requestAnimationFrame(animate);
  TWEEN.update();
  controls.update();
}

function render() {
  renderer.render(scene, camera);
}

if (!DEMO) initGoogle();
