import * as THREE from "https://esm.sh/three";
import * as CANNON from "https://esm.sh/cannon-es";

let scene, camera, renderer, world;
let coinObjects = [];
let isHolding = false;
let needsResultCheck = false;
let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();

// RWD 視野控制：初始值設為 20，但會由 getFrustumSize 動態決定
let dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -15);

// UI
const uiResult = document.getElementById("result-board");
const uiMain = document.getElementById("main-result");
const uiDetail = document.getElementById("detail-result");
const uiCountDisplay = document.getElementById("count-display");
const btnPlus = document.getElementById("btn-plus");
const btnMinus = document.getElementById("btn-minus");
const btnThrow = document.getElementById("btn-throw");
const btnColor = document.getElementById("btn-color");

const palette = ["#EAA14D", "#F2C94C", "#E05A47", "#4D9BEA", "#5FB376"];
const commonColors = {
  text: "#FFFFFF",
  outline: "#725349",
  shadow: "#F3BD2E",
};

// 共用幾何體 (優化效能)
let coinGeo, outlineGeo, shadowGeo, coinShape, coinShapeQ;
let outlineMat, shadowMat;
let currentCoinCount = 1;

init();
animate();

function getFrustumSize() {
  const aspect = window.innerWidth / window.innerHeight;
  // 手機直向 (aspect < 1) 時拉遠鏡頭 (30)，電腦維持 (20)
  return aspect < 1.0 ? 30 : 20;
}

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#F6F3EB");

  const aspect = window.innerWidth / window.innerHeight;
  const frustumSize = getFrustumSize();

  camera = new THREE.OrthographicCamera(
    (frustumSize * aspect) / -2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    frustumSize / -2,
    1,
    1000
  );
  camera.position.set(40, 50, 40);
  camera.lookAt(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.userSelect = "none";
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  world = new CANNON.World();
  world.gravity.set(0, -50, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 20;
  world.allowSleep = true;

  // 物理材質設定
  const wallMat = new CANNON.Material();
  const coinMat = new CANNON.Material();
  world.addContactMaterial(
    new CANNON.ContactMaterial(wallMat, coinMat, {
      friction: 0.4,
      restitution: 0.5,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    })
  );
  world.addContactMaterial(
    new CANNON.ContactMaterial(coinMat, coinMat, {
      friction: 0.4,
      restitution: 0.6,
    })
  );

  createPhysicsWalls(wallMat);
  initSharedResources(coinMat); // 初始化共用幾何體
  updateCoinCount(currentCoinCount, true); // 初始生成

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("mousedown", onInputStart);
  window.addEventListener("mousemove", onInputMove);
  window.addEventListener("mouseup", onInputEnd);
  document.body.addEventListener("mouseleave", onInputEnd);
  window.addEventListener("touchstart", onInputStart, { passive: false });
  window.addEventListener("touchmove", onInputMove, { passive: false });
  window.addEventListener("touchend", onInputEnd);

  setupUIEvents();
}

// 初始化共用資源
function initSharedResources(physicsMat) {
  const radius = 2.2;
  const thickness = 0.5;
  const segments = 32;

  // 視覺幾何體
  coinGeo = new THREE.CylinderGeometry(radius, radius, thickness, segments);

  // 邊框幾何體 (不分開計算，直接放大)
  outlineGeo = new THREE.CylinderGeometry(
    radius * 1.05,
    radius * 1.05,
    thickness * 1.05,
    segments
  );

  shadowGeo = new THREE.CircleGeometry(radius, 32);

  // 物理形狀
  coinShape = new CANNON.Cylinder(radius, radius, thickness, segments);
  coinShapeQ = new CANNON.Quaternion();
  coinShapeQ.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);

  // 材質
  outlineMat = new THREE.MeshBasicMaterial({
    color: commonColors.outline,
    side: THREE.BackSide,
  });
  shadowMat = new THREE.MeshBasicMaterial({
    color: commonColors.shadow,
    transparent: true,
    opacity: 0.2,
  });

  // 把物理材質存在 world 裡方便之後取用
  world.defaultCoinMaterial = physicsMat;
}

function setupUIEvents() {
  btnPlus.addEventListener("click", () => {
    if (currentCoinCount < 10) {
      currentCoinCount++;
      uiCountDisplay.innerText = currentCoinCount;
      updateCoinCount(currentCoinCount);
    }
  });

  btnMinus.addEventListener("click", () => {
    if (currentCoinCount > 1) {
      currentCoinCount--;
      uiCountDisplay.innerText = currentCoinCount;
      updateCoinCount(currentCoinCount);
    }
  });

  btnThrow.addEventListener("click", () => {
    manualThrow();
  });

  btnColor.addEventListener("click", () => {
    changeCoinColors();
  });
}

// --- 增減與生成邏輯 ---

function updateCoinCount(targetCount, isInit = false) {
  if (isInit) {
    for (let i = 0; i < targetCount; i++) {
      const startX = (i - (targetCount - 1) / 2) * 3.0;
      addSingleCoin(new CANNON.Vec3(startX, 2.5, 0));
    }
    return;
  }

  const currentCount = coinObjects.filter((c) => !c.isShrinking).length;
  const diff = targetCount - currentCount;

  if (diff > 0) {
    // 增加：從天而降
    for (let i = 0; i < diff; i++) {
      const pos = new CANNON.Vec3(
        (Math.random() - 0.5) * 5,
        15 + i * 2,
        (Math.random() - 0.5) * 5
      );
      addSingleCoin(pos, true);
    }
  } else if (diff < 0) {
    // 減少：移除最後幾顆
    const activeCoins = coinObjects.filter((c) => !c.isShrinking);
    for (let i = 0; i < Math.abs(diff); i++) {
      const target = activeCoins[activeCoins.length - 1 - i];
      if (target) {
        removeSingleCoin(target);
      }
    }
  }

  uiResult.classList.remove("show");
}

function addSingleCoin(position, isDrop = false) {
  const randomColor = palette[Math.floor(Math.random() * palette.length)];

  // 材質
  const sideMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(randomColor).multiplyScalar(0.8),
  });
  const topMat = new THREE.MeshBasicMaterial({
    map: createCoinTexture("YES", randomColor),
  });
  const bottomMat = new THREE.MeshBasicMaterial({
    map: createCoinTexture("NO", randomColor),
  });

  // 網格
  const mesh = new THREE.Mesh(coinGeo, [sideMat, topMat, bottomMat]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const outline = new THREE.Mesh(outlineGeo, outlineMat);
  scene.add(outline);

  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

  // 物理剛體
  const body = new CANNON.Body({
    mass: 5,
    material: world.defaultCoinMaterial,
    position: position,
    sleepSpeedLimit: 0.5,
    sleepTimeLimit: 0.5,
  });

  // 注意：Cylinder 在 Cannon 預設方向跟 Three 不一樣，需要旋轉 Shape
  body.addShape(coinShape, new CANNON.Vec3(0, 0, 0), coinShapeQ);

  // 初始旋轉 (讓硬幣平躺)
  body.quaternion.setFromEuler(Math.PI / 2, 0, 0);

  if (isDrop) {
    body.velocity.set((Math.random() - 0.5) * 5, -5, (Math.random() - 0.5) * 5);
    body.angularVelocity.set(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10
    );
  }

  world.addBody(body);

  coinObjects.push({
    mesh,
    outline,
    shadow,
    body,
    materials: [sideMat, topMat, bottomMat], // 存起來方便換色
    spinOffset: 0,
    isReturning: false,
    isShrinking: false,
  });
}

function removeSingleCoin(coinObj) {
  coinObj.isShrinking = true;
  world.removeBody(coinObj.body);
}

function cleanUpCoin(obj) {
  scene.remove(obj.mesh);
  scene.remove(obj.outline);
  scene.remove(obj.shadow);

  // 釋放材質與貼圖
  obj.materials.forEach((m) => {
    if (m.map) m.map.dispose();
    m.dispose();
  });
}

function changeCoinColors() {
  coinObjects.forEach((obj) => {
    if (obj.isShrinking) return;

    const newColor = palette[Math.floor(Math.random() * palette.length)];

    // 更新材質顏色
    obj.materials[0].color.set(newColor).multiplyScalar(0.8); // 側面

    // 更新貼圖
    if (obj.materials[1].map) obj.materials[1].map.dispose();
    obj.materials[1].map = createCoinTexture("YES", newColor);

    if (obj.materials[2].map) obj.materials[2].map.dispose();
    obj.materials[2].map = createCoinTexture("NO", newColor);

    // 給予一點跳動回饋
    if (!isHolding) {
      obj.body.wakeUp();
      obj.body.velocity.y = 5;
      obj.body.angularVelocity.set(Math.random(), Math.random(), Math.random());
    }
  });
}

// --- 操作與動畫邏輯 ---

function updateMousePosition(e) {
  let x, y;
  if (e.changedTouches) {
    x = e.changedTouches[0].clientX;
    y = e.changedTouches[0].clientY;
  } else {
    x = e.clientX;
    y = e.clientY;
  }
  mouse.x = (x / window.innerWidth) * 2 - 1;
  mouse.y = -(y / window.innerHeight) * 2 + 1;
}

function onInputStart(e) {
  if (
    e.target.closest(".bottom-right-controls") ||
    e.target.closest(".bottom-left-controls") ||
    e.target.closest(".top-left-controls") ||
    e.target.tagName === "BUTTON"
  )
    return;

  if (e.cancelable) e.preventDefault();
  isHolding = true;
  needsResultCheck = false;
  uiResult.classList.remove("show");
  updateMousePosition(e);

  coinObjects.forEach((obj) => {
    if (obj.isShrinking) return;
    obj.body.wakeUp();
    obj.spinOffset = Math.random() * 100;
    obj.isReturning = false;
  });
}

function onInputMove(e) {
  if (!isHolding) return;
  if (
    e.target.closest(".bottom-right-controls") ||
    e.target.closest(".bottom-left-controls") ||
    e.target.closest(".top-left-controls")
  )
    return;

  if (e.cancelable) e.preventDefault();
  updateMousePosition(e);
}

function onInputEnd(e) {
  if (!isHolding) return;
  isHolding = false;
  releaseCoins();
}

function releaseCoins() {
  const SAFE_LIMIT = 9;
  coinObjects.forEach((obj) => {
    if (obj.isShrinking) return;
    const { body } = obj;
    const isOutside =
      Math.abs(body.position.x) > SAFE_LIMIT ||
      Math.abs(body.position.z) > SAFE_LIMIT;
    if (isOutside) {
      obj.isReturning = true;
    } else {
      body.wakeUp();
      applyTossForce(body);
    }
  });
  setTimeout(() => {
    needsResultCheck = true;
  }, 500);
}

function manualThrow() {
  isHolding = false;
  uiResult.classList.remove("show");
  needsResultCheck = false;

  coinObjects.forEach((obj) => {
    if (obj.isShrinking) return;
    obj.body.wakeUp();
    obj.body.position.set(
      (Math.random() - 0.5) * 5,
      10 + Math.random() * 5,
      (Math.random() - 0.5) * 5
    );
    // 隨機旋轉
    obj.body.quaternion.setFromEuler(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      0
    );
    obj.body.velocity.set(0, 0, 0);
    obj.body.angularVelocity.set(0, 0, 0);
    obj.isReturning = false;

    applyTossForce(obj.body);
  });

  setTimeout(() => {
    needsResultCheck = true;
  }, 500);
}

function applyTossForce(body) {
  const xDist = -body.position.x;
  const zDist = -body.position.z;
  body.velocity.set(
    xDist * 1.5 + (Math.random() - 0.5) * 5,
    10 + Math.random() * 10,
    zDist * 1.5 + (Math.random() - 0.5) * 5
  );
  body.angularVelocity.set(
    (Math.random() - 0.5) * 50,
    (Math.random() - 0.5) * 5,
    (Math.random() - 0.5) * 50
  );
}

function createPhysicsWalls(material) {
  const floorBody = new CANNON.Body({ mass: 0, material: material });
  floorBody.addShape(new CANNON.Plane());
  floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(floorBody);

  const wallDistance = 12;
  const createWall = (x, z, rot) => {
    const body = new CANNON.Body({ mass: 0, material: material });
    body.addShape(new CANNON.Plane());
    body.position.set(x, 0, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rot);
    world.addBody(body);
  };
  createWall(wallDistance, 0, -Math.PI / 2);
  createWall(-wallDistance, 0, Math.PI / 2);
  createWall(0, -wallDistance, 0);
  createWall(0, wallDistance, Math.PI);
}

function createCoinTexture(text, colorHex) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = colorHex;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 20, 0, Math.PI * 2);
  ctx.lineWidth = 15;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.stroke();

  ctx.fillStyle = commonColors.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 200px 'Bungee', sans-serif";

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.2)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 5;
  ctx.fillText(text, size / 2, size / 2 + 15);
  ctx.restore();

  return new THREE.CanvasTexture(canvas);
}

function calculateResult() {
  let yesCount = 0;
  let noCount = 0;
  let standingCount = 0;
  let details = [];

  const activeCoins = coinObjects.filter((c) => !c.isShrinking);

  activeCoins.forEach(({ mesh }) => {
    const localUp = new THREE.Vector3(0, 1, 0);
    localUp.applyQuaternion(mesh.quaternion);

    if (localUp.y > 0.5) {
      yesCount++;
      details.push("YES");
    } else if (localUp.y < -0.5) {
      noCount++;
      details.push("NO");
    } else {
      standingCount++;
      details.push("?");
    }
  });

  if (activeCoins.length === 1) {
    uiMain.innerText = details[0];
    uiDetail.innerText = "";
  } else {
    let text = [];
    if (yesCount > 0) text.push(`${yesCount} YES`);
    if (noCount > 0) text.push(`${noCount} NO`);
    if (standingCount > 0) text.push(`${standingCount} ?`);
    uiMain.innerText = text.join(" / ");
    uiDetail.innerText = `(${details.join(", ")})`;
  }
  uiResult.classList.add("show");
  needsResultCheck = false;
}

function animate() {
  requestAnimationFrame(animate);

  // 處理縮小消失
  for (let i = coinObjects.length - 1; i >= 0; i--) {
    const obj = coinObjects[i];
    if (obj.isShrinking) {
      const shrinkSpeed = 0.85;
      obj.mesh.scale.multiplyScalar(shrinkSpeed);
      obj.outline.scale.multiplyScalar(shrinkSpeed);
      obj.shadow.scale.multiplyScalar(shrinkSpeed);

      if (obj.mesh.scale.x < 0.05) {
        cleanUpCoin(obj);
        coinObjects.splice(i, 1);
      }
      continue;
    }
  }

  if (isHolding) {
    raycaster.setFromCamera(mouse, camera);
    const targetPoint = new THREE.Vector3();
    const intersect = raycaster.ray.intersectPlane(dragPlane, targetPoint);
    if (intersect) {
      const time = performance.now() * 0.01;
      coinObjects.forEach((obj, i) => {
        if (obj.isShrinking) return;
        const offsetX = Math.sin(time + i) * 1.0;
        const offsetZ = Math.cos(time + i * 2) * 1.0;
        obj.body.position.x +=
          (targetPoint.x + offsetX - obj.body.position.x) * 0.25;
        obj.body.position.y += (15 - obj.body.position.y) * 0.25;
        obj.body.position.z +=
          (targetPoint.z + offsetZ - obj.body.position.z) * 0.25;
        obj.body.quaternion.setFromEuler(
          Math.PI / 2,
          time * 5 + obj.spinOffset,
          0
        );
        obj.body.velocity.set(0, 0, 0);
        obj.body.angularVelocity.set(0, 0, 0);
        obj.isReturning = false;
      });
    }
  } else {
    const time = performance.now() * 0.01;
    coinObjects.forEach((obj) => {
      if (obj.isShrinking) return;
      if (obj.isReturning) {
        obj.body.position.x += (0 - obj.body.position.x) * 0.15;
        obj.body.position.z += (0 - obj.body.position.z) * 0.15;
        obj.body.position.y += (12 - obj.body.position.y) * 0.1;
        obj.body.quaternion.setFromEuler(0, time * 10, 0);
        obj.body.velocity.set(0, 0, 0);
        obj.body.angularVelocity.set(0, 0, 0);
        if (
          Math.abs(obj.body.position.x) < 8 &&
          Math.abs(obj.body.position.z) < 8
        ) {
          obj.isReturning = false;
          obj.body.wakeUp();
          applyTossForce(obj.body);
        }
      }
    });
    world.step(1 / 60);
  }

  coinObjects.forEach((obj) => {
    if (obj.isShrinking) return;
    const { mesh, outline, shadow, body } = obj;

    // 同步物理位置
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);

    // *修正視覺角度*：
    // Cannon 的 Cylinder 預設朝向 Z 軸，我們用 Quaternion 轉了 Shape
    // Three 的 Cylinder 預設朝向 Y 軸
    // 所以需要轉 90 度讓它們對齊
    mesh.rotateX(Math.PI / 2);

    outline.position.copy(mesh.position);
    outline.quaternion.copy(mesh.quaternion);

    shadow.position.x = body.position.x;
    shadow.position.z = body.position.z;
    const height = Math.max(0, body.position.y - 0.2);
    const scale = Math.max(0.5, 1 - height * 0.04);
    const opacity = Math.max(0, 0.3 - height * 0.01);
    shadow.scale.setScalar(scale);
    shadow.material.opacity = opacity;
  });

  if (needsResultCheck) {
    let allStopped = true;
    for (let o of coinObjects) {
      if (o.isShrinking) continue;
      if (o.isReturning) {
        allStopped = false;
        break;
      }
      if (
        o.body.velocity.lengthSquared() > 0.05 ||
        o.body.angularVelocity.lengthSquared() > 0.05
      ) {
        allStopped = false;
        break;
      }
    }
    if (allStopped) calculateResult();
  }
  renderer.render(scene, camera);
}

function onWindowResize() {
  const aspect = window.innerWidth / window.innerHeight;

  // RWD
  const frustumSize = getFrustumSize();

  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
