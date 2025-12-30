// game.js — core game loop (Pixel Fields v2)
// Adds: multiple crops, seasons, buildings, achievements, audio, richer 8-bit UI.

(function(){
  const { $, $$, toast, setHint } = window.UI;
  const { CROPS, SEASONS, BUILDINGS, ACHIEVEMENTS } = window.Content;
  const Audio8 = window.Audio8;

  // --------- Config ----------
  const START_COINS = 5;
  const START_SEEDS = { potato: 10, carrot: 2, corn: 0, pumpkin: 0 };
  const START_PLOTS = 10;

  const WEATHER_TYPES = [
    { id:"sunny", label:"Sunny",   growMult: 1.00, marketMult: 1.00, fxClass:"" },
    { id:"rain",  label:"Rain",    growMult: 0.82, marketMult: 0.92, fxClass:"rain" },
    { id:"wind",  label:"Windy",   growMult: 1.10, marketMult: 1.05, fxClass:"" },
    { id:"storm", label:"Storm",   growMult: 1.18, marketMult: 1.18, fxClass:"storm" },
    { id:"snow",  label:"Snow",    growMult: 1.28, marketMult: 1.22, fxClass:"snow" }
  ];

  // --------- State ----------
  const state = {
    version: 2,
    coins: START_COINS,
    seeds: { ...START_SEEDS },     // per crop
    crops: { potato: 0, carrot: 0, corn: 0, pumpkin: 0 }, // inventory
    selectedCrop: "potato",
    selectedSell: "potato",

    plots: [], // { s:0 empty,1 planted,2 ready, crop:"potato", t:epochMs }

    upgrades: { shovel:0, sprinkler:0, cart:0, coop:0, plot:0 },
    buildings: { barn:0, silo:0, windmill:0, farmhouse:0 },

    dayKey: "",
    dayNum: 1,
    seasonId: "spring",
    weather: "sunny",

    marketSeed: 0,
    marketPriceByCrop: {},

    quests: [],
    questProgress: { planted:0, harvested:0, sold:0, plantedToday:0, harvestTypes:{} },

    achievements: {}, // id -> true
    tutorialDone: false,

    audio: { musicOn:true, sfxOn:true }
  };

  // --------- DOM ----------
  const el = {
    coins: $("#coins"),
    seedTotal: $("#seedTotal"),
    cropsTotal: $("#cropsTotal"),
    dayLabel: $("#dayLabel"),
    seasonLabel: $("#seasonLabel"),
    weatherLabel: $("#weatherLabel"),
    weatherPill: $("#weatherPill"),
    weatherFx: $("#weatherFx"),
    marketPill: $("#marketPill"),
    marketShort: $("#marketShort"),

    field: $("#field"),
    animals: $("#animals"),
    buildingsScene: $("#buildingsScene"),

    cropChips: $("#cropChips"),
    sellChips: $("#sellChips"),
    seedGrid: $("#seedGrid"),

    storeGrid: $("#storeGrid"),
    buildingGrid: $("#buildingGrid"),
    questList: $("#questList"),
    achList: $("#achList"),

    marketPriceLabel: $("#marketPriceLabel"),
    marketCropLabel: $("#marketCropLabel"),
    spark: $("#spark"),

    btnMusic: $("#toggleMusic"),
    btnSfx: $("#toggleSfx")
  };

  // --------- Utils ----------
  function todayKey(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}`;
  }

  function randSeedFromKey(key){
    let h = 2166136261;
    for(let i=0;i<key.length;i++){
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  }

  function seededRand(seed){
    let t = seed >>> 0;
    return function(){
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }
  function sumObj(o){ return Object.values(o).reduce((a,b)=>a+(b||0),0); }
  function cropById(id){ return CROPS.find(c=>c.id===id) || CROPS[0]; }
  function seasonById(id){ return SEASONS.find(s=>s.id===id) || SEASONS[0]; }
  function weatherById(id){ return WEATHER_TYPES.find(w=>w.id===id) || WEATHER_TYPES[0]; }
  function buildingByKey(k){ return BUILDINGS.find(b=>b.key===k); }

  // --------- Progression math ----------
  function growMsForCrop(cropId){
    const c = cropById(cropId);
    const w = weatherById(state.weather);
    const s = seasonById(state.seasonId);

    // sprinkler upgrade speeds up; windmill building also speeds up
    const sprinklerBonus = 1 - clamp(state.upgrades.sprinkler * 0.035, 0, 0.35);
    const windmillBonus = 1 - clamp(state.buildings.windmill * 0.02, 0, 0.20);

    return Math.round(c.growMs * w.growMult * s.growMult * sprinklerBonus * windmillBonus);
  }

  function harvestYield(){
    // base 1 + shovel scaling + barn building bonus
    const shovel = 1 + Math.floor(state.upgrades.shovel / 2);
    const barn = Math.floor(state.buildings.barn / 3); // +1 each 3 levels
    return shovel + barn;
  }

  function questRewardBoost(){
    // farmhouse gives small extra coins on quest claim
    return 1 + clamp(state.buildings.farmhouse * 0.03, 0, 0.30);
  }

  function marketPriceForCrop(cropId){
    const c = cropById(cropId);
    const w = weatherById(state.weather);
    const s = seasonById(state.seasonId);

    const cartBonus = 1 + clamp(state.upgrades.cart * 0.02, 0, 0.20);
    const siloBonus = 1 + clamp(state.buildings.silo * 0.02, 0, 0.20);

    const r = state.marketRand ? state.marketRand() : Math.random();
    const swing = (r * 0.8) + 0.6; // 0.6..1.4

    const price = c.basePrice * swing * w.marketMult * s.marketMult * cartBonus * siloBonus;
    return clamp(Math.round(price), 1, 10);
  }

  // --------- Daily systems ----------
  function calcSeasonFromDay(dayNum){
    // 7 days per season
    const idx = Math.floor((dayNum-1) / 7) % SEASONS.length;
    return SEASONS[idx].id;
  }

  function weightedPick(weights, rand){
    const entries = Object.entries(weights);
    const total = entries.reduce((a,[,v])=>a+v,0);
    let r = rand() * total;
    for(const [k,v] of entries){
      r -= v;
      if(r <= 0) return k;
    }
    return entries[0][0];
  }

  function ensureDaySystems(){
    const k = todayKey();
    if(state.dayKey === k) return;

    state.dayKey = k;
    state.dayNum += 1;
    state.seasonId = calcSeasonFromDay(state.dayNum);

    const seed = randSeedFromKey(k);
    state.marketSeed = seed;
    state.marketRand = seededRand(seed ^ 0xA5A5A5A5);

    // choose weather using season weights
    const s = seasonById(state.seasonId);
    const wr = seededRand(seed ^ 0xC0FFEE);
    const wId = weightedPick(s.weatherWeights, wr);
    state.weather = wId;

    // compute stable market prices for the day
    state.marketPriceByCrop = {};
    for(const c of CROPS){
      state.marketPriceByCrop[c.id] = marketPriceForCrop(c.id);
    }

    // reset daily quests + progress (but keep achievements)
    state.questProgress = { planted:0, harvested:0, sold:0, plantedToday:0, harvestTypes:{} };
    state.quests = makeDailyQuests(seed);

    applyWeatherVisuals();
  }

  function makeDailyQuests(seed){
    const r = seededRand(seed ^ 0xBEEF);
    const q1 = 6 + Math.floor(r()*7);    // plant 6-12
    const q2 = 6 + Math.floor(r()*8);    // harvest 6-13
    const q3 = 12 + Math.floor(r()*29);  // sell 12-40

    return [
      { id:"plant", name:`PLANT ${q1} PLOTS`, desc:"GET THE FIELD STARTED.", goal:q1, progKey:"planted", reward:{ coins: 8, seeds: 3 }, claimed:false },
      { id:"harv",  name:`HARVEST ${q2} PLOTS`, desc:"BRING CROPS IN.", goal:q2, progKey:"harvested", reward:{ coins: 10, seeds: 0 }, claimed:false },
      { id:"sell",  name:`SELL ${q3} CROPS`, desc:"CASH IN AT THE MARKET.", goal:q3, progKey:"sold", reward:{ coins: 14, seeds: 2 }, claimed:false }
    ];
  }

  // --------- Rendering ----------
  function render(){
    ensureDaySystems();

    // totals
    el.coins.textContent = state.coins;
    el.seedTotal.textContent = sumObj(state.seeds);
    el.cropsTotal.textContent = sumObj(state.crops);

    el.dayLabel.textContent = `DAY ${state.dayNum}`;
    el.seasonLabel.textContent = seasonById(state.seasonId).label.toUpperCase();
    el.weatherLabel.textContent = weatherById(state.weather).label.toUpperCase();
    el.weatherPill.textContent = weatherById(state.weather).label.toUpperCase();

    // market pill quick view
    const sp = state.marketPriceByCrop[state.selectedSell] ?? cropById(state.selectedSell).basePrice;
    el.marketShort.textContent = `${cropById(state.selectedSell).name} ${sp}C`;

    // market panel current
    el.marketPriceLabel.textContent = String(sp);
    el.marketCropLabel.textContent = cropById(state.selectedSell).name.toLowerCase();

    renderCropChips();
    renderSellChips();
    renderSeedGrid();
    renderField();
    renderStore();
    renderBuildings();
    renderQuests();
    renderAchievements();
    renderSparkline();

    // hint
    if(sumObj(state.seeds) <= 0) setHint("NO SEEDS. BUY SEEDS IN STORE (1 COIN EACH).");
    else setHint("TAP EMPTY PLOTS TO PLANT. TAP READY PLOTS TO HARVEST. SELL AT THE MARKET.");
  }

  function renderCropChips(){
    el.cropChips.innerHTML = "";
    for(const c of CROPS){
      const btn = document.createElement("button");
      btn.className = "chip" + (state.selectedCrop===c.id ? " active" : "");
      btn.type = "button";
      btn.innerHTML = `<span class="dot" style="background:${c.color}"></span>${c.name} (${state.seeds[c.id]||0})`;
      btn.addEventListener("click", ()=>{ state.selectedCrop=c.id; saveSoon(); render(); });
      el.cropChips.appendChild(btn);
    }
  }

  function renderSellChips(){
    el.sellChips.innerHTML = "";
    for(const c of CROPS){
      const btn = document.createElement("button");
      btn.className = "chip" + (state.selectedSell===c.id ? " active" : "");
      btn.type = "button";
      const price = state.marketPriceByCrop[c.id] ?? c.basePrice;
      const inv = state.crops[c.id] || 0;
      btn.innerHTML = `<span class="dot" style="background:${c.color}"></span>${c.name} (${inv}) • ${price}C`;
      btn.addEventListener("click", ()=>{ state.selectedSell=c.id; saveSoon(); render(); });
      el.sellChips.appendChild(btn);
    }
  }

  function renderSeedGrid(){
    el.seedGrid.innerHTML = "";
    for(const c of CROPS){
      const box = document.createElement("div");
      box.className = "storeItem";
      const left = document.createElement("div");
      left.innerHTML = `<div class="name"><span class="icon8 plot" style="background:${c.color}"></span>${c.name} SEED</div>
                        <div class="desc">COST: 1 COIN • GROW: ${Math.round(growMsForCrop(c.id)/1000)}S • BASE PRICE: ${c.basePrice}C</div>`;
      const right = document.createElement("div");
      right.className = "meta";
      const btn1 = document.createElement("button");
      btn1.className = "btn small";
      btn1.textContent = "BUY 1 (1)";
      btn1.disabled = state.coins < 1;
      btn1.addEventListener("click", ()=> buySeeds(c.id, 1));

      const btn10 = document.createElement("button");
      btn10.className = "btn small";
      btn10.textContent = "BUY 10 (10)";
      btn10.disabled = state.coins < 10;
      btn10.addEventListener("click", ()=> buySeeds(c.id, 10));

      right.appendChild(btn1);
      right.appendChild(btn10);

      box.appendChild(left);
      box.appendChild(right);
      el.seedGrid.appendChild(box);
    }
  }

  function plotSpriteClass(cropId){
    if(cropId==="potato") return "potato";
    if(cropId==="carrot") return "carrot";
    if(cropId==="corn") return "corn";
    if(cropId==="pumpkin") return "pumpkin";
    return "potato";
  }

  function renderField(){
    el.field.innerHTML = "";
    const now = Date.now();

    state.plots.forEach((p, idx)=>{
      // update growth
      if(p.s===1 && p.t){
        const gms = growMsForCrop(p.crop);
        if((now - p.t) >= gms){
          p.s = 2;
          p.t = 0;
        }
      }

      const d = document.createElement("button");
      d.className = "plot";
      d.type = "button";
      d.dataset.idx = String(idx);

      const soil = document.createElement("div");
      soil.className = "soil";
      d.appendChild(soil);

      const spr = document.createElement("div");
      spr.className = "sprite";
      if(p.s===0){
        spr.classList.add("empty");
      }else if(p.s===1){
        spr.classList.add("sprout");
      }else{
        spr.classList.add(plotSpriteClass(p.crop));
      }
      d.appendChild(spr);

      if(p.s===1 && p.t){
        const pr = document.createElement("div");
        pr.className = "progress";
        const i = document.createElement("i");
        const gms = growMsForCrop(p.crop);
        const pct = clamp((now - p.t) / gms, 0, 1);
        i.style.width = (pct*100).toFixed(0) + "%";
        pr.appendChild(i);
        d.appendChild(pr);
      }

      const meta = document.createElement("div");
      meta.className = "meta";
      const left = document.createElement("span");
      left.className = "badge";
      if(p.s===0) left.textContent = "EMPTY";
      if(p.s===1) left.textContent = "GROW";
      if(p.s===2) left.textContent = "READY";

      const right = document.createElement("span");
      right.className = "badge";
      if(p.s===0){
        right.textContent = `-1 ${cropById(state.selectedCrop).name.toUpperCase()} SEED`;
      }else if(p.s===1){
        right.textContent = `${Math.round(growMsForCrop(p.crop)/1000)}S`;
      }else{
        right.textContent = `+${harvestYield()} ${cropById(p.crop).name.toUpperCase()}`;
      }
      meta.appendChild(left); meta.appendChild(right);
      d.appendChild(meta);

      d.addEventListener("click", ()=> onPlotClick(idx));
      el.field.appendChild(d);
    });
  }

  function renderStore(){
    // Upgrades (with 8-bit icons)
    const upgrades = [
      { key:"shovel", name:"SHOVEL", desc:"MORE YIELD. +1 EVERY 2 LEVELS.", icon:"shovel" },
      { key:"sprinkler", name:"SPRINKLER", desc:"FASTER GROWTH.", icon:"sprinkler" },
      { key:"cart", name:"CART", desc:"BETTER PRICES.", icon:"cart" },
      { key:"coop", name:"COOP", desc:"MORE ANIMALS (VISUAL).", icon:"coop" },
      { key:"plot", name:"EXTRA PLOT", desc:"ADD +1 PLOT.", icon:"plot" }
    ];

    el.storeGrid.innerHTML = "";
    for(const u of upgrades){
      const lvl = state.upgrades[u.key] || 0;
      const cost = upgradeCost(u.key);
      const item = document.createElement("div");
      item.className = "storeItem";

      const left = document.createElement("div");
      left.innerHTML = `<div class="name"><span class="icon8 ${u.icon}"></span>${u.name} LV ${lvl}</div>
                        <div class="desc">${u.desc}</div>`;

      const right = document.createElement("div");
      right.className = "meta";
      right.innerHTML = `<div>COST: <b>${cost}</b></div>`;

      const btn = document.createElement("button");
      btn.className = "btn small";
      btn.textContent = "BUY";
      btn.disabled = state.coins < cost;
      btn.addEventListener("click", ()=> buyUpgrade(u.key));

      right.appendChild(btn);
      item.appendChild(left);
      item.appendChild(right);
      el.storeGrid.appendChild(item);
    }

    // Audio buttons
    el.btnMusic.textContent = `MUSIC: ${state.audio.musicOn ? "ON" : "OFF"}`;
    el.btnSfx.textContent = `SFX: ${state.audio.sfxOn ? "ON" : "OFF"}`;
  }

  function renderBuildings(){
    el.buildingGrid.innerHTML = "";
    for(const b of BUILDINGS){
      const lvl = state.buildings[b.key] || 0;
      const cost = buildingCost(b.key);
      const item = document.createElement("div");
      item.className = "storeItem";

      const left = document.createElement("div");
      left.innerHTML = `<div class="name"><span class="icon8 ${b.key}"></span>${b.name.toUpperCase()} LV ${lvl}</div>
                        <div class="desc">${b.desc.toUpperCase()}</div>`;

      const right = document.createElement("div");
      right.className = "meta";
      right.innerHTML = `<div>COST: <b>${cost}</b></div>`;

      const btn = document.createElement("button");
      btn.className = "btn small";
      btn.textContent = lvl >= b.max ? "MAX" : "BUILD";
      btn.disabled = lvl >= b.max || state.coins < cost;
      btn.addEventListener("click", ()=> buyBuilding(b.key));

      right.appendChild(btn);
      item.appendChild(left);
      item.appendChild(right);
      el.buildingGrid.appendChild(item);
    }

    renderBuildingsOnScene();
  }

  function renderBuildingsOnScene(){
    el.buildingsScene.innerHTML = "";
    // place up to 3 building sprites based on unlocked levels
    const keys = Object.keys(state.buildings).filter(k=> (state.buildings[k]||0) > 0);
    const maxShow = 3;
    const show = keys.slice(0, maxShow);
    const positions = [
      { left:"10%", top:"16%" },
      { left:"76%", top:"18%" },
      { left:"46%", top:"30%" }
    ];
    show.forEach((k,i)=>{
      const spr = document.createElement("div");
      spr.className = `buildingSprite ${k}`;
      spr.style.left = positions[i].left;
      spr.style.top  = positions[i].top;
      el.buildingsScene.appendChild(spr);
    });
  }

  function renderQuests(){
    el.questList.innerHTML = "";
    for(const q of state.quests){
      const prog = state.questProgress[q.progKey] || 0;
      const pct = clamp(prog / q.goal, 0, 1);

      const wrap = document.createElement("div");
      wrap.className = "quest";

      const left = document.createElement("div");
      left.innerHTML = `<div class="name">${q.name}</div>
                        <div class="desc">${q.desc} • REWARD: ${q.reward.coins}C${q.reward.seeds?` +${q.reward.seeds} SEEDS`:``}</div>`;

      const right = document.createElement("div");
      right.className = "right";

      const bar = document.createElement("div");
      bar.className = "bar";
      const i = document.createElement("i");
      i.style.width = (pct*100).toFixed(0) + "%";
      bar.appendChild(i);

      const btn = document.createElement("button");
      btn.className = "btn small";
      const complete = prog >= q.goal;
      btn.textContent = q.claimed ? "CLAIMED" : (complete ? "CLAIM" : `${prog}/${q.goal}`);
      btn.disabled = q.claimed || !complete;
      btn.addEventListener("click", ()=> claimQuest(q.id));

      right.appendChild(bar);
      right.appendChild(btn);

      wrap.appendChild(left);
      wrap.appendChild(right);
      el.questList.appendChild(wrap);
    }
  }

  function renderAchievements(){
    el.achList.innerHTML = "";
    for(const a of ACHIEVEMENTS){
      const unlocked = !!state.achievements[a.id];
      const wrap = document.createElement("div");
      wrap.className = "ach" + (unlocked ? "" : " locked");

      const badge = document.createElement("div");
      badge.className = "badge8";

      const mid = document.createElement("div");
      mid.innerHTML = `<div class="name">${a.name}</div><div class="desc">${a.desc} • REWARD: ${a.reward.coins}C${a.reward.seeds?` +${a.reward.seeds} SEEDS`:``}</div>`;

      const right = document.createElement("div");
      right.className = "right";

      const btn = document.createElement("button");
      btn.className = "btn small";
      btn.textContent = unlocked ? "UNLOCKED" : "LOCKED";
      btn.disabled = true;

      right.appendChild(btn);

      wrap.appendChild(badge);
      wrap.appendChild(mid);
      wrap.appendChild(right);
      el.achList.appendChild(wrap);
    }
  }

  function renderSparkline(){
    const c = el.spark;
    if(!c) return;
    const ctx = c.getContext("2d");
    const w = c.width, h = c.height;
    ctx.clearRect(0,0,w,h);

    const crop = cropById(state.selectedSell);
    const r = seededRand(state.marketSeed ^ (crop.id.charCodeAt(0)<<16) ^ 0x1234);
    const pts = [];
    let v = crop.basePrice;
    for(let i=0;i<24;i++){
      v += (r()-0.5) * 1.0;
      v = clamp(v, 1, 10);
      pts.push(v);
    }

    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for(let i=0;i<pts.length;i++){
      const x = (i/(pts.length-1)) * (w-16) + 8;
      const y = h - ((pts[i]-1)/9)*(h-16) - 8;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.strokeStyle = "#63a5ff";
    ctx.stroke();

    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(8, h-8);
    ctx.lineTo(w-8, h-8);
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function applyWeatherVisuals(){
    el.weatherFx.className = "weatherFx";
    const w = weatherById(state.weather);
    if(w.fxClass) el.weatherFx.classList.add(w.fxClass);
  }

  // --------- Costs ----------
  function upgradeCost(key){
    const lvl = state.upgrades[key] || 0;
    const base = (key==="shovel")?12 : (key==="sprinkler")?18 : (key==="cart")?22 : (key==="coop")?14 : 10;
    if(key==="plot") return Math.round(base + lvl * 8);
    return Math.round(base + lvl * (base*0.55));
  }

  function buildingCost(key){
    const lvl = state.buildings[key] || 0;
    const def = buildingByKey(key);
    const base = def ? def.baseCost : 30;
    return Math.round(base + lvl * (base*0.60));
  }

  // --------- Actions ----------
  function buySeeds(cropId, n){
    const cost = n * 1;
    if(state.coins < cost) return fail(`NEED ${cost} COINS`);
    state.coins -= cost;
    state.seeds[cropId] = (state.seeds[cropId]||0) + n;
    Audio8.sfx.buy();
    toast(`BOUGHT ${n} ${cropById(cropId).name.toUpperCase()} SEED`);
    saveSoon(); render();
  }

  function buyUpgrade(key){
    const cost = upgradeCost(key);
    if(state.coins < cost) return fail(`NEED ${cost} COINS`);
    state.coins -= cost;
    state.upgrades[key] = (state.upgrades[key]||0) + 1;

    if(key==="plot"){
      state.plots.push({ s:0, t:0, crop:"potato" });
    }

    Audio8.sfx.upgrade();
    toast("UPGRADED");
    saveSoon(); render();
  }

  function buyBuilding(key){
    const def = buildingByKey(key);
    if(!def) return;
    const lvl = state.buildings[key] || 0;
    if(lvl >= def.max) return fail("MAX");
    const cost = buildingCost(key);
    if(state.coins < cost) return fail(`NEED ${cost} COINS`);
    state.coins -= cost;
    state.buildings[key] = lvl + 1;
    Audio8.sfx.upgrade();
    toast(`${def.name.toUpperCase()} BUILT`);
    saveSoon(); render();
  }

  function sellCrop(cropId, n){
    const inv = state.crops[cropId] || 0;
    n = Math.min(n, inv);
    if(n <= 0) return fail("NOTHING TO SELL");

    const price = state.marketPriceByCrop[cropId] ?? cropById(cropId).basePrice;
    const earned = n * price;

    state.crops[cropId] -= n;
    state.coins += earned;

    state.questProgress.sold += n;

    Audio8.sfx.sell();
    toast(`SOLD ${n} FOR ${earned}C`);
    checkAchievements();
    saveSoon(); render();
  }

  function onPlotClick(i){
    ensureDaySystems();
    const p = state.plots[i];

    if(p.s === 0){
      const cropId = state.selectedCrop;
      if((state.seeds[cropId]||0) <= 0) return fail("NO SEED");
      state.seeds[cropId] -= 1;
      p.s = 1;
      p.crop = cropId;
      p.t = Date.now();

      state.questProgress.planted += 1;
      state.questProgress.plantedToday += 1;

      Audio8.sfx.plant();
      toast("PLANTED");
      unlockAchievement("first_plant");
      checkAchievements();
      saveSoon(); render();
      return;
    }

    if(p.s === 1){
      return toast("GROWING...");
    }

    if(p.s === 2){
      const y = harvestYield();
      const cropId = p.crop || "potato";
      state.crops[cropId] = (state.crops[cropId]||0) + y;
      p.s = 0; p.t = 0;

      state.questProgress.harvested += 1;
      state.questProgress.harvestTypes[cropId] = true;

      Audio8.sfx.harvest();
      toast(`HARVEST +${y}`);
      unlockAchievement("first_harvest");
      checkAchievements();
      saveSoon(); render();
      return;
    }
  }

  function plantAll(){
    let planted = 0;
    for(const p of state.plots){
      const cropId = state.selectedCrop;
      if((state.seeds[cropId]||0) <= 0) break;
      if(p.s === 0){
        state.seeds[cropId] -= 1;
        p.s = 1; p.crop = cropId; p.t = Date.now();
        planted++;
      }
    }
    if(planted <= 0) return fail((state.seeds[state.selectedCrop]||0)<=0 ? "NO SEED" : "NO EMPTY");
    state.questProgress.planted += planted;
    state.questProgress.plantedToday += planted;
    Audio8.sfx.plant();
    toast(`PLANTED ${planted}`);
    unlockAchievement("first_plant");
    checkAchievements();
    saveSoon(); render();
  }

  function harvestAll(){
    let harvested = 0;
    for(const p of state.plots){
      if(p.s === 2){
        const y = harvestYield();
        const cropId = p.crop || "potato";
        state.crops[cropId] = (state.crops[cropId]||0) + y;
        p.s = 0; p.t = 0;
        harvested++;
      }
    }
    if(harvested <= 0) return fail("NO READY");
    state.questProgress.harvested += harvested;
    Audio8.sfx.harvest();
    toast(`HARVESTED ${harvested}`);
    unlockAchievement("first_harvest");
    checkAchievements();
    saveSoon(); render();
  }

  function sellAll(){
    // sell all crops at current prices
    let totalEarn = 0;
    let totalSold = 0;
    for(const c of CROPS){
      const inv = state.crops[c.id]||0;
      if(inv<=0) continue;
      const price = state.marketPriceByCrop[c.id] ?? c.basePrice;
      totalEarn += inv * price;
      totalSold += inv;
      state.crops[c.id] = 0;
    }
    if(totalSold<=0) return fail("NOTHING TO SELL");
    state.coins += totalEarn;
    state.questProgress.sold += totalSold;
    Audio8.sfx.sell();
    toast(`SOLD ALL +${totalEarn}C`);
    unlockAchievement("first_sell");
    checkAchievements();
    saveSoon(); render();
  }

  // --------- Achievements ----------
  function unlockAchievement(id){
    if(state.achievements[id]) return;
    const a = ACHIEVEMENTS.find(x=> x.id===id);
    if(!a) return;
    state.achievements[id] = true;

    // reward
    state.coins += a.reward.coins;
    const bonusSeeds = a.reward.seeds || 0;
    if(bonusSeeds > 0){
      state.seeds.potato = (state.seeds.potato||0) + bonusSeeds;
    }

    Audio8.sfx.achieve();
    toast(`ACHIEVEMENT: ${a.name.toUpperCase()}`);
    saveSoon();
  }

  function checkAchievements(){
    // milestones
    if(state.coins >= 100) unlockAchievement("hundred_coins");
    if(state.coins >= 1000) unlockAchievement("thousand_coins");

    const totalCrops = sumObj(state.crops);
    if(totalCrops >= 100) unlockAchievement("100_crops");

    if((state.questProgress.plantedToday||0) >= 50) unlockAchievement("50_plants_day");

    // all crop types harvested at least once
    const ht = state.questProgress.harvestTypes || {};
    const all = CROPS.every(c=> !!ht[c.id]);
    if(all) unlockAchievement("all_crops");
  }

  // --------- Animals (visual) ----------
  const animalState = { list: [], lastSpawn: 0 };

  function animalMax(){
    return 2 + Math.floor((state.upgrades.coop||0) / 2) + Math.floor((state.buildings.farmhouse||0)/2);
  }

  function spawnAnimal(){
    const max = animalMax();
    if(animalState.list.length >= max) return;

    const a = document.createElement("div");
    const type = (Math.random() < 0.65) ? "chicken" : "cow";
    a.className = `animal ${type}`;
    const dot = document.createElement("div");
    dot.className = "dot";
    a.appendChild(dot);

    const startX = -30;
    const endX = el.animals.clientWidth + 30;
    const y = 40 + Math.random() * (el.animals.clientHeight - 84);

    a.style.left = startX + "px";
    a.style.top = y + "px";
    el.animals.appendChild(a);

    const speed = 18 + Math.random()*22;
    animalState.list.push({ el:a, x:startX, endX, speed });
  }

  function animalsTick(dt){
    if(!el.animals) return;
    animalState.lastSpawn += dt;
    if(animalState.lastSpawn > 3200){
      animalState.lastSpawn = 0;
      spawnAnimal();
    }
    animalState.list.forEach(o=>{
      o.x += o.speed * (dt/1000);
      o.el.style.left = o.x + "px";
    });
    animalState.list = animalState.list.filter(o=>{
      if(o.x > o.endX){ o.el.remove(); return false; }
      return true;
    });
  }

  // --------- Tutorial ----------
  const tutorialSteps = [
    { title:"WELCOME", html:`<p>YOU START WITH <b>${START_COINS} COINS</b> AND <b>${START_SEEDS.potato} POTATO SEEDS</b>.</p><p>ALL SEEDS COST <b>1 COIN</b>. PRICES CHANGE DAILY.</p>` },
    { title:"PLANT", html:`<p>CHOOSE A CROP (CHIPS ABOVE THE FIELD), THEN TAP AN EMPTY PLOT TO PLANT.</p>` },
    { title:"HARVEST", html:`<p>WHEN A PLOT IS READY, TAP IT TO HARVEST. UPGRADE <b>SHOVEL</b> FOR MORE YIELD.</p>` },
    { title:"SELL", html:`<p>SELL CROPS IN THE MARKET TAB. BASE POTATO PRICE IS <b>2 COINS</b>, BUT THE MARKET MOVES.</p>` },
    { title:"SEASONS + WEATHER", html:`<p>SEASONS CHANGE EVERY 7 DAYS. WEATHER AFFECTS GROWTH + PRICES.</p>` },
    { title:"BUILDINGS + ACHIEVEMENTS", html:`<p>BUILDINGS GIVE PASSIVE BONUSES. ACHIEVEMENTS GIVE REWARDS.</p>` },
  ];
  const tutorial = UI.initTutorial(tutorialSteps, ()=>{ state.tutorialDone = true; saveSoon(); });

  // --------- Quests ----------
  function claimQuest(id){
    const q = state.quests.find(x=> x.id===id);
    if(!q || q.claimed) return;
    const prog = state.questProgress[q.progKey] || 0;
    if(prog < q.goal) return;

    const boost = questRewardBoost();
    const coinsEarn = Math.round(q.reward.coins * boost);

    state.coins += coinsEarn;
    // seeds reward go to potato seeds for simplicity
    state.seeds.potato = (state.seeds.potato||0) + (q.reward.seeds||0);
    q.claimed = true;

    Audio8.sfx.achieve();
    toast(`QUEST CLAIMED +${coinsEarn}C`);
    checkAchievements();
    saveSoon(); render();
  }

  // --------- Fail helper ----------
  function fail(msg){
    Audio8.sfx.error();
    toast(msg);
  }

  // --------- Events ----------
  function bind(){
    $("#plantAll").addEventListener("click", plantAll);
    $("#harvestAll").addEventListener("click", harvestAll);
    $("#sellAll").addEventListener("click", sellAll);

    $("#sell10").addEventListener("click", ()=> sellCrop(state.selectedSell, 10));
    $("#sell50").addEventListener("click", ()=> sellCrop(state.selectedSell, 50));
    $("#sellAll2").addEventListener("click", ()=> sellCrop(state.selectedSell, state.crops[state.selectedSell]||0));

    $("#openTutorial").addEventListener("click", ()=> tutorial.open());

    $("#saveNow").addEventListener("click", ()=> { saveNow(); toast("SAVED"); });
    $("#reset").addEventListener("click", ()=>{
      if(!confirm("RESET ALL PROGRESS?")) return;
      StorageAPI.clear();
      init(true);
      toast("RESET");
    });

    $("#saveBtn")?.addEventListener("click", ()=> { saveNow(); toast("SAVED"); });
    $("#resetBtn")?.addEventListener("click", ()=>{
      if(!confirm("RESET ALL PROGRESS?")) return;
      StorageAPI.clear();
      init(true);
      toast("RESET");
    });

    // Audio toggles
    el.btnMusic.addEventListener("click", ()=>{
      state.audio.musicOn = !state.audio.musicOn;
      Audio8.setMusic(state.audio.musicOn);
      if(state.audio.musicOn) Audio8.startMusic(); else Audio8.stopMusic();
      saveSoon(); render();
    });
    el.btnSfx.addEventListener("click", ()=>{
      state.audio.sfxOn = !state.audio.sfxOn;
      Audio8.setSfx(state.audio.sfxOn);
      saveSoon(); render();
    });

    // unlock audio on first interaction
    document.addEventListener("pointerdown", ()=>{
      Audio8.ensure();
      Audio8.setMusic(state.audio.musicOn);
      Audio8.setSfx(state.audio.sfxOn);
      if(state.audio.musicOn) Audio8.startMusic();
    }, { once:true });

    // quests claim delegation
    el.questList.addEventListener("click", (e)=>{
      const t = e.target;
      if(!(t instanceof HTMLElement)) return;
      if(t.classList.contains("btn")){
        const q = t.closest(".quest");
        if(!q) return;
        const nameEl = q.querySelector(".name");
        if(!nameEl) return;
        // map by order in list
        const idx = Array.from(el.questList.children).indexOf(q);
        const qobj = state.quests[idx];
        if(qobj) claimQuest(qobj.id);
      }
    });
  }

  // --------- Save ----------
  let saveTimer = null;
  function saveSoon(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 500);
  }
  function saveNow(){
    const payload = JSON.parse(JSON.stringify(state));
    delete payload.marketRand;
    StorageAPI.save(payload);
  }

  // --------- Init ----------
  function init(forceNew=false){
    const loaded = (!forceNew) ? StorageAPI.load() : null;

    if(loaded && (loaded.version === 2 || loaded.version === 1)){
      // migrate v1 -> v2
      if(loaded.version === 1){
        state.coins = loaded.coins ?? START_COINS;
        state.seeds = { ...START_SEEDS };
        state.crops = { potato: loaded.potatoes ?? 0, carrot:0, corn:0, pumpkin:0 };
        state.plots = (loaded.plots || []).map(p=> ({ s:p.state??0, t:p.plantedAt??0, crop:"potato" }));
        state.upgrades = loaded.upgrades || state.upgrades;
        state.tutorialDone = loaded.tutorialDone ?? false;
        state.audio = { musicOn:true, sfxOn:true };
      }else{
        Object.assign(state, loaded);
      }

      // rehydrate market RNG
      state.marketRand = seededRand((state.marketSeed||0) ^ 0xA5A5A5A5);
      // ensure required keys exist
      state.seeds = Object.assign({ potato:0, carrot:0, corn:0, pumpkin:0 }, state.seeds||{});
      state.crops = Object.assign({ potato:0, carrot:0, corn:0, pumpkin:0 }, state.crops||{});
      state.buildings = Object.assign({ barn:0, silo:0, windmill:0, farmhouse:0 }, state.buildings||{});
      state.achievements = state.achievements || {};
      state.selectedCrop = state.selectedCrop || "potato";
      state.selectedSell = state.selectedSell || "potato";
      state.questProgress.harvestTypes = state.questProgress.harvestTypes || {};
    }else{
      // new
      state.coins = START_COINS;
      state.seeds = { ...START_SEEDS };
      state.crops = { potato:0, carrot:0, corn:0, pumpkin:0 };
      state.selectedCrop = "potato";
      state.selectedSell = "potato";
      state.upgrades = { shovel:0, sprinkler:0, cart:0, coop:0, plot:0 };
      state.buildings = { barn:0, silo:0, windmill:0, farmhouse:0 };
      state.achievements = {};
      state.tutorialDone = false;
      state.audio = { musicOn:true, sfxOn:true };

      state.dayKey = todayKey();
      state.dayNum = 1;
      state.seasonId = calcSeasonFromDay(state.dayNum);

      const seed = randSeedFromKey(state.dayKey);
      state.marketSeed = seed;
      state.marketRand = seededRand(seed ^ 0xA5A5A5A5);

      const s = seasonById(state.seasonId);
      const wr = seededRand(seed ^ 0xC0FFEE);
      state.weather = weightedPick(s.weatherWeights, wr);

      state.marketPriceByCrop = {};
      for(const c of CROPS) state.marketPriceByCrop[c.id] = marketPriceForCrop(c.id);

      state.questProgress = { planted:0, harvested:0, sold:0, plantedToday:0, harvestTypes:{} };
      state.quests = makeDailyQuests(seed);

      state.plots = Array.from({length: START_PLOTS}, ()=> ({ s:0, t:0, crop:"potato" }));
      applyWeatherVisuals();
      saveNow();
    }

    ensureDaySystems();
    applyWeatherVisuals();
    render();

    // tutorial on first run
    if(!state.tutorialDone) tutorial.open();
  }

  // --------- Tick loops ----------
  let last = performance.now();
  function frame(now){
    const dt = now - last;
    last = now;
    animalsTick(dt);
    requestAnimationFrame(frame);
  }

  setInterval(()=>{ ensureDaySystems(); render(); saveSoon(); }, 2500);

  // mild auto-harvest: sprinkler upgrade acts as worker (kept from v1 idea)
  setInterval(()=>{ autoTick(); }, 1500);
  function autoTick(){
    const auto = Math.floor((state.upgrades.sprinkler||0) / 3);
    if(auto <= 0) return;
    let harvested = 0;
    for(const p of state.plots){
      if(harvested >= auto) break;
      if(p.s === 2){
        const y = harvestYield();
        const cropId = p.crop || "potato";
        state.crops[cropId] = (state.crops[cropId]||0) + y;
        p.s = 0; p.t = 0;
        harvested++;
      }
    }
    if(harvested>0){
      state.questProgress.harvested += harvested;
      Audio8.sfx.harvest();
      checkAchievements();
      saveSoon();
      render();
    }
  }

  // --------- Boot ----------
  UI.initTabs();
  bind();
  init(false);
  requestAnimationFrame(frame);

})();
