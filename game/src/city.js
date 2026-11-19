// MARAVILLA BAY city builder.
// One seeded pass lays out the whole map: ground, the avenue grid, water,
// buildings with canvas-painted facades, palms, streetlights, shop signs,
// the pier, the marina and the old causeway bridge. It also returns the
// collision boxes the rest of the game moves against.

import { CFG, districtAt, SHOP_NAMES } from './config.js';
import { range, int, pick, hashString, makeRng } from './random.js';

const THREE = window.THREE;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// A building facade: base colour, a grid of windows (some lit warm),
// a darker ground floor with a shopfront band.
function facadeTexture(rng, base, litRatio) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
    const cols = 4, rows = 8;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng() < litRatio;
        g.fillStyle = lit ? '#ffd98a' : '#1d2733';
        g.fillRect(10 + c * 28, 14 + r * 28, 18, 18);
      }
    }
    g.fillStyle = 'rgba(20,16,12,0.85)';
    g.fillRect(0, h - 34, w, 34);
    g.fillStyle = '#ffd98a';
    g.fillRect(14, h - 26, 34, 18);
    g.fillRect(80, h - 26, 34, 18);
  });
}

function signTexture(text, bg, fg) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = fg;
    g.font = 'bold 30px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function roadTexture(rng) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#33363b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3d42';
    for (let i = 0; i < 40; i++) g.fillRect(rng() * w, rng() * h, 3, 3);
    g.fillStyle = '#e8e4d2';
    g.fillRect(w / 2 - 2, 8, 4, 28);
    g.fillRect(w / 2 - 2, 72, 4, 28);
    g.fillStyle = '#c9a24a';
    g.fillRect(6, 0, 3, h);
    g.fillRect(w - 9, 0, 3, h);
  });
}

const AVENUES = [];
for (let v = -500; v <= 500; v += CFG.blockPitch) AVENUES.push(v);

export function isOnRoad(x, z) {
  for (const a of AVENUES) {
    if (Math.abs(x - a) <= CFG.roadHalf || Math.abs(z - a) <= CFG.roadHalf) return true;
  }
  return false;
}

export function buildCity(scene, rng) {
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const streetlights = []; // lamp meshes toggled at dusk
  const animated = { water: null, clouds: [] };
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const lambert = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });

  // --- ground: outer sand, city slab, bay water ---
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1700, 1700), lambert(0xcbb98a));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, -0.05, 150);
  sand.receiveShadow = true;
  group.add(sand);

  const slab = new THREE.Mesh(new THREE.PlaneGeometry(1240, 1240), lambert(0x7d7870));
  slab.rotation.x = -Math.PI / 2; slab.position.set(0, 0, -20);
  slab.receiveShadow = true;
  group.add(slab);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 320),
    new THREE.MeshLambertMaterial({ color: 0x2e6f8e, transparent: true, opacity: 0.92 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.15, 680);
  group.add(water);
  animated.water = water;

  // --- roads: one textured strip per avenue, both directions ---
  const roadTex = roadTexture(rng);
  roadTex.wrapS = THREE.RepeatWrapping; roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  for (const a of AVENUES) {
    for (const along of ['x', 'z']) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(1240, CFG.roadHalf * 2), roadMat.clone());
      strip.material.map = roadTex.clone();
      strip.material.map.needsUpdate = true;
      strip.material.map.repeat.set(16, 1);
      strip.rotation.x = -Math.PI / 2;
      if (along === 'x') { strip.position.set(0, 0.02, a); }
      else { strip.position.set(a, 0.02, 0); strip.rotation.z = Math.PI / 2; }
      strip.receiveShadow = true;
      group.add(strip);
    }
  }

  // --- promenade + beach along the water ---
  const prom = new THREE.Mesh(new THREE.PlaneGeometry(1240, 26), lambert(0xd8c9a3));
  prom.rotation.x = -Math.PI / 2; prom.position.set(0, 0.04, 512);
  prom.receiveShadow = true;
  group.add(prom);

  // --- facade texture variants (shared across buildings) ---
  const palette = ['#b5763f', '#c9a24a', '#7a8ba0', '#a85a4a', '#5f7a5a', '#8e6a8e', '#d8c9a3', '#4a6d8e'];
  const facades = palette.map((c) => facadeTexture(rng, c, 0.35));

  // --- block ground: one tinted plane per block so interiors are not bare slab ---
  const groundPalette = [0x9a8f7a, 0x7a8a5a, 0x8a7a6a, 0xa89a7a, 0x6d7a5a, 0x948a72];
  const groundGeo = new THREE.PlaneGeometry(78, 78);
  const groundMats = groundPalette.map((c) => lambert(c));
  for (let bx = -500; bx <= 500; bx += CFG.blockPitch) {
    for (let bz = -500; bz <= 400; bz += CFG.blockPitch) {
      const cx = bx + 50, cz = bz + 50;
      if (cz > 480) continue;
      const gp = new THREE.Mesh(groundGeo, pick(rng, groundMats));
      gp.rotation.x = -Math.PI / 2;
      gp.position.set(cx, 0.015, cz);
      gp.receiveShadow = true;
      group.add(gp);
    }
  }
  const special = [
    { x: -350, z: -350, r: 60 }, // Tomas's garage
    { x: 150, z: -450, r: 55 }, // police station
    { x: -420, z: 180, r: 50 }, // chop shop
    { x: -250, z: -450, r: 45 }, // safehouse
    { x: 0, z: 460, r: 60 }, // marina parking
    { x: 350, z: -150, r: 55 }, // rooftop mission block
  ];
  const isSpecial = (x, z) => special.some((s) => Math.abs(x - s.x) < s.r && Math.abs(z - s.z) < s.r);

  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  let shopIndex = 0;
  for (let bx = -500; bx <= 500; bx += CFG.blockPitch) {
    for (let bz = -500; bz <= 400; bz += CFG.blockPitch) {
      const cx = bx + 50, cz = bz + 50;
      if (cz > 480 || isSpecial(cx, cz)) continue;
      const d = districtAt(cx, cz);
      const tall = d.name === 'Hillcrest' || d.name === 'Casino Row';
      const count = tall ? 1 : int(rng, 1, 3);
      for (let i = 0; i < count; i++) {
        const brng = makeRng(hashString(`b${cx},${cz}:${i}`) ^ 0x5f3a);
        const w = range(brng, 22, 34);
        const dep = range(brng, 22, 34);
        const h = tall ? range(brng, 55, 110) : range(brng, 14, 42);
        const ox = count === 1 ? 0 : range(brng, -18, 18);
        const oz = count === 1 ? 0 : range(brng, -18, 18);
        const px = cx + ox, pz = cz + oz;
        if (Math.abs(px) > 560 || Math.abs(pz) > 480) continue;
        const mat = new THREE.MeshLambertMaterial({ map: pick(brng, facades) });
        const b = new THREE.Mesh(buildingGeo, mat);
        b.scale.set(w, h, dep);
        b.position.set(px, h / 2, pz);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        colliders.push({ minX: px - w / 2, maxX: px + w / 2, minZ: pz - dep / 2, maxZ: pz + dep / 2 });
        // rooftop rim for tall blocks
        if (h > 50) {
          const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.2, dep + 1), lambert(0x3a3a3a));
          rim.position.set(px, h + 0.6, pz);
          group.add(rim);
        }
        // a shop sign on some ground floors
        if (brng() < 0.45) {
          const name = SHOP_NAMES[shopIndex++ % SHOP_NAMES.length];
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(16, 4),
            new THREE.MeshBasicMaterial({ map: signTexture(name, pick(brng, ['#173a2e', '#5a1f1f', '#1f2e5a', '#6d4a00']), '#ffe9a8') })
          );
          sign.position.set(px, 5.2, pz - dep / 2 - 0.15);
          if (brng() < 0.5) { sign.rotation.y = Math.PI; sign.position.z = pz + dep / 2 + 0.15; }
          group.add(sign);
        }
      }
    }
  }

  // --- bushes inside blocks, kept clear of building footprints ---
  const bushGeo = new THREE.SphereGeometry(1.4, 8, 6);
  const bushMat = lambert(0x3e6e35);
  for (let i = 0; i < 90; i++) {
    const bx = -550 + rng() * 1100;
    const bz = -550 + rng() * 1000;
    let inside = false;
    for (const c of colliders) {
      if (bx > c.minX - 2 && bx < c.maxX + 2 && bz > c.minZ - 2 && bz < c.maxZ + 2) { inside = true; break; }
    }
    if (inside || isOnRoad(bx, bz) || bz > 500) continue;
    const bush = new THREE.Mesh(bushGeo, bushMat);
    bush.scale.set(1 + rng() * 0.8, 0.6 + rng() * 0.3, 1 + rng() * 0.8);
    bush.position.set(bx, 0.7, bz);
    bush.castShadow = true;
    group.add(bush);
  }
  function plot(x, z, w, d, h, color, label, labelColor) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
    m.position.set(x, h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 5),
      new THREE.MeshBasicMaterial({ map: signTexture(label, '#22242a', labelColor) })
    );
    sign.position.set(x, h + 3.5, z - d / 2 - 0.2);
    group.add(sign);
    return m;
  }
  plot(-350, -350, 44, 30, 10, 0x8a6a3a, "TOMAS GARAGE", '#ffd98a');
  plot(150, -450, 40, 28, 14, 0x4a5a6d, 'POLICE STATION', '#9fc4ff');
  plot(-420, 180, 36, 26, 9, 0x5a3a3a, 'CHOP SHOP', '#ff9a8a');
  plot(-250, -450, 30, 22, 8, 0x3a5a4a, 'SAFEHOUSE', '#a8e8c0');
  // rooftop mission block: a climbable-looking tower with a flat roof pad
  const tower = plot(350, -150, 34, 34, 58, 0x6d5a7a, 'HILLCREST ROOF', '#e8c8ff');
  tower.userData.rooftop = true;

  // --- palms along the marina strip and beach ---
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 9, 6);
  const crownGeo = new THREE.ConeGeometry(4.4, 3.4, 6); // wide flat crown, not a cone tree
  const trunkMat = lambert(0x7a5a3a);
  const crownMat = lambert(0x2e7a3a);
  for (let i = 0; i < 70; i++) {
    const px = -560 + rng() * 1120;
    const pz = pick(rng, [range(rng, 300, 500), range(rng, 440, 505)]);
    if (!isOnRoad(px, pz) && Math.abs(px) < 580) {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(px, 4.5, pz);
      trunk.castShadow = true;
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.set(px, 10.5, pz);
      crown.castShadow = true;
      group.add(trunk, crown);
    }
  }

  // --- streetlights along every second avenue ---
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 8, 6);
  const poleMat = lambert(0x2a2d33);
  const bulbGeo = new THREE.SphereGeometry(0.55, 8, 6);
  for (const a of AVENUES) {
    if (Math.abs(a) % 200 !== 0) continue;
    for (let v = -450; v <= 450; v += 150) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(a + 9, 4, v);
      const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0x554422 }));
      bulb.position.set(a + 9, 8.3, v);
      bulb.userData.lamp = true;
      streetlights.push(bulb);
      group.add(pole, bulb);
    }
  }

  // --- pier into the bay + moored boats ---
  // Deck top sits at y=0 so the player and cars drive on it at ground level.
  const pier = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 130), lambert(0x8a6a45));
  pier.position.set(0, -0.6, 585);
  pier.castShadow = true; pier.receiveShadow = true;
  group.add(pier);
  for (let i = 0; i < 6; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 6), lambert(0x6a4a2a));
    post.position.set(i % 2 === 0 ? -12 : 12, 0.5, 540 + i * 18);
    group.add(post);
  }
  const hullMat = lambert(0xe8e4da);
  for (let i = 0; i < 8; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 12), hullMat);
    hull.position.y = 0.6;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2, 5), lambert(pick(rng, [0x3f6fb5, 0xc23b2e, 0x2e7a5a])));
    cabin.position.y = 2.4;
    boat.add(hull, cabin);
    boat.position.set(-120 + i * 34, 0, 585 + (i % 2) * 40);
    boat.rotation.y = (i % 2 === 0 ? 0 : 0.5);
    group.add(boat);
  }

  // --- the old causeway bridge (mission 8 finale) ---
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(22, 1.2, 170), lambert(0x6a6a66));
  bridge.position.set(450, -0.6, 600);
  bridge.castShadow = true; bridge.receiveShadow = true;
  group.add(bridge);
  for (const sx of [-11, 11]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.4, 170), lambert(0xb5651d));
    rail.position.set(450 + sx, 1.2, 600);
    group.add(rail);
  }
  for (let i = 0; i < 5; i++) {
    const pierCol = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 6, 8), lambert(0x555550));
    pierCol.position.set(450, -1, 540 + i * 32);
    group.add(pierCol);
  }

  // --- containers in the docks ---
  const contColors = [0xc23b2e, 0x2e6f8e, 0xe8c832, 0x4a7a5a];
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 4), lambert(pick(rng, contColors)));
    c.position.set(-480 + (i % 6) * 16, 2 + Math.floor(i / 6) * 4.2, 380 + Math.floor(i / 6) * 0 + (i % 3) * 8);
    c.rotation.y = (i % 2) * 0.12;
    c.castShadow = true;
    group.add(c);
    colliders.push({ minX: c.position.x - 6, maxX: c.position.x + 6, minZ: c.position.z - 2, maxZ: c.position.z + 2 });
  }

  // --- bay coins are placed by missions.js; expose the walkable test ---
  function blocked(x, z) {
    if (z > CFG.waterZ) {
      const onPier = Math.abs(x) <= 13 && z <= 650;
      const onBridge = Math.abs(x - 450) <= 11 && z >= 520 && z <= 685;
      if (!onPier && !onBridge) return true;
    }
    for (const c of colliders) {
      if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
    }
    return false;
  }

  return { group, colliders, streetlights, animated, blocked, isOnRoad };
}
