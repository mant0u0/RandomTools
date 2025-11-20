import * as THREE from "https://esm.sh/three";
import { RoundedBoxGeometry } from "https://esm.sh/three/addons/geometries/RoundedBoxGeometry.js";
import * as CANNON from "https://esm.sh/cannon-es";

let scene, camera, renderer, world;
let diceObjects = [];
let isHolding = false;
let needsResultCheck = false;
let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();
const FRUSTUM_SIZE = 23;
let currentDiceCount = 3;
let dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -15);

// UI
const uiResult = document.getElementById("result-board");
const uiTotal = document.getElementById("total-score");
const uiDetail = document.getElementById("detail-score");
const uiCountDisplay = document.getElementById("count-display");
const btnPlus = document.getElementById("btn-plus");
const btnMinus = document.getElementById("btn-minus");
const btnThrow = document.getElementById("btn-throw");

const palette = [
  "#EAA14D",
  "#E05A47",
  "#4D9BEA",
  "#5FB376",
  "#D869A8",
  "#F2C94C",
  "#9B51E0",
  "#FFFFFF",
];
const commonColors = {
  dots: "#FFFFFF",
  outline: "#725349",
  shadow: "#F3BD2E",
};

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#F6F3EB");
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.OrthographicCamera(
    (FRUSTUM_SIZE * aspect) / -2,
    (FRUSTUM_SIZE * aspect) / 2,
    FRUSTUM_SIZE / 2,
    FRUSTUM_SIZE / -2,
    1,
    1000
  );
  camera.position.set(50, 50, 50);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.userSelect = "none";
  document.body.appendChild(renderer.domElement);

  world = new CANNON.World();
  world.gravity.set(0, -40, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 20;
  world.allowSleep = true;

  const wallMat = new CANNON.Material();
  const diceMat = new CANNON.Material();
  world.addContactMaterial(
    new CANNON.ContactMaterial(wallMat, diceMat, {
      friction: 0.3,
      restitution: 0.6,
    })
  );

  createPhysicsWalls(wallMat);
  updateDiceCount(currentDiceCount);

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

function setupUIEvents() {
  btnPlus.addEventListener("click", () => {
    if (currentDiceCount < 20) {
      currentDiceCount++;
      uiCountDisplay.innerText = currentDiceCount;
      updateDiceCount(currentDiceCount);
    }
  });

  btnMinus.addEventListener("click", () => {
    if (currentDiceCount > 1) {
      currentDiceCount--;
      uiCountDisplay.innerText = currentDiceCount;
      updateDiceCount(currentDiceCount);
    }
  });

  btnThrow.addEventListener("click", () => {
    manualThrow();
  });
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

function onInputStart(e) {
  // 排除 左下角與右下角 UI 點擊
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
  if (uiResult) uiResult.classList.remove("show");
  updateMousePosition(e);

  diceObjects.forEach((obj) => {
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
  releaseDice();
}

function manualThrow() {
  isHolding = false;
  if (uiResult) uiResult.classList.remove("show");
  needsResultCheck = false;

  diceObjects.forEach((obj) => {
    obj.body.wakeUp();
    obj.body.position.set(
      (Math.random() - 0.5) * 5,
      15 + Math.random() * 5,
      (Math.random() - 0.5) * 5
    );
    obj.body.quaternion.setFromEuler(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    obj.body.velocity.set(0, 0, 0);
    obj.body.angularVelocity.set(0, 0, 0);
    obj.isReturning = false;
    applyThrowForce(obj.body);
  });

  setTimeout(() => {
    needsResultCheck = true;
  }, 500);
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

function createVectorDiceTexture(number, colorHex) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, size, size);

  const isTraditional = colorHex === "#FFFFFF";
  let dotColor = commonColors.dots;
  if (isTraditional) {
    if (number === 1) dotColor = "#E03E3E";
    else if (number === 4) dotColor = "#E03E3E";
    else dotColor = "#331e18";
  }
  ctx.fillStyle = dotColor;

  const dotSize = size / 5;
  const currentDotSize =
    isTraditional && number === 1 ? dotSize * 1.5 : dotSize;
  const center = size / 2;
  const q1 = size / 4;
  const q3 = (size * 3) / 4;

  function drawDot(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, currentDotSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (number === 1) drawDot(center, center);
  else if (number === 2) {
    drawDot(q1, q1);
    drawDot(q3, q3);
  } else if (number === 3) {
    drawDot(q1, q1);
    drawDot(center, center);
    drawDot(q3, q3);
  } else if (number === 4) {
    drawDot(q1, q1);
    drawDot(q3, q1);
    drawDot(q1, q3);
    drawDot(q3, q3);
  } else if (number === 5) {
    drawDot(q1, q1);
    drawDot(center, center);
    drawDot(q1, q3);
    drawDot(q3, q3);
    drawDot(q3, q1);
  } else if (number === 6) {
    drawDot(q1, q1);
    drawDot(q3, q1);
    drawDot(q1, center);
    drawDot(q3, center);
    drawDot(q1, q3);
    drawDot(q3, q3);
  }
  return new THREE.CanvasTexture(canvas);
}

function updateDiceCount(count) {
  diceObjects.forEach((obj) => {
    scene.remove(obj.mesh);
    scene.remove(obj.outline);
    scene.remove(obj.shadow);
    world.removeBody(obj.body);
    if (obj.mesh.material) {
      obj.mesh.material.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
  diceObjects = [];
  if (uiResult) uiResult.classList.remove("show");

  const boxSize = 2.5;
  // 實體圓角半徑
  const radius = 0.4;
  const geometry = new RoundedBoxGeometry(boxSize, boxSize, boxSize, 4, radius);

  // 1. 尺寸放大 1.11 倍
  // 2. 圓角半徑改為 0.55 (比 0.4 大，讓轉角看起來更舒適)
  const outlineSize = boxSize * 1.11;
  const outlineRadius = 0.55;
  const outlineGeo = new RoundedBoxGeometry(
    outlineSize,
    outlineSize,
    outlineSize,
    4,
    outlineRadius
  );

  const shadowGeo = new THREE.CircleGeometry(boxSize * 0.6, 32);
  const shape = new CANNON.Box(
    new CANNON.Vec3(boxSize / 2, boxSize / 2, boxSize / 2)
  );

  const outlineMat = new THREE.MeshBasicMaterial({
    color: commonColors.outline,
    side: THREE.BackSide,
  });
  const shadowMat = new THREE.MeshBasicMaterial({
    color: commonColors.shadow,
    transparent: true,
    opacity: 0.2,
  });

  for (let i = 0; i < count; i++) {
    const randomColor = palette[Math.floor(Math.random() * palette.length)];
    const diceMaterials = [];
    for (let j = 1; j <= 6; j++) {
      diceMaterials.push(
        new THREE.MeshBasicMaterial({
          map: createVectorDiceTexture(j, randomColor),
        })
      );
    }

    const matArray = [
      diceMaterials[0],
      diceMaterials[5],
      diceMaterials[1],
      diceMaterials[4],
      diceMaterials[2],
      diceMaterials[3],
    ];

    const mesh = new THREE.Mesh(geometry, matArray);
    scene.add(mesh);

    const outline = new THREE.Mesh(outlineGeo, outlineMat);
    outline.position.copy(mesh.position);
    // 這裡不需要再 setScalar 了，因為幾何體已經做大了
    scene.add(outline);

    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    scene.add(shadow);

    const startX = (i - (count - 1) / 2) * 2.5;
    const body = new CANNON.Body({
      mass: 5,
      shape: shape,
      position: new CANNON.Vec3(startX, boxSize, 0),
      sleepSpeedLimit: 0.5,
    });
    body.quaternion.setFromEuler(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    world.addBody(body);

    diceObjects.push({
      mesh,
      outline,
      shadow,
      body,
      spinOffset: 0,
      isReturning: false,
    });
  }
}

function releaseDice() {
  const SAFE_LIMIT = 9;
  diceObjects.forEach((obj) => {
    const { body } = obj;
    const isOutside =
      Math.abs(body.position.x) > SAFE_LIMIT ||
      Math.abs(body.position.z) > SAFE_LIMIT;
    if (isOutside) {
      obj.isReturning = true;
    } else {
      body.wakeUp();
      applyThrowForce(body);
    }
  });
  setTimeout(() => {
    needsResultCheck = true;
  }, 500);
}

function applyThrowForce(body) {
  const xDist = -body.position.x;
  const zDist = -body.position.z;
  body.velocity.set(
    xDist * 1.5 + (Math.random() - 0.5) * 15,
    -15 - Math.random() * 10,
    zDist * 1.5 + (Math.random() - 0.5) * 15
  );
  body.angularVelocity.set(
    (Math.random() - 0.5) * 35,
    (Math.random() - 0.5) * 35,
    (Math.random() - 0.5) * 35
  );
}

function calculateResult() {
  let total = 0;
  let details = [];
  const faceNormals = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];
  const faceValues = [1, 6, 2, 5, 3, 4];

  diceObjects.forEach(({ mesh }) => {
    let maxDot = -Infinity;
    let resultValue = 1;
    faceNormals.forEach((normal, index) => {
      const worldNormal = normal.clone().applyQuaternion(mesh.quaternion);
      if (worldNormal.y > maxDot) {
        maxDot = worldNormal.y;
        resultValue = faceValues[index];
      }
    });
    total += resultValue;
    details.push(resultValue);
  });

  if (uiTotal) uiTotal.innerText = total;
  if (uiDetail)
    uiDetail.innerText = details.length > 1 ? `(${details.join(" + ")})` : "";
  if (uiResult) uiResult.classList.add("show");
  needsResultCheck = false;
}

function animate() {
  requestAnimationFrame(animate);

  if (isHolding) {
    raycaster.setFromCamera(mouse, camera);
    const targetPoint = new THREE.Vector3();
    const intersect = raycaster.ray.intersectPlane(dragPlane, targetPoint);
    if (intersect) {
      const time = performance.now() * 0.01;
      diceObjects.forEach((obj, i) => {
        const offsetX = Math.sin(time + i) * 1.0;
        const offsetZ = Math.cos(time + i * 2) * 1.0;
        obj.body.position.x +=
          (targetPoint.x + offsetX - obj.body.position.x) * 0.25;
        obj.body.position.y += (15 - obj.body.position.y) * 0.25;
        obj.body.position.z +=
          (targetPoint.z + offsetZ - obj.body.position.z) * 0.25;
        obj.body.quaternion.setFromEuler(
          time * 2 + obj.spinOffset,
          time * 3 + obj.spinOffset,
          time * 1.5
        );
        obj.body.velocity.set(0, 0, 0);
        obj.body.angularVelocity.set(0, 0, 0);
        obj.isReturning = false;
      });
    }
  } else {
    const time = performance.now() * 0.01;
    diceObjects.forEach((obj) => {
      if (obj.isReturning) {
        obj.body.position.x += (0 - obj.body.position.x) * 0.15;
        obj.body.position.z += (0 - obj.body.position.z) * 0.15;
        obj.body.position.y += (12 - obj.body.position.y) * 0.1;
        obj.body.quaternion.setFromEuler(time * 5, time * 5, 0);
        obj.body.velocity.set(0, 0, 0);
        obj.body.angularVelocity.set(0, 0, 0);
        if (
          Math.abs(obj.body.position.x) < 9 &&
          Math.abs(obj.body.position.z) < 9
        ) {
          obj.isReturning = false;
          obj.body.wakeUp();
          applyThrowForce(obj.body);
        }
      }
    });
    world.step(1 / 60);
  }

  for (let i = 0; i < diceObjects.length; i++) {
    const { mesh, outline, shadow, body } = diceObjects[i];
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    outline.position.copy(mesh.position);
    outline.quaternion.copy(mesh.quaternion);
    shadow.position.x = body.position.x;
    shadow.position.z = body.position.z;
    const height = Math.max(0, body.position.y - 1);
    const scale = Math.max(0.5, 1 - height * 0.04);
    const opacity = Math.max(0, 0.2 - height * 0.01);
    shadow.scale.setScalar(scale);
    shadow.material.opacity = opacity;
  }

  if (needsResultCheck) {
    let allStopped = true;
    for (let o of diceObjects) {
      if (o.isReturning) {
        allStopped = false;
        break;
      }
      if (
        o.body.velocity.lengthSquared() > 0.1 ||
        o.body.angularVelocity.lengthSquared() > 0.1
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
  camera.left = (-FRUSTUM_SIZE * aspect) / 2;
  camera.right = (FRUSTUM_SIZE * aspect) / 2;
  camera.top = FRUSTUM_SIZE / 2;
  camera.bottom = -FRUSTUM_SIZE / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
