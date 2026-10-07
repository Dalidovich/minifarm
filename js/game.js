(function () {
  const C = MF.config;
  const KEY = 'minifarm.save.v1';
  const MAX_LEVEL = C.levelXp.length + 1;
  const FINAL_TUTORIAL_STEP = 6;

  const cropById = {};
  C.crops.forEach(function (c) { cropById[c.id] = c; });
  const upById = {};
  C.upgrades.forEach(function (u) { upById[u.id] = u; });

  const G = (MF.game = { state: null, chickens: [], ducks: [], cat: null, farmer: null, queue: [], cropById: cropById, upById: upById, maxLevel: MAX_LEVEL });

  let saveTimer = 0;
  let warnAt = 0;
  let ripeSoundAt = 0;
  let navCols = 0;
  let navRows = 0;
  let blocked = null;

  const CELL = C.walk.cell;
  const QUEUE_LIMIT = 80;
  const TOOL_BY_ACTION = { till: 'hoe', plant: 'seed', water: 'can', harvest: 'grab' };

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
      daily: null,
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
  function isDaily(id) { return !!G.state.daily && G.state.daily.crop === id; }
  function dailyBonus() { return C.dailyBonus[G.state.up.sign]; }
  function offlineCap() { return C.offlineCap[G.state.up.hammock]; }
  function priceOf(item) { return Math.round(item.sell * C.houseBonus[G.state.up.house] * (isDaily(item.id) ? dailyBonus() : 1)); }
  function itemInfo(id) { return cropById[id] || C.products[id]; }

  function isUnlocked(col, row) {
    const size = fieldSize();
    return col >= 0 && row >= 0 && col < size[0] && row < size[1];
  }

  function plotPos(i) {
    return { x: C.field.x + (i % C.field.cols) * C.tile, y: C.field.y + Math.floor(i / C.field.cols) * C.tile };
  }

  function seedCost(crop) {
    const cost = Math.max(1, Math.round(crop.cost * C.seedDiscount[G.state.up.seeds]));
    return crop.id === C.crops[0].id && G.state.coins < cost ? 0 : cost;
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
      coins: Math.round(need * info.sell * 0.6 * C.orderBonus[s.up.market]),
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
    let lucky = false;
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
        if (s.water <= 0) break;
        s.water--;
        plot.wet = wetDuration();
        MF.render.burst(pos.x + 8, pos.y + 6, ['#8fd3f4', '#5bb4e5', '#c9ecfb'], 7);
      } else if (p.action === 'harvest') {
        const crop = cropById[plot.crop];
        const golden = Math.random() < C.luckChance[s.up.clover];
        gained += priceOf(crop) * (golden ? C.luckBonus : 1);
        addXp(crop.xp);
        plot.kind = 'soil';
        plot.crop = null;
        plot.growth = 0;
        progressOrders(crop.id, 1);
        if (golden) {
          lucky = true;
          MF.render.burst(pos.x + 8, pos.y + 6, ['#f7d04a', '#fff7e6', '#d6a021'], 18);
          MF.ui.float(pos.x + 8, pos.y - 14, MF.t('msg.lucky', { n: C.luckBonus }), 'lucky');
        } else MF.render.burst(pos.x + 8, pos.y + 6, ['#fff7e6', '#f7d04a', '#a4de6a'], 7);
      }
      stroke.add(i);
      done++;
    }
    if (done) {
      MF.audio.play(p.action);
      if (gained) {
        earn(gained, cx, cy);
        MF.audio.play(lucky ? 'lucky' : 'coin');
      }
      if (spent) MF.ui.float(cx, cy, '-' + spent, 'spend');
      advanceTutorial(p.action);
    }
    if (failed) {
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

  function standFor(task) {
    const f = G.farmer;
    if (task.type === 'plot') {
      const pos = plotPos(task.index);
      const left = f.x < pos.x + 8;
      return { x: left ? pos.x - 1 : pos.x + 17, y: pos.y + 15, dir: left ? 'right' : 'left' };
    }
    if (task.type === 'well') return { x: C.well.x + 12, y: C.well.y + C.well.h + 5, dir: 'up' };
    if (task.type === 'tree') return { x: C.treeSpots[task.index][0], y: C.treeSpots[task.index][1] + 5, dir: 'up' };
    if (task.type === 'house') return { x: C.farmerDoor.x, y: C.farmerDoor.y, dir: 'up' };
    if (task.type === 'egg') {
      const side = f.x < task.egg.x ? -8 : 8;
      const x = Math.max(C.pen.x + 10, Math.min(C.pen.x + C.pen.w - 10, task.egg.x + side));
      return { x: x, y: task.egg.y, dir: x < task.egg.x ? 'right' : 'left' };
    }
    return { x: task.x, y: task.y, dir: null };
  }

  function taskValid(task) {
    const s = G.state;
    if (task.type === 'plot') return plotAction(s.plots[task.index]) !== null;
    if (task.type === 'egg') return s.eggs.indexOf(task.egg) >= 0;
    if (task.type === 'tree') return s.trees[task.index].apples > 0;
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
    f.stand = standFor(task);
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
      f.action = plotAction(s.plots[task.index]);
      if (f.action === 'water' && s.water <= 0) {
        G.queue.unshift({ type: 'well' });
        f.task = null;
        f.state = 'idle';
        return;
      }
      f.tool = TOOL_BY_ACTION[f.action];
    }
    if (task.type === 'egg') f.tool = 'grab';
    f.state = 'act';
    f.actT = 0;
    f.hit = false;
  }

  function perform() {
    const f = G.farmer;
    const task = f.task;
    if (task.type === 'plot') {
      applyPlots({ index: task.index, action: f.action, targets: areaTargets(task.index, f.action) }, new Set());
    } else if (task.type === 'well') refill();
    else if (task.type === 'tree') pickApples(task.index);
    else if (task.type === 'egg') {
      const at = G.state.eggs.indexOf(task.egg);
      if (at >= 0) collectEgg(at);
    }
  }

  function walkFarmer(dt) {
    const f = G.farmer;
    let remaining = C.farmerSpeed[G.state.up.boots] * dt;
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
      return enqueue({ type: 'plot', index: p.index });
    }
    if (p.type === 'egg') {
      const egg = s.eggs[p.index];
      if (!G.queue.some(function (task) { return task.egg === egg; })) enqueue({ type: 'egg', egg: egg });
      return;
    }
    if (dragging) return;
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

  G.canBuy = function (id) {
    const next = G.nextLevelOf(id);
    return !!next && !G.missingFor(id) && G.state.level >= next.level && G.state.coins >= next.cost;
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

  function updateDaily(quiet) {
    const s = G.state;
    const day = Math.floor(s.time / C.dayLength);
    if (s.daily && s.daily.day === day) return;
    const open = C.crops.filter(function (c) { return c.level <= s.level; }).slice(-C.dailyPool);
    if (open.length < 2) return;
    const last = s.daily ? s.daily.crop : null;
    const crop = pick(open.filter(function (c) { return c.id !== last; }));
    s.daily = { day: day, crop: crop.id };
    if (quiet) return;
    MF.ui.toast(MF.t('toast.daily', { name: MF.t('crop.' + crop.id), pct: Math.round((dailyBonus() - 1) * 100) }), crop.id);
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
        ch.eggT += (C.eggInterval / C.feedSpeed[s.up.feed]) * rand(0.85, 1.15);
        if (s.eggs.length < G.chickens.length * 2) {
          const spot = quiet ? penPoint() : ch;
          s.eggs.push({ x: Math.round(spot.x), y: Math.round(spot.y) });
        }
      }
      moveWalker(ch, step, 12, penPoint, 0.8, 4);
    });
    G.ducks.forEach(function (duck) { moveWalker(duck, step, 5, duckPoint, 2, 8); });
    if (G.cat) moveWalker(G.cat, step, 16, catPoint, 3, 10);
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
    if (!quiet) updateWeather(dt);
    updatePlots(dt, quiet);
    updateAnimals(dt, quiet);
    if (!quiet) updateFarmer(dt);
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
        away = Math.min(C.offlineCap[s.up.hammock], Math.max(0, (Date.now() - data.savedAt) / 1000));
      }
    } catch (e) {
      s = freshState();
    }
    G.state = s;
    G.chickens = [];
    G.ducks = [];
    G.cat = null;
    G.queue = [];
    G.farmer = freshFarmer();
    syncAnimals();
    rebuildNav();
    return away;
  };

  G.reset = function () {
    const settings = G.state.settings;
    G.state = freshState();
    G.state.settings = settings;
    G.chickens = [];
    G.ducks = [];
    G.cat = null;
    G.queue = [];
    G.farmer = freshFarmer();
    rebuildNav();
    G.save();
  };

  G.fieldSize = fieldSize;
  G.plotPos = plotPos;
  G.canCapacity = canCapacity;
  G.wetDuration = wetDuration;
  G.priceOf = priceOf;
  G.isDaily = isDaily;
  G.dailyBonus = dailyBonus;
  G.offlineCap = offlineCap;
  G.seedCost = seedCost;
  G.itemInfo = itemInfo;
})();
