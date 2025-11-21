import * as THREE from 'three'

// --- 設定 ---
const REEL_COUNT = 3
const REEL_SEGMENTS = 12
const REEL_RADIUS = 16
const REEL_WIDTH = 10
const REEL_SPACING = 12

// 顏色設定
const COLORS = {
  background: '#F6F3EB',
  outline: '#725349',
  symbols: ['#4D9BEA', '#F2C94C', '#E05A47', '#5FB376', '#95A5A6', '#9B51E0', '#C0392B', '#2980B9'],
}

// 符號定義
const SYMBOL_DATA = [
  { id: 0, nameCN: '藍球', path: './assets/symbol_0.png' },
  { id: 1, nameCN: '鈴鐺', path: './assets/symbol_1.png' },
  { id: 2, nameCN: '櫻桃', path: './assets/symbol_2.png' },
  { id: 3, nameCN: '西瓜', path: './assets/symbol_3.png' },
  { id: 4, nameCN: '方塊', path: './assets/symbol_4.png' },
  { id: 5, nameCN: '星星', path: './assets/symbol_5.png' },
  { id: 6, nameCN: '紅七', path: './assets/symbol_6.png' },
  { id: 7, nameCN: '藍七', path: './assets/symbol_7.png' },
]

// 機率權重
const SYMBOL_WEIGHTS = [50, 35, 25, 15, 10, 5, 3, 1]

// 遊戲狀態
let spinsSinceLastWin = 0
let targetSpinsForWin = getRandomInt(2, 5)
let globalSpins = 0
let nextReelData = []

const ANGLE_PER_SEGMENT = (Math.PI * 2) / REEL_SEGMENTS

let scene, camera, renderer
let reels = []
let symbolTextures = []
let isSpinning = false

// UI
const statusText = document.getElementById('status-text')
const btnSpin = document.getElementById('btn-spin')
const stopBtns = [
  document.getElementById('btn-stop-0'),
  document.getElementById('btn-stop-1'),
  document.getElementById('btn-stop-2'),
]

init()
animate()

function init() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(COLORS.background)

  const aspect = window.innerWidth / window.innerHeight
  camera = new THREE.PerspectiveCamera(35, aspect, 1, 1000)
  camera.position.set(0, 0, 85)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  document.body.appendChild(renderer.domElement)

  btnSpin.disabled = true
  statusText.innerText = 'LOADING...'

  loadTexturesAndStart()

  window.addEventListener('resize', onWindowResize)
  setupUI()
}

function loadTexturesAndStart() {
  const manager = new THREE.LoadingManager()
  const loader = new THREE.TextureLoader(manager)
  symbolTextures = new Array(SYMBOL_DATA.length)

  SYMBOL_DATA.forEach((symbol) => {
    loader.load(symbol.path, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      symbolTextures[symbol.id] = texture
    })
  })

  manager.onLoad = () => {
    console.log('All textures loaded')
    statusText.innerText = 'READY'
    btnSpin.disabled = false
    createReels()
  }
}

function createReels() {
  const tileHeight = ((Math.PI * 2 * REEL_RADIUS) / REEL_SEGMENTS) * 1.06
  const tileGeometry = new THREE.PlaneGeometry(REEL_WIDTH, tileHeight)
  const ringGeo = new THREE.TorusGeometry(REEL_RADIUS, 0.3, 16, 100)
  const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.outline })
  const innerCylinderGeo = new THREE.CylinderGeometry(REEL_RADIUS - 0.1, REEL_RADIUS - 0.1, REEL_WIDTH + 1, 32)
  const innerCylinderMat = new THREE.MeshBasicMaterial({ color: COLORS.background })
  const bgGeometry = new THREE.PlaneGeometry(REEL_WIDTH * 0.98, tileHeight * 0.98)
  const bgMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })

  for (let i = 0; i < REEL_COUNT; i++) {
    const reelGroup = new THREE.Group()
    const tiles = []

    for (let j = 0; j < REEL_SEGMENTS; j++) {
      const randomSymbolId = Math.floor(Math.random() * SYMBOL_DATA.length)
      const material = new THREE.MeshBasicMaterial({
        map: symbolTextures[randomSymbolId],
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
      })

      const tile = new THREE.Mesh(tileGeometry, material)
      const bgTile = new THREE.Mesh(bgGeometry, bgMaterial)
      bgTile.position.z = -0.1

      const tileGroup = new THREE.Group()
      tileGroup.add(bgTile)
      tileGroup.add(tile)

      const angle = j * ANGLE_PER_SEGMENT
      const y = Math.cos(angle) * REEL_RADIUS
      const z = Math.sin(angle) * REEL_RADIUS

      tileGroup.position.set(0, y, z)
      tileGroup.rotation.x = angle - Math.PI / 2

      tile.userData = { symbolId: randomSymbolId }
      tiles.push(tile)
      reelGroup.add(tileGroup)
    }

    const leftRing = new THREE.Mesh(ringGeo, ringMat)
    leftRing.position.x = -REEL_WIDTH / 2
    leftRing.rotation.y = Math.PI / 2
    reelGroup.add(leftRing)

    const rightRing = new THREE.Mesh(ringGeo, ringMat)
    rightRing.position.x = REEL_WIDTH / 2
    rightRing.rotation.y = Math.PI / 2
    reelGroup.add(rightRing)

    const innerWall = new THREE.Mesh(innerCylinderGeo, innerCylinderMat)
    innerWall.rotation.z = Math.PI / 2
    reelGroup.add(innerWall)

    reelGroup.position.x = (i - 1) * REEL_SPACING
    scene.add(reelGroup)

    reels.push({
      group: reelGroup,
      tiles: tiles,
      speed: 0,
      isStopping: false,
      isStopped: true,
      targetAngle: 0,
      results: { top: 0, center: 0, bottom: 0 },
    })
  }
}

function getWeightedRandomSymbol() {
  const totalWeight = SYMBOL_WEIGHTS.reduce((a, b) => a + b, 0)
  let random = Math.random() * totalWeight
  for (let i = 0; i < SYMBOL_WEIGHTS.length; i++) {
    if (random < SYMBOL_WEIGHTS[i]) {
      return i
    }
    random -= SYMBOL_WEIGHTS[i]
  }
  return 0
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function prepareSpinResult() {
  spinsSinceLastWin++
  globalSpins++
  console.log(`Spin: ${globalSpins}, Next force win: ${targetSpinsForWin - spinsSinceLastWin}`)

  let isForceWin = false
  let forceSymbolId = -1

  if (globalSpins >= 30) {
    isForceWin = true
    forceSymbolId = Math.random() > 0.5 ? 6 : 7 // 紅7或藍7
    globalSpins = 0
    spinsSinceLastWin = 0
    targetSpinsForWin = getRandomInt(2, 5)
  } else if (spinsSinceLastWin >= targetSpinsForWin) {
    isForceWin = true
    forceSymbolId = -1
  }

  nextReelData = [
    { top: 0, center: 0, bottom: 0 },
    { top: 0, center: 0, bottom: 0 },
    { top: 0, center: 0, bottom: 0 },
  ]

  if (isForceWin) {
    const winningSymbolId = forceSymbolId !== -1 ? forceSymbolId : getWeightedRandomSymbol()
    // 0~7 代表 8 種連線 (橫3 + 垂3 + 斜2)
    const lineType = getRandomInt(0, 7)

    // 填雜訊
    for (let i = 0; i < 3; i++) {
      nextReelData[i].top = getRandomInt(0, 7)
      nextReelData[i].center = getRandomInt(0, 7)
      nextReelData[i].bottom = getRandomInt(0, 7)
    }

    // 填入必中路徑
    if (lineType === 0) {
      // 上橫
      nextReelData[0].top = winningSymbolId
      nextReelData[1].top = winningSymbolId
      nextReelData[2].top = winningSymbolId
    } else if (lineType === 1) {
      // 中橫
      nextReelData[0].center = winningSymbolId
      nextReelData[1].center = winningSymbolId
      nextReelData[2].center = winningSymbolId
    } else if (lineType === 2) {
      // 下橫
      nextReelData[0].bottom = winningSymbolId
      nextReelData[1].bottom = winningSymbolId
      nextReelData[2].bottom = winningSymbolId
    } else if (lineType === 3) {
      // 左上斜
      nextReelData[0].top = winningSymbolId
      nextReelData[1].center = winningSymbolId
      nextReelData[2].bottom = winningSymbolId
    } else if (lineType === 4) {
      // 左下斜
      nextReelData[0].bottom = winningSymbolId
      nextReelData[1].center = winningSymbolId
      nextReelData[2].top = winningSymbolId
    } else if (lineType === 5) {
      // 左垂直
      nextReelData[0].top = winningSymbolId
      nextReelData[0].center = winningSymbolId
      nextReelData[0].bottom = winningSymbolId
    } else if (lineType === 6) {
      // 中垂直
      nextReelData[1].top = winningSymbolId
      nextReelData[1].center = winningSymbolId
      nextReelData[1].bottom = winningSymbolId
    } else if (lineType === 7) {
      // 右垂直
      nextReelData[2].top = winningSymbolId
      nextReelData[2].center = winningSymbolId
      nextReelData[2].bottom = winningSymbolId
    }
  } else {
    for (let i = 0; i < 3; i++) {
      nextReelData[i].top = getWeightedRandomSymbol()
      nextReelData[i].center = getWeightedRandomSymbol()
      nextReelData[i].bottom = getWeightedRandomSymbol()
    }
  }
}

function startSpin() {
  if (isSpinning) return
  isSpinning = true
  statusText.innerText = '機器轉動中...'
  statusText.style.color = '#725349'
  btnSpin.disabled = true
  btnSpin.style.opacity = 0.5

  prepareSpinResult()

  reels.forEach((reel, i) => {
    reel.isStopped = false
    reel.isStopping = false
    reel.speed = 0.3 + Math.random() * 0.1
    // 開始轉動時，確保 STOP 按鈕是可用的
    stopBtns[i].disabled = false
  })
}

function setTileSymbol(tile, id) {
  tile.material.map = symbolTextures[id]
  tile.userData.symbolId = id
  tile.material.needsUpdate = true
}

function stopReel(index) {
  const reel = reels[index]
  if (reel.isStopping || reel.isStopped) return

  reel.isStopping = true
  stopBtns[index].disabled = true

  const data = nextReelData[index]
  reel.results = { top: data.top, center: data.center, bottom: data.bottom }

  const currentRotation = reel.group.rotation.x
  const stopDistance = Math.PI
  const targetRotationRaw = currentRotation + stopDistance
  const snapIndex = Math.ceil(targetRotationRaw / ANGLE_PER_SEGMENT)
  const finalTargetAngle = snapIndex * ANGLE_PER_SEGMENT

  reel.targetAngle = finalTargetAngle

  const angleDiff = Math.PI / 2 - finalTargetAngle
  let centerIndexRaw = Math.round(angleDiff / ANGLE_PER_SEGMENT)

  const centerTileIdx = ((centerIndexRaw % REEL_SEGMENTS) + REEL_SEGMENTS) % REEL_SEGMENTS
  const topTileIdx = (centerTileIdx - 1 + REEL_SEGMENTS) % REEL_SEGMENTS
  const bottomTileIdx = (centerTileIdx + 1) % REEL_SEGMENTS

  setTileSymbol(reel.tiles[centerTileIdx], data.center)
  setTileSymbol(reel.tiles[topTileIdx], data.top)
  setTileSymbol(reel.tiles[bottomTileIdx], data.bottom)
}

// --- 修正：加入垂直連線判斷 ---
function checkResult() {
  const board = reels.map((reel) => [reel.results.top, reel.results.center, reel.results.bottom])
  const lines = [
    {
      name: '中間線',
      path: [
        [0, 1],
        [1, 1],
        [2, 1],
      ],
    },
    {
      name: '上方線',
      path: [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    },
    {
      name: '下方線',
      path: [
        [0, 2],
        [1, 2],
        [2, 2],
      ],
    },
    {
      name: '左上斜線',
      path: [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    },
    {
      name: '左下斜線',
      path: [
        [0, 2],
        [1, 1],
        [2, 0],
      ],
    },
    // 新增垂直連線
    {
      name: '左垂直線',
      path: [
        [0, 0],
        [0, 1],
        [0, 2],
      ],
    },
    {
      name: '中垂直線',
      path: [
        [1, 0],
        [1, 1],
        [1, 2],
      ],
    },
    {
      name: '右垂直線',
      path: [
        [2, 0],
        [2, 1],
        [2, 2],
      ],
    },
  ]

  let winLines = []
  lines.forEach((line) => {
    const p = line.path
    const s1 = board[p[0][0]][p[0][1]]
    const s2 = board[p[1][0]][p[1][1]]
    const s3 = board[p[2][0]][p[2][1]]
    if (s1 === s2 && s2 === s3) {
      winLines.push({ name: line.name, symbolId: s1 })
    }
  })

  if (winLines.length > 0) {
    const firstWin = winLines[0]
    const symbolName = SYMBOL_DATA[firstWin.symbolId].nameCN
    statusText.style.color = '#E05A47'

    if (winLines.length > 1) {
      statusText.innerText = `連 ${winLines.length} 條線! （${symbolName}）`
    } else {
      statusText.innerText = `有連線！（${symbolName}）`
    }

    spinsSinceLastWin = 0
    targetSpinsForWin = getRandomInt(2, 5)
  } else {
    const noWinMessages = ['再接再厲', '可惜沒中喔', '下次一定中', '差一點點', '繼續加油']
    statusText.innerText = noWinMessages[Math.floor(Math.random() * noWinMessages.length)]

    statusText.style.color = '#725349'
  }

  isSpinning = false
  btnSpin.disabled = false
  btnSpin.style.opacity = 1

  // --- 修正：遊戲結束後，啟用所有 STOP 按鈕作為「重開」鍵 ---
  stopBtns.forEach((btn) => {
    btn.disabled = false
  })
}

function animate() {
  requestAnimationFrame(animate)
  let activeReels = 0
  reels.forEach((reel) => {
    if (!reel.isStopped) {
      reel.tiles.forEach((tile) => {
        const vector = new THREE.Vector3()
        tile.parent.getWorldPosition(vector)
        if (vector.z < -5 && !reel.isStopping) {
          const randId = getWeightedRandomSymbol()
          setTileSymbol(tile, randId)
        }
      })
    }
    if (reel.isStopped) return
    activeReels++

    if (reel.isStopping) {
      const delta = reel.targetAngle - reel.group.rotation.x
      if (delta < 0.005) {
        reel.group.rotation.x = reel.targetAngle
        reel.isStopped = true
        reel.speed = 0
      } else {
        const step = delta * 0.25
        reel.group.rotation.x += Math.max(step, 0.02)
      }
    } else {
      reel.group.rotation.x += reel.speed
    }
  })

  if (activeReels === 0 && isSpinning) {
    checkResult()
  }
  renderer.render(scene, camera)
}

// --- 修正：按鈕邏輯與鍵盤控制 ---
function setupUI() {
  // 1. SPIN 按鈕
  btnSpin.addEventListener('click', () => {
    if (!isSpinning) startSpin()
  })

  // 2. STOP 按鈕 (兼具開始與停止功能)
  stopBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      if (!isSpinning) {
        // 如果目前是閒置狀態，按任何按鈕都等於 SPIN
        startSpin()
      } else {
        // 如果正在轉動，則停止對應滾輪
        stopReel(index)
      }
    })
  })

  // 3. 鍵盤控制 (空白鍵 or Enter)
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      // 防止捲動頁面
      e.preventDefault()

      if (!isSpinning) {
        // 閒置時 -> 開始
        startSpin()
      } else {
        // 轉動時 -> 依序停止還沒停的滾輪
        // 順序：左 -> 中 -> 右
        if (!reels[0].isStopping && !reels[0].isStopped) {
          stopReel(0)
        } else if (!reels[1].isStopping && !reels[1].isStopped) {
          stopReel(1)
        } else if (!reels[2].isStopping && !reels[2].isStopped) {
          stopReel(2)
        }
      }
    }
  })
}

function onWindowResize() {
  const aspect = window.innerWidth / window.innerHeight
  camera.aspect = aspect
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}
