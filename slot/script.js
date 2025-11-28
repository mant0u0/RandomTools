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
  outline: '#a78276',
  symbols: ['#4D9BEA', '#F2C94C', '#E05A47', '#5FB376', '#95A5A6', '#9B51E0', '#C0392B', '#2980B9'],
}

// 符號定義
const SYMBOL_DATA = [
  { id: 0, nameCN: '藍球', nameEN: 'Blue Ball', value: 3, path: './assets/symbol_0.png' },
  { id: 1, nameCN: '鈴鐺', nameEN: 'Bell', value: 6, path: './assets/symbol_1.png' },
  { id: 2, nameCN: '櫻桃', nameEN: 'Cherry', value: 12, path: './assets/symbol_2.png' },
  { id: 3, nameCN: '西瓜', nameEN: 'Watermelon', value: 9, path: './assets/symbol_3.png' },
  { id: 4, nameCN: '方塊', nameEN: 'Square', value: 15, path: './assets/symbol_4.png' },
  { id: 5, nameCN: '紅七', nameEN: 'Red 7', value: 30, path: './assets/symbol_6.png' },
  { id: 6, nameCN: '藍七', nameEN: 'Blue 7', value: 60, path: './assets/symbol_7.png' },
]

// 機率權重 (一般模式) - 調整權重
const SYMBOL_WEIGHTS = [50, 35, 25, 15, 10, 3, 1]
// 機率權重 (Bonus模式) - 提高高分符號機率
const BONUS_WEIGHTS = [10, 30, 30, 30, 30, 15, 10]

// 遊戲狀態
let score = 50
let spinCount = 0
let spinsSinceLastBonusCheck = 0
let nextBonusCheck = getRandomInt(15, 30)
let bonusModeActive = false
let bonusSpinsLeft = 0
let bonusPending = false // 標記是否即將進入 Bonus (等待提示連線結束)

// 小獎保底機制
let spinsSinceLastSmallWin = 0
let targetSpinsForSmallWin = getRandomInt(2, 5)

let nextReelData = []

const ANGLE_PER_SEGMENT = (Math.PI * 2) / REEL_SEGMENTS

let scene, camera, renderer
let reels = []
let symbolTextures = []
let isSpinning = false

// UI
const statusText = document.getElementById('status-text')
const awardsText = document.getElementById('awards-text')
const btnSpin = document.getElementById('btn-spin')
const scoreValue = document.getElementById('score-value')
const spinCountValue = document.getElementById('spin-count-value')
const btnReset = document.getElementById('btn-reset')

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

  // 根據螢幕比例調整相機距離 (手機直向時拉遠)
  const zPos = aspect < 1 ? 130 : 85
  camera.position.set(0, 0, zPos)

  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  document.body.appendChild(renderer.domElement)

  btnSpin.disabled = true
  awardsText.innerText = 'READY'
  statusText.innerText = '準備'
  updateScoreUI()

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
    statusText.innerText = '準備'
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
  const weights = bonusModeActive ? BONUS_WEIGHTS : SYMBOL_WEIGHTS
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let random = Math.random() * totalWeight
  for (let i = 0; i < weights.length; i++) {
    if (random < weights[i]) {
      return i
    }
    random -= weights[i]
  }
  return 0
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function prepareSpinResult() {
  let isForceWin = false
  let forceSymbolId = -1

  // Bonus 模式邏輯
  if (bonusModeActive) {
    bonusSpinsLeft--
    console.log(`Bonus Mode Active! Spins left: ${bonusSpinsLeft}`)

    // Bonus 期間保底鈴鐺(1)以上連線，且每局必中
    isForceWin = true
    // 隨機選擇 1(鈴鐺) ~ 6(藍七)
    forceSymbolId = getRandomInt(1, 6)

    if (bonusSpinsLeft <= 0) {
      bonusModeActive = false
      spinsSinceLastBonusCheck = 0
      nextBonusCheck = getRandomInt(30, 50)
      console.log('Bonus Mode Ended')
    }
  } else if (bonusPending) {
    // 已經確定要進入 Bonus，這一局強制出 7 連線，然後開啟 Bonus 模式
    console.log('Bonus Pending -> Triggering 7s Win')
    bonusModeActive = true
    bonusSpinsLeft = 20
    bonusPending = false
    isForceWin = true
    forceSymbolId = Math.random() > 0.5 ? 5 : 6 // 紅7(5) 或 藍7(6)
  } else {
    spinsSinceLastBonusCheck++
    spinsSinceLastSmallWin++
    console.log(`Spins since last check: ${spinsSinceLastBonusCheck}/${nextBonusCheck}`)

    // 檢查是否到達 Bonus 檢查點
    if (spinsSinceLastBonusCheck >= nextBonusCheck) {
      // 決定提示符號與機率
      // 隨機選擇提示符號：西瓜(3)、櫻桃(2)、方塊(4)
      const hintOptions = [
        { id: 3, prob: 0.4 }, // 西瓜 40%
        { id: 2, prob: 0.6 }, // 櫻桃 60%
        { id: 4, prob: 0.8 }, // 方塊 80%
      ]
      const hint = hintOptions[Math.floor(Math.random() * hintOptions.length)]

      console.log(`Bonus Check! Hint Symbol: ${hint.id}, Prob: ${hint.prob}`)

      // 強制出提示連線
      isForceWin = true
      forceSymbolId = hint.id

      // 判定是否進入 Bonus
      if (Math.random() < hint.prob) {
        console.log('Bonus Triggered! (Pending next spin)')
        bonusPending = true
      } else {
        console.log('Bonus Missed, resetting check')
        spinsSinceLastBonusCheck = 0
        nextBonusCheck = getRandomInt(30, 50)
      }
    }
    // 檢查小獎保底 (如果沒有觸發 Bonus 檢查)
    else if (spinsSinceLastSmallWin >= targetSpinsForSmallWin) {
      console.log('Small Win Triggered')
      isForceWin = true
      forceSymbolId = Math.random() > 0.5 ? 0 : 1 // 藍球(0) 或 鈴鐺(1)
      spinsSinceLastSmallWin = 0
      targetSpinsForSmallWin = getRandomInt(2, 5)
    }
  }

  nextReelData = [
    { top: 0, center: 0, bottom: 0 },
    { top: 0, center: 0, bottom: 0 },
    { top: 0, center: 0, bottom: 0 },
  ]

  if (isForceWin) {
    const winningSymbolId = forceSymbolId
    // 0~4 代表 5 種連線 (橫3 + 斜2) - 排除垂直連線
    const lineType = getRandomInt(0, 4)

    // 填雜訊
    for (let i = 0; i < 3; i++) {
      nextReelData[i].top = getWeightedRandomSymbol()
      nextReelData[i].center = getWeightedRandomSymbol()
      nextReelData[i].bottom = getWeightedRandomSymbol()
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
    }
  } else {
    for (let i = 0; i < 3; i++) {
      nextReelData[i].top = getWeightedRandomSymbol()
      nextReelData[i].center = getWeightedRandomSymbol()
      nextReelData[i].bottom = getWeightedRandomSymbol()
    }
  }

  // 檢查並修正垂直連線 (避免三個相同)
  for (let i = 0; i < 3; i++) {
    const col = nextReelData[i]
    // 如果三個都一樣，強制改變中間那個
    if (col.top === col.center && col.center === col.bottom) {
      let newSymbol = col.center
      while (newSymbol === col.center) {
        newSymbol = getWeightedRandomSymbol()
      }
      col.center = newSymbol
    }
  }
}

function startSpin() {
  if (isSpinning) return

  // 扣除分數
  score -= 3
  spinCount++
  updateScoreUI()

  isSpinning = true
  statusText.innerText = '機器轉動中'
  statusText.style.color = '#a78276'

  if (bonusModeActive) {
    awardsText.style.color = '#E05A47'
    awardsText.innerText = 'BONUS'
  } else {
    awardsText.style.color = '#725349'
    awardsText.innerText = 'SPINNING'
  }

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

// --- 修正：移除垂直連線判斷，計算分數 ---
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
  ]

  let winLines = []
  let totalWinScore = 0

  lines.forEach((line) => {
    const p = line.path
    const s1 = board[p[0][0]][p[0][1]]
    const s2 = board[p[1][0]][p[1][1]]
    const s3 = board[p[2][0]][p[2][1]]
    if (s1 === s2 && s2 === s3) {
      winLines.push({ name: line.name, symbolId: s1 })
      totalWinScore += SYMBOL_DATA[s1].value
    }
  })

  if (winLines.length > 0) {
    score += totalWinScore
    updateScoreUI()

    const firstWin = winLines[0]
    const symbolData = SYMBOL_DATA[firstWin.symbolId]

    // 如果是藍球(id=0)
    if (firstWin.symbolId === 0) {
      statusText.style.color = '#725349'
      const noWinMessages = ['再玩一次～', '繼續努力～', '別放棄～', '加油加油～', '再接再厲～', '再一次吧～']
      statusText.innerText = noWinMessages[Math.floor(Math.random() * noWinMessages.length)]
    } else {
      statusText.style.color = '#E05A47'
      const noWinMessages = [
        '恭喜中獎！',
        '太棒了！',
        '太爽了吧！',
        '怎麼那麼厲害！',
        '好運連連！',
        '中獎了！',
        '中獎真幸運！',
      ]
      statusText.innerText = noWinMessages[Math.floor(Math.random() * noWinMessages.length)]
    }

    // Awards Text 顯示英文獎項
    // 如果是 Bonus 模式且不是剛觸發的那一局 (剛觸發時 bonusSpinsLeft 為 20)，顯示 BONUS
    if (bonusModeActive && bonusSpinsLeft < 20) {
      awardsText.style.color = '#E05A47'
      awardsText.innerText = 'BONUS'
    } else {
      awardsText.style.color = '#725349'
      awardsText.innerText = symbolData.nameEN.toUpperCase()
    }
  } else {
    const noWinMessages = ['再接再厲', '可惜沒中喔', '下次一定中', '差一點點', '繼續加油']
    statusText.innerText = noWinMessages[Math.floor(Math.random() * noWinMessages.length)]
    statusText.style.color = '#a78276'

    if (bonusModeActive) {
      awardsText.style.color = '#E05A47'
      awardsText.innerText = 'BONUS'
    } else {
      awardsText.style.color = '#725349'
      awardsText.innerText = 'TRY AGAIN'
    }
  }

  isSpinning = false
  btnSpin.disabled = false
  btnSpin.style.opacity = 1

  // --- 修正：遊戲結束後，啟用所有 STOP 按鈕作為「重開」鍵 ---
  stopBtns.forEach((btn) => {
    btn.disabled = false
  })
}

function updateScoreUI() {
  scoreValue.innerText = score
  spinCountValue.innerText = spinCount
}

function resetGame() {
  score = 50
  spinCount = 0
  spinsSinceLastBonusCheck = 0
  nextBonusCheck = getRandomInt(30, 50)
  bonusModeActive = false
  bonusSpinsLeft = 0
  bonusPending = false
  spinsSinceLastSmallWin = 0
  targetSpinsForSmallWin = getRandomInt(2, 5)

  updateScoreUI()

  awardsText.innerText = 'READY'
  awardsText.style.color = '#725349'

  statusText.innerText = '準備'
  statusText.style.color = '#a78276'
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

  // 3. RESET 按鈕
  btnReset.addEventListener('click', () => {
    if (!isSpinning) {
      resetGame()
    }
  })

  // 4. 鍵盤控制 (空白鍵 or Enter)
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

  // 根據螢幕比例調整相機距離
  const zPos = aspect < 1 ? 130 : 85
  camera.position.z = zPos

  renderer.setSize(window.innerWidth, window.innerHeight)
}
