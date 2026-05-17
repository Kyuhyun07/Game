// ============================================================
//  슈퍼 점프맵 - 마리오 스타일 3D 플랫포머
//  4단 점프 / 코인 / 물음표 블록 / 파이프 / 체크포인트
// ============================================================

// ── Scene ──────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x5c94fc);   // 마리오 하늘색
scene.fog = new THREE.Fog(0x5c94fc, 60, 160);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 300);

// ── Lighting ───────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xfff5cc, 1.1);
sun.position.set(60, 120, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -150;
sun.shadow.camera.right = sun.shadow.camera.top   =  150;
sun.shadow.camera.far = 400;
scene.add(sun);

// ── Material cache ─────────────────────────────────────────
const matCache = {};
function getMat(color, opacity) {
  const key = `${color}_${opacity??1}`;
  if (!matCache[key]) {
    matCache[key] = new THREE.MeshLambertMaterial({
      color,
      transparent: opacity !== undefined && opacity < 1,
      opacity: opacity ?? 1,
    });
  }
  return matCache[key];
}
function mkMesh(geo, color, opacity) {
  const m = new THREE.Mesh(geo, getMat(color, opacity).clone());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const BOX = (w,h,d) => new THREE.BoxGeometry(w,h,d);
const CYL = (r,h,s=16) => new THREE.CylinderGeometry(r,r,h,s);
const SPHERE = (r,s=16) => new THREE.SphereGeometry(r,s,s);

function mkBox(w,h,d,c,op){ return mkMesh(BOX(w,h,d),c,op); }
function mkCyl(r,h,c)     { return mkMesh(CYL(r,h),c); }
function mkSphere(r,c,op) { return mkMesh(SPHERE(r),c,op); }

// ── Platform system ────────────────────────────────────────
const platforms  = [];
const dynamics   = [];
const coins      = [];
const qblocks    = [];
let   checkpoints = [];
let   goalPos = new THREE.Vector3();
let   totalCoins = 0;
let   collectedCoins = 0;

function regPlat(mesh, cx,cy,cz, hw,hh,hd, extra={}) {
  const p = { mesh, cx,cy,cz, hw,hh,hd,
    minX:cx-hw, maxX:cx+hw,
    minY:cy-hh, maxY:cy+hh,
    minZ:cz-hd, maxZ:cz+hd,
    solid:true, ...extra };
  platforms.push(p);
  return p;
}
function updBounds(p) {
  p.minX=p.cx-p.hw; p.maxX=p.cx+p.hw;
  p.minY=p.cy-p.hh; p.maxY=p.cy+p.hh;
  p.minZ=p.cz-p.hd; p.maxZ=p.cz+p.hd;
}

// ─ 벽돌 발판 ─
function addPlat(x,y,z,w,h,d,color) {
  const m = mkBox(w,h,d,color);
  // 벽돌 라인 (검정 테두리 효과)
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(BOX(w,h,d)),
    new THREE.LineBasicMaterial({color:0x000000, transparent:true, opacity:0.25})
  );
  m.add(edge);
  m.position.set(x,y,z);
  scene.add(m);
  return regPlat(m,x,y,z,w/2,h/2,d/2);
}

// ─ 움직이는 발판 ─
function addMoving(x,y,z,w,h,d,color,axis,range,speed) {
  const p = addPlat(x,y,z,w,h,d,color);
  dynamics.push({ type:'move', p, axis, range, speed, t:Math.random()*Math.PI*2, ox:x,oy:y,oz:z });
  return p;
}

// ─ 사라지는 발판 ─
function addFading(x,y,z,w,d,color,period,offset) {
  const p = addPlat(x,y,z,w,0.6,d,color);
  p.fading = true;
  dynamics.push({ type:'fade', p, period:period||3, t:offset||0 });
  return p;
}

// ─ 물음표 블록 ─
function addQBlock(x,y,z) {
  const m = mkBox(1.2,1.2,1.2,0xf39c12);
  // ? 표시 (검은 작은 박스들)
  const q1 = mkBox(0.22,0.35,0.05,0x000000); q1.position.set( 0,  0.1, 0.61);
  const q2 = mkBox(0.22,0.15,0.05,0x000000); q2.position.set( 0, -0.2, 0.61);
  const q3 = mkBox(0.08,0.08,0.05,0x000000); q3.position.set( 0, -0.4, 0.61);
  m.add(q1); m.add(q2); m.add(q3);
  m.position.set(x,y,z);
  scene.add(m);
  const p = regPlat(m,x,y,z,0.6,0.6,0.6,{isQBlock:true, hit:false});
  qblocks.push(p);
  return p;
}

// ─ 파이프 ─
function addPipe(x,y,z,h=3) {
  const body = mkCyl(0.9,h,0x27ae60);
  const rim  = mkCyl(1.05,0.35,0x2ecc71);
  body.position.set(x, y+h/2, z);
  rim.position.set(x, y+h+0.17, z);
  scene.add(body); scene.add(rim);
  // 파이프도 충돌체로 등록
  regPlat(body,x,y+h/2,z,0.9,h/2,0.9);
}

// ─ 코인 ─
function addCoin(x,y,z) {
  const m = mkCyl(0.35,0.12,0xffd700);
  m.rotation.x = Math.PI/2;
  m.position.set(x,y,z);
  scene.add(m);
  coins.push({mesh:m, x,y,z, collected:false});
  totalCoins++;
}

// ─ 체크포인트 깃발 ─
function addCheckpoint(x,y,z,idx) {
  const pole = mkCyl(0.1,4,0xcccccc);
  pole.position.set(x, y+2, z);
  scene.add(pole);
  const flag = mkBox(1.4,0.9,0.05,idx===0?0x27ae60:0xe74c3c);
  flag.position.set(x+0.7, y+3.6, z);
  scene.add(flag);
  // 별
  const star = mkSphere(0.25,0xffd700);
  star.position.set(x, y+4.3, z);
  scene.add(star);
  checkpoints.push({ pos:new THREE.Vector3(x,y+2.2,z), index:idx, flagMesh:flag });
}

// ─ 골 ─
function addGoal(x,y,z) {
  goalPos.set(x,y,z);
  // 성 (간단한 버전)
  const base = mkBox(10,1,10,0xf5f5dc);
  base.position.set(x,y,z);
  scene.add(base);
  const tower = mkBox(3,6,3,0xf0e0b0);
  tower.position.set(x,y+3.5,z);
  scene.add(tower);
  const roof = mkBox(3.4,1,3.4,0xe74c3c);
  roof.position.set(x,y+6.5,z);
  scene.add(roof);
  const flag = mkBox(0.2,2,0.2,0xaaaaaa);
  flag.position.set(x,y+7.5,z);
  scene.add(flag);
  const flagTop = mkBox(1,0.7,0.05,0xe74c3c);
  flagTop.position.set(x+0.5,y+8.1,z);
  scene.add(flagTop);
  // 빛기둥
  const pillar = mkCyl(0.5,30,0xffd700,8);
  pillar.material.transparent=true; pillar.material.opacity=0.18;
  pillar.position.set(x,y+15,z);
  scene.add(pillar);
}

// ─ 구름 ─
function addCloud(x,y,z) {
  [[0,0,0,3.5,1.5,2.5],[2,0.4,0,2.5,1.2,2],[-2,0.3,0,2.5,1.2,2]].forEach(([dx,dy,dz,w,h,d])=>{
    const m = mkBox(w,h,d,0xffffff,0.92);
    m.position.set(x+dx,y+dy,z+dz);
    scene.add(m);
  });
}

// ── World ─────────────────────────────────────────────────
function buildWorld() {
  // 초기화
  platforms.length=0; dynamics.length=0;
  coins.length=0; qblocks.length=0; checkpoints=[];
  totalCoins=0; collectedCoins=0;
  scene.clear();
  scene.add(new THREE.AmbientLight(0xffffff,0.7));
  scene.add(sun);
  scene.add(charGroup);

  // 구름 배치
  for(let i=0;i<18;i++)
    addCloud((Math.random()-.5)*180, 18+Math.random()*12, -50-Math.random()*700);

  // ═══════════════════════════════════════════════
  //  구간 1 – 초록 들판 (Green Hills)
  // ═══════════════════════════════════════════════
  addCheckpoint(0,0,0,0);
  addPlat(0,-0.5,0,14,1,14,0x5aad3c);  // 시작

  // 풀밭 발판들 (넓고 쉬움)
  [[0,0,-14,8,1,8],[6,0,-25,6,1,6],[-5,0,-35,6,1,6],
   [4,0,-45,7,1,7],[-3,0,-55,6,1,6],[0,0,-65,8,1,8],
   [5,0,-75,5,1,5],[-4,0,-85,6,1,6],[0,0,-97,10,1,10]
  ].forEach(([x,y,z,w,h,d])=>addPlat(x,y,z,w,h,d,0x5aad3c));

  // 파이프 장식
  addPipe(3,0,-30,2.5); addPipe(-4,0,-60,2);

  // 코인들
  [-14,-25,-35,-45,-55,-65,-75,-85].forEach((z,i)=>{
    addCoin(i%2===0?2:-2, 2.5, z);
  });
  addQBlock(0,3,-50);

  addCheckpoint(0,1,-97,1);

  // ═══════════════════════════════════════════════
  //  구간 2 – 징검다리 + 코인 (Coin Road)
  // ═══════════════════════════════════════════════
  [[5,0,-110,4,1,4,0xe8c46a],[-4,0,-120,4,1,4,0xe8c46a],
   [4,0,-130,3,1,3,0xe8c46a],[0,0,-140,3,1,3,0xc8a44a],
   [-5,0,-150,3,1,3,0xe8c46a],[4,0,-160,3,1,3,0xc8a44a],
   [0,0,-170,3,1,3,0xe8c46a],[-4,0,-180,4,1,4,0xc8a44a],
   [0,0,-192,9,1,9,0xe8c46a]
  ].forEach(([x,y,z,w,h,d,c])=>addPlat(x,y,z,w,h,d,c));

  // 공중 코인 라인
  for(let i=0;i<8;i++) addCoin(0, 3.5, -110-i*10);
  addQBlock(-4,3.5,-140); addQBlock(4,3.5,-160);
  addPipe(6,0,-145,3); addPipe(-5,0,-165,2.5);

  addCheckpoint(0,1,-192,2);

  // ═══════════════════════════════════════════════
  //  구간 3 – 움직이는 발판 (Moving Road)
  // ═══════════════════════════════════════════════
  addPlat(0,0,-205,6,1,6,0xe74c3c);
  addMoving(0,0,-218,5,1,4,0xe74c3c,'x',7,1.8);
  addMoving(0,0,-230,4,1,4,0xc0392b,'x',8,2.0);
  addMoving(0,0,-242,5,1,5,0xe74c3c,'x',6,1.6);
  addMoving(0,0,-254,4,1,4,0xc0392b,'x',7,2.2);
  addMoving(0,0,-266,4,1,4,0xe74c3c,'x',8,1.9);
  addMoving(0,0,-278,5,1,4,0xc0392b,'x',6,2.1);
  addPlat(0,0,-292,9,1,9,0xe74c3c);

  // 코인은 중간 지점 고정 위치에
  [-218,-230,-242,-254,-266,-278].forEach(z=>addCoin(0,2.8,z));
  addQBlock(0,3.5,-248);

  addCheckpoint(0,1,-292,3);

  // ═══════════════════════════════════════════════
  //  구간 4 – 사라지는 발판 (Ghost House)
  // ═══════════════════════════════════════════════
  addPlat(0,0,-305,7,1,7,0x9b59b6);

  [[5,0,-316,3.5,3.5,0x8e44ad,2.5,0.0],
   [-4,0,-326,3.5,3.5,0x9b59b6,2.5,0.7],
   [4,0,-336,3.5,3.5,0x8e44ad,2.5,1.3],
   [0,0,-346,3.5,3.5,0x9b59b6,2.5,0.4],
   [-4,0,-356,3.5,3.5,0x8e44ad,2.5,1.0],
   [4,0,-366,3.5,3.5,0x9b59b6,2.5,0.2],
   [0,0,-376,3.5,3.5,0x8e44ad,2.5,1.6],
   [0,0,-388,9,1,9,0x9b59b6,99,0]
  ].forEach(([x,y,z,w,d,c,per,off])=>addFading(x,y,z,w,d,c,per,off));

  // 코인
  [-316,-336,-356,-376].forEach((z,i)=>addCoin(i%2===0?3:-3,2.5,z));
  addQBlock(0,3,-346);

  addCheckpoint(0,1,-388,4);

  // ═══════════════════════════════════════════════
  //  구간 5 – 통통 발판 (Bounce Land)
  // ═══════════════════════════════════════════════
  addPlat(0,0,-401,7,1,7,0xf1c40f);

  // 통통 발판 (노란색, 밟으면 높이 뜀)
  function addBouncy2(x,y,z,w,d) {
    const p = addPlat(x,y,z,w,0.5,d,0xffd700);
    p.bouncy=true;
    // 줄무늬 표시
    const stripe = mkBox(w,0.15,d,0xf39c12);
    stripe.position.set(0,0.15,0);
    p.mesh.add(stripe);
    return p;
  }

  addBouncy2(0,0,-414,6,6);
  addPlat(9,0,-425,4,1,4,0xf1c40f);
  addBouncy2(0,0,-438,6,6);
  addPlat(-9,0,-450,4,1,4,0xe67e22);
  addBouncy2(0,0,-463,6,6);
  addPlat(9,0,-475,4,1,4,0xf1c40f);
  addPlat(0,0,-488,8,1,8,0xf1c40f);

  [-414,-438,-463].forEach(z=>{ addCoin(-2,3,z); addCoin(2,3,z); });
  addQBlock(0,3.5,-451);
  addPipe(6,0,-465,2.5);

  addCheckpoint(0,1,-488,5);

  // ═══════════════════════════════════════════════
  //  구간 6 – 좁은 다리 + 파이프 (Pipe Kingdom)
  // ═══════════════════════════════════════════════
  addPlat(0,0,-501,7,1,7,0x27ae60);

  // 좁은 다리 발판들
  const s6=[
    [5,0,-512,3,1,3,0x27ae60],[0,0,-522,3,1,3,0x2ecc71],
    [-5,0,-532,3,1,3,0x27ae60],[4,0,-542,3,1,3,0x2ecc71],
    [0,0,-552,3,1,3,0x27ae60],[-4,0,-562,3,1,3,0x2ecc71],
    [4,0,-572,3,1,3,0x27ae60],[0,0,-582,3,1,3,0x2ecc71],
    [0,0,-594,9,1,9,0x27ae60]
  ];
  s6.forEach(([x,y,z,w,h,d,c])=>addPlat(x,y,z,w,h,d,c));

  // 파이프들 (장애물)
  addPipe(5,0,-522,3.5); addPipe(-5,0,-542,3);
  addPipe(4,0,-562,4); addPipe(-4,0,-572,3);

  // 코인
  [-512,-532,-552,-572].forEach((z,i)=>addCoin(i%2===0?2:-2,2.5,z));
  addQBlock(0,3.5,-552);

  addCheckpoint(0,1,-594,6);

  // ═══════════════════════════════════════════════
  //  구간 7 – 최종 혼합 (Final World)
  // ═══════════════════════════════════════════════
  addPlat(0,0,-607,8,1,8,0x3498db);
  addMoving(0,0,-620,4,1,4,0xe74c3c,'x',7,2.5);
  addFading(5,0,-632,3.5,3.5,0x9b59b6,2,0);
  addMoving(0,0,-644,4,1,4,0xf1c40f,'x',6,2.8);
  addFading(-4,0,-656,3.5,3.5,0x8e44ad,2,1);
  addMoving(0,0,-668,4,1,4,0xe67e22,'x',8,2.3);
  addFading(4,0,-680,3.5,3.5,0x9b59b6,2,0.5);
  addMoving(0,0,-692,4,1,4,0xe74c3c,'x',7,2.9);
  addPlat(0,0,-706,12,1,12,0xffd700);

  // 코인 라인
  for(let i=0;i<7;i++) addCoin(0,3,-620-i*12);
  addQBlock(0,3.5,-644); addQBlock(0,3.5,-668);

  // 골 성
  addGoal(0,1,-722);
}

// ── 로블록스 R6 캐릭터 ────────────────────────────────────
const charGroup = new THREE.Group();
scene.add(charGroup);

function pt(w,h,d,c){ const m=mkBox(w,h,d,c); m.castShadow=true; m.receiveShadow=true; return m; }

// 로블록스 기본 색상
const C_SKIN  = 0xffcc00;   // 노란 피부
const C_SHIRT = 0x1565c0;   // 파란 셔츠
const C_PANTS = 0x0d1b6e;   // 진파랑 바지
const C_WHITE = 0xffffff;
const C_BLACK = 0x111111;

// 몸통 (Torso)
const body = pt(1.2, 1.4, 0.7, C_SHIRT);

// 머리 (Head) - 로블록스 특유의 정사각형 큰 머리
const head = pt(1.2, 1.2, 1.2, C_SKIN);
// 얼굴: 흰 눈 + 검은 눈동자 + 웃음
const lEyeW  = pt(0.28,0.22,0.05,C_WHITE);  lEyeW.position.set(-0.24, 0.10, 0.61);
const rEyeW  = pt(0.28,0.22,0.05,C_WHITE);  rEyeW.position.set( 0.24, 0.10, 0.61);
const lPupil = pt(0.12,0.15,0.05,C_BLACK);  lPupil.position.set(-0.24, 0.08, 0.62);
const rPupil = pt(0.12,0.15,0.05,C_BLACK);  rPupil.position.set( 0.24, 0.08, 0.62);
const smL    = pt(0.13,0.07,0.04,C_BLACK);  smL.position.set(-0.13,-0.19,0.62); smL.rotation.z= 0.5;
const smM    = pt(0.15,0.07,0.04,C_BLACK);  smM.position.set(    0,-0.24,0.62);
const smR    = pt(0.13,0.07,0.04,C_BLACK);  smR.position.set( 0.13,-0.19,0.62); smR.rotation.z=-0.5;
[lEyeW,rEyeW,lPupil,rPupil,smL,smM,smR].forEach(p=>head.add(p));

// 셔츠 위 장식 (넥 라인)
const neck = pt(0.4, 0.2, 0.4, C_SKIN);

// 팔 - 위쪽(소매)은 셔츠색, 아래(손)는 피부색
const lArm = pt(0.55, 1.3, 0.55, C_SKIN);
const rArm = pt(0.55, 1.3, 0.55, C_SKIN);
const lSleeve = pt(0.56,0.65,0.56,C_SHIRT); lSleeve.position.set(0, 0.33,0);
const rSleeve = pt(0.56,0.65,0.56,C_SHIRT); rSleeve.position.set(0, 0.33,0);
lArm.add(lSleeve); rArm.add(rSleeve);

// 다리 - 바지색 + 검은 신발
const lLeg = pt(0.55, 1.3, 0.55, C_PANTS);
const rLeg = pt(0.55, 1.3, 0.55, C_PANTS);
const lShoe = pt(0.56,0.3,0.58,C_BLACK); lShoe.position.set(0,-0.52,0);
const rShoe = pt(0.56,0.3,0.58,C_BLACK); rShoe.position.set(0,-0.52,0);
lLeg.add(lShoe); rLeg.add(rShoe);

// 위치 조립 (로블록스 R6 비율)
body.position.set(0, 0, 0);
neck.position.set(0, 0.80, 0);
head.position.set(0, 1.05, 0);
lArm.position.set(-0.875, 0.05, 0);
rArm.position.set( 0.875, 0.05, 0);
lLeg.position.set(-0.325, -1.35, 0);
rLeg.position.set( 0.325, -1.35, 0);

[body, neck, head, lArm, rArm, lLeg, rLeg].forEach(p=>charGroup.add(p));

// ── Physics ────────────────────────────────────────────────
const charPos = new THREE.Vector3(0, 3, 0);
let charVelY  = 0;
let charYaw   = 0;
let onGround  = false;
let jumpsLeft = 5;          // ★ 5단 점프
const GRAVITY = -22;
const JUMP_F  = 9.0;
const SPEED   = 7.5;
const CHAR_H  = 1.75;
const MAX_JUMPS = 5;

// ── Camera (자동 추적 - 마우스 불필요) ────────────────────
let camYaw   = 0;           // 카메라 yaw (캐릭터 뒤를 서서히 따라감)
const CAM_PITCH = 0.38;     // 고정 내려보는 각도
const CAM_DIST  = 11;       // 고정 거리
const CAM_LERP  = 4.0;      // 추적 속도 (높을수록 빠르게 따라감)

// ── Input ──────────────────────────────────────────────────
const keys={};
let paused = false;

document.addEventListener('keydown',e=>{
  if(keys[e.code]) return;
  keys[e.code]=true;
  if(e.code==='Escape'&&gameRunning){
    paused = !paused;
    pauseScreen.style.display = paused ? 'flex' : 'none';
  }
  if(e.code==='Space'&&gameRunning&&!paused){
    if(jumpsLeft>0){
      charVelY = JUMP_F;
      jumpsLeft--;
      const used = MAX_JUMPS - jumpsLeft;
      if(used===2) showNotify('2단 점프!',0.6);
      else if(used===3) showNotify('3단 점프! ✨',0.6);
      else if(used===4) showNotify('4단 점프! 🌟',0.7);
      else if(used===5) showNotify('5단 점프! 💫',0.9);
      onGround=false;
      updateJumpDots();
    }
  }
});
document.addEventListener('keyup',e=>{keys[e.code]=false;});

// ── 점프 도트 UI ───────────────────────────────────────────
function updateJumpDots(){
  for(let i=0;i<5;i++){
    const d=document.getElementById(`jd${i}`);
    d.className='jump-dot'+(i<jumpsLeft?' active':'');
  }
}

// ── 알림 ──────────────────────────────────────────────────
const notifyEl = document.getElementById('notify');
let notifyTimer=null;
function showNotify(msg,dur=2){
  notifyEl.textContent=msg;
  notifyEl.style.opacity=1;
  clearTimeout(notifyTimer);
  notifyTimer=setTimeout(()=>{notifyEl.style.opacity=0;},dur*1000);
}

// ── 충돌 ──────────────────────────────────────────────────
function resolveCollision(){
  const R=0.45;
  let landed=false;
  for(const p of platforms){
    if(!p.solid) continue;
    if(charPos.x+R<p.minX||charPos.x-R>p.maxX) continue;
    if(charPos.z+R<p.minZ||charPos.z-R>p.maxZ) continue;
    const footY=charPos.y-CHAR_H;
    const headY=charPos.y+0.3;
    if(charVelY<=0.05&&footY<=p.maxY+0.08&&footY>=p.maxY-0.85){
      charPos.y=p.maxY+CHAR_H;
      charVelY = p.bouncy ? JUMP_F*1.6 : 0;
      if(p.bouncy) showNotify('🟡 통통!',0.5);
      // Q블록 밟기
      if(p.isQBlock&&!p.hit){
        p.hit=true;
        p.mesh.material.color.set(0x888888);
        showNotify('⭐ +코인!',1);
        addFloatingCoin(p.cx,p.cy+1.5,p.cz);
        collectedCoins++;
        updateCoinUI();
      }
      landed=true;
    } else if(charVelY>0&&headY>=p.minY&&headY<=p.minY+0.7){
      charPos.y=p.minY-0.3; charVelY=0;
    } else if(footY<p.maxY-0.05&&headY>p.minY){
      const ox=charPos.x-p.cx, oz=charPos.z-p.cz;
      const penX=(p.hw+R)-Math.abs(ox), penZ=(p.hd+R)-Math.abs(oz);
      if(penX>0&&penZ>0){
        if(penX<penZ) charPos.x+=Math.sign(ox)*penX;
        else          charPos.z+=Math.sign(oz)*penZ;
      }
    }
  }
  return landed;
}

// ── 플로팅 코인 (Q블록에서 나오는 코인) ─────────────────
function addFloatingCoin(x,y,z){
  const m=mkCyl(0.3,0.1,0xffd700);
  m.rotation.x=Math.PI/2;
  m.position.set(x,y,z);
  scene.add(m);
  let t=0;
  const anim=()=>{
    t+=0.05;
    m.position.y=y+Math.sin(t)*0.5+t*0.5;
    m.rotation.z+=0.1;
    if(t<2) requestAnimationFrame(anim);
    else scene.remove(m);
  };
  anim();
}

// ── 코인 수집 ─────────────────────────────────────────────
const coinCountEl=document.getElementById('coin-count');
function updateCoinUI(){
  coinCountEl.textContent=collectedCoins;
}

function checkCoins(){
  for(const c of coins){
    if(c.collected) continue;
    const dx=charPos.x-c.x, dy=charPos.y-c.y, dz=charPos.z-c.z;
    if(dx*dx+dy*dy+dz*dz<1.5){
      c.collected=true;
      scene.remove(c.mesh);
      collectedCoins++;
      updateCoinUI();
      showNotify('🪙',0.4);
    }
  }
}

// ── 게임 상태 ─────────────────────────────────────────────
let gameRunning=false, elapsed=0, deaths=0, currentCP=0, TOTAL_CP=0;

const startScreen=document.getElementById('start-screen');
const pauseScreen=document.getElementById('pause-screen');
const clearScreen=document.getElementById('clear-screen');
const timerEl=document.getElementById('timer');
const progBar=document.getElementById('prog-bar');

function startGame(){
  buildWorld();
  TOTAL_CP=checkpoints.length;
  currentCP=0; elapsed=0; deaths=0;
  collectedCoins=0; updateCoinUI();
  respawn(true);
  progBar.style.width='0%';
  gameRunning=true;
  showNotify('🍄 구간 1 - 초록 들판!',2.5);
}

function respawn(silent){
  const cp=checkpoints[currentCP];
  charPos.copy(cp.pos).add(new THREE.Vector3(0,1.5,0));
  charVelY=0; onGround=false;
  jumpsLeft=MAX_JUMPS; updateJumpDots();
  if(!silent){ deaths++; showNotify('💀 다시 시도!',1.5); }
}

function reachCP(idx){
  if(idx<=currentCP) return;
  currentCP=idx;
  progBar.style.width=`${(currentCP/(TOTAL_CP-1))*100}%`;
  const names=['','🪙 구간 2 - 코인 로드','🔴 구간 3 - 움직이는 발판',
    '👻 구간 4 - 사라지는 발판','🌟 구간 5 - 통통 발판',
    '🌿 구간 6 - 파이프 왕국','🌈 구간 7 - 최종 구간'];
  showNotify('✅ 체크포인트! '+(names[idx]||''),2.5);
  checkpoints[idx].flagMesh.material.color.set(0x27ae60);
}

// ── 애니메이션 ────────────────────────────────────────────
let animT=0;
function animChar(moving,dt){
  animT += dt*(moving?8:0);
  const sw = moving ? Math.sin(animT)*0.6 : 0;
  lArm.rotation.x =  sw;
  rArm.rotation.x = -sw;
  lLeg.rotation.x = -sw;
  rLeg.rotation.x =  sw;
  head.position.y = 1.05+(moving?Math.abs(Math.sin(animT))*0.03:0);
  neck.position.y = 0.80+(moving?Math.abs(Math.sin(animT))*0.03:0);
  if(!onGround){
    body.scale.y=1.1; lLeg.scale.y=rLeg.scale.y=0.92;
  } else {
    body.scale.y=1.0; lLeg.scale.y=rLeg.scale.y=1.0;
  }
}

// ── UI 콜백 ───────────────────────────────────────────────
document.getElementById('play-btn').addEventListener('click',()=>{
  startScreen.style.display='none';
  startGame();
});
document.getElementById('resume-btn').addEventListener('click',()=>{
  paused=false;
  pauseScreen.style.display='none';
});
document.getElementById('restart-btn').addEventListener('click',()=>{
  paused=false;
  pauseScreen.style.display='none';
  startGame();
});
document.getElementById('replay-btn').addEventListener('click',()=>{
  clearScreen.style.display='none';
  startGame();
});

// ── 메인 루프 ─────────────────────────────────────────────
let lastTime=performance.now();

function animate(){
  requestAnimationFrame(animate);
  const now=performance.now();
  const dt=Math.min((now-lastTime)/1000,0.05);
  lastTime=now;

  // 코인 회전 (수집 안된 것)
  coins.forEach(c=>{ if(!c.collected) c.mesh.rotation.y+=dt*2; });

  if(!gameRunning||paused){ renderer.render(scene,camera); return; }

  elapsed+=dt;
  timerEl.textContent=elapsed.toFixed(1)+'s';

  // ─ 다이나믹 오브젝트 ─
  for(const d of dynamics){
    if(d.type==='move'){
      d.t+=dt*d.speed;
      const off=Math.sin(d.t)*d.range;
      if(d.axis==='x'){ d.p.cx=d.ox+off; d.p.mesh.position.x=d.p.cx; }
      else             { d.p.cz=d.oz+off; d.p.mesh.position.z=d.p.cz; }
      updBounds(d.p);
    } else {
      d.t+=dt;
      const vis=((d.t%d.period)/d.period)<0.58;
      d.p.solid=vis;
      d.p.mesh.material.opacity=vis?1:0.18;
      d.p.mesh.material.transparent=true;
    }
  }

  // ─ 이동 (카메라 기준 방향) ─
  const fwd=new THREE.Vector3(-Math.sin(camYaw),0,-Math.cos(camYaw));
  const rgt=new THREE.Vector3(-Math.sin(camYaw-Math.PI/2),0,-Math.cos(camYaw-Math.PI/2));
  let mx=0,mz=0;
  if(keys['KeyW']||keys['ArrowUp'])    {mx+=fwd.x;mz+=fwd.z;}
  if(keys['KeyS']||keys['ArrowDown'])  {mx-=fwd.x;mz-=fwd.z;}
  if(keys['KeyA']||keys['ArrowLeft'])  {mx-=rgt.x;mz-=rgt.z;}
  if(keys['KeyD']||keys['ArrowRight']) {mx+=rgt.x;mz+=rgt.z;}
  const len=Math.sqrt(mx*mx+mz*mz);
  const moving=len>0.01;
  if(moving){
    mx/=len; mz/=len;
    charPos.x+=mx*SPEED*dt; charPos.z+=mz*SPEED*dt;
    charYaw=Math.atan2(mx,mz);
    // 카메라가 캐릭터 이동 방향 뒤로 부드럽게 따라감
    let targetYaw = charYaw + Math.PI;   // 캐릭터 뒤쪽
    // 각도 차이를 -π ~ π 범위로 정규화
    let diff = targetYaw - camYaw;
    while(diff >  Math.PI) diff -= Math.PI*2;
    while(diff < -Math.PI) diff += Math.PI*2;
    camYaw += diff * Math.min(CAM_LERP * dt, 1.0);
  }

  // ─ 중력 ─
  charVelY+=GRAVITY*dt;
  charPos.y+=charVelY*dt;

  // ─ 충돌 ─
  onGround=false;
  if(resolveCollision()){
    onGround=true;
    jumpsLeft=MAX_JUMPS;
    updateJumpDots();
  }

  // ─ 추락 ─
  if(charPos.y<-15) respawn(false);

  // ─ 코인 수집 ─
  checkCoins();

  // ─ 체크포인트 ─
  for(const cp of checkpoints){
    if(charPos.distanceTo(cp.pos)<3.5) reachCP(cp.index);
  }

  // ─ 골 ─
  if(charPos.distanceTo(goalPos)<6){
    gameRunning=false;
    document.getElementById('clear-stats').innerHTML=
      `⏱ 클리어 시간: <b>${elapsed.toFixed(1)}초</b><br>`+
      `🪙 코인: <b>${collectedCoins} / ${totalCoins}</b><br>`+
      `💀 사망: <b>${deaths}번</b>`;
    clearScreen.style.display='flex';
  }

  // ─ 캐릭터 적용 ─
  charGroup.position.copy(charPos);
  charGroup.rotation.y=charYaw;
  animChar(moving,dt);

  // ─ 3인칭 카메라 (자동 추적) ─
  const camOX=Math.sin(camYaw)*Math.cos(CAM_PITCH)*CAM_DIST;
  const camOY=Math.sin(CAM_PITCH)*CAM_DIST+2.5;
  const camOZ=Math.cos(camYaw)*Math.cos(CAM_PITCH)*CAM_DIST;
  const target=charPos.clone().add(new THREE.Vector3(0,1.5,0));
  camera.position.copy(target).add(new THREE.Vector3(camOX,camOY,camOZ));
  camera.lookAt(target);

  renderer.render(scene,camera);
}

window.addEventListener('resize',()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
});

animate();
