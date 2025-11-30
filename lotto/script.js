import * as THREE from "https://esm.sh/three";
import * as CANNON from "https://esm.sh/cannon-es";

// --- Global Variables ---
let scene, camera, renderer, world;
let balls = [];
let gameItems = []; // Array of { id, text, color, drawn }
let isMixing = false; // New state for mixing

// Settings
let settingMinVal = 1;
let settingMaxVal = 49;
let settingDrawCount = 6;
let settingIsReplace = false;

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
  shadowColor: 0xf3bd2e,
};

// --- DOM Elements ---
const uiSettingsModal = document.getElementById("settings-modal");
const btnOpenSettings = document.getElementById("btn-open-settings");
const btnShuffle = document.getElementById("btn-shuffle");
const btnRandomPick = document.getElementById("btn-random-pick");
const btnMainRestart = document.getElementById("btn-main-restart");

const uiResetModal = document.getElementById("reset-modal");
const btnResetConfirm = document.getElementById("btn-reset-confirm");
const btnResetCancel = document.getElementById("btn-reset-cancel");

const btnModalClose = document.getElementById("btn-modal-close");
const btnModalUpdate = document.getElementById("btn-modal-update");

const inputMin = document.getElementById("setting-min");
const inputMax = document.getElementById("setting-max");
const inputCount = document.getElementById("setting-count");
const inputReplace = document.getElementById("setting-replace");

const uiResult = document.getElementById("result-overlay");
const resultContainer = document.getElementById("result-container");
const btnCloseResult = document.getElementById("btn-close-result");
const emptyMessage = document.getElementById("empty-message");

// --- Initialization ---
init();
animate();

function init() {
  // Three.js Setup
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

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.touchAction = "none";
  document.body.appendChild(renderer.domElement);

  // Cannon.js Setup
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

  // Load Font & Start Game
  document.fonts.ready.then(() => {
    parseAndReloadGame(defaultMat);
  });

  // Events
  window.addEventListener("resize", onWindowResize);
  setupUIEvents(defaultMat);
}

function getFrustumSize() {
  const aspect = window.innerWidth / window.innerHeight;
  return aspect < 1.0 ? 35 : 22;
}

// --- Game Logic ---

function parseAndReloadGame(material) {
  // Read settings
  settingMinVal = parseInt(inputMin.value) || 1;
  settingMaxVal = parseInt(inputMax.value) || 49;
  settingDrawCount = parseInt(inputCount.value) || 6;
  settingIsReplace = inputReplace.checked;

  // Validate
  if (settingMinVal > settingMaxVal) {
    [settingMinVal, settingMaxVal] = [settingMaxVal, settingMinVal];
    inputMin.value = settingMinVal;
    inputMax.value = settingMaxVal;
  }

  // Generate Items
  gameItems = [];
  let idCounter = 0;
  for (let i = settingMinVal; i <= settingMaxVal; i++) {
    gameItems.push({
      id: idCounter++,
      text: i.toString(),
      drawn: false,
      color: palette[(i - settingMinVal) % palette.length],
    });
  }

  // Shuffle for initial position randomness
  shuffleArray(gameItems);

  spawnBalls(material);
  checkEmptyState();

  // Reset mixing state
  isMixing = false;
  btnShuffle.innerText = "啟動";
  btnShuffle.classList.remove("active");
}

function spawnBalls(material) {
  // Clear existing
  balls.forEach((obj) => removeVisualsAndBody(obj));
  balls = [];

  // Dynamic radius based on count to prevent overcrowding
  // Base radius 2.2, min radius 1.5
  const count = gameItems.filter((i) => !i.drawn).length;
  let radius = 2.2;
  if (count > 30) radius = 1.8;
  if (count > 50) radius = 1.5;

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

  gameItems.forEach((item, i) => {
    if (item.drawn) return;

    const map = createLottoTexture(item.color, item.text);
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
        5 + i * 2, // Stack them up
        (Math.random() - 0.5) * 10
      ),
      angularDamping: 0.1,
      linearDamping: 0.1,
    });
    body.addShape(shape);

    // Initial random velocity/rotation
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

function createLottoTexture(color, text) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  // Text Setup
  ctx.fillStyle = "#725349";
  // Use a large font size. Since we scale X by 0.5, the text will become thinner.
  // Bungee is naturally wide, so 0.5 scale makes it look like a normal condensed font.
  ctx.font = "bold 150px Bungee";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Save context to restore after scaling
  ctx.save();

  // Scale X by 0.5 to counteract the 2:1 stretching of the sphere's UV mapping at the equator
  ctx.scale(0.5, 1);

  // Draw text at the center of the texture (which is 256px).
  // In scaled coordinates: 256 / 0.5 = 512.
  // We draw it at the "front" (center of texture).
  const centerX = size / 0.5 / 2; // 512
  const centerY = size / 2; // 256

  ctx.fillText(text, centerX, centerY);

  // Underline for 6 and 9
  if (text === "6" || text === "9") {
    // Draw underline below text
    // Adjust coordinates for scale
    ctx.fillRect(centerX - 50, centerY + 60, 100, 30);
  }

  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function checkEmptyState() {
  if (balls.length === 0) {
    emptyMessage.classList.add("show");
  } else {
    emptyMessage.classList.remove("show");
  }
}

function removeVisualsAndBody(obj) {
  scene.remove(obj.mesh);
  scene.remove(obj.outline);
  scene.remove(obj.shadow);
  world.removeBody(obj.body);
  if (obj.mesh.material) {
    if (obj.mesh.material.map) obj.mesh.material.map.dispose();
    obj.mesh.material.dispose();
  }
}

// --- UI Events ---

function setupUIEvents(material) {
  // Settings Modal
  btnOpenSettings.addEventListener("click", () => {
    uiSettingsModal.classList.add("show");
  });
  btnModalClose.addEventListener("click", () =>
    uiSettingsModal.classList.remove("show")
  );
  btnModalUpdate.addEventListener("click", () => {
    parseAndReloadGame(material);
    uiSettingsModal.classList.remove("show");
  });

  // Restart / Reset
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

  // Shuffle / Start Mixing
  btnShuffle.innerText = "啟動"; // Default text
  btnShuffle.addEventListener("click", () => {
    isMixing = !isMixing;
    if (isMixing) {
      btnShuffle.innerText = "停止";
      btnShuffle.classList.add("active");
      // Wake up all balls
      balls.forEach((b) => b.body.wakeUp());
    } else {
      btnShuffle.innerText = "啟動";
      btnShuffle.classList.remove("active");
    }
  });

  // Pick / Draw
  btnRandomPick.addEventListener("click", () => {
    // Stop mixing if active
    if (isMixing) {
      isMixing = false;
      btnShuffle.innerText = "啟動";
      btnShuffle.classList.remove("active");
    }

    const activeBalls = balls.filter((b) => !b.isShrinking);
    if (activeBalls.length === 0) return;

    // Determine how many to pick
    const countToPick = Math.min(settingDrawCount, activeBalls.length);

    // Shuffle active balls to pick random ones
    shuffleArray(activeBalls);
    const pickedBalls = activeBalls.slice(0, countToPick);

    // Wake up all balls for effect
    balls.forEach((b) => b.body.wakeUp());

    // Show result
    openResult(pickedBalls);
  });

  // Close Result
  btnCloseResult.addEventListener("click", () => {
    uiResult.classList.remove("show");

    // Handle post-draw logic (replacement)
    setTimeout(() => {
      const drawnBalls = balls.filter((b) => b.itemData.drawnInCurrentRound);

      drawnBalls.forEach((ballObj) => {
        ballObj.itemData.drawnInCurrentRound = false; // Reset flag

        if (!settingIsReplace) {
          // Remove from game
          ballObj.itemData.drawn = true;
          ballObj.isShrinking = true;
          ballObj.body.collisionFilterGroup = 0;
          ballObj.body.collisionFilterMask = 0;
        } else {
          // Keep in game, maybe toss them a bit
          ballObj.body.velocity.set(
            (Math.random() - 0.5) * 20,
            10,
            (Math.random() - 0.5) * 20
          );
        }
      });
    }, 200);
  });
}

function openResult(pickedBalls) {
  // Clear previous result
  resultContainer.innerHTML = "";

  pickedBalls.forEach((ballObj, index) => {
    // Mark as drawn in this round
    ballObj.itemData.drawnInCurrentRound = true;

    // Physics effect: pop up
    ballObj.body.velocity.set(0, 20 + Math.random() * 5, 0);
    ballObj.body.angularVelocity.set(5, 5, 0);

    // Create UI element
    const ballEl = document.createElement("div");
    ballEl.className = "result-ball";
    ballEl.innerText = ballObj.itemData.text;
    ballEl.style.setProperty("--bg-color", ballObj.itemData.color);

    if (ballObj.itemData.text === "6" || ballObj.itemData.text === "9") {
      ballEl.classList.add("underline");
    }

    // Stagger animation
    ballEl.style.animationDelay = `${index * 0.1}s`;

    resultContainer.appendChild(ballEl);
  });

  uiResult.classList.add("show");
}

// --- Utils ---

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function onWindowResize() {
  const aspect = window.innerWidth / window.innerHeight;
  const frustumSize = getFrustumSize();

  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;

  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function createPhysicsWalls(material) {
  const floorBody = new CANNON.Body({ mass: 0, material: material });
  floorBody.addShape(new CANNON.Plane());
  floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(floorBody);

  // Ceiling (to keep balls in during mixing)
  const ceilingBody = new CANNON.Body({ mass: 0, material: material });
  ceilingBody.addShape(new CANNON.Plane());
  ceilingBody.position.set(0, 40, 0); // Height 40
  ceilingBody.quaternion.setFromAxisAngle(
    new CANNON.Vec3(1, 0, 0),
    Math.PI / 2
  );
  world.addBody(ceilingBody);

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

function mixBalls() {
  if (!isMixing) return;

  balls.forEach((obj) => {
    if (obj.isShrinking) return;

    // Apply random force
    // Upward bias to keep them flying
    const force = new CANNON.Vec3(
      (Math.random() - 0.5) * 3000,
      Math.random() * 300,
      (Math.random() - 0.5) * 200
    );
    obj.body.applyForce(force, obj.body.position);
  });
}

function animate() {
  requestAnimationFrame(animate);

  // Apply mixing forces
  mixBalls();

  // Physics Step
  world.step(1 / 60);

  // Update Visuals
  for (let i = balls.length - 1; i >= 0; i--) {
    const obj = balls[i];

    // Shrinking effect (removal)
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

    // Keep balls moving a bit if they stop (only if not mixing)
    if (!isMixing && obj.body.velocity.lengthSquared() < 2.0) {
      obj.body.velocity.x += (Math.random() - 0.5) * 1.5;
      obj.body.velocity.y += Math.random() * 0.5;
      obj.body.velocity.z += (Math.random() - 0.5) * 1.5;
      obj.body.angularVelocity.x += (Math.random() - 0.5) * 1.0;
      obj.body.angularVelocity.z += (Math.random() - 0.5) * 1.0;
    }

    // Safety bounds
    const SAFE_LIMIT = 15;
    if (Math.abs(obj.body.position.x) > SAFE_LIMIT) obj.body.velocity.x *= -1;
    if (Math.abs(obj.body.position.z) > SAFE_LIMIT) obj.body.velocity.z *= -1;

    // Sync Mesh with Body
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
  }

  renderer.render(scene, camera);
}
