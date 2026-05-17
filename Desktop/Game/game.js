// ============================================================
//  점프맵 오비 (Roblox-style Obby)
//  - 3인칭 캐릭터
//  - 체크포인트 시스템
//  - 다양한 발판: 일반 / 움직이는 / 회전 / 사라지는 / 통통 / 좁은
//  - 구간별 테마 (7구간)
// ============================================================

// ── Scene ──────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.FogExp2(0x87CEEB, 0.012);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 500);

// ── Lighting ───────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xfffbe0, 1.0);
sun.position.set(80, 150, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -200;
sun.shadow.camera.right = sun.shadow.camera.top = 200;
sun.shadow.camera.far = 500;
scene.add(sun);

// ── Helpers ────────────────────────────────────────────────
function makeMesh(geo, color, opacity) {
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
function mkBox(w, h, d, color, opacity) {
  return makeMesh(new THREE.BoxGeometry(w, h, d), color, opacity);
}
function mkCyl(r, h, color) {
  return makeMesh(new THREE.CylinderGeometry(r, r, h, 24), color);
}
function mkSphere(r, color, opacity) {
  return makeMesh(new THREE.SphereGeometry(r, 16, 16), color, opacity);
}

// ── Platform registry ──────────────────────────────────────
// plat = { mesh, cx,cy,cz, hw,hh,hd, type, ... }
const platforms = [];
const dynamics  = [];   // moving/rotating/fading platforms
let   checkpoints = []; // { pos: Vector3, index }
let   goalPos = new THREE.Vector3();

function reg(mesh, cx, cy, cz, hw, hh, hd) {
  const p = { mesh, cx, cy, cz, hw, hh, hd,
    minX: cx-hw, maxX: cx+hw,
    minY: cy-hh, maxY: cy+hh,
    minZ: cz-hd, maxZ: cz+hd,
    solid: true };
  platforms.push(p);
  return p;
}

function updatePlatBounds(p) {
  p.minX = p.cx - p.hw; p.maxX = p.cx + p.hw;
  p.minY = p.cy - p.hh; p.maxY = p.cy + p.hh;
  p.minZ = p.cz - p.hd; p.maxZ = p.cz + p.hd;
}

// ── Add helpers ────────────────────────────────────────────
function addBox(x, y, z, w, h, d, color, opacity) {
  const m = mkBox(w, h, d, color, opacity);
  m.position.set(x, y, z);
  scene.add(m);
  return reg(m, x, y, z, w/2, h/2, d/2);
}

function addMoving(x, y, z, w, h, d, color, axis, range, speed) {
  const p = addBox(x, y, z, w, h, d, color);
  const o = { ox: x, oy: y, oz: z };
  const dyn = { p, axis, range, speed, t: Math.random()*Math.PI*2, ...o };
  dynamics.push(dyn);
  return p;
}

function addRotating(x, y, z, armLen, color) {
  // pivot
  const pivot = new THREE.Object3D();
  pivot.position.set(x, y, z);
  scene.add(pivot);
  const arm = mkBox(armLen*2, 0.4, 1.2, color);
  pivot.add(arm);
  const p = reg(arm, x, y, z, armLen, 0.2, 0.6);
  p.pivot = pivot;
  p.armLen = armLen;
  dynamics.push({ type: 'rotate', p, pivot, speed: 1.2, t: 0 });
  return p;
}

// Fading platform - appears and disappears
function addFading(x, y, z, w, h, d, color, period, offset) {
  const m = mkBox(w, h, d, color);
  m.position.set(x, y, z);
  scene.add(m);
  const p = reg(m, x, y, z, w/2, h/2, d/2);
  p.fading = true;
  dynamics.push({ type: 'fade', p, period: period||3, offset: offset||0 });
  return p;
}

// Bouncy platform
function addBouncy(x, y, z, w, d, color) {
  const p = addBox(x, y, z, w, 0.5, d, color);
  p.bouncy = true;
  p.mesh.material.color.set(color);
  return p;
}

// Checkpoint flag
function addCheckpoint(x, y, z, idx) {
  const pole = mkCyl(0.12, 4, 0xaaaaaa);
  pole.position.set(x, y+2, z);
  scene.add(pole);
  const flag = mkBox(1.5, 1, 0.05, idx === 0 ? 0x27ae60 : 0xe74c3c);
  flag.position.set(x+0.75, y+3.5, z);
  scene.add(flag);
  checkpoints.push({ pos: new THREE.Vector3(x, y+2, z), index: idx, mesh: flag });
}

// Goal
function addGoal(x, y, z) {
  goalPos.set(x, y, z);
  const base = mkBox(8, 0.5, 8, 0xffd200);
  base.position.set(x, y, z);
  scene.add(base);
  const trophy = mkSphere(1.5, 0xffd200);
  trophy.position.set(x, y+3, z);
  scene.add(trophy);
  const pillar = mkCyl(0.4, 40, 0xffd200);
  pillar.material.transparent = true; pillar.material.opacity = 0.15;
  pillar.position.set(x, y+20, z);
  scene.add(pillar);
  // Star ring
  for (let i = 0; i < 8; i++) {
    const s = mkSphere(0.35, 0xffd200);
    const a = (i/8)*Math.PI*2;
    s.position.set(x+Math.cos(a)*3, y+3, z+Math.sin(a)*3);
    scene.add(s);
  }
}

// Deco: cloud
function addCloud(x, y, z) {
  const g = new THREE.Group();
  [[0,0,0,4,2,3],[2,0.5,0,3,1.5,2],[-2,0.3,0,3,1.5,2],[0,0,2,3,1.5,2]].forEach(([dx,dy,dz,w,h,d])=>{
    const c = mkBox(w,h,d,0xffffff,0.9); c.position.set(x+dx,y+dy,z+dz); scene.add(c);
  });
}

// ── World builder ──────────────────────────────────────────
function buildWorld() {
  platforms.length = 0;
  dynamics.length  = 0;
  checkpoints      = [];
  scene.clear();
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  scene.add(sun);
  scene.add(charGroup);

  // 구름
  for (let i = 0; i < 20; i++)
    addCloud((Math.random()-.5)*300, 20+Math.random()*15, -100-Math.random()*600);

  // 바닥 (아래 떨어지면 죽는 용도 - 시각적 바닥)
  const ground = mkBox(300, 1, 1000, 0x5a8a3c, 0.3);
  ground.material.transparent = true;
  ground.position.set(0, -6, -350);
  scene.add(ground);

  // ═══════════════════════════════════════════════════════
  //  구간 1 – 시작 / 넓은 발판 (초록)
  // ═══════════════════════════════════════════════════════
  addCheckpoint(0, 0, 0, 0);
  addBox(0, -0.5, 0, 14, 1, 14, 0x27ae60);  // 시작

  const s1 = [
    [0,  0, -16,  7, 1,  7, 0x2ecc71],
    [5,  0, -26,  6, 1,  6, 0x27ae60],
    [-4, 0, -36,  6, 1,  6, 0x2ecc71],
    [3,  0, -46,  6, 1,  6, 0x27ae60],
    [0,  0, -56,  8, 1,  8, 0x2ecc71],
    [-5, 0, -66,  5, 1,  5, 0x27ae60],
    [4,  0, -76,  5, 1,  5, 0x2ecc71],
    [0,  0, -88,  9, 1,  9, 0x27ae60],  // CP1
  ];
  s1.forEach(([x,y,z,w,h,d,c])=>addBox(x,y,z,w,h,d,c));
  addCheckpoint(0, 1, -88, 1);

  // ═══════════════════════════════════════════════════════
  //  구간 2 – 좁은 징검다리 (파랑)
  // ═══════════════════════════════════════════════════════
  const s2 = [
    [ 5, 0,-100, 3,1,3, 0x3498db],
    [-4, 0,-110, 3,1,3, 0x2980b9],
    [ 5, 0,-120, 3,1,3, 0x3498db],
    [ 0, 0,-130, 3,1,3, 0x2980b9],
    [-5, 0,-140, 3,1,3, 0x3498db],
    [ 4, 0,-150, 3,1,3, 0x2980b9],
    [ 0, 0,-160, 3,1,3, 0x3498db],
    [-4, 0,-170, 3,1,3, 0x2980b9],
    [ 0, 0,-182, 8,1,8, 0x3498db],  // CP2
  ];
  s2.forEach(([x,y,z,w,h,d,c])=>addBox(x,y,z,w,h,d,c));
  addCheckpoint(0, 1, -182, 2);

  // ═══════════════════════════════════════════════════════
  //  구간 3 – 움직이는 발판 (빨강)
  // ═══════════════════════════════════════════════════════
  addBox(0, 0, -196, 6,1,6, 0xe74c3c);
  addMoving( 0, 0,-210, 5,1,4, 0xe74c3c, 'x', 8, 1.8);
  addMoving( 0, 0,-224, 4,1,4, 0xc0392b, 'x', 7, 2.1);
  addMoving( 0, 0,-238, 4,1,5, 0xe74c3c, 'x', 9, 1.5);
  addMoving( 0, 0,-252, 5,1,4, 0xc0392b, 'x', 7, 2.3);
  addMoving( 0, 0,-266, 4,1,4, 0xe74c3c, 'x', 8, 2.0);
  addMoving( 0, 0,-280, 4,1,5, 0xc0392b, 'x', 6, 1.7);
  addBox(0, 0, -294, 8,1,8, 0xe74c3c);  // CP3
  addCheckpoint(0, 1, -294, 3);

  // ═══════════════════════════════════════════════════════
  //  구간 4 – 사라지는 발판 (보라)
  // ═══════════════════════════════════════════════════════
  addBox(0, 0, -308, 6,1,6, 0x9b59b6);
  [
    [ 5, 0,-320, 3,1,3, 0x8e44ad, 2.5, 0.0],
    [-4, 0,-330, 3,1,3, 0x9b59b6, 2.5, 0.6],
    [ 4, 0,-340, 3,1,3, 0x8e44ad, 2.5, 1.2],
    [ 0, 0,-350, 3,1,3, 0x9b59b6, 2.5, 0.3],
    [-5, 0,-360, 3,1,3, 0x8e44ad, 2.5, 0.9],
    [ 4, 0,-370, 3,1,3, 0x9b59b6, 2.5, 0.5],
    [ 0, 0,-380, 3,1,3, 0x8e44ad, 2.5, 1.5],
    [ 0, 0,-392, 8,1,8, 0x9b59b6, 2.5, 0.0],  // CP4
  ].forEach(([x,y,z,w,h,d,c,per,off])=>addFading(x,y,z,w,h,d,c,per,off));
  addCheckpoint(0, 1, -392, 4);

  // ═══════════════════════════════════════════════════════
  //  구간 5 – 통통 발판 (노랑)
  // ═══════════════════════════════════════════════════════
  addBox(0, 0, -406, 6,1,6, 0xf1c40f);
  addBouncy( 0, 0,-420, 6,6, 0xf1c40f);
  addBox(   10, 0,-432, 4,1,4, 0xe67e22);
  addBouncy( 0, 0,-446, 6,6, 0xf39c12);
  addBox(  -10, 0,-458, 4,1,4, 0xe67e22);
  addBouncy( 0, 0,-472, 6,6, 0xf1c40f);
  addBox(    8, 0,-484, 4,1,4, 0xe67e22);
  addBox(    0, 0,-496, 8,1,8, 0xf1c40f);  // CP5
  addCheckpoint(0, 1, -496, 5);

  // ═══════════════════════════════════════════════════════
  //  구간 6 – 회전 장애물 (주황)
  // ═══════════════════════════════════════════════════════
  addBox(0, 0, -510, 6,1,6, 0xe67e22);
  [
    [ 5, 0,-522],
    [-4, 0,-534],
    [ 4, 0,-546],
    [ 0, 0,-558],
    [-5, 0,-570],
    [ 4, 0,-582],
    [ 0, 0,-594],
    [-4, 0,-606],
  ].forEach(([x,y,z],i)=>{
    addBox(x,y,z,3,1,3,i%2===0?0xe67e22:0xd35400);
    const bar = mkBox(7,0.5,1,0xe74c3c);
    const piv = new THREE.Object3D();
    piv.position.set(x, y+1.8, z);
    scene.add(piv); piv.add(bar);
    dynamics.push({type:'rotate',pivot:piv,speed:0.9+(i%3)*0.35,t:i*0.8,
      isKiller:true, kx:x, ky:y+1.8, kz:z, kRange:3.5});
  });
  addBox(0, 0, -620, 8,1,8, 0xe67e22);
  addCheckpoint(0, 1, -620, 6);

  // ═══════════════════════════════════════════════════════
  //  구간 7 – 최종 혼합 (무지개)
  // ═══════════════════════════════════════════════════════
  addBox(0, 0, -634, 8,1,8, 0x3498db);
  addMoving( 0, 0,-648, 3,1,3, 0xe74c3c, 'x', 7, 2.5);
  addMoving( 5, 0,-660, 3,1,3, 0x9b59b6, 'x', 6, 2.8);
  addFading(-3, 0,-672, 3,1,3, 0xf1c40f, 2,   0.0);
  addFading( 4, 0,-684, 3,1,3, 0x2ecc71, 2,   1.0);
  addMoving( 0, 0,-696, 3,1,3, 0xe67e22, 'x', 5, 3.0);
  addMoving(-5, 0,-708, 3,1,3, 0xe74c3c, 'x', 6, 2.3);
  addFading( 3, 0,-720, 3,1,3, 0x9b59b6, 2,   0.5);
  addMoving( 0, 0,-732, 3,1,3, 0x3498db, 'x', 8, 2.6);
  addFading(-4, 0,-744, 3,1,3, 0xf1c40f, 2,   1.2);
  addMoving( 4, 0,-756, 3,1,3, 0xe74c3c, 'x', 7, 2.9);
  addBox(0, 0, -770, 12,1,12, 0xffd200);

  addGoal(0, 1, -785);
}

// ── Character (로블록스 R6 스타일) ─────────────────────────
// 색상
const C_SKIN  = 0xffcc00;   // 노란 피부
const C_SHIRT = 0x1565c0;   // 파란 셔츠
const C_PANTS = 0x0d1b6e;   // 진파랑 바지
const C_WHITE = 0xffffff;
const C_BLACK = 0x111111;

const charGroup = new THREE.Group();
scene.add(charGroup);

function mkPart(w,h,d,color){
  const m = mkBox(w,h,d,color);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ─ 몸통 (Torso): 1.2 x 1.4 x 0.7
const torso = mkPart(1.2, 1.4, 0.7, C_SHIRT);

// ─ 머리 (Head): 1.2 x 1.2 x 1.2  (정사각형, 로블록스 특징)
const head = mkPart(1.2, 1.2, 1.2, C_SKIN);

// 얼굴 — 흰 눈 + 검은 눈동자 + 웃음
const lEyeW = mkBox(0.28, 0.22, 0.05, C_WHITE); lEyeW.position.set(-0.24, 0.1,  0.61);
const rEyeW = mkBox(0.28, 0.22, 0.05, C_WHITE); rEyeW.position.set( 0.24, 0.1,  0.61);
const lPupil = mkBox(0.12, 0.15, 0.05, C_BLACK); lPupil.position.set(-0.24, 0.08, 0.62);
const rPupil = mkBox(0.12, 0.15, 0.05, C_BLACK); rPupil.position.set( 0.24, 0.08, 0.62);
// 웃음 (3개 작은 박스로 곡선처럼)
const smL = mkBox(0.14, 0.07, 0.04, C_BLACK); smL.position.set(-0.14,-0.20, 0.62); smL.rotation.z =  0.5;
const smM = mkBox(0.16, 0.07, 0.04, C_BLACK); smM.position.set(    0,-0.25, 0.62);
const smR = mkBox(0.14, 0.07, 0.04, C_BLACK); smR.position.set( 0.14,-0.20, 0.62); smR.rotation.z = -0.5;
[lEyeW, rEyeW, lPupil, rPupil, smL, smM, smR].forEach(p => head.add(p));

// ─ 팔 (Arm): 0.55 x 1.3 x 0.55  — 피부색 (로블록스 기본)
const lArm = mkPart(0.55, 1.3, 0.55, C_SKIN);
const rArm = mkPart(0.55, 1.3, 0.55, C_SKIN);
// 셔츠 소매 (위쪽 절반)
const lSleeve = mkPart(0.56, 0.65, 0.56, C_SHIRT); lSleeve.position.set(0,  0.33, 0);
const rSleeve = mkPart(0.56, 0.65, 0.56, C_SHIRT); rSleeve.position.set(0,  0.33, 0);
lArm.add(lSleeve); rArm.add(rSleeve);

// ─ 다리 (Leg): 0.55 x 1.3 x 0.55 — 바지색
const lLeg = mkPart(0.55, 1.3, 0.55, C_PANTS);
const rLeg = mkPart(0.55, 1.3, 0.55, C_PANTS);
// 신발 (아랫부분)
const lShoe = mkPart(0.56, 0.3, 0.58, C_BLACK); lShoe.position.set(0, -0.52, 0);
const rShoe = mkPart(0.56, 0.3, 0.58, C_BLACK); rShoe.position.set(0, -0.52, 0);
lLeg.add(lShoe); rLeg.add(rShoe);

// ─ 목
const neck = mkPart(0.4, 0.2, 0.4, C_SKIN);

// ─ 위치 배치 (로블록스 R6 비율)
//   torso 중심 = (0, 0, 0)
//   head  중심 = torso 위 + 반높이 + 목 + 반머리
neck.position.set(0,  0.8,  0);          // 몸통 위
head.position.set(0,  1.05, 0);          // 목 위

lArm.position.set(-0.875, 0.05, 0);      // 왼쪽 어깨
rArm.position.set( 0.875, 0.05, 0);      // 오른쪽 어깨

lLeg.position.set(-0.325, -1.35, 0);     // 왼쪽 다리
rLeg.position.set( 0.325, -1.35, 0);     // 오른쪽 다리

[torso, neck, head, lArm, rArm, lLeg, rLeg].forEach(p => charGroup.add(p));

// ── Physics ────────────────────────────────────────────────
const charPos = new THREE.Vector3(0, 3, 0);
let charVelY  = 0;
let charYaw   = 0;
let onGround  = false;
let jumpsLeft = 2;         // 더블 점프
const GRAVITY = -24;
const JUMP_F  = 9.5;
const SPEED   = 7.5;
const CHAR_H  = 1.72;

// ── Camera ─────────────────────────────────────────────────
let camYaw   = 0;
let camPitch = 0.35;
let camDist  = 10;
let pointerLocked = false;

document.addEventListener('mousemove', e => {
  if (!pointerLocked) return;
  camYaw   -= e.movementX * 0.003;
  camPitch += e.movementY * 0.003;
  camPitch = Math.max(-0.2, Math.min(1.2, camPitch));
});
document.addEventListener('wheel', e=>{
  camDist = Math.max(4, Math.min(20, camDist + e.deltaY*0.01));
});
document.addEventListener('pointerlockchange', ()=>{
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!pointerLocked && gameRunning)
    pauseScreen.style.display = 'flex';
});

// ── Input ──────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e=>{
  if (keys[e.code]) return;
  keys[e.code] = true;
  if (e.code==='Escape'&&gameRunning){
    if(pointerLocked) document.exitPointerLock();
    else renderer.domElement.requestPointerLock();
  }
  if (e.code==='Space'&&gameRunning&&pointerLocked){
    if (jumpsLeft > 0){
      charVelY = JUMP_F;
      jumpsLeft--;
      if (!onGround) showNotify('✨ 더블점프!', 0.7);
      onGround = false;
    }
  }
});
document.addEventListener('keyup', e=>{ keys[e.code]=false; });

// ── Notify ────────────────────────────────────────────────
const notifyEl = document.getElementById('notify');
let notifyTimer = null;
function showNotify(msg, dur=2) {
  notifyEl.textContent = msg;
  notifyEl.style.opacity = 1;
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(()=>{ notifyEl.style.opacity=0; }, dur*1000);
}

// ── Collision ─────────────────────────────────────────────
function resolveCollision() {
  const R = 0.44;
  let landed = false;

  for (const p of platforms) {
    if (!p.solid) continue;

    if (charPos.x+R < p.minX || charPos.x-R > p.maxX) continue;
    if (charPos.z+R < p.minZ || charPos.z-R > p.maxZ) continue;

    const footY = charPos.y - CHAR_H;
    const headY = charPos.y + 0.3;

    // Land on top
    if (charVelY <= 0.1 && footY <= p.maxY+0.05 && footY >= p.maxY - 0.9) {
      charPos.y = p.maxY + CHAR_H;
      charVelY  = p.bouncy ? JUMP_F * 1.4 : 0;
      if (p.bouncy && !onGround) showNotify('🟡 통통!', 0.5);
      landed = true;
    }
    // Hit ceiling
    else if (charVelY > 0 && headY >= p.minY && headY <= p.minY+0.7){
      charPos.y = p.minY - 0.3; charVelY = 0;
    }
    // Side push
    else if (footY < p.maxY-0.1 && headY > p.minY) {
      const ox = charPos.x - p.cx;
      const oz = charPos.z - p.cz;
      const penX = (p.hw + R) - Math.abs(ox);
      const penZ = (p.hd + R) - Math.abs(oz);
      if (penX > 0 && penZ > 0) {
        if (penX < penZ) charPos.x += Math.sign(ox) * penX;
        else             charPos.z += Math.sign(oz) * penZ;
      }
    }
  }
  return landed;
}

// ── Game state ────────────────────────────────────────────
let gameRunning = false;
let elapsed     = 0;
let currentCP   = 0;     // last reached checkpoint index
let deaths      = 0;
let TOTAL_CP    = 0;

const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const clearScreen = document.getElementById('clear-screen');
const timerEl     = document.getElementById('timer');
const cpText      = document.getElementById('cp-text');
const progressBar = document.getElementById('progress-bar');

function startGame() {
  buildWorld();
  TOTAL_CP = checkpoints.length;
  currentCP = 0; elapsed = 0; deaths = 0;
  respawn(true);
  cpText.textContent = `${currentCP} / ${TOTAL_CP-1}`;
  progressBar.style.width = '0%';
  gameRunning = true;
  showNotify('🌿 구간 1 - 튜토리얼', 2.5);
}

function respawn(silent) {
  const cp = checkpoints[currentCP];
  charPos.copy(cp.pos).add(new THREE.Vector3(0, 1.5, 0));
  charVelY = 0; onGround = false; jumpsLeft = 2;
  if (!silent) {
    deaths++;
    showNotify('💀 추락! 다시 시도…', 1.5);
  }
}

function reachCheckpoint(idx) {
  if (idx <= currentCP) return;
  currentCP = idx;
  cpText.textContent = `${currentCP} / ${TOTAL_CP-1}`;
  progressBar.style.width = `${(currentCP/(TOTAL_CP-1))*100}%`;
  const names = ['','🌿 구간 2 - 좁은 발판','🔵 구간 3 - 움직이는 발판',
    '💜 구간 4 - 사라지는 발판','🟡 구간 5 - 통통 발판',
    '🔶 구간 6 - 회전 장애물','🌈 구간 7 - 최종 구간'];
  showNotify('✅ 체크포인트 ' + idx + (names[idx]?' '+names[idx]:''), 2.5);
  // Update flag color
  checkpoints[idx].mesh.material.color.set(0x27ae60);
}

// ── Animation ─────────────────────────────────────────────
let animT = 0;
function animChar(moving, dt) {
  animT += dt * (moving ? 8 : 0);
  const sw = moving ? Math.sin(animT) * 0.6 : 0;
  // 팔 앞뒤 스윙
  lArm.rotation.x =  sw;
  rArm.rotation.x = -sw;
  // 다리 앞뒤 스윙
  lLeg.rotation.x = -sw;
  rLeg.rotation.x =  sw;
  // 머리 살짝 위아래 (걸을 때)
  head.position.y = 1.05 + (moving ? Math.abs(Math.sin(animT)) * 0.03 : 0);
  neck.position.y = 0.80 + (moving ? Math.abs(Math.sin(animT)) * 0.03 : 0);
  // 점프 시 몸 늘어남
  if (!onGround) {
    torso.scale.y = 1.1;
    lLeg.scale.y  = rLeg.scale.y = 0.92;
  } else {
    torso.scale.y = 1.0;
    lLeg.scale.y  = rLeg.scale.y = 1.0;
  }
}

// ── UI callbacks ──────────────────────────────────────────
document.getElementById('play-btn').addEventListener('click',()=>{
  startScreen.style.display='none';
  startGame();
  renderer.domElement.requestPointerLock();
});
document.getElementById('resume-btn').addEventListener('click',()=>{
  pauseScreen.style.display='none';
  renderer.domElement.requestPointerLock();
});
document.getElementById('restart-btn').addEventListener('click',()=>{
  pauseScreen.style.display='none';
  startGame();
  renderer.domElement.requestPointerLock();
});
document.getElementById('replay-btn').addEventListener('click',()=>{
  clearScreen.style.display='none';
  startGame();
  renderer.domElement.requestPointerLock();
});

// ── Main loop ─────────────────────────────────────────────
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt  = Math.min((now - lastTime)/1000, 0.05);
  lastTime  = now;

  if (!gameRunning) { renderer.render(scene, camera); return; }

  elapsed += dt;
  timerEl.textContent = elapsed.toFixed(1) + 's';

  // ─ Update dynamics ─
  for (const d of dynamics) {
    if (d.type === 'rotate') {
      d.t += dt * d.speed;
      d.pivot.rotation.y = d.t;
      // killer check
      if (d.isKiller) {
        const arm = d.pivot.children[0];
        const wp = new THREE.Vector3();
        arm.getWorldPosition(wp);
        const dx = charPos.x - d.kx, dz = charPos.z - d.kz;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist < d.kRange && Math.abs(charPos.y - d.ky) < 1.8) {
          respawn(false); return;
        }
      }
    } else if (d.type === 'fade') {
      d.t = (d.t||0) + dt;
      const cycle = ((d.t + d.offset) % d.period) / d.period;
      const vis = cycle < 0.55;
      d.p.solid = vis;
      d.p.mesh.material.opacity = vis ? 1 : 0.12;
      d.p.mesh.material.transparent = !vis || true;
    } else {
      // moving
      d.t += dt * d.speed;
      const off = Math.sin(d.t) * d.range;
      if (d.axis==='x') {
        d.p.cx = d.ox + off;
        d.p.mesh.position.x = d.p.cx;
      } else {
        d.p.cz = d.oz + off;
        d.p.mesh.position.z = d.p.cz;
      }
      updatePlatBounds(d.p);
    }
  }

  // ─ Player movement ─
  const fwd = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  const rgt = new THREE.Vector3(-Math.sin(camYaw-Math.PI/2), 0, -Math.cos(camYaw-Math.PI/2));
  let mx=0, mz=0;
  if (keys['KeyW']||keys['ArrowUp'])    { mx+=fwd.x; mz+=fwd.z; }
  if (keys['KeyS']||keys['ArrowDown'])  { mx-=fwd.x; mz-=fwd.z; }
  if (keys['KeyA']||keys['ArrowLeft'])  { mx-=rgt.x; mz-=rgt.z; }
  if (keys['KeyD']||keys['ArrowRight']) { mx+=rgt.x; mz+=rgt.z; }
  const len = Math.sqrt(mx*mx+mz*mz);
  const moving = len > 0.01;
  if (moving) { mx/=len; mz/=len; charPos.x+=mx*SPEED*dt; charPos.z+=mz*SPEED*dt; charYaw=Math.atan2(mx,mz); }

  // ─ Gravity ─
  charVelY += GRAVITY * dt;
  charPos.y += charVelY * dt;

  // ─ Collision ─
  onGround = false;
  if (resolveCollision()) { onGround=true; jumpsLeft=2; }

  // ─ Fall death ─
  if (charPos.y < -20) respawn(false);

  // ─ Checkpoint detection ─
  for (const cp of checkpoints) {
    const d=charPos.distanceTo(cp.pos);
    if (d<3.5) reachCheckpoint(cp.index);
  }

  // ─ Goal detection ─
  if (charPos.distanceTo(goalPos) < 5) {
    gameRunning = false;
    document.getElementById('clear-stats').innerHTML =
      `⏱ 클리어 시간: <b>${elapsed.toFixed(1)}초</b><br>` +
      `💀 사망 횟수: <b>${deaths}번</b><br>` +
      `🏁 체크포인트: <b>${TOTAL_CP-1} / ${TOTAL_CP-1}</b>`;
    clearScreen.style.display = 'flex';
    if (pointerLocked) document.exitPointerLock();
  }

  // ─ Apply char transform ─
  charGroup.position.copy(charPos);
  charGroup.rotation.y = charYaw;
  animChar(moving, dt);

  // ─ 3rd person camera ─
  const camOX = Math.sin(camYaw)*Math.cos(camPitch)*camDist;
  const camOY = Math.sin(camPitch)*camDist + 2.5;
  const camOZ = Math.cos(camYaw)*Math.cos(camPitch)*camDist;
  const target = charPos.clone().add(new THREE.Vector3(0,1.5,0));
  camera.position.copy(target).add(new THREE.Vector3(camOX,camOY,camOZ));
  camera.lookAt(target);

  renderer.render(scene, camera);
}

window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
