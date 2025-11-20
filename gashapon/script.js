import * as THREE from "https://esm.sh/three";
import * as CANNON from "https://esm.sh/cannon-es";
let scene, camera, renderer, world;
let balls = [];
let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();
let hoveredObject = null;
let gameItems = [];
let isMouseDown = false;
let clickStartTime = 0;
let currentDrawnBall = null;
const palette = [
  "#EAA14D",
  "#F2C94C",
  "#E05A47",
  "#4D9BEA",
  "#5FB376",
  "#D869A8",
  "#9B51E0",
];
const styles = {
  outlineColor: 0x725349,
  hoverColor: 0xff0000,
  shadowColor: 0xf3bd2e,
};
// DOM
const uiEditModal = document.getElementById("edit-modal");
const btnOpenEdit = document.getElementById("btn-open-edit");
const btnShuffle = document.getElementById("btn-shuffle");
const btnRandomPick = document.getElementById("btn-random-pick");
const btnMainRestart = document.getElementById("btn-main-restart");
const uiResetModal = document.getElementById("reset-modal");
const btnResetConfirm = document.getElementById("btn-reset-confirm");
const btnResetCancel = document.getElementById("btn-reset-cancel");
const btnModalClose = document.getElementById("btn-modal-close");
const btnModalRestart = document.getElementById("btn-modal-restart");
const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");
const statusList = document.getElementById("status-list");
const inputTextarea = document.getElementById("input-textarea");
const checkRemove = document.getElementById("check-remove");
const uiResult = document.getElementById("result-overlay");
const resultText = document.getElementById("result-text");
const resultIcon = document.getElementById("result-icon");
const btnCloseResult = document.getElementById("btn-close-result");
const emptyMessage = document.getElementById("empty-message");

function getFrustumSize() {
  const aspect = window.innerWidth / window.innerHeight;
  // 如果寬小於高 (手機直向)，數值改大一點 (例如 35 或 40) 來拉遠
  // 如果是電腦 (橫向)，維持原本的 22
  return aspect < 1.0 ? 35 : 22;
}

init();
animate();
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#F6F3EB");
  const aspect = window.innerWidth / window.innerHeight;
  const frustumSize = getFrustumSize(); // 取得動態大小
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
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.touchAction = "none";
  document.body.appendChild(renderer.domElement);
  world = new CANNON.World();
  world.gravity.set(0, -50, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.allowSleep = false;
  const defaultMat = new CANNON.Material();
  const contactMat = new CANNON.ContactMaterial(defaultMat, defaultMat, {
    friction: 0.05,
    restitution: 0.7,
  });
  world.addContactMaterial(contactMat);
  createPhysicsWalls(defaultMat);
  parseAndReloadGame(defaultMat);
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener(
    "touchmove",
    (e) => {
      updateMousePosition(e);
      e.preventDefault();
    },
    { passive: false }
  );
  window.addEventListener(
    "touchstart",
    (e) => {
      updateMousePosition(e);
      onMouseDown(e);
    },
    { passive: false }
  );
  window.addEventListener("touchend", onMouseUp);
  setupUIEvents(defaultMat);
}
function parseAndReloadGame(material) {
  const rawText = inputTextarea.value;
  const lines = rawText
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  gameItems = [];
  let idCounter = 0;
  lines.forEach((line) => {
    const match = line.match(/^(.*?)\s*\*\s*(\d+)$/);
    if (match) {
      const itemText = match[1];
      const count = parseInt(match[2]);
      for (let k = 0; k < count; k++) {
        gameItems.push({
          id: idCounter++,
          text: itemText,
          drawn: false,
          color: null,
        });
      }
    } else {
      gameItems.push({
        id: idCounter++,
        text: line,
        drawn: false,
        color: null,
      });
    }
  });
  shuffleArray(gameItems);
  gameItems.forEach((item, i) => {
    item.color = palette[i % palette.length];
  });
  spawnBalls(material);
  updateStatusList(material);
  checkEmptyState();
}
function spawnBalls(material) {
  balls.forEach((obj) => removeVisualsAndBody(obj));
  balls = [];
  const radius = 2.2;
  const geometry = new THREE.SphereGeometry(radius, 32, 32);
  // 判斷是否為直向螢幕(手機/視野拉遠)，如果是則用 1.10 (加粗)，否則用 1.07
  const outlineScale = window.innerWidth < window.innerHeight ? 1.1 : 1.07;
  const outlineGeo = new THREE.SphereGeometry(radius * outlineScale, 32, 32);
  const outlineMat = new THREE.MeshBasicMaterial({
    color: styles.outlineColor,
    side: THREE.BackSide,
  });
  const shadowGeo = new THREE.CircleGeometry(radius, 32);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: styles.shadowColor,
    transparent: true,
    opacity: 0.2,
  });
  const shape = new CANNON.Sphere(radius);
  gameItems.forEach((item, i) => {
    if (item.drawn) return;
    const map = createSplitTexture(item.color);
    const mat = new THREE.MeshBasicMaterial({ map: map });
    const mesh = new THREE.Mesh(geometry, mat);
    scene.add(mesh);
    const outline = new THREE.Mesh(outlineGeo, outlineMat.clone());
    scene.add(outline);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);
    const body = new CANNON.Body({
      mass: 10,
      material: material,
      position: new CANNON.Vec3(
        (Math.random() - 0.5) * 10,
        5 + i * 2,
        (Math.random() - 0.5) * 10
      ),
      angularDamping: 0.1,
      linearDamping: 0.1,
    });
    body.addShape(shape);
    body.velocity.set(
      (Math.random() - 0.5) * 15,
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 15
    );
    body.quaternion.setFromEuler(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    world.addBody(body);
    const ballObj = {
      mesh,
      outline,
      shadow,
      body,
      itemData: item,
      isShrinking: false,
    };
    mesh.userData.parentObj = ballObj;
    balls.push(ballObj);
  });
}
function spawnSingleBall(item, material) {
  const radius = 2.2;
  const geometry = new THREE.SphereGeometry(radius, 32, 32);
  const outlineScale = window.innerWidth < window.innerHeight ? 1.1 : 1.07;
  const outlineGeo = new THREE.SphereGeometry(radius * outlineScale, 32, 32);
  const outlineMat = new THREE.MeshBasicMaterial({
    color: styles.outlineColor,
    side: THREE.BackSide,
  });
  const shadowGeo = new THREE.CircleGeometry(radius, 32);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: styles.shadowColor,
    transparent: true,
    opacity: 0.2,
  });
  const shape = new CANNON.Sphere(radius);
  const map = createSplitTexture(item.color);
  const mat = new THREE.MeshBasicMaterial({ map: map });
  const mesh = new THREE.Mesh(geometry, mat);
  scene.add(mesh);
  const outline = new THREE.Mesh(outlineGeo, outlineMat);
  scene.add(outline);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  const body = new CANNON.Body({
    mass: 10,
    material: material,
    position: new CANNON.Vec3(0, 15, 0),
    angularDamping: 0.1,
    linearDamping: 0.1,
  });
  body.addShape(shape);
  body.velocity.set((Math.random() - 0.5) * 5, -10, (Math.random() - 0.5) * 5);
  body.quaternion.setFromEuler(
    Math.random() * Math.PI,
    Math.random() * Math.PI,
    Math.random() * Math.PI
  );
  world.addBody(body);
  const ballObj = {
    mesh,
    outline,
    shadow,
    body,
    itemData: item,
    isShrinking: false,
  };
  mesh.userData.parentObj = ballObj;
  balls.push(ballObj);
  checkEmptyState();
}
function checkEmptyState() {
  if (balls.length === 0) {
    emptyMessage.classList.add("show");
  } else {
    emptyMessage.classList.remove("show");
  }
}
function updateStatusList(material) {
  statusList.innerHTML = "";
  gameItems.forEach((item) => {
    const li = document.createElement("li");
    const randomStatusColor =
      palette[Math.floor(Math.random() * palette.length)];
    const dot = document.createElement("div");
    dot.className = "color-dot";
    dot.style.backgroundColor = randomStatusColor;
    const textSpan = document.createElement("span");
    textSpan.innerText = item.text;
    li.appendChild(dot);
    li.appendChild(textSpan);
    if (item.drawn) {
      li.classList.add("drawn");
    }
    li.addEventListener("click", () => {
      if (item.drawn) {
        // 情況 A: 已經被劃掉 -> 復原 (這是原本就有的邏輯)
        item.drawn = false;
        const exists = balls.find((b) => b.itemData === item);
        if (!exists && material) {
          spawnSingleBall(item, material);
        }
      } else {
        // 情況 B: 還沒被劃掉 -> 手動標記為已抽過並移除球 (這是新增的邏輯)
        item.drawn = true;

        // 找到場景中對應的那顆球
        const ballIndex = balls.findIndex((b) => b.itemData === item);
        if (ballIndex !== -1) {
          const ballObj = balls[ballIndex];
          // 移除 3D 物體和物理剛體
          removeVisualsAndBody(ballObj);
          // 從陣列中刪除
          balls.splice(ballIndex, 1);
          // 檢查是否沒球了
          checkEmptyState();
        }
      }
      // 最後更新列表顯示狀態
      updateStatusList(material);
    });
    statusList.appendChild(li);
  });
}
function removeVisualsAndBody(obj) {
  scene.remove(obj.mesh);
  scene.remove(obj.outline);
  scene.remove(obj.shadow);
  world.removeBody(obj.body);
  if (obj.mesh.material) obj.mesh.material.dispose();
}
function setupUIEvents(material) {
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const targetId = "tab-" + btn.dataset.tab;
      tabPanes.forEach((p) => p.classList.remove("active"));
      document.getElementById(targetId).classList.add("active");
    });
  });
  btnOpenEdit.addEventListener("click", () => {
    updateStatusList(material);
    tabBtns[0].click();
    uiEditModal.classList.add("show");
  });
  btnModalClose.addEventListener("click", () =>
    uiEditModal.classList.remove("show")
  );
  btnModalRestart.addEventListener("click", () => {
    parseAndReloadGame(material);
    uiEditModal.classList.remove("show");
  });
  btnMainRestart.addEventListener("click", () => {
    uiResetModal.classList.add("show");
  });
  btnResetCancel.addEventListener("click", () =>
    uiResetModal.classList.remove("show")
  );
  btnResetConfirm.addEventListener("click", () => {
    parseAndReloadGame(material);
    uiResetModal.classList.remove("show");
  });
  btnRandomPick.addEventListener("click", () => {
    const activeBalls = balls.filter((b) => !b.isShrinking);
    if (activeBalls.length === 0) return;
    const randomIndex = Math.floor(Math.random() * activeBalls.length);
    const targetBall = activeBalls[randomIndex];
    balls.forEach((b) => b.body.wakeUp());
    openResult(targetBall);
  });
  btnShuffle.addEventListener("click", () => {
    balls.forEach((obj) => {
      if (obj.isShrinking) return;
      obj.body.wakeUp();
      obj.body.velocity.set(
        (Math.random() - 0.5) * 60,
        40 + Math.random() * 20,
        (Math.random() - 0.5) * 60
      );
      obj.body.angularVelocity.set(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20
      );
    });
  });
  btnCloseResult.addEventListener("click", () => {
    uiResult.classList.remove("show");
    // 延遲移除邏輯，等待 CSS 淡出動畫 (0.2s)
    setTimeout(() => {
      if (currentDrawnBall) {
        if (checkRemove.checked) {
          currentDrawnBall.itemData.drawn = true;
          currentDrawnBall.isShrinking = true;
          currentDrawnBall.body.collisionFilterGroup = 0;
          currentDrawnBall.body.collisionFilterMask = 0;
        } else {
          currentDrawnBall.itemData.drawn = false;
          currentDrawnBall.body.velocity.set(
            (Math.random() - 0.5) * 20,
            10,
            (Math.random() - 0.5) * 20
          );
        }
        currentDrawnBall = null;
      }
    }, 200);
  });
}
function createSplitTexture(color) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size / 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, size / 2, size, size / 2);
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.fillRect(0, size / 2 - 5, size, 10);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
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
function onMouseMove(e) {
  updateMousePosition(e);
}
function onMouseDown(e) {
  if (
    e.target.closest(".bottom-left-controls") ||
    e.target.closest(".bottom-right-controls") ||
    e.target.closest(".modal-content") ||
    e.target.closest("#result-overlay")
  )
    return;
  if (e.cancelable) e.preventDefault();
  isMouseDown = true;
  clickStartTime = Date.now();
}
function onMouseUp(e) {
  if (!isMouseDown) return;
  isMouseDown = false;
  if (Date.now() - clickStartTime < 300) checkClick();
}
function checkClick() {
  raycaster.setFromCamera(mouse, camera);
  const activeMeshes = balls.filter((b) => !b.isShrinking).map((b) => b.mesh);
  const intersects = raycaster.intersectObjects(activeMeshes);
  if (intersects.length > 0) {
    const target = intersects[0].object.userData.parentObj;
    if (target) openResult(target);
  }
}
function openResult(targetObj) {
  targetObj.body.velocity.set(0, 20, 0);
  targetObj.body.angularVelocity.set(5, 5, 0);
  currentDrawnBall = targetObj;
  resultText.innerText = targetObj.itemData.text;
  resultIcon.style.setProperty("--bg-color", targetObj.itemData.color);
  uiResult.classList.add("show");
}
function createPhysicsWalls(material) {
  const floorBody = new CANNON.Body({ mass: 0, material: material });
  floorBody.addShape(new CANNON.Plane());
  floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(floorBody);
  const wallDistance = 14;
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
function animate() {
  requestAnimationFrame(animate);
  if (
    !uiResult.classList.contains("show") &&
    !uiEditModal.classList.contains("show") &&
    !uiResetModal.classList.contains("show")
  ) {
    raycaster.setFromCamera(mouse, camera);
    const activeMeshes = balls.filter((b) => !b.isShrinking).map((b) => b.mesh);
    const intersects = raycaster.intersectObjects(activeMeshes);
    if (
      hoveredObject &&
      (!intersects.length || intersects[0].object !== hoveredObject.mesh)
    ) {
      hoveredObject.outline.material.color.setHex(styles.outlineColor);
      hoveredObject = null;
      document.body.classList.remove("hovering");
    }
    if (intersects.length > 0) {
      const obj = intersects[0].object.userData.parentObj;
      if (obj !== hoveredObject) {
        obj.outline.material.color.setHex(styles.hoverColor);
        hoveredObject = obj;
        document.body.classList.add("hovering");
      }
    }
  }
  for (let i = balls.length - 1; i >= 0; i--) {
    const obj = balls[i];
    if (obj.isShrinking) {
      const shrinkSpeed = 0.85;
      obj.mesh.scale.multiplyScalar(shrinkSpeed);
      obj.outline.scale.multiplyScalar(shrinkSpeed);
      obj.shadow.scale.multiplyScalar(shrinkSpeed);
      if (obj.mesh.scale.x < 0.05) {
        removeVisualsAndBody(obj);
        balls.splice(i, 1);
        checkEmptyState();
      }
      continue;
    }
    if (obj.body.velocity.lengthSquared() < 2.0) {
      obj.body.velocity.x += (Math.random() - 0.5) * 1.5;
      obj.body.velocity.y += Math.random() * 0.5;
      obj.body.velocity.z += (Math.random() - 0.5) * 1.5;
      obj.body.angularVelocity.x += (Math.random() - 0.5) * 1.0;
      obj.body.angularVelocity.z += (Math.random() - 0.5) * 1.0;
    }
    const SAFE_LIMIT = 15;
    if (Math.abs(obj.body.position.x) > SAFE_LIMIT) obj.body.velocity.x *= -1;
    if (Math.abs(obj.body.position.z) > SAFE_LIMIT) obj.body.velocity.z *= -1;
  }
  world.step(1 / 60);
  balls.forEach((obj) => {
    if (obj.isShrinking) {
      obj.mesh.position.copy(obj.body.position);
      obj.outline.position.copy(obj.body.position);
      obj.shadow.position.x = obj.body.position.x;
      obj.shadow.position.z = obj.body.position.z;
      return;
    }
    const { mesh, outline, shadow, body } = obj;
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    outline.position.copy(mesh.position);
    outline.quaternion.copy(mesh.quaternion);
    shadow.position.x = body.position.x;
    shadow.position.z = body.position.z;
    const height = Math.max(0, body.position.y - 2.2);
    const scale = Math.max(0.5, 1 - height * 0.04);
    const opacity = Math.max(0, 0.3 - height * 0.01);
    shadow.scale.setScalar(scale);
    shadow.material.opacity = opacity;
  });
  renderer.render(scene, camera);
}
function onWindowResize() {
  const aspect = window.innerWidth / window.innerHeight;
  const frustumSize = getFrustumSize(); // 重新取得動態大小

  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;

  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
