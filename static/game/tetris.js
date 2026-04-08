(() => {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 24;
  const NEXT_BLOCK = 16;
  const EMPTY = 0;

  // Green palette for CRT look (index matches piece type 1-7)
  const COLORS = [
    null,
    '#00ff41', // I - bright green
    '#00cc33', // O - medium green
    '#00ff80', // T - mint
    '#33ff00', // S - lime
    '#00ff66', // Z - spring
    '#00aa44', // J - dark green
    '#44ff44', // L - light green
  ];

  const GHOST_ALPHA = 0.2;

  // Tetromino shapes (each rotation state)
  const PIECES = {
    1: { // I
      shapes: [
        [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
        [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
        [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
        [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
      ],
    },
    2: { // O
      shapes: [
        [[1,1],[1,1]],
        [[1,1],[1,1]],
        [[1,1],[1,1]],
        [[1,1],[1,1]],
      ],
    },
    3: { // T
      shapes: [
        [[0,1,0],[1,1,1],[0,0,0]],
        [[0,1,0],[0,1,1],[0,1,0]],
        [[0,0,0],[1,1,1],[0,1,0]],
        [[0,1,0],[1,1,0],[0,1,0]],
      ],
    },
    4: { // S
      shapes: [
        [[0,1,1],[1,1,0],[0,0,0]],
        [[0,1,0],[0,1,1],[0,0,1]],
        [[0,0,0],[0,1,1],[1,1,0]],
        [[1,0,0],[1,1,0],[0,1,0]],
      ],
    },
    5: { // Z
      shapes: [
        [[1,1,0],[0,1,1],[0,0,0]],
        [[0,0,1],[0,1,1],[0,1,0]],
        [[0,0,0],[1,1,0],[0,1,1]],
        [[0,1,0],[1,1,0],[1,0,0]],
      ],
    },
    6: { // J
      shapes: [
        [[1,0,0],[1,1,1],[0,0,0]],
        [[0,1,1],[0,1,0],[0,1,0]],
        [[0,0,0],[1,1,1],[0,0,1]],
        [[0,1,0],[0,1,0],[1,1,0]],
      ],
    },
    7: { // L
      shapes: [
        [[0,0,1],[1,1,1],[0,0,0]],
        [[0,1,0],[0,1,0],[0,1,1]],
        [[0,0,0],[1,1,1],[1,0,0]],
        [[1,1,0],[0,1,0],[0,1,0]],
      ],
    },
  };

  // SRS wall kick data
  const KICKS_NORMAL = [
    [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  ];
  const KICKS_I = [
    [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  ];

  // Scoring (NES-style)
  const LINE_POINTS = [0, 100, 300, 500, 800];

  // Speed per level (ms per drop)
  function getSpeed(level) {
    const speeds = [800,720,630,550,470,380,300,220,140,100,80,70,60,50,40,30,20,15,10,5];
    return speeds[Math.min(level - 1, speeds.length - 1)];
  }

  // ── Audio Engine (Web Audio API) ───────────────────────────
  class SFX {
    constructor() {
      this.enabled = true;
      this.ctx = null;
    }

    init() {
      if (this.ctx) return;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    toggle() {
      this.enabled = !this.enabled;
      return this.enabled;
    }

    _osc(freq, duration, type = 'square', vol = 0.08) {
      if (!this.enabled || !this.ctx) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, this.ctx.currentTime);
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      o.connect(g).connect(this.ctx.destination);
      o.start();
      o.stop(this.ctx.currentTime + duration);
    }

    move()    { this._osc(180, 0.05); }
    rotate()  { this._osc(300, 0.08); }
    drop()    { this._osc(120, 0.15, 'triangle', 0.1); }
    lock()    { this._osc(200, 0.1, 'sawtooth', 0.06); }

    clear(lines) {
      if (lines === 4) {
        // Tetris! ascending sweep
        [400, 500, 600, 800].forEach((f, i) => {
          setTimeout(() => this._osc(f, 0.12, 'square', 0.1), i * 60);
        });
      } else {
        this._osc(500, 0.15, 'square', 0.08);
        setTimeout(() => this._osc(600, 0.1, 'square', 0.08), 80);
      }
    }

    levelUp() {
      [440, 550, 660, 880].forEach((f, i) => {
        setTimeout(() => this._osc(f, 0.15, 'square', 0.1), i * 100);
      });
    }

    gameOver() {
      [300, 250, 200, 150].forEach((f, i) => {
        setTimeout(() => this._osc(f, 0.25, 'sawtooth', 0.08), i * 150);
      });
    }
  }

  // ── Game State ─────────────────────────────────────────────
  const sfx = new SFX();

  const canvas = document.getElementById('tetris-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = COLS * BLOCK;
  canvas.height = ROWS * BLOCK;

  const nextCanvas = document.getElementById('next-canvas');
  const nextCtx = nextCanvas.getContext('2d');
  nextCanvas.width = 4 * NEXT_BLOCK;
  nextCanvas.height = 4 * NEXT_BLOCK;

  const scoreEl   = document.getElementById('score-display');
  const levelEl   = document.getElementById('level-display');
  const linesEl   = document.getElementById('lines-display');
  const hiscoreEl = document.getElementById('hiscore-display');

  const startOverlay    = document.getElementById('start-overlay');
  const pauseOverlay    = document.getElementById('pause-overlay');
  const gameoverOverlay = document.getElementById('gameover-overlay');
  const finalScoreText  = document.getElementById('final-score-text');
  const startBtn        = document.getElementById('start-btn');
  const restartBtn      = document.getElementById('restart-btn');
  const soundToggle     = document.getElementById('sound-toggle');

  let board, score, lines, level, gameRunning, paused;
  let current, currentX, currentY, currentType, currentRot;
  let nextType;
  let dropTimer, lastDrop;
  let highScore = parseInt(localStorage.getItem('tetris_hiscore') || '0', 10);
  let bag = [];

  hiscoreEl.textContent = highScore;

  // ── Bag Randomizer (7-bag) ─────────────────────────────────
  function fillBag() {
    bag = [1, 2, 3, 4, 5, 6, 7];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }

  function nextPiece() {
    if (bag.length === 0) fillBag();
    return bag.pop();
  }

  // ── Board ──────────────────────────────────────────────────
  function createBoard() {
    return Array.from({ length: ROWS }, () => new Array(COLS).fill(EMPTY));
  }

  function getShape(type, rot) {
    return PIECES[type].shapes[rot];
  }

  function collides(shape, bx, by) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nx = bx + c;
        const ny = by + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && board[ny][nx]) return true;
      }
    }
    return false;
  }

  function lockPiece() {
    const shape = getShape(currentType, currentRot);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const y = currentY + r;
        if (y < 0) {
          doGameOver();
          return;
        }
        board[y][currentX + c] = currentType;
      }
    }
    sfx.lock();
    clearLines();
    spawnPiece();
  }

  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(cell => cell !== EMPTY)) {
        board.splice(r, 1);
        board.unshift(new Array(COLS).fill(EMPTY));
        cleared++;
        r++; // recheck this row
      }
    }
    if (cleared > 0) {
      sfx.clear(cleared);
      lines += cleared;
      score += LINE_POINTS[cleared] * level;
      const newLevel = Math.floor(lines / 10) + 1;
      if (newLevel > level) {
        level = newLevel;
        sfx.levelUp();
      }
      updateHUD();
    }
  }

  function spawnPiece() {
    currentType = nextType;
    nextType = nextPiece();
    currentRot = 0;
    current = getShape(currentType, 0);
    currentX = Math.floor((COLS - current[0].length) / 2);
    currentY = currentType === 1 ? -1 : 0; // I piece starts higher

    if (collides(current, currentX, currentY)) {
      doGameOver();
    }
    drawNext();
  }

  // ── Ghost Piece ────────────────────────────────────────────
  function ghostY() {
    let gy = currentY;
    const shape = getShape(currentType, currentRot);
    while (!collides(shape, currentX, gy + 1)) gy++;
    return gy;
  }

  // ── Movement ───────────────────────────────────────────────
  function moveLeft() {
    const shape = getShape(currentType, currentRot);
    if (!collides(shape, currentX - 1, currentY)) {
      currentX--;
      sfx.move();
    }
  }

  function moveRight() {
    const shape = getShape(currentType, currentRot);
    if (!collides(shape, currentX + 1, currentY)) {
      currentX++;
      sfx.move();
    }
  }

  function moveDown() {
    const shape = getShape(currentType, currentRot);
    if (!collides(shape, currentX, currentY + 1)) {
      currentY++;
      return true;
    }
    return false;
  }

  function hardDrop() {
    const shape = getShape(currentType, currentRot);
    let dropped = 0;
    while (!collides(shape, currentX, currentY + 1)) {
      currentY++;
      dropped++;
    }
    score += dropped * 2;
    updateHUD();
    sfx.drop();
    lockPiece();
  }

  function rotate(dir) {
    const newRot = (currentRot + dir + 4) % 4;
    const newShape = getShape(currentType, newRot);
    const kicks = currentType === 1 ? KICKS_I : KICKS_NORMAL;
    const kickSet = kicks[currentRot];

    for (const [dx, dy] of kickSet) {
      if (!collides(newShape, currentX + dx, currentY - dy)) {
        currentX += dx;
        currentY -= dy;
        currentRot = newRot;
        current = newShape;
        sfx.rotate();
        return;
      }
    }
  }

  // ── Drawing ────────────────────────────────────────────────
  function drawBlock(context, x, y, colorIdx, size, alpha = 1) {
    const color = COLORS[colorIdx];
    context.globalAlpha = alpha;

    // Main block
    context.fillStyle = color;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);

    // Inner highlight
    context.fillStyle = 'rgba(255,255,255,0.1)';
    context.fillRect(x * size + 2, y * size + 2, size - 6, 2);
    context.fillRect(x * size + 2, y * size + 2, 2, size - 6);

    // Glow effect
    context.shadowColor = color;
    context.shadowBlur = 4;
    context.fillStyle = color;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    context.shadowBlur = 0;

    context.globalAlpha = 1;
  }

  function drawBoard() {
    // Background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(0,255,0,0.04)';
    ctx.lineWidth = 0.5;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * BLOCK, 0);
      ctx.lineTo(c * BLOCK, canvas.height);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * BLOCK);
      ctx.lineTo(canvas.width, r * BLOCK);
      ctx.stroke();
    }

    // Locked blocks
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          drawBlock(ctx, c, r, board[r][c], BLOCK);
        }
      }
    }

    if (!gameRunning) return;

    // Ghost piece
    const gy = ghostY();
    const shape = getShape(currentType, currentRot);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] && gy + r >= 0) {
          drawBlock(ctx, currentX + c, gy + r, currentType, BLOCK, GHOST_ALPHA);
        }
      }
    }

    // Current piece
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] && currentY + r >= 0) {
          drawBlock(ctx, currentX + c, currentY + r, currentType, BLOCK);
        }
      }
    }
  }

  function drawNext() {
    nextCtx.fillStyle = '#050505';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    const shape = getShape(nextType, 0);
    const offsetX = (4 - shape[0].length) / 2;
    const offsetY = (4 - shape.length) / 2;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          drawBlock(nextCtx, c + offsetX, r + offsetY, nextType, NEXT_BLOCK);
        }
      }
    }
  }

  function updateHUD() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = lines;
    hiscoreEl.textContent = highScore;
  }

  // ── Game Loop ──────────────────────────────────────────────
  function gameLoop(timestamp) {
    if (!gameRunning || paused) {
      dropTimer = requestAnimationFrame(gameLoop);
      drawBoard();
      return;
    }

    if (!lastDrop) lastDrop = timestamp;
    if (timestamp - lastDrop > getSpeed(level)) {
      if (!moveDown()) {
        lockPiece();
      }
      lastDrop = timestamp;
    }

    drawBoard();
    dropTimer = requestAnimationFrame(gameLoop);
  }

  // ── Game Flow ──────────────────────────────────────────────
  function startGame() {
    sfx.init();
    board = createBoard();
    score = 0;
    lines = 0;
    level = 1;
    paused = false;
    gameRunning = true;
    lastDrop = null;
    bag = [];
    fillBag();
    nextType = nextPiece();
    spawnPiece();
    updateHUD();

    startOverlay.classList.add('hidden');
    gameoverOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');

    if (!dropTimer) dropTimer = requestAnimationFrame(gameLoop);
  }

  function togglePause() {
    if (!gameRunning) return;
    paused = !paused;
    lastDrop = null;
    pauseOverlay.classList.toggle('hidden', !paused);
  }

  function doGameOver() {
    gameRunning = false;
    sfx.gameOver();
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('tetris_hiscore', String(highScore));
    }
    updateHUD();
    finalScoreText.textContent = 'SCORE: ' + score;
    gameoverOverlay.classList.remove('hidden');
  }

  // ── Input ──────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    // Only handle if game area is somewhat visible
    if (!gameRunning && e.key !== 'Enter') return;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      togglePause();
      e.preventDefault();
      return;
    }
    if (paused) return;

    switch (e.key) {
      case 'ArrowLeft':
        moveLeft();
        e.preventDefault();
        break;
      case 'ArrowRight':
        moveRight();
        e.preventDefault();
        break;
      case 'ArrowDown':
        if (moveDown()) score += 1;
        updateHUD();
        lastDrop = performance.now();
        e.preventDefault();
        break;
      case 'ArrowUp':
      case 'x':
      case 'X':
        rotate(1);
        e.preventDefault();
        break;
      case 'z':
      case 'Z':
        rotate(-1);
        e.preventDefault();
        break;
      case ' ':
        hardDrop();
        e.preventDefault();
        break;
    }
  });

  // ── Buttons ────────────────────────────────────────────────
  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);
  soundToggle.addEventListener('click', () => {
    const on = sfx.toggle();
    soundToggle.textContent = 'SFX: ' + (on ? 'ON' : 'OFF');
  });

  // Initial draw
  drawBoard();
  drawNext();
})();
