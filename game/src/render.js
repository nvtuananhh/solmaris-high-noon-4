// Rendering for MARAVILLA BAY: renderer, golden-hour sky, sun, fog and
// the third-person camera rig. The sky is a big gradient dome built from
// a canvas texture; the sun is a directional light with shadows; a warm
// haze fog softens the far city. The camera follows behind the player or
// the car with mouse orbit, and eases toward its target so motion feels
// smooth without ever reading the wall clock.

const THREE = window.THREE;

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2e4a6d'); // zenith, dusty blue
  grad.addColorStop(0.45, '#e8a56d'); // horizon glow
  grad.addColorStop(0.62, '#f7c98a'); // golden band
  grad.addColorStop(0.75, '#e8a56d');
  grad.addColorStop(1, '#c98a5a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function createRender(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe8b07e, 220, 900);

  // sky dome
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  // low sun from the west, long shadows
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.25);
  sun.position.set(-320, 180, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffe0b8, 0.55));
  const hemi = new THREE.HemisphereLight(0x9db8d8, 0x8a6a45, 0.5);
  scene.add(hemi);

  // sun disc + a few drifting clouds (positions fixed; drift uses sim time)
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(34, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2c8, fog: false })
  );
  sunDisc.position.set(-900, 260, 300);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff2dd, transparent: true, opacity: 0.85 });
  const cloudGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 10; i++) {
    const cl = new THREE.Group();
    const puffs = 3 + (i % 3);
    for (let j = 0; j < puffs; j++) {
      const p = new THREE.Mesh(cloudGeo, cloudMat);
      p.position.set(j * 14 - puffs * 7, (j % 2) * 3, (j % 3) * 8 - 8);
      p.scale.set(16, 6, 10);
      cl.add(p);
    }
    cl.position.set(-700 + i * 150, 190 + (i % 3) * 22, -500 + (i * 97) % 900);
    scene.add(cl);
    clouds.push(cl);
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
  }

  // time-of-day: 0 = golden morning, 1 = dusk. Moves the sun down and
  // warms the fog; streetlights switch on past 0.75.
  function setTimeOfDay(t, streetlights) {
    const elev = 1 - t * 0.75;
    sun.position.set(-320, 60 + 160 * elev, 120);
    sun.intensity = 1.25 - t * 0.45;
    const warm = t > 0.6;
    scene.fog.color.setHex(warm ? 0xd88a6a : 0xe8b07e);
    hemi.intensity = 0.5 - t * 0.18;
    const lampOn = t > 0.72;
    for (const lamp of streetlights || []) {
      lamp.material.color.setHex(lampOn ? 0xffe9a8 : 0x554422);
    }
    return lampOn;
  }

  return {
    renderer,
    scene,
    sun,
    resize,
    setTimeOfDay,
    stepClouds(simSeconds) {
      // cloud drift is a pure function of sim time — deterministic
      for (let i = 0; i < clouds.length; i++) {
        clouds[i].position.x = -700 + i * 150 + ((simSeconds * (2 + i % 3)) % 1400);
        if (clouds[i].position.x > 700) clouds[i].position.x -= 1400;
      }
    },
  };
}

// Third-person camera: follows a target point from behind and above,
// orbited by the mouse. `yaw`/`pitch` are owned by world.js; this only
// turns them into a camera transform with smoothing.
export function createCameraRig(camera) {
  const current = new THREE.Vector3(0, 8, -14);
  const lookAt = new THREE.Vector3();
  return {
    update(target, yaw, pitch, dist, dt, snap) {
      const cx = target.x - Math.sin(yaw) * Math.cos(pitch) * dist;
      const cz = target.z - Math.cos(yaw) * Math.cos(pitch) * dist;
      const cy = target.y + 2.2 + Math.sin(pitch) * dist;
      if (snap) {
        current.set(cx, cy, cz);
      } else {
        const k = Math.min(1, dt * 7);
        current.x += (cx - current.x) * k;
        current.y += (cy - current.y) * k;
        current.z += (cz - current.z) * k;
      }
      camera.position.copy(current);
      lookAt.set(target.x, target.y + 1.6, target.z);
      camera.lookAt(lookAt);
    },
    snapTo(target, yaw, pitch, dist) {
      this.update(target, yaw, pitch, dist, 1, true);
    },
  };
}
