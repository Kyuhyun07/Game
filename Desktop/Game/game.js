// ============================================================
//  BlockWorld - Roblox-style 3rd person platformer
// ============================================================

// ---------- Scene ----------
const scene    = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.FogExp2(0x87CEEB, 0.018);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 400);

// ---------- Lighting ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xfffbe0, 1.1);
sun.position.set(60, 120, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far  = 400;
sun.shadow.camera.left = sun.shadow.camera.bottom = -100;
sun.shadow.camera.right = sun.shadow.camera.top   =  100;
scene.add(sun);

// ---------- Helpers ----------
function box(w, h, d, color, opacity) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({
    color,
    transparent: opacity !== undefined && opacity < 1,
    opacity: opacity ?? 1,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cylinder(rt, rb, h, color) {
  const geo = new THREE.CylinderGeometry(rt, rb, h, 16);
  const mat = new THREE.MeshLambertMaterial({ color });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

function sphere(r, color) {
  const geo = new THREE.SphereGeometry(r, 16, 16);
  const mat = new THREE.MeshLambertMaterial({ color });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

function addPlatform(platforms, x, y, z, w, h, d, color) {
  const m = box(w, h, d, color);
  m.position.set(x, y, z);
  scene.add(m);
  platforms.push({ mesh: m, x, y, z, w, h, d,
    minX: x - w/2, maxX: x + w/2,
    minY: y - h/2, maxY: y + h/2,
    minZ: z - d/2, maxZ: z + d/2 });
  return m;
}

// ---------- Stages ----------
const stageData = [];
let currentStage = 0;
let stageGroup = null;

function clearStage() {
  if (stageGroup) { scene.remove(stageGroup); stageGroup = null; }
}

function buildStage(idx) {
  clearStage();
  stageGroup = new THREE.Group();
  scene.add(stageGroup);

  const platforms = [];
  const hazards   = [];   // moving platforms / rotating
  const goal = { x:0, y:0, z:0 };
  let spawnPos = new THREE.Vector3(0, 3, 0);

  if (idx === 0) {
    // ---- Stage 1: Tutorial ----
    spawnPos.set(0, 2, 0);
    goal.x = 0; goal.y = 18; goal.z = -80;

    // Start pad
    addPlatform(platforms, 0, 0, 0, 10, 1, 10, 0x27ae60);

    // Stepping stones
    const steps = [
      [0,2,-12,6,1,6,0xe74c3c],
      [5,4,-22,6,1,6,0xe67e22],
      [0,6,-32,6,1,6,0xf1c40f],
      [-5,8,-40,5,1,5,0x2ecc71],
      [0,10,-50,8,1,8,0x3498db],
      [6,12,-58,4,1,4,0x9b59b6],
      [0,14,-66,6,1,6,0xe74c3c],
      [-4,16,-74,5,1,5,0xe67e22],
    ];
    steps.forEach(s => addPlatform(platforms, ...s));

    // Goal platform
    addPlatform(platforms, 0, 18, -80, 10, 1, 10, 0xf1c40f);

  } else if (idx === 1) {
    // ---- Stage 2: Wider gaps + moving platforms ----
    spawnPos.set(0, 2, 0);
    goal.x = 40; goal.y = 22; goal.z = -90;

    addPlatform(platforms, 0, 0, 0, 10, 1, 10, 0x27ae60);

    // Fixed platforms
    const fixed = [
      [10,2,-10,5,1,5,0xe74c3c],
      [20,4,-20,4,1,4,0xe67e22],
      [30,6,-30,5,1,5,0x3498db],
      [40,10,-30,6,1,6,0x9b59b6],
      [40,12,-50,5,1,5,0xf1c40f],
      [30,14,-70,4,1,4,0xe74c3c],
      [40,18,-80,5,1,5,0x2ecc71],
      [40,20,-90,6,1,6,0x3498db],
    ];
    fixed.forEach(s => addPlatform(platforms, ...s));

    // Moving platforms
    const movingDefs = [
      { x: 15, y: 7, z: -40, w: 5, d: 5, color: 0xe74c3c, axis:'x', range:8, speed:1.5 },
      { x: 25, y: 9, z: -55, w: 5, d: 5, color: 0xe67e22, axis:'z', range:8, speed:2 },
      { x: 35, y: 15, z: -65, w: 4, d: 4, color: 0x9b59b6, axis:'x', range:6, speed:2.5 },
    ];
    movingDefs.forEach(def => {
      const m = addPlatform(platforms, def.x, def.y, def.z, def.w, 1, def.d, def.color);
      hazards.push({ mesh: m, plat: platforms[platforms.length-1],
        axis: def.axis, range: def.range, speed: def.speed, t: Math.random()*Math.PI*2,
        ox: def.x, oy: def.y, oz: def.z });
    });

    // Goal
    addPlatform(platforms, 40, 22, -90, 10, 1, 10, 0xf1c40f);

  } else {
    // ---- Stage 3: Lava / spins / narrow ----
    spawnPos.set(0, 2, 0);
    goal.x = 0; goal.y = 30; goal.z = -110;

    addPlatform(platforms, 0, 0, 0, 10, 1, 10, 0x27ae60);

    const fixed = [
      [-10,3,-12,3,1,3,0xe74c3c],
      [0,5,-22,3,1,3,0xe67e22],
      [10,7,-32,3,1,3,0xf1c40f],
      [0,10,-42,3,1,3,0x2ecc71],
      [-10,13,-52,3,1,3,0x3498db],
      [0,16,-62,3,1,3,0x9b59b6],
      [10,19,-72,3,1,3,0xe74c3c],
      [0,22,-82,4,1,4,0xe67e22],
      [-8,25,-92,3,1,3,0x2ecc71],
      [0,28,-102,5,1,5,0x3498db],
    ];
    fixed.forEach(s => addPlatform(platforms, ...s));

    // Lava floor
    const lava = box(200, 1, 300, 0xff4500, 0.85);
    lava.position.set(0, -3, -60);
    lava.receiveShadow = true;
    scene.add(lava);

    // Spinning obstacles
    const spinners = [
      { x: 0, y: 6, z: -22, speed: 1.5 },
      { x: 0, y: 11, z: -42, speed: 2 },
      { x: 0, y: 17, z: -62, speed: 2.5 },
    ];
    spinners.forEach(s => {
      const bar = box(8, 0.5, 0.5, 0xe74c3c);
      bar.position.set(s.x, s.y + 1.5, s.z);
      scene.add(bar);
      hazards.push({ mesh: bar, type: 'spinner', speed: s.speed, t: 0,
        ox: s.x, oy: s.y + 1.5, oz: s.z, isKiller: true });
    });

    addPlatform(platforms, 0, 30, -110, 12, 1, 12, 0xf1c40f);
  }

  // Sky decorations (clouds)
  for (let i = 0; i < 12; i++) {
    const cloud = box(10+Math.random()*8, 2+Math.random(), 6+Math.random()*4, 0xffffff, 0.85);
    cloud.position.set(
      (Math.random()-0.5)*120,
      30 + Math.random()*20,
      (Math.random()-0.5)*120
    );
    scene.add(cloud);
  }

  // Goal beacon
  const beacon = box(3, 0.3, 3, 0xffe066);
  beacon.position.set(goal.x, goal.y + 0.65, goal.z);
  scene.add(beacon);
  // Goal star
  const star = sphere(1.2, 0xffe066);
  star.position.set(goal.x, goal.y + 3, goal.z);
  scene.add(star);
  // Goal pillar of light (visual)
  const pillar = cylinder(0.3, 0.3, 30, 0xffff88);
  pillar.material.transparent = true;
  pillar.material.opacity = 0.25;
  pillar.position.set(goal.x, goal.y + 15, goal.z);
  scene.add(pillar);

  return { platforms, hazards, spawnPos, goal };
}

// ---------- Character (Roblox-style blocky humanoid) ----------
const charGroup = new THREE.Group();
scene.add(charGroup);

// Body parts
const torso    = box(1.0, 1.3, 0.6, 0x3498db);
const head     = box(0.85, 0.85, 0.85, 0xf5cba7);
const lArm     = box(0.38, 1.1, 0.38, 0x3498db);
const rArm     = box(0.38, 1.1, 0.38, 0x3498db);
const lLeg     = box(0.42, 1.1, 0.42, 0x2c3e50);
const rLeg     = box(0.42, 1.1, 0.42, 0x2c3e50);
// Eyes
const lEye = box(0.15, 0.15, 0.05, 0x1a1a1a);
const rEye = box(0.15, 0.15, 0.05, 0x1a1a1a);
const smile = box(0.3, 0.08, 0.05, 0x1a1a1a);

torso.position.set(0, 0, 0);
head.position.set(0, 1.1, 0);
lEye.position.set(-0.18, 0.08, 0.43);
rEye.position.set( 0.18, 0.08, 0.43);
smile.position.set(0, -0.18, 0.43);
lArm.position.set(-0.72, 0, 0);
rArm.position.set( 0.72, 0, 0);
lLeg.position.set(-0.26, -1.2, 0);
rLeg.position.set( 0.26, -1.2, 0);

head.add(lEye); head.add(rEye); head.add(smile);
charGroup.add(torso);
charGroup.add(head);
charGroup.add(lArm); charGroup.add(rArm);
charGroup.add(lLeg); charGroup.add(rLeg);

[torso, head, lArm, rArm, lLeg, rLeg].forEach(p => {
  p.castShadow = true;
  p.receiveShadow = true;
});

// Character physics state
const charPos = new THREE.Vector3();
let charVelY  = 0;
let onGround  = false;
let charYaw   = 0;          // horizontal facing angle
const GRAVITY = -22;
const JUMP    = 9;
const SPEED   = 7;
const CHAR_H  = 1.7;        // half-height for ground check

// ---------- Camera ----------
let camYaw   = 0;
let camPitch = 0.3;
let camDist  = 9;
const CAM_MIN_PITCH = -0.3;
const CAM_MAX_PITCH =  1.1;
let pointerLocked = false;

document.addEventListener('mousemove', e => {
  if (!pointerLocked) return;
  camYaw   -= e.movementX * 0.003;
  camPitch += e.movementY * 0.003;
  camPitch  = Math.max(CAM_MIN_PITCH, Math.min(CAM_MAX_PITCH, camPitch));
});
document.addEventListener('wheel', e => {
  camDist = Math.max(3, Math.min(18, camDist + e.deltaY * 0.01));
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!pointerLocked && gameRunning) pauseScreen.style.display = 'flex';
});

// ---------- Input ----------
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape' && gameRunning) {
    if (pointerLocked) document.exitPointerLock();
    else renderer.domElement.requestPointerLock();
  }
});
document.addEventListener('keyup', e => keys[e.code] = false);

// ---------- Collision ----------
function checkPlatformCollision(platforms) {
  const px = charPos.x, py = charPos.y, pz = charPos.z;
  const R = 0.45;

  for (const p of platforms) {
    if (px + R < p.minX || px - R > p.maxX) continue;
    if (pz + R < p.minZ || pz - R > p.maxZ) continue;

    // Landing on top
    if (charVelY <= 0 && py - CHAR_H <= p.maxY && py - CHAR_H > p.maxY - 0.8) {
      charPos.y = p.maxY + CHAR_H;
      charVelY = 0;
      onGround = true;
      return true;
    }
    // Bumping head on bottom
    if (charVelY > 0 && py + CHAR_H >= p.minY && py + CHAR_H < p.minY + 0.8) {
      charPos.y = p.minY - CHAR_H;
      charVelY = 0;
    }
    // Side collision X
    if (py - CHAR_H < p.maxY && py + 0.3 > p.minY) {
      if (Math.abs(px - p.x) < (p.w/2 + R)) {
        if (px < p.x) charPos.x = p.minX - R;
        else          charPos.x = p.maxX + R;
      }
    }
  }
  return false;
}

// ---------- Game state ----------
let gameRunning  = false;
let stageSaved   = null;
let health       = 100;
let elapsed      = 0;
let isDead       = false;

const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const clearScreen = document.getElementById('clear-screen');
const deadScreen  = document.getElementById('dead-screen');
const stageDisp   = document.getElementById('stage-display');
const timerEl     = document.getElementById('timer');
const stageNameEl = document.getElementById('stage-name');
const posInfoEl   = document.getElementById('pos-info');
const healthFill  = document.getElementById('health-fill');
const clearTimeEl = document.getElementById('clear-time');

function showStageTitle(name) {
  stageDisp.textContent = name;
  stageDisp.style.opacity = 1;
  setTimeout(() => stageDisp.style.opacity = 0, 2500);
}

function loadStage(idx) {
  stageSaved  = buildStage(idx);
  elapsed     = 0;
  health      = 100;
  isDead      = false;
  updateHealthBar();
  charPos.copy(stageSaved.spawnPos);
  charVelY = 0;
  onGround = false;
  const names = ['🌿 스테이지 1 - 튜토리얼', '⚡ 스테이지 2 - 움직이는 발판', '🔥 스테이지 3 - 용암 지대'];
  stageNameEl.textContent = names[idx] ?? `스테이지 ${idx+1}`;
  showStageTitle(names[idx] ?? `스테이지 ${idx+1}`);
}

function spawnPlayer() {
  charPos.copy(stageSaved.spawnPos);
  charVelY = 0;
  onGround = false;
  health   = 100;
  isDead   = false;
  updateHealthBar();
}

function updateHealthBar() {
  healthFill.style.width = Math.max(0, health) + '%';
  const h = health / 100;
  healthFill.style.background = `linear-gradient(90deg, hsl(${h*120},80%,45%), hsl(${h*60+30},80%,50%))`;
}

// ---------- Start / UI callbacks ----------
document.getElementById('play-btn').addEventListener('click', () => {
  startScreen.style.display = 'none';
  gameRunning = true;
  currentStage = 0;
  loadStage(currentStage);
  renderer.domElement.requestPointerLock();
});

document.getElementById('resume-btn').addEventListener('click', () => {
  pauseScreen.style.display = 'none';
  renderer.domElement.requestPointerLock();
});

document.getElementById('next-btn').addEventListener('click', () => {
  clearScreen.style.display = 'none';
  currentStage++;
  if (currentStage >= 3) currentStage = 0;   // loop
  loadStage(currentStage);
  renderer.domElement.requestPointerLock();
});

document.getElementById('retry-btn').addEventListener('click', () => {
  deadScreen.style.display = 'none';
  spawnPlayer();
  renderer.domElement.requestPointerLock();
});

// ---------- Animation helpers ----------
let animT = 0;
function animateCharacter(moving, dt) {
  animT += dt * (moving ? 8 : 0);
  const swing = moving ? Math.sin(animT) * 0.5 : 0;
  lArm.rotation.x =  swing;
  rArm.rotation.x = -swing;
  lLeg.rotation.x = -swing;
  rLeg.rotation.x =  swing;

  // Bob head slightly
  head.position.y = 1.1 + (moving ? Math.abs(Math.sin(animT)) * 0.05 : 0);

  // Jump stretch
  if (!onGround) {
    torso.scale.y = 1.1; lLeg.scale.y = rLeg.scale.y = 0.9;
  } else {
    torso.scale.y = 1.0; lLeg.scale.y = rLeg.scale.y = 1.0;
  }
}

// ---------- Main loop ----------
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.05);
  lastTime  = now;

  if (!gameRunning || !stageSaved) {
    renderer.render(scene, camera);
    return;
  }

  const { platforms, hazards, goal } = stageSaved;

  // ----- Update moving hazards -----
  hazards.forEach(h => {
    h.t += dt * h.speed;
    if (h.type === 'spinner') {
      h.mesh.rotation.y = h.t;
    } else {
      const offset = Math.sin(h.t) * h.range;
      if (h.axis === 'x') {
        h.mesh.position.x = h.ox + offset;
        h.plat.x = h.ox + offset;
        h.plat.minX = h.plat.x - h.plat.w/2;
        h.plat.maxX = h.plat.x + h.plat.w/2;
      } else {
        h.mesh.position.z = h.oz + offset;
        h.plat.z = h.oz + offset;
        h.plat.minZ = h.plat.z - h.plat.d/2;
        h.plat.maxZ = h.plat.z + h.plat.d/2;
      }
    }
  });

  // ----- Spinner kill check -----
  hazards.forEach(h => {
    if (h.type !== 'spinner') return;
    const dx = charPos.x - h.mesh.position.x;
    const dz = charPos.z - h.mesh.position.z;
    const d  = Math.sqrt(dx*dx + dz*dz);
    if (d < 4.5 && Math.abs(charPos.y - h.mesh.position.y) < 1.5) {
      health -= dt * 80;
      updateHealthBar();
    }
  });

  // ----- Player input -----
  const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  const rgt = new THREE.Vector3(-Math.sin(camYaw - Math.PI/2), 0, -Math.cos(camYaw - Math.PI/2));
  let mx = 0, mz = 0;
  if (keys['KeyW']) { mx += fwd.x; mz += fwd.z; }
  if (keys['KeyS']) { mx -= fwd.x; mz -= fwd.z; }
  if (keys['KeyA']) { mx += rgt.x; mz += rgt.z; }
  if (keys['KeyD']) { mx -= rgt.x; mz -= rgt.z; }

  const len = Math.sqrt(mx*mx + mz*mz);
  const moving = len > 0;
  if (moving) {
    mx /= len; mz /= len;
    charPos.x += mx * SPEED * dt;
    charPos.z += mz * SPEED * dt;
    charYaw = Math.atan2(mx, mz);
  }

  // Jump
  if ((keys['Space'] || keys['ArrowUp']) && onGround) {
    charVelY = JUMP;
    onGround = false;
  }

  // Gravity
  charVelY += GRAVITY * dt;
  charPos.y += charVelY * dt;

  // Collision
  onGround = false;
  checkPlatformCollision(platforms);

  // Fall death
  if (charPos.y < -15) {
    health -= 50;
    updateHealthBar();
    if (health <= 0) health = 0;
    spawnPlayer();
  }

  // Health death
  if (health <= 0 && !isDead) {
    isDead = true;
    deadScreen.style.display = 'flex';
    if (pointerLocked) document.exitPointerLock();
  }

  // Goal check
  const gd = Math.sqrt((charPos.x-goal.x)**2 + (charPos.z-goal.z)**2);
  if (gd < 3 && Math.abs(charPos.y - goal.y - 1) < 2.5) {
    clearTimeEl.textContent = `클리어 시간: ${elapsed.toFixed(1)}초`;
    clearScreen.style.display = 'flex';
    gameRunning = false;
    if (pointerLocked) document.exitPointerLock();
  }

  // Timer
  elapsed += dt;
  timerEl.textContent = elapsed.toFixed(1) + 's';

  // Goal beacon spin
  sun.position.x = Math.cos(elapsed * 0.05) * 80;
  sun.position.z = Math.sin(elapsed * 0.05) * 80;

  // ----- Apply character transform -----
  charGroup.position.copy(charPos);
  charGroup.rotation.y = charYaw;
  animateCharacter(moving, dt);

  // ----- 3rd-person camera -----
  const camOX = Math.sin(camYaw) * Math.cos(camPitch) * camDist;
  const camOY = Math.sin(camPitch) * camDist + 2;
  const camOZ = Math.cos(camYaw) * Math.cos(camPitch) * camDist;
  const camTarget = charPos.clone().add(new THREE.Vector3(0, 1.5, 0));
  camera.position.copy(camTarget).add(new THREE.Vector3(camOX, camOY, camOZ));
  camera.lookAt(camTarget);

  // HUD
  posInfoEl.textContent =
    `X:${charPos.x.toFixed(1)} Y:${charPos.y.toFixed(1)} Z:${charPos.z.toFixed(1)}`;

  renderer.render(scene, camera);
}

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
