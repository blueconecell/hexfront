"use strict";

const HABITATS = {
  meadow: { name: "초원", symbol: "♒", color: "#9cb576", rarity: 1, count: 24 },
  forest: { name: "숲", symbol: "♠", color: "#66815c", rarity: 2, count: 20 },
  water: { name: "물", symbol: "≋", color: "#72aaa8", rarity: 3, count: 18 },
  desert: { name: "사막", symbol: "☀", color: "#d9b56e", rarity: 4, count: 14 },
  jungle: { name: "정글", symbol: "❧", color: "#477762", rarity: 5, count: 12 },
  cave: { name: "동굴", symbol: "◆", color: "#817b73", rarity: 6, count: 8 }
};

const ANIMAL_LIBRARY = [
  { name: "들토끼", emoji: "🐇", tier: "common", tierName: "일반", scores: { meadow: 4, forest: 3, water: 1, desert: 1, jungle: 1, cave: -2 } },
  { name: "꽃사슴", emoji: "🦌", tier: "common", tierName: "일반", scores: { meadow: 4, forest: 3, water: 1, desert: 0, jungle: 1, cave: -2 } },
  { name: "수달", emoji: "🦦", tier: "common", tierName: "일반", scores: { meadow: 1, forest: 1, water: 4, desert: -2, jungle: 3, cave: 0 } },
  { name: "사막여우", emoji: "🦊", tier: "common", tierName: "일반", scores: { meadow: 1, forest: 0, water: -2, desert: 4, jungle: 1, cave: 3 } },
  { name: "멧돼지", emoji: "🐗", tier: "adaptive", tierName: "적응", scores: { meadow: 3, forest: 4, water: 1, desert: 1, jungle: 3, cave: 1 } },
  { name: "두루미", emoji: "🦢", tier: "adaptive", tierName: "적응", scores: { meadow: 3, forest: 1, water: 4, desert: 0, jungle: 3, cave: -2 } },
  { name: "왕도마뱀", emoji: "🦎", tier: "adaptive", tierName: "적응", scores: { meadow: 1, forest: 1, water: 0, desert: 4, jungle: 3, cave: 3 } },
  { name: "검은곰", emoji: "🐻", tier: "adaptive", tierName: "적응", scores: { meadow: 1, forest: 4, water: 1, desert: -2, jungle: 3, cave: 3 } },
  { name: "설표", emoji: "🐆", tier: "rare", tierName: "희귀", scores: { meadow: 1, forest: 3, water: -3, desert: 0, jungle: 4, cave: 6 } },
  { name: "맥", emoji: "🦣", tier: "rare", tierName: "희귀", scores: { meadow: 1, forest: 3, water: 4, desert: -3, jungle: 6, cave: 0 } },
  { name: "황금독수리", emoji: "🦅", tier: "rare", tierName: "희귀", scores: { meadow: 4, forest: 1, water: 0, desert: 3, jungle: -2, cave: 6 } },
  { name: "검은재규어", emoji: "🐈‍⬛", tier: "rare", tierName: "희귀", scores: { meadow: 0, forest: 4, water: 1, desert: -3, jungle: 6, cave: 3 } }
];

const NATIVE_ANIMALS = {
  meadow: { name: "토착 종달새", emoji: "🐦" }, forest: { name: "토착 다람쥐", emoji: "🐿️" },
  water: { name: "토착 개구리", emoji: "🐸" }, desert: { name: "토착 전갈", emoji: "🦂" },
  jungle: { name: "토착 앵무새", emoji: "🦜" }, cave: { name: "토착 박쥐", emoji: "🦇" }
};

const PLAYER_DATA = [
  { name: "나", avatar: "🧭", title: "현장 생태학자", human: true },
  { name: "마리", avatar: "🔭", title: "조류 연구원" },
  { name: "준", avatar: "🥾", title: "서식지 기록관" },
  { name: "솔", avatar: "📷", title: "야생 사진가" }
];

const dom = {
  board: document.querySelector("#reserve-board"), players: document.querySelector("#players"),
  order: document.querySelector("#turn-order"), legend: document.querySelector("#habitat-legend"),
  score: document.querySelector("#live-score"), phase: document.querySelector("#phase-label"),
  round: document.querySelector("#round-label"), progress: document.querySelector("#progress-bar"),
  status: document.querySelector("#status-text"), count: document.querySelector("#placement-count"),
  detail: document.querySelector("#selection-detail"), controls: document.querySelector("#placement-controls"),
  rotate: document.querySelector("#rotate-button"), log: document.querySelector("#game-log"),
  draftTitle: document.querySelector("#draft-title"), draftKicker: document.querySelector("#draft-kicker"),
  prompt: document.querySelector("#turn-prompt"), cards: document.querySelector("#draft-cards"),
  tutorial: document.querySelector("#tutorial"), scoreModal: document.querySelector("#score-modal"),
  scoreDetails: document.querySelector("#score-details"), result: document.querySelector("#result"),
  resultRanking: document.querySelector("#result-ranking"), resultComment: document.querySelector("#result-comment"),
  stepSelect: document.querySelector("#step-select"), stepPlace: document.querySelector("#step-place"),
  stepScore: document.querySelector("#step-score")
};

let game;
let timers = new Set();
let runId = 0;

function rngFactory(seed) {
  let value = seed >>> 0;
  return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildHabitatDeck(random) {
  const bag = [];
  Object.entries(HABITATS).forEach(([id, habitat]) => {
    for (let i = 0; i < habitat.count; i += 1) bag.push(id);
  });
  const halves = shuffled(bag, random);
  const cards = [];
  for (let i = 0; i < 48; i += 1) {
    const a = halves[i * 2];
    const b = halves[i * 2 + 1];
    const rawValue = HABITATS[a].rarity + HABITATS[b].rarity + random();
    cards.push({ id: `H${i}`, a, b, rawValue, iconsA: 0, iconsB: 0, number: 0, takenBy: null });
  }
  [...cards].sort((x, y) => x.rawValue - y.rawValue).forEach((card, index) => {
    card.number = index + 1;
    const iconTotal = index < 28 ? 0 : index < 44 ? 1 : 2;
    if (iconTotal === 0) return;
    const rarityA = HABITATS[card.a].rarity;
    const rarityB = HABITATS[card.b].rarity;
    if (rarityA === rarityB && iconTotal === 2) {
      card.iconsA = 1;
      card.iconsB = 1;
    } else if (rarityA > rarityB || (rarityA === rarityB && index % 2 === 0)) {
      card.iconsA = iconTotal;
    } else {
      card.iconsB = iconTotal;
    }
    if ([40, 42, 44, 46].includes(index)) {
      card.nativeHalf = HABITATS[card.a].rarity >= HABITATS[card.b].rarity ? "a" : "b";
      const habitat = card.nativeHalf === "a" ? card.a : card.b;
      card.native = { ...NATIVE_ANIMALS[habitat], habitat, score: 3, source: "native" };
    }
  });
  return shuffled(cards, random);
}

function buildAnimalDeck(random) {
  const animals = [...ANIMAL_LIBRARY, ...ANIMAL_LIBRARY].map((animal, index) => ({ ...animal, id: `A${index}`, source: "draft", takenBy: null }));
  const tierOrder = { common: 0, adaptive: 1, rare: 2 };
  [...animals].sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || a.id.localeCompare(b.id)).forEach((animal, index) => { animal.number = index + 1; });
  return shuffled(animals, random);
}

function newPlayer(data) {
  return { ...data, board: Array(25).fill(null), animals: [], dominoes: 0, discards: 0 };
}

function freshGame() {
  const random = rngFactory(20260815);
  return {
    id: ++runId, random, round: 1, phase: "habitat", stage: "select", turnOrder: [0, 1, 2, 3],
    cursor: 0, selections: [], candidates: [], selectedIndex: null, rotation: 0, animalDraftIndex: 0, animalSubdraft: 1,
    habitatDeck: buildHabitatDeck(random), animalDeck: buildAnimalDeck(random), players: PLAYER_DATA.map(newPlayer),
    finished: false, log: ["조사 본부: 5×5 개인 보호구역 조사를 시작합니다."]
  };
}

function clearTimers() {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
}

function schedule(action, delay = 420) {
  const gameId = game.id;
  const timer = setTimeout(() => {
    timers.delete(timer);
    if (game.id === gameId && !game.finished) action();
  }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 20 : delay);
  timers.add(timer);
}

function startPhase(phase) {
  game.phase = phase;
  game.stage = "select";
  game.cursor = 0;
  game.selections = [];
  game.selectedIndex = null;
  game.rotation = 0;
  const offset = phase === "habitat" ? (game.round - 1) * 4 : game.animalDraftIndex * 4;
  const deck = phase === "habitat" ? game.habitatDeck : game.animalDeck;
  game.candidates = deck.slice(offset, offset + 4).sort((a, b) => a.number - b.number);
  advanceTurn();
}

function currentPlayerIndex() { return game.turnOrder[game.cursor]; }

function advanceTurn() {
  game.selectedIndex = game.stage === "place" ? game.selections[game.cursor].candidateIndex : null;
  game.rotation = 0;
  if (game.stage === "place" && game.players[currentPlayerIndex()]?.human) {
    const player = game.players[currentPlayerIndex()];
    const card = game.candidates[game.selectedIndex];
    const cannotPlace = game.phase === "habitat" ? validPlacements(player, card).length === 0 : !player.board.some((cell) => cell && !cell.animal);
    if (cannotPlace) {
      if (game.phase === "habitat") {
        player.discards += 1;
        game.log.unshift(`나: 카드 №${card.number}는 합법 위치가 없어 자동 폐기`);
      } else {
        game.log.unshift(`나: ${card.name}을 놓을 서식지가 없어 기록 제외`);
        recordUnplacedAnimal(player, card);
      }
      finishPlacement();
      return;
    }
  }
  render();
  if (game.players[currentPlayerIndex()]?.human) {
    if (game.stage === "select") dom.cards.querySelector("button:not(:disabled)")?.focus();
    else dom.board.querySelector("button.valid")?.focus();
  } else {
    schedule(botTurn);
  }
}

function neighbors(index) {
  const row = Math.floor(index / 5);
  const col = index % 5;
  return [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
    .filter(([r, c]) => r >= 0 && r < 5 && c >= 0 && c < 5).map(([r, c]) => r * 5 + c);
}

function placementFor(anchor, rotation, card) {
  const deltas = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const row = Math.floor(anchor / 5);
  const col = anchor % 5;
  const [dr, dc] = deltas[rotation];
  const secondRow = row + dr;
  const secondCol = col + dc;
  if (secondRow < 0 || secondRow > 4 || secondCol < 0 || secondCol > 4) return null;
  return [
    { index: anchor, habitat: card.a, icons: card.iconsA, native: card.nativeHalf === "a" ? card.native : null },
    { index: secondRow * 5 + secondCol, habitat: card.b, icons: card.iconsB, native: card.nativeHalf === "b" ? card.native : null }
  ];
}

function isLegalPlacement(player, placement) {
  if (!placement || placement.some((half) => half.index === 12 || player.board[half.index])) return false;
  return placement.some((half) => neighbors(half.index).some((near) => {
    if (near === 12) return true;
    return player.board[near]?.habitat === half.habitat;
  }));
}

function validPlacements(player, card, rotation = null) {
  const results = [];
  const rotations = rotation === null ? [0, 1, 2, 3] : [rotation];
  rotations.forEach((direction) => {
    for (let anchor = 0; anchor < 25; anchor += 1) {
      const placement = placementFor(anchor, direction, card);
      if (isLegalPlacement(player, placement)) results.push({ anchor, rotation: direction, placement });
    }
  });
  return results;
}

function habitatClass(id) { return `hab-${id}`; }

function render() {
  renderHeader(); renderPlayers(); renderBoard(); renderDraft(); renderDetail(); renderLog();
}

function renderHeader() {
  if (game.finished) {
    dom.phase.textContent = "조사 완료";
    dom.round.textContent = "12 / 12";
    dom.progress.style.width = "100%";
  }
  const animalPhase = game.phase === "animal";
  if (!game.finished) {
    const action = game.stage === "select" ? "선택" : animalPhase ? "고정 배치" : "배치";
    const subdraftTotal = game.round % 6 === 0 ? 2 : 1;
    dom.phase.textContent = animalPhase ? `동물 ${action} ${game.round / 3} / 4 · ${game.animalSubdraft} / ${subdraftTotal}` : `서식지 ${action}`;
    dom.round.textContent = animalPhase ? `${game.round}라운드 후` : `${game.round} / 12`;
    dom.progress.style.width = `${Math.min(100, ((game.round - (animalPhase ? 0 : 1)) / 12) * 100)}%`;
  }
  const human = game.players[0];
  dom.score.textContent = scorePlayer(human).total;
  dom.count.textContent = `${human.board.filter(Boolean).length} / 24칸 조사`;
  dom.stepSelect.className = `flow-step${!game.finished && game.stage === "select" ? " active" : game.stage === "place" || game.finished ? " done" : ""}`;
  dom.stepPlace.className = `flow-step${!game.finished && game.stage === "place" ? " active" : game.finished ? " done" : ""}`;
  dom.stepScore.className = `flow-step${game.finished ? " active" : ""}`;
  dom.stepSelect.querySelector("em").textContent = animalPhase ? "동물 선택" : "도미노 선택";
  dom.stepPlace.querySelector("em").textContent = animalPhase ? "동물 고정" : "배치";
}

function renderPlayers() {
  const activeIndex = currentPlayerIndex();
  const scores = game.players.map((player, index) => ({ player, index, score: scorePlayer(player).total }));
  dom.players.innerHTML = scores.map(({ player, index, score }) => `
    <li class="player-row${index === activeIndex && !game.finished ? " active" : ""}">
      <span class="avatar" aria-hidden="true">${player.avatar}</span>
      <span><strong class="player-name">${player.name}</strong><span class="player-meta">${player.title} · 🐾 ${player.animals.filter((animal) => animal.source === "draft").length}/6 · 토착 ${player.animals.filter((animal) => animal.source === "native").length}</span></span>
      <strong class="player-score">${score}</strong>
    </li>`).join("");
  dom.order.innerHTML = game.turnOrder.map((index, orderIndex) => `<span class="order-token${orderIndex === game.cursor ? " current" : ""}" title="${game.players[index].name}">${game.players[index].avatar}</span>`).join("");
}

function renderBoard() {
  const player = game.players[0];
  const selected = game.selectedIndex === null ? null : game.candidates[game.selectedIndex];
  const validAnchors = new Set();
  if (player.human && currentPlayerIndex() === 0 && selected && game.stage === "place") {
    if (game.phase === "habitat") validPlacements(player, selected, game.rotation).forEach((item) => validAnchors.add(item.anchor));
    else player.board.forEach((cell, index) => { if (cell && !cell.animal) validAnchors.add(index); });
  }
  dom.board.innerHTML = player.board.map((cell, index) => {
    if (index === 12) return `<button class="map-cell camp" type="button" role="gridcell" aria-label="중앙 조사 캠프" disabled><span aria-hidden="true">⛺</span></button>`;
    const valid = validAnchors.has(index);
    const label = cell ? `${index + 1}번 칸, ${HABITATS[cell.habitat].name}, 생태 아이콘 ${cell.icons}개${cell.animal ? `, ${cell.animal.source === "native" ? "토착 동물 점유, " : ""}${cell.animal.name}` : ""}` : `${index + 1}번 빈 칸${valid ? ", 배치 가능" : ""}`;
    return `<button class="map-cell ${cell ? habitatClass(cell.habitat) : "empty"}${valid ? " valid" : ""}" type="button" role="gridcell" data-cell="${index}" aria-label="${label}" ${valid ? "" : "disabled"}>
      ${cell ? `<span class="habitat-symbol" aria-hidden="true">${HABITATS[cell.habitat].symbol}</span><span class="eco-icons" aria-hidden="true">${"●".repeat(cell.icons)}</span>${cell.animal ? `<span class="animal-pin${cell.animal.source === "native" ? " native" : ""}" aria-hidden="true"><span>${cell.animal.emoji}</span></span>` : ""}` : `<span class="cell-index">${index + 1}</span>`}
    </button>`;
  }).join("");
  const selectedCard = game.selectedIndex === null ? null : game.candidates[game.selectedIndex];
  if (game.finished) dom.status.textContent = "12라운드 보호구역 조사가 완료되었습니다.";
  else if (currentPlayerIndex() !== 0) dom.status.textContent = `${game.players[currentPlayerIndex()].name} ${game.stage === "select" ? "선택" : "배치"} 중…`;
  else if (game.stage === "select") dom.status.textContent = `${game.phase === "habitat" ? "서식지 도미노" : "동물"} 카드를 먼저 예약하세요.`;
  else if (!selectedCard) dom.status.textContent = "선택한 카드를 확인하는 중입니다.";
  else dom.status.textContent = game.phase === "habitat" ? "강조된 칸을 선택하세요. 같은 서식지나 캠프에 닿아야 합니다." : "동물을 고정할 기존 서식지 칸을 선택하세요.";
}

function clearDominoPreview() {
  dom.board.querySelectorAll(".map-cell.preview").forEach((cell) => {
    cell.classList.remove("preview");
    cell.style.removeProperty("--preview-color");
    delete cell.dataset.previewSymbol;
    delete cell.dataset.previewIcons;
  });
}

function showDominoPreview(anchor) {
  clearDominoPreview();
  if (game.phase !== "habitat" || game.stage !== "place" || currentPlayerIndex() !== 0 || game.selectedIndex === null) return;
  const card = game.candidates[game.selectedIndex];
  const placement = placementFor(anchor, game.rotation, card);
  if (!isLegalPlacement(game.players[0], placement)) return;
  placement.forEach((half) => {
    const cell = dom.board.querySelector(`[data-cell="${half.index}"]`);
    if (!cell) return;
    cell.classList.add("preview");
    cell.style.setProperty("--preview-color", HABITATS[half.habitat].color);
    cell.dataset.previewSymbol = `${HABITATS[half.habitat].symbol}${half.native ? ` ${half.native.emoji}` : ""}`;
    cell.dataset.previewIcons = "●".repeat(half.icons);
  });
}

function renderDraft() {
  if (game.finished) {
    dom.draftTitle.textContent = "조사 완료";
    dom.draftKicker.textContent = "SURVEY ARCHIVED";
    dom.prompt.textContent = "최종 조사 기록을 정리했습니다.";
    dom.cards.innerHTML = "";
    return;
  }
  const humanTurn = currentPlayerIndex() === 0 && game.stage === "select" && !game.finished;
  const animalSubdraftLabel = `${game.animalSubdraft}/${game.round % 6 === 0 ? 2 : 1}`;
  dom.draftTitle.textContent = game.phase === "habitat" ? `공개 서식지 카드 · ${game.stage === "select" ? "선택" : "번호순 배치"}` : `공개 동물 카드 ${animalSubdraftLabel} · ${game.stage === "select" ? "선택" : "번호순 고정"}`;
  dom.draftKicker.textContent = game.phase === "habitat" ? "HABITAT SURVEY" : "WILDLIFE DRAFT";
  dom.prompt.textContent = humanTurn ? "당신의 선택입니다." : `${game.players[currentPlayerIndex()]?.name || "조사대"} ${game.stage === "select" ? "선택" : "배치"} 중…`;
  dom.cards.innerHTML = game.candidates.map((card, index) => {
    const unavailable = card.takenBy !== null || !humanTurn;
    const owner = card.takenBy === null ? "" : `<span class="card-owner">${game.players[card.takenBy].avatar} ${game.players[card.takenBy].name}</span>`;
    const classes = `${game.selectedIndex === index ? " selected" : ""}${card.takenBy !== null ? " reserved" : ""}`;
    if (game.phase === "animal") {
      const guide = animalInsight(card);
      return `<button class="draft-card animal-card${classes}" data-card="${index}" type="button" ${unavailable ? "disabled" : ""}>
        <span class="card-number">№ ${card.number}</span><span class="animal-face" aria-hidden="true">${card.emoji}</span><strong>${card.name}</strong><small>선호 ${guide.preferred} · 기피 ${guide.avoided}</small><span class="tier ${card.tier}">${card.tierName}</span>${owner}
      </button>`;
    }
    return `<button class="draft-card${classes}" data-card="${index}" type="button" ${unavailable ? "disabled" : ""}>
      <span class="card-number">№ ${card.number}</span><span class="card-domino" aria-hidden="true"><i class="card-half ${habitatClass(card.a)}">${HABITATS[card.a].symbol}<small>${"●".repeat(card.iconsA)}</small></i><i class="card-half ${habitatClass(card.b)}">${HABITATS[card.b].symbol}<small>${"●".repeat(card.iconsB)}</small></i></span>
      <strong>${HABITATS[card.a].name} · ${HABITATS[card.b].name}</strong><small>생태 아이콘 ${card.iconsA + card.iconsB}개</small>${card.native ? `<span class="native-card-badge">${card.native.emoji} 토착 동물 +3</span>` : ""}${owner}
    </button>`;
  }).join("");
}

function animalInsight(card) {
  const entries = Object.entries(card.scores);
  const best = Math.max(...entries.map(([, score]) => score));
  const preferred = entries.filter(([, score]) => score === best).map(([id]) => HABITATS[id].name).join("·") + ` +${best}`;
  const avoidedEntries = entries.filter(([, score]) => score < 0);
  const avoided = avoidedEntries.length ? avoidedEntries.map(([id, score]) => `${HABITATS[id].name} ${score}`).join("·") : "없음";
  const neutral = entries.filter(([, score]) => score === 0).map(([id]) => `${HABITATS[id].name} 0`).join("·") || "없음";
  const general = entries.filter(([, score]) => score > 0 && score < best).map(([id, score]) => `${HABITATS[id].name} +${score}`).join(" · ");
  return { preferred, avoided, neutral, general };
}

function renderDetail() {
  if (game.finished) {
    dom.controls.hidden = true;
    dom.detail.className = "selection-detail empty-state";
    dom.detail.textContent = "조사가 완료되었습니다. 점수 상세에서 연결 영역과 동물 점수를 확인하세요.";
    return;
  }
  const card = game.selectedIndex === null ? null : game.candidates[game.selectedIndex];
  dom.controls.hidden = !(card && game.phase === "habitat" && game.stage === "place" && currentPlayerIndex() === 0);
  if (!card) {
    dom.detail.className = "selection-detail empty-state";
    dom.detail.textContent = currentPlayerIndex() === 0 ? "카드를 고르면 이곳에 조사 정보가 표시됩니다." : "다른 조사대원이 기록 중입니다.";
    return;
  }
  dom.detail.className = "selection-detail";
  if (game.phase === "animal") {
    const guide = animalInsight(card);
    dom.detail.innerHTML = `<div class="animal-face" aria-hidden="true">${card.emoji}</div><h3>${card.name} · ${card.tierName}</h3><div class="animal-score-guide"><span><b>선호</b> ${guide.preferred}</span><span><b>기피</b> ${guide.avoided}</span><span><b>중립</b> ${guide.neutral}</span><span><b>일반</b> ${guide.general || "없음"}</span></div><p class="detail-copy">놓은 칸의 서식지 점수 하나만 사용합니다. 영역 크기와 아이콘은 동물 점수에 영향이 없고, 등급은 성향 표시이므로 실제 점수표를 확인하세요. 드래프트 동물 6마리가 각각 1점 이상이면 +5점입니다.</p>`;
  } else {
    dom.detail.innerHTML = `<div class="domino-preview" style="transform:rotate(${game.rotation * 90}deg)"><i class="preview-half ${habitatClass(card.a)}">${HABITATS[card.a].symbol}${card.nativeHalf === "a" ? ` ${card.native.emoji}` : ""}</i><i class="preview-half ${habitatClass(card.b)}">${HABITATS[card.b].symbol}${card.nativeHalf === "b" ? ` ${card.native.emoji}` : ""}</i></div><p class="detail-copy">카드 №${card.number} · 아이콘 ${card.iconsA + card.iconsB}개${card.native ? `<br>${card.native.emoji} 토착 동물: 해당 칸 점유 · 고정 +3점` : ""}<br>현재 방향 ${game.rotation * 90}°</p>`;
  }
}

function renderLog() { dom.log.innerHTML = game.log.slice(0, 8).map((entry) => `<li>${entry}</li>`).join(""); }

function chooseCard(index) {
  if (game.stage !== "select" || currentPlayerIndex() !== 0 || game.candidates[index]?.takenBy !== null) return;
  recordSelection(index);
}

function rotateDomino() {
  if (game.phase !== "habitat" || game.stage !== "place" || game.selectedIndex === null || currentPlayerIndex() !== 0) return;
  game.rotation = (game.rotation + 1) % 4;
  render();
}

function placeHuman(index) {
  if (game.stage !== "place" || currentPlayerIndex() !== 0 || game.selectedIndex === null) return;
  const player = game.players[0];
  const card = game.candidates[game.selectedIndex];
  if (game.phase === "habitat") {
    const placement = placementFor(index, game.rotation, card);
    if (!isLegalPlacement(player, placement)) return;
    applyHabitat(player, placement);
    player.dominoes += 1;
    game.log.unshift(`나: 카드 №${card.number} 배치 · ${HABITATS[card.a].name}/${HABITATS[card.b].name}`);
  } else {
    if (!player.board[index] || player.board[index].animal) return;
    applyAnimal(player, card, index);
    game.log.unshift(`나: ${HABITATS[player.board[index].habitat].name}에 ${card.name} 고정`);
  }
  finishPlacement();
}

function applyHabitat(player, placement) {
  placement.forEach((half) => {
    const native = half.native ? { ...half.native, placed: true, cell: half.index } : null;
    player.board[half.index] = { habitat: half.habitat, icons: half.icons, animal: native };
    if (native) player.animals.push(native);
  });
}

function applyAnimal(player, animal, index) {
  const score = animal.scores[player.board[index].habitat];
  const placed = { ...animal, source: "draft", placed: true, cell: index, habitat: player.board[index].habitat, score };
  player.board[index].animal = placed;
  player.animals.push(placed);
}

function recordUnplacedAnimal(player, animal) {
  player.animals.push({ ...animal, source: "draft", placed: false, cell: null, habitat: null, score: 0 });
}

function botTurn() {
  const playerIndex = currentPlayerIndex();
  const player = game.players[playerIndex];
  if (game.stage === "select") {
    const available = game.candidates.map((card, index) => card.takenBy === null ? { card, index } : null).filter(Boolean);
    let choice;
    if (game.phase === "habitat") {
      const options = available.map((entry) => {
        const placements = validPlacements(player, entry.card);
        const bestPlacement = placements.sort((a, b) => placementUtility(player, b) - placementUtility(player, a))[0];
        return { ...entry, utility: bestPlacement ? placementUtility(player, bestPlacement) + entry.card.iconsA + entry.card.iconsB : -100 };
      });
      choice = options.sort((a, b) => b.utility - a.utility || a.card.number - b.card.number)[0];
    } else {
      const openCells = player.board.map((cell, index) => cell && !cell.animal ? index : null).filter((index) => index !== null);
      const options = available.map((entry) => ({ ...entry, utility: Math.max(...openCells.map((cell) => entry.card.scores[player.board[cell].habitat])) }));
      choice = options.sort((a, b) => b.utility - a.utility || a.card.number - b.card.number)[0];
    }
    recordSelection(choice.index);
    return;
  }

  const selection = game.selections[game.cursor];
  const choice = { card: selection.card, index: selection.candidateIndex };
  if (game.phase === "habitat") {
    const placements = validPlacements(player, choice.card);
    const bestPlacement = placements.sort((a, b) => placementUtility(player, b) - placementUtility(player, a))[0];
    if (bestPlacement) {
      applyHabitat(player, bestPlacement.placement);
      player.dominoes += 1;
      game.log.unshift(`${player.name}: 카드 №${choice.card.number} 배치`);
    } else {
      player.discards += 1;
      game.log.unshift(`${player.name}: 합법 위치 없음 · 자동 폐기`);
    }
  } else {
    const openCells = player.board.map((cell, index) => cell && !cell.animal ? index : null).filter((index) => index !== null);
    const bestCell = openCells.map((cell) => ({ cell, utility: choice.card.scores[player.board[cell].habitat] })).sort((a, b) => b.utility - a.utility)[0];
    if (bestCell) {
      applyAnimal(player, choice.card, bestCell.cell);
      game.log.unshift(`${player.name}: ${choice.card.name} 고정 (${bestCell.utility > 0 ? "+" : ""}${bestCell.utility})`);
    } else {
      recordUnplacedAnimal(player, choice.card);
      game.log.unshift(`${player.name}: ${choice.card.name} 배치 칸 없음 (0)`);
    }
  }
  finishPlacement();
}

function placementUtility(player, option) {
  let value = 0;
  option.placement.forEach((half) => {
    value += half.icons * 2;
    value += neighbors(half.index).filter((near) => player.board[near]?.habitat === half.habitat).length * 3;
  });
  return value;
}

function recordSelection(candidateIndex) {
  const playerIndex = currentPlayerIndex();
  const card = game.candidates[candidateIndex];
  card.takenBy = playerIndex;
  game.selections.push({ playerIndex, number: card.number, candidateIndex, card });
  game.log.unshift(`${game.players[playerIndex].name}: ${game.phase === "habitat" ? `카드 №${card.number}` : `${card.name} №${card.number}`} 예약`);
  game.cursor += 1;
  game.selectedIndex = null;
  if (game.cursor < 4) {
    advanceTurn();
    return;
  }
  game.selections.sort((a, b) => a.number - b.number);
  game.turnOrder = game.selections.map((entry) => entry.playerIndex);
  game.stage = "place";
  game.cursor = 0;
  game.log.unshift("선택 완료: 낮은 카드 번호부터 배치를 시작합니다.");
  advanceTurn();
}

function finishPlacement() {
  game.cursor += 1;
  game.selectedIndex = null;
  if (game.cursor < 4) {
    advanceTurn();
    return;
  }
  if (game.phase === "habitat" && game.round % 3 === 0) {
    game.animalSubdraft = 1;
    game.log.unshift(`동물 조사 ${game.round / 3}: 공개 후보가 도착했습니다.`);
    startPhase("animal");
  } else if (game.phase === "animal") {
    const subdraftTotal = game.round % 6 === 0 ? 2 : 1;
    game.animalDraftIndex += 1;
    if (game.animalSubdraft < subdraftTotal) {
      game.animalSubdraft += 1;
      game.log.unshift(`동물 조사 ${game.round / 3}-${game.animalSubdraft}: 다음 소드래프트를 시작합니다.`);
      startPhase("animal");
    } else if (game.round === 12) finishGame();
    else { game.round += 1; startPhase("habitat"); }
  } else {
    game.round += 1;
    startPhase("habitat");
  }
}

function habitatBreakdown(player) {
  const result = {};
  Object.keys(HABITATS).forEach((habitat) => {
    const visited = new Set();
    const regions = [];
    player.board.forEach((cell, start) => {
      if (!cell || cell.habitat !== habitat || visited.has(start)) return;
      const stack = [start];
      let size = 0;
      let icons = 0;
      visited.add(start);
      while (stack.length) {
        const index = stack.pop();
        size += 1;
        icons += player.board[index].icons;
        neighbors(index).forEach((near) => {
          if (!visited.has(near) && player.board[near]?.habitat === habitat) { visited.add(near); stack.push(near); }
        });
      }
      regions.push({ size, icons, score: size * icons });
    });
    result[habitat] = { regions, score: regions.reduce((sum, region) => sum + region.score, 0) };
  });
  return result;
}

function scorePlayer(player) {
  const habitats = habitatBreakdown(player);
  const habitatScore = Object.values(habitats).reduce((sum, item) => sum + item.score, 0);
  const draftAnimalScore = player.animals.filter((animal) => animal.source === "draft").reduce((sum, animal) => sum + animal.score, 0);
  const nativeAnimalScore = player.animals.filter((animal) => animal.source === "native").reduce((sum, animal) => sum + animal.score, 0);
  const animalScore = draftAnimalScore + nativeAnimalScore;
  const completeBonus = player.dominoes === 12 && player.discards === 0 ? 5 : 0;
  const draftAnimals = player.animals.filter((animal) => animal.source === "draft");
  const positiveBonus = draftAnimals.length === 6 && draftAnimals.every((animal) => animal.score > 0) ? 5 : 0;
  return { habitats, habitatScore, animalScore, draftAnimalScore, nativeAnimalScore, completeBonus, positiveBonus, total: habitatScore + animalScore + completeBonus + positiveBonus };
}

function finishGame() {
  clearTimers();
  game.finished = true;
  game.phase = "finished";
  render();
  const ranking = game.players.map((player, index) => ({ player, index, score: scorePlayer(player).total })).sort((a, b) => b.score - a.score || a.index - b.index);
  dom.resultRanking.innerHTML = ranking.map(({ player, score }) => {
    const rank = ranking.findIndex((entry) => entry.score === score) + 1;
    return `<div class="result-row"><strong>${rank}위</strong><span>${player.avatar} ${player.name}</span><strong>${score}점</strong></div>`;
  }).join("");
  const humanScore = scorePlayer(game.players[0]).total;
  const humanRank = ranking.findIndex((entry) => entry.score === humanScore) + 1;
  dom.resultComment.textContent = humanRank === 1 ? "보호구역의 연결성과 동물 적합도가 가장 뛰어납니다. 공동 최고점도 함께 1위입니다." : `${humanRank}위입니다. 점수 상세에서 분리된 서식지 영역과 동물의 기피 서식지를 확인해 보세요.`;
  openModal(dom.result, "#play-again-button");
}

function renderScoreDetails() {
  dom.scoreDetails.innerHTML = game.players.map((player) => {
    const score = scorePlayer(player);
    const habitatRows = Object.entries(score.habitats).map(([id, item]) => {
      const formula = item.regions.length ? item.regions.map((region) => `${region.size}×${region.icons}`).join(" + ") : "0×0";
      return `<span>${HABITATS[id].name} ${formula}</span><strong>${item.score}</strong>`;
    }).join("");
    const draftCount = player.animals.filter((animal) => animal.source === "draft").length;
    const nativeCount = player.animals.filter((animal) => animal.source === "native").length;
    return `<details class="score-player"${player.human ? " open" : ""}><summary>${player.avatar} ${player.name} — ${score.total}점</summary><div class="score-grid">${habitatRows}<span>드래프트 동물 ${draftCount}/6</span><strong>${score.draftAnimalScore}</strong><span>토착 동물 ${nativeCount}</span><strong>${score.nativeAnimalScore}</strong><span>12도미노 완전배치</span><strong>${score.completeBonus}</strong><span>드래프트 동물 6마리 모두 양수</span><strong>${score.positiveBonus}</strong></div></details>`;
  }).join("");
}

function openModal(element, focusSelector) {
  element.hidden = false;
  document.querySelector(".topbar").inert = true;
  document.querySelector(".app-shell").inert = true;
  element.querySelector(focusSelector)?.focus();
}

function closeModal(element) {
  element.hidden = true;
  document.querySelector(".topbar").inert = false;
  document.querySelector(".app-shell").inert = false;
}

function restart(showTutorial = false) {
  clearTimers();
  closeModal(dom.result);
  closeModal(dom.scoreModal);
  closeModal(dom.tutorial);
  game = freshGame();
  startPhase("habitat");
  if (showTutorial) openModal(dom.tutorial, "#start-button");
}

dom.legend.innerHTML = Object.entries(HABITATS).map(([id, habitat]) => `<div class="legend-row"><i class="legend-swatch" style="--habitat:${habitat.color}"></i><span>${habitat.name}</span><em>${habitat.count}/96</em></div>`).join("");
dom.cards.addEventListener("click", (event) => { const card = event.target.closest("[data-card]"); if (card) chooseCard(Number(card.dataset.card)); });
dom.board.addEventListener("click", (event) => { const cell = event.target.closest("[data-cell]"); if (cell) placeHuman(Number(cell.dataset.cell)); });
dom.board.addEventListener("mouseover", (event) => { const cell = event.target.closest(".map-cell.valid"); if (cell) showDominoPreview(Number(cell.dataset.cell)); });
dom.board.addEventListener("mouseout", (event) => { const cell = event.target.closest(".map-cell.valid"); if (cell && !cell.contains(event.relatedTarget)) clearDominoPreview(); });
dom.board.addEventListener("focusin", (event) => { const cell = event.target.closest(".map-cell.valid"); if (cell) showDominoPreview(Number(cell.dataset.cell)); });
dom.board.addEventListener("focusout", (event) => { const cell = event.target.closest(".map-cell.valid"); if (cell && !cell.contains(event.relatedTarget)) clearDominoPreview(); });
dom.rotate.addEventListener("click", rotateDomino);
document.querySelector("#restart-button").addEventListener("click", () => restart(false));
document.querySelector("#play-again-button").addEventListener("click", () => restart(false));
document.querySelector("#help-button").addEventListener("click", () => openModal(dom.tutorial, "#start-button"));
document.querySelector("#start-button").addEventListener("click", () => { closeModal(dom.tutorial); dom.cards.querySelector("button:not(:disabled)")?.focus(); });
document.querySelector("#score-button").addEventListener("click", () => { renderScoreDetails(); openModal(dom.scoreModal, ".close-button"); });
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => closeModal(document.querySelector(`#${button.dataset.close}`))));
document.addEventListener("keydown", (event) => {
  if ((event.key === "r" || event.key === "R") && !dom.tutorial.hidden) return;
  if ((event.key === "r" || event.key === "R") && game.phase === "habitat") { event.preventDefault(); rotateDomino(); }
  if (event.key === "Escape") {
    if (!dom.tutorial.hidden) closeModal(dom.tutorial);
    else if (!dom.scoreModal.hidden) closeModal(dom.scoreModal);
    else if (!dom.result.hidden) closeModal(dom.result);
  }
});

restart(true);
