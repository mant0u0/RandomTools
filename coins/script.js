import * as THREE from "https://esm.sh/three";
import * as CANNON from "https://esm.sh/cannon-es";
let scene, camera, renderer, world;
let coinObjects = [];
let isHolding = false;
let needsResultCheck = false;
let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();
const FRUSTUM_SIZE = 20;
let dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -15);
const uiResult = document.getElementById("result-board");
const uiMain = document.getElementById("main-result");
const uiDetail = document.getElementById("detail-result");
const palette = [
    "#EAA14D", "#F2C94C", "#E05A47", "#4D9BEA", "#5FB376"
];
const commonColors = {
    text: "#FFFFFF",
    outline: "#725349",
    shadow: "#F3BD2E",
};
init();
animate();
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color("#F6F3EB");
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera((FRUSTUM_SIZE * aspect) / -2, (FRUSTUM_SIZE * aspect) / 2, FRUSTUM_SIZE / 2, FRUSTUM_SIZE / -2, 1, 1000);
    camera.position.set(40, 50, 40);
    camera.lookAt(0, 0, 0);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.userSelect = 'none';
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    world = new CANNON.World();
    world.gravity.set(0, -50, 0);
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 20;
    world.allowSleep = true;
    const wallMat = new CANNON.Material();
    const coinMat = new CANNON.Material();
    world.addContactMaterial(new CANNON.ContactMaterial(wallMat, coinMat, {
        friction: 0.4,
        restitution: 0.5,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3
    }));
    world.addContactMaterial(new CANNON.ContactMaterial(coinMat, coinMat, {
        friction: 0.4,
        restitution: 0.6
    }));
    createPhysicsWalls(wallMat);
    updateCoinCount(1);
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("mousedown", onInputStart);
    window.addEventListener("mousemove", onInputMove);
    window.addEventListener("mouseup", onInputEnd);
    document.body.addEventListener("mouseleave", onInputEnd);
    window.addEventListener("touchstart", onInputStart, { passive: false });
    window.addEventListener("touchmove", onInputMove, { passive: false });
    window.addEventListener("touchend", onInputEnd);
    document.getElementById("coinCount").addEventListener("change", (e) => {
        updateCoinCount(parseInt(e.target.value));
    });
}
function updateMousePosition(e) {
    let x, y;
    if (e.changedTouches) {
        x = e.changedTouches[0].clientX;
        y = e.changedTouches[0].clientY;
    }
    else {
        x = e.clientX;
        y = e.clientY;
    }
    mouse.x = (x / window.innerWidth) * 2 - 1;
    mouse.y = -(y / window.innerHeight) * 2 + 1;
}
function onInputStart(e) {
    if (e.target.tagName === "SELECT" ||
        e.target.tagName === "LABEL" ||
        e.target.closest(".top-bar"))
        return;
    if (e.preventDefault)
        e.preventDefault();
    isHolding = true;
    needsResultCheck = false;
    uiResult.classList.remove("show");
    updateMousePosition(e);
    coinObjects.forEach(obj => {
        obj.body.wakeUp();
        obj.spinOffset = Math.random() * 100;
        obj.isReturning = false;
    });
}
function onInputMove(e) {
    if (!isHolding)
        return;
    if (e.preventDefault)
        e.preventDefault();
    updateMousePosition(e);
}
function onInputEnd(e) {
    if (!isHolding)
        return;
    isHolding = false;
    releaseCoins();
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
function updateCoinCount(count) {
    coinObjects.forEach((obj) => {
        scene.remove(obj.mesh);
        scene.remove(obj.outline);
        scene.remove(obj.shadow);
        world.removeBody(obj.body);
        if (obj.mesh.material) {
            obj.mesh.material.forEach(m => {
                if (m.map)
                    m.map.dispose();
                m.dispose();
            });
        }
    });
    coinObjects = [];
    uiResult.classList.remove("show");
    const radius = 2.2;
    const thickness = 0.5;
    const segments = 32;
    const geometry = new THREE.CylinderGeometry(radius, radius, thickness, segments);
    const outlineGeo = new THREE.CylinderGeometry(radius * 1.05, radius * 1.05, thickness * 1.05, segments);
    const shadowGeo = new THREE.CircleGeometry(radius, 32);
    const shape = new CANNON.Cylinder(radius, radius, thickness, segments);
    const shapeQ = new CANNON.Quaternion();
    shapeQ.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
    const outlineMat = new THREE.MeshBasicMaterial({ color: commonColors.outline, side: THREE.BackSide });
    const shadowMat = new THREE.MeshBasicMaterial({ color: commonColors.shadow, transparent: true, opacity: 0.2 });
    for (let i = 0; i < count; i++) {
        const randomColor = palette[Math.floor(Math.random() * palette.length)];
        // --- 修改 1: 兩面顏色相同 ---
        const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(randomColor).multiplyScalar(0.8) });
        // YES 面 (傳入 randomColor)
        const topMat = new THREE.MeshBasicMaterial({ map: createCoinTexture("YES", randomColor) });
        // NO 面 (也傳入 randomColor，原本是紅色)
        const bottomMat = new THREE.MeshBasicMaterial({ map: createCoinTexture("NO", randomColor) });
        const mesh = new THREE.Mesh(geometry, [sideMat, topMat, bottomMat]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        const outline = new THREE.Mesh(outlineGeo, outlineMat);
        scene.add(outline);
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.01;
        scene.add(shadow);
        const startX = (i - (count - 1) / 2) * 3.0;
        const body = new CANNON.Body({
            mass: 5,
            material: world.contactmaterials[1].materials[1],
            position: new CANNON.Vec3(startX, 2 + Math.random(), 0),
            sleepSpeedLimit: 0.5,
            sleepTimeLimit: 0.5
        });
        body.addShape(shape, new CANNON.Vec3(0, 0, 0), shapeQ);
        body.quaternion.setFromEuler(Math.PI / 2, 0, 0);
        world.addBody(body);
        coinObjects.push({ mesh, outline, shadow, body, spinOffset: 0, isReturning: false });
    }
}
function releaseCoins() {
    const SAFE_LIMIT = 9;
    coinObjects.forEach((obj) => {
        const { body } = obj;
        const isOutside = Math.abs(body.position.x) > SAFE_LIMIT ||
            Math.abs(body.position.z) > SAFE_LIMIT;
        if (isOutside) {
            obj.isReturning = true;
        }
        else {
            body.wakeUp();
            applyTossForce(body);
        }
    });
    setTimeout(() => {
        needsResultCheck = true;
    }, 500);
}
function applyTossForce(body) {
    const xDist = -body.position.x;
    const zDist = -body.position.z;
    body.velocity.set(xDist * 1.5 + (Math.random() - 0.5) * 5, 10 + Math.random() * 10, zDist * 1.5 + (Math.random() - 0.5) * 5);
    body.angularVelocity.set((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 50);
}
function calculateResult() {
    let yesCount = 0;
    let noCount = 0;
    let standingCount = 0;
    let details = [];
    coinObjects.forEach(({ mesh }) => {
        // 取得硬幣「視覺上」的 Y 軸（垂直於圓面的軸）在世界座標中的方向
        const localUp = new THREE.Vector3(0, 1, 0);
        localUp.applyQuaternion(mesh.quaternion);
        // --- 修改 2: 判定是否立起來 ---
        // 如果 Y 軸的垂直分量大於 0.5，表示 YES 朝上 (很接近平躺)
        // 如果 Y 軸的垂直分量小於 -0.5，表示 NO 朝上 (很接近平躺)
        // 如果介於中間，表示它是立著的（或斜靠著）
        if (localUp.y > 0.5) {
            yesCount++;
            details.push("YES");
        }
        else if (localUp.y < -0.5) {
            noCount++;
            details.push("NO");
        }
        else {
            // 立起來的情況
            standingCount++;
            details.push("?");
        }
    });
    // UI 顯示邏輯
    if (coinObjects.length === 1) {
        // 單顆模式
        uiMain.innerText = details[0];
        uiDetail.innerText = "";
    }
    else {
        // 多顆模式：顯示統計
        let text = [];
        if (yesCount > 0)
            text.push(`${yesCount} YES`);
        if (noCount > 0)
            text.push(`${noCount} NO`);
        if (standingCount > 0)
            text.push(`${standingCount} ?`);
        uiMain.innerText = text.join(" / ");
        uiDetail.innerText = `(${details.join(", ")})`;
    }
    uiResult.classList.add("show");
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
            coinObjects.forEach((obj, i) => {
                const offsetX = Math.sin(time + i) * 1.0;
                const offsetZ = Math.cos(time + i * 2) * 1.0;
                obj.body.position.x += (targetPoint.x + offsetX - obj.body.position.x) * 0.25;
                obj.body.position.y += (15 - obj.body.position.y) * 0.25;
                obj.body.position.z += (targetPoint.z + offsetZ - obj.body.position.z) * 0.25;
                obj.body.quaternion.setFromEuler(Math.PI / 2, time * 5 + obj.spinOffset, 0);
                obj.body.velocity.set(0, 0, 0);
                obj.body.angularVelocity.set(0, 0, 0);
                obj.isReturning = false;
            });
        }
    }
    else {
        const time = performance.now() * 0.01;
        coinObjects.forEach((obj) => {
            if (obj.isReturning) {
                obj.body.position.x += (0 - obj.body.position.x) * 0.15;
                obj.body.position.z += (0 - obj.body.position.z) * 0.15;
                obj.body.position.y += (12 - obj.body.position.y) * 0.1;
                obj.body.quaternion.setFromEuler(0, time * 10, 0);
                obj.body.velocity.set(0, 0, 0);
                obj.body.angularVelocity.set(0, 0, 0);
                if (Math.abs(obj.body.position.x) < 8 && Math.abs(obj.body.position.z) < 8) {
                    obj.isReturning = false;
                    obj.body.wakeUp();
                    applyTossForce(obj.body);
                }
            }
        });
        world.step(1 / 60);
    }
    for (let i = 0; i < coinObjects.length; i++) {
        const { mesh, outline, shadow, body } = coinObjects[i];
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
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
    }
    if (needsResultCheck) {
        let allStopped = true;
        for (let o of coinObjects) {
            if (o.isReturning) {
                allStopped = false;
                break;
            }
            if (o.body.velocity.lengthSquared() > 0.05 || o.body.angularVelocity.lengthSquared() > 0.05) {
                allStopped = false;
                break;
            }
        }
        if (allStopped)
            calculateResult();
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