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
    science: $("science-value"), scienceRate: $("science-rate"), militaryProgress: $("military-progress"), scienceProgress: $("science-progress"),
    selectedTile: $("selected-tile-value"), selectedAction: $("selected-action-value"),
    foundBase: $("found-base-button"), shipButton: $("ship-button"), shipStatus: $("ship-status"),
    defenseStatus: $("defense-status"), capitalCycle: $("capital-cycle-status"),
    techButton: $("tech-button"), techOverlay: $("tech-overlay"), techFrontier: $("tech-frontier"),
    techUrban: $("tech-urban"), techAerospace: $("tech-aerospace"), techSiege: $("tech-siege"), techClose: $("tech-close"),
    victoryTitle: $("victory-title"), victoryCopy: $("victory-copy"),
    augment: $("augment-overlay"), augmentOptions: $("augment-options"), pause: $("pause-overlay"),
    gameOver: $("game-over-overlay"), victory: $("victory-overlay"),
    start: $("start-button"), restart: $("restart-button"), resume: $("resume-button"),
    playAgain: $("play-again-button"), victoryRestart: $("victory-restart-button"),
    touchStick: $("touch-stick"), touchStickKnob: $("touch-stick-knob"), pauseButton: $("pause-button"),
    buildButton: $("build-button"), buildOverlay: $("build-overlay"), buildTileInfo: $("build-tile-info"),
    buildCancel: $("build-cancel"), buildOutpost: $("build-outpost"), buildFactory: $("build-factory"),
    buildLab: $("build-lab"), buildSilo: $("build-silo")
  };

  const TAU = Math.PI * 2;
  const MAP_RADIUS = 12;
  const WILD_CAP = 14;
  const CIV_UNIT_CAP = 30;
  const WILD_SPAWN_INTERVAL = 12;
  const CLAIM_STAGE_SECONDS = 10;
  const SIEGE_STAGE_SECONDS = 15;
  const TECHS = Object.freeze({ frontier: 25, urban: 30, aerospace: 60, siege: 70 });
  const TERRAIN_MODIFIERS = Object.freeze({
    plain: { move: 1, claim: 1, defense: 1, vision: 0, industry: 0, label: "표준 지형" },
    ridge: { move: 0.92, claim: 1.05, defense: 0.82, vision: 1, industry: 0, label: "방어 -18% · 시야 +1" },
    crater: { move: 0.9, claim: 1.1, defense: 1, vision: 0, industry: 2, label: "산업 펄스 +2" },
    dunes: { move: 0.82, claim: 1.25, defense: 1, vision: 0, industry: 0, label: "이동 -18% · 점령 +25%" }
  });
  const HEX_DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const BUILDINGS = Object.freeze({ outpost: 30, factory: 40, lab: 45, silo: 55 });
  const ENEMY_CIVS = Object.freeze([
    { id: "ember", name: "EMBER", color: "#ef476f", q: 10, r: 0, guardians: [[9, 0], [10, -1], [9, 1]] },
    { id: "violet", name: "VIOLET", color: "#d16bff", q: -10, r: 10, guardians: [[-9, 9], [-10, 9], [-9, 10]] },
    { id: "crimson", name: "CRIMSON", color: "#ff6b8a", q: 0, r: -10, guardians: [[0, -9], [1, -10], [-1, -9]] }
  ]);
  const keys = new Set();
  const pointer = { clientX: 0, clientY: 0, inside: false };
  const touchMove = { pointerId: null, x: 0, y: 0 };
  let view = { width: 0, height: 0, dpr: 1, scale: 1, hexSize: 62, cx: 0, cy: 0 };
  let state;
  let lastFrame = performance.now();
  let animationFrame = 0;

  const AUGMENTS = [
    { id: "charged-rounds", category: "combat", title: "과충전 탄환", text: "자동 주무기 피해 +35%", apply: (s) => { s.player.damage *= 1.35; } },
    { id: "rapid-reload", category: "combat", title: "급속 장전", text: "자동 주무기 발사 간격 -22%", apply: (s) => { s.player.fireRate *= 0.78; } },
    { id: "piercing-core", category: "combat", title: "관통 코어", text: "탄환 관통 +1", apply: (s) => { s.player.pierce += 1; } },
    { id: "reactor-sync", category: "combat", title: "반응로 동기화", text: "자동 펄스 속도 +25%", apply: (s) => { s.player.autoRate *= 0.75; } },
    { id: "amplified-pulse", category: "combat", title: "증폭 펄스", text: "자동 공격 피해 +40%", apply: (s) => { s.player.autoDamage *= 1.4; } },
    { id: "targeting-array", category: "combat", title: "표적 연산기", text: "자동 주무기 사거리 +15%", apply: (s) => { s.player.attackRange *= 1.15; } },
    { id: "mobile-armor", category: "combat", title: "기동 장갑", text: "이동 속도 +15%, 최대 체력 +12", apply: (s) => { s.player.speed *= 1.15; s.player.maxHp += 12; s.player.hp += 12; } },
    { id: "field-repair", category: "combat", title: "응급 수복", text: "체력을 모두 회복하고 재생 +0.5/s", apply: (s) => { s.player.hp = s.player.maxHp; s.player.regen += 0.5; } },
    { id: "phase-warhead", category: "combat", title: "위상 탄두", text: "탄환 크기와 속도 +25%", apply: (s) => { s.player.shotSize *= 1.25; s.player.shotSpeed *= 1.25; } },
    { id: "chain-lightning", category: "combat", title: "연쇄 번개", text: "주기적으로 최대 3개의 적을 연쇄 타격", apply: (s) => { s.player.chainLevel += 1; s.player.chainClock = 0; } },
    { id: "proximity-mines", category: "combat", title: "근접 지뢰", text: "주기적으로 광역 지뢰 설치", apply: (s) => { s.player.mineLevel += 1; s.player.mineClock = 0; } }
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
          building: q === 0 && r === 0 ? "command" : null, baseLevel: q === 0 && r === 0 ? 1 : 0, baseGrowth: 0,
          baseHp: q === 0 && r === 0 ? 200 : 0, baseMaxHp: q === 0 && r === 0 ? 200 : 0, defenseClock: 0, turretClock: 0,
          claimStage: 0, claimProgress: 0, claimFunded: false, enemyCiv: null, enemyStructure: null, enemyNeutralized: false,
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
      for (const hex of targetState.hexes) if (hexDistance(hex, civ) <= 2 && !hex.captured) hex.enemyCiv = civ.id;
      capital.enemyStructure = { type: "capital", hp: 1500, maxHp: 1500, level: 1, growthClock: 70, breached: false,
        spawnClock: 3 + targetState.enemyCivs.indexOf(civ), barrageClock: 2.5, barrageAngle: 0 };
      civ.guardians.forEach(([q, r], guardianIndex) => {
        const guardian = targetState.hexByKey.get(`${q},${r}`); guardian.enemyCiv = civ.id;
        guardian.enemyStructure = { type: guardianIndex === 0 ? "foundry" : "guardian", hp: 550, maxHp: 550, level: 1,
          growthClock: 70, spawnClock: 1.5 + targetState.enemyCivs.indexOf(civ) * 0.7 + guardianIndex * 0.5, barrageClock: 2 + guardianIndex * 0.35, barrageAngle: guardianIndex };
      });
    }
  }

  function freshState(running = true) {
    const hexes = makeHexes();
    const s = {
      running, paused: !running, ended: false, choosing: false, menu: false, won: false, victoryType: null,
      time: 0, selectedKey: null, activeOrder: null, assaultClock: 55, assaultId: 0, assault: null,
      capitalProductionClock: 10, capitalScienceClock: 15, capitalProductionPulses: 0, capitalSciencePulses: 0,
      kills: 0, production: 25, productionRate: 0, productionMultiplier: 1, expansionMultiplier: 1,
      science: 0, scienceRate: 0, scienceMultiplier: 1, enemyId: 0, wildSpawnClock: 8, wildSpawnIndex: 0,
      augmentLevels: {}, augmentChoices: [], techs: { frontier: false, urban: false, aerospace: false, siege: false }, ship: null,
      siegeLockMessageClock: 0,
      camera: { x: 0, y: 0 }, hexes, hexByKey: new Map(hexes.map((hex) => [hex.key, hex])),
      enemies: [], projectiles: [], enemyShots: [], particles: [], messages: [],
      player: { x: 0, y: 0, radius: 13, speed: 210, hp: 100, maxHp: 100, regen: 0,
        level: 1, xp: 0, nextXp: 18, damage: 4, fireRate: 0.26, fireClock: 0,
        shotSpeed: 590, shotSize: 5, pierce: 0, autoDamage: 5, autoRate: 0.82,
        autoClock: 0.35, railClock: 1.2, missileClock: 1.7, chainLevel: 0, chainClock: 0,
        mineLevel: 0, mineClock: 0, attackRange: 1, invulnerable: 0, orbitAngle: 0 }
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
    setOverlay(ui.victory, false); setOverlay(ui.buildOverlay, false); setOverlay(ui.techOverlay, false);
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

  function terrainModifiers(hexOrType) { return TERRAIN_MODIFIERS[typeof hexOrType === "string" ? hexOrType : hexOrType?.terrain] || TERRAIN_MODIFIERS.plain; }

  function isAccessible(hex) { return Boolean(hex && !hex.captured && !hex.enemyCiv && neighbors(hex).some((item) => item.captured)); }
  function capturedCount() { return state.hexes.filter((hex) => hex.captured).length; }
  function buildingCount(type) { return state.hexes.filter((hex) => hex.building === type).length; }
  function enemyTerritoryCount(civId) { return state.hexes.filter((hex) => hex.enemyCiv === civId).length; }
  function enemyStructures(civId) { return state.hexes.filter((hex) => hex.enemyStructure && (!civId || hex.enemyCiv === civId)); }

  function revealAround(targetState, q, r, radius) {
    visitAround(targetState, q, r, radius, (hex) => { hex.discovered = true; });
  }

  function visitAround(targetState, q, r, radius, callback) {
    for (let dq = -radius; dq <= radius; dq += 1) {
      const minDr = Math.max(-radius, -dq - radius); const maxDr = Math.min(radius, -dq + radius);
      for (let dr = minDr; dr <= maxDr; dr += 1) { const hex = targetState.hexByKey.get(`${q + dq},${r + dr}`); if (hex) callback(hex); }
    }
  }

  function updateVisibility() {
    for (const hex of state.hexes) hex.visible = false;
    const playerHex = hexAt(state.player.x, state.player.y);
    if (playerHex) {
      const radius = 2 + terrainModifiers(playerHex).vision; visitAround(state, playerHex.q, playerHex.r, radius, (hex) => { hex.discovered = true; hex.visible = true; });
    }
    for (const source of state.hexes.filter((hex) => hex.captured)) {
      const radius = 1 + terrainModifiers(source).vision; visitAround(state, source.q, source.r, radius, (hex) => { hex.discovered = true; hex.visible = true; });
    }
  }

  function capitalProductionYield() {
    const hq = state.hexes.find((hex) => hex.building === "command"); if (!hq) return 0;
    const levelScale = 1 + (hq.baseLevel - 1) * 0.25;
    const terrain = state.hexes.filter((hex) => hex.captured).reduce((sum, hex) => sum + terrainModifiers(hex).industry, 0);
    const ore = state.hexes.filter((hex) => hex.captured && hex.resource === "ore").length;
    return (12 * levelScale + terrain + ore * 2 + buildingCount("factory") * 5) * state.productionMultiplier;
  }

  function capitalScienceYield() {
    const ruins = state.hexes.filter((hex) => hex.captured && hex.resource === "ruins").length;
    const hq = state.hexes.find((hex) => hex.building === "command"); if (!hq) return 0;
    const levelScale = 1 + (hq.baseLevel - 1) * 0.25;
    return (6 * levelScale + buildingCount("lab") * 3 + ruins * 2) * state.scienceMultiplier;
  }

  function productionRate() { return capitalProductionYield() / 10; }
  function scienceRate() { return capitalScienceYield() / 15; }

  function updateCapitalEconomy(dt) {
    const hq = state.hexes.find((hex) => hex.building === "command"); if (!hq) return;
    state.capitalProductionClock -= dt; state.capitalScienceClock -= dt;
    if (state.capitalProductionClock <= 0) { state.production += capitalProductionYield(); state.capitalProductionClock += 10; state.capitalProductionPulses += 1; }
    if (state.capitalScienceClock <= 0) { state.science += capitalScienceYield(); state.capitalScienceClock += 15; state.capitalSciencePulses += 1; }
  }

  function update(dt) {
    if (!state.running || state.paused || state.choosing || state.menu || state.ended) return;
    state.time += dt; state.siegeLockMessageClock = Math.max(0, state.siegeLockMessageClock - dt); state.productionRate = productionRate(); state.scienceRate = scienceRate();
    updateCapitalEconomy(dt);
    updatePlayer(dt); updateVisibility(); updateOrders(dt); updateBaseGrowth(dt); updateShip(dt); updateBuildingWeapons(dt); updateBaseTurrets(dt);
    updateEnemyCivs(dt); updateAssault(dt); updateWildEnemies(dt); updateEnemies(dt); updateProjectiles(dt); updateEnemyShots(dt); updateParticles(dt);
    state.camera.x += (state.player.x - state.camera.x) * Math.min(1, dt * 8);
    state.camera.y += (state.player.y - state.camera.y) * Math.min(1, dt * 8);
    if (state.enemyCivs.every((civ) => civ.defeated)) finish(true, "military");
    updateHud();
  }

  function updatePlayer(dt) {
    const p = state.player;
    let dx = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    let dy = (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
    dx += touchMove.x; dy += touchMove.y;
    if (dx || dy) {
      const length = Math.hypot(dx, dy); dx /= length; dy /= length;
      const terrain = hexAt(p.x, p.y); const moveScale = terrainModifiers(terrain).move;
      const oldX = p.x; const oldY = p.y; p.x += dx * p.speed * moveScale * dt; p.y += dy * p.speed * moveScale * dt;
      if (!hexAt(p.x, p.y)) { p.x = oldX; p.y = oldY; }
    }
    p.fireClock = Math.max(0, p.fireClock - dt); p.autoClock -= dt; p.railClock -= dt; p.missileClock -= dt;
    p.chainClock -= dt; p.mineClock -= dt;
    p.invulnerable = Math.max(0, p.invulnerable - dt); p.orbitAngle += dt * 2.8;
    const gardenRegen = state.hexes.filter((h) => h.captured && h.resource === "garden").length * 0.06;
    p.hp = Math.min(p.maxHp, p.hp + (p.regen + gardenRegen) * dt);
    if (p.fireClock <= 0) autoPrimary(); if (p.autoClock <= 0) autoAttack();
    if (p.chainLevel > 0 && p.chainClock <= 0) chainLightning();
    if (p.mineLevel > 0 && p.mineClock <= 0) deployMine();
  }

  function aimPoint() { return nearestHostile(view.hexSize * 5.5 * state.player.attackRange) || { x: state.player.x + 1, y: state.player.y }; }

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
      if (hex.enemyStructure.breached) continue;
      if (!hex.discovered) continue;
      const center = axialToWorld(hex.q, hex.r); const d = Math.hypot(center.x - state.player.x, center.y - state.player.y);
      if (d <= structureRange && d < distance) { best = { combatId: `structure:${hex.key}`, structureKey: hex.key, x: center.x, y: center.y }; distance = d; }
    }
    return best;
  }

  function addProjectile(kind, x, y, angle, speed, radius, damage, life, pierce, color, extra = {}) {
    state.projectiles.push({ kind, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius, damage, life, pierce, color, hit: new Set(), originX: x, originY: y, traveled: 0,
      maxRange: speed > 0 ? speed * life : null, ...extra });
  }

  function autoPrimary() {
    const p = state.player; const target = nearestHostile(view.hexSize * 5.5 * p.attackRange); p.fireClock = p.fireRate;
    if (!target) return false;
    const angle = Math.atan2(target.y - p.y, target.x - p.x);
    addProjectile("pulse", p.x, p.y, angle, p.shotSpeed, p.shotSize, p.damage, 1.25, p.pierce, "#ffcf5a", { maxRange: view.hexSize * 5.75 });
    const factories = buildingCount("factory");
    for (let i = 0; i < factories; i += 1) {
      const spread = 0.1 + i * 0.045;
      addProjectile("scatter", p.x, p.y, angle - spread, p.shotSpeed * 0.9, p.shotSize * 0.75, p.damage * 0.42, 1.05, 0, "#ff9f43", { maxRange: view.hexSize * 4.5 });
      addProjectile("scatter", p.x, p.y, angle + spread, p.shotSpeed * 0.9, p.shotSize * 0.75, p.damage * 0.42, 1.05, 0, "#ff9f43", { maxRange: view.hexSize * 4.5 });
    }
    return true;
  }

  function autoAttack() {
    const p = state.player; const target = nearestHostile(view.hexSize * 5.5 * p.attackRange); p.autoClock = p.autoRate;
    if (!target) return;
    const x = p.x + Math.cos(p.orbitAngle) * 34; const y = p.y + Math.sin(p.orbitAngle) * 34;
    addProjectile("orbital", x, y, Math.atan2(target.y - y, target.x - x), 420, 8, p.autoDamage, 1.4, 1, "#63e6ff", { maxRange: view.hexSize * 5.5 });
    burst(x, y, "#63e6ff", 5);
  }

  function chainLightning() {
    const p = state.player; p.chainClock = Math.max(1.4, 3.8 - p.chainLevel * 0.35);
    const targets = state.enemies.map((enemy) => ({ ...enemy, combatId: `enemy:${enemy.id}` }))
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    if (!targets.length) {
      const structure = nearestHostile(view.hexSize * 5.5);
      if (structure?.structureKey) targets.push(structure);
    }
    let from = { x: p.x, y: p.y }; let hits = 0;
    for (const target of targets) {
      if (hits >= Math.min(5, 2 + p.chainLevel) || Math.hypot(target.x - from.x, target.y - from.y) > view.hexSize * 3.2) continue;
      state.particles.push({ kind: "line", x: from.x, y: from.y, x2: target.x, y2: target.y, life: 0.16, maxLife: 0.16, color: "#9ffcff", size: 3 });
      if (target.structureKey) damageEnemyStructure(state.hexByKey.get(target.structureKey), 20 * (1 + p.chainLevel * 0.3));
      else {
        const index = state.enemies.findIndex((enemy) => enemy.id === target.id);
        if (index >= 0) { state.enemies[index].hp -= 20 * (1 + p.chainLevel * 0.3); if (state.enemies[index].hp <= 0) killEnemy(index); }
      }
      from = target; hits += 1;
    }
  }

  function deployMine() {
    const p = state.player; p.mineClock = Math.max(2.2, 5.2 - p.mineLevel * 0.45);
    addProjectile("mine", p.x, p.y, 0, 0, 9, 34 * (1 + p.mineLevel * 0.28), 7.5, 0, "#72ef9f", { aoe: 62 + p.mineLevel * 5 });
  }

  function updateBuildingWeapons() {
    const p = state.player; const target = nearestHostile(view.hexSize * 7.5);
    if (buildingCount("lab") > 0 && p.railClock <= 0) {
      p.railClock = Math.max(0.8, 3.2 / buildingCount("lab"));
      if (target) addProjectile("rail", p.x, p.y, Math.atan2(target.y - p.y, target.x - p.x), 980, 4, 34, 1.35, 5, "#c8a8ff", { maxRange: view.hexSize * 7.5 });
    }
    if (buildingCount("silo") > 0 && p.missileClock <= 0) {
      p.missileClock = Math.max(1.2, 4.8 / buildingCount("silo"));
      if (target) addProjectile("missile", p.x, p.y, Math.atan2(target.y - p.y, target.x - p.x), 250, 7, 42, 4, 0, "#ff6b6b", { targetId: target.id, targetStructureKey: target.structureKey, homing: true, aoe: 58, maxRange: view.hexSize * 7.5 });
    }
  }

  function baseTurretStats(level) {
    return { range: view.hexSize * (2.2 + level * 0.45), damage: 10 + level * 8, rate: 1.25 - level * 0.2 };
  }

  function baseTurretTarget(base, range) {
    const center = axialToWorld(base.q, base.r);
    return state.enemies.filter((enemy) => Math.hypot(enemy.x - center.x, enemy.y - center.y) <= range)
      .sort((a, b) => Number(b.targetBaseKey === base.key) - Number(a.targetBaseKey === base.key) ||
        Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))[0] || null;
  }

  function updateBaseTurrets(dt) {
    for (const base of playerBases()) {
      base.turretClock = Math.max(0, (base.turretClock || 0) - dt);
      if (base.turretClock > 0) continue;
      const stats = baseTurretStats(base.baseLevel); const target = baseTurretTarget(base, stats.range);
      if (!target) continue;
      const center = axialToWorld(base.q, base.r); const angle = Math.atan2(target.y - center.y, target.x - center.x);
      addProjectile("base", center.x, center.y, angle, 520, 5, stats.damage, 1.2, 0, "#72ef9f",
        { maxRange: stats.range, sourceBaseKey: base.key, targetId: target.id, priorityAssault: target.targetBaseKey === base.key });
      base.turretClock = stats.rate;
    }
  }

  function updateEnemies(dt) {
    const p = state.player;
    for (const enemy of state.enemies) {
      const base = enemy.targetBaseKey && state.hexByKey.get(enemy.targetBaseKey);
      const target = base?.baseLevel ? axialToWorld(base.q, base.r) : p;
      const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
      enemy.x += Math.cos(angle) * enemy.speed * dt; enemy.y += Math.sin(angle) * enemy.speed * dt; enemy.touch -= dt;
      if (base?.baseLevel && Math.hypot(enemy.x - target.x, enemy.y - target.y) < enemy.radius + 16 && enemy.touch <= 0) { enemy.touch = 0.65; damageBase(base, enemy.damage); }
      else if (Math.hypot(enemy.x - p.x, enemy.y - p.y) < enemy.radius + p.radius && enemy.touch <= 0) { enemy.touch = 0.65; hurtPlayer(enemy.damage); }
    }
  }

  function spawnEnemyAt(hex, civ, extra = {}) {
    if (!hex?.enemyStructure || civ.defeated) return false;
    if (state.enemies.filter((enemy) => enemy.originCiv === civ.id).length >= CIV_UNIT_CAP) return false;
    const center = axialToWorld(hex.q, hex.r); const territoryScale = 1 + Math.max(0, enemyTerritoryCount(civ.id) - 7) * 0.018;
    const difficulty = (1 + state.time / 420) * territoryScale;
    const brute = coordinateHash(state.enemyId + civ.q, Math.floor(state.time) + civ.r) < Math.min(0.22, state.time / 900);
    const hp = (brute ? 72 : 32) * difficulty;
    state.enemies.push({ id: ++state.enemyId, originCiv: civ.id, originStructure: hex.enemyStructure.type, originKey: hex.key,
      x: center.x, y: center.y, radius: brute ? 18 : 12, speed: (brute ? 54 : 80) + Math.min(18, state.time / 35),
      hp, maxHp: hp, damage: brute ? 16 : 10, xp: brute ? 8 : 4, touch: 0, brute, ...extra });
    if (hex.discovered) {
      burst(center.x, center.y, civ.color, 14);
      state.messages.push({ text: `${civ.name} 출격`, x: center.x, y: center.y - 20, life: 1.25 });
    }
    return true;
  }

  function triggerAssault(forcedKey) {
    if (state.assault) return false;
    const bases = playerBases(); const structures = enemyStructures().filter((hex) => !hex.enemyStructure.breached);
    const target = forcedKey ? state.hexByKey.get(forcedKey) : bases[Math.floor(state.time / 90) % Math.max(1, bases.length)];
    if (!target?.baseLevel || !structures.length) return false;
    const id = ++state.assaultId; let spawned = 0;
    for (let i = 0; i < 12; i += 1) {
      const source = structures[i % structures.length]; const civ = state.enemyCivs.find((item) => item.id === source.enemyCiv);
      if (spawnEnemyAt(source, civ, { assaultId: id, targetBaseKey: target.key })) spawned += 1;
    }
    if (!spawned) return false;
    state.assault = { id, targetKey: target.key, total: spawned, result: null }; target.defenseClock = 4;
    const center = axialToWorld(target.q, target.r); state.messages.push({ text: "대규모 공세 감지", x: center.x, y: center.y - 28, life: 3 });
    return true;
  }

  function completeAssault() {
    const assault = state.assault; if (!assault) return;
    const base = state.hexByKey.get(assault.targetKey);
    if (base?.baseLevel) {
      base.baseGrowth += 25; base.baseHp = Math.min(base.baseMaxHp, base.baseHp + 45);
      state.production += 40; state.science += 12;
      const center = axialToWorld(base.q, base.r); state.messages.push({ text: "공세 방어 성공 · 산업 +40 · 과학 +12", x: center.x, y: center.y - 28, life: 3 });
    }
    state.assault = null; state.assaultClock = 90;
  }

  function updateAssault(dt) {
    if (state.assault) {
      if (!state.enemies.some((enemy) => enemy.assaultId === state.assault.id)) completeAssault();
      return;
    }
    state.assaultClock -= dt;
    if (state.assaultClock <= 0) { if (!triggerAssault()) state.assaultClock = 15; }
  }

  function damageBase(base, amount) {
    if (!base?.baseLevel) return;
    base.defenseClock = 2; base.baseHp -= amount * (1 - (base.baseLevel - 1) * 0.12) * terrainModifiers(base).defense;
    if (base.baseHp > 0) return;
    base.baseLevel = Math.max(1, base.baseLevel - 1); base.baseGrowth = 0; base.baseMaxHp = base.building === "command" ? 200 + (base.baseLevel - 1) * 50 : 120 + (base.baseLevel - 1) * 50; base.baseHp = base.baseMaxHp * 0.35;
    if (state.assault?.targetKey === base.key) {
      for (const enemy of state.enemies) if (enemy.assaultId === state.assault.id) { enemy.assaultId = null; enemy.targetBaseKey = null; }
      state.assault = null; state.assaultClock = 90;
    }
  }

  function spawnWildEnemy(forcedHex) {
    const wildCount = state.enemies.filter((enemy) => enemy.originCiv === "wild").length;
    if (wildCount >= WILD_CAP) return false;
    const playerHex = hexAt(state.player.x, state.player.y);
    const eligible = state.hexes.filter((hex) => !hex.captured && !hex.enemyCiv && !hex.enemyNeutralized &&
      (!playerHex || (hexDistance(hex, playerHex) >= 3 && hexDistance(hex, playerHex) <= 6)));
    if (!eligible.length) return false;
    const ordered = eligible.sort((a, b) => coordinateHash(a.q + state.wildSpawnIndex * 7, a.r - state.wildSpawnIndex * 11) -
      coordinateHash(b.q + state.wildSpawnIndex * 7, b.r - state.wildSpawnIndex * 11));
    const hex = forcedHex && eligible.includes(forcedHex) ? forcedHex : ordered[0];
    const center = axialToWorld(hex.q, hex.r); const scale = 1 + state.time / 600; const hp = 26 * scale;
    state.enemies.push({ id: ++state.enemyId, originCiv: "wild", originStructure: "wild", originKey: hex.key,
      x: center.x, y: center.y, radius: 11, speed: 72 + Math.min(15, state.time / 45), hp, maxHp: hp,
      damage: 8, xp: 3, touch: 0, brute: false, wild: true });
    state.wildSpawnIndex += 1;
    if (hex.discovered) burst(center.x, center.y, "#f5b95f", 9);
    return true;
  }

  function updateWildEnemies(dt) {
    state.wildSpawnClock -= dt;
    if (state.wildSpawnClock > 0) return;
    spawnWildEnemy(); state.wildSpawnClock = WILD_SPAWN_INTERVAL;
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

  function fireCapitalBarrage(hex, civ) {
    const structure = hex.enemyStructure; const center = axialToWorld(hex.q, hex.r);
    const aim = Math.atan2(state.player.y - center.y, state.player.x - center.x) + Math.sin(structure.barrageAngle) * 0.24;
    for (let i = -4; i <= 4; i += 1) {
      const angle = aim + i * 0.14; state.enemyShots.push({ x: center.x, y: center.y, vx: Math.cos(angle) * 205,
        vy: Math.sin(angle) * 205, radius: 6, damage: 12 + (structure.level - 1) * 2, life: 5, color: civ.color,
        originX: center.x, originY: center.y, traveled: 0, maxRange: view.hexSize * 5.2 });
    }
    structure.barrageAngle += 0.7; structure.barrageClock = Math.max(2.2, 3.4 - structure.level * 0.25);
    burst(center.x, center.y, civ.color, 18);
  }

  function fireGuardianBarrage(hex, civ) {
    const structure = hex.enemyStructure; const center = axialToWorld(hex.q, hex.r); const aim = Math.atan2(state.player.y - center.y, state.player.x - center.x);
    for (let i = -2; i <= 2; i += 1) { const angle = aim + i * 0.16; state.enemyShots.push({ x: center.x, y: center.y, vx: Math.cos(angle) * 235,
      vy: Math.sin(angle) * 235, radius: 7, damage: 15 + structure.level * 3, life: 4, color: civ.color,
      originX: center.x, originY: center.y, traveled: 0, maxRange: view.hexSize * 3.4 }); }
    structure.barrageClock = Math.max(1.35, 2.25 - structure.level * 0.2); burst(center.x, center.y, civ.color, 10);
  }

  function updateEnemyCivs(dt) {
    for (const civ of state.enemyCivs) {
      if (civ.defeated) continue;
      for (const hex of enemyStructures(civ.id)) {
        const structure = hex.enemyStructure; structure.spawnClock -= dt; structure.growthClock -= dt;
        if (structure.growthClock <= 0 && structure.level < 3) {
          structure.level += 1; structure.growthClock += 70;
          const growth = structure.type === "capital" ? 180 : 100;
          structure.maxHp += growth; structure.hp += growth;
        }
        if (structure.type === "capital" && !structure.breached) {
          const center = axialToWorld(hex.q, hex.r); const close = Math.hypot(state.player.x - center.x, state.player.y - center.y) <= view.hexSize * 4.8;
          if (close) { structure.barrageClock -= dt; if (structure.barrageClock <= 0) fireCapitalBarrage(hex, civ); }
          else structure.barrageClock = Math.max(structure.barrageClock, 1.2);
        }
        if (structure.type !== "capital") {
          const center = axialToWorld(hex.q, hex.r); const close = Math.hypot(state.player.x - center.x, state.player.y - center.y) <= view.hexSize * 3.2;
          if (close) { structure.barrageClock -= dt; if (structure.barrageClock <= 0) fireGuardianBarrage(hex, civ); }
          else structure.barrageClock = Math.max(structure.barrageClock, 0.8);
        }
        if (structure.spawnClock <= 0) {
          spawnEnemyAt(hex, civ);
          const base = structure.type === "capital" ? 8 : 5.5;
          structure.spawnClock = Math.max(3.6, base - state.time / 240 - enemyTerritoryCount(civ.id) * 0.025 - (structure.level - 1) * 0.8);
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
    if (state.enemyCivs.every((item) => item.defeated)) finish(true, "military");
  }

  function damageEnemyStructure(hex, damage) {
    if (!hex?.enemyStructure || damage <= 0) return false;
    const structure = hex.enemyStructure; const civ = state.enemyCivs.find((item) => item.id === hex.enemyCiv);
    if (structure.breached) return false;
    if (!state.techs.siege) {
      if (state.siegeLockMessageClock <= 0) { const center = axialToWorld(hex.q, hex.r); state.messages.push({ text: "공성공학 연구 필요", x: center.x, y: center.y - 22, life: 1.8 }); state.siegeLockMessageClock = 2; }
      return false;
    }
    const shielded = structure.type === "capital" && enemyStructures(civ?.id).some((item) => item.enemyStructure.type !== "capital");
    structure.hp -= damage * (shielded ? 0.15 : 1);
    const center = axialToWorld(hex.q, hex.r); burst(center.x, center.y, "#ffcfda", 5);
    if (structure.type === "capital" && shielded && structure.hp <= 0) { structure.hp = 1; return true; }
    if (structure.hp > 0) return true;
    if (structure.type === "capital") {
      structure.hp = 0; structure.breached = true;
      state.messages.push({ text: "수도 방어선 붕괴 · 점령 명령 필요", x: center.x, y: center.y - 24, life: 3 });
    }
    else {
      hex.enemyStructure = null; hex.enemyCiv = null; hex.enemyNeutralized = true;
      burst(center.x, center.y, civ?.color || "#ef476f", 24);
      state.messages.push({ text: "적 수호시설 무력화", x: center.x, y: center.y - 18, life: 2 });
    }
    return true;
  }

  function updateProjectiles(dt) {
    for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
      const shot = state.projectiles[i];
      if (shot.homing) {
        const targetHex = shot.targetStructureKey && state.hexByKey.get(shot.targetStructureKey);
        const targetCenter = targetHex?.enemyStructure ? axialToWorld(targetHex.q, targetHex.r) : null;
        const target = targetCenter || state.enemies.find((enemy) => enemy.id === shot.targetId);
        if (target) {
          const speed = Math.hypot(shot.vx, shot.vy); const desired = Math.atan2(target.y - shot.y, target.x - shot.x);
          const current = Math.atan2(shot.vy, shot.vx); const turn = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
          const angle = current + Math.max(-3.5 * dt, Math.min(3.5 * dt, turn)); shot.vx = Math.cos(angle) * speed; shot.vy = Math.sin(angle) * speed;
        }
      }
      const traveled = Math.hypot(shot.vx * dt, shot.vy * dt); shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.traveled += traveled; shot.life -= dt;
      let remove = shot.life <= 0 || (shot.maxRange !== null && shot.traveled > shot.maxRange);
      for (let j = state.enemies.length - 1; j >= 0 && !remove; j -= 1) {
        const enemy = state.enemies[j];
        const hitId = `enemy:${enemy.id}`;
        if (shot.hit.has(hitId) || Math.hypot(shot.x - enemy.x, shot.y - enemy.y) > shot.radius + enemy.radius) continue;
        if (shot.aoe) { explode(shot); remove = true; break; }
        shot.hit.add(hitId); enemy.hp -= shot.damage; burst(shot.x, shot.y, shot.color, 4);
        if (enemy.hp <= 0) killEnemy(j);
        if (shot.pierce <= 0) remove = true; else shot.pierce -= 1;
      }
      for (const hex of shot.kind === "base" ? [] : [...enemyStructures()]) {
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

  function updateEnemyShots(dt) {
    const p = state.player;
    for (let i = state.enemyShots.length - 1; i >= 0; i -= 1) {
      const shot = state.enemyShots[i]; const traveled = Math.hypot(shot.vx * dt, shot.vy * dt);
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.traveled += traveled; shot.life -= dt;
      if (shot.traveled > shot.maxRange || shot.life <= 0 || !hexAt(shot.x, shot.y)) state.enemyShots.splice(i, 1);
      else if (Math.hypot(shot.x - p.x, shot.y - p.y) <= shot.radius + p.radius) { hurtPlayer(shot.damage); state.enemyShots.splice(i, 1); }
    }
  }

  function killEnemy(index) {
    const enemy = state.enemies[index]; state.enemies.splice(index, 1); state.kills += 1;
    addXp(enemy.xp);
    burst(enemy.x, enemy.y, enemy.brute ? "#ff6b6b" : "#e24b63", enemy.brute ? 12 : 7);
  }

  function addXp(amount) {
    const p = state.player; p.xp += amount;
    if (p.xp < p.nextXp) return;
    p.xp -= p.nextXp; p.level += 1; p.nextXp = Math.round(p.nextXp * 1.28 + 4); showAugments();
  }

  function showAugments() {
    state.choosing = true;
    const choices = [...AUGMENTS.filter((augment) => augment.category === "combat")].sort(() => Math.random() - 0.5).slice(0, 3);
    state.augmentChoices = choices.map((augment) => augment.id);
    if (ui.augmentOptions) ui.augmentOptions.replaceChildren(...choices.map((augment, index) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "augment-card";
      button.dataset.augmentId = augment.id; button.dataset.category = augment.category;
      button.innerHTML = `<span>${augment.category.toUpperCase()} · 0${index + 1}</span><strong>${augment.title}</strong><small>${augment.text}</small>`;
      button.addEventListener("click", () => { applyAugment(augment.id); state.choosing = false; state.augmentChoices = []; setOverlay(ui.augment, false); updateHud(); canvas.focus(); }); return button;
    }));
    setOverlay(ui.augment, true);
  }

  function applyAugment(id) {
    const augment = AUGMENTS.find((item) => item.id === id); if (!augment) return false;
    augment.apply(state); state.augmentLevels[id] = (state.augmentLevels[id] || 0) + 1; return true;
  }

  function captureHex(hex, source = "manual") {
    if (!hex || hex.captured || hex.enemyCiv) return false;
    hex.captured = true; hex.building = null; hex.enemyNeutralized = false; hex.claimFunded = false; hex.claimStage = 0; hex.claimProgress = 0; revealAround(state, hex.q, hex.r, 2);
    if (!hex.rewardClaimed) {
      hex.rewardClaimed = true;
      if (hex.resource === "core") state.player.autoDamage *= 1.12;
      if (hex.resource === "ruins") state.science += 7;
      if (hex.resource === "garden") state.player.hp = Math.min(state.player.maxHp, state.player.hp + 12);
    }
    const center = axialToWorld(hex.q, hex.r); burst(center.x, center.y, "#63e6ff", 18);
    state.messages.push({ text: `${source === "outpost" ? "전초기지 확장" : "영토 확보"}${hex.resource ? ` · ${resourceName(hex.resource)}` : ""}`, x: center.x, y: center.y, life: 1.8 });
    return true;
  }

  function playerBases() { return state.hexes.filter((hex) => hex.captured && (hex.building === "command" || hex.building === "outpost")); }

  function baseClaimRadius(base) { return (base.baseLevel || 1) + 1 + (state.techs.frontier ? 1 : 0); }
  function claimStageDuration(hex) { return CLAIM_STAGE_SECONDS * terrainModifiers(hex).claim * (state.techs.frontier ? 0.8 : 1) / state.expansionMultiplier; }

  function claimBaseFor(hex) {
    if (!hex || hex.captured || hex.enemyCiv || !neighbors(hex).some((item) => item.captured)) return null;
    return playerBases().filter((base) => hexDistance(base, hex) <= baseClaimRadius(base))
      .sort((a, b) => hexDistance(a, hex) - hexDistance(b, hex))[0] || null;
  }

  function claimSuitability(hex, base = claimBaseFor(hex)) {
    if (!hex || !base) return null;
    const terrainScore = { plain: 8, ridge: 13, crater: 15, dunes: -8 }[hex.terrain] || 0;
    const resourceScore = { core: 22, ore: 18, ruins: 17, garden: 14 }[hex.resource] || 0;
    return Math.max(20, Math.min(100, Math.round(100 - hexDistance(hex, base) * 12 + terrainScore + resourceScore)));
  }

  function claimSuitabilityGrade(score) { return score >= 85 ? "S" : score >= 70 ? "A" : score >= 50 ? "B" : "C"; }

  function claimLockReason(hex) {
    if (!hex || hex.captured || hex.enemyCiv) return "개척 불가";
    if (!claimBaseFor(hex)) return "영토 인접·거점 영향권 필요";
    if (!state.techs.frontier) return "개척 기술 필요";
    if (!hex.claimFunded && state.production < 35) return "산업력 35 필요";
    return null;
  }

  function siegeBaseFor(hex) {
    return playerBases().filter((base) => hexDistance(base, hex) <= baseClaimRadius(base))
      .sort((a, b) => hexDistance(a, hex) - hexDistance(b, hex))[0] || null;
  }

  function setOrder(type, hex, base) {
    if (!hex || !base) return false;
    if (state.activeOrder?.type === type && state.activeOrder.key === hex.key) return true;
    if (type === "claim" && claimLockReason(hex)) return false;
    if (state.activeOrder?.type === "claim") {
      const previous = state.hexByKey.get(state.activeOrder.key);
      if (previous) previous.claimProgress = 0;
    }
    if (type === "claim") {
      if (!hex.claimFunded) { state.production -= 15; hex.claimFunded = true; }
    }
    const stage = type === "claim" ? hex.claimStage : 0;
    state.activeOrder = { type, key: hex.key, baseKey: base.key, stage, progress: 0 };
    return true;
  }

  function selectTile(key) {
    const hex = state.hexByKey.get(key); if (!hex) return false;
    state.selectedKey = hex.key;
    const structure = hex.enemyStructure;
    if (structure?.type === "capital" && structure.breached) {
      const base = siegeBaseFor(hex); if (base) setOrder("siege", hex, base);
    } else {
      const base = claimBaseFor(hex); if (base) setOrder("claim", hex, base);
    }
    updateHud(); return true;
  }

  function updateOrders(dt) {
    const order = state.activeOrder; if (!order) return;
    const hex = state.hexByKey.get(order.key); const base = state.hexByKey.get(order.baseKey);
    if (!hex || !base?.captured || !base.baseLevel) { state.activeOrder = null; return; }
    if (order.type === "claim") {
      if (hex.captured || hex.enemyCiv || !claimBaseFor(hex)) { state.activeOrder = null; return; }
      const duration = claimStageDuration(hex);
      order.progress += dt; hex.claimProgress = order.progress;
      if (order.progress < duration) return;
      order.stage += 1; order.progress = 0; hex.claimStage = order.stage; hex.claimProgress = 0;
      if (order.stage >= 3) { captureHex(hex, "거점 명령"); state.activeOrder = null; }
      return;
    }
    if (order.type === "siege") {
      if (hex.enemyStructure?.type !== "capital" || !hex.enemyStructure.breached || !siegeBaseFor(hex)) { state.activeOrder = null; return; }
      order.progress += dt;
      if (order.progress < SIEGE_STAGE_SECONDS) return;
      order.stage += 1; order.progress = 0;
      if (order.stage >= 3) { const civ = state.enemyCivs.find((item) => item.id === hex.enemyCiv); state.activeOrder = null; defeatEnemyCiv(civ); }
    }
  }

  function baseGrowthThreshold(level) { return (level === 1 ? 45 : 75) * (state.techs.urban ? 0.75 : 1); }

  function updateBaseGrowth(dt) {
    for (const base of playerBases()) {
      base.defenseClock = Math.max(0, (base.defenseClock || 0) - dt);
      if (base.defenseClock > 0) continue;
      if (base.baseLevel >= 3) continue;
      base.baseGrowth += dt;
      const threshold = baseGrowthThreshold(base.baseLevel);
      if (base.baseGrowth >= threshold) { base.baseGrowth -= threshold; base.baseLevel += 1; base.baseMaxHp += 50; base.baseHp = Math.min(base.baseMaxHp, base.baseHp + 75); }
    }
  }

  function foundBase() {
    const hex = state.hexByKey.get(state.selectedKey);
    if (!hex?.captured || hex.building || state.production < 50) return false;
    state.production -= 50; hex.building = "outpost"; hex.baseLevel = 1; hex.baseGrowth = 0; hex.baseMaxHp = 120; hex.baseHp = 120; hex.defenseClock = 0; hex.turretClock = 0; revealAround(state, hex.q, hex.r, 2); updateHud(); return true;
  }

  function research(id) {
    const cost = TECHS[id]; if (!cost || state.techs[id] || state.science < cost) return false;
    state.science -= cost; state.techs[id] = true; updateHud(); return true;
  }

  function startShip() {
    const base = state.hexByKey.get(state.selectedKey);
    if (!state.techs.aerospace || state.ship || !base?.captured || !base.baseLevel || base.baseLevel < 3 || state.production < 90) return false;
    state.production -= 90; state.ship = { baseKey: base.key, phase: "build", stage: 0, progress: 0 }; updateHud(); return true;
  }

  function updateShip(dt) {
    const ship = state.ship; if (!ship) return;
    ship.progress += dt;
    if (ship.phase === "build" && ship.progress >= 20) {
      ship.progress -= 20; ship.stage += 1;
      if (ship.stage >= 3) { ship.phase = "launch"; ship.progress = 0; }
    } else if (ship.phase === "launch" && ship.progress >= 45) finish(true, "science");
  }

  function currentBuildTile() { return hexAt(state.player.x, state.player.y); }
  function buildTargetTile() { return state.selectedKey ? state.hexByKey.get(state.selectedKey) || null : currentBuildTile(); }
  function buildLockReason(type, hex = buildTargetTile()) {
    const cost = BUILDINGS[type];
    if (!cost) return "지원하지 않는 시설";
    if (!hex) return "건설 대상 없음";
    if (!hex.captured) return "점령 필요";
    if (hex.building === "command") return "지휘기지에는 건설 불가";
    if (hex.building) return `${buildingName(hex.building)} 건설됨`;
    if (state.production < cost) return `산업력 부족 (${Math.floor(state.production)} / ${cost})`;
    return null;
  }
  function canBuild(type) {
    return !buildLockReason(type);
  }

  function build(type) {
    if (!canBuild(type)) return false;
    const hex = buildTargetTile(); state.production -= BUILDINGS[type]; hex.building = type;
    if (type === "outpost") { hex.baseLevel = 1; hex.baseGrowth = 0; hex.baseMaxHp = 120; hex.baseHp = 120; hex.defenseClock = 0; hex.turretClock = 0; }
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
    const hex = buildTargetTile(); const coordinate = hex ? `[${hex.q}, ${hex.r}] ` : "";
    if (ui.buildTileInfo) ui.buildTileInfo.textContent = !hex ? "건설 대상 없음" : !hex.captured ? `${coordinate}점령 필요` : hex.building === "command" ? `${coordinate}지휘기지에는 건설 불가` : hex.building ? `${coordinate}${buildingName(hex.building)} 건설됨` : state.production < Math.min(...Object.values(BUILDINGS)) ? `${coordinate}산업력 부족 (${Math.floor(state.production)} / 최소 ${Math.min(...Object.values(BUILDINGS))})` : `${coordinate}${terrainName(hex.terrain)}${hex.resource ? ` · ${resourceName(hex.resource)}` : ""} · 산업력 ${Math.floor(state.production)}`;
    for (const [type, cost] of Object.entries(BUILDINGS)) {
      const button = ui[`build${type[0].toUpperCase()}${type.slice(1)}`]; if (!button) continue;
      const reason = buildLockReason(type, hex); button.disabled = Boolean(reason); button.dataset.cost = String(cost); button.dataset.lockReason = reason || ""; button.title = reason || `${coordinate}${buildingName(type)} 건설 가능`;
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
    for (let i = state.particles.length - 1; i >= 0; i -= 1) { const particle = state.particles[i]; particle.life -= dt; if (particle.kind !== "line") { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vx *= 0.96; particle.vy *= 0.96; } if (particle.life <= 0) state.particles.splice(i, 1); }
    for (let i = state.messages.length - 1; i >= 0; i -= 1) { state.messages[i].life -= dt; state.messages[i].y -= 22 * dt; if (state.messages[i].life <= 0) state.messages.splice(i, 1); }
  }

  function finish(won, type = null) {
    state.ended = true; state.running = false; state.won = won; state.victoryType = won ? type : null; state.player.hp = Math.max(0, state.player.hp);
    const copy = { military: ["군사 승리", "세 적 문명의 수도를 공성 점령했습니다."], science: ["과학 승리", "우주선을 완성하고 적의 포위망에서 탈출했습니다."] }[type];
    if (copy && ui.victoryTitle) ui.victoryTitle.textContent = copy[0]; if (copy && ui.victoryCopy) ui.victoryCopy.textContent = copy[1];
    setOverlay(won ? ui.victory : ui.gameOver, true);
  }

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
    for (const enemy of state.enemies) if (isOnScreen(enemy.x, enemy.y)) drawEnemy(enemy);
    for (const shot of state.projectiles) if (isOnScreen(shot.x, shot.y)) drawProjectile(shot);
    for (const shot of state.enemyShots) if (isOnScreen(shot.x, shot.y)) drawEnemyShot(shot);
    for (const particle of state.particles) if (isOnScreen(particle.x, particle.y)) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      if (particle.kind === "line") { ctx.strokeStyle = particle.color; ctx.lineWidth = particle.size; ctx.beginPath(); ctx.moveTo(particle.x, particle.y); ctx.lineTo(particle.x2, particle.y2); ctx.stroke(); }
      else { ctx.fillStyle = particle.color; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, TAU); ctx.fill(); }
    }
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
    const ownedColor = { plain: "#173f4a", crater: "#284552", ridge: "#244c55", dunes: "#354d43" }[hex.terrain];
    const civ = state.enemyCivs.find((item) => item.id === hex.enemyCiv);
    ctx.globalAlpha = hex.visible ? 1 : 0.38;
    const claimable = Boolean(claimBaseFor(hex)); const selected = state.selectedKey === hex.key;
    drawHex(hex, hex.captured ? ownedColor : hex.enemyCiv ? `${civ?.color || "#ef476f"}38` : terrainColor,
      selected ? "#f4d35e" : hex.captured ? "#63e6ff" : hex.enemyCiv ? civ?.color : claimable ? "#42d9c8" : "#294554",
      selected ? 4 : hex.captured || hex.enemyCiv ? 2.4 : claimable ? 1.7 : 1);
    const center = axialToWorld(hex.q, hex.r);
    ctx.save(); ctx.globalAlpha *= 0.34; ctx.fillStyle = hex.captured ? "#9ffcff" : hex.enemyCiv ? civ?.color || "#ef476f" : "#a7bac4"; ctx.font = "800 18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText({ plain: "·", ridge: "▲", crater: "○", dunes: "≈" }[hex.terrain], center.x, center.y + 2); ctx.restore();
    if (hex.resource) { ctx.fillStyle = { ore: "#f5b95f", core: "#63e6ff", ruins: "#c8a8ff", garden: "#72ef9f" }[hex.resource]; ctx.font = "800 13px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText({ ore: "◆", core: "◈", ruins: "✦", garden: "●" }[hex.resource], center.x + 20, center.y - 17); }
    if (hex.building) { ctx.fillStyle = buildingColor(hex.building); ctx.beginPath(); ctx.arc(center.x, center.y, hex.building === "command" ? 15 : 10, 0, TAU); ctx.fill(); ctx.fillStyle = "#07131c"; ctx.font = "800 9px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText({ command: "HQ", outpost: "O", factory: "F", lab: "L", silo: "S" }[hex.building], center.x, center.y + 1); if (hex.baseLevel) { ctx.fillStyle = "#eaffff"; ctx.font = "800 10px sans-serif"; ctx.fillText(`Lv.${hex.baseLevel}`, center.x, center.y + 25); ctx.fillStyle = "#101820"; ctx.fillRect(center.x - 20, center.y + 31, 40, 4); ctx.fillStyle = hex.defenseClock > 0 ? "#ff6b6b" : "#72ef9f"; ctx.fillRect(center.x - 20, center.y + 31, 40 * Math.max(0, hex.baseHp / hex.baseMaxHp), 4); } }
    if (hex.enemyStructure) drawEnemyStructure(hex, civ, center);
    ctx.globalAlpha = 1;
  }

  function drawEnemyStructure(hex, civ, center) {
    const structure = hex.enemyStructure; ctx.save(); ctx.translate(center.x, center.y);
    ctx.fillStyle = civ?.color || "#ef476f"; ctx.strokeStyle = "#420b20"; ctx.lineWidth = 3;
    if (structure.type === "capital") {
      ctx.rotate(Math.PI / 4); ctx.fillRect(-14, -14, 28, 28); ctx.strokeRect(-14, -14, 28, 28);
      ctx.rotate(-Math.PI / 4); ctx.fillStyle = "#fff0f5"; ctx.fillRect(-4, -18, 8, 36);
      const guardiansAlive = enemyStructures(civ?.id).some((item) => item.enemyStructure.type !== "capital");
      if (guardiansAlive) { ctx.strokeStyle = "#8ff7ff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 25 + Math.sin(state.time * 4) * 2, 0, TAU); ctx.stroke(); }
      if (structure.breached) { ctx.fillStyle = "#fff"; ctx.font = "900 9px sans-serif"; ctx.textAlign = "center"; ctx.fillText("BREACH", 0, 34); }
    } else {
      ctx.beginPath(); for (let i = 0; i < 3; i += 1) { const angle = -Math.PI / 2 + i * TAU / 3; const x = Math.cos(angle) * 16; const y = Math.sin(angle) * 16; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fff0f5"; ctx.beginPath(); ctx.arc(0, 2, 7, 0, TAU); ctx.fill(); ctx.fillStyle = "#420b20"; ctx.font = "900 8px sans-serif"; ctx.textAlign = "center"; ctx.fillText(structure.type === "foundry" ? "F" : "G", 0, 5);
    }
    ctx.fillStyle = "#1b1118"; ctx.fillRect(-19, -27, 38, 4); ctx.fillStyle = structure.breached ? "#f4d35e" : "#72ef9f"; ctx.fillRect(-19, -27, 38 * Math.max(0, structure.hp / structure.maxHp), 4); ctx.fillStyle = "#fff"; ctx.font = "800 9px sans-serif"; ctx.textAlign = "center"; ctx.fillText(`Lv.${structure.level || 1}`, 0, -32); ctx.restore();
  }

  function drawCapture() {
    const order = state.activeOrder; if (!order) return; const hex = state.hexByKey.get(order.key); if (!hex) return;
    const duration = order.type === "siege" ? SIEGE_STAGE_SECONDS : claimStageDuration(hex);
    const center = axialToWorld(hex.q, hex.r); const partial = Math.min(1, order.progress / duration);
    for (let stage = 0; stage < 3; stage += 1) {
      ctx.strokeStyle = stage < order.stage ? "#72ef9f" : stage === order.stage ? "#f4d35e" : "rgba(255,255,255,.18)"; ctx.lineWidth = 6;
      const start = -Math.PI / 2 + stage * TAU / 3 + 0.04; const complete = stage < order.stage ? 1 : stage === order.stage ? partial : 0;
      ctx.beginPath(); ctx.arc(center.x, center.y, view.hexSize * 0.64, start, start + (TAU / 3 - 0.08) * complete); ctx.stroke();
    }
  }

  function drawExpansion() {
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

  function drawEnemy(enemy) { const tile = hexAt(enemy.x, enemy.y); if (!tile?.discovered) return; const civ = state.enemyCivs.find((item) => item.id === enemy.originCiv); ctx.globalAlpha = tile.visible ? 1 : 0.38; ctx.fillStyle = enemy.wild ? "#f5b95f" : enemy.brute ? "#ff8a8a" : civ?.color || "#dc3e64"; ctx.strokeStyle = enemy.wild ? "#5b3b0b" : "#360d1a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(enemy.x, enemy.y, enemy.radius, 0, TAU); ctx.fill(); ctx.stroke(); if (enemy.hp < enemy.maxHp) { ctx.fillStyle = "#1b1118"; ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 8, enemy.radius * 2, 3); ctx.fillStyle = "#72ef9f"; ctx.fillRect(enemy.x - enemy.radius, enemy.y - enemy.radius - 8, enemy.radius * 2 * enemy.hp / enemy.maxHp, 3); } ctx.globalAlpha = 1; }
  function drawProjectile(shot) { ctx.fillStyle = shot.color; ctx.shadowColor = shot.color; ctx.shadowBlur = shot.kind === "orbital" || shot.kind === "missile" || shot.kind === "mine" ? 14 : 7; ctx.beginPath(); ctx.arc(shot.x, shot.y, shot.kind === "mine" ? shot.radius + Math.sin(state.time * 7) * 2 : shot.radius, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; }
  function drawEnemyShot(shot) { ctx.fillStyle = shot.color; ctx.shadowColor = shot.color; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(shot.x, shot.y, shot.radius, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; }

  function updateHud() {
    if (!state) return; const p = state.player; const captured = capturedCount(); state.productionRate = productionRate(); state.scienceRate = scienceRate();
    if (ui.healthFill) ui.healthFill.style.width = `${Math.max(0, p.hp / p.maxHp * 100)}%`; if (ui.healthText) ui.healthText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    if (ui.xpFill) ui.xpFill.style.width = `${p.xp / p.nextXp * 100}%`; if (ui.level) ui.level.textContent = p.level; if (ui.territory) ui.territory.textContent = captured; if (ui.kills) ui.kills.textContent = state.kills;
    if (ui.timer) { const elapsed = Math.max(0, Math.floor(state.time)); ui.timer.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`; }
    if (ui.weapon) ui.weapon.textContent = `${Math.round(p.damage)} DMG · ${(1 / p.fireRate).toFixed(1)}/s`; if (ui.auto) ui.auto.textContent = `${Math.round(p.autoDamage)} DMG · ${(1 / p.autoRate).toFixed(1)}/s`;
    if (ui.objective) ui.objective.textContent = "군사: 수도 3곳 공성 점령 · 과학: 우주선 제작 후 탈출"; if (ui.production) ui.production.textContent = Math.floor(state.production); if (ui.productionRate) ui.productionRate.textContent = `+${Math.round(capitalProductionYield())} / 10초`;
    if (ui.science) ui.science.textContent = Math.floor(state.science); if (ui.scienceRate) ui.scienceRate.textContent = `+${Math.round(capitalScienceYield())} / 15초`;
    const livingCapitals = state.enemyCivs.filter((civ) => !civ.defeated).length;
    if (ui.enemyCapitals) ui.enemyCapitals.textContent = `${livingCapitals} / 3`; if (ui.enemyTerritory) ui.enemyTerritory.textContent = state.hexes.filter((hex) => hex.enemyCiv).length;
    if (ui.enemyPressure) ui.enemyPressure.textContent = state.enemies.length;
    if (ui.militaryProgress) ui.militaryProgress.textContent = `${3 - livingCapitals} / 3`;
    if (ui.scienceProgress) ui.scienceProgress.textContent = state.ship ? state.ship.phase === "launch" ? `발사 방어 ${Math.floor(state.ship.progress)} / 45초` : `우주선 ${state.ship.stage} / 3` : state.techs.aerospace ? "우주기지 선택" : "우주항법 연구 필요";
    if (ui.expansion) ui.expansion.textContent = state.activeOrder?.type === "claim" ? `개척 ${state.activeOrder.stage} / 3` : state.techs.frontier ? "타일을 선택하세요" : "개척 기술 필요";
    const tile = currentBuildTile(); if (ui.terrain) ui.terrain.textContent = tile ? `${terrainName(tile.terrain)} · ${terrainModifiers(tile).label}${tile.resource ? ` · ${resourceName(tile.resource)}` : ""}` : "지도 밖";
    if (ui.arsenal) ui.arsenal.textContent = ["Pulse", "Orbital", p.chainLevel && `Chain Lv.${p.chainLevel}`, p.mineLevel && `Mine Lv.${p.mineLevel}`, buildingCount("factory") && "Scatter", buildingCount("lab") && "Rail", buildingCount("silo") && "Missile"].filter(Boolean).join(" / ");
    const orderHex = state.activeOrder && state.hexByKey.get(state.activeOrder.key);
    const orderDuration = state.activeOrder?.type === "siege" ? SIEGE_STAGE_SECONDS : claimStageDuration(orderHex);
    const capturePercent = state.activeOrder ? (state.activeOrder.stage + state.activeOrder.progress / orderDuration) / 3 * 100 : 0;
    if (ui.captureFill) ui.captureFill.style.width = `${Math.min(100, capturePercent)}%`;
    if (ui.captureLabel) ui.captureLabel.textContent = state.activeOrder ? `${state.activeOrder.type === "siege" ? "수도 공성" : "개척"} ${state.activeOrder.stage + 1}/3 · ${Math.floor(capturePercent)}%` : "강조된 헥스를 클릭해 명령하세요";
    const selected = state.hexByKey.get(state.selectedKey); const selectedClaimBase = selected && claimBaseFor(selected); const selectedClaimLock = selectedClaimBase && claimLockReason(selected);
    if (ui.selectedTile) ui.selectedTile.textContent = selected ? `${selected.q}, ${selected.r} · ${selected.captured ? "아군 영토" : selected.enemyCiv ? "적 영토" : "중립"}` : "선택 없음";
    if (ui.selectedAction) { const turret = selected?.baseLevel ? baseTurretStats(selected.baseLevel) : null; const suitability = selectedClaimBase ? claimSuitability(selected, selectedClaimBase) : null; ui.selectedAction.textContent = !selected ? "지도에서 헥스를 선택하세요" : selected.enemyStructure?.breached ? siegeBaseFor(selected) ? "수도 공성 가능" : "거점 영향권 밖" : selectedClaimBase ? selectedClaimLock ? `개척 잠김 · ${selectedClaimLock} · 최초 투자 15` : `개척 ${Math.ceil(claimStageDuration(selected) * 3)}초 · ${selected.claimFunded ? "투자 완료" : "산업 15 투자"} · 적합도 ${claimSuitabilityGrade(suitability)} ${suitability} · ${terrainModifiers(selected).label}` : selected.captured && !selected.building ? state.production >= 50 ? "새 거점 설립 가능" : `새 거점 · 산업력 50 필요 (${Math.floor(state.production)} / 50)` : selected.baseLevel ? `거점 Lv.${selected.baseLevel} · HP ${Math.ceil(selected.baseHp)}/${selected.baseMaxHp} · 포탑 ${turret.damage}DMG/${(turret.range / view.hexSize).toFixed(1)}H/${turret.rate.toFixed(1)}s${selected.defenseClock > 0 ? " · 방어 중" : ""}` : "명령 없음"; }
    if (ui.defenseStatus) { const assaultUnits = state.assault ? state.enemies.filter((enemy) => enemy.assaultId === state.assault.id).length : 0; ui.defenseStatus.textContent = state.assault ? `공세 진행 · ${state.assault.targetKey} · 잔여 ${assaultUnits}` : `다음 공세 ${Math.max(0, Math.ceil(state.assaultClock))}초`; }
    if (ui.capitalCycle) ui.capitalCycle.textContent = `수도 산업 +${Math.round(capitalProductionYield())} (${Math.ceil(state.capitalProductionClock)}초) · 과학 +${Math.round(capitalScienceYield())} (${Math.ceil(state.capitalScienceClock)}초)`;
    if (ui.foundBase) ui.foundBase.disabled = !selected?.captured || Boolean(selected.building) || state.production < 50;
    if (ui.shipButton) ui.shipButton.disabled = !state.techs.aerospace || Boolean(state.ship) || !selected?.captured || selected.baseLevel < 3 || state.production < 90;
    if (ui.shipStatus) ui.shipStatus.textContent = !state.ship ? state.techs.aerospace ? "레벨 3 거점과 산업력 90 필요" : "우주항법 기술 필요" : state.ship.phase === "launch" ? `발사 방어 ${Math.ceil(45 - state.ship.progress)}초` : `우주선 제작 ${state.ship.stage + 1}/3 · ${Math.floor(state.ship.progress / 20 * 100)}%`;
    for (const [id, cost] of Object.entries(TECHS)) { const button = ui[`tech${id[0].toUpperCase()}${id.slice(1)}`]; if (button) { button.disabled = state.techs[id] || state.science < cost; button.dataset.researched = String(state.techs[id]); } }
    if (state.menu) updateBuildUi();
  }

  function snapshot() {
    if (!state) return null; const counts = Object.fromEntries(Object.keys(BUILDINGS).map((type) => [type, buildingCount(type)])); counts.command = buildingCount("command");
    const lastProjectile = state.projectiles[state.projectiles.length - 1];
    const structures = enemyStructures(); const origins = {};
    for (const enemy of state.enemies) origins[enemy.originCiv] = (origins[enemy.originCiv] || 0) + 1;
    const wildUnits = state.enemies.filter((enemy) => enemy.originCiv === "wild");
    const victoryProgress = Object.freeze({ military: 3 - state.enemyCivs.filter((civ) => !civ.defeated).length,
      science: state.ship ? `${state.ship.phase}:${state.ship.stage}` : state.techs.aerospace ? "ship-ready" : "research" });
    return Object.freeze({ running: state.running, paused: state.paused, choosing: state.choosing, menu: state.menu, ended: state.ended, won: state.won, victoryType: state.victoryType,
      time: Number(state.time.toFixed(2)), hp: Number(state.player.hp.toFixed(1)), maxHp: state.player.maxHp, x: Number(state.player.x.toFixed(1)), y: Number(state.player.y.toFixed(1)),
      camera: Object.freeze({ x: Number(state.camera.x.toFixed(1)), y: Number(state.camera.y.toFixed(1)) }), mapTiles: state.hexes.length,
      discovered: state.hexes.filter((hex) => hex.discovered).length, level: state.player.level, xp: state.player.xp, kills: state.kills, territory: capturedCount(), enemies: state.enemies.length,
      playerDamage: state.player.damage, autoDamage: state.player.autoDamage,
      production: Number(state.production.toFixed(1)), productionRate: Number(state.productionRate.toFixed(2)),
      science: Number(state.science.toFixed(1)), scienceRate: Number(state.scienceRate.toFixed(2)), buildings: Object.freeze(counts),
      capitalCycle: Object.freeze({ productionIn: Number(state.capitalProductionClock.toFixed(2)), scienceIn: Number(state.capitalScienceClock.toFixed(2)),
        productionYield: Number(capitalProductionYield().toFixed(1)), scienceYield: Number(capitalScienceYield().toFixed(1)),
        productionPulses: state.capitalProductionPulses, sciencePulses: state.capitalSciencePulses }),
      terrainCounts: Object.freeze(Object.fromEntries(Object.keys(TERRAIN_MODIFIERS).map((type) => [type, state.hexes.filter((hex) => hex.terrain === type).length]))),
      enemyCivs: Object.freeze(state.enemyCivs.map((civ) => { const capital = state.hexByKey.get(`${civ.q},${civ.r}`)?.enemyStructure; const guardiansRemaining = enemyStructures(civ.id).filter((hex) => hex.enemyStructure.type !== "capital").length; return Object.freeze({ id: civ.id, defeated: civ.defeated, capital: `${civ.q},${civ.r}`, expansionTarget: civ.expansionTarget, guardiansRemaining, shielded: Boolean(capital && guardiansRemaining), breached: Boolean(capital?.breached) }); })),
      enemyCapitals: state.enemyCivs.filter((civ) => !civ.defeated).length, enemyTerritory: state.hexes.filter((hex) => hex.enemyCiv).length,
      neutralizedEnemyTiles: Object.freeze(state.hexes.filter((hex) => hex.enemyNeutralized && !hex.captured).map((hex) => hex.key)),
      spawnStructures: structures.filter((hex) => hex.enemyStructure.type !== "capital").length,
      enemyOrigins: Object.freeze(origins), wildEnemies: wildUnits.length,
      wildOrigins: Object.freeze(wildUnits.map((enemy) => enemy.originKey)), structureHp: Object.freeze(structures.map((hex) => Object.freeze({ key: hex.key, civ: hex.enemyCiv,
        type: hex.enemyStructure.type, hp: Number(hex.enemyStructure.hp.toFixed(1)), maxHp: hex.enemyStructure.maxHp, level: hex.enemyStructure.level || 1,
        shielded: hex.enemyStructure.type === "capital" && enemyStructures(hex.enemyCiv).some((item) => item.enemyStructure.type !== "capital"),
        siegeLocked: !state.techs.siege, breached: Boolean(hex.enemyStructure.breached) }))),
      enemyUnits: Object.freeze(state.enemies.map((enemy) => Object.freeze({ id: enemy.id, civ: enemy.originCiv, origin: enemy.originStructure, originKey: enemy.originKey,
        assaultId: enemy.assaultId || null, targetBaseKey: enemy.targetBaseKey || null, x: Number(enemy.x.toFixed(1)), y: Number(enemy.y.toFixed(1)) }))),
      weapons: Object.freeze(["pulse", "orbital", state.player.chainLevel && "chain", state.player.mineLevel && "mine", buildingCount("factory") && "scatter", buildingCount("lab") && "rail", buildingCount("silo") && "missile"].filter(Boolean)),
      augmentChoices: Object.freeze([...state.augmentChoices]), augmentLevels: Object.freeze({ ...state.augmentLevels }), victoryProgress,
      projectiles: state.projectiles.length, baseShots: state.projectiles.filter((shot) => shot.kind === "base").length, enemyShots: state.enemyShots.length,
      projectileKinds: Object.freeze([...new Set(state.projectiles.map((shot) => shot.kind))]),
      projectileRanges: Object.freeze(state.projectiles.filter((shot) => shot.maxRange !== null).map((shot) => Object.freeze({ kind: shot.kind,
        sourceBaseKey: shot.sourceBaseKey || null, targetId: shot.targetId || null, priorityAssault: Boolean(shot.priorityAssault),
        traveled: Number(shot.traveled.toFixed(1)), maxRange: Number(shot.maxRange.toFixed(1)), originX: Number(shot.originX.toFixed(1)), originY: Number(shot.originY.toFixed(1)) }))),
      enemyShotRanges: Object.freeze(state.enemyShots.map((shot) => Object.freeze({ traveled: Number(shot.traveled.toFixed(1)), maxRange: Number(shot.maxRange.toFixed(1)), originX: Number(shot.originX.toFixed(1)), originY: Number(shot.originY.toFixed(1)) }))),
      projectileVelocity: lastProjectile ? Object.freeze({ vx: Number(lastProjectile.vx.toFixed(1)), vy: Number(lastProjectile.vy.toFixed(1)) }) : null,
      selectedKey: state.selectedKey,
      activeOrder: state.activeOrder ? Object.freeze({ type: state.activeOrder.type, key: state.activeOrder.key, baseKey: state.activeOrder.baseKey,
        stage: state.activeOrder.stage, progress: Number(state.activeOrder.progress.toFixed(2)), funded: Boolean(state.hexByKey.get(state.activeOrder.key)?.claimFunded) }) : null,
      bases: Object.freeze(playerBases().map((base) => { const turret = baseTurretStats(base.baseLevel); return Object.freeze({ key: base.key, level: base.baseLevel, growth: Number(base.baseGrowth.toFixed(2)), radius: baseClaimRadius(base),
        hp: Number(base.baseHp.toFixed(1)), maxHp: base.baseMaxHp, defending: base.defenseClock > 0,
        turret: Object.freeze({ range: Number(turret.range.toFixed(1)), damage: turret.damage, rate: Number(turret.rate.toFixed(2)) }) }); })),
      assault: state.assault ? Object.freeze({ ...state.assault, remaining: state.enemies.filter((enemy) => enemy.assaultId === state.assault.id).length }) : null,
      assaultClock: Number(state.assaultClock.toFixed(1)),
      claims: Object.freeze(state.hexes.filter((hex) => hex.claimStage > 0 || hex.claimFunded).map((hex) => Object.freeze({ key: hex.key, stage: hex.claimStage, progress: Number(hex.claimProgress.toFixed(2)), funded: hex.claimFunded }))),
      claimCandidates: Object.freeze(state.hexes.map((hex) => ({ hex, base: claimBaseFor(hex) })).filter((item) => item.base).map(({ hex, base }) => Object.freeze({ key: hex.key,
        baseKey: base.key, terrain: hex.terrain, resource: hex.resource, stageSeconds: Number(claimStageDuration(hex).toFixed(2)), suitability: claimSuitability(hex, base), effect: terrainModifiers(hex).label,
        funded: hex.claimFunded, cost: hex.claimFunded ? 0 : 15, requiredReserve: hex.claimFunded ? 0 : 35, locked: Boolean(claimLockReason(hex)), reason: claimLockReason(hex) }))),
      techs: Object.freeze({ ...state.techs }), ship: state.ship ? Object.freeze({ ...state.ship, progress: Number(state.ship.progress.toFixed(2)) }) : null });
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
  function debugSpawnWild(key) { return spawnWildEnemy(key ? state.hexByKey.get(key) : null); }
  function debugGrantXp(amount = 999) { addXp(Math.max(0, Number(amount) || 0)); return snapshot(); }
  function debugApplyAugment(id) { const applied = applyAugment(id); if (applied) { state.choosing = false; state.augmentChoices = []; setOverlay(ui.augment, false); } updateHud(); return applied; }
  function debugGrantResources(production = 0, science = 0) { state.production += Math.max(0, Number(production) || 0); state.science += Math.max(0, Number(science) || 0); updateHud(); return snapshot(); }
  function debugSetPlayerTile(key) { const hex = state.hexByKey.get(key); if (!hex) return false; const point = axialToWorld(hex.q, hex.r); state.player.x = point.x; state.player.y = point.y; return true; }
  function debugResolveAssault(success = true) { if (!state.assault) return false; if (success) { const id = state.assault.id; state.enemies = state.enemies.filter((enemy) => enemy.assaultId !== id); completeAssault(); } else damageBase(state.hexByKey.get(state.assault.targetKey), 99999); updateHud(); return true; }
  function debugClaimInfo(key) { const hex = state.hexByKey.get(key); const base = claimBaseFor(hex); return hex && base ? Object.freeze({ key, baseKey: base.key, terrain: hex.terrain,
    resource: hex.resource, stageSeconds: claimStageDuration(hex), suitability: claimSuitability(hex, base), funded: hex.claimFunded,
    cost: hex.claimFunded ? 0 : 15, requiredReserve: hex.claimFunded ? 0 : 35, locked: Boolean(claimLockReason(hex)), reason: claimLockReason(hex), modifiers: Object.freeze({ ...terrainModifiers(hex) }) }) : null; }
  function frame(now) { const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now; update(dt); render(); animationFrame = requestAnimationFrame(frame); }

  function clearTouchInput() { touchMove.pointerId = null; touchMove.x = 0; touchMove.y = 0; if (ui.touchStickKnob) ui.touchStickKnob.style.transform = "translate(-50%, -50%)"; }
  function updateTouchMove(event) { if (!ui.touchStick || event.pointerId !== touchMove.pointerId) return; const rect = ui.touchStick.getBoundingClientRect(); const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.34); let x = event.clientX - (rect.left + rect.width / 2); let y = event.clientY - (rect.top + rect.height / 2); const distance = Math.hypot(x, y); if (distance > radius) { x *= radius / distance; y *= radius / distance; } touchMove.x = x / radius; touchMove.y = y / radius; if (ui.touchStickKnob) ui.touchStickKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`; }

  function bindTouchControls() {
    ui.touchStick?.addEventListener("pointerdown", (event) => { if (touchMove.pointerId !== null) return; event.preventDefault(); touchMove.pointerId = event.pointerId; ui.touchStick.setPointerCapture?.(event.pointerId); updateTouchMove(event); });
    ui.touchStick?.addEventListener("pointermove", (event) => { if (event.pointerId === touchMove.pointerId) { event.preventDefault(); updateTouchMove(event); } });
    const releaseMove = (event) => { if (event.pointerId !== touchMove.pointerId) return; touchMove.pointerId = null; touchMove.x = 0; touchMove.y = 0; if (ui.touchStickKnob) ui.touchStickKnob.style.transform = "translate(-50%, -50%)"; };
    ui.touchStick?.addEventListener("pointerup", releaseMove); ui.touchStick?.addEventListener("pointercancel", releaseMove); ui.touchStick?.addEventListener("lostpointercapture", releaseMove);
  }

  function openTechMenu() { if (!state.running || state.paused || state.choosing || state.ended) return; state.menu = true; keys.clear(); clearTouchInput(); setOverlay(ui.techOverlay, true); updateHud(); }
  function closeTechMenu() { state.menu = false; setOverlay(ui.techOverlay, false); lastFrame = performance.now(); canvas.focus(); }

  window.addEventListener("resize", resize); window.addEventListener("blur", () => { keys.clear(); clearTouchInput(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { keys.clear(); clearTouchInput(); togglePause(true); } });
  window.addEventListener("keydown", (event) => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyB"].includes(event.code)) event.preventDefault();
    if (event.code === "Escape" && state.menu) { setOverlay(ui.techOverlay, false); closeBuildMenu(); return; }
    if (event.code === "Escape" || event.code === "KeyP") { togglePause(); return; }
    if (event.code === "KeyB") { openBuildMenu(); return; }
    keys.add(event.code);
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  canvas.addEventListener("pointermove", (event) => { pointer.clientX = event.clientX; pointer.clientY = event.clientY; pointer.inside = true; });
  canvas.addEventListener("pointerleave", () => { pointer.inside = false; });
  canvas.addEventListener("pointerdown", (event) => { if (event.button === 0) { event.preventDefault(); pointer.clientX = event.clientX; pointer.clientY = event.clientY; pointer.inside = true; const world = screenToWorld(event.clientX, event.clientY); const hex = hexAt(world.x, world.y); if (hex) selectTile(hex.key); canvas.focus(); } });
  ui.start?.addEventListener("click", startGame); ui.restart?.addEventListener("click", startGame); ui.resume?.addEventListener("click", () => togglePause(false)); ui.playAgain?.addEventListener("click", startGame); ui.victoryRestart?.addEventListener("click", startGame); ui.pauseButton?.addEventListener("click", () => togglePause());
  ui.buildButton?.addEventListener("click", openBuildMenu); ui.buildCancel?.addEventListener("click", closeBuildMenu);
  ui.foundBase?.addEventListener("click", foundBase); ui.shipButton?.addEventListener("click", startShip);
  ui.techButton?.addEventListener("click", openTechMenu); ui.techClose?.addEventListener("click", closeTechMenu);
  for (const id of Object.keys(TECHS)) ui[`tech${id[0].toUpperCase()}${id.slice(1)}`]?.addEventListener("click", () => research(id));
  for (const type of Object.keys(BUILDINGS)) ui[`build${type[0].toUpperCase()}${type.slice(1)}`]?.addEventListener("click", () => build(type));
  bindTouchControls();

  window.__HEXFRONT_DEBUG__ = Object.freeze({ snapshot, reset: () => reset(true), step, build,
    damageEnemyStructure: debugDamageStructure, spawnEnemy: debugSpawnEnemy, expandEnemy: debugExpandEnemy,
    spawnWild: debugSpawnWild, grantXp: debugGrantXp, applyAugment: debugApplyAugment,
    selectTile, research, foundBase, startShip, triggerAssault, resolveAssault: debugResolveAssault, setPlayerTile: debugSetPlayerTile,
    claimInfo: debugClaimInfo, terrainModifiers, grantResources: debugGrantResources });
  resize(); reset(!ui.start); cancelAnimationFrame(animationFrame); animationFrame = requestAnimationFrame(frame);
})();
