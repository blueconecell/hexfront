"use strict";

(() => {
  const canvas = document.querySelector("#game-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const $ = (id) => document.querySelector(`#${id}`);
  const ui = {
    healthFill: $("health-fill"), healthText: $("health-text"), xpFill: $("xp-fill"),
    level: $("level-value"), territory: $("territory-value"), kills: $("kills-value"),
    timer: $("timer-value"), weapon: $("weapon-value"), auto: $("auto-value"),
    objective: $("objective-text"), captureFill: $("capture-fill"), captureLabel: $("capture-label"),
    production: $("production-value"), productionRate: $("production-rate"), expansion: $("expansion-value"),
    terrain: $("terrain-value"), arsenal: $("arsenal-value"),
    enemyCapitals: $("enemy-capitals-value"), enemyTerritory: $("enemy-territory-value"), enemyPressure: $("enemy-pressure-value"),
    augment: $("augment-overlay"), augmentOptions: $("augment-options"), pause: $("pause-overlay"),
    gameOver: $("game-over-overlay"), victory: $("victory-overlay"),
    start: $("start-button"), restart: $("restart-button"), resume: $("resume-button"),
    playAgain: $("play-again-button"), victoryRestart: $("victory-restart-button"),
    touchStick: $("touch-stick"), touchStickKnob: $("touch-stick-knob"),
    touchFire: $("touch-fire-zone"), pauseButton: $("pause-button"),
    buildButton: $("build-button"), buildOverlay: $("build-overlay"), buildTileInfo: $("build-tile-info"),
    buildCancel: $("build-cancel"), buildOutpost: $("build-outpost"), buildFactory: $("build-factory"),
    buildLab: $("build-lab"), buildSilo: $("build-silo")
  };

  const TAU = Math.PI * 2;
  const MAP_RADIUS = 8;
  const CAPTURE_GOAL = 45;
  const VICTORY_TIME = 8 * 60;
  const CAPTURE_SECONDS = 2.2;
  const EXPANSION_SECONDS = 16;
  const HEX_DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const BUILDINGS = Object.freeze({ outpost: 30, factory: 40, lab: 45, silo: 55 });
  const ENEMY_CIVS = Object.freeze([
    { id: "ember", name: "EMBER", color: "#ef476f", q: 6, r: 0, foundryQ: 5, foundryR: 0 },
    { id: "violet", name: "VIOLET", color: "#d16bff", q: -6, r: 6, foundryQ: -5, foundryR: 5 },
    { id: "crimson", name: "CRIMSON", color: "#ff6b8a", q: 0, r: -6, foundryQ: 0, foundryR: -5 }
  ]);
  const keys = new Set();
  const pointer = { clientX: 0, clientY: 0, inside: false };
  const touchMove = { pointerId: null, x: 0, y: 0 };
  const touchAim = { pointerId: null, dirX: 1, dirY: 0, active: false };
  let view = { width: 0, height: 0, dpr: 1, scale: 1, hexSize: 62, cx: 0, cy: 0 };
  let state;
  let lastFrame = performance.now();
  let animationFrame = 0;

  const AUGMENTS = [
    { title: "과충전 탄환", text: "수동 공격 피해 +35%", apply: (s) => { s.player.damage *= 1.35; } },
    { title: "급속 장전", text: "수동 발사 간격 -22%", apply: (s) => { s.player.fireRate *= 0.78; } },
    { title: "관통 코어", text: "탄환 관통 +1", apply: (s) => { s.player.pierce += 1; } },
    { title: "반응로 동기화", text: "자동 펄스 속도 +25%", apply: (s) => { s.player.autoRate *= 0.75; } },
    { title: "증폭 펄스", text: "자동 공격 피해 +40%", apply: (s) => { s.player.autoDamage *= 1.4; } },
    { title: "자기장", text: "경험치 획득 범위 +45%", apply: (s) => { s.player.pickup *= 1.45; } },
    { title: "기동 장갑", text: "이동 속도 +15%, 최대 체력 +12", apply: (s) => { s.player.speed *= 1.15; s.player.maxHp += 12; s.player.hp += 12; } },
    { title: "응급 수복", text: "체력을 모두 회복하고 재생 +0.5/s", apply: (s) => { s.player.hp = s.player.maxHp; s.player.regen += 0.5; } },
    { title: "위상 탄두", text: "탄환 크기와 속도 +25%", apply: (s) => { s.player.shotSize *= 1.25; s.player.shotSpeed *= 1.25; } }
  ];

  function coordinateHash(q, r) {
    let n = Math.imul(q, 374761393) ^ Math.imul(r, 668265263) ^ 0x5f356495;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function makeHexes() {
    const hexes = [];
    for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q += 1) {
      const rMin = Math.max(-MAP_RADIUS, -q - MAP_RADIUS);
      const rMax = Math.min(MAP_RADIUS, -q + MAP_RADIUS);
      for (let r = rMin; r <= rMax; r += 1) {
        const terrainRoll = coordinateHash(q, r);
        const resourceRoll = coordinateHash(q + 31, r - 19);
        const terrain = terrainRoll < 0.2 ? "crater" : terrainRoll < 0.4 ? "ridge" : terrainRoll < 0.65 ? "dunes" : "plain";
        const resource = resourceRoll < 0.08 ? "core" : resourceRoll < 0.2 ? "ore" : resourceRoll < 0.27 ? "ruins" : resourceRoll < 0.35 ? "garden" : null;
        hexes.push({ q, r, key: `${q},${r}`, terrain, resource, captured: q === 0 && r === 0,
          building: q === 0 && r === 0 ? "command" : null, enemyCiv: null, enemyStructure: null, enemyNeutralized: false,
          discovered: false, visible: false, rewardClaimed: false });
      }
    }
    return hexes;
  }

  function setupEnemyCivs(targetState) {
    targetState.enemyCivs = ENEMY_CIVS.map((config, index) => ({ ...config, defeated: false,
      expansionClock: 20 + index * 2, expansionInterval: 20 + index * 2, expansionTarget: null }));
    for (const civ of targetState.enemyCivs) {
      const capital = targetState.hexByKey.get(`${civ.q},${civ.r}`);
      for (const hex of targetState.hexes) if (hexDistance(hex, civ) <= 1 && !hex.captured) hex.enemyCiv = civ.id;
      capital.enemyStructure = { type: "capital", hp: 340, maxHp: 340, spawnClock: 3 + targetState.enemyCivs.indexOf(civ) };
      const foundry = targetState.hexByKey.get(`${civ.foundryQ},${civ.foundryR}`);
      foundry.enemyCiv = civ.id;
      foundry.enemyStructure = { type: "foundry", hp: 170, maxHp: 170, spawnClock: 1.5 + targetState.enemyCivs.indexOf(civ) * 0.7 };
    }
  }

  function freshState(running = true) {
    const hexes = makeHexes();
    const s = {
      running, paused: !running, ended: false, choosing: false, menu: false, won: false,
      time: 0, captureKey: null, captureProgress: 0, expansionProgress: 0, expansionKey: null,
      kills: 0, production: 25, productionRate: 0, enemyId: 0,
      camera: { x: 0, y: 0 }, hexes, hexByKey: new Map(hexes.map((hex) => [hex.key, hex])),
      enemies: [], projectiles: [], drops: [], particles: [], messages: [],
      player: { x: 0, y: 0, radius: 13, speed: 210, hp: 100, maxHp: 100, regen: 0,
        level: 1, xp: 0, nextXp: 18, damage: 23, fireRate: 0.26, fireClock: 0,
        shotSpeed: 590, shotSize: 5, pierce: 0, autoDamage: 16, autoRate: 0.82,
        autoClock: 0.35, railClock: 1.2, missileClock: 1.7, pickup: 70, invulnerable: 0, orbitAngle: 0 }
    };
    setupEnemyCivs(s);
    revealAround(s, 0, 0, 2);
    return s;
  }

  function setOverlay(node, visible) {
    if (!node) return;
    node.hidden = !visible;
    node.classList.toggle("hidden", !visible);
  }

  function reset(start = true) {
    state = freshState(start); keys.clear(); clearTouchInput();
    setOverlay(ui.augment, false); setOverlay(ui.pause, false); setOverlay(ui.gameOver, false);
    setOverlay(ui.victory, false); setOverlay(ui.buildOverlay, false);
    if (start) lastFrame = performance.now();
    updateHud(); return snapshot();
  }

  function startGame() {
    reset(true); setOverlay($("start-overlay"), false); canvas.focus();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.width = Math.max(320, rect.width || window.innerWidth);
    view.height = Math.max(320, rect.height || window.innerHeight);
    canvas.width = Math.round(view.width * view.dpr); canvas.height = Math.round(view.height * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    view.scale = Math.min(view.width / 900, view.height / 760);
    view.hexSize = Math.max(36, Math.min(68, 62 * view.scale));
    view.cx = view.width / 2; view.cy = view.height / 2;
  }

  function axialToWorld(q, r) {
    return { x: view.hexSize * Math.sqrt(3) * (q + r / 2), y: view.hexSize * 1.5 * r };
  }

  function axialRound(q, r) {
    let x = q; let z = r; let y = -x - z;
    let rx = Math.round(x); let ry = Math.round(y); let rz = Math.round(z);
    const dx = Math.abs(rx - x); const dy = Math.abs(ry - y); const dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    return { q: rx, r: rz };
  }

  function worldToAxial(x, y) {
    return axialRound((Math.sqrt(3) / 3 * x - y / 3) / view.hexSize, (2 / 3 * y) / view.hexSize);
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left - view.cx + state.camera.x, y: clientY - rect.top - view.cy + state.camera.y };
  }

  function hexAt(x, y) {
    const axial = worldToAxial(x, y);
    return state.hexByKey.get(`${axial.q},${axial.r}`) || null;
  }

  function hexDistance(a, b) {
    return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((-a.q - a.r) - (-b.q - b.r)));
  }

  function neighbors(hex) {
    return HEX_DIRECTIONS.map(([dq, dr]) => state.hexByKey.get(`${hex.q + dq},${hex.r + dr}`)).filter(Boolean);
  }

  function isAccessible(hex) { return Boolean(hex && !hex.captured && !hex.enemyCiv && neighbors(hex).some((item) => item.captured)); }
  function capturedCount() { return state.hexes.filter((hex) => hex.captured).length; }
  function buildingCount(type) { return state.hexes.filter((hex) => hex.building === type).length; }
  function enemyTerritoryCount(civId) { return state.hexes.filter((hex) => hex.enemyCiv === civId).length; }
  function enemyStructures(civId) { return state.hexes.filter((hex) => hex.enemyStructure && (!civId || hex.enemyCiv === civId)); }

  function revealAround(targetState, q, r, radius) {
    for (const hex of targetState.hexes) {
      if (hexDistance(hex, { q, r }) <= radius) hex.discovered = true;
    }
  }

  function updateVisibility() {
    for (const hex of state.hexes) hex.visible = false;
    const playerHex = hexAt(state.player.x, state.player.y);
    if (playerHex) {
      revealAround(state, playerHex.q, playerHex.r, 2);
      for (const hex of state.hexes) if (hexDistance(hex, playerHex) <= 2) hex.visible = true;
    }
    for (const source of state.hexes.filter((hex) => hex.captured)) {
      revealAround(state, source.q, source.r, 1);
      for (const hex of state.hexes) if (hexDistance(hex, source) <= 1) hex.visible = true;
    }
  }

  function productionRate() {
    return 1 + Math.max(0, capturedCount() - 1) * 0.12 + state.hexes.filter((h) => h.captured && h.resource === "ore").length * 0.35 + buildingCount("factory") * 1.75;
  }

  function update(dt) {
    if (!state.running || state.paused || state.choosing || state.menu || state.ended) return;
    state.time += dt; state.productionRate = productionRate(); state.production += state.productionRate * dt;
    updatePlayer(dt); updateVisibility(); updateCapture(dt); updateExpansion(dt); updateBuildingWeapons(dt);
    updateEnemyCivs(dt); updateEnemies(dt); updateProjectiles(dt); updateDrops(dt); updateParticles(dt);
    state.camera.x += (state.player.x - state.camera.x) * Math.min(1, dt * 8);
    state.camera.y += (state.player.y - state.camera.y) * Math.min(1, dt * 8);
    if (state.enemyCivs.every((civ) => civ.defeated) || state.time >= VICTORY_TIME || capturedCount() >= CAPTURE_GOAL) finish(true);
    updateHud();
  }

  function updatePlayer(dt) {
    const p = state.player;
    let dx = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    let dy = (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
    dx += touchMove.x; dy += touchMove.y;
    if (dx || dy) {
      const length = Math.hypot(dx, dy); dx /= length; dy /= length;
      const oldX = p.x; const oldY = p.y; p.x += dx * p.speed * dt; p.y += dy * p.speed * dt;
      if (!hexAt(p.x, p.y)) { p.x = oldX; p.y = oldY; }
    }
    p.fireClock = Math.max(0, p.fireClock - dt); p.autoClock -= dt; p.railClock -= dt; p.missileClock -= dt;
    p.invulnerable = Math.max(0, p.invulnerable - dt); p.orbitAngle += dt * 2.8;
    const gardenRegen = state.hexes.filter((h) => h.captured && h.resource === "garden").length * 0.06;
    p.hp = Math.min(p.maxHp, p.hp + (p.regen + gardenRegen) * dt);
    if (touchAim.active) manualShoot(); if (p.autoClock <= 0) autoAttack();
  }

  function aimPoint() {
    if (touchAim.active) return { x: state.player.x + touchAim.dirX * 1000, y: state.player.y + touchAim.dirY * 1000 };
    if (pointer.inside) return screenToWorld(pointer.clientX, pointer.clientY);
    return nearestHostile() || { x: state.player.x + 1, y: state.player.y };
  }

  function nearestEnemy(maxDistance = Infinity) {
    let best = null; let distance = maxDistance;
    for (const enemy of state.enemies) {
      const d = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
      if (d < distance) { best = enemy; distance = d; }
    }
    return best;
  }

  function nearestHostile(maxDistance = Infinity) {
    let best = nearestEnemy(maxDistance); let distance = best ? Math.hypot(best.x - state.player.x, best.y - state.player.y) : maxDistance;
    const structureRange = Math.min(maxDistance, view.hexSize * 6.5);
    for (const hex of enemyStructures()) {
      if (!hex.discovered) continue;
      const center = axialToWorld(hex.q, hex.r); const d = Math.hypot(center.x - state.player.x, center.y - state.player.y);
      if (d <= structureRange && d < distance) { best = { combatId: `structure:${hex.key}`, structureKey: hex.key, x: center.x, y: center.y }; distance = d; }
    }
    return best;
  }

  function addProjectile(kind, x, y, angle, speed, radius, damage, life, pierce, color, extra = {}) {
    state.projectiles.push({ kind, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius, damage, life, pierce, color, hit: new Set(), ...extra });
  }

  function manualShoot() {
    if (!state.running || state.paused || state.choosing || state.menu || state.ended || state.player.fireClock > 0) return;
    const p = state.player; const target = aimPoint(); const angle = Math.atan2(target.y - p.y, target.x - p.x);
    addProjectile("pulse", p.x, p.y, angle, p.shotSpeed, p.shotSize, p.damage, 1.25, p.pierce, "#ffcf5a");
    const factories = buildingCount("factory");
    for (let i = 0; i < factories; i += 1) {
      const spread = 0.1 + i * 0.045;
      addProjectile("scatter", p.x, p.y, angle - spread, p.shotSpeed * 0.9, p.shotSize * 0.75, p.damage * 0.42, 1.05, 0, "#ff9f43");
      addProjectile("scatter", p.x, p.y, angle + spread, p.shotSpeed * 0.9, p.shotSize * 0.75, p.damage * 0.42, 1.05, 0, "#ff9f43");
    }
    p.fireClock = p.fireRate;
  }

  function autoAttack() {
    const p = state.player; const target = nearestHostile(view.hexSize * 5.5); p.autoClock = p.autoRate;
    if (!target) return;
    const x = p.x + Math.cos(p.orbitAngle) * 34; const y = p.y + Math.sin(p.orbitAngle) * 34;
    addProjectile("orbital", x, y, Math.atan2(target.y - y, target.x - x), 420, 8, p.autoDamage, 1.4, 1, "#63e6ff");
    burst(x, y, "#63e6ff", 5);
  }

  function updateBuildingWeapons() {
    const p = state.player; const target = nearestHostile();
    if (buildingCount("lab") > 0 && p.railClock <= 0) {
      p.railClock = Math.max(0.8, 3.2 / buildingCount("lab"));
      if (target) addProjectile("rail", p.x, p.y, Math.atan2(target.y - p.y, target.x - p.x), 980, 4, 34, 1.35, 5, "#c8a8ff");
    }
    if (buildingCount("silo") > 0 && p.missileClock <= 0) {
      p.missileClock = Math.max(1.2, 4.8 / buildingCount("silo"));
      if (target) addProjectile("missile", p.x, p.y, Math.atan2(target.y - p.y, target.x - p.x), 250, 7, 42, 4, 0, "#ff6b6b", { targetId: target.id, targetStructureKey: target.structureKey, homing: true, aoe: 58 });
    }
  }

  function updateEnemies(dt) {
    const p = state.player;
    for (const enemy of state.enemies) {
      const angle = Math.atan2(p.y - enemy.y, p.x - enemy.x);
      enemy.x += Math.cos(angle) * enemy.speed * dt; enemy.y += Math.sin(angle) * enemy.speed * dt; enemy.touch -= dt;
      if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < enemy.radius + p.radius && enemy.touch <= 0) { enemy.touch = 0.65; hurtPlayer(enemy.damage); }
    }
  }

  function spawnEnemyAt(hex, civ) {
    if (!hex?.enemyStructure || civ.defeated) return false;
    const center = axialToWorld(hex.q, hex.r); const territoryScale = 1 + Math.max(0, enemyTerritoryCount(civ.id) - 7) * 0.018;
    const difficulty = (1 + state.time / 420) * territoryScale;
    const brute = coordinateHash(state.enemyId + civ.q, Math.floor(state.time) + civ.r) < Math.min(0.22, state.time / 900);
    const hp = (brute ? 72 : 32) * difficulty;
    state.enemies.push({ id: ++state.enemyId, originCiv: civ.id, originStructure: hex.enemyStructure.type, originKey: hex.key,
      x: center.x, y: center.y, radius: brute ? 18 : 12, speed: (brute ? 54 : 80) + Math.min(18, state.time / 35),
      hp, maxHp: hp, damage: brute ? 16 : 10, xp: brute ? 8 : 4, touch: 0, brute });
    if (hex.discovered) {
      burst(center.x, center.y, civ.color, 14);
      state.messages.push({ text: `${civ.name} 출격`, x: center.x, y: center.y - 20, life: 1.25 });
    }
    return true;
  }

  function enemyExpansionCandidates(civ) {
    const result = new Map();
    for (const owned of state.hexes.filter((hex) => hex.enemyCiv === civ.id)) {
      for (const hex of neighbors(owned)) if (!hex.captured && !hex.enemyCiv && !hex.enemyNeutralized) result.set(hex.key, hex);
    }
    return [...result.values()].sort((a, b) => hexDistance(b, civ) - hexDistance(a, civ) ||
      coordinateHash(a.q + civ.q, a.r + civ.r) - coordinateHash(b.q + civ.q, b.r + civ.r));
  }

  function expandEnemyCiv(civ) {
    if (!civ || civ.defeated) return false;
    const target = enemyExpansionCandidates(civ)[0];
    if (!target) { civ.expansionTarget = null; return false; }
    target.enemyCiv = civ.id; civ.expansionTarget = target.key;
    if (target.discovered) { const center = axialToWorld(target.q, target.r); burst(center.x, center.y, civ.color, 12); }
    return true;
  }

  function updateEnemyCivs(dt) {
    for (const civ of state.enemyCivs) {
      if (civ.defeated) continue;
      for (const hex of enemyStructures(civ.id)) {
        const structure = hex.enemyStructure; structure.spawnClock -= dt;
        if (structure.spawnClock <= 0) {
          spawnEnemyAt(hex, civ);
          const base = structure.type === "capital" ? 10 : 7.5;
          structure.spawnClock = Math.max(4.5, base - state.time / 240 - enemyTerritoryCount(civ.id) * 0.025);
        }
      }
      civ.expansionClock -= dt;
      if (civ.expansionClock <= 0) { expandEnemyCiv(civ); civ.expansionClock = civ.expansionInterval; }
    }
  }

  function explode(shot) {
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      if (Math.hypot(shot.x - state.enemies[i].x, shot.y - state.enemies[i].y) <= shot.aoe) {
        state.enemies[i].hp -= shot.damage;
        if (state.enemies[i].hp <= 0) killEnemy(i);
      }
    }
    for (const hex of [...enemyStructures()]) {
      const center = axialToWorld(hex.q, hex.r);
      if (Math.hypot(shot.x - center.x, shot.y - center.y) <= shot.aoe) damageEnemyStructure(hex, shot.damage);
    }
    burst(shot.x, shot.y, shot.color, 14);
  }

  function defeatEnemyCiv(civ) {
    if (!civ || civ.defeated) return;
    civ.defeated = true; civ.expansionTarget = null;
    const capital = axialToWorld(civ.q, civ.r);
    for (const hex of state.hexes) if (hex.enemyCiv === civ.id) { hex.enemyCiv = null; hex.enemyStructure = null; }
    burst(capital.x, capital.y, civ.color, 42);
    state.messages.push({ text: `${civ.name} 문명 붕괴`, x: capital.x, y: capital.y - 28, life: 2.8 });
    if (state.enemyCivs.every((item) => item.defeated)) finish(true);
  }

  function damageEnemyStructure(hex, damage) {
    if (!hex?.enemyStructure || damage <= 0) return false;
    const structure = hex.enemyStructure; structure.hp -= damage;
    const center = axialToWorld(hex.q, hex.r); burst(center.x, center.y, "#ffcfda", 5);
    if (structure.hp > 0) return true;
    const civ = state.enemyCivs.find((item) => item.id === hex.enemyCiv);
    if (structure.type === "capital") defeatEnemyCiv(civ);
    else {
      hex.enemyStructure = null; hex.enemyCiv = null; hex.enemyNeutralized = true;
      burst(center.x, center.y, civ?.color || "#ef476f", 24);
      state.messages.push({ text: "적 생산기지 무력화", x: center.x, y: center.y - 18, life: 2 });
    }
    return true;
  }

  function updateProjectiles(dt) {
    for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
      const shot = state.projectiles[i];
      if (shot.homing) {
        const targetHex = shot.targetStructureKey && state.hexByKey.get(shot.targetStructureKey);
        const targetCenter = targetHex?.enemyStructure ? axialToWorld(targetHex.q, targetHex.r) : null;
        const target = targetCenter || state.enemies.find((enemy) => enemy.id === shot.targetId) || nearestHostile();
        if (target) {
          const speed = Math.hypot(shot.vx, shot.vy); const desired = Math.atan2(target.y - shot.y, target.x - shot.x);
          const current = Math.atan2(shot.vy, shot.vx); const turn = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
          const angle = current + Math.max(-3.5 * dt, Math.min(3.5 * dt, turn)); shot.vx = Math.cos(angle) * speed; shot.vy = Math.sin(angle) * speed;
        }
      }
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      let remove = shot.life <= 0;
      for (let j = state.enemies.length - 1; j >= 0 && !remove; j -= 1) {
        const enemy = state.enemies[j];
        const hitId = `enemy:${enemy.id}`;
        if (shot.hit.has(hitId) || Math.hypot(shot.x - enemy.x, shot.y - enemy.y) > shot.radius + enemy.radius) continue;
        if (shot.aoe) { explode(shot); remove = true; break; }
        shot.hit.add(hitId); enemy.hp -= shot.damage; burst(shot.x, shot.y, shot.color, 4);
        if (enemy.hp <= 0) killEnemy(j);
        if (shot.pierce <= 0) remove = true; else shot.pierce -= 1;
      }
      for (const hex of [...enemyStructures()]) {
        if (remove) break;
        const hitId = `structure:${hex.key}`; const center = axialToWorld(hex.q, hex.r);
        const radius = hex.enemyStructure.type === "capital" ? 20 : 15;
        if (shot.hit.has(hitId) || Math.hypot(shot.x - center.x, shot.y - center.y) > shot.radius + radius) continue;
        if (shot.aoe) { explode(shot); remove = true; break; }
        shot.hit.add(hitId); damageEnemyStructure(hex, shot.damage);
        if (shot.pierce <= 0) remove = true; else shot.pierce -= 1;
      }
      if (remove) { if (shot.aoe && shot.life <= 0) explode(shot); state.projectiles.splice(i, 1); }
    }
  }

  function killEnemy(index) {
    const enemy = state.enemies[index]; state.enemies.splice(index, 1); state.kills += 1;
    state.drops.push({ x: enemy.x, y: enemy.y, value: enemy.xp, radius: enemy.brute ? 7 : 5, t: 0 });
    burst(enemy.x, enemy.y, enemy.brute ? "#ff6b6b" : "#e24b63", enemy.brute ? 12 : 7);
  }

  function updateDrops(dt) {
    const p = state.player;
    for (let i = state.drops.length - 1; i >= 0; i -= 1) {
      const drop = state.drops[i]; drop.t += dt; if (drop.t > 45) { state.drops.splice(i, 1); continue; }
      const distance = Math.hypot(p.x - drop.x, p.y - drop.y);
      if (distance < p.pickup) { const speed = 170 + (p.pickup - distance) * 6; drop.x += (p.x - drop.x) / Math.max(1, distance) * speed * dt; drop.y += (p.y - drop.y) / Math.max(1, distance) * speed * dt; }
      if (distance < p.radius + drop.radius + 4) { addXp(drop.value); state.drops.splice(i, 1); }
    }
  }

  function addXp(amount) {
    const p = state.player; p.xp += amount;
    if (p.xp < p.nextXp) return;
    p.xp -= p.nextXp; p.level += 1; p.nextXp = Math.round(p.nextXp * 1.28 + 4); showAugments();
  }

  function showAugments() {
    state.choosing = true; const choices = [...AUGMENTS].sort(() => Math.random() - 0.5).slice(0, 3);
    if (ui.augmentOptions) ui.augmentOptions.replaceChildren(...choices.map((augment, index) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "augment-card";
      button.innerHTML = `<span>0${index + 1}</span><strong>${augment.title}</strong><small>${augment.text}</small>`;
      button.addEventListener("click", () => { augment.apply(state); state.choosing = false; setOverlay(ui.augment, false); updateHud(); canvas.focus(); }); return button;
    }));
    setOverlay(ui.augment, true);
  }

  function captureHex(hex, source = "manual") {
    if (!hex || hex.captured || hex.enemyCiv) return false;
    hex.captured = true; hex.building = null; hex.enemyNeutralized = false; revealAround(state, hex.q, hex.r, 2);
    if (!hex.rewardClaimed) {
      hex.rewardClaimed = true;
      if (hex.resource === "core") state.player.autoDamage *= 1.12;
      if (hex.resource === "ruins") addXp(7);
      if (hex.resource === "garden") state.player.hp = Math.min(state.player.maxHp, state.player.hp + 12);
    }
    const center = axialToWorld(hex.q, hex.r); burst(center.x, center.y, "#63e6ff", 18);
    state.messages.push({ text: `${source === "outpost" ? "전초기지 확장" : "영토 확보"}${hex.resource ? ` · ${resourceName(hex.resource)}` : ""}`, x: center.x, y: center.y, life: 1.8 });
    return true;
  }

  function updateCapture(dt) {
    const hex = hexAt(state.player.x, state.player.y);
    if (!hex || !isAccessible(hex)) { state.captureKey = null; state.captureProgress = Math.max(0, state.captureProgress - dt * 2); return; }
    if (state.captureKey !== hex.key) { state.captureKey = hex.key; state.captureProgress = 0; }
    state.captureProgress += dt;
    if (state.captureProgress >= CAPTURE_SECONDS) { captureHex(hex, "manual"); state.captureProgress = 0; state.captureKey = null; }
  }

  function expansionCandidates() {
    const outposts = state.hexes.filter((hex) => hex.building === "outpost");
    if (!outposts.length) return [];
    const result = new Map();
    for (const captured of state.hexes.filter((hex) => hex.captured)) {
      for (const hex of neighbors(captured)) if (!hex.captured && !hex.enemyCiv) result.set(hex.key, hex);
    }
    return [...result.values()].sort((a, b) => {
      const ad = Math.min(...outposts.map((outpost) => hexDistance(a, outpost)));
      const bd = Math.min(...outposts.map((outpost) => hexDistance(b, outpost)));
      const af = neighbors(a).filter((h) => h.captured).length; const bf = neighbors(b).filter((h) => h.captured).length;
      return ad - bd || bf - af || coordinateHash(a.q, a.r) - coordinateHash(b.q, b.r);
    });
  }

  function updateExpansion(dt) {
    const count = buildingCount("outpost"); const candidates = expansionCandidates();
    if (!count || !candidates.length) { state.expansionProgress = 0; state.expansionKey = null; return; }
    if (!state.expansionKey || !state.hexByKey.get(state.expansionKey) || state.hexByKey.get(state.expansionKey).captured || state.hexByKey.get(state.expansionKey).enemyCiv) state.expansionKey = candidates[0].key;
    state.expansionProgress += dt * (1 + (count - 1) * 0.5);
    if (state.expansionProgress >= EXPANSION_SECONDS) { state.expansionProgress = 0; captureHex(state.hexByKey.get(state.expansionKey), "outpost"); state.expansionKey = null; }
  }

  function currentBuildTile() { return hexAt(state.player.x, state.player.y); }
  function canBuild(type) {
    const hex = currentBuildTile(); return Boolean(BUILDINGS[type] && hex && hex.captured && hex.building !== "command" && !hex.building && state.production >= BUILDINGS[type]);
  }

  function build(type) {
    if (!canBuild(type)) return false;
    const hex = currentBuildTile(); state.production -= BUILDINGS[type]; hex.building = type;
    closeBuildMenu(); updateHud(); return true;
  }

  function openBuildMenu() {
    if (!state.running || state.paused || state.choosing || state.ended) return;
    state.menu = true; keys.clear(); clearTouchInput(); setOverlay(ui.buildOverlay, true); updateBuildUi();
  }

  function closeBuildMenu() {
    state.menu = false; setOverlay(ui.buildOverlay, false); lastFrame = performance.now(); canvas.focus();
  }

  function updateBuildUi() {
    const hex = currentBuildTile();
    if (ui.buildTileInfo) ui.buildTileInfo.textContent = !hex ? "지도 밖" : !hex.captured ? "점령되지 않은 타일" : hex.building === "command" ? "지휘 기지에는 건설할 수 없습니다" : hex.building ? `${buildingName(hex.building)} 건설됨` : `${terrainName(hex.terrain)}${hex.resource ? ` · ${resourceName(hex.resource)}` : ""}`;
    for (const [type, cost] of Object.entries(BUILDINGS)) {
      const button = ui[`build${type[0].toUpperCase()}${type.slice(1)}`]; if (!button) continue;
      button.disabled = !canBuild(type); button.dataset.cost = String(cost);
      const costNode = button.querySelector("[data-cost]"); if (costNode) costNode.textContent = cost;
    }
  }

  function hurtPlayer(amount) {
    const p = state.player; if (p.invulnerable > 0 || state.ended) return;
    p.hp -= amount; p.invulnerable = 0.45; burst(p.x, p.y, "#ffffff", 10); if (p.hp <= 0) finish(false);
  }

  function burst(x, y, color, amount) {
    for (let i = 0; i < amount; i += 1) { const angle = Math.random() * TAU; const speed = 25 + Math.random() * 110;
      state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.25 + Math.random() * 0.35, maxLife: 0.6, color, size: 1.5 + Math.random() * 3 }); }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) { const particle = state.particles[i]; particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vx *= 0.96; particle.vy *= 0.96; if (particle.life <= 0) state.particles.splice(i, 1); }
    for (let i = state.messages.length - 1; i >= 0; i -= 1) { state.messages[i].life -= dt; state.messages[i].y -= 22 * dt; if (state.messages[i].life <= 0) state.messages.splice(i, 1); }
  }

  function finish(won) { state.ended = true; state.running = false; state.won = won; state.player.hp = Math.max(0, state.player.hp); setOverlay(won ? ui.victory : ui.gameOver, true); }

  function togglePause(force) {
    if (!state.running || state.ended || state.choosing || state.menu) return;
    state.paused = typeof force === "boolean" ? force : !state.paused; keys.clear(); clearTouchInput(); setOverlay(ui.pause, state.paused);
    if (!state.paused) { lastFrame = performance.now(); canvas.focus(); }
  }

  function terrainName(type) { return { plain: "평원", crater: "분화구", ridge: "능선", dunes: "사구" }[type] || type; }
  function resourceName(type) { return { ore: "광맥", core: "동력핵", ruins: "유적", garden: "생명정원" }[type] || type; }
  function buildingName(type) { return { command: "지휘 기지", outpost: "전초기지", factory: "군수공장", lab: "연구소", silo: "미사일 사일로" }[type] || type; }
  function buildingColor(type) { return { command: "#f4d35e", outpost: "#42d9c8", factory: "#ff9f43", lab: "#b58cff", silo: "#ff6b6b" }[type] || "#63e6ff"; }

  function drawHex(hex, fill, stroke = "#456071", width = 1.3) {
    const center = axialToWorld(hex.q, hex.r); ctx.beginPath();
    for (let i = 0; i < 6; i += 1) { const angle = Math.PI / 180 * (60 * i - 30); const x = center.x + view.hexSize * Math.cos(angle); const y = center.y + view.hexSize * Math.sin(angle); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
  }

  function isOnScreen(x, y, padding = view.hexSize * 1.4) { return Math.abs(x - state.camera.x) <= view.width / 2 + padding && Math.abs(y - state.camera.y) <= view.height / 2 + padding; }

  function render() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); ctx.clearRect(0, 0, view.width, view.height);
    const gradient = ctx.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy, Math.max(view.width, view.height) * 0.7);
    gradient.addColorStop(0, "#142b38"); gradient.addColorStop(1, "#07131c"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, view.width, view.height);
    ctx.save(); ctx.translate(view.cx - state.camera.x, view.cy - state.camera.y); drawLinks();
    for (const hex of state.hexes) { const center = axialToWorld(hex.q, hex.r); if (isOnScreen(center.x, center.y)) drawTile(hex); }
    drawCapture(); drawExpansion();
    for (const drop of state.drops) if (isOnScreen(drop.x, drop.y)) drawDrop(drop);
    for (const enemy of state.enemies) if (isOnScreen(enemy.x, enemy.y)) drawEnemy(enemy);
    for (const shot of state.projectiles) if (isOnScreen(shot.x, shot.y)) drawProjectile(shot);
    for (const particle of state.particles) if (isOnScreen(particle.x, particle.y)) { ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife); ctx.fillStyle = particle.color; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1; drawPlayer();
    for (const message of state.messages) { ctx.globalAlpha = Math.min(1, message.life); ctx.fillStyle = "#ffffff"; ctx.font = "700 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText(message.text, message.x, message.y); }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawLinks() {
    ctx.lineWidth = 4; ctx.strokeStyle = "rgba(99,230,255,.32)";
    for (const hex of state.hexes.filter((item) => item.captured)) { const a = axialToWorld(hex.q, hex.r); if (!isOnScreen(a.x, a.y)) continue;
      for (const [dq, dr] of HEX_DIRECTIONS.slice(0, 3)) { const other = state.hexByKey.get(`${hex.q + dq},${hex.r + dr}`); if (!other?.captured) continue; const b = axialToWorld(other.q, other.r); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
    for (const hex of state.hexes.filter((item) => item.enemyCiv && item.discovered)) {
      const civ = state.enemyCivs.find((item) => item.id === hex.enemyCiv); const a = axialToWorld(hex.q, hex.r);
      ctx.strokeStyle = civ?.color || "#ef476f"; ctx.globalAlpha = hex.visible ? 0.35 : 0.13;
      for (const [dq, dr] of HEX_DIRECTIONS.slice(0, 3)) {
        const other = state.hexByKey.get(`${hex.q + dq},${hex.r + dr}`);
        if (other?.enemyCiv !== hex.enemyCiv || !other.discovered) continue;
        const b = axialToWorld(other.q, other.r); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawTile(hex) {
    if (!hex.discovered) { drawHex(hex, "#050b10", "#111c23", 1); return; }
    const terrainColor = { plain: "#173746", crater: "#25313c", ridge: "#293f4c", dunes: "#394235" }[hex.terrain];
    const civ = state.enemyCivs.find((item) => item.id === hex.enemyCiv);
    ctx.globalAlpha = hex.visible ? 1 : 0.38;
    drawHex(hex, hex.captured ? "#173f4a" : hex.enemyCiv ? `${civ?.color || "#ef476f"}38` : terrainColor,
      hex.captured ? "#63e6ff" : hex.enemyCiv ? civ?.color : isAccessible(hex) ? "#7796a6" : "#294554", hex.captured || hex.enemyCiv || isAccessible(hex) ? 1.7 : 1);
    const center = axialToWorld(hex.q, hex.r);
    if (hex.resource) { ctx.fillStyle = { ore: "#f5b95f", core: "#63e6ff", ruins: "#c8a8ff", garden: "#72ef9f" }[hex.resource]; ctx.font = "800 13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText({ ore: "◆", core: "◈", ruins: "✦", garden: "●" }[hex.resource], center.x + 20, center.y - 17); }
    if (hex.building) { ctx.fillStyle = buildingColor(hex.building); ctx.beginPath(); ctx.arc(center.x, center.y, hex.building === "command" ? 15 : 10, 0, TAU); ctx.fill(); ctx.fillStyle = "#07131c"; ctx.font = "800 9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText({ command: "HQ", outpost: "O", factory: "F", lab: "L", silo: "S" }[hex.building], center.x, center.y + 1); }
    if (hex.enemyStructure) drawEnemyStructure(hex, civ, center);
    ctx.globalAlpha = 1;
  }

  function drawEnemyStructure(hex, civ, center) {
    const structure = hex.enemyStructure; ctx.save(); ctx.translate(center.x, center.y);
    ctx.fillStyle = civ?.color || "#ef476f"; ctx.strokeStyle = "#420b20"; ctx.lineWidth = 3;
    if (structure.type === "capital") {
      ctx.rotate(Math.PI / 4); ctx.fillRect(-14, -14, 28, 28); ctx.strokeRect(-14, -14, 28, 28);
      ctx.rotate(-Math.PI / 4); ctx.fillStyle = "#fff0f5"; ctx.fillRect(-4, -18, 8, 36);
    } else {
      ctx.beginPath(); for (let i = 0; i < 3; i += 1) { const angle = -Math.PI / 2 + i * TAU / 3; const x = Math.cos(angle) * 16; const y = Math.sin(angle) * 16; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fff0f5"; ctx.beginPath(); ctx.arc(0, 2, 5, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = "#1b1118"; ctx.fillRect(-19, -27, 38, 4); ctx.fillStyle = "#72ef9f"; ctx.fillRect(-19, -27, 38 * Math.max(0, structure.hp / structure.maxHp), 4); ctx.restore();
  }

  function drawCapture() {
    if (!state.captureKey || state.captureProgress <= 0) return; const hex = state.hexByKey.get(state.captureKey); if (!hex) return;
    const center = axialToWorld(hex.q, hex.r); const progress = Math.min(1, state.captureProgress / CAPTURE_SECONDS);
    ctx.strokeStyle = "#f4d35e"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(center.x, center.y, view.hexSize * 0.63, -Math.PI / 2, -Math.PI / 2 + TAU * progress); ctx.stroke();
  }

  function drawExpansion() {
    const hex = state.expansionKey && state.hexByKey.get(state.expansionKey);
    if (hex) {
      const center = axialToWorld(hex.q, hex.r); const progress = Math.min(1, state.expansionProgress / EXPANSION_SECONDS);
      ctx.strokeStyle = "rgba(66,217,200,.9)"; ctx.lineWidth = 4; ctx.beginPath();
      ctx.arc(center.x, center.y, view.hexSize * (0.4 + progress * 0.25), -Math.PI / 2, -Math.PI / 2 + TAU * progress); ctx.stroke();
      ctx.strokeStyle = `rgba(66,217,200,${0.12 + progress * 0.28})`; ctx.lineWidth = 2; ctx.beginPath();
      ctx.arc(center.x, center.y, view.hexSize * (0.72 + Math.sin(state.time * 4) * 0.05), 0, TAU); ctx.stroke();
    }
    for (const civ of state.enemyCivs) {
      const target = civ.expansionTarget && state.hexByKey.get(civ.expansionTarget); if (!target?.discovered) continue;
      const point = axialToWorld(target.q, target.r); ctx.strokeStyle = civ.color; ctx.globalAlpha = target.visible ? 0.8 : 0.3;
      ctx.beginPath(); ctx.arc(point.x, point.y, view.hexSize * (0.45 + Math.sin(state.time * 5) * 0.08), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const p = state.player; const blink = p.invulnerable > 0 && Math.floor(p.invulnerable * 20) % 2; const ox = p.x + Math.cos(p.orbitAngle) * 34; const oy = p.y + Math.sin(p.orbitAngle) * 34;
    ctx.strokeStyle = "rgba(99,230,255,.22)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, TAU); ctx.stroke(); ctx.fillStyle = "#63e6ff"; ctx.shadowColor = "#63e6ff"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(ox, oy, 6, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    ctx.globalAlpha = blink ? 0.35 : 1; ctx.fillStyle = "#f7f3e8"; ctx.strokeStyle = "#0d1b25"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, TAU); ctx.fill(); ctx.stroke(); const target = aimPoint(); const angle = Math.atan2(target.y - p.y, target.x - p.x); ctx.strokeStyle = "#ffcf5a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(angle) * 20, p.y + Math.sin(angle) * 20); ctx.stroke(); ctx.globalAlpha = 1;
  }

  function drawEnemy(enemy) { const tile = hexAt(enemy.x, enemy.y); if (!tile?.discovered) return; const civ = state.enemyCivs.find((item) => item.id === enemy.originCiv); ctx.globalAlpha = tile.visible ? 1 : 0.38; ctx.fillStyle = enemy.brute ? "#ff8a8a" : civ?.color || "#dc3e64"; ctx.strokeStyle = "#360d1a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.radius, 0, TAU); ctx.fill(); ctx.stroke(); if (enemy.hp < enemy.maxHp) { ctx.fillStyle = "#1b1118"; ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 8, enemy.radius * 2, 3); ctx.fillStyle = "#72ef9f"; ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 8, enemy.radius * 2 * enemy.hp / enemy.maxHp, 3); } ctx.globalAlpha = 1; }
  function drawProjectile(shot) { ctx.fillStyle = shot.color; ctx.shadowColor = shot.color; ctx.shadowBlur = shot.kind === "orbital" || shot.kind === "missile" ? 14 : 7; ctx.beginPath(); ctx.arc(shot.x, shot.y, shot.radius, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; }
  function drawDrop(drop) { ctx.save(); ctx.translate(drop.x, drop.y); ctx.rotate(drop.t * 2); ctx.fillStyle = "#9b7cff"; ctx.shadowColor = "#9b7cff"; ctx.shadowBlur = 10; ctx.fillRect(-drop.radius, -drop.radius, drop.radius * 2, drop.radius * 2); ctx.restore(); }

  function updateHud() {
    if (!state) return; const p = state.player; const captured = capturedCount(); state.productionRate = productionRate();
    if (ui.healthFill) ui.healthFill.style.width = `${Math.max(0, p.hp / p.maxHp * 100)}%`; if (ui.healthText) ui.healthText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    if (ui.xpFill) ui.xpFill.style.width = `${p.xp / p.nextXp * 100}%`; if (ui.level) ui.level.textContent = p.level; if (ui.territory) ui.territory.textContent = `${captured} / ${CAPTURE_GOAL}`; if (ui.kills) ui.kills.textContent = state.kills;
    if (ui.timer) { const left = Math.max(0, Math.ceil(VICTORY_TIME - state.time)); ui.timer.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`; }
    if (ui.weapon) ui.weapon.textContent = `${Math.round(p.damage)} DMG · ${(1 / p.fireRate).toFixed(1)}/s`; if (ui.auto) ui.auto.textContent = `${Math.round(p.autoDamage)} DMG · ${(1 / p.autoRate).toFixed(1)}/s`;
    if (ui.objective) ui.objective.textContent = `적 수도 3곳 파괴 · 8분 생존 또는 구역 ${CAPTURE_GOAL}개 확보`; if (ui.production) ui.production.textContent = Math.floor(state.production); if (ui.productionRate) ui.productionRate.textContent = `+${state.productionRate.toFixed(1)}/s`;
    const livingCapitals = state.enemyCivs.filter((civ) => !civ.defeated).length;
    if (ui.enemyCapitals) ui.enemyCapitals.textContent = `${livingCapitals} / 3`; if (ui.enemyTerritory) ui.enemyTerritory.textContent = state.hexes.filter((hex) => hex.enemyCiv).length;
    if (ui.enemyPressure) ui.enemyPressure.textContent = state.enemies.length;
    if (ui.expansion) ui.expansion.textContent = buildingCount("outpost") ? `${Math.floor(state.expansionProgress / EXPANSION_SECONDS * 100)}%` : "전초기지 필요";
    const tile = currentBuildTile(); if (ui.terrain) ui.terrain.textContent = tile ? `${terrainName(tile.terrain)}${tile.resource ? ` · ${resourceName(tile.resource)}` : ""}` : "지도 밖";
    if (ui.arsenal) ui.arsenal.textContent = ["Pulse", buildingCount("factory") && "Scatter", buildingCount("lab") && "Rail", buildingCount("silo") && "Missile"].filter(Boolean).join(" / ");
    const capturePercent = state.captureProgress / CAPTURE_SECONDS * 100; if (ui.captureFill) ui.captureFill.style.width = `${Math.min(100, capturePercent)}%`; if (ui.captureLabel) ui.captureLabel.textContent = state.captureKey ? `영토 동기화 ${Math.floor(capturePercent)}%` : "점령 영토와 인접한 미확보 헥스에 진입하세요";
    if (state.menu) updateBuildUi();
  }

  function snapshot() {
    if (!state) return null; const counts = Object.fromEntries(Object.keys(BUILDINGS).map((type) => [type, buildingCount(type)])); counts.command = buildingCount("command");
    const lastProjectile = state.projectiles[state.projectiles.length - 1];
    const structures = enemyStructures(); const origins = {};
    for (const enemy of state.enemies) origins[enemy.originCiv] = (origins[enemy.originCiv] || 0) + 1;
    return Object.freeze({ running: state.running, paused: state.paused, choosing: state.choosing, menu: state.menu, ended: state.ended, won: state.won,
      time: Number(state.time.toFixed(2)), hp: Number(state.player.hp.toFixed(1)), maxHp: state.player.maxHp, x: Number(state.player.x.toFixed(1)), y: Number(state.player.y.toFixed(1)),
      camera: Object.freeze({ x: Number(state.camera.x.toFixed(1)), y: Number(state.camera.y.toFixed(1)) }), mapTiles: state.hexes.length,
      discovered: state.hexes.filter((hex) => hex.discovered).length, level: state.player.level, xp: state.player.xp, kills: state.kills, territory: capturedCount(), enemies: state.enemies.length,
      production: Number(state.production.toFixed(1)), productionRate: Number(state.productionRate.toFixed(2)), buildings: Object.freeze(counts),
      enemyCivs: Object.freeze(state.enemyCivs.map((civ) => Object.freeze({ id: civ.id, defeated: civ.defeated, capital: `${civ.q},${civ.r}`, expansionTarget: civ.expansionTarget }))),
      enemyCapitals: state.enemyCivs.filter((civ) => !civ.defeated).length, enemyTerritory: state.hexes.filter((hex) => hex.enemyCiv).length,
      neutralizedEnemyTiles: Object.freeze(state.hexes.filter((hex) => hex.enemyNeutralized && !hex.captured).map((hex) => hex.key)),
      spawnStructures: structures.filter((hex) => hex.enemyStructure.type === "foundry").length,
      enemyOrigins: Object.freeze(origins), structureHp: Object.freeze(structures.map((hex) => Object.freeze({ key: hex.key, civ: hex.enemyCiv,
        type: hex.enemyStructure.type, hp: Number(hex.enemyStructure.hp.toFixed(1)), maxHp: hex.enemyStructure.maxHp }))),
      enemyUnits: Object.freeze(state.enemies.map((enemy) => Object.freeze({ id: enemy.id, civ: enemy.originCiv, origin: enemy.originStructure, originKey: enemy.originKey,
        x: Number(enemy.x.toFixed(1)), y: Number(enemy.y.toFixed(1)) }))),
      weapons: Object.freeze(["pulse", buildingCount("factory") && "scatter", buildingCount("lab") && "rail", buildingCount("silo") && "missile", "orbital"].filter(Boolean)),
      projectiles: state.projectiles.length, projectileKinds: Object.freeze([...new Set(state.projectiles.map((shot) => shot.kind))]),
      projectileVelocity: lastProjectile ? Object.freeze({ vx: Number(lastProjectile.vx.toFixed(1)), vy: Number(lastProjectile.vy.toFixed(1)) }) : null,
      captureProgress: Number(state.captureProgress.toFixed(2)), expansionKey: state.expansionKey,
      expansionProgress: Number((state.expansionProgress / EXPANSION_SECONDS).toFixed(3)) });
  }

  function step(seconds) { let remaining = Math.max(0, Number(seconds) || 0); while (remaining > 0) { const dt = Math.min(0.05, remaining); update(dt); remaining -= dt; } return snapshot(); }
  function debugDamageStructure(civId, type = "capital", damage = 9999) {
    const hex = enemyStructures(civId).find((item) => item.enemyStructure.type === type);
    return Boolean(hex && damageEnemyStructure(hex, Math.max(0, Number(damage) || 0)));
  }
  function debugSpawnEnemy(civId, type = "foundry") {
    const civ = state.enemyCivs.find((item) => item.id === civId); const hex = enemyStructures(civId).find((item) => item.enemyStructure.type === type);
    return spawnEnemyAt(hex, civ);
  }
  function debugExpandEnemy(civId) { return expandEnemyCiv(state.enemyCivs.find((item) => item.id === civId)); }
  function frame(now) { const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now; update(dt); render(); animationFrame = requestAnimationFrame(frame); }

  function clearTouchInput() { touchMove.pointerId = null; touchMove.x = 0; touchMove.y = 0; touchAim.pointerId = null; touchAim.active = false; if (ui.touchStickKnob) ui.touchStickKnob.style.transform = "translate(-50%, -50%)"; }
  function updateTouchMove(event) { if (!ui.touchStick || event.pointerId !== touchMove.pointerId) return; const rect = ui.touchStick.getBoundingClientRect(); const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.34); let x = event.clientX - (rect.left + rect.width / 2); let y = event.clientY - (rect.top + rect.height / 2); const distance = Math.hypot(x, y); if (distance > radius) { x *= radius / distance; y *= radius / distance; } touchMove.x = x / radius; touchMove.y = y / radius; if (ui.touchStickKnob) ui.touchStickKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`; }
  function updateTouchAim(event) { if (!ui.touchFire || event.pointerId !== touchAim.pointerId) return; const rect = ui.touchFire.getBoundingClientRect(); const x = event.clientX - (rect.left + rect.width / 2); const y = event.clientY - (rect.top + rect.height / 2); const distance = Math.hypot(x, y); const deadzone = Math.min(rect.width, rect.height) * 0.12; if (distance > deadzone) { touchAim.dirX = x / distance; touchAim.dirY = y / distance; } }

  function bindTouchControls() {
    ui.touchStick?.addEventListener("pointerdown", (event) => { if (touchMove.pointerId !== null) return; event.preventDefault(); touchMove.pointerId = event.pointerId; ui.touchStick.setPointerCapture?.(event.pointerId); updateTouchMove(event); });
    ui.touchStick?.addEventListener("pointermove", (event) => { if (event.pointerId === touchMove.pointerId) { event.preventDefault(); updateTouchMove(event); } });
    const releaseMove = (event) => { if (event.pointerId !== touchMove.pointerId) return; touchMove.pointerId = null; touchMove.x = 0; touchMove.y = 0; if (ui.touchStickKnob) ui.touchStickKnob.style.transform = "translate(-50%, -50%)"; };
    ui.touchStick?.addEventListener("pointerup", releaseMove); ui.touchStick?.addEventListener("pointercancel", releaseMove); ui.touchStick?.addEventListener("lostpointercapture", releaseMove);
    ui.touchFire?.addEventListener("pointerdown", (event) => { if (touchAim.pointerId !== null) return; event.preventDefault(); touchAim.pointerId = event.pointerId; touchAim.active = true; ui.touchFire.setPointerCapture?.(event.pointerId); updateTouchAim(event); manualShoot(); });
    ui.touchFire?.addEventListener("pointermove", (event) => { if (event.pointerId === touchAim.pointerId) { event.preventDefault(); updateTouchAim(event); } });
    const releaseAim = (event) => { if (event.pointerId !== touchAim.pointerId) return; touchAim.pointerId = null; touchAim.active = false; };
    ui.touchFire?.addEventListener("pointerup", releaseAim); ui.touchFire?.addEventListener("pointercancel", releaseAim); ui.touchFire?.addEventListener("lostpointercapture", releaseAim);
  }

  window.addEventListener("resize", resize); window.addEventListener("blur", () => { keys.clear(); clearTouchInput(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { keys.clear(); clearTouchInput(); togglePause(true); } });
  window.addEventListener("keydown", (event) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyB"].includes(event.code)) event.preventDefault();
    if (event.code === "Escape" && state.menu) { closeBuildMenu(); return; }
    if (event.code === "Escape" || event.code === "KeyP") { togglePause(); return; }
    if (event.code === "KeyB") { openBuildMenu(); return; }
    if (event.code === "Space") { manualShoot(); return; } keys.add(event.code);
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  canvas.addEventListener("pointermove", (event) => { pointer.clientX = event.clientX; pointer.clientY = event.clientY; pointer.inside = true; });
  canvas.addEventListener("pointerleave", () => { pointer.inside = false; });
  canvas.addEventListener("pointerdown", (event) => { if (event.button === 0) { pointer.clientX = event.clientX; pointer.clientY = event.clientY; pointer.inside = true; manualShoot(); canvas.focus(); } });
  ui.start?.addEventListener("click", startGame); ui.restart?.addEventListener("click", startGame); ui.resume?.addEventListener("click", () => togglePause(false)); ui.playAgain?.addEventListener("click", startGame); ui.victoryRestart?.addEventListener("click", startGame); ui.pauseButton?.addEventListener("click", () => togglePause());
  ui.buildButton?.addEventListener("click", openBuildMenu); ui.buildCancel?.addEventListener("click", closeBuildMenu);
  for (const type of Object.keys(BUILDINGS)) ui[`build${type[0].toUpperCase()}${type.slice(1)}`]?.addEventListener("click", () => build(type));
  bindTouchControls();

  window.__HEXFRONT_DEBUG__ = Object.freeze({ snapshot, reset: () => reset(true), step, build,
    damageEnemyStructure: debugDamageStructure, spawnEnemy: debugSpawnEnemy, expandEnemy: debugExpandEnemy });
  resize(); reset(!ui.start); cancelAnimationFrame(animationFrame); animationFrame = requestAnimationFrame(frame);
})();
