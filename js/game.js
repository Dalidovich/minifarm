(function () {
  const C = MF.config;
  const KEY = 'minifarm.save.v1';
  const MAX_LEVEL = C.levelXp.length + 1;
  const FINAL_TUTORIAL_STEP = 6;

  const cropById = {};
  C.crops.forEach(function (c) { cropById[c.id] = c; });
  const upById = {};
  C.upgrades.forEach(function (u) { upById[u.id] = u; });

  const G = (MF.game = { state: null, chickens: [], cat: null, cropById: cropById, upById: upById, maxLevel: MAX_LEVEL });

  let saveTimer = 0;
  let warnAt = 0;
  let ripeSoundAt = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function defaultSettings() {
    return { sound: true, music: true, lang: null };
  }

  function freshState() {
    const plots = [];
    for (let i = 0; i < C.field.cols * C.field.rows; i++) plots.push({ kind: 'grass', crop: null, growth: 0, wet: 0 });
    const up = {};
    C.upgrades.forEach(function (u) { up[u.id] = 0; });
    return {
      version: 1,
      coins: C.startCoins,
      xp: 0,
      level: 1,
      time: 0,
      water: C.canCapacity[0],
      selected: C.crops[0].id,
      plots: plots,
      up: up,
      eggs: [],
      trees: [],
      orders: [{ wait: 45 }, { wait: 150 }, { wait: 300 }],
      rain: 0,
      rainIn: 420,
      tut: 0,
      tutTimer: 0,
      completed: false,
      savedAt: 0,
      settings: defaultSettings()
    };
  }

  function fieldSize() { return C.field.tiers[G.state.up.field]; }
  function wetDuration() { return C.wetDuration[G.state.up.can]; }
  function canCapacity() { return C.canCapacity[G.state.up.can]; }
  function growSpeed() { return 1 + C.fertBonus * G.state.up.fert; }
  function priceOf(item) { return Math.round(item.sell * C.houseBonus[G.state.up.house]); }
  function itemInfo(id) { return cropById[id] || C.products[id]; }

  function isUnlocked(col, row) {
    const size = fieldSize();
    return col >= 0 && row >= 0 && col < size[0] && row < size[1];
  }

  function plotPos(i) {
    return { x: C.field.x + (i % C.field.cols) * C.tile, y: C.field.y + Math.floor(i / C.field.cols) * C.tile };
  }

  function seedCost(crop) {
    return crop.id === C.crops[0].id && G.state.coins < crop.cost ? 0 : crop.cost;
  }

  function plotAction(plot) {
    if (plot.kind === 'grass') return 'till';
    if (plot.kind === 'soil') return 'plant';
    if (plot.growth >= cropById[plot.crop].time) return 'harvest';
    if (!G.state.up.sprinkler && plot.wet < wetDuration() * 0.5) return 'water';
    return null;
  }

  function warn(key, x, y) {
    const now = performance.now();
    if (now - warnAt < 900) return;
    warnAt = now;
    MF.ui.float(x, y, MF.t(key), 'warn');
    MF.audio.play('error');
  }

  function earn(amount, x, y) {
    G.state.coins += amount;
    MF.ui.float(x, y, '+' + amount, 'coin');
  }

  function addXp(amount) {
    const s = G.state;
    if (s.level >= MAX_LEVEL) return;
    s.xp += amount;
    while (s.level < MAX_LEVEL && s.xp >= C.levelXp[s.level - 1]) {
      s.xp -= C.levelXp[s.level - 1];
      s.level++;
      announceLevel();
    }
    if (s.level >= MAX_LEVEL) s.xp = 0;
  }

  function announceLevel() {
    const s = G.state;
    const lines = [MF.t('toast.level', { n: s.level })];
    C.crops.forEach(function (c) {
      if (c.level === s.level) lines.push(MF.t('toast.newCrop', { name: MF.t('crop.' + c.id) }));
    });
    const newGoods = C.upgrades.some(function (u) {
      return u.levels.some(function (l, i) { return l.level === s.level && s.up[u.id] <= i; });
    });
    if (newGoods) lines.push(MF.t('toast.newShop'));
    MF.ui.toast(lines.join('<br>'), 'star');
    MF.audio.play('level');
  }

  function makeOrder() {
    const s = G.state;
    const taken = s.orders.map(function (o) { return o.item; });
    let pool = C.crops.filter(function (c) { return c.level <= s.level; }).slice(-4).map(function (c) { return c.id; });
    if (s.up.coop > 0) pool.push('egg');
    if (s.up.trees > 0) pool.push('apple');
    const free = pool.filter(function (id) { return taken.indexOf(id) < 0; });
    if (free.length) pool = free;
    const item = pick(pool);
    const info = itemInfo(item);
    const size = fieldSize();
    let need;
    if (item === 'egg') need = randInt(3, 3 + s.up.coop * 2);
    else if (item === 'apple') need = randInt(3, 2 + s.up.trees * 3);
    else need = Math.max(3, Math.round(size[0] * size[1] * rand(0.5, 1.3)));
    return {
      item: item,
      need: need,
      have: 0,
      coins: Math.round(need * info.sell * 0.6),
      xp: Math.max(1, Math.round(need * info.xp * 0.6))
    };
  }

  function progressOrders(item, count) {
    const s = G.state;
    s.orders.forEach(function (o, i) {
      if (o.item !== item) return;
      o.have += count;
      if (o.have >= o.need) {
        s.coins += o.coins;
        addXp(o.xp);
        MF.ui.toast(MF.t('toast.order') + ' +' + o.coins, 'coin');
        MF.audio.play('order');
        s.orders[i] = { wait: C.orderDelay };
      }
    });
  }

  function areaTargets(index, action) {
    const s = G.state;
    const col = index % C.field.cols;
    const row = Math.floor(index / C.field.cols);
    const out = [];
    C.toolShapes[s.up.tool].forEach(function (d) {
      const c = col + d[0];
      const r = row + d[1];
      if (!isUnlocked(c, r)) return;
      const j = r * C.field.cols + c;
      if (plotAction(s.plots[j]) === action) out.push(j);
    });
    return out;
  }

  function inRect(x, y, r) {
    return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  }

  G.probe = function (x, y) {
    const s = G.state;
    for (let i = s.eggs.length - 1; i >= 0; i--) {
      const e = s.eggs[i];
      if (Math.abs(x - e.x) <= 5 && Math.abs(y - (e.y - 3)) <= 6) return { type: 'egg', index: i };
    }
    for (let i = 0; i < s.trees.length; i++) {
      const spot = C.treeSpots[i];
      if (x >= spot[0] - 14 && x < spot[0] + 14 && y >= spot[1] - 40 && y < spot[1]) return { type: 'tree', index: i };
    }
    if (inRect(x, y, C.well)) return { type: 'well' };
    const col = Math.floor((x - C.field.x) / C.tile);
    const row = Math.floor((y - C.field.y) / C.tile);
    if (isUnlocked(col, row)) {
      const index = row * C.field.cols + col;
      const action = plotAction(s.plots[index]);
      return { type: 'plot', index: index, action: action, targets: action ? areaTargets(index, action) : [index] };
    }
    if (inRect(x, y, C.house)) return { type: 'house' };
    return null;
  };

  function applyPlots(p, stroke) {
    const s = G.state;
    const center = plotPos(p.index);
    const cx = center.x + 8;
    const cy = center.y;
    let done = 0;
    let gained = 0;
    let spent = 0;
    let failed = null;
    for (let n = 0; n < p.targets.length; n++) {
      const i = p.targets[n];
      if (stroke.has(i)) continue;
      const plot = s.plots[i];
      const pos = plotPos(i);
      if (p.action === 'till') {
        plot.kind = 'soil';
        MF.render.burst(pos.x + 8, pos.y + 10, ['#9a6b3f', '#b98654', '#7dbd57'], 6);
      } else if (p.action === 'plant') {
        const crop = cropById[s.selected];
        const cost = seedCost(crop);
        if (s.coins < cost) { failed = 'msg.noCoins'; break; }
        s.coins -= cost;
        spent += cost;
        plot.kind = 'crop';
        plot.crop = crop.id;
        plot.growth = 0;
        MF.render.burst(pos.x + 8, pos.y + 10, ['#f2e2b0', '#9a6b3f'], 3);
      } else if (p.action === 'water') {
        if (s.water <= 0) { failed = 'msg.noWater'; break; }
        s.water--;
        plot.wet = wetDuration();
        MF.render.burst(pos.x + 8, pos.y + 6, ['#8fd3f4', '#5bb4e5', '#c9ecfb'], 7);
      } else if (p.action === 'harvest') {
        const crop = cropById[plot.crop];
        gained += priceOf(crop);
        addXp(crop.xp);
        plot.kind = 'soil';
        plot.crop = null;
        plot.growth = 0;
        progressOrders(crop.id, 1);
        MF.render.burst(pos.x + 8, pos.y + 6, ['#fff7e6', '#f7d04a', '#a4de6a'], 7);
      }
      stroke.add(i);
      done++;
    }
    if (done) {
      MF.audio.play(p.action);
      if (gained) {
        earn(gained, cx, cy);
        MF.audio.play('coin');
      }
      if (spent) MF.ui.float(cx, cy, '-' + spent, 'spend');
      advanceTutorial(p.action);
    }
    if (failed) warn(failed, cx, cy);
  }

  function advanceTutorial(action) {
    const s = G.state;
    const order = ['till', 'plant', 'water', 'harvest'];
    if (s.tut < order.length && order[s.tut] === action) s.tut++;
  }

  function refill() {
    const s = G.state;
    const x = C.well.x + 12;
    const y = C.well.y;
    if (s.water >= canCapacity()) {
      MF.ui.float(x, y, MF.t('msg.full'), 'info');
      return;
    }
    s.water = canCapacity();
    MF.render.burst(x, y + 18, ['#8fd3f4', '#5bb4e5', '#c9ecfb'], 12);
    MF.audio.play('refill');
  }

  function collectEgg(index) {
    const s = G.state;
    const egg = s.eggs.splice(index, 1)[0];
    earn(priceOf(C.products.egg), egg.x, egg.y - 8);
    addXp(C.products.egg.xp);
    progressOrders('egg', 1);
    MF.render.burst(egg.x, egg.y - 3, ['#fff7e6', '#f7d04a'], 5);
    MF.audio.play('egg');
  }

  function pickApples(index) {
    const s = G.state;
    const tree = s.trees[index];
    const spot = C.treeSpots[index];
    if (!tree.apples) return;
    const count = tree.apples;
    tree.apples = 0;
    earn(priceOf(C.products.apple) * count, spot[0], spot[1] - 40);
    addXp(C.products.apple.xp * count);
    progressOrders('apple', count);
    MF.render.burst(spot[0], spot[1] - 24, ['#d9483b', '#a4de6a', '#fff7e6'], 10);
    MF.audio.play('harvest');
    MF.audio.play('coin');
  }

  G.act = function (p, stroke, dragging) {
    if (!p) return;
    if (p.type === 'egg') return collectEgg(p.index);
    if (p.type === 'plot') {
      if (p.action) applyPlots(p, stroke);
      return;
    }
    if (dragging) return;
    if (p.type === 'well') refill();
    else if (p.type === 'tree') pickApples(p.index);
  };

  G.nextLevelOf = function (id) {
    return upById[id].levels[G.state.up[id]] || null;
  };

  G.canBuy = function (id) {
    const next = G.nextLevelOf(id);
    return !!next && G.state.level >= next.level && G.state.coins >= next.cost;
  };

  G.canBuyAny = function () {
    return C.upgrades.some(function (u) { return G.canBuy(u.id); });
  };

  G.buy = function (id) {
    const s = G.state;
    if (!G.canBuy(id)) {
      MF.audio.play('error');
      return false;
    }
    s.coins -= G.nextLevelOf(id).cost;
    s.up[id]++;
    if (id === 'can') s.water = canCapacity();
    if (id === 'trees') s.trees.push({ apples: 0, t: C.appleInterval });
    if (s.tut < FINAL_TUTORIAL_STEP) s.tut = FINAL_TUTORIAL_STEP;
    syncAnimals();
    MF.render.rebuild();
    MF.audio.play('buy');
    const allDone = C.upgrades.every(function (u) { return s.up[u.id] >= u.levels.length; });
    if (allDone && !s.completed) {
      s.completed = true;
      MF.ui.toast(MF.t('toast.done'), 'star');
      MF.audio.play('level');
    }
    G.save();
    return true;
  };

  G.selectCrop = function (id) {
    const crop = cropById[id];
    if (!crop || crop.level > G.state.level) return;
    G.state.selected = id;
    MF.audio.play('click');
  };

  G.skipOrder = function (index) {
    if (G.state.orders[index].item) G.state.orders[index] = { wait: C.orderSkipDelay };
  };

  G.shopOpened = function () {
    if (G.state.tut === 5) G.state.tut = FINAL_TUTORIAL_STEP;
  };

  G.hintKey = function () {
    const s = G.state;
    if (s.tut === 0) return 'hint.dig';
    if (s.tut === 1) return 'hint.plant';
    if (s.tut === 2) return 'hint.water';
    if (s.tut === 3) {
      const ripe = s.plots.some(function (p) { return p.kind === 'crop' && p.growth >= cropById[p.crop].time; });
      return ripe ? 'hint.harvest' : 'hint.wait';
    }
    if (s.water <= 0 && !s.up.sprinkler) return 'hint.well';
    if (s.tut === 4) return 'hint.drag';
    if (s.tut === 5 && s.coins >= upById.field.levels[0].cost) return 'hint.shop';
    return null;
  };

  function penPoint() {
    return { x: rand(C.pen.x + 8, C.pen.x + C.pen.w - 10), y: rand(C.pen.y + 24, C.pen.y + C.pen.h - 6) };
  }

  function catPoint() {
    return { x: rand(C.catZone.x, C.catZone.x + C.catZone.w), y: rand(C.catZone.y, C.catZone.y + C.catZone.h) };
  }

  function walker(point, extra) {
    return Object.assign({ x: point.x, y: point.y, tx: point.x, ty: point.y, pause: rand(0, 2), left: false, step: 0, moving: false }, extra);
  }

  function syncAnimals() {
    const s = G.state;
    const wanted = s.up.coop > 0 ? s.up.coop + 1 : 0;
    while (G.chickens.length < wanted) {
      G.chickens.push(walker(penPoint(), { eggT: rand(C.eggInterval * 0.4, C.eggInterval), look: G.chickens.length % 2 }));
    }
    G.chickens.length = wanted;
    if (s.up.cat && !G.cat) G.cat = walker(catPoint(), {});
    if (!s.up.cat) G.cat = null;
  }

  function moveWalker(a, dt, speed, nextPoint, pauseMin, pauseMax) {
    if (a.pause > 0) {
      a.pause -= dt;
      a.moving = false;
      if (a.pause <= 0) {
        const p = nextPoint();
        a.tx = p.x;
        a.ty = p.y;
      }
      return;
    }
    const dx = a.tx - a.x;
    const dy = a.ty - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) {
      a.pause = rand(pauseMin, pauseMax);
      return;
    }
    a.moving = true;
    a.left = dx < 0;
    a.x += (dx / dist) * speed * dt;
    a.y += (dy / dist) * speed * dt;
    a.step += dt * 8;
  }

  function updateWeather(dt) {
    const s = G.state;
    if (s.rain > 0) {
      s.rain = Math.max(0, s.rain - dt);
      return;
    }
    s.rainIn -= dt;
    if (s.rainIn <= 0) {
      s.rain = rand(35, 60);
      s.rainIn = rand(300, 700);
      MF.ui.toast(MF.t('toast.rain'), 'drop');
    }
  }

  function updatePlots(dt, quiet) {
    const s = G.state;
    const size = fieldSize();
    const duration = wetDuration();
    const speed = growSpeed();
    const soaked = s.up.sprinkler || s.rain > 0;
    for (let row = 0; row < size[1]; row++) {
      for (let col = 0; col < size[0]; col++) {
        const i = row * C.field.cols + col;
        const plot = s.plots[i];
        if (soaked && plot.kind !== 'grass') plot.wet = duration;
        if (plot.kind === 'crop') {
          const time = cropById[plot.crop].time;
          if (plot.growth < time) {
            plot.growth += (soaked ? dt : Math.min(dt, plot.wet)) * speed;
            if (plot.growth >= time) {
              plot.growth = time;
              if (!quiet) ripened(i);
            }
          }
        }
        if (!soaked) plot.wet = Math.max(0, plot.wet - dt);
      }
    }
  }

  function ripened(i) {
    const pos = plotPos(i);
    MF.render.burst(pos.x + 8, pos.y + 2, ['#fff7e6', '#f7d04a'], 5);
    const now = performance.now();
    if (now - ripeSoundAt > 400) {
      ripeSoundAt = now;
      MF.audio.play('ripe');
    }
  }

  function updateAnimals(dt, quiet) {
    const s = G.state;
    const step = Math.min(dt, 0.1);
    G.chickens.forEach(function (ch) {
      ch.eggT -= dt;
      while (ch.eggT <= 0) {
        ch.eggT += C.eggInterval * rand(0.85, 1.15);
        if (s.eggs.length < G.chickens.length * 2) {
          const spot = quiet ? penPoint() : ch;
          s.eggs.push({ x: Math.round(spot.x), y: Math.round(spot.y) });
        }
      }
      moveWalker(ch, step, 12, penPoint, 0.8, 4);
    });
    if (G.cat) moveWalker(G.cat, step, 16, catPoint, 3, 10);
    s.trees.forEach(function (tree) {
      tree.t -= dt;
      while (tree.t <= 0) {
        tree.t += C.appleInterval;
        if (tree.apples < C.maxApples) tree.apples++;
      }
    });
  }

  function updateOrders(dt) {
    const s = G.state;
    s.orders.forEach(function (o, i) {
      if (o.item) return;
      o.wait -= dt;
      if (o.wait <= 0) s.orders[i] = makeOrder();
    });
  }

  G.update = function (dt) {
    const s = G.state;
    const quiet = dt > 5;
    s.time += dt;
    if (!quiet) updateWeather(dt);
    updatePlots(dt, quiet);
    updateAnimals(dt, quiet);
    updateOrders(dt);
    if (s.tut === 4) {
      s.tutTimer += dt;
      if (s.tutTimer > 25) s.tut = 5;
    }
    saveTimer += dt;
    if (saveTimer > 5) {
      saveTimer = 0;
      G.save();
    }
  };

  G.save = function () {
    G.state.savedAt = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(G.state));
    } catch (e) {
      return false;
    }
    return true;
  };

  G.load = function () {
    let s = freshState();
    let away = 0;
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      if (data && data.version === 1) {
        const base = freshState();
        s = Object.assign(base, data);
        s.up = Object.assign(freshState().up, data.up);
        s.settings = Object.assign(defaultSettings(), data.settings);
        away = Math.min(C.offlineCap, Math.max(0, (Date.now() - data.savedAt) / 1000));
      }
    } catch (e) {
      s = freshState();
    }
    G.state = s;
    G.chickens = [];
    G.cat = null;
    syncAnimals();
    return away;
  };

  G.reset = function () {
    const settings = G.state.settings;
    G.state = freshState();
    G.state.settings = settings;
    G.chickens = [];
    G.cat = null;
    G.save();
  };

  G.fieldSize = fieldSize;
  G.plotPos = plotPos;
  G.canCapacity = canCapacity;
  G.wetDuration = wetDuration;
  G.priceOf = priceOf;
  G.seedCost = seedCost;
  G.itemInfo = itemInfo;
})();
