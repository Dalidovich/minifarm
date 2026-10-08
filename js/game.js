(function () {
  const C = MF.config;
  const KEY = 'minifarm.save.v1';
  const MAX_LEVEL = C.levelXp.length + 1;
  const FINAL_TUTORIAL_STEP = 6;

  const cropById = {};
  C.crops.forEach(function (c) { cropById[c.id] = c; });
  const upById = {};
  C.upgrades.forEach(function (u) { upById[u.id] = u; });

  const G = (MF.game = {
    state: null, chickens: [], ducks: [], ducklings: [], wish: null, cat: null, bees: [], fireflies: [], hatFlight: 0, farmer: null, workers: [], queue: [],
    cropById: cropById, upById: upById, maxLevel: MAX_LEVEL
  });

  let saveTimer = 0;
  let fireflyIn = 0;
  let petWait = 0;
  let warnAt = 0;
  let fullAt = 0;
  let ripeSoundAt = 0;
  let navCols = 0;
  let navRows = 0;
  let blocked = null;

  const CELL = C.walk.cell;
  const QUEUE_LIMIT = 80;
  const TOOL_BY_ACTION = { till: 'hoe', plant: 'seed', water: 'can', harvest: 'grab', uproot: 'shovel' };
  const SHOVEL = 'shovel';
  const POLICY_LEVEL = 3;
  const PRODUCT_SOURCE = { egg: 'coop', apple: 'trees' };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function defaultSettings() {
    return { sound: true, music: true, lang: null };
  }

  function freshStats() {
    return {
      earned: 0, spent: 0, played: 0, items: {}, tilled: 0, planted: 0, watered: 0, uprooted: 0, golden: 0, pollinated: 0,
      orders: 0, fireflies: 0, gifts: 0, pets: 0, hats: 0
    };
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
      stock: {},
      hands: [],
      policy: {},
      rain: 0,
      rainIn: 420,
      daily: null,
      hat: null,
      gift: null,
      catGiftIn: C.catGift.every[0],
      relics: [],
      pond: { throws: 0, dry: 0, find: null },
      stats: freshStats(),
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
  function hasRelic(id) { return G.state.relics.indexOf(id) >= 0; }
  function setRelics(id) { return C.relics.filter(function (r) { return r.set === id; }); }
  function setDone(id) { return setRelics(id).every(function (r) { return hasRelic(r.id); }); }
  function perk(kind, crop) {
    let total = 0;
    C.relics.forEach(function (r) {
      if (r.bonus === kind && (!r.crop || r.crop === crop) && hasRelic(r.id)) total += r.value;
    });
    C.relicSets.forEach(function (set) {
      if (set.bonus === kind && setDone(set.id)) total += set.value;
    });
    return total;
  }
  function growSpeed(crop) { return (1 + C.fertBonus * G.state.up.fert) * (1 + perk('grow', crop)); }
  function dayIndex() { return Math.floor(G.state.time / C.dayLength); }
  function isNight() {
    const phase = (G.state.time % C.dayLength) / C.dayLength;
    return phase >= C.night[0] && phase < C.night[1];
  }
  function nightBoost(quiet) {
    if (!G.state.up.lanterns) return 1;
    if (quiet) return 1 + (C.nightGrow - 1) * (C.night[1] - C.night[0]);
    return isNight() ? C.nightGrow : 1;
  }
  function growDuration(amount, crop) {
    const base = growSpeed(crop);
    if (!G.state.up.lanterns) return amount / base;
    let time = G.state.time;
    let left = amount;
    while (left > 0.001) {
      const phase = (time % C.dayLength) / C.dayLength;
      const night = phase >= C.night[0] && phase < C.night[1];
      const edge = night ? C.night[1] : phase < C.night[0] ? C.night[0] : 1 + C.night[0];
      const speed = base * (night ? C.nightGrow : 1);
      const step = Math.min((edge - phase) * C.dayLength + 0.001, left / speed);
      time += step;
      left -= step * speed;
    }
    return time - G.state.time;
  }
  function isDaily(id) { return !!G.state.daily && G.state.daily.crop === id; }
  function isNextDaily(id) { return !!G.state.up.insider && !!G.state.daily && G.state.daily.next === id; }
  function dailyBonus() { return C.dailyBonus[G.state.up.sign] + perk('daily'); }
  function offlineCap() { return C.offlineCap[G.state.up.hammock] * (1 + perk('offline')); }
  function priceOf(item) {
    return Math.round(item.sell * C.houseBonus[G.state.up.house] * (1 + perk('price')) * (isDaily(item.id) ? dailyBonus() : 1));
  }
  function itemInfo(id) { return cropById[id] || C.products[id]; }
  function barnCapacity() { return C.barnCapacity[G.state.up.barn]; }
  function stockOf(id) { return G.state.stock[id] || 0; }
  function stockTotal() {
    const stock = G.state.stock;
    return Object.keys(stock).reduce(function (sum, id) { return sum + stock[id]; }, 0);
  }
  function stockValue() {
    const stock = G.state.stock;
    return Object.keys(stock).reduce(function (sum, id) { return sum + stock[id] * priceOf(itemInfo(id)); }, 0);
  }
  function orderLeft(o) { return o.need - o.have; }
  function orderReady(o) { return !!o.item && !!G.state.up.barn && stockOf(o.item) >= orderLeft(o); }
  function orderHave(o) { return G.state.up.barn ? Math.min(o.need, o.have + stockOf(o.item)) : o.have; }
  function staffCount() {
    const s = G.state;
    return s.hands.length + C.workers.filter(function (cfg) { return !cfg.stroll && s.up[cfg.id]; }).length;
  }

  function isUnlocked(col, row) {
    const size = fieldSize();
    return col >= 0 && row >= 0 && col < size[0] && row < size[1];
  }

  function plotPos(i) {
    return { x: C.field.x + (i % C.field.cols) * C.tile, y: C.field.y + Math.floor(i / C.field.cols) * C.tile };
  }

  function shapeFits(shape) {
    const size = fieldSize();
    return C.handShapes[shape][0] <= size[0] && C.handShapes[shape][1] <= size[1];
  }

  function zoneCells(zone) {
    const shape = C.handShapes[zone.shape];
    const cells = [];
    for (let r = 0; r < shape[1]; r++) {
      for (let c = 0; c < shape[0]; c++) cells.push((zone.row + r) * C.field.cols + zone.col + c);
    }
    return cells;
  }

  function zoneAt(x, y, shape) {
    const size = fieldSize();
    const dims = C.handShapes[shape];
    const col = Math.floor((x - C.field.x) / C.tile);
    const row = Math.floor((y - C.field.y) / C.tile);
    if (!isUnlocked(col, row) || !shapeFits(shape)) return null;
    return {
      col: Math.max(0, Math.min(size[0] - dims[0], col - Math.floor((dims[0] - 1) / 2))),
      row: Math.max(0, Math.min(size[1] - dims[1], row - Math.floor((dims[1] - 1) / 2))),
      shape: shape
    };
  }

  function zoneFree(zone, index) {
    const cells = zoneCells(zone);
    return G.state.hands.every(function (hand, i) {
      return i === index || !hand.zone || !zoneCells(hand.zone).some(function (cell) { return cells.indexOf(cell) >= 0; });
    });
  }

  function seedCost(crop) {
    const cost = Math.max(1, Math.round(crop.cost * C.seedDiscount[G.state.up.seeds] * (1 - perk('seeds'))));
    return crop.id === C.crops[0].id && G.state.coins < cost ? 0 : cost;
  }

  function plotAction(plot) {
    if (plot.kind === 'grass') return 'till';
    if (plot.kind === 'soil') return 'plant';
    if (plot.growth >= cropById[plot.crop].time) return 'harvest';
    if (!G.state.up.sprinkler && plot.wet < wetDuration() * 0.5) return 'water';
    return null;
  }

  function isDigging() { return G.state.selected === SHOVEL; }

  function playerAction(plot, dig) {
    if (!dig) return plotAction(plot);
    if (plot.kind === 'soil') return null;
    if (plot.kind === 'crop' && plot.growth < cropById[plot.crop].time) return 'uproot';
    return plotAction(plot);
  }

  function warn(key, x, y) {
    const now = performance.now();
    if (now - warnAt < 900) return;
    warnAt = now;
    MF.ui.float(x, y, MF.t(key), 'warn');
    MF.audio.play('error');
  }

  function gain(amount) {
    G.state.coins += amount;
    G.state.stats.earned += amount;
  }

  function spend(amount) {
    G.state.coins -= amount;
    G.state.stats.spent += amount;
  }

  function countItem(id, count) {
    const items = G.state.stats.items;
    items[id] = (items[id] || 0) + count;
  }

  function earn(amount, x, y) {
    gain(amount);
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
    if (s.up.barn) need = Math.min(need, barnCapacity());
    return {
      item: item,
      need: need,
      have: 0,
      coins: Math.round(need * info.sell * 0.6 * C.orderBonus[s.up.market] * (1 + perk('orders'))),
      xp: Math.max(1, Math.round(need * info.xp * 0.6))
    };
  }

  function progressOrders(item, count) {
    const s = G.state;
    s.orders.forEach(function (o, i) {
      if (o.item !== item) return;
      o.have += count;
      if (o.have >= o.need) completeOrder(i, 0);
    });
  }

  function completeOrder(index, goods) {
    const s = G.state;
    const o = s.orders[index];
    gain(o.coins + goods);
    s.stats.orders++;
    addXp(o.xp);
    MF.ui.toast(MF.t('toast.order') + ' +' + o.coins + (goods ? ' · ' + MF.t('toast.orderGoods', { n: goods }) : ''), 'coin');
    MF.audio.play('order');
    s.orders[index] = { wait: C.orderDelay };
  }

  function fitOrders() {
    const cap = barnCapacity();
    G.state.orders.forEach(function (o) {
      if (!o.item || orderLeft(o) <= cap) return;
      const need = o.have + cap;
      o.coins = Math.round((o.coins * need) / o.need);
      o.xp = Math.max(1, Math.round((o.xp * need) / o.need));
      o.need = need;
    });
  }

  function barnFull() {
    const now = performance.now();
    if (now - fullAt < 4000) return;
    fullAt = now;
    MF.ui.float(C.barn.x + C.barn.w / 2, C.barn.y + 8, MF.t('msg.barnFull'), 'warn');
  }

  function bank(id, count) {
    const s = G.state;
    const price = priceOf(itemInfo(id));
    if (!s.up.barn) {
      progressOrders(id, count);
      return count * price;
    }
    const kept = Math.min(count, barnCapacity() - stockTotal());
    if (kept > 0) s.stock[id] = stockOf(id) + kept;
    const spilled = count - kept;
    if (spilled > 0) {
      barnFull();
      progressOrders(id, spilled);
    }
    return spilled * price;
  }

  function showHaul(kept, coins, x, y) {
    if (coins) earn(coins, x, y);
    if (kept) MF.ui.float(x, y - (coins ? 9 : 0), MF.t('msg.stored', { n: kept }), 'info');
  }

  function haul(id, count, x, y) {
    const before = stockTotal();
    const coins = bank(id, count);
    showHaul(stockTotal() - before, coins, x, y);
    return coins;
  }

  function takeStock(id, count) {
    const stock = G.state.stock;
    stock[id] -= count;
    if (stock[id] <= 0) delete stock[id];
  }

  function sellStock(id, count) {
    const sold = Math.min(stockOf(id), count);
    if (!sold) return 0;
    takeStock(id, sold);
    gain(sold * priceOf(itemInfo(id)));
    return sold;
  }

  function deliverOrder(index) {
    const o = G.state.orders[index];
    const count = orderLeft(o);
    takeStock(o.item, count);
    completeOrder(index, count * priceOf(itemInfo(o.item)));
  }

  function hasPolicy() { return G.state.up.manager >= POLICY_LEVEL; }
  function productOpen(id) { return G.state.up[PRODUCT_SOURCE[id]] > 0; }
  function policyGoods() { return Object.keys(C.products).filter(productOpen); }
  function sellsProduct(id) { return hasPolicy() && productOpen(id) && !!G.state.policy[id]; }

  function manageItem(id, toastKey) {
    const s = G.state;
    s.orders.forEach(function (o, i) {
      if (s.up.manager > 1 && o.item === id && orderReady(o)) deliverOrder(i);
    });
    if (s.orders.some(function (o) { return o.item === id; })) return;
    const price = priceOf(itemInfo(id));
    const sold = sellStock(id, Infinity);
    if (!sold) return;
    MF.ui.toast(MF.t(toastKey, { name: MF.t('crop.' + id), n: sold }) + ' +' + sold * price, 'coin');
    MF.audio.play('coin');
  }

  function runManager() {
    const s = G.state;
    if (!s.up.manager) return;
    s.daily.managed = true;
    manageItem(s.daily.crop, 'toast.manager');
    Object.keys(C.products).filter(sellsProduct).forEach(function (id) { manageItem(id, 'toast.managerGoods'); });
  }

  function areaTargets(index, action, dig) {
    const s = G.state;
    const col = index % C.field.cols;
    const row = Math.floor(index / C.field.cols);
    const out = [];
    C.toolShapes[s.up.tool].forEach(function (d) {
      const c = col + d[0];
      const r = row + d[1];
      if (!isUnlocked(c, r)) return;
      const j = r * C.field.cols + c;
      if (playerAction(s.plots[j], dig) === action) out.push(j);
    });
    return out;
  }

  function inRect(x, y, r) {
    return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  }

  function inPond(x, y) {
    const dx = (x - C.pond.x) / C.pond.rx;
    const dy = (y - C.pond.y) / C.pond.ry;
    return dx * dx + dy * dy <= 1;
  }

  G.probe = function (x, y) {
    const s = G.state;
    for (let i = G.fireflies.length - 1; i >= 0; i--) {
      const fly = G.fireflies[i];
      if (Math.abs(x - fly.x) <= 5 && Math.abs(y - fly.y) <= 5) return { type: 'firefly', index: i };
    }
    for (let i = s.eggs.length - 1; i >= 0; i--) {
      const e = s.eggs[i];
      if (Math.abs(x - e.x) <= 5 && Math.abs(y - (e.y - 3)) <= 6) return { type: 'egg', index: i };
    }
    if (s.gift && Math.abs(x - C.catGift.spot.x) <= 7 && Math.abs(y - (C.catGift.spot.y - 5)) <= 7) return { type: 'gift' };
    if (s.hat && Math.abs(x - s.hat.x) <= 7 && Math.abs(y - (s.hat.y - 3)) <= 5) return { type: 'hat' };
    if (G.cat && Math.abs(x - G.cat.x) <= 7 && Math.abs(y - (G.cat.y - 4)) <= 6) return { type: 'cat' };
    for (let i = 0; i < G.workers.length; i++) {
      const w = G.workers[i];
      const hit = Math.abs(x - w.x) <= 5 && y >= w.y - 18 && y <= w.y;
      if (hit && w.hand) return { type: 'hand', index: s.hands.indexOf(w.hand) };
      if (hit && w.id === 'manager' && hasPolicy()) return { type: 'manager' };
    }
    for (let i = 0; i < s.trees.length; i++) {
      const spot = C.treeSpots[i];
      if (x >= spot[0] - 14 && x < spot[0] + 14 && y >= spot[1] - 40 && y < spot[1]) return { type: 'tree', index: i };
    }
    if (inRect(x, y, C.well)) return { type: 'well' };
    if (s.up.barn && inRect(x, y, C.barn)) return { type: 'barn' };
    if (s.up.ducks && inPond(x, y)) return { type: 'pond' };
    for (let i = 0; i < C.relics.length; i++) {
      const relic = C.relics[i];
      if (hasRelic(relic.id) && Math.abs(x - relic.spot[0]) <= 7 && y > relic.spot[1] - 15 && y <= relic.spot[1]) {
        return { type: 'relic', id: relic.id };
      }
    }
    const col = Math.floor((x - C.field.x) / C.tile);
    const row = Math.floor((y - C.field.y) / C.tile);
    if (isUnlocked(col, row)) {
      const index = row * C.field.cols + col;
      const dig = isDigging();
      const action = playerAction(s.plots[index], dig);
      return { type: 'plot', index: index, action: action, dig: dig, targets: action ? areaTargets(index, action, dig) : [index] };
    }
    if (inRect(x, y, C.house)) return { type: 'house' };
    return null;
  };

  function applyPlots(p, stroke, hand) {
    const s = G.state;
    const center = plotPos(p.index);
    const cx = center.x + 8;
    const cy = center.y;
    const before = stockTotal();
    let done = 0;
    let gained = 0;
    let spent = 0;
    let failed = null;
    let lucky = false;
    for (let n = 0; n < p.targets.length; n++) {
      const i = p.targets[n];
      if (stroke.has(i)) continue;
      const plot = s.plots[i];
      const pos = plotPos(i);
      if (p.action === 'till') {
        plot.kind = 'soil';
        s.stats.tilled++;
        MF.render.burst(pos.x + 8, pos.y + 10, ['#9a6b3f', '#b98654', '#7dbd57'], 6);
      } else if (p.action === 'plant') {
        const crop = cropById[hand ? hand.crop : s.selected];
        const cost = seedCost(crop);
        if (s.coins < cost) { failed = 'msg.noCoins'; break; }
        spend(cost);
        spent += cost;
        s.stats.planted++;
        plot.kind = 'crop';
        plot.crop = crop.id;
        plot.growth = 0;
        MF.render.burst(pos.x + 8, pos.y + 10, ['#f2e2b0', '#9a6b3f'], 3);
      } else if (p.action === 'water') {
        if (!hand) {
          if (s.water <= 0) break;
          s.water--;
        }
        s.stats.watered++;
        plot.wet = wetDuration();
        MF.render.burst(pos.x + 8, pos.y + 6, ['#8fd3f4', '#5bb4e5', '#c9ecfb'], 7);
      } else if (p.action === 'uproot') {
        plot.kind = 'soil';
        plot.crop = null;
        plot.growth = 0;
        plot.pollen = false;
        s.stats.uprooted++;
        MF.render.burst(pos.x + 8, pos.y + 8, ['#9a6b3f', '#7dbd57', '#4f9a3f'], 8);
      } else if (p.action === 'harvest') {
        const crop = cropById[plot.crop];
        const golden = Math.random() < C.luckChance[s.up.clover] + perk('luck');
        const count = plot.pollen ? C.bees.bonus : 1;
        gained += bank(crop.id, count) + (golden ? priceOf(crop) * count * (C.luckBonus - 1) : 0);
        addXp(crop.xp);
        plot.kind = 'soil';
        plot.crop = null;
        plot.growth = 0;
        plot.pollen = false;
        countItem(crop.id, count);
        if (golden) s.stats.golden++;
        if (count > 1) s.stats.pollinated++;
        if (golden) {
          lucky = true;
          MF.render.burst(pos.x + 8, pos.y + 6, ['#f7d04a', '#fff7e6', '#d6a021'], 18);
          MF.ui.float(pos.x + 8, pos.y - 14, MF.t('msg.lucky', { n: C.luckBonus }), 'lucky');
        } else if (count > 1) {
          MF.render.burst(pos.x + 8, pos.y + 6, ['#f29bb5', '#f7d04a', '#fff7e6'], 12);
          MF.ui.float(pos.x + 8, pos.y - 14, MF.t('msg.bees', { n: count }), 'info');
        } else MF.render.burst(pos.x + 8, pos.y + 6, ['#fff7e6', '#f7d04a', '#a4de6a'], 7);
      }
      stroke.add(i);
      done++;
    }
    if (done) {
      if (!hand) MF.audio.play(p.action);
      showHaul(stockTotal() - before, gained, cx, cy);
      if (gained) MF.audio.play(lucky ? 'lucky' : 'coin');
      if (spent) MF.ui.float(cx, cy, '-' + spent, 'spend');
      advanceTutorial(p.action);
    }
    if (failed && !hand) {
      warn(failed, cx, cy);
      G.queue = G.queue.filter(function (task) {
        return task.type !== 'plot' || plotAction(s.plots[task.index]) !== 'plant';
      });
    }
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
    haul('egg', 1, egg.x, egg.y - 8);
    addXp(C.products.egg.xp);
    countItem('egg', 1);
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
    const coins = haul('apple', count, spot[0], spot[1] - 40);
    addXp(C.products.apple.xp * count);
    countItem('apple', count);
    MF.render.burst(spot[0], spot[1] - 24, ['#d9483b', '#a4de6a', '#fff7e6'], 10);
    MF.audio.play('harvest');
    if (coins) MF.audio.play('coin');
  }

  function catchFirefly(index) {
    const fly = G.fireflies.splice(index, 1)[0];
    G.state.stats.fireflies++;
    earn(randInt(C.fireflies.coins[0], C.fireflies.coins[1]) * G.state.level, fly.x, fly.y - 6);
    MF.render.burst(fly.x, fly.y, ['#eaff8a', '#fff7e6', '#f7d04a'], 8);
    MF.audio.play('coin');
  }

  function makeGift() {
    const s = G.state;
    const roll = Math.random();
    if (roll < C.catGift.gemChance) return { kind: 'gem', coins: C.catGift.gem * s.level };
    if (roll < C.catGift.gemChance + C.catGift.cropChance) {
      return { kind: 'crop', crop: pick(C.crops.filter(function (c) { return c.level <= s.level; })).id };
    }
    return { kind: 'coin', coins: randInt(C.catGift.coin[0], C.catGift.coin[1]) * s.level };
  }

  function collectGift() {
    const s = G.state;
    const gift = s.gift;
    const spot = C.catGift.spot;
    s.gift = null;
    s.stats.gifts++;
    if (gift.kind === 'crop') haul(gift.crop, 1, spot.x, spot.y - 12);
    else earn(gift.coins, spot.x, spot.y - 12);
    MF.render.burst(spot.x, spot.y - 4, ['#fff7e6', '#f7d04a', '#f29bb5'], 8);
    MF.audio.play('coin');
  }

  function petCat() {
    const s = G.state;
    const cat = G.cat;
    s.stats.pets++;
    if (!cat.carrying) cat.pause = Math.max(cat.pause, 1.5);
    MF.render.hearts(cat.x, cat.y - 10, 3);
    MF.ui.float(cat.x, cat.y - 12, MF.t('msg.purr'), 'info');
    MF.audio.play('purr');
    if (petWait > 0 || s.gift || cat.carrying) return;
    petWait = C.catGift.petCooldown;
    s.catGiftIn = Math.max(1, s.catGiftIn - C.catGift.petSkip);
  }

  function throwCost() { return C.pond.throwCost[G.state.level - 1]; }

  function ducklingCount() {
    const throws = G.state.pond.throws;
    return C.pond.ducklingAt.filter(function (need) { return throws >= need; }).length;
  }

  function relicsLeft() {
    return C.relics.filter(function (r) { return !hasRelic(r.id); });
  }

  function relicChance() {
    return C.pond.relicChance + C.pond.ducklingChance * ducklingCount();
  }

  function makeFind(cost) {
    const s = G.state;
    const cfg = C.pond;
    const left = relicsLeft();
    if (left.length && (s.pond.dry + 1 >= cfg.pity || Math.random() < relicChance())) return { kind: 'relic', id: pick(left).id };
    const roll = Math.random();
    if (roll < cfg.gemChance) return { kind: 'gem', coins: Math.round(cost * rand(cfg.gem[0], cfg.gem[1])) };
    if (roll < cfg.gemChance + cfg.coinChance) return { kind: 'coin', coins: Math.max(1, Math.round(cost * rand(cfg.coin[0], cfg.coin[1]))) };
    return { kind: 'none' };
  }

  function tossCoin() {
    const s = G.state;
    const f = G.farmer;
    const cost = throwCost();
    const diver = G.ducks[G.ducks.length - 1];
    if (s.coins < cost) return warn('msg.noCoins', f.x, f.y - 20);
    spend(cost);
    MF.ui.float(f.x, f.y - 20, '-' + cost, 'spend');
    s.pond.find = makeFind(cost);
    s.pond.dry = s.pond.find.kind === 'relic' ? 0 : s.pond.dry + 1;
    s.pond.throws++;
    diver.pause = C.pond.toss + C.pond.dive + 1;
    G.wish = { t: 0, x: f.x - 4, y: f.y - 14, duck: diver };
    MF.audio.play('toss');
    G.save();
  }

  function revealRelic(id, x, y) {
    const s = G.state;
    const relic = C.relics.filter(function (r) { return r.id === id; })[0];
    s.relics.push(id);
    MF.render.burst(x, y - 4, ['#f7d04a', '#fff7e6', '#d6a021'], 18);
    MF.render.burst(relic.spot[0], relic.spot[1] - 6, ['#f7d04a', '#fff7e6', '#d6a021'], 14);
    MF.ui.toast(MF.t('toast.relic', { name: MF.t('relic.' + id) }) + '<br>' + G.perkText(relic), id);
    MF.audio.play('lucky');
    if (!setDone(relic.set)) return;
    const set = C.relicSets.filter(function (item) { return item.id === relic.set; })[0];
    MF.ui.toast(MF.t('toast.set', { name: MF.t('relicSet.' + set.id) }) + '<br>' + G.perkText(set), 'star');
    MF.audio.play('level');
  }

  function revealFind() {
    const s = G.state;
    const find = s.pond.find;
    const x = G.wish ? G.wish.duck.x : C.pond.x;
    const y = G.wish ? G.wish.duck.y : C.pond.y;
    s.pond.find = null;
    G.wish = null;
    MF.render.burst(x, y, ['#e8f7ff', '#c9ecfb', '#8fd3f4'], 8);
    if (find.kind === 'relic') revealRelic(find.id, x, y);
    else if (find.kind === 'none') {
      MF.ui.float(x, y - 10, MF.t('msg.nothing'), 'info');
      MF.audio.play('plop');
    } else {
      earn(find.coins, x, y - 10);
      MF.audio.play(find.kind === 'gem' ? 'lucky' : 'coin');
    }
    if (ducklingCount() > G.ducklings.length) {
      syncAnimals();
      MF.ui.toast(MF.t('toast.duckling', { pct: Math.round(relicChance() * 100) }), 'duckling');
      MF.audio.play('egg');
    }
    G.save();
  }

  function updatePond(dt) {
    const s = G.state;
    const wish = G.wish;
    if (!s.pond.find) return;
    if (wish) {
      const before = wish.t;
      wish.t += dt;
      if (before < C.pond.toss && wish.t >= C.pond.toss) {
        MF.render.burst(wish.duck.x, wish.duck.y, ['#e8f7ff', '#c9ecfb', '#8fd3f4'], 10);
        MF.audio.play('splash');
      }
      if (wish.t < C.pond.toss + C.pond.dive) return;
    }
    revealFind();
  }

  function blowHat() {
    const s = G.state;
    const zone = C.hat.zone;
    if (!s.up.scarecrow || s.hat) return;
    s.hat = { x: Math.round(rand(zone.x, zone.x + zone.w)), y: Math.round(rand(zone.y, zone.y + zone.h)), day: dayIndex() };
    G.hatFlight = C.hat.flight;
    MF.audio.play('wind');
  }

  function returnHat() {
    G.state.hat = null;
    G.state.stats.hats++;
    G.hatFlight = 0;
    MF.render.burst(C.scarecrow.x + 9, C.scarecrow.y + 4, ['#c29a3a', '#f7d04a', '#fff7e6'], 8);
    MF.audio.play('plant');
  }

  function blockRect(x, y, w, h) {
    const c0 = Math.max(0, Math.floor(x / CELL));
    const r0 = Math.max(0, Math.floor(y / CELL));
    const c1 = Math.min(navCols - 1, Math.floor((x + w - 1) / CELL));
    const r1 = Math.min(navRows - 1, Math.floor((y + h - 1) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) blocked[r * navCols + c] = 1;
    }
  }

  function rebuildNav() {
    const s = G.state;
    navCols = Math.ceil(C.viewW / CELL);
    navRows = Math.ceil(C.viewH / CELL);
    blocked = new Uint8Array(navCols * navRows);
    blockRect(0, 0, C.viewW, C.walk.top);
    blockRect(0, C.walk.bottom, C.viewW, C.viewH - C.walk.bottom);
    C.obstacles.forEach(function (o) { blockRect(o[0], o[1], o[2], o[3]); });
    if (s.up.coop > 0) {
      const p = C.pen;
      const bottom = p.y + p.h;
      blockRect(p.x, p.y - 4, p.w, CELL);
      blockRect(p.x, p.y - 4, 40, CELL * 2);
      blockRect(p.x, p.y, CELL, p.h + CELL);
      blockRect(p.x + p.w - CELL, p.y, CELL, p.h + CELL);
      blockRect(p.x, bottom, C.penGate.x - p.x, CELL);
      blockRect(C.penGate.x + C.penGate.w, bottom, p.x + p.w - C.penGate.x - C.penGate.w, CELL);
    }
    s.trees.forEach(function (tree, i) { blockRect(C.treeSpots[i][0] - 4, C.treeSpots[i][1] - 8, 8, 8); });
    if (s.up.barn) blockRect(C.barn.x + 4, C.barn.y + 16, C.barn.w - 8, C.barn.h - 18);
    if (s.up.scarecrow) blockRect(C.scarecrow.x + 4, C.scarecrow.y + 22, 10, 8);
    if (s.up.lanterns) C.lanternSpots.forEach(function (spot) { blockRect(spot[0] + 2, spot[1] + 16, 4, 6); });
  }

  function cellAt(x, y) {
    const c = Math.floor(x / CELL);
    const r = Math.floor(y / CELL);
    if (c < 0 || r < 0 || c >= navCols || r >= navRows) return -1;
    return r * navCols + c;
  }

  function blockedAt(x, y) {
    const cell = cellAt(x, y);
    return cell < 0 || blocked[cell] === 1;
  }

  function lineClear(x0, y0, x1, y1) {
    const dist = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
    const steps = Math.ceil(dist / 3);
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      if (blockedAt(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k)) return false;
    }
    return true;
  }

  function cellCenter(cell) {
    return { x: (cell % navCols) * CELL + CELL / 2, y: Math.floor(cell / navCols) * CELL + CELL / 2 };
  }

  function searchCells(start, goal) {
    const total = navCols * navRows;
    const cost = new Float32Array(total).fill(Infinity);
    const prev = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const open = [start];
    const goalCol = goal % navCols;
    const goalRow = Math.floor(goal / navCols);
    cost[start] = 0;
    while (open.length) {
      let best = 0;
      let bestScore = Infinity;
      for (let i = 0; i < open.length; i++) {
        const dc = (open[i] % navCols) - goalCol;
        const dr = Math.floor(open[i] / navCols) - goalRow;
        const score = cost[open[i]] + Math.sqrt(dc * dc + dr * dr);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
      const cur = open.splice(best, 1)[0];
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const col = cur % navCols;
      const row = Math.floor(cur / navCols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const c = col + dc;
          const r = row + dr;
          if (c < 0 || r < 0 || c >= navCols || r >= navRows) continue;
          const next = r * navCols + c;
          if (blocked[next] || closed[next]) continue;
          if (dr && dc && (blocked[row * navCols + c] || blocked[r * navCols + col])) continue;
          const step = cost[cur] + (dr && dc ? 1.414 : 1);
          if (step < cost[next]) {
            cost[next] = step;
            prev[next] = cur;
            open.push(next);
          }
        }
      }
    }
    if (prev[goal] < 0) return null;
    const cells = [];
    for (let cell = goal; cell !== start && cell >= 0; cell = prev[cell]) cells.unshift(cell);
    return cells;
  }

  function findPath(sx, sy, tx, ty) {
    const target = { x: tx, y: ty };
    const start = cellAt(sx, sy);
    const goal = cellAt(tx, ty);
    if (start < 0 || goal < 0 || start === goal || lineClear(sx, sy, tx, ty)) return [target];
    const cells = searchCells(start, goal);
    if (!cells) return [target];
    const points = cells.map(cellCenter);
    points[points.length - 1] = target;
    const path = [];
    let x = sx;
    let y = sy;
    let i = 0;
    while (i < points.length) {
      let j = points.length - 1;
      while (j > i && !lineClear(x, y, points[j].x, points[j].y)) j--;
      path.push(points[j]);
      x = points[j].x;
      y = points[j].y;
      i = j + 1;
    }
    return path;
  }

  function nearestFree(x, y) {
    if (!blockedAt(x, y)) return { x: x, y: y };
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    for (let radius = 1; radius < navCols; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
          const c = col + dc;
          const r = row + dr;
          if (c < 0 || r < 0 || c >= navCols || r >= navRows || blocked[r * navCols + c]) continue;
          return cellCenter(r * navCols + c);
        }
      }
    }
    return { x: C.farmerHome.x, y: C.farmerHome.y };
  }

  function freshFarmer() {
    return {
      x: C.farmerHome.x, y: C.farmerHome.y, dir: 'down', state: 'idle', path: [], task: null, stand: null,
      action: null, tool: null, actT: 0, hit: false, step: 0, idleT: 0, dustT: 0
    };
  }

  function standFor(task, f) {
    if (task.type === 'plot') {
      const pos = plotPos(task.index);
      const left = f.x < pos.x + 8;
      return { x: left ? pos.x - 1 : pos.x + 17, y: pos.y + 15, dir: left ? 'right' : 'left' };
    }
    if (task.type === 'well') return { x: C.well.x + 12, y: C.well.y + C.well.h + 5, dir: 'up' };
    if (task.type === 'tree') return { x: C.treeSpots[task.index][0], y: C.treeSpots[task.index][1] + 5, dir: 'up' };
    if (task.type === 'house') return { x: C.farmerDoor.x, y: C.farmerDoor.y, dir: 'up' };
    if (task.type === 'pond') return { x: C.pond.stand.x, y: C.pond.stand.y, dir: 'left' };
    if (task.type === 'gift') {
      const spot = C.catGift.spot;
      const left = f.x < spot.x;
      return { x: spot.x + (left ? -8 : 8), y: spot.y, dir: left ? 'right' : 'left' };
    }
    if (task.type === 'egg') {
      const side = f.x < task.egg.x ? -8 : 8;
      const x = Math.max(C.pen.x + 10, Math.min(C.pen.x + C.pen.w - 10, task.egg.x + side));
      return { x: x, y: task.egg.y, dir: x < task.egg.x ? 'right' : 'left' };
    }
    return { x: task.x, y: task.y, dir: null };
  }

  function taskValid(task) {
    const s = G.state;
    if (task.type === 'plot') return playerAction(s.plots[task.index], task.dig) !== null;
    if (task.type === 'egg') return s.eggs.indexOf(task.egg) >= 0;
    if (task.type === 'tree') return s.trees[task.index].apples > 0;
    if (task.type === 'gift') return !!s.gift;
    if (task.type === 'pond') return !s.pond.find;
    return true;
  }

  function finishTask() {
    const f = G.farmer;
    const at = G.queue.indexOf(f.task);
    if (at >= 0) G.queue.splice(at, 1);
    f.task = null;
    f.state = 'idle';
    f.idleT = 0;
  }

  function startTask() {
    const f = G.farmer;
    const task = G.queue[0];
    if (!taskValid(task)) {
      G.queue.shift();
      return;
    }
    f.task = task;
    f.stand = standFor(task, f);
    f.path = findPath(f.x, f.y, f.stand.x, f.stand.y);
    f.state = 'walk';
  }

  function arrive() {
    const f = G.farmer;
    const s = G.state;
    const task = f.task;
    if (f.stand.dir) f.dir = f.stand.dir;
    if (task.type === 'go' || task.type === 'house' || !taskValid(task)) return finishTask();
    f.action = null;
    f.tool = null;
    if (task.type === 'plot') {
      f.action = playerAction(s.plots[task.index], task.dig);
      if (f.action === 'water' && s.water <= 0) {
        G.queue.unshift({ type: 'well' });
        f.task = null;
        f.state = 'idle';
        return;
      }
      f.tool = TOOL_BY_ACTION[f.action];
    }
    if (task.type === 'egg' || task.type === 'gift') f.tool = 'grab';
    f.state = 'act';
    f.actT = 0;
    f.hit = false;
  }

  function perform() {
    const f = G.farmer;
    const task = f.task;
    if (task.type === 'plot') {
      applyPlots({ index: task.index, action: f.action, targets: areaTargets(task.index, f.action, task.dig) }, new Set());
    } else if (task.type === 'well') refill();
    else if (task.type === 'tree') pickApples(task.index);
    else if (task.type === 'gift') collectGift();
    else if (task.type === 'pond') tossCoin();
    else if (task.type === 'egg') {
      const at = G.state.eggs.indexOf(task.egg);
      if (at >= 0) collectEgg(at);
    }
  }

  function followPath(f, distance) {
    let remaining = distance;
    while (remaining > 0 && f.path.length) {
      const p = f.path[0];
      const dx = p.x - f.x;
      const dy = p.y - f.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.01) {
        if (Math.abs(dx) >= Math.abs(dy)) f.dir = dx < 0 ? 'left' : 'right';
        else f.dir = dy < 0 ? 'up' : 'down';
      }
      if (dist <= remaining) {
        f.x = p.x;
        f.y = p.y;
        remaining -= dist;
        f.path.shift();
      } else {
        f.x += (dx / dist) * remaining;
        f.y += (dy / dist) * remaining;
        remaining = 0;
      }
    }
  }

  function walkFarmer(dt) {
    const f = G.farmer;
    followPath(f, C.farmerSpeed[G.state.up.boots] * (1 + perk('walk')) * dt);
    f.step += dt * 9;
    f.dustT += dt;
    if (f.dustT > 0.22) {
      f.dustT = 0;
      MF.render.burst(f.x, f.y, ['#e6dcae', '#cfc48f'], 1);
    }
    if (!f.path.length) arrive();
  }

  function updateFarmer(dt) {
    const f = G.farmer;
    if (f.state === 'act') {
      f.actT += dt;
      if (!f.hit && f.actT >= C.actHit) {
        f.hit = true;
        perform();
      }
      if (f.actT >= C.actTime) finishTask();
      return;
    }
    if (f.state === 'walk') return walkFarmer(dt);
    f.idleT += dt;
    if (G.queue.length) startTask();
  }

  function freshWorker(cfg) {
    return {
      id: cfg.id, home: cfg.home, stroll: cfg.stroll, x: cfg.home.x, y: cfg.home.y, dir: 'down', state: 'idle', path: [], task: null, stand: null,
      tool: null, actT: 0, hit: false, step: 0, idleT: 0, rest: 0
    };
  }

  function freshHand(hand) {
    const pos = plotPos(zoneCells(hand.zone)[0]);
    const w = freshWorker({ id: 'hand', home: { x: pos.x + 8, y: pos.y + 15 } });
    w.hand = hand;
    return w;
  }

  function handTasks(hand) {
    const s = G.state;
    const tasks = [];
    zoneCells(hand.zone).forEach(function (i) {
      const action = plotAction(s.plots[i]);
      if (!action || (action === 'plant' && s.coins < seedCost(cropById[hand.crop]))) return;
      const pos = plotPos(i);
      tasks.push({ type: 'plot', index: i, x: pos.x + 8, y: pos.y + 15 });
    });
    return tasks;
  }

  function workerTool(task) {
    if (task.type === 'plot') return TOOL_BY_ACTION[plotAction(G.state.plots[task.index])];
    return task.type === 'egg' ? 'grab' : null;
  }

  function workerTasks(w) {
    const s = G.state;
    if (w.hand) return handTasks(w.hand);
    if (w.stroll) return [];
    if (w.id === 'henhand') {
      return s.eggs.map(function (egg) { return { type: 'egg', egg: egg, x: egg.x, y: egg.y }; });
    }
    const tasks = [];
    s.trees.forEach(function (tree, i) {
      if (tree.apples) tasks.push({ type: 'tree', index: i, x: C.treeSpots[i][0], y: C.treeSpots[i][1] });
    });
    return tasks;
  }

  function nearestTask(w) {
    let best = null;
    let bestDist = Infinity;
    workerTasks(w).forEach(function (task) {
      const dist = Math.abs(task.x - w.x) + Math.abs(task.y - w.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = task;
      }
    });
    return best;
  }

  function sendWorker(w, task, stand) {
    w.task = task;
    w.stand = stand;
    w.path = findPath(w.x, w.y, stand.x, stand.y);
    w.state = 'walk';
  }

  function restWorker(w, rest) {
    w.task = null;
    w.state = 'idle';
    w.idleT = 0;
    w.rest = rest;
  }

  function strollSpot(zone) {
    const spot = nearestFree(rand(zone.x, zone.x + zone.w), rand(zone.y, zone.y + zone.h));
    return { x: spot.x, y: spot.y, dir: 'down' };
  }

  function workerCollect(w) {
    const task = w.task;
    if (!taskValid(task)) return;
    if (task.type === 'plot') {
      applyPlots({ index: task.index, action: plotAction(G.state.plots[task.index]), targets: [task.index] }, new Set(), w.hand);
    } else if (task.type === 'tree') pickApples(task.index);
    else collectEgg(G.state.eggs.indexOf(task.egg));
  }

  function updateWorker(w, dt) {
    if (w.state === 'act') {
      w.actT += dt;
      if (!w.hit && w.actT >= C.actHit) {
        w.hit = true;
        workerCollect(w);
      }
      if (w.actT >= C.actTime) restWorker(w, w.hand ? C.handRest : C.workerRest);
      return;
    }
    if (w.state === 'walk') {
      followPath(w, C.workerSpeed * dt);
      w.step += dt * 9;
      if (w.path.length) return;
      if (w.stand.dir) w.dir = w.stand.dir;
      if (!w.task && w.stroll) return restWorker(w, rand(C.strollRest[0], C.strollRest[1]));
      if (!w.task || !taskValid(w.task)) return restWorker(w, 0);
      w.tool = workerTool(w.task);
      w.state = 'act';
      w.actT = 0;
      w.hit = false;
      return;
    }
    w.idleT += dt;
    w.rest -= dt;
    if (w.rest > 0) return;
    const task = nearestTask(w);
    if (task) return sendWorker(w, task, standFor(task, w));
    if (w.hand) return;
    if (w.stroll) return sendWorker(w, null, strollSpot(w.stroll));
    if (Math.abs(w.x - w.home.x) > 1 || Math.abs(w.y - w.home.y) > 1) sendWorker(w, null, { x: w.home.x, y: w.home.y, dir: 'down' });
  }

  function enqueue(task) {
    if (G.queue.length >= QUEUE_LIMIT) return;
    G.queue.push(task);
    MF.audio.play('click');
  }

  function queued(type, index) {
    return G.queue.some(function (task) { return task.type === type && task.index === index; });
  }

  G.command = function (p, stroke, dragging, x, y) {
    const s = G.state;
    const f = G.farmer;
    if (!p) {
      if (dragging) return;
      const spot = nearestFree(Math.max(6, Math.min(C.viewW - 6, x)), Math.max(C.walk.top + 2, Math.min(C.walk.bottom - 2, y)));
      G.queue = [{ type: 'go', x: spot.x, y: spot.y }];
      if (f.state === 'walk') f.state = 'idle';
      return;
    }
    if (p.type === 'plot') {
      if (!p.action || stroke.has(p.index)) return;
      stroke.add(p.index);
      return enqueue({ type: 'plot', index: p.index, dig: p.dig });
    }
    if (p.type === 'egg') {
      const egg = s.eggs[p.index];
      if (!G.queue.some(function (task) { return task.egg === egg; })) enqueue({ type: 'egg', egg: egg });
      return;
    }
    if (dragging) return;
    if (p.type === 'firefly') return catchFirefly(p.index);
    if (p.type === 'hat') return returnHat();
    if (p.type === 'cat') return petCat();
    if (p.type === 'barn') return MF.ui.open('barn');
    if (p.type === 'hand') return MF.ui.open('hands');
    if (p.type === 'manager') return MF.ui.open('manager');
    if (p.type === 'gift') {
      if (!queued('gift')) enqueue({ type: 'gift' });
      return;
    }
    if (p.type === 'pond') {
      if (s.pond.find || queued('pond')) return;
      if (s.coins < throwCost()) return warn('msg.noCoins', C.pond.x, C.pond.y - 14);
      return enqueue({ type: 'pond' });
    }
    if (p.type === 'well') {
      if (s.water >= canCapacity()) MF.ui.float(C.well.x + 12, C.well.y, MF.t('msg.full'), 'info');
      else if (!queued('well')) enqueue({ type: 'well' });
    } else if (p.type === 'tree') {
      if (s.trees[p.index].apples && !queued('tree', p.index)) enqueue({ type: 'tree', index: p.index });
    } else if (p.type === 'house' && !queued('house')) enqueue({ type: 'house' });
  };

  G.nextLevelOf = function (id) {
    return upById[id].levels[G.state.up[id]] || null;
  };

  G.missingFor = function (id) {
    const need = upById[id].requires;
    return need && !G.state.up[need] ? need : null;
  };

  G.staffMissing = function (id) {
    return Math.max(0, (upById[id].staff || 0) - staffCount());
  };

  G.canBuy = function (id) {
    const next = G.nextLevelOf(id);
    return !!next && !G.missingFor(id) && !G.staffMissing(id) && G.state.level >= next.level && G.state.coins >= next.cost;
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
    spend(G.nextLevelOf(id).cost);
    s.up[id]++;
    if (id === 'can') s.water = canCapacity();
    if (id === 'trees') s.trees.push({ apples: 0, t: C.appleInterval });
    if (id === 'hands') s.hands.push({ zone: null, crop: isDigging() ? C.crops[0].id : s.selected });
    if (id === 'barn' && s.up.barn === 1) {
      fitOrders();
      MF.ui.toast(MF.t('toast.barn'), 'crate');
    }
    if (s.tut < FINAL_TUTORIAL_STEP) s.tut = FINAL_TUTORIAL_STEP;
    syncAnimals();
    rebuildNav();
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
    if (id === SHOVEL ? !G.state.up.shovel : !crop || crop.level > G.state.level) return;
    G.state.selected = id;
    MF.audio.play('click');
  };

  G.nextShape = function (shape) {
    for (let n = 1; n < C.handShapes.length; n++) {
      const next = (shape + n) % C.handShapes.length;
      if (shapeFits(next)) return next;
    }
    return shape;
  };

  G.placeHand = function (index, zone) {
    const hand = G.state.hands[index];
    if (!zoneFree(zone, index)) {
      MF.audio.play('error');
      return false;
    }
    hand.zone = zone;
    syncAnimals();
    const worker = G.workers.filter(function (w) { return w.hand === hand; })[0];
    if (worker.state !== 'act') restWorker(worker, 0);
    MF.render.burst(worker.x, worker.y - 8, ['#fff7e6', '#f7d04a', '#a4de6a'], 8);
    MF.audio.play('plant');
    G.save();
    return true;
  };

  G.setHandCrop = function (index, id) {
    const crop = cropById[id];
    if (!crop || crop.level > G.state.level) return;
    G.state.hands[index].crop = id;
    MF.audio.play('click');
    G.save();
  };

  G.setPolicy = function (id, sell) {
    if (!hasPolicy() || !C.products[id]) return;
    G.state.policy[id] = sell;
    MF.audio.play('click');
    G.save();
  };

  G.skipOrder = function (index) {
    if (G.state.orders[index].item) G.state.orders[index] = { wait: C.orderSkipDelay };
  };

  G.deliver = function (index) {
    const o = G.state.orders[index];
    if (!orderReady(o)) return MF.audio.play('error');
    deliverOrder(index);
    G.save();
  };

  G.sell = function (id, count) {
    if (!sellStock(id, count)) return;
    MF.audio.play('coin');
    G.save();
  };

  G.sellAll = function () {
    const sold = Object.keys(G.state.stock).reduce(function (sum, id) { return sum + sellStock(id, Infinity); }, 0);
    if (!sold) return;
    MF.audio.play('coin');
    G.save();
  };

  G.ripening = function (plot) {
    const left = growDuration(cropById[plot.crop].time - plot.growth, plot.crop);
    return { at: G.state.time + left, watered: !!G.state.up.sprinkler || plot.wet >= left };
  };

  G.perkText = function (item) {
    return MF.t('perk.' + item.bonus + (item.crop ? '.crop' : ''), {
      pct: Math.round(item.value * 100),
      name: item.crop ? MF.t('crop.' + item.crop) : ''
    });
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
    if (s.tut === 4) return 'hint.drag';
    if (s.tut === 5 && s.coins >= upById.field.levels[0].cost) return 'hint.shop';
    return null;
  };

  function penPoint() {
    return { x: rand(C.pen.x + 8, C.pen.x + C.pen.w - 10), y: rand(C.pen.y + 24, C.pen.y + C.pen.h - 6) };
  }

  function duckPoint() {
    return { x: rand(C.duckZone.x, C.duckZone.x + C.duckZone.w), y: rand(C.duckZone.y, C.duckZone.y + C.duckZone.h) };
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
    const ducks = s.up.ducks ? 2 : 0;
    while (G.ducks.length < ducks) G.ducks.push(walker(duckPoint(), { look: G.ducks.length % 2 }));
    G.ducks.length = ducks;
    const ducklings = s.up.ducks ? ducklingCount() : 0;
    while (G.ducklings.length < ducklings) G.ducklings.push(walker(G.ducks[0], {}));
    G.ducklings.length = ducklings;
    if (s.up.cat && !G.cat) G.cat = walker(catPoint(), { carrying: false });
    if (!s.up.cat) G.cat = null;
    const bees = s.up.flowers ? C.bees.count : 0;
    while (G.bees.length < bees) G.bees.push(freshBee());
    G.bees.length = bees;
    const hands = s.hands.filter(function (hand) { return hand.zone; }).map(function (hand) {
      return G.workers.filter(function (w) { return w.hand === hand; })[0] || freshHand(hand);
    });
    G.workers = C.workers.filter(function (cfg) { return s.up[cfg.id]; }).map(function (cfg) {
      return G.workers.filter(function (w) { return w.id === cfg.id; })[0] || freshWorker(cfg);
    }).concat(hands);
  }

  function beeSpot() {
    const spot = pick(C.bees.spots);
    return { x: spot[0] + rand(-3, 3), y: spot[1] - rand(4, 9) };
  }

  function freshBee() {
    const home = beeSpot();
    return { x: home.x, y: home.y, tx: home.x, ty: home.y, plot: -1, work: 0, wait: rand(C.bees.visit[0], C.bees.visit[1]), out: false };
  }

  function sendBee(bee, x, y) {
    bee.tx = x;
    bee.ty = y;
  }

  function beeTarget() {
    const s = G.state;
    const size = fieldSize();
    const open = [];
    for (let row = 0; row < size[1]; row++) {
      for (let col = 0; col < size[0]; col++) {
        const i = row * C.field.cols + col;
        const plot = s.plots[i];
        if (plot.kind !== 'crop' || plot.pollen || plot.growth >= cropById[plot.crop].time) continue;
        if (!G.bees.some(function (bee) { return bee.plot === i; })) open.push(i);
      }
    }
    return open.length ? pick(open) : -1;
  }

  function updateBee(bee, dt, awake) {
    const s = G.state;
    const dx = bee.tx - bee.x;
    const dy = bee.ty - bee.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    bee.out = awake || bee.plot >= 0;
    if (dist > 1) {
      const step = Math.min(dist, C.bees.speed * dt);
      bee.x += (dx / dist) * step;
      bee.y += (dy / dist) * step;
      return;
    }
    if (bee.plot >= 0) {
      bee.work += dt;
      if (bee.work < C.bees.work) return;
      const plot = s.plots[bee.plot];
      if (plot.kind === 'crop') {
        plot.pollen = true;
        MF.render.burst(bee.x, bee.y + 4, ['#f29bb5', '#f7d04a'], 5);
      }
      const home = beeSpot();
      bee.plot = -1;
      bee.wait = rand(C.bees.visit[0], C.bees.visit[1]);
      return sendBee(bee, home.x, home.y);
    }
    if (!awake) return;
    bee.wait -= dt;
    if (bee.wait > 0) return;
    const target = beeTarget();
    if (target < 0) {
      const home = beeSpot();
      bee.wait = 6;
      return sendBee(bee, home.x, home.y);
    }
    const pos = plotPos(target);
    bee.plot = target;
    bee.work = 0;
    sendBee(bee, pos.x + 8, pos.y + 2);
  }

  function updateFireflies(dt) {
    const s = G.state;
    const cfg = C.fireflies;
    const out = !!s.up.lanterns && isNight() && s.rain <= 0;
    G.fireflies.forEach(function (fly) {
      fly.life -= dt;
      fly.t += dt;
      fly.x = fly.bx + Math.sin(fly.t * fly.sx) * 9;
      fly.y = fly.by + Math.cos(fly.t * fly.sy) * 6;
    });
    G.fireflies = G.fireflies.filter(function (fly) { return out && fly.life > 0; });
    if (!out) return;
    fireflyIn -= dt;
    if (fireflyIn > 0) return;
    fireflyIn = rand(cfg.every[0], cfg.every[1]);
    if (G.fireflies.length >= cfg.max) return;
    const lamp = pick(C.lanternSpots);
    const bx = lamp[0] + 4 + rand(-28, 28);
    const by = lamp[1] + 4 + rand(-24, 12);
    G.fireflies.push({ bx: bx, by: by, x: bx, y: by, t: rand(0, 6), sx: rand(0.5, 1.1), sy: rand(0.6, 1.3), life: rand(cfg.life[0], cfg.life[1]) });
  }

  function updateCat(dt, step, quiet) {
    const s = G.state;
    const cat = G.cat;
    const spot = C.catGift.spot;
    if (!cat) return;
    petWait = Math.max(0, petWait - dt);
    if (!s.gift && !cat.carrying) {
      s.catGiftIn -= dt;
      if (s.catGiftIn <= 0) {
        s.catGiftIn = rand(C.catGift.every[0], C.catGift.every[1]) / (1 + perk('gifts'));
        if (quiet) s.gift = makeGift();
        else {
          cat.carrying = true;
          cat.pause = 0;
          cat.tx = spot.x;
          cat.ty = spot.y;
        }
      }
    }
    if (cat.carrying && Math.abs(cat.x - spot.x) < 2 && Math.abs(cat.y - spot.y) < 2) {
      cat.carrying = false;
      cat.pause = 2;
      s.gift = makeGift();
      MF.render.burst(spot.x, spot.y - 4, ['#fff7e6', '#f7d04a'], 6);
      MF.audio.play('ripe');
    }
    moveWalker(cat, step, cat.carrying ? 30 : 16, catPoint, 3, 10);
  }

  function updateHat(dt) {
    const s = G.state;
    G.hatFlight = Math.max(0, G.hatFlight - dt);
    if (s.hat && dayIndex() > s.hat.day) s.hat = null;
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

  function followWalker(a, lead, dt, speed, gap) {
    const dx = lead.x - a.x;
    const dy = lead.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    a.moving = dist > gap;
    if (!a.moving) return;
    const step = Math.min(dist - gap, speed * dt);
    a.left = dx < 0;
    a.x += (dx / dist) * step;
    a.y += (dy / dist) * step;
  }

  function updateWeather(dt) {
    const s = G.state;
    if (s.rain > 0) {
      s.rain = Math.max(0, s.rain - dt);
      return;
    }
    const before = s.rainIn;
    s.rainIn -= dt;
    if (before > C.hat.warn && s.rainIn <= C.hat.warn) blowHat();
    if (s.rainIn <= 0) {
      s.rain = rand(35, 60);
      s.rainIn = rand(300, 700);
      MF.ui.toast(MF.t('toast.rain'), 'drop');
    }
  }

  function pickDaily(last) {
    const s = G.state;
    const open = C.crops.filter(function (c) { return c.level <= s.level; }).slice(-C.dailyPool);
    if (open.length < 2) return null;
    return pick(open.filter(function (c) { return c.id !== last; })).id;
  }

  function updateDaily(quiet) {
    const s = G.state;
    const day = dayIndex();
    if (s.daily && s.daily.day === day) return;
    if (s.daily && !s.daily.managed) runManager();
    const crop = (s.daily && s.daily.next) || pickDaily(s.daily ? s.daily.crop : null);
    if (!crop) return;
    s.daily = { day: day, crop: crop };
    if (quiet) return;
    MF.ui.toast(MF.t('toast.daily', { name: MF.t('crop.' + crop), pct: Math.round((dailyBonus() - 1) * 100) }), crop);
  }

  function updateManager() {
    const s = G.state;
    if (!s.daily || s.daily.managed) return;
    if ((s.time % C.dayLength) / C.dayLength < C.managerPhase) return;
    runManager();
  }

  function updateInsider(quiet) {
    const s = G.state;
    if (!s.up.insider || !s.daily || s.daily.next) return;
    if ((s.time % C.dayLength) / C.dayLength < C.insiderPhase) return;
    const next = pickDaily(s.daily.crop);
    if (!next) return;
    s.daily.next = next;
    if (quiet) return;
    MF.ui.toast(MF.t('toast.insider', { name: MF.t('crop.' + next) }), 'insider');
  }

  function updatePlots(dt, quiet) {
    const s = G.state;
    const size = fieldSize();
    const duration = wetDuration();
    const night = nightBoost(quiet);
    const soaked = s.up.sprinkler || s.rain > 0;
    for (let row = 0; row < size[1]; row++) {
      for (let col = 0; col < size[0]; col++) {
        const i = row * C.field.cols + col;
        const plot = s.plots[i];
        if (soaked && plot.kind !== 'grass') plot.wet = duration;
        if (plot.kind === 'crop') {
          const time = cropById[plot.crop].time;
          if (plot.growth < time) {
            plot.growth += (soaked ? dt : Math.min(dt, plot.wet)) * growSpeed(plot.crop) * night;
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
        ch.eggT += (C.eggInterval / C.feedSpeed[s.up.feed] / (1 + perk('eggs'))) * rand(0.85, 1.15);
        if (s.eggs.length < G.chickens.length * 2) {
          const spot = quiet ? penPoint() : ch;
          s.eggs.push({ x: Math.round(spot.x), y: Math.round(spot.y) });
        }
      }
      moveWalker(ch, step, 12, penPoint, 0.8, 4);
    });
    G.ducks.forEach(function (duck) { moveWalker(duck, step, 5, duckPoint, 2, 8); });
    G.ducklings.forEach(function (duckling, i) { followWalker(duckling, i ? G.ducklings[i - 1] : G.ducks[0], step, 9, 7); });
    updateCat(dt, step, quiet);
    if (!quiet) {
      const awake = !isNight() && s.rain <= 0;
      G.bees.forEach(function (bee) { updateBee(bee, dt, awake); });
      updateFireflies(dt);
    }
    s.trees.forEach(function (tree) {
      tree.t -= dt;
      while (tree.t <= 0) {
        tree.t += C.appleInterval / C.shearsSpeed[s.up.shears];
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
    updateDaily(quiet);
    updateManager();
    updateInsider(quiet);
    if (!quiet) updateWeather(dt);
    updatePlots(dt, quiet);
    updateAnimals(dt, quiet);
    updateHat(dt);
    updatePond(dt);
    if (!quiet) {
      s.stats.played += dt;
      updateFarmer(dt);
      G.workers.forEach(function (w) { updateWorker(w, dt); });
    }
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
        s.stats = Object.assign(freshStats(), data.stats);
        away = Math.max(0, (Date.now() - data.savedAt) / 1000);
      }
    } catch (e) {
      s = freshState();
    }
    G.state = s;
    G.chickens = [];
    G.ducks = [];
    G.ducklings = [];
    G.wish = null;
    G.cat = null;
    G.bees = [];
    G.fireflies = [];
    G.hatFlight = 0;
    G.queue = [];
    G.farmer = freshFarmer();
    G.workers = [];
    syncAnimals();
    rebuildNav();
    return Math.min(offlineCap(), away);
  };

  G.reset = function () {
    const settings = G.state.settings;
    G.state = freshState();
    G.state.settings = settings;
    G.chickens = [];
    G.ducks = [];
    G.ducklings = [];
    G.wish = null;
    G.cat = null;
    G.bees = [];
    G.fireflies = [];
    G.hatFlight = 0;
    G.queue = [];
    G.farmer = freshFarmer();
    G.workers = [];
    rebuildNav();
    G.save();
  };

  G.fieldSize = fieldSize;
  G.plotPos = plotPos;
  G.zoneAt = zoneAt;
  G.zoneFree = zoneFree;
  G.canCapacity = canCapacity;
  G.wetDuration = wetDuration;
  G.priceOf = priceOf;
  G.isDaily = isDaily;
  G.isNextDaily = isNextDaily;
  G.dailyBonus = dailyBonus;
  G.offlineCap = offlineCap;
  G.seedCost = seedCost;
  G.growTime = function (crop) { return crop.time / growSpeed(crop.id); };
  G.itemInfo = itemInfo;
  G.hasPolicy = hasPolicy;
  G.policyGoods = policyGoods;
  G.productOpen = productOpen;
  G.barnCapacity = barnCapacity;
  G.stockOf = stockOf;
  G.stockTotal = stockTotal;
  G.stockValue = stockValue;
  G.orderReady = orderReady;
  G.orderHave = orderHave;
  G.hasRelic = hasRelic;
  G.setRelics = setRelics;
  G.setDone = setDone;
  G.throwCost = throwCost;
  G.relicChance = relicChance;
  G.relicsLeft = relicsLeft;
  G.ducklingCount = ducklingCount;
})();
