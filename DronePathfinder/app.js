(function () {
if (!window.THREE) {
  document.body.insertAdjacentHTML(
    "afterbegin",
    "<p style=\"margin:16px;color:#f4c15d\">Three.js did not load. Check your network connection and reload.</p>"
  );
  return;
}

function SimpleOrbit(camera, dom, opts) {
  const target = opts.target.clone();
  const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function apply() {
    spherical.phi = Math.max(0.08, Math.min(opts.maxPolarAngle, spherical.phi));
    spherical.radius = Math.max(opts.minDistance, Math.min(opts.maxDistance, spherical.radius));
    camera.position.setFromSpherical(spherical).add(target);
    camera.lookAt(target);
  }

  dom.addEventListener("pointerdown", (evt) => {
    if (evt.button !== 0) return;
    dragging = true;
    lastX = evt.clientX;
    lastY = evt.clientY;
  });
  dom.addEventListener("pointermove", (evt) => {
    if (!dragging) return;
    spherical.theta -= (evt.clientX - lastX) * 0.005;
    spherical.phi -= (evt.clientY - lastY) * 0.005;
    lastX = evt.clientX;
    lastY = evt.clientY;
    apply();
  });
  window.addEventListener("pointerup", () => {
    dragging = false;
  });
  dom.addEventListener(
    "wheel",
    (evt) => {
      evt.preventDefault();
      spherical.radius *= 1 + Math.sign(evt.deltaY) * 0.08;
      apply();
    },
    { passive: false }
  );
  apply();
  return { update: apply, target };
}

const canvas = document.getElementById("field");
const logEl = document.getElementById("log");
const phasePill = document.getElementById("phase-pill");
const rockPill = document.getElementById("rock-pill");
const weedPill = document.getElementById("weed-pill");
const pestPill = document.getElementById("pest-pill");
const standPill = document.getElementById("stand-pill");
const fruitPill = document.getElementById("fruit-pill");
const pollPill = document.getElementById("poll-pill");
const seasonPill = document.getElementById("season-pill");
const pathPill = document.getElementById("path-pill");
const rockCountInput = document.getElementById("rock-count");
const rockCountOut = document.getElementById("rock-count-out");
const plantCountInput = document.getElementById("plant-count");
const plantCountOut = document.getElementById("plant-count-out");
const weedCountInput = document.getElementById("weed-count");
const weedCountOut = document.getElementById("weed-count-out");
const scanSpeedInput = document.getElementById("scan-speed");
const scanSpeedOut = document.getElementById("scan-speed-out");
const seedInput = document.getElementById("seed");
const MISSION_CONTROL_MAX = 100;

function clampMissionControl(input, fallback = 0) {
  const raw = Number(input.value);
  const n = Number.isFinite(raw) ? raw : fallback;
  const min = Number(input.min);
  const lo = Number.isFinite(min) ? min : 0;
  const hi = MISSION_CONTROL_MAX;
  const clamped = Math.min(hi, Math.max(lo, n));
  if (String(input.value) !== String(clamped)) input.value = String(clamped);
  return clamped;
}

function seedPlantedCount() {
  return clampMissionControl(plantCountInput, 36);
}

function transplantedCount() {
  return state.plants.filter((p) => p.transplanted).length;
}

function setSeedPlantedCount(n) {
  const v = Math.max(0, Math.min(MISSION_CONTROL_MAX, Math.round(n)));
  plantCountInput.value = String(v);
  if (plantCountOut) plantCountOut.textContent = String(v);
}

function syncMissionControlOutputs() {
  rockCountOut.textContent = String(clampMissionControl(rockCountInput, 12));
  plantCountOut.textContent = String(seedPlantedCount());
  weedCountOut.textContent = String(clampMissionControl(weedCountInput, 10));
  scanSpeedOut.textContent = String(clampMissionControl(scanSpeedInput, 4));
  clampMissionControl(seedInput, 1);
  if (typeof updatePlantingStats === "function") updatePlantingStats();
}

const WORLD = { w: 80, h: 52 };
const FIELD_M2 = WORLD.w * WORLD.h;
const M2_PER_ACRE = 4046.86;
const PAD = { x: 6, y: 46 };
const SCAN_RADIUS = 7;
const FLY_HEIGHT = 4.4;

const state = {
  rocks: [],
  weeds: [],
  pests: [],
  plants: [],
  plantedSlots: 0,
  dormantSites: [],
  nutritionApplied: false,
  drone: { x: PAD.x, y: PAD.y, heading: -Math.PI / 2, alt: FLY_HEIGHT },
  phase: "idle",
  scanPath: [],
  scanIndex: 0,
  pickupPath: [],
  pickupIndex: 0,
  weedPath: [],
  treatIndex: 0,
  pestPath: [],
  treatPestIndex: 0,
  treatAllPath: [],
  treatAllIndex: 0,
  treatedPests: 0,
  irrigatePasses: 0,
  plantPath: [],
  plantIndex: 0,
  plantMission: null,
  fieldRows: [],
  terrainFlat: false,
  trail: [{ x: PAD.x, y: PAD.y }],
  lastTs: 0,
  mode: "field",
  yearProgress: 0.08,
  farmYear: 1,
  clockRunning: false,
  seasonIndex: 0,
  seasonScale: 0.55,
  seasonScaleTarget: 0.55,
  scanKind: "field",
  winterHazardsYear: null,
  summerPestsYear: null,
  harvestedFruit: 0,
  harvestThisPass: 0,
  harvestPlantsThisPass: 0,
  pestMissedIrrigations: 0,
};

const hiddenRocks = new THREE.MeshLambertMaterial({ color: 0x8a7352 });
const foundRocks = new THREE.MeshLambertMaterial({ color: 0xd7b07a });
const hiddenWeeds = new THREE.MeshLambertMaterial({ color: 0x4a7a38 });
const foundWeeds = new THREE.MeshLambertMaterial({ color: 0x7fd64a });
const foundWeedStem = new THREE.MeshLambertMaterial({ color: 0x4a8f2e });
const hiddenWeedStem = new THREE.MeshLambertMaterial({ color: 0x243322 });
const treatedWeeds = new THREE.MeshLambertMaterial({ color: 0x6b5340 });
const treatedWeedStem = new THREE.MeshLambertMaterial({ color: 0x4a3b2c });
const hiddenPests = new THREE.MeshLambertMaterial({ color: 0x3a2818 });
const foundPests = new THREE.MeshLambertMaterial({ color: 0xc45a2a });
const hiddenPestWing = new THREE.MeshLambertMaterial({ color: 0x2a2010 });
const foundPestWing = new THREE.MeshLambertMaterial({ color: 0x8a4a28 });
const hiddenDisease = new THREE.MeshLambertMaterial({ color: 0x4a4020 });
const foundDisease = new THREE.MeshLambertMaterial({ color: 0xe0c14a });
const hiddenDiseaseSpot = new THREE.MeshLambertMaterial({ color: 0x3a3018 });
const foundDiseaseSpot = new THREE.MeshLambertMaterial({ color: 0xb85a2a });
const hiddenCrops = new THREE.MeshLambertMaterial({ color: 0x1e3326 });
const foundCrops = new THREE.MeshLambertMaterial({ color: 0xc6e86a });
const wetCrops = new THREE.MeshLambertMaterial({ color: 0x5ad4a0, emissive: 0x0a3324 });
const flowerMat = new THREE.MeshLambertMaterial({ color: 0xf4e27a });
const pollinatedFlowerMat = new THREE.MeshLambertMaterial({ color: 0xf2a0c4 });
const flowerPetalMat = new THREE.MeshLambertMaterial({ color: 0xfff3ad });
const flowerHeartMat = new THREE.MeshLambertMaterial({ color: 0xf0b429 });
const pollinatedPetalMat = new THREE.MeshLambertMaterial({ color: 0xff8cc8 });
const pollinatedHeartMat = new THREE.MeshLambertMaterial({ color: 0xffcc55 });
const winterStem = new THREE.MeshLambertMaterial({ color: 0x8a9a88 });
const blossomPetalGeo = new THREE.SphereGeometry(0.1, 8, 6);
const blossomHeartGeo = new THREE.SphereGeometry(0.052, 8, 6);
const blossomSepalGeo = new THREE.ConeGeometry(0.072, 0.085, 5);
const melonGeo = new THREE.SphereGeometry(1, 18, 14);

function makeMelonStripeTexture(baseHex, stripeHex, bands) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const bandW = canvas.width / bands;
  ctx.fillStyle = stripeHex;
  for (let i = 0; i < bands; i += 1) {
    ctx.fillRect(i * bandW, 0, bandW * 0.42, canvas.height);
  }
  const poles = ctx.createLinearGradient(0, 0, 0, canvas.height);
  poles.addColorStop(0, "rgba(255,255,255,0.16)");
  poles.addColorStop(0.2, "rgba(255,255,255,0)");
  poles.addColorStop(0.8, "rgba(255,255,255,0)");
  poles.addColorStop(1, "rgba(255,255,255,0.16)");
  ctx.fillStyle = poles;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const melonGreenMat = new THREE.MeshLambertMaterial({
  map: makeMelonStripeTexture("#4cae3a", "#245a22", 10),
  color: 0xffffff,
});
const melonMidMat = new THREE.MeshLambertMaterial({
  map: makeMelonStripeTexture("#9ccc3d", "#5a8a22", 10),
  color: 0xffffff,
});
const melonRipeMat = new THREE.MeshLambertMaterial({
  map: makeMelonStripeTexture("#e8b14a", "#c45a22", 10),
  color: 0xffffff,
});

const SEASONS = [
  {
    name: "Spring",
    cycle: "Planting & emergence",
    terrain: 0x1b3a2a,
    crop: 0xc6e86a,
    hiddenCrop: 0x6b8f3a,
    bg: 0x071018,
    scale: 1.22,
    stemMul: 1.05,
    leaves: 3,
    weedScale: 1.05,
  },
  {
    name: "Summer",
    cycle: "Vegetative growth",
    terrain: 0x2f5c22,
    crop: 0x7fce3a,
    hiddenCrop: 0x4f7a28,
    bg: 0x0a1810,
    scale: 1.95,
    stemMul: 1.7,
    leaves: 5,
    weedScale: 1.45,
  },
  {
    name: "Fall",
    cycle: "Grain fill & harvest",
    terrain: 0x4a3a16,
    crop: 0xd4a84a,
    hiddenCrop: 0x8a6a28,
    bg: 0x140e08,
    scale: 1.58,
    stemMul: 1.4,
    leaves: 4,
    weedScale: 1.2,
  },
  {
    name: "Winter",
    cycle: "Dormant rest",
    terrain: 0x2a3844,
    crop: 0xd5e0d8,
    hiddenCrop: 0x8a9a88,
    bg: 0x0a1016,
    scale: 0.92,
    stemMul: 0.72,
    leaves: 2,
    weedScale: 1.35,
  },
];
const FIELD_MODES = ["field", "rocks", "weeds", "irrigate", "pests", "prepare"];
const PLANTING_MODES = ["planting", "stand", "poll1", "poll2", "poll3", "fruitcount", "harvest"];
const SECONDS_PER_YEAR = 40;
const IRRIGATE_VIGOR_MAX = 5;
const IRRIGATE_SCALE_PER = 0.28;
const WEED_EMERGE_PER = 1.2;
const WEED_EMERGE_EMPTY_MIN = 6;
const IRRIGATE_EMERGE_FRAC = 0.22;
const IRRIGATE_EMERGE_MIN = 3;
const IRRIGATE_EMERGE_MAX = 12;
const IRRIGATE_WEED_FRAC = 0.32;
const IRRIGATE_WEED_MIN = 3;
const IRRIGATE_PEST_MIN = 3;
const PICKUP_SEC_PER_ROCK = 45;
const TREAT_SEC_PER_WEED = 36;

function currentSeasonIndex() {
  return Math.min(3, Math.floor(((state.yearProgress % 1) + 1) % 1 * 4));
}

function plantDisplayScale(plant, baseScale) {
  const vigor = plant && plant.vigor ? Math.min(IRRIGATE_VIGOR_MAX, plant.vigor) : 0;
  const irrigateBoost = 1 + vigor * IRRIGATE_SCALE_PER;
  const transplantBoost = plant && plant.transplanted ? 1.06 : 1;
  return baseScale * irrigateBoost * transplantBoost;
}

function applyPlantScales(baseScale) {
  const scale = baseScale != null ? baseScale : state.seasonScale;
  plantGroup.children.forEach((group, i) => {
    const plant = state.plants[i];
    group.scale.setScalar(plantDisplayScale(plant, scale));
  });
}

function applySeasonLook() {
  const season = SEASONS[state.seasonIndex] || SEASONS[0];
  const terrain = groundGroup.getObjectByName("terrain");
  if (terrain && terrain.material && terrain.material.color) {
    terrain.material.color.setHex(season.terrain);
  }
  scene.background.setHex(season.bg);
  if (scene.fog) scene.fog.color.setHex(season.bg);
  foundCrops.color.setHex(season.crop);
  hiddenCrops.color.setHex(season.hiddenCrop);
  const wetTint = [0x5ad4a0, 0x3ec86a, 0xc4b24a, 0xb8c8c0][state.seasonIndex] || 0x5ad4a0;
  wetCrops.color.setHex(wetTint);
  winterStem.color.setHex(season.hiddenCrop);
  state.seasonScaleTarget = season.scale;
  if (state.seasonScale == null) state.seasonScale = season.scale;
  applyPlantScales(state.seasonScale);
  let visibleWeed = 0;
  weedGroup.children.forEach((group) => {
    const weed = state.weeds.find((w) => w.id === group.userData.weedId);
    if (weed && weed.treated) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.scale.setScalar(season.weedScale);
    visibleWeed += 1;
  });
  if (!visibleWeed && weedGroup.children.length) {
    weedGroup.children.forEach((group) => {
      group.visible = false;
    });
  }
}

function tickSeasonGrowth(dt) {
  const target = state.seasonScaleTarget != null
    ? state.seasonScaleTarget
    : (SEASONS[state.seasonIndex] || SEASONS[0]).scale;
  const current = state.seasonScale != null ? state.seasonScale : target;
  const next = current + (target - current) * Math.min(1, dt * 2.6);
  state.seasonScale = Math.abs(next - target) < 0.004 ? target : next;
  applyPlantScales(state.seasonScale);
}

function updateFarmClock(announce) {
  const idx = currentSeasonIndex();
  const season = SEASONS[idx];
  const deg = (((state.yearProgress % 1) + 1) % 1) * 360;
  const hand = document.getElementById("clock-hand");
  if (hand) hand.style.transform = `rotate(${deg}deg)`;
  const nameEl = document.getElementById("season-name");
  const cycleEl = document.getElementById("cycle-name");
  const yearEl = document.getElementById("clock-year");
  if (nameEl) nameEl.textContent = season.name;
  if (cycleEl) cycleEl.textContent = season.cycle;
  if (yearEl) yearEl.textContent = `Year ${state.farmYear} · ${season.name}`;
  if (seasonPill) seasonPill.textContent = `${season.name} · ${season.cycle.split(" ")[0]}`;
  if (idx !== state.seasonIndex) {
    state.seasonIndex = idx;
    applySeasonFruitGrowth(announce);
    applyWinterFieldGrowth(announce);
    applySeasonPestPressure(announce);
    applySeasonLook();
    if (announce) log(`${season.name}: plants ${season.name === "Winter" ? "go dormant" : "grow with the season"} — ${season.cycle}.`);
  } else {
    applySeasonLook();
  }
}

function applySeasonFruitGrowth(announce) {
  const seasonIdx = state.seasonIndex;
  let advanced = 0;
  state.plants.forEach((plant) => {
    const irrigated = plant.irrigated;
    const before = plant.fruitStage || 0;
    const poll = plant.pollWeek || 0;
    if (seasonIdx === 2) {
      if (poll >= 3 || before >= 2) {
        plant.fruitStage = Math.min(3, Math.max(before, 2) + (irrigated ? 1 : 0));
      } else if (poll >= 2) {
        plant.fruitStage = Math.max(before, 2);
        plant.pollWeek = Math.max(poll, 3);
      }
      if ((plant.pollWeek || 0) >= 3 || (plant.fruitStage || 0) >= 2) {
        const grown = (plant.fruitStage || 0) >= 3 ? 3.1 : 2.7;
        plant.fruitProgress = Math.max(plant.fruitProgress || 0, grown);
      }
    } else if (seasonIdx === 3 && before >= 2) {
      plant.fruitStage = 3;
    }
    plant.fruitProgress = Math.max(plant.fruitProgress || 0, plant.fruitStage || 0);
    updateFruitCount(plant);
    if ((plant.fruitStage || 0) > before) advanced += 1;
  });
  syncPlants();
  updateCounts();
  if (announce && advanced) {
    log(`Seasonal fruit growth: ${advanced} crop plant${advanced === 1 ? "" : "s"} advanced (stand unchanged).`);
  }
}

function nextFieldId(list) {
  return list.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
}

function applyWinterFieldGrowth(announce) {
  if (state.seasonIndex !== 3) return;
  if (state.winterHazardsYear === state.farmYear) return;
  state.winterHazardsYear = state.farmYear;

  const rng = mulberry32((clampMissionControl(seedInput, 1) || 1) + state.farmYear * 9973 + 41);
  const rockTarget = clampMissionControl(rockCountInput, 12);
  const weedTarget = clampMissionControl(weedCountInput, 10);
  const extraRocks = Math.max(3, Math.round(rockTarget * 0.45));
  const extraWeeds = Math.max(4, Math.round(weedTarget * 0.55));

  livingWeeds().forEach((weed) => {
    weed.size = Math.min(2.2, (weed.size || 1) * 1.2);
  });

  let newRocks = 0;
  let guard = 0;
  while (newRocks < extraRocks && remainingRocks().length < MISSION_CONTROL_MAX && guard < 2400) {
    guard += 1;
    const rock = {
      id: nextFieldId(state.rocks),
      ...randomPoint(rng),
      size: 1.2 + rng() * 1.45,
      detected: false,
      winter: true,
    };
    if (!tooCloseToExisting(rock, [remainingRocks()], 3.2)) {
      state.rocks.push(rock);
      newRocks += 1;
    }
  }

  let newWeeds = 0;
  guard = 0;
  while (newWeeds < extraWeeds && livingWeeds().length < MISSION_CONTROL_MAX && guard < 2400) {
    guard += 1;
    const weed = {
      id: nextFieldId(state.weeds),
      ...randomPoint(rng),
      size: 0.6 + rng() * 0.6,
      detected: false,
      winter: true,
    };
    if (!tooCloseToExisting(weed, [remainingRocks(), livingWeeds(), state.plants], 2.4)) {
      state.weeds.push(weed);
      newWeeds += 1;
    }
  }

  const extraPests = Math.max(3, Math.round(livingWeeds().length * 0.45) + 2);
  const newPests = spawnFieldPests(rng, extraPests, { winter: true });

  syncRocks();
  syncWeeds();
  syncPests();
  updateCounts();
  setPickupButtons();
  if (announce) {
    log(
      `Winter field growth: ${newWeeds} weed${newWeeds === 1 ? "" : "s"} sprouted, ${newRocks} rock${newRocks === 1 ? "" : "s"} surfaced, and ${newPests} pest${newPests === 1 ? "" : "s"} / disease spots appeared.`
    );
  }
}

function applySeasonPestPressure(announce) {
  if (state.seasonIndex !== 1) return;
  if (state.summerPestsYear === state.farmYear) return;
  if (!livingWeeds().length) return;
  state.summerPestsYear = state.farmYear;
  const rng = mulberry32((clampMissionControl(seedInput, 1) || 1) + state.farmYear * 7919 + 17);
  const extra = Math.max(2, Math.round(livingWeeds().length * 0.28));
  const added = spawnFieldPests(rng, extra);
  if (added) {
    syncPests();
    updateCounts();
    if (announce) {
      log(
        `Summer pest pressure: ${added} pest${added === 1 ? "" : "s"} / disease spot${added === 1 ? "" : "s"} appeared among the weeds.`
      );
    }
  }
}

function tickFruitGrowth(dt) {
  if (state.seasonIndex !== 1 && state.seasonIndex !== 2) return;
  let changed = false;
  let grew = false;
  state.plants.forEach((plant) => {
    const poll = plant.pollWeek || 0;
    if (poll < 2 && (plant.fruitStage || 0) < 2) return;
    const rate = (plant.irrigated ? 0.28 : 0.1) * dt;
    const prev = plant.fruitProgress || 0;
    plant.fruitProgress = Math.min(3.25, prev + rate);
    if (plant.fruitProgress !== prev) grew = true;
    const want = Math.min(3, Math.floor(plant.fruitProgress));
    if (want > (plant.fruitStage || 0) && want >= 2) {
      plant.fruitStage = want;
      updateFruitCount(plant);
      changed = true;
    }
  });
  if (changed) {
    syncPlants();
    updateCounts();
  } else if (grew) {
    applyFruitMeshSizes();
  }
}

function advanceSeason() {
  const idx = currentSeasonIndex();
  if (idx === 3) state.farmYear += 1;
  state.yearProgress = ((idx + 1) % 4) / 4 + 0.04;
  state.seasonIndex = -1;
  updateFarmClock(true);
}

function toggleFarmClock() {
  state.clockRunning = !state.clockRunning;
  const btn = document.getElementById("btn-clock-play");
  if (btn) btn.textContent = state.clockRunning ? "Pause year" : "Play year";
  log(state.clockRunning ? "Farm clock running through the growing year." : "Farm clock paused.");
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071018);
scene.fog = new THREE.Fog(0x071018, 70, 160);

const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
camera.position.set(-22, 34, 48);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const controls = SimpleOrbit(camera, canvas, {
  target: new THREE.Vector3(0, 2.2, 2),
  maxPolarAngle: Math.PI / 2.08,
  minDistance: 12,
  maxDistance: 120,
});

scene.add(new THREE.HemisphereLight(0x9ecbff, 0x2a1c10, 0.7));
const sun = new THREE.DirectionalLight(0xfff2d6, 1.35);
sun.position.set(-30, 50, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
scene.add(sun);

const groundGroup = new THREE.Group();
scene.add(groundGroup);
const rockGroup = new THREE.Group();
scene.add(rockGroup);
const weedGroup = new THREE.Group();
scene.add(weedGroup);
const pestGroup = new THREE.Group();
scene.add(pestGroup);
const plantGroup = new THREE.Group();
scene.add(plantGroup);
const rowGroup = new THREE.Group();
scene.add(rowGroup);
const rowBedMat = new THREE.MeshLambertMaterial({ color: 0x6b4424 });
const rowFurrowMat = new THREE.MeshLambertMaterial({ color: 0x3d2918 });

function worldToScene(x, y, height = 0) {
  return new THREE.Vector3(x - WORLD.w / 2, height, y - WORLD.h / 2);
}

const FIELD_LEVEL = 0.35;

function terrainHeight(x, y) {
  if (state.terrainFlat) return FIELD_LEVEL;
  const nx = x / WORLD.w;
  const ny = y / WORLD.h;
  return (
    Math.sin(nx * 7.4) * Math.cos(ny * 5.8) * 1.15 +
    Math.sin(nx * 18.5 + ny * 9.2) * 0.35 +
    FIELD_LEVEL
  );
}

const ROW_BED_HEIGHT = 0.28;
const ROW_BED_LIFT = 0.1;
const ROW_BED_WIDTH = 2.6;

function rowSurfaceOffset(x, y) {
  if (state.terrainFlat) return 0;
  const rows = state.fieldRows || [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (x < row.x0 - 0.6 || x > row.x1 + 0.6) continue;
    if (Math.abs(y - row.y) <= ROW_BED_WIDTH * 0.58) {
      return ROW_BED_LIFT + ROW_BED_HEIGHT / 2;
    }
  }
  return 0;
}

function soilHeight(x, y) {
  return terrainHeight(x, y) + rowSurfaceOffset(x, y) + 0.1;
}

function buildTerrain() {
  groundGroup.clear();
  const geo = new THREE.PlaneGeometry(WORLD.w, WORLD.h, 80, 52);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i) + WORLD.w / 2;
    const z = pos.getZ(i) + WORLD.h / 2;
    pos.setY(i, terrainHeight(x, z));
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ color: 0x1b3a2a, flatShading: !state.terrainFlat })
  );
  mesh.receiveShadow = true;
  mesh.name = "terrain";
  groundGroup.add(mesh);

  const grid = new THREE.GridHelper(Math.max(WORLD.w, WORLD.h), 16, 0x3ee0b0, 0x1c3344);
  grid.position.y = (state.terrainFlat ? FIELD_LEVEL : 0.08) + 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  groundGroup.add(grid);

  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.28, 32),
    new THREE.MeshStandardMaterial({ color: 0x5b8def, emissive: 0x1a3a8a, roughness: 0.35 })
  );
  const padPos = worldToScene(PAD.x, PAD.y, terrainHeight(PAD.x, PAD.y) + 0.16);
  pad.position.copy(padPos);
  pad.castShadow = true;
  pad.receiveShadow = true;
  groundGroup.add(pad);

  const padRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.08, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xdce8ff })
  );
  padRing.rotation.x = Math.PI / 2;
  padRing.position.copy(padPos);
  padRing.position.y += 0.18;
  groundGroup.add(padRing);
}

function makeDrone() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.5, 1.7),
    new THREE.MeshStandardMaterial({ color: 0x3ee0b0, roughness: 0.4, metalness: 0.2 })
  );
  body.castShadow = true;
  group.add(body);

  const armMat = new THREE.MeshStandardMaterial({ color: 0x223246 });
  const propMat = new THREE.MeshStandardMaterial({ color: 0xcdeee4, transparent: true, opacity: 0.55 });
  const props = [];
  [
    [1.2, 1.2],
    [1.2, -1.2],
    [-1.2, 1.2],
    [-1.2, -1.2],
  ].forEach(([x, z]) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 1.5), armMat);
    arm.position.set(x * 0.15, 0, z * 0.15);
    arm.lookAt(new THREE.Vector3(x, 0, z));
    group.add(arm);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 10), armMat);
    hub.position.set(x, 0.12, z);
    group.add(hub);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.04, 0.16), propMat);
    prop.position.set(x, 0.2, z);
    group.add(prop);
    props.push(prop);
  });

  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(SCAN_RADIUS * 0.55, 6.4, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x3ee0b0,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  cone.rotation.x = Math.PI;
  cone.position.y = -3.4;
  cone.visible = false;
  group.add(cone);
  group.userData = { props, cone };
  scene.add(group);
  return group;
}

const droneMesh = makeDrone();
buildTerrain();

const trailLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color: 0x3ee0b0, transparent: true, opacity: 0.7 })
);
scene.add(trailLine);

const pathLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineDashedMaterial({ color: 0xf4c15d, dashSize: 1.1, gapSize: 0.55, linewidth: 2 })
);
scene.add(pathLine);

const weedPathLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineDashedMaterial({ color: 0xe85d75, dashSize: 0.9, gapSize: 0.45, linewidth: 2 })
);
scene.add(weedPathLine);

const plantPathLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineDashedMaterial({ color: 0x7fd4ff, dashSize: 0.9, gapSize: 0.45, linewidth: 2 })
);
scene.add(plantPathLine);

const pestPathLine = new THREE.Line(
  new THREE.BufferGeometry(),
  new THREE.LineDashedMaterial({ color: 0xc45a2a, dashSize: 0.9, gapSize: 0.45, linewidth: 2 })
);
scene.add(pestPathLine);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = null;

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function log(message) {
  const item = document.createElement("li");
  item.textContent = message;
  logEl.prepend(item);
}

function flightBusy() {
  return (
    state.phase === "scanning" ||
    state.phase === "pickup" ||
    state.phase === "treating" ||
    state.phase === "transplanting" ||
    state.phase === "irrigating" ||
    state.phase === "pollinating" ||
    state.phase === "fruiting" ||
    state.phase === "harvesting" ||
    state.phase === "treatingPests" ||
    state.phase === "treatingAll"
  );
}

function setPhase(phase) {
  state.phase = phase;
  const labels = {
    idle: "Idle",
    scanning: "Scanning",
    planned: "Path ready",
    pickup: "Pickup flight",
    treating: "Weed treatment",
    transplanting: "Transplanting",
    irrigating: "Irrigating",
    pollinating: "Pollinating",
    fruiting: "Fruit count",
    harvesting: "Harvesting",
    treatingPests: "Pest treatment",
    treatingAll: "Treating field",
    done: "Complete",
  };
  phasePill.textContent = labels[phase] || phase;
}

const MODE_HINTS = {
  field: "Unmaintained field: rocks and weeds only. Clear rocks and weeds before transplanting crop into the soil.",
  rocks: "Rock management: scan, then fly the pickup path to collect rocks. Transplants stay locked until rocks and weeds are gone.",
  weeds: "Weed management: scan, then treat weeds with pesticide. Treated weeds are removed. Transplants stay locked until rocks and weeds are gone.",
  irrigate: "Irrigate: fly the irrigation path. Plants grow larger and stand can rise. Water also sprouts weeds, pests, and disease. If pests and disease are not treated, stand falls after two irrigations.",
  pests: "Pests & Disease: scan then treat insects and blight. Untreated pests and disease after two irrigations reduce stand count.",
  prepare: "Prepare field: clear weeds and planted crop, flatten the ground level, then lay soil rows for planting. Rocks stay.",
  stand: "Stand counts: click to place a crop plant. Scan or take a stand count. Fruit is extra plant state, not part of stand.",
  planting: "Transplants: plant into the soil only after the field is clear of rocks and weeds. Plants go into visible field rows.",
  poll1: "Pollination week 1: fly the crop stand to open flowers on each plant.",
  poll2: "Pollination week 2: fly plants that already flowered to mark them pollinated. Count pollinated plants reports how many of the stand are pollinated.",
  poll3: "Pollination week 3: fly pollinated plants to set fruit.",
  fruitcount: "Fruit count: fly a scan to total fruit on the field. Melons stay on the plants. Stand and fruit meshes are unchanged.",
  harvest: "Harvest: fly the fruiting plants and pick the melons. Plants stay; fruit on plants goes to 0. The log records how many were harvested.",
};

function isPlantingMode(mode) {
  return PLANTING_MODES.indexOf(mode) !== -1;
}

function pollWeekFromMode(mode) {
  if (mode === "poll1") return 1;
  if (mode === "poll2") return 2;
  if (mode === "poll3") return 3;
  return 0;
}

function applyModeVisuals() {
  rockGroup.visible = true;
  weedGroup.visible = true;
  pestGroup.visible = true;
  plantGroup.visible = true;
  rowGroup.visible = !!(state.fieldRows && state.fieldRows.length);
  pathLine.visible = state.mode === "rocks" && state.pickupPath.length > 1;
  weedPathLine.visible =
    (state.mode === "weeds" || state.mode === "irrigate" || state.phase === "treatingAll") &&
    state.weedPath.length > 1;
  pestPathLine.visible =
    (state.mode === "pests" || state.mode === "irrigate" || state.phase === "treatingAll") &&
    state.pestPath.length > 1;
  plantPathLine.visible =
    (isPlantingMode(state.mode) || state.mode === "irrigate") &&
    state.phase !== "treatingAll" &&
    state.plantPath.length > 1;
}

function syncPathwaySelects(mode) {
  const fieldSelect = document.getElementById("field-select");
  const plantingSelect = document.getElementById("planting-select");
  if (fieldSelect) fieldSelect.value = FIELD_MODES.indexOf(mode) !== -1 ? mode : "";
  if (plantingSelect) plantingSelect.value = isPlantingMode(mode) ? mode : "";
}

function applyMode(mode, announce) {
  const previous = state.mode;
  if (previous === "rocks" && mode !== "rocks") {
    const removed = removeAllRocksFromField();
    if (removed) log(`Rock management finished. Removed ${removed} rocks from the field.`);
  }
  state.mode = mode;
  syncPathwaySelects(mode);
  document.querySelectorAll("[data-for]").forEach((el) => {
    const allowed = el.getAttribute("data-for").split(/\s+/);
    el.hidden = mode === "field" || !allowed.includes(mode);
  });
  const hint = document.getElementById("mode-hint");
  if (hint) hint.textContent = MODE_HINTS[mode] || "";
  applyModeVisuals();
  setPlantingButtons();
  if (announce) {
    const labels = {
      field: "Showing unmaintained field (rocks and weeds only).",
      rocks: "Switched to Field pathway — rock management.",
      weeds: "Switched to Field pathway — weed management.",
      irrigate: "Switched to Field pathway — irrigate. Fly the path to water plants; weeds, pests, and disease sprout after each pass.",
      pests: "Switched to Field pathway — pests & disease. Scan, then treat insects and blight.",
      prepare: "Switched to Field pathway — prepare field. Clears weeds and plants, then lays soil rows.",
      stand: "Switched to Planting pathway — stand counts.",
      planting: "Switched to Planting pathway — transplants.",
      poll1: "Switched to Planting pathway — pollination week 1 (flowers).",
      poll2: "Switched to Planting pathway — pollination week 2 (pollinated).",
      poll3: "Switched to Planting pathway — pollination week 3 (fruit set).",
      fruitcount: "Switched to Planting pathway — fruit count (total only; fruit stays on plants).",
      harvest: "Switched to Planting pathway — harvest. Fly the plants to pick fruit; plants stay.",
    };
    log(labels[mode] || "Pathway changed.");
  }
  if (mode === "planting") {
    if (!fieldReadyForTransplant()) {
      log(transplantBlockedReason());
    } else {
      const planted = plantTransplantsOnField();
      if (planted) {
        log(
          `Planted ${planted} transplant${planted === 1 ? "" : "s"} in ${
            (state.fieldRows && state.fieldRows.length) || 0
          } field row${(state.fieldRows && state.fieldRows.length) === 1 ? "" : "s"}. Stand is ${planted}; fruit starts at 0.`
        );
      }
    }
  }
  if (mode === "irrigate" && state.plants.length) {
    planPlantMission(state.plants, "No crop plants to irrigate.");
  }
  if (mode === "harvest") {
    const fruiting = state.plants.filter((p) => (p.fruitCount || 0) > 0);
    if (fruiting.length) planPlantMission(fruiting, "No fruiting plants to harvest.");
  }
  if (mode === "pests" && livingPests().some((p) => p.detected)) {
    planPestTreatment();
  }
  if (mode === "prepare") {
    prepareField();
  }
  setPickupButtons();
}

function makeRockMesh(rock) {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(rock.size * 1.15, 0),
    hiddenRocks
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.rotation.set(rock.size, rock.id * 0.4, rock.size * 0.3);
  mesh.userData.rockId = rock.id;
  const pos = worldToScene(rock.x, rock.y, terrainHeight(rock.x, rock.y) + rock.size * 0.55);
  mesh.position.copy(pos);
  return mesh;
}

function syncRocks() {
  rockGroup.clear();
  state.rocks.forEach((rock) => {
    if (rock.collected) return;
    const mesh = makeRockMesh(rock);
    mesh.material = rock.detected ? foundRocks : hiddenRocks;
    rockGroup.add(mesh);
  });
}

function makeWeedMesh(weed) {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, weed.size * 1.45, 6), hiddenWeedStem);
  stem.position.y = weed.size * 0.6;
  stem.castShadow = true;
  group.add(stem);
  const leafGeo = new THREE.SphereGeometry(weed.size * 0.58, 8, 6);
  [
    [0.15, weed.size * 0.85, 0],
    [-0.22, weed.size * 0.7, 0.12],
    [0.05, weed.size * 1.05, -0.16],
  ].forEach(([x, y, z], i) => {
    const leaf = new THREE.Mesh(leafGeo, hiddenWeeds);
    leaf.position.set(x, y, z);
    leaf.scale.set(1 + i * 0.1, 0.7, 1.15);
    leaf.castShadow = true;
    group.add(leaf);
  });
  group.userData.weedId = weed.id;
  const ground = soilHeight(weed.x, weed.y);
  group.position.copy(worldToScene(weed.x, weed.y, ground));
  group.rotation.y = weed.id * 0.7;
  return group;
}

function paintWeed(group, weed) {
  group.traverse((child) => {
    if (!child.isMesh) return;
    const isStem = child.geometry.type === "CylinderGeometry";
    if (weed.treated) {
      child.material = isStem ? treatedWeedStem : treatedWeeds;
      return;
    }
    child.material = weed.detected
      ? isStem
        ? foundWeedStem
        : foundWeeds
      : isStem
        ? hiddenWeedStem
        : hiddenWeeds;
  });
  if (weed.treated) group.scale.set(0.55, 0.35, 0.55);
}

function syncWeeds() {
  weedGroup.clear();
  state.weeds.forEach((weed) => {
    if (weed.treated) return;
    const mesh = makeWeedMesh(weed);
    paintWeed(mesh, weed);
    weedGroup.add(mesh);
  });
  applySeasonLook();
}

function livingPests() {
  return state.pests.filter((p) => !p.treated);
}

function makePestMesh(item) {
  const group = new THREE.Group();
  const ground = soilHeight(item.x, item.y);
  if (item.kind === "disease") {
    const blotch = new THREE.Mesh(new THREE.SphereGeometry(item.size * 1.05, 10, 8), hiddenDisease);
    blotch.scale.set(1.35, 0.18, 1.1);
    blotch.position.y = 0.06;
    blotch.castShadow = true;
    blotch.receiveShadow = true;
    blotch.userData.pestPart = "blotch";
    group.add(blotch);
    [
      [0.18, 0.1, 0.08],
      [-0.16, 0.12, -0.1],
      [0.04, 0.14, -0.18],
    ].forEach(([x, y, z], i) => {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(item.size * (0.18 + i * 0.04), 8, 6), hiddenDiseaseSpot);
      spot.position.set(x, y, z);
      spot.castShadow = true;
      spot.userData.pestPart = "spot";
      group.add(spot);
    });
  } else {
    const body = new THREE.Mesh(new THREE.SphereGeometry(item.size * 0.85, 10, 8), hiddenPests);
    body.scale.set(1.35, 0.7, 0.85);
    body.position.y = item.size * 0.35;
    body.castShadow = true;
    body.userData.pestPart = "body";
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(item.size * 0.22, 8, 6), hiddenPests);
    head.position.set(item.size * 0.42, item.size * 0.4, 0);
    head.userData.pestPart = "body";
    group.add(head);
    [
      [0.05, item.size * 0.48, 0.16],
      [0.05, item.size * 0.48, -0.16],
    ].forEach(([x, y, z]) => {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(item.size * 0.28, 8, 6), hiddenPestWing);
      wing.scale.set(1.2, 0.18, 0.7);
      wing.position.set(x, y, z);
      wing.userData.pestPart = "wing";
      group.add(wing);
    });
  }
  group.userData.pestId = item.id;
  group.position.copy(worldToScene(item.x, item.y, ground));
  group.rotation.y = item.id * 0.8;
  return group;
}

function paintPest(group, item) {
  const seen = !!item.detected;
  group.traverse((child) => {
    if (!child.isMesh) return;
    const part = child.userData.pestPart;
    if (item.kind === "disease") {
      child.material = seen
        ? part === "spot"
          ? foundDiseaseSpot
          : foundDisease
        : part === "spot"
          ? hiddenDiseaseSpot
          : hiddenDisease;
    } else {
      child.material = seen
        ? part === "wing"
          ? foundPestWing
          : foundPests
        : part === "wing"
          ? hiddenPestWing
          : hiddenPests;
    }
  });
}

function syncPests() {
  pestGroup.clear();
  state.pests.forEach((item) => {
    if (item.treated) return;
    const mesh = makePestMesh(item);
    paintPest(mesh, item);
    pestGroup.add(mesh);
  });
}

function spawnFieldWeeds(rng, want, extras) {
  const target = Math.max(0, Math.round(want || 0));
  if (!target) return 0;
  const opts = extras || {};
  let added = 0;
  let guard = 0;
  while (added < target && livingWeeds().length < MISSION_CONTROL_MAX && guard < 2400) {
    guard += 1;
    const weed = {
      id: nextFieldId(state.weeds),
      ...randomPoint(rng),
      size: 0.95 + rng() * 0.75,
      detected: opts.detected != null ? !!opts.detected : false,
      treated: false,
      fromIrrigation: !!opts.fromIrrigation,
    };
    if (tooCloseToExisting(weed, [remainingRocks(), livingWeeds()], 2.2)) continue;
    if (dist(weed, PAD) < 8) continue;
    state.weeds.push(weed);
    added += 1;
  }
  return added;
}

function spawnFieldPests(rng, want, extras) {
  const target = Math.max(0, Math.round(want || 0));
  if (!target) return 0;
  const opts = extras || {};
  let added = 0;
  let guard = 0;
  const weeds = livingWeeds();
  while (added < target && livingPests().length < MISSION_CONTROL_MAX && guard < 2400) {
    guard += 1;
    const kind = rng() < 0.48 ? "disease" : "pest";
    const item = {
      id: nextFieldId(state.pests),
      ...randomPoint(rng),
      size: kind === "disease" ? 1.05 + rng() * 0.65 : 0.52 + rng() * 0.32,
      detected: opts.detected != null ? !!opts.detected : false,
      treated: false,
      kind,
      winter: !!opts.winter,
      fromIrrigation: !!opts.fromIrrigation,
    };
    if (weeds.length && rng() < 0.7) {
      const weed = weeds[Math.floor(rng() * weeds.length)];
      item.x = Math.min(WORLD.w - 8, Math.max(8, weed.x + (rng() - 0.5) * 4.2));
      item.y = Math.min(WORLD.h - 6, Math.max(6, weed.y + (rng() - 0.5) * 4.2));
    }
    if (tooCloseToExisting(item, [remainingRocks(), livingPests()], 2.1)) continue;
    if (dist(item, PAD) < 8) continue;
    state.pests.push(item);
    added += 1;
  }
  return added;
}

function cropMaterial(plant) {
  if (!plant.detected) return hiddenCrops;
  if (plant.irrigated) return wetCrops;
  return foundCrops;
}

function fruitDevelopT(plant) {
  const poll = plant.pollWeek || 0;
  const progress = Math.max(
    plant.fruitProgress || 0,
    plant.fruitStage || 0,
    poll >= 3 ? 2 : 0
  );
  return Math.max(0, Math.min(1, (progress - 2) / 1.2));
}

function fruitMaterial(plant) {
  const t = fruitDevelopT(plant);
  if (t >= 0.72) return melonRipeMat;
  if (t >= 0.35) return melonMidMat;
  return melonGreenMat;
}

function fruitRadiusFor(plant) {
  return 0.38 + fruitDevelopT(plant) * 0.5;
}

function fruitSizeFor(plant) {
  return fruitRadiusFor(plant);
}

function makeBlossom(pollinated) {
  const blossom = new THREE.Group();
  blossom.userData.isFlower = true;
  const petalMat = pollinated ? pollinatedPetalMat : flowerPetalMat;
  const heartMat = pollinated ? pollinatedHeartMat : flowerHeartMat;
  const sepal = new THREE.Mesh(blossomSepalGeo, foundCrops);
  sepal.position.y = -0.012;
  sepal.rotation.x = Math.PI;
  blossom.add(sepal);
  const petals = 6;
  for (let i = 0; i < petals; i += 1) {
    const petal = new THREE.Mesh(blossomPetalGeo, petalMat);
    petal.scale.set(1.28, 0.28, 0.82);
    const a = (i / petals) * Math.PI * 2;
    petal.position.set(Math.cos(a) * 0.07, 0.018, Math.sin(a) * 0.07);
    petal.rotation.y = -a;
    petal.rotation.x = -0.62;
    petal.castShadow = true;
    blossom.add(petal);
  }
  const heart = new THREE.Mesh(blossomHeartGeo, heartMat);
  heart.position.y = 0.022;
  blossom.add(heart);
  blossom.scale.setScalar(pollinated ? 3.6 : 3.25);
  return blossom;
}

function applyFruitMeshSizes() {
  plantGroup.children.forEach((group, i) => {
    const plant = state.plants[i];
    if (!plant) return;
    const r = fruitRadiusFor(plant);
    const mat = fruitMaterial(plant);
    group.traverse((obj) => {
      if (!obj.userData || !obj.userData.isFruit) return;
      obj.scale.setScalar(r);
      obj.material = mat;
      obj.userData.fruitRadius = r;
      const hang = obj.userData.fruitY;
      if (hang != null) obj.position.y = Math.max(r * 1.08, hang);
    });
  });
}

function updateFruitCount(plant) {
  const stage = plant.fruitStage || 0;
  const poll = plant.pollWeek || 0;
  if (stage < 2 && poll < 3) {
    plant.fruitCount = 0;
    return;
  }
  if (stage === 2 || (poll >= 3 && stage < 3)) plant.fruitCount = 2 + (plant.irrigated ? 1 : 0);
  else plant.fruitCount = 3 + (plant.irrigated ? 1 : 0);
}

function makePlantMesh(plant) {
  const group = new THREE.Group();
  const season = SEASONS[state.seasonIndex] || SEASONS[0];
  const cropMat = state.seasonIndex === 3 ? winterStem : cropMaterial(plant);
  const stemMul = season.stemMul || 1;
  const leafN = season.leaves || 2;
  const h = plant.size * 1.35;
  const stemH = h * 1.25 * stemMul;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.12, stemH, 6),
    cropMat
  );
  stem.position.y = stemH * 0.5;
  stem.castShadow = true;
  group.add(stem);

  const leafOffsets = [
    [0.14, 0.45, 0.02, -0.45],
    [-0.13, 0.58, 0.08, 0.4],
    [0.04, 0.78, -0.12, -0.2],
    [0.16, 0.92, 0.1, 0.35],
    [-0.1, 1.05, -0.06, -0.28],
  ];
  for (let i = 0; i < leafN && i < leafOffsets.length; i += 1) {
    const [lx, ly, lz, rot] = leafOffsets[i];
    const leafH = h * (state.seasonIndex === 1 ? 1.05 : state.seasonIndex === 2 ? 0.85 : 0.7);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.2 + i * 0.025, leafH, 5), cropMat);
    leaf.position.set(lx, stemH * ly, lz);
    leaf.rotation.z = rot;
    leaf.castShadow = true;
    group.add(leaf);
  }

  const poll = plant.pollWeek || 0;
  const stage = plant.fruitStage || 0;
  const showFlowers = poll >= 1 && stage < 2 && state.seasonIndex !== 3;
  if (showFlowers) {
    const pollinated = poll >= 2;
    const bloomN = pollinated ? 3 : 2;
    const bloomOffsets = [
      [0.11, stemH * 0.98, 0.05],
      [-0.1, stemH * 1.08, 0.07],
      [0.03, stemH * 1.16, -0.09],
    ];
    for (let i = 0; i < bloomN; i += 1) {
      const bloom = makeBlossom(pollinated);
      bloom.position.set(bloomOffsets[i][0], bloomOffsets[i][1], bloomOffsets[i][2]);
      bloom.rotation.y = i * 0.7;
      bloom.rotation.z = i === 1 ? 0.25 : -0.18;
      group.add(bloom);
    }
  }

  const count = plant.fruitCount || 0;
  const showFruit = (stage >= 2 || poll >= 3) && count > 0;
  if (showFruit) {
    const fruitMat = fruitMaterial(plant);
    const fruitSize = fruitRadiusFor(plant);
    const offsets = [
      [0.42, stemH * 0.5, 0.16],
      [-0.4, stemH * 0.42, 0.22],
      [0.06, stemH * 0.56, -0.32],
      [0.44, stemH * 0.36, -0.2],
    ];
    for (let i = 0; i < count && i < offsets.length; i += 1) {
      const fruit = new THREE.Mesh(melonGeo, fruitMat);
      const hangY = Math.max(fruitSize * 1.08, offsets[i][1]);
      fruit.scale.setScalar(fruitSize);
      fruit.position.set(offsets[i][0], hangY, offsets[i][2]);
      fruit.rotation.y = (plant.id || 0) * 0.6 + i * 0.9;
      fruit.castShadow = true;
      fruit.receiveShadow = true;
      fruit.userData.isFruit = true;
      fruit.userData.fruitRadius = fruitSize;
      fruit.userData.fruitY = hangY;
      group.add(fruit);
    }
  }
  group.userData.plantId = plant.id;
  group.position.copy(worldToScene(plant.x, plant.y, soilHeight(plant.x, plant.y)));
  group.rotation.y = plant.id * 0.31;
  return group;
}

function syncPlants() {
  plantGroup.clear();
  state.plants.forEach((plant) => {
    plantGroup.add(makePlantMesh(plant));
  });
  applySeasonLook();
}

function standPercent(counted, planted) {
  if (!planted) return 0;
  return Math.min(100, Math.round((counted / planted) * 1000) / 10);
}

function updateStandCount() {
  state.plantedSlots = Math.max(state.plantedSlots, state.plants.length);
  const counted = state.plants.filter((p) => p.detected).length;
  const planted = state.plantedSlots;
  const pct = standPercent(counted, planted);
  const perM2 = counted / FIELD_M2;
  const perAcre = perM2 * M2_PER_ACRE;
  document.getElementById("stand-counted").textContent = String(counted);
  document.getElementById("stand-planted").textContent = String(planted);
  document.getElementById("stand-pct").textContent = planted ? `${pct}%` : "—";
  document.getElementById("stand-density").textContent = planted
    ? `${perM2.toFixed(3)} /m²`
    : "—";
  standPill.textContent = counted
    ? `Stand ${counted} · ${perAcre.toFixed(0)}/ac`
    : "Stand 0";
  updatePlantingStats();
}

function pollinatedPlantCount() {
  return state.plants.filter((p) => (p.pollWeek || 0) >= 2).length;
}

function pollinationSummary() {
  const total = state.plants.length;
  const pollinated = pollinatedPlantCount();
  const flowering = state.plants.filter((p) => (p.pollWeek || 0) >= 1).length;
  const fruitSet = state.plants.filter((p) => (p.pollWeek || 0) >= 3).length;
  const pct = total ? ((pollinated / total) * 100).toFixed(1) : "0.0";
  return { total, pollinated, flowering, fruitSet, pct };
}

function reportPollinatedCount() {
  const { total, pollinated, flowering, fruitSet, pct } = pollinationSummary();
  updatePlantingStats();
  if (!total) {
    log("Pollinated plant count: 0. No crop plants on the field.");
    return { total, pollinated };
  }
  log(
    `Pollinated plants: ${pollinated} of ${total} (${pct}%). Flowering ${flowering}; fruit set ${fruitSet}.`
  );
  return { total, pollinated };
}

function updatePlantingStats() {
  const transplants = seedPlantedCount();
  const { total, pollinated, flowering } = pollinationSummary();
  const fruits = state.plants.reduce((n, p) => n + (p.fruitCount || 0), 0);
  const transplantsEl = document.getElementById("plant-transplants");
  const floweringEl = document.getElementById("plant-flowering");
  const pollinatedEl = document.getElementById("plant-pollinated");
  const fruitEl = document.getElementById("plant-fruit");
  if (transplantsEl) transplantsEl.textContent = String(transplants);
  if (floweringEl) floweringEl.textContent = String(flowering);
  if (pollinatedEl) pollinatedEl.textContent = `${pollinated} / ${total}`;
  if (fruitEl) fruitEl.textContent = String(fruits);
  const harvestedEl = document.getElementById("plant-harvested");
  if (harvestedEl) harvestedEl.textContent = String(state.harvestedFruit || 0);
  if (fruitPill) {
    if (fruits) fruitPill.textContent = `${fruits} fruit`;
    else if (state.harvestedFruit) fruitPill.textContent = `${state.harvestedFruit} harvested`;
    else fruitPill.textContent = "0 fruit";
  }
  if (pollPill) {
    pollPill.textContent = `${pollinated} pollinated`;
  }
}

function remainingRocks() {
  return state.rocks.filter((r) => !r.collected);
}

function setPickupButtons() {
  const pickup = document.getElementById("btn-pickup");
  if (pickup) pickup.disabled = remainingRocks().length === 0;
}

function fieldReadyForTransplant() {
  return remainingRocks().length === 0 && livingWeeds().length === 0;
}

function transplantBlockedReason() {
  const rocks = remainingRocks().length;
  const weeds = livingWeeds().length;
  if (!rocks && !weeds) return "";
  const parts = [];
  if (rocks) parts.push(`${rocks} rock${rocks === 1 ? "" : "s"}`);
  if (weeds) parts.push(`${weeds} weed${weeds === 1 ? "" : "s"}`);
  return `Field is not clear. Remove ${parts.join(" and ")} before transplanting plants into the soil.`;
}

function livingWeeds() {
  return state.weeds.filter((w) => !w.treated);
}

function plantsReadyForPollWeek(week) {
  if (week <= 1) return state.plants.filter((p) => (p.pollWeek || 0) < 1);
  return state.plants.filter((p) => (p.pollWeek || 0) === week - 1);
}

function setPlantingButtons() {
  const transplant = document.getElementById("btn-transplant");
  const irrigate = document.getElementById("btn-irrigate");
  const pollCount = document.getElementById("btn-poll-count");
  const pollinate = document.getElementById("btn-pollinate");
  const fruitCount = document.getElementById("btn-fruit-count");
  const harvest = document.getElementById("btn-harvest");
  const treat = document.getElementById("btn-treat");
  const treatPests = document.getElementById("btn-treat-pests");
  const treatAll = document.getElementById("btn-treat-all");
  const prepare = document.getElementById("btn-prepare");
  const busy = flightBusy();
  const room = MISSION_CONTROL_MAX - state.plantedSlots;
  const canTransplant =
    fieldReadyForTransplant() && (state.dormantSites.length > 0 || room > 0);
  if (transplant) transplant.disabled = busy || !canTransplant;
  if (irrigate) irrigate.disabled = busy;
  const week = pollWeekFromMode(state.mode);
  if (pollinate) {
    const ready = plantsReadyForPollWeek(week);
    pollinate.disabled = busy || !state.plants.length || !ready.length;
    pollinate.textContent = week ? `Pollinate week ${week}` : "Pollinate plants";
  }
  if (pollCount) pollCount.disabled = busy;
  if (fruitCount) fruitCount.disabled = busy || state.plants.length === 0;
  if (harvest) harvest.disabled = busy || totalFruitOnPlants() === 0;
  if (treat) treat.disabled = busy || livingWeeds().filter((w) => w.detected).length === 0;
  if (treatPests) treatPests.disabled = busy || livingPests().filter((p) => p.detected).length === 0;
  if (treatAll) treatAll.disabled = busy || (!livingWeeds().length && !livingPests().length);
  if (prepare) prepare.disabled = busy;
}

function collectRock(rock) {
  if (!rock || rock.collected) return false;
  rock.collected = true;
  syncRocks();
  updateCounts();
  setPickupButtons();
  log(`Picked up rock ${rock.id}. ${remainingRocks().length} rocks left.`);
  return true;
}

function collectNearbyRocks() {
  let picked = 0;
  state.rocks.forEach((rock) => {
    if (rock.detected && !rock.collected && dist(state.drone, rock) <= 1.8) {
      rock.collected = true;
      picked += 1;
    }
  });
  if (picked) {
    syncRocks();
    updateCounts();
    setPickupButtons();
    log(`Picked up ${picked} rock${picked === 1 ? "" : "s"} along the path.`);
  }
}

function removeAllRocksFromField() {
  const left = state.rocks.filter((r) => !r.collected).length;
  if (!left && !state.rocks.length) {
    setPickupButtons();
    return 0;
  }
  state.rocks.forEach((rock) => {
    rock.collected = true;
  });
  state.pickupPath = [];
  syncRocks();
  updatePathLine();
  updateCounts();
  setPickupButtons();
  return left;
}

function formatWorkTime(seconds) {
  const total = Math.max(0, Math.round(seconds));
  if (!total) return "0 min";
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (!min) return `${sec} s`;
  if (!sec) return `${min} min`;
  return `${min} min ${sec} s`;
}

function pickupSeconds(rockCount) {
  return Math.max(0, rockCount) * PICKUP_SEC_PER_ROCK;
}

function treatmentSeconds(weedCount) {
  return Math.max(0, weedCount) * TREAT_SEC_PER_WEED;
}

function updateWorkTimes() {
  const rocksLeft = remainingRocks().length;
  const weedsLeft = livingWeeds().length;
  const rockLeftEl = document.getElementById("rock-left");
  const pickupTimeEl = document.getElementById("pickup-time");
  const weedLeftEl = document.getElementById("weed-left");
  const treatTimeEl = document.getElementById("treat-time");
  if (rockLeftEl) rockLeftEl.textContent = String(rocksLeft);
  if (pickupTimeEl) pickupTimeEl.textContent = formatWorkTime(pickupSeconds(rocksLeft));
  if (weedLeftEl) weedLeftEl.textContent = String(weedsLeft);
  if (treatTimeEl) treatTimeEl.textContent = formatWorkTime(treatmentSeconds(weedsLeft));
}

function updateCounts() {
  const collected = state.rocks.filter((r) => r.collected).length;
  const remaining = state.rocks.filter((r) => !r.collected).length;
  const rocksFound = remainingRocks().length;
  const liveWeeds = livingWeeds();
  const weedsFound = liveWeeds.filter((w) => w.detected).length;
  rockPill.textContent = collected
    ? `${collected} picked · ${remaining} left`
    : `${rocksFound} / ${state.rocks.length} rocks`;
  weedPill.textContent = liveWeeds.length
    ? `${weedsFound} / ${liveWeeds.length} weeds`
    : "weeds cleared";
  updateWorkTimes();
  const livePests = livingPests();
  const pestsFound = livePests.filter((p) => p.detected).length;
  const pestBugs = livePests.filter((p) => p.kind !== "disease").length;
  const pestDisease = livePests.filter((p) => p.kind === "disease").length;
  if (pestPill) {
    pestPill.textContent = livePests.length
      ? `${pestsFound} / ${livePests.length} pests`
      : "pests cleared";
  }
  const pestBugsEl = document.getElementById("pest-bugs");
  const pestDiseaseEl = document.getElementById("pest-disease");
  const pestDetectedEl = document.getElementById("pest-detected");
  const pestTreatedEl = document.getElementById("pest-treated");
  if (pestBugsEl) pestBugsEl.textContent = String(pestBugs);
  if (pestDiseaseEl) pestDiseaseEl.textContent = String(pestDisease);
  if (pestDetectedEl) pestDetectedEl.textContent = String(pestsFound);
  if (pestTreatedEl) pestTreatedEl.textContent = String(state.treatedPests || 0);
  updateStandCount();
  setPlantingButtons();
}

function randomPoint(rng) {
  return {
    x: 8 + rng() * (WORLD.w - 16),
    y: 6 + rng() * (WORLD.h - 16),
  };
}

function tooCloseToExisting(pt, collections, minDist) {
  if (dist(pt, PAD) < 8) return true;
  return collections.some((list) => list.some((other) => dist(pt, other) < minDist));
}

function layoutCropSites(rng, collections, count) {
  return layoutTransplantRows(count).sites;
}

function layoutTransplantRows(count) {
  const want = Math.min(MISSION_CONTROL_MAX, Math.max(0, count));
  const sites = [];
  const rows = [];
  if (!want) return { sites, rows };
  const rowCount = Math.max(4, Math.min(12, Math.round(want / 7)));
  const y0 = 11;
  const y1 = WORLD.h - 9;
  const x0 = 16;
  const x1 = WORLD.w - 10;
  const length = x1 - x0;
  let placed = 0;
  for (let r = 0; r < rowCount && placed < want; r += 1) {
    const remainingRows = rowCount - r;
    const n = Math.ceil((want - placed) / remainingRows);
    const y = y0 + (r + 0.5) * ((y1 - y0) / rowCount);
    rows.push({ y, x0, x1 });
    for (let i = 0; i < n && placed < want; i += 1) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      sites.push({
        x: x0 + t * length,
        y,
        row: r,
      });
      placed += 1;
    }
  }
  return { sites, rows };
}

function syncFieldRows() {
  rowGroup.clear();
  const rows = state.fieldRows || [];
  rows.forEach((row) => {
    const length = row.x1 - row.x0;
    const midX = (row.x0 + row.x1) / 2;
    const h = terrainHeight(midX, row.y);
    const bedH = state.terrainFlat ? 0.04 : ROW_BED_HEIGHT;
    const bedY = state.terrainFlat ? h + 0.02 : h + ROW_BED_LIFT;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(length, bedH, ROW_BED_WIDTH), rowBedMat);
    bed.position.copy(worldToScene(midX, row.y, bedY));
    bed.receiveShadow = true;
    rowGroup.add(bed);
    const furrow = new THREE.Mesh(
      new THREE.BoxGeometry(length, state.terrainFlat ? 0.03 : 0.12, state.terrainFlat ? 0.35 : 0.7),
      rowFurrowMat
    );
    furrow.position.copy(
      worldToScene(midX, row.y + (state.terrainFlat ? 1.15 : 1.35), state.terrainFlat ? h + 0.018 : h + 0.02)
    );
    furrow.receiveShadow = true;
    rowGroup.add(furrow);
  });
  rowGroup.visible = rows.length > 0;
}

function remainingPlantRoom() {
  return Math.max(0, MISSION_CONTROL_MAX - state.plants.length);
}

function emergeCropPlants(count, extras) {
  const want = Math.min(remainingPlantRoom(), Math.max(0, Math.round(count)));
  if (!want) return 0;
  const layout = layoutTransplantRows(state.plants.length + want);
  const sites = layout.sites
    .filter((pt) => !tooCloseToExisting(pt, [state.plants], 1.5))
    .slice(0, want);
  if (layout.rows.length && !(state.fieldRows && state.fieldRows.length)) {
    state.fieldRows = layout.rows;
    syncFieldRows();
  }
  const opts = extras || {};
  sites.forEach((pt) => {
    state.plants.push(
      newCropPlant(pt, {
        transplanted: !!opts.transplanted,
        fromNutrition: !!opts.fromNutrition,
        detected: true,
        size: opts.size != null ? opts.size : 0.82,
        vigor: opts.vigor != null ? opts.vigor : 0,
      })
    );
  });
  state.plantedSlots = Math.max(state.plantedSlots, state.plants.length);
  return sites.length;
}

function plantTransplantsOnField() {
  if (!fieldReadyForTransplant()) return 0;
  const want = seedPlantedCount();
  const need = Math.max(0, want - transplantedCount());
  if (need <= 0) return 0;
  const layout = layoutTransplantRows(want);
  const occupied = state.plants.slice();
  const sites = layout.sites.filter((pt) => !tooCloseToExisting(pt, [occupied], 1.5)).slice(0, need);
  state.fieldRows = layout.rows;
  sites.forEach((pt) => {
    state.plants.push(
      newCropPlant(pt, { transplanted: true, detected: true, size: 0.88 + (pt.x % 1) * 0.12 })
    );
  });
  state.plantedSlots = state.plants.length;
  state.dormantSites = [];
  state.pendingEmptySites = [];
  setSeedPlantedCount(transplantedCount());
  syncFieldRows();
  syncPlants();
  updateCounts();
  setPlantingButtons();
  return sites.length;
}

function generateField() {
  const rng = mulberry32(clampMissionControl(seedInput, 1) || 1);
  const rockTarget = clampMissionControl(rockCountInput, 12);
  const weedTarget = clampMissionControl(weedCountInput, 10);
  const rocks = [];
  const weeds = [];
  let guard = 0;
  while (rocks.length < rockTarget && guard < 2000) {
    guard += 1;
    const rock = {
      id: rocks.length + 1,
      ...randomPoint(rng),
      size: 1.2 + rng() * 1.45,
      detected: false,
    };
    if (!tooCloseToExisting(rock, [rocks], 3.2)) rocks.push(rock);
  }
  guard = 0;
  while (weeds.length < weedTarget && guard < 2000) {
    guard += 1;
    const weed = {
      id: weeds.length + 1,
      ...randomPoint(rng),
      size: 0.95 + rng() * 0.75,
      detected: false,
    };
    if (!tooCloseToExisting(weed, [rocks, weeds], 2.4)) weeds.push(weed);
  }
  state.rocks = rocks;
  state.weeds = weeds;
  state.pests = [];
  state.plants = [];
  state.plantedSlots = 0;
  state.dormantSites = [];
  state.nutritionApplied = false;
  state.pendingEmptySites = [];
  state.fieldRows = [];
  state.terrainFlat = false;
  state.plantMission = null;
  state.winterHazardsYear = null;
  state.summerPestsYear = null;
  state.harvestedFruit = 0;
  state.treatedPests = 0;
  state.irrigatePasses = 0;
  state.pestMissedIrrigations = 0;
  state.treatAllPath = [];
  state.treatAllIndex = 0;
  const pestWant = Math.max(2, Math.round(weedTarget * 0.42) + (weedTarget ? 1 : 0));
  const pestSpawned = spawnFieldPests(rng, pestWant);
  resetDrone(false);
  setPhase("idle");
  state.pickupPath = [];
  state.weedPath = [];
  state.pestPath = [];
  state.treatAllPath = [];
  state.plantPath = [];
  state.plantMission = null;
  pathPill.textContent = "Path —";
  buildTerrain();
  updateCounts();
  syncRocks();
  syncWeeds();
  syncPests();
  syncPlants();
  syncFieldRows();
  updatePathLine();
  updateWeedPathLine();
  updatePestPathLine();
  updatePlantPathLine();
  updateTrailLine();
  const note = document.getElementById("nutrition-note");
  if (note) {
    note.textContent =
      "Treat weeds to clear the field and raise the stand — crop plants emerge as weeds are removed. Irrigate to grow plants larger and add more stand.";
  }
  const plantingNote = document.getElementById("planting-note");
  if (plantingNote) {
    plantingNote.textContent =
      "Seed planted under Mission controls is the transplant count. Clear rocks and weeds, then select Transplants to plant that many in field rows. Pollination weeks 1–3: flowers → pollinated → fruit set. Fruit count totals fruit; Harvest removes it.";
  }
  const pestNote = document.getElementById("pest-note");
  if (pestNote) {
    pestNote.textContent =
      "Scan to find pests and disease, then treat the field. Outbreaks increase with weeds, irrigation, and in winter.";
  }
  log(
    `Generated ${rocks.length} rocks, ${weeds.length} weeds, and ${pestSpawned} pest${pestSpawned === 1 ? "" : "s"} / disease spots. No crop plants yet — clear rocks and weeds, then select Transplants.`
  );
  applyWinterFieldGrowth(true);
  setPickupButtons();
  setPlantingButtons();
}

function resetDrone(announce = true) {
  state.drone = { x: PAD.x, y: PAD.y, heading: -Math.PI / 2, alt: FLY_HEIGHT };
  state.scanPath = [];
  state.scanIndex = 0;
  state.pickupIndex = 0;
  state.trail = [{ x: PAD.x, y: PAD.y }];
  document.getElementById("btn-treat").disabled = livingWeeds().filter((w) => w.detected).length === 0;
  const treatPestsBtn = document.getElementById("btn-treat-pests");
  if (treatPestsBtn) treatPestsBtn.disabled = livingPests().filter((p) => p.detected).length === 0;
  setPickupButtons();
  setPlantingButtons();
  if (announce) log("Drone returned to landing pad.");
}

function buildScanPath() {
  const path = [];
  const margin = 5;
  const step = SCAN_RADIUS * 1.15;
  let y = margin;
  let leftToRight = true;
  while (y <= WORLD.h - margin) {
    if (leftToRight) {
      for (let x = margin; x <= WORLD.w - margin; x += 2) path.push({ x, y });
    } else {
      for (let x = WORLD.w - margin; x >= margin; x -= 2) path.push({ x, y });
    }
    y += step;
    leftToRight = !leftToRight;
  }
  path.push({ x: PAD.x, y: PAD.y });
  return path;
}

function detectNearby() {
  let newRocks = 0;
  let newWeeds = 0;
  let newPests = 0;
  let newPlants = 0;
  for (const rock of state.rocks) {
    if (!rock.detected && dist(state.drone, rock) <= SCAN_RADIUS) {
      rock.detected = true;
      newRocks += 1;
    }
  }
  for (const weed of state.weeds) {
    if (!weed.detected && dist(state.drone, weed) <= SCAN_RADIUS) {
      weed.detected = true;
      newWeeds += 1;
    }
  }
  for (const pest of state.pests) {
    if (!pest.treated && !pest.detected && dist(state.drone, pest) <= SCAN_RADIUS) {
      pest.detected = true;
      newPests += 1;
    }
  }
  for (const plant of state.plants) {
    if (!plant.detected && dist(state.drone, plant) <= SCAN_RADIUS) {
      plant.detected = true;
      newPlants += 1;
    }
  }
  if (newRocks || newWeeds || newPests || newPlants) {
    updateCounts();
    if (newRocks) {
      const found = state.rocks.filter((r) => r.detected).length;
      log(`Detected ${newRocks} rock${newRocks === 1 ? "" : "s"} (${found} total).`);
      syncRocks();
    }
    if (newWeeds) {
      const found = state.weeds.filter((w) => w.detected).length;
      log(`Detected ${newWeeds} weed${newWeeds === 1 ? "" : "s"} (${found} total).`);
      syncWeeds();
    }
    if (newPests) {
      const found = livingPests().filter((p) => p.detected).length;
      log(`Detected ${newPests} pest${newPests === 1 ? "" : "s"} / disease (${found} total).`);
      syncPests();
    }
    if (newPlants) {
      syncPlants();
    }
  }
}

function detectAlongSegment(from, to) {
  const gap = dist(from, to);
  if (!(gap > SCAN_RADIUS * 0.7)) {
    detectNearby();
    return;
  }
  const saved = { x: state.drone.x, y: state.drone.y };
  const steps = Math.ceil(gap / (SCAN_RADIUS * 0.55));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    state.drone.x = from.x + (to.x - from.x) * t;
    state.drone.y = from.y + (to.y - from.y) * t;
    detectNearby();
  }
  state.drone.x = saved.x;
  state.drone.y = saved.y;
}

function reportStandCount() {
  if (state.phase === "idle") {
    startScan();
    log("Taking stand count — scanning crop plants now.");
    return;
  }
  if (state.phase === "scanning") {
    log("Stand count in progress. Wait for the scan to finish.");
    return;
  }
  const counted = state.plants.filter((p) => p.detected).length;
  updateStandCount();
  const planted = state.plantedSlots;
  const pct = standPercent(counted, planted);
  const perAcre = ((counted / FIELD_M2) * M2_PER_ACRE).toFixed(0);
  log(
    `Stand count: ${counted} crop plants of ${planted} planted (${pct}% stand, ${perAcre} plants/acre). Weeds are excluded.`
  );
}

function applyNutritionBoost() {
  state.weeds.forEach((weed) => {
    weed.treated = true;
    weed.detected = true;
  });
  syncWeeds();
  const treatedCount = state.weeds.filter((w) => w.treated).length;
  if (!treatedCount) {
    log("No weeds were treated, so crop nutrition and stand are unchanged.");
    return 0;
  }
  const before = state.plants.filter((p) => p.detected).length;
  const recovery = state.weeds.length ? treatedCount / state.weeds.length : 1;
  let fromDormant = Math.round(state.dormantSites.length * recovery);
  if (treatedCount && state.dormantSites.length && fromDormant === 0) fromDormant = 1;
  fromDormant = Math.min(state.dormantSites.length, fromDormant);
  const emerging = state.dormantSites.splice(0, fromDormant);
  emerging.forEach((site) => {
    state.plants.push(
      newCropPlant(site, { fromNutrition: true, detected: true, size: 0.9 })
    );
  });
  state.plantedSlots = Math.max(state.plantedSlots, state.plants.length);

  let extra = Math.max(3, Math.round(treatedCount * WEED_EMERGE_PER));
  if (!before) extra = Math.max(extra, Math.min(remainingPlantRoom(), Math.max(WEED_EMERGE_EMPTY_MIN, treatedCount)));
  extra = Math.min(remainingPlantRoom(), extra);
  emergeCropPlants(extra, { fromNutrition: true, size: 0.86 });

  state.nutritionApplied = true;
  syncPlants();
  updateCounts();
  const after = state.plants.filter((p) => p.detected).length;
  const gained = after - before;
  const note = document.getElementById("nutrition-note");
  if (note) {
    note.textContent = `Nutrition improved after treating ${treatedCount} weeds. Stand rose from ${before} to ${after} (+${gained}).`;
  }
  log(
    `Weed treatment freed nutrients and space. Stand rose from ${before} to ${after} crop plants (+${gained}).`
  );
  return gained;
}

function removeTreatedWeedsFromField() {
  const before = state.weeds.length;
  const treated = state.weeds.filter((w) => w.treated).length;
  state.weeds = state.weeds.filter((w) => !w.treated);
  const removed = before - state.weeds.length;
  if (treated) {
    state.weedPath = [];
    updateWeedPathLine();
  }
  syncWeeds();
  updateCounts();
  return removed;
}

function prepareSoilRows() {
  const want = Math.max(12, seedPlantedCount());
  const layout = layoutTransplantRows(want);
  state.fieldRows = layout.rows;
  syncFieldRows();
  return layout.rows.length;
}

function prepareField() {
  if (flightBusy()) {
    log("Wait for the current flight to finish before preparing the field.");
    return { weeds: 0, plants: 0, rows: 0 };
  }
  const weeds = state.weeds.length;
  const plants = state.plants.length;
  state.weeds = [];
  state.plants = [];
  state.plantedSlots = 0;
  state.dormantSites = [];
  state.pendingEmptySites = [];
  state.weedPath = [];
  state.plantPath = [];
  state.plantMission = null;
  state.nutritionApplied = false;
  state.terrainFlat = true;
  state.pestMissedIrrigations = 0;
  buildTerrain();
  updateWeedPathLine();
  updatePlantPathLine();
  const rows = prepareSoilRows();
  syncWeeds();
  syncPlants();
  syncRocks();
  syncPests();
  updateCounts();
  setPickupButtons();
  setPlantingButtons();
  const note = document.getElementById("nutrition-note");
  if (note) {
    note.textContent = `Field prepared: weeds and crop cleared. ${rows} soil row${
      rows === 1 ? "" : "s"
    } laid for planting. Terrain is flat and level.`
  }
  log(
    `Prepare field: cleared ${weeds} weed${weeds === 1 ? "" : "s"} and ${plants} planted plant${
      plants === 1 ? "" : "s"
    }. Laid ${rows} soil row${rows === 1 ? "" : "s"} for planting on a flat, level field. Rocks remain. Stand is 0.`
  );
  return { weeds, plants, rows };
}

function markWeedsTreatedNearby() {
  let changed = 0;
  for (const weed of state.weeds) {
    if (weed.detected && !weed.treated && dist(state.drone, weed) <= 2.6) {
      weed.treated = true;
      changed += 1;
    }
  }
  if (changed) {
    syncWeeds();
    updateCounts();
  }
}

function tourLength(order, start) {
  if (!order.length) return 0;
  let length = dist(start, order[0]);
  for (let i = 0; i < order.length - 1; i += 1) length += dist(order[i], order[i + 1]);
  length += dist(order[order.length - 1], start);
  return length;
}

function nearestNeighbor(points, start) {
  const remaining = [...points];
  const order = [];
  let current = start;
  while (remaining.length) {
    let best = 0;
    for (let i = 1; i < remaining.length; i += 1) {
      if (dist(current, remaining[i]) < dist(current, remaining[best])) best = i;
    }
    current = remaining.splice(best, 1)[0];
    order.push(current);
  }
  return order;
}

function twoOpt(order, start) {
  const path = order.slice();
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < path.length - 1; i += 1) {
      for (let k = i + 1; k < path.length; k += 1) {
        const candidate = path.slice(0, i).concat(path.slice(i, k + 1).reverse(), path.slice(k + 1));
        if (tourLength(candidate, start) + 1e-6 < tourLength(path, start)) {
          path.splice(0, path.length, ...candidate);
          improved = true;
        }
      }
    }
  }
  return path;
}

function planTour(points) {
  const start = { x: PAD.x, y: PAD.y };
  const order = twoOpt(nearestNeighbor(points, start), start);
  return {
    closed: [start, ...order, start],
    meters: tourLength(order, start),
    stops: order.length,
  };
}

function planPickup() {
  const detected = remainingRocks();
  if (!detected.length) {
    log("No rocks left to pick up. Scan the field first, or all rocks are collected.");
    setPickupButtons();
    return [];
  }
  const tour = planTour(detected);
  pathPill.textContent = `Rocks ${tour.meters.toFixed(1)} m`;
  log(
    `Shortest pickup tour: ${tour.stops} stops, ${tour.meters.toFixed(1)} m. Pickup time ${formatWorkTime(
      pickupSeconds(tour.stops)
    )}.`
  );
  setPickupButtons();
  setPhase("planned");
  state.pickupPath = tour.closed;
  updatePathLine();
  return tour.closed;
}

function planWeedTreatment() {
  const detected = livingWeeds().filter((w) => w.detected);
  if (!detected.length) {
    log("No weeds detected yet. Scan the field first.");
    return [];
  }
  const tour = planTour(detected);
  log(
    `Shortest weed-treatment tour: ${tour.stops} stops, ${tour.meters.toFixed(1)} m. Treatment time ${formatWorkTime(
      treatmentSeconds(tour.stops)
    )}.`
  );
  document.getElementById("btn-treat").disabled = false;
  state.weedPath = tour.closed;
  updateWeedPathLine();
  return tour.closed;
}

function startScan() {
  if (flightBusy()) return;
  state.rocks.forEach((r) => {
    r.detected = false;
  });
  state.weeds.forEach((w) => {
    if (!w.treated) w.detected = false;
  });
  state.pests.forEach((p) => {
    if (!p.treated) p.detected = false;
  });
  resetDrone(false);
  state.scanPath = buildScanPath();
  state.scanIndex = 0;
  state.weedPath = [];
  state.pestPath = [];
  state.treatAllPath = [];
  state.treatAllIndex = 0;
  state.plantPath = [];
  state.plantMission = null;
  state.scanKind =
    state.mode === "fruitcount"
      ? "fruit"
      : state.mode === "harvest"
        ? "harvest"
        : state.mode === "pests"
          ? "pests"
          : state.mode === "stand"
            ? "stand"
            : "field";
  setPhase("scanning");
  syncRocks();
  syncWeeds();
  syncPests();
  syncPlants();
  updatePathLine();
  updateWeedPathLine();
  updatePestPathLine();
  updatePlantPathLine();
  updateCounts();
  if (state.scanKind === "fruit") {
    log("Scan started — counting total fruit on the field. Melons stay on the plants.");
  } else if (state.scanKind === "harvest") {
    log("Scan started — locating fruit to harvest from plants.");
  } else if (state.scanKind === "pests") {
    log("Scan started — locating pests and disease.");
  } else if (state.scanKind === "stand") {
    log("Scan started — counting crop plants for stand.");
  } else {
    log("Scan started — counting crop plants and detecting rocks, weeds, pests, and disease.");
  }
}

function startPickup() {
  if (flightBusy()) return;
  if (!state.pickupPath.length) state.pickupPath = planPickup();
  if (!state.pickupPath.length) return;
  state.drone = { x: PAD.x, y: PAD.y, heading: -Math.PI / 2, alt: FLY_HEIGHT };
  state.pickupIndex = 0;
  state.trail = [{ x: PAD.x, y: PAD.y }];
  setPhase("pickup");
  log("Flying shortest rock pickup path. Rocks are collected on arrival.");
}

function startTreat() {
  if (flightBusy()) return;
  if (state.mode === "irrigate" && livingWeeds().length) {
    livingWeeds().forEach((w) => {
      w.detected = true;
    });
    syncWeeds();
  }
  if (!state.weedPath.length) state.weedPath = planWeedTreatment();
  if (!state.weedPath.length) return;
  state.drone = { x: PAD.x, y: PAD.y, heading: -Math.PI / 2, alt: FLY_HEIGHT };
  state.treatIndex = 0;
  state.trail = [{ x: PAD.x, y: PAD.y }];
  setPhase("treating");
  log("Flying shortest weed-treatment path. Treated weeds will be removed from the field.");
}

function planPestTreatment() {
  const detected = livingPests().filter((p) => p.detected);
  if (!detected.length) {
    log("No pests or disease detected yet. Scan the field first.");
    return [];
  }
  const tour = planTour(detected);
  log(`Shortest pests & disease tour: ${tour.stops} stops, ${tour.meters.toFixed(1)} m.`);
  const treatPests = document.getElementById("btn-treat-pests");
  if (treatPests) treatPests.disabled = false;
  state.pestPath = tour.closed;
  updatePestPathLine();
  return tour.closed;
}

function startTreatPests() {
  if (flightBusy()) return;
  if (state.mode === "irrigate" && livingPests().length) {
    livingPests().forEach((p) => {
      p.detected = true;
    });
    syncPests();
  }
  if (!state.pestPath.length) state.pestPath = planPestTreatment();
  if (!state.pestPath.length) return;
  state.drone = { x: PAD.x, y: PAD.y, heading: -Math.PI / 2, alt: FLY_HEIGHT };
  state.treatPestIndex = 0;
  state.trail = [{ x: PAD.x, y: PAD.y }];
  setPhase("treatingPests");
  log("Flying pests & disease treatment path. Treated spots will be removed from the field.");
}

function markPestsTreatedNearby() {
  let changed = 0;
  for (const item of state.pests) {
    if (item.detected && !item.treated && dist(state.drone, item) <= 2.6) {
      item.treated = true;
      changed += 1;
    }
  }
  if (changed) {
    state.treatedPests = (state.treatedPests || 0) + changed;
    syncPests();
    updateCounts();
  }
}

function removeTreatedPestsFromField() {
  const before = state.pests.length;
  const treated = state.pests.filter((p) => p.treated).length;
  state.pests = state.pests.filter((p) => !p.treated);
  const removed = before - state.pests.length;
  if (treated) {
    state.pestPath = [];
    updatePestPathLine();
  }
  syncPests();
  updateCounts();
  if (!livingPests().length) state.pestMissedIrrigations = 0;
  return removed;
}

function revealFieldThreats() {
  livingWeeds().forEach((weed) => {
    weed.detected = true;
  });
  livingPests().forEach((item) => {
    item.detected = true;
  });
  syncWeeds();
  syncPests();
  updateCounts();
}

function prepareThreatPaths() {
  if (livingWeeds().length) {
    state.weedPath = planTour(livingWeeds()).closed;
    updateWeedPathLine();
  }
  if (livingPests().length) {
    state.pestPath = planTour(livingPests()).closed;
    updatePestPathLine();
  }
}

function spawnIrrigationThreats() {
  state.irrigatePasses = (state.irrigatePasses || 0) + 1;
  const rng = mulberry32(
    (clampMissionControl(seedInput, 1) || 1) + state.farmYear * 3331 + state.irrigatePasses * 9176 + 13
  );
  const weedTarget = clampMissionControl(weedCountInput, 10);
  const extraWeeds = Math.max(IRRIGATE_WEED_MIN, Math.round(weedTarget * IRRIGATE_WEED_FRAC) + 1);
  const extraPests = Math.max(IRRIGATE_PEST_MIN, Math.round(extraWeeds * 0.7) + 2);
  const newWeeds = spawnFieldWeeds(rng, extraWeeds, { detected: true, fromIrrigation: true });
  const newPests = spawnFieldPests(rng, extraPests, { detected: true, fromIrrigation: true });
  revealFieldThreats();
  prepareThreatPaths();
  setPlantingButtons();
  const pestNote = document.getElementById("pest-note");
  if (pestNote) {
    pestNote.textContent = `Irrigation sprouted ${newWeeds} weeds and ${newPests} pest/disease spots. Treat them from the Field pathway.`;
  }
  log(
    `Irrigation sprouted ${newWeeds} weed${newWeeds === 1 ? "" : "s"} and ${newPests} pest${
      newPests === 1 ? "" : "s"
    } / disease spots. Treat weeds, pests, and diseases to clear them.`
  );
  return { newWeeds, newPests };
}

function applyUntreatedPestStandLoss() {
  const threats = livingPests();
  if (!threats.length) {
    state.pestMissedIrrigations = 0;
    return 0;
  }
  state.pestMissedIrrigations = (state.pestMissedIrrigations || 0) + 1;
  const pestNote = document.getElementById("pest-note");
  if (state.pestMissedIrrigations < 2) {
    const msg =
      "Pests and disease were not treated after this irrigation. Treat them before a second irrigation or stand count will fall.";
    if (pestNote) pestNote.textContent = msg;
    log(msg);
    return 0;
  }
  const before = state.plants.length;
  if (!before) return 0;
  const pressure = Math.min(0.5, 0.14 + threats.length * 0.035);
  let kill = Math.max(1, Math.round(before * pressure));
  kill = Math.min(before, kill);
  state.plants.splice(Math.max(0, state.plants.length - kill), kill);
  syncPlants();
  updateCounts();
  const after = state.plants.length;
  const lost = before - after;
  const msg = `Pests and disease were not addressed after two irrigations. Stand fell from ${before} to ${after} (−${lost} plants).`;
  if (pestNote) pestNote.textContent = msg;
  const nutrition = document.getElementById("nutrition-note");
  if (nutrition) nutrition.textContent = msg;
  log(msg);
  return lost;
}

function fieldThreatTargets() {
  return livingWeeds().concat(livingPests());
}

function planTreatAll() {
  revealFieldThreats();
  const targets = fieldThreatTargets();
  if (!targets.length) {
    log("No weeds, pests, or disease to treat.");
    return [];
  }
  const tour = planTour(targets);
  log(`Treatment tour: ${tour.stops} weeds, pests, and disease spots, ${tour.meters.toFixed(1)} m.`);
  state.treatAllPath = tour.closed;
  prepareThreatPaths();
  setPlantingButtons();
  return tour.closed;
}

function startTreatAll() {
  if (flightBusy()) return;
  if (!state.treatAllPath.length) state.treatAllPath = planTreatAll();
  if (!state.treatAllPath.length) return;
  state.drone = { x: PAD.x, y: PAD.y, heading: -Math.PI / 2, alt: FLY_HEIGHT };
  state.treatAllIndex = 0;
  state.trail = [{ x: PAD.x, y: PAD.y }];
  setPhase("treatingAll");
  setPlantingButtons();
  log("Flying treatment path for weeds, pests, and diseases. Treated spots will be removed from the field.");
}

function finishTreatAll() {
  markWeedsTreatedNearby();
  markPestsTreatedNearby();
  let standGain = 0;
  if (livingWeeds().length || state.weeds.some((w) => w.treated)) {
    standGain = applyNutritionBoost();
  }
  const removedWeeds = removeTreatedWeedsFromField();
  let extraPests = 0;
  state.pests.forEach((item) => {
    if (!item.treated) {
      item.treated = true;
      item.detected = true;
      extraPests += 1;
    }
  });
  if (extraPests) state.treatedPests = (state.treatedPests || 0) + extraPests;
  const removedPests = removeTreatedPestsFromField();
  state.treatAllPath = [];
  state.treatAllIndex = 0;
  setPhase("done");
  setPlantingButtons();
  const leftover = livingWeeds().length + livingPests().length;
  log(
    `Treatment complete. Removed ${removedWeeds} weed${removedWeeds === 1 ? "" : "s"} and ${removedPests} pest${
      removedPests === 1 ? "" : "s"
    } / disease spot${removedPests === 1 ? "" : "s"}${leftover ? `; ${leftover} remain.` : "."}`
  );
  if (fieldReadyForTransplant()) {
    log("Field is clear of rocks and weeds. Transplants can go in the soil.");
  }
  const pestNote = document.getElementById("pest-note");
  if (pestNote) {
    pestNote.textContent = leftover
      ? `Treated weeds, pests, and diseases. ${leftover} remain.`
      : "Weeds, pests, and diseases were treated and removed from the field.";
  }
  return { removedWeeds, removedPests, standGain };
}

function newCropPlant(pt, extras) {
  const plant = {
    id: state.plants.length + 1,
    x: pt.x,
    y: pt.y,
    size: extras && extras.size != null ? extras.size : 0.88,
    detected: extras && extras.detected != null ? extras.detected : true,
    transplanted: !!(extras && extras.transplanted),
    irrigated: false,
    vigor: extras && extras.vigor != null ? extras.vigor : 0,
    fromNutrition: !!(extras && extras.fromNutrition),
    fruitStage: 0,
    fruitCount: 0,
    fruitProgress: 0,
    pollWeek: 0,
  };
  return plant;
}

function findEmptyTransplantSites(count) {
  const seed = (clampMissionControl(seedInput, 1) + state.plants.length * 17 + state.dormantSites.length) >>> 0;
  const rng = mulberry32(seed || 1);
  const sites = [];
  let guard = 0;
  while (sites.length < count && guard < 800) {
    guard += 1;
    const pt = randomPoint(rng);
    if (tooCloseToExisting(pt, [state.rocks, livingWeeds(), state.plants, sites], 2.2)) continue;
    sites.push(pt);
  }
  return sites;
}

function collectTransplantTargets() {
  const targets = state.dormantSites.map((site) => ({
    x: site.x,
    y: site.y,
    kind: "dormant",
  }));
  if (!targets.length) {
    const want = seedPlantedCount();
    const need = Math.max(0, want - transplantedCount());
    if (!need) return targets;
    const layout = layoutTransplantRows(want);
    state.fieldRows = layout.rows;
    syncFieldRows();
    const occupied = state.plants.slice();
    layout.sites
      .filter((pt) => !tooCloseToExisting(pt, [occupied], 1.5))
      .slice(0, need)
      .forEach((pt) => {
        targets.push({ x: pt.x, y: pt.y, row: pt.row, kind: "empty" });
      });
    return targets;
  }
  return targets;
}

function planPlantMission(points, label) {
  if (!points.length) {
    log(label);
    return [];
  }
  const tour = planTour(points);
  pathPill.textContent = `Plant ${tour.meters.toFixed(1)} m`;
  state.plantPath = tour.closed;
  updatePlantPathLine();
  return tour.closed;
}

function placeTransplantNearby() {
  let placed = 0;
  const remaining = [];
  state.dormantSites.forEach((site) => {
    if (dist(state.drone, site) <= 2.4) {
      state.plants.push(
        newCropPlant(site, { transplanted: true, detected: true, size: 0.88 })
      );
      placed += 1;
    } else {
      remaining.push(site);
    }
  });
  if (placed) state.dormantSites = remaining;

  const pending = state.pendingEmptySites || [];
  const leftover = [];
  pending.forEach((pt) => {
    if (dist(state.drone, pt) <= 2.4 && !tooCloseToExisting(pt, [state.plants], 1.4)) {
      state.plants.push(newCropPlant(pt, { transplanted: true, detected: true, size: 0.86 }));
      state.plantedSlots += 1;
      placed += 1;
    } else {
      leftover.push(pt);
    }
  });
  state.pendingEmptySites = leftover;

  if (placed) {
    syncPlants();
    updateCounts();
    log(`Transplanted ${placed} crop plant${placed === 1 ? "" : "s"}. Stand is crop plants only.`);
  }
}

function irrigateNearby() {
  let watered = 0;
  let grew = 0;
  state.plants.forEach((plant) => {
    if (plant._irrigatePass) return;
    if (dist(state.drone, plant) > 2.6) return;
    plant._irrigatePass = true;
    plant.irrigated = true;
    plant.detected = true;
    const before = plant.vigor || 0;
    plant.vigor = Math.min(IRRIGATE_VIGOR_MAX, before + 1);
    if (plant.vigor > before) grew += 1;
    plant.fruitProgress = Math.max(plant.fruitProgress || 0, plant.fruitStage || 0);
    updateFruitCount(plant);
    watered += 1;
  });
  if (watered) {
    syncPlants();
    updateCounts();
    if (grew) {
      log(`Irrigated ${watered} crop plant${watered === 1 ? "" : "s"} — they grew larger.`);
    } else {
      log(`Irrigated ${watered} crop plant${watered === 1 ? "" : "s"} — already at full irrigated size.`);
    }
  }
}

function growFruitNearby() {
  let advanced = 0;
  state.plants.forEach((plant) => {
    if (plant._fruitPass) return;
    if (dist(state.drone, plant) > 2.6) return;
    plant._fruitPass = true;
    const before = plant.fruitStage || 0;
    const bump = plant.irrigated ? 2 : 1;
    plant.fruitStage = Math.min(3, before + bump);
    plant.fruitProgress = Math.max(plant.fruitProgress || 0, plant.fruitStage);
    plant.detected = true;
    updateFruitCount(plant);
    if (plant.fruitStage > before) advanced += 1;
  });
  if (advanced) {
    syncPlants();
    updateCounts();
    log(`Fruit advanced on ${advanced} crop plant${advanced === 1 ? "" : "s"}.`);
  }
}

function startTransplant() {
  if (flightBusy()) return;
  if (!fieldReadyForTransplant()) {
    log(transplantBlockedReason());
    setPlantingButtons();
    return;
  }
  const targets = collectTransplantTargets();
  if (!targets.length) {
    log("No dormant or empty sites left to transplant.");
    setPlantingButtons();
    return;
  }
  if (!planPlantMission(targets, "No transplant sites available.")) return;
  state.pendingEmptySites = targets.filter((t) => t.kind === "empty");
  state.drone = { x: PAD.x, y: PAD.y, heading: -Math.PI / 2, alt: FLY_HEIGHT };
  state.plantIndex = 0;
  state.plantMission = "transplant";
  state.trail = [{ x: PAD.x, y: PAD.y }];
  setPhase("transplanting");
  setPlantingButtons();
  log(
    `Flying transplant path — ${targets.length} site${targets.length === 1 ? "" : "s"} in ${
      (state.fieldRows && state.fieldRows.length) || 0
    } field row${(state.fieldRows && state.fieldRows.length) === 1 ? "" : "s"}. New plants start without fruit.`
  );
}

function emergeFromIrrigation() {
  const room = remainingPlantRoom();
  if (!room) return 0;
  const established = state.plants.length;
  let extra = Math.max(IRRIGATE_EMERGE_MIN, Math.round(established * IRRIGATE_EMERGE_FRAC));
  extra = Math.min(IRRIGATE_EMERGE_MAX, extra, room);
  const added = emergeCropPlants(extra, { transplanted: false, size: 0.86, vigor: 1 });
  if (added) {
    syncPlants();
    updateCounts();
  }
  return added;
}

function startIrrigate() {
  if (flightBusy()) return;
  if (!state.plants.length) {
    log("No crop plants to irrigate yet. Treat weeds or select Transplants first, then irrigate to grow the stand.");
    setPhase("done");
    setPlantingButtons();
    return;
  }
  if (!planPlantMission(state.plants, "No crop plants to irrigate.")) return;
  state.plants.forEach((p) => {
    p._irrigatePass = false;
  });
  state.drone = { x: PAD.x, y: PAD.y, heading: -Math.PI / 2, alt: FLY_HEIGHT };
  state.plantIndex = 0;
  state.plantMission = "irrigate";
  state.trail = [{ x: PAD.x, y: PAD.y }];
  setPhase("irrigating");
  setPlantingButtons();
  log("Flying irrigation path. Plants grow larger and more crop establishes, raising the stand.");
}

function pollinateNearby(week) {
  let advanced = 0;
  state.plants.forEach((plant) => {
    if (plant._pollPass) return;
    if (dist(state.drone, plant) > 2.6) return;
    plant._pollPass = true;
    const prev = plant.pollWeek || 0;
    if (week === 1 && prev < 1) {
      plant.pollWeek = 1;
      plant.fruitStage = Math.max(plant.fruitStage || 0, 1);
      plant.detected = true;
      advanced += 1;
    } else if (week === 2 && prev === 1) {
      plant.pollWeek = 2;
      plant.fruitStage = Math.max(plant.fruitStage || 0, 1);
      plant.detected = true;
      advanced += 1;
    } else if (week === 3 && prev === 2) {
      plant.pollWeek = 3;
      plant.fruitStage = Math.max(plant.fruitStage || 0, 2);
      plant.fruitProgress = Math.max(plant.fruitProgress || 0, 2);
      plant.detected = true;
      updateFruitCount(plant);
      advanced += 1;
    }
  });
  if (advanced) {
    syncPlants();
    updateCounts();
  }
}

function startPollination() {
  if (flightBusy()) return;
  const week = pollWeekFromMode(state.mode) || 1;
  if (!state.plants.length) {
    log("No crop plants to pollinate. Generate a field or transplant first.");
    setPlantingButtons();
    return;
  }
  const targets = plantsReadyForPollWeek(week);
  if (!targets.length) {
    if (week > 1) {
      log(`Pollination week ${week} needs week ${week - 1} first.`);
    } else {
      log("All crop plants already have flowers.");
    }
    setPlantingButtons();
    return;
  }
  if (!planPlantMission(targets, "No crop plants ready for this pollination week.")) return;
  state.plants.forEach((p) => {
    p._pollPass = false;
  });
  state.drone = { x: PAD.x, y: PAD.y, heading: -Math.PI / 2, alt: FLY_HEIGHT };
  state.plantIndex = 0;
  state.plantMission = `poll${week}`;
  state.pollWeekMission = week;
  state.trail = [{ x: PAD.x, y: PAD.y }];
  setPhase("pollinating");
  setPlantingButtons();
  const goals = ["", "open flowers", "mark flowers pollinated", "set fruit"];
  log(`Flying pollination week ${week} — ${targets.length} plant${targets.length === 1 ? "" : "s"} to ${goals[week]}.`);
}

function totalFruitOnPlants() {
  return state.plants.reduce((n, p) => n + (p.fruitCount || 0), 0);
}

function harvestFruitFromPlant(plant) {
  const n = plant.fruitCount || 0;
  plant.fruitCount = 0;
  plant.fruitStage = 0;
  plant.fruitProgress = 0;
  plant.pollWeek = 0;
  if (n) state.harvestedFruit = (state.harvestedFruit || 0) + n;
  return n;
}

function harvestFruitFromPlants() {
  let harvested = 0;
  let plants = 0;
  state.plants.forEach((plant) => {
    const n = harvestFruitFromPlant(plant);
    if (n > 0) plants += 1;
    harvested += n;
  });
  return { harvested, plants };
}

function reportFruitCount() {
  if (state.phase === "idle") {
    startScan();
    log("Taking fruit count — scanning the field for a total. Fruit stays on the plants.");
    return;
  }
  if (state.phase === "scanning") {
    log("Fruit count in progress. Wait for the scan to finish.");
    return;
  }
  const fruits = totalFruitOnPlants();
  const fruiting = state.plants.filter((p) => (p.fruitCount || 0) > 0).length;
  const plants = state.plants.length;
  updateCounts();
  log(
    fruits
      ? `Fruit count: ${fruits} fruit on ${fruiting} of ${plants} crop plant${plants === 1 ? "" : "s"}. Melons remain on the plants.`
      : `Fruit count: 0 fruit on ${plants} crop plant${plants === 1 ? "" : "s"}.`
  );
}

function harvestNearby() {
  let harvested = 0;
  let plants = 0;
  state.plants.forEach((plant) => {
    if (plant._harvestPass) return;
    if (dist(state.drone, plant) > 2.6) return;
    plant._harvestPass = true;
    const n = harvestFruitFromPlant(plant);
    if (!n) return;
    harvested += n;
    plants += 1;
  });
  if (harvested) {
    state.harvestThisPass = (state.harvestThisPass || 0) + harvested;
    state.harvestPlantsThisPass = (state.harvestPlantsThisPass || 0) + plants;
    syncPlants();
    updateCounts();
    log(`Harvested ${harvested} fruit from ${plants} plant${plants === 1 ? "" : "s"}.`);
  }
}

function finishHarvest() {
  const leftover = harvestFruitFromPlants();
  const harvested = (state.harvestThisPass || 0) + leftover.harvested;
  const plants = (state.harvestPlantsThisPass || 0) + leftover.plants;
  state.harvestThisPass = 0;
  state.harvestPlantsThisPass = 0;
  syncPlants();
  updateCounts();
  if (harvested) {
    log(
      `Harvested ${harvested} fruit from ${plants} plant${plants === 1 ? "" : "s"}. Fruit is gone; stand is unchanged. Plants can flower and fruit again.`
    );
  } else {
    log(`Harvest: 0 fruit on ${state.plants.length} crop plant${state.plants.length === 1 ? "" : "s"}. Nothing to pick.`);
  }
}

function startHarvest() {
  if (flightBusy()) return;
  const targets = state.plants.filter((p) => (p.fruitCount || 0) > 0);
  if (!targets.length) {
    log("No fruit to harvest. Use Fruit count to total fruit, or wait for fruit set.");
    setPlantingButtons();
    return;
  }
  if (!planPlantMission(targets, "No fruiting plants to harvest.")) return;
  state.plants.forEach((p) => {
    p._harvestPass = false;
  });
  state.harvestThisPass = 0;
  state.harvestPlantsThisPass = 0;
  state.drone = { x: PAD.x, y: PAD.y, heading: -Math.PI / 2, alt: FLY_HEIGHT };
  state.plantIndex = 0;
  state.plantMission = "harvest";
  state.trail = [{ x: PAD.x, y: PAD.y }];
  setPhase("harvesting");
  setPlantingButtons();
  log(
    `Flying harvest path — ${targets.length} fruiting plant${targets.length === 1 ? "" : "s"}. Fruit will be picked; plants stay.`
  );
}

function advanceAlong(path, indexKey, speed, dt, onStop) {
  if (state[indexKey] >= path.length - 1) return true;
  let remaining = speed * dt;
  while (remaining > 0 && state[indexKey] < path.length - 1) {
    const from = path[state[indexKey]];
    const to = path[state[indexKey] + 1];
    const gap = dist(state.drone, to);
    if (gap <= remaining || gap < 0.05) {
      state.drone.x = to.x;
      state.drone.y = to.y;
      state.drone.heading = Math.atan2(to.y - from.y, to.x - from.x);
      state[indexKey] += 1;
      remaining -= gap;
      state.trail.push({ x: to.x, y: to.y });
      if (state.trail.length > 400) state.trail.shift();
      if (onStop) onStop(to);
    } else {
      const t = remaining / gap;
      state.drone.x += (to.x - state.drone.x) * t;
      state.drone.y += (to.y - state.drone.y) * t;
      state.drone.heading = Math.atan2(to.y - from.y, to.x - from.x);
      remaining = 0;
      state.trail.push({ x: state.drone.x, y: state.drone.y });
    }
  }
  return state[indexKey] >= path.length - 1;
}

function pointsToFlight(points) {
  return points.map((pt) => worldToScene(pt.x, pt.y, FLY_HEIGHT + terrainHeight(pt.x, pt.y) * 0.25));
}

function updateTrailLine() {
  const pts = pointsToFlight(state.trail);
  trailLine.geometry.dispose();
  trailLine.geometry = new THREE.BufferGeometry().setFromPoints(pts.length ? pts : [new THREE.Vector3()]);
}

function updatePathLine() {
  const pts = pointsToFlight(state.pickupPath);
  pathLine.geometry.dispose();
  pathLine.geometry = new THREE.BufferGeometry().setFromPoints(pts.length ? pts : [new THREE.Vector3()]);
  pathLine.computeLineDistances();
  applyModeVisuals();
}

function updateWeedPathLine() {
  const pts = pointsToFlight(state.weedPath);
  weedPathLine.geometry.dispose();
  weedPathLine.geometry = new THREE.BufferGeometry().setFromPoints(pts.length ? pts : [new THREE.Vector3()]);
  weedPathLine.computeLineDistances();
  applyModeVisuals();
}

function updatePlantPathLine() {
  const pts = pointsToFlight(state.plantPath);
  plantPathLine.geometry.dispose();
  plantPathLine.geometry = new THREE.BufferGeometry().setFromPoints(pts.length ? pts : [new THREE.Vector3()]);
  plantPathLine.computeLineDistances();
  applyModeVisuals();
}

function updatePestPathLine() {
  const pts = pointsToFlight(state.pestPath || []);
  pestPathLine.geometry.dispose();
  pestPathLine.geometry = new THREE.BufferGeometry().setFromPoints(pts.length ? pts : [new THREE.Vector3()]);
  pestPathLine.computeLineDistances();
  applyModeVisuals();
}

function placeFromEvent(evt) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const terrain = groundGroup.getObjectByName("terrain");
  const hits = raycaster.intersectObject(terrain);
  if (!hits.length) return;
  const hit = hits[0].point;
  const seen = state.phase === "planned" || state.phase === "done";
  const pt = {
    x: hit.x + WORLD.w / 2,
    y: hit.z + WORLD.h / 2,
    detected: seen,
  };
  const kind = evt.altKey ? "stand" : evt.shiftKey ? "weeds" : state.mode;
  if (kind === "field" || kind === "prepare") return;
  if (kind === "planting" && !fieldReadyForTransplant()) {
    log(transplantBlockedReason());
    return;
  }
  if (isPlantingMode(kind)) {
    state.plants.push(
      newCropPlant(pt, {
        transplanted: kind === "planting",
        detected: seen,
        size: 0.88,
      })
    );
    state.plantedSlots += 1;
    syncPlants();
    log(kind === "planting" ? "Manual transplant placed (no fruit yet)." : "Manual crop plant placed.");
  } else if (kind === "weeds") {
    pt.id = state.weeds.length + 1;
    pt.size = 1.15;
    state.weeds.push(pt);
    syncWeeds();
    log("Manual weed placed.");
    if (seen) state.weedPath = planWeedTreatment();
  } else if (kind === "pests") {
    const isDisease = livingPests().length % 2 === 1;
    const item = {
      id: nextFieldId(state.pests),
      x: pt.x,
      y: pt.y,
      size: isDisease ? 1.2 : 0.65,
      detected: seen,
      treated: false,
      kind: isDisease ? "disease" : "pest",
    };
    state.pests.push(item);
    syncPests();
    log(item.kind === "disease" ? "Manual disease spot placed." : "Manual pest placed.");
    if (seen) state.pestPath = planPestTreatment();
  } else {
    pt.id = state.rocks.length + 1;
    pt.size = 1.45;
    state.rocks.push(pt);
    syncRocks();
    log("Manual rock placed.");
    if (seen) state.pickupPath = planPickup();
  }
  updateCounts();
}

function resize() {
  const { clientWidth, clientHeight } = canvas.parentElement;
  const w = Math.max(1, clientWidth);
  const h = Math.max(1, clientHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

function syncDroneVisual(dt) {
  const ground = terrainHeight(state.drone.x, state.drone.y);
  const pos = worldToScene(state.drone.x, state.drone.y, ground + FLY_HEIGHT);
  droneMesh.position.copy(pos);
  droneMesh.rotation.y = -state.drone.heading;
  droneMesh.rotation.z = Math.sin(performance.now() / 180) * 0.04;
  const spinning = flightBusy();
  droneMesh.userData.props.forEach((prop, i) => {
    prop.rotation.y += (spinning ? 18 : 3) * dt * (i % 2 ? 1 : -1);
  });
  droneMesh.userData.cone.visible = state.phase === "scanning";
}

function tick(ts) {
  const dt = Math.min(0.05, (ts - (state.lastTs || ts)) / 1000);
  state.lastTs = ts;
  const speed = clampMissionControl(scanSpeedInput, 4) * 8;
  if (state.phase === "scanning") {
    const before = { x: state.drone.x, y: state.drone.y };
    const done = advanceAlong(state.scanPath, "scanIndex", speed, dt);
    detectAlongSegment(before, { x: state.drone.x, y: state.drone.y });
    if (done) {
      if (state.rocks.some((r) => r.detected)) state.pickupPath = planPickup();
      if (livingWeeds().some((w) => w.detected)) state.weedPath = planWeedTreatment();
      if (livingPests().some((p) => p.detected) && (state.mode === "pests" || state.scanKind === "pests")) {
        state.pestPath = planPestTreatment();
      }
      document.getElementById("btn-stand").disabled = false;
      setPhase("planned");
      setPlantingButtons();
      log("Scan complete.");
      if (state.scanKind === "fruit" || state.mode === "fruitcount") reportFruitCount();
      else if (state.scanKind === "harvest" || state.mode === "harvest") finishHarvest();
      else if (state.scanKind === "pests" || state.mode === "pests") {
        const found = livingPests().filter((p) => p.detected).length;
        log(
          found
            ? `Pests & disease scan: ${found} spot${found === 1 ? "" : "s"} found. Treat to remove them.`
            : "Pests & disease scan: none found."
        );
      } else if (state.scanKind === "stand" || state.mode === "stand") reportStandCount();
    }
  } else if (state.phase === "pickup") {
    collectNearbyRocks();
    const done = advanceAlong(state.pickupPath, "pickupIndex", speed * 0.9, dt, collectNearbyRocks);
    if (done) {
      collectNearbyRocks();
      const removed = removeAllRocksFromField();
      setPhase("done");
      setPlantingButtons();
      log(`Rock management complete. All ${removed} remaining rocks were removed from the field.`);
      if (fieldReadyForTransplant()) {
        log("Field is clear of rocks and weeds. Transplants can go in the soil.");
      }
    }
  } else if (state.phase === "treating") {
    markWeedsTreatedNearby();
    const done = advanceAlong(state.weedPath, "treatIndex", speed * 0.9, dt, markWeedsTreatedNearby);
    if (done) {
      const standGain = applyNutritionBoost();
      const removed = removeTreatedWeedsFromField();
      setPhase("done");
      setPlantingButtons();
      log(
        `Weed treatment complete. Pesticide removed ${removed} weed${removed === 1 ? "" : "s"}; stand +${standGain} crop plants.`
      );
      if (fieldReadyForTransplant()) {
        log("Field is clear of rocks and weeds. Transplants can go in the soil.");
      } else if (remainingRocks().length) {
        log("Weeds are cleared. Finish rock pickup before transplanting.");
      }
    }
  } else if (state.phase === "transplanting") {
    placeTransplantNearby();
    const done = advanceAlong(state.plantPath, "plantIndex", speed * 0.9, dt, placeTransplantNearby);
    if (done) {
      placeTransplantNearby();
      let leftover = 0;
      state.dormantSites.forEach((site) => {
        state.plants.push(newCropPlant(site, { transplanted: true, detected: true, size: 0.88 }));
        leftover += 1;
      });
      state.dormantSites = [];
      (state.pendingEmptySites || []).forEach((pt) => {
        if (tooCloseToExisting(pt, [state.plants], 1.4)) return;
        state.plants.push(newCropPlant(pt, { transplanted: true, detected: true, size: 0.86 }));
        state.plantedSlots += 1;
        leftover += 1;
      });
      state.pendingEmptySites = [];
      if (leftover) {
        syncPlants();
        updateCounts();
        log(`Transplanted ${leftover} remaining crop plant${leftover === 1 ? "" : "s"} along the path.`);
      }
      setPhase("done");
      setPlantingButtons();
      setSeedPlantedCount(transplantedCount());
      log("Transplant mission complete. New plants have no fruit yet.");
    }
  } else if (state.phase === "irrigating") {
    irrigateNearby();
    const done = advanceAlong(state.plantPath, "plantIndex", speed * 0.9, dt, irrigateNearby);
    if (done) {
      irrigateNearby();
      const beforeStand = state.plants.filter((p) => p.detected).length;
      const added = emergeFromIrrigation();
      spawnIrrigationThreats();
      const lost = applyUntreatedPestStandLoss();
      setPhase("done");
      setPlantingButtons();
      const wet = state.plants.filter((p) => p.irrigated).length;
      const afterStand = state.plants.filter((p) => p.detected).length;
      if (lost) {
        log(
          `Irrigation complete. ${wet} crop plants watered. Untreated pests/disease cut stand from ${beforeStand} to ${afterStand}.`
        );
      } else {
        log(
          `Irrigation complete. ${wet} crop plants watered and grew larger. Stand rose from ${beforeStand} to ${afterStand} (+${added}).`
        );
      }
    }
  } else if (state.phase === "treatingAll") {
    markWeedsTreatedNearby();
    markPestsTreatedNearby();
    const done = advanceAlong(state.treatAllPath, "treatAllIndex", speed * 0.9, dt, () => {
      markWeedsTreatedNearby();
      markPestsTreatedNearby();
    });
    if (done) finishTreatAll();
  } else if (state.phase === "treatingPests") {
    markPestsTreatedNearby();
    const done = advanceAlong(state.pestPath, "treatPestIndex", speed * 0.9, dt, markPestsTreatedNearby);
    if (done) {
      markPestsTreatedNearby();
      const removed = removeTreatedPestsFromField();
      setPhase("done");
      setPlantingButtons();
      const leftover = livingPests().length;
      log(
        `Pests & disease treatment complete. Removed ${removed} spot${removed === 1 ? "" : "s"}${leftover ? `; ${leftover} remain.` : "."}`
      );
      const pestNote = document.getElementById("pest-note");
      if (pestNote) {
        pestNote.textContent = leftover
          ? `Treated ${removed} pest/disease spots. ${leftover} remain — scan again if needed.`
          : `Treated ${removed} pest/disease spots. The field is clear.`;
      }
    }
  } else if (state.phase === "harvesting") {
    harvestNearby();
    const done = advanceAlong(state.plantPath, "plantIndex", speed * 0.9, dt, harvestNearby);
    if (done) {
      harvestNearby();
      finishHarvest();
      setPhase("done");
      setPlantingButtons();
    }
  } else if (state.phase === "pollinating") {
    const week = state.pollWeekMission || pollWeekFromMode(state.mode) || 1;
    pollinateNearby(week);
    const done = advanceAlong(state.plantPath, "plantIndex", speed * 0.9, dt, () => pollinateNearby(week));
    if (done) {
      pollinateNearby(week);
      setPhase("done");
      setPlantingButtons();
      const doneN = state.plants.filter((p) => (p.pollWeek || 0) >= week).length;
      const ends = ["", "flowers are open", "flowers are pollinated", "fruit is set"];
      log(`Pollination week ${week} complete. ${doneN} plant${doneN === 1 ? "" : "s"} — ${ends[week]}.`);
      reportPollinatedCount();
    }
  }
  if (state.clockRunning) {
    const prevYear = state.farmYear;
    state.yearProgress += dt / SECONDS_PER_YEAR;
    if (state.yearProgress >= 1) {
      state.yearProgress -= 1;
      state.farmYear += 1;
      if (state.farmYear !== prevYear) log(`Farm year ${state.farmYear} began.`);
    }
    updateFarmClock(true);
    tickFruitGrowth(dt);
  }
  tickSeasonGrowth(dt);
  syncDroneVisual(dt);
  updateTrailLine();
  applyModeVisuals();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

canvas.addEventListener("pointerdown", (evt) => {
  pointerDown = { x: evt.clientX, y: evt.clientY };
});
canvas.addEventListener("pointerup", (evt) => {
  if (!pointerDown) return;
  const moved = Math.hypot(evt.clientX - pointerDown.x, evt.clientY - pointerDown.y);
  pointerDown = null;
  if (moved < 5) placeFromEvent(evt);
});

rockCountInput.addEventListener("input", syncMissionControlOutputs);
plantCountInput.addEventListener("input", syncMissionControlOutputs);
weedCountInput.addEventListener("input", syncMissionControlOutputs);
scanSpeedInput.addEventListener("input", syncMissionControlOutputs);
seedInput.addEventListener("input", syncMissionControlOutputs);
seedInput.addEventListener("change", syncMissionControlOutputs);

document.getElementById("field-select").addEventListener("change", (evt) => {
  applyMode(evt.target.value || "field", true);
});
document.getElementById("planting-select").addEventListener("change", (evt) => {
  applyMode(evt.target.value || "field", true);
});

document.getElementById("btn-clock-play").addEventListener("click", toggleFarmClock);
document.getElementById("btn-clock-advance").addEventListener("click", advanceSeason);
document.getElementById("btn-generate").addEventListener("click", generateField);
document.getElementById("btn-scan").addEventListener("click", startScan);
document.getElementById("btn-stand").addEventListener("click", reportStandCount);
document.getElementById("btn-pickup").addEventListener("click", startPickup);
document.getElementById("btn-treat").addEventListener("click", startTreat);
document.getElementById("btn-treat-pests").addEventListener("click", startTreatPests);
document.getElementById("btn-treat-all").addEventListener("click", startTreatAll);
document.getElementById("btn-prepare").addEventListener("click", prepareField);
document.getElementById("btn-transplant").addEventListener("click", startTransplant);
document.getElementById("btn-irrigate").addEventListener("click", startIrrigate);
document.getElementById("btn-pollinate").addEventListener("click", startPollination);
document.getElementById("btn-poll-count").addEventListener("click", reportPollinatedCount);
document.getElementById("btn-fruit-count").addEventListener("click", reportFruitCount);
document.getElementById("btn-harvest").addEventListener("click", startHarvest);
document.getElementById("btn-reset").addEventListener("click", () => {
  resetDrone();
  setPhase("idle");
  state.rocks.forEach((r) => {
    r.detected = false;
  });
  state.weeds.forEach((w) => {
    if (!w.treated) w.detected = false;
  });
  state.pests.forEach((p) => {
    if (!p.treated) p.detected = false;
  });
  state.plants.forEach((p) => {
    if (!p.fromNutrition && !p.transplanted) p.detected = false;
  });
  state.pickupPath = [];
  state.weedPath = [];
  state.pestPath = [];
  state.treatAllPath = [];
  state.treatAllIndex = 0;
  state.plantPath = [];
  state.plantMission = null;
  state.pendingEmptySites = [];
  pathPill.textContent = "Path —";
  updateCounts();
  syncRocks();
  syncWeeds();
  syncPests();
  syncPlants();
  updatePathLine();
  updateWeedPathLine();
  updatePestPathLine();
  updatePlantPathLine();
  updateTrailLine();
});

window.addEventListener("resize", resize);
resize();
syncMissionControlOutputs();
generateField();
applyMode("field", false);
updateFarmClock(false);
requestAnimationFrame(tick);
})();
