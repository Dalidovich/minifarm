(function () {
  const C = MF.config;
  const S = MF.sprites;
  const G = MF.game;
  const t = MF.t;
  const STAGE_W = 960;
  const STAGE_H = 540;
  const WORLD_SCALE = 2;
  const SCALE_STEP = 0.25;
  const REFRESH = 0.1;

  const U = (MF.ui = {});
  const el = {};
  const mouse = { x: 0, y: 0, inside: false, down: false, clientX: 0, clientY: 0 };
  let stroke = new Set();
  let refreshTimer = 0;
  let modalKind = null;
  let resetArmed = false;
  let placing = null;
  const cache = {};

  function $(id) { return document.getElementById(id); }

  function img(sprite, cls) {
    return '<img class="px ' + (cls || '') + '" src="' + S.url(sprite) + '" alt="">';
  }

  function ico(name, cls) { return img(S.icons[name] || S.relics[name], cls); }

  function setText(node, value) {
    const text = String(value);
    if (node.textContent !== text) node.textContent = text;
  }

  function setHtml(key, node, html) {
    if (cache[key] === html) return;
    cache[key] = html;
    node.innerHTML = html;
  }

  function layout() {
    const fit = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    const scale = Math.max(SCALE_STEP * 2, Math.floor(fit / SCALE_STEP) * SCALE_STEP);
    el.stage.style.transform = 'scale(' + scale + ')';
    el.stage.style.left = Math.max(0, Math.round((window.innerWidth - STAGE_W * scale) / 2)) + 'px';
    el.stage.style.top = Math.max(0, Math.round((window.innerHeight - STAGE_H * scale) / 2)) + 'px';
  }

  function buildSide() {
    el.side.innerHTML =
      '<div class="logo">' + t('title') + '</div>' +
      '<div class="card stats">' +
        '<div class="row big">' + ico('coin') + '<span id="st-coins"></span></div>' +
        '<div class="row">' + ico('star') + '<span id="st-level"></span></div>' +
        '<div class="bar"><i id="st-xp"></i></div>' +
        '<div class="row">' + ico('drop') + '<span id="st-water"></span></div>' +
        '<div class="bar blue"><i id="st-waterbar"></i></div>' +
        '<div class="row"><img class="px" id="st-sky" alt=""><span id="st-day"></span><span id="st-clock"></span></div>' +
      '</div>' +
      '<div class="card orders"><div class="head">' + t('orders') +
        '<button class="stock" id="btn-barn">' + ico('crate', 'tiny') + '<span id="barn-count"></span></button></div>' +
        '<div id="orders"></div></div>' +
      '<div class="btns">' +
        '<button class="btn green" id="btn-shop">' + t('shop') + '<b id="shop-badge">!</b></button>' +
        '<button class="btn" id="btn-relics">' + t('relics') + ' <span id="relics-count"></span></button>' +
        '<div class="btn-pair">' +
          '<button class="btn" id="btn-stats">' + t('stats') + '</button>' +
          '<button class="btn" id="btn-settings">' + t('settings') + '</button>' +
        '</div>' +
      '</div>';
    delete cache.orders;
    $('btn-shop').addEventListener('click', function () { openModal('shop'); });
    $('btn-relics').addEventListener('click', function () { openModal('relics'); });
    $('btn-barn').addEventListener('click', function () { openModal('barn'); });
    $('btn-stats').addEventListener('click', function () { openModal('stats'); });
    $('btn-settings').addEventListener('click', function () { openModal('settings'); });
    $('orders').addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.deliver) G.deliver(Number(btn.dataset.deliver));
      else {
        G.skipOrder(Number(btn.dataset.skip));
        MF.audio.play('click');
      }
      U.refresh();
    });
  }

  function durationText(seconds) {
    const total = Math.ceil(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (!m) return t('time.sec', { s: s });
    return s ? t('time.minSec', { m: m, s: s }) : t('time.min', { m: m });
  }

  function hotbarHtml() {
    const s = G.state;
    return C.crops.map(function (crop) {
      const name = t('crop.' + crop.id);
      if (crop.level > s.level) {
        return '<div class="slot locked">' + ico(crop.id, 'sil') +
          '<span class="cost">' + t('lvlShort', { n: crop.level }) + '</span></div>';
      }
      const cost = G.seedCost(crop);
      const daily = G.isDaily(crop.id);
      const next = G.isNextDaily(crop.id);
      const cls = 'slot' + (s.selected === crop.id ? ' sel' : '') + (s.coins < cost ? ' poor' : '') + (daily ? ' daily' : '');
      return '<button class="' + cls + '" data-crop="' + crop.id + '">' + ico(crop.id) +
        '<span class="cost">' + ico('coin', 'tiny') + cost + '</span>' +
        (daily ? '<span class="mark">' + ico('star', 'tiny') + '</span>' : '') +
        (next ? '<span class="mark">' + ico('insider', 'tiny') + '</span>' : '') +
        '<span class="tip">' + name + '<br>' + t('sellsFor') + ' ' + ico('coin', 'tiny') + G.priceOf(crop) +
        '<br>' + t('growsIn', { time: durationText(G.growTime(crop)) }) +
        (daily ? '<br><span class="good">' + t('daily.tip', { pct: Math.round((G.dailyBonus() - 1) * 100) }) + '</span>' : '') +
        (next ? '<br><span class="good">' + t('daily.next') + '</span>' : '') + '</span></button>';
    }).join('');
  }

  function ordersHtml() {
    return G.state.orders.map(function (o, i) {
      if (!o.item) return '<div class="order wait">' + t('orderWait') + '</div>';
      const have = G.orderHave(o);
      const pct = Math.min(100, Math.round((have / o.need) * 100));
      const ready = G.orderReady(o);
      return '<div class="order' + (ready ? ' ready' : '') + '">' + ico(o.item) +
        '<div class="o-main"><div class="o-top"><span>' + have + '/' + o.need + '</span>' +
        '<span class="o-rew">' + ico('coin', 'tiny') + o.coins + '</span></div>' +
        (ready ? '<button class="btn green o-ok" data-deliver="' + i + '">' + t('orderDeliver') + '</button>' :
          '<div class="bar"><i style="width:' + pct + '%"></i></div>') + '</div>' +
        '<button class="o-x" data-skip="' + i + '" aria-label="' + t('orderSkip') + '">×</button></div>';
    }).join('');
  }

  function shopHtml() {
    const s = G.state;
    const items = C.upgrades.map(function (u) {
      const lvl = s.up[u.id];
      const next = u.levels[lvl];
      const missing = G.missingFor(u.id);
      const staff = G.staffMissing(u.id);
      const nameKey = lvl > 0 && MF.i18n.has('up.' + u.id + '.name2') ? 'up.' + u.id + '.name2' : 'up.' + u.id + '.name';
      let pips = '';
      if (u.levels.length > 1) {
        for (let i = 0; i < u.levels.length; i++) pips += '<i class="' + (i < lvl ? 'on' : '') + '"></i>';
      }
      let action;
      if (!next) action = '<div class="tag done">' + t('shop.max') + '</div>';
      else if (s.level < next.level) action = '<div class="tag lock">' + t('lvlReq', { n: next.level }) + '</div>';
      else if (missing) action = '<div class="tag lock need">' + t('shop.needs', { name: t('up.' + missing + '.name') }) + '</div>';
      else if (staff) action = '<div class="tag lock need">' + t('shop.needsStaff', { n: u.staff - staff, max: u.staff }) + '</div>';
      else {
        action = '<button class="btn green buy' + (s.coins < next.cost ? ' poor' : '') + '" data-buy="' + u.id + '">' +
          ico('coin', 'tiny') + next.cost + '</button>';
      }
      const manage = u.id === 'hands' && s.hands.length;
      if (manage) action += '<button class="btn" data-open="hands">' + t('hands.manage') + '</button>';
      return '<div class="item' + (!next ? ' maxed' : '') + '">' +
        '<div class="i-icon">' + img(S.shopIcons[u.id]) + '</div>' +
        '<div class="i-text"><div class="i-name">' + t(nameKey) + '</div><div class="pips">' + pips + '</div>' +
        '<div class="i-desc">' + t('up.' + u.id + '.desc') + '</div></div>' +
        '<div class="i-act' + (manage ? ' sell' : '') + '">' + action + '</div></div>';
    }).join('');
    return '<div class="p-head"><span>' + t('shop') + '</span><span class="p-coins">' + ico('coin') + s.coins +
      '</span><button class="p-x" data-close>×</button></div><div class="p-list">' + items + '</div>';
  }

  function stockHtml(id) {
    const count = G.stockOf(id);
    const price = G.priceOf(G.itemInfo(id));
    const daily = G.isDaily(id);
    const wanted = G.state.orders.reduce(function (sum, o) { return sum + (o.item === id ? o.need - o.have : 0); }, 0);
    return '<div class="item' + (daily ? ' hot' : '') + '">' +
      '<div class="i-icon">' + ico(id) + '</div>' +
      '<div class="i-text"><div class="i-name">' + t('crop.' + id) + ' ×' + count + '</div>' +
      '<div class="i-desc">' + ico('coin', 'tiny') + price +
      (daily ? ' · ' + t('daily.tip', { pct: Math.round((G.dailyBonus() - 1) * 100) }) : '') +
      (wanted ? '<br>' + t('barn.forOrders', { n: wanted }) : '') + '</div></div>' +
      '<div class="i-act sell"><button class="btn green" data-sell="' + id + '">' + t('barn.all') + ' ' +
      ico('coin', 'tiny') + price * count + '</button>' +
      '<button class="btn" data-sell="' + id + '" data-n="1">×1</button></div></div>';
  }

  function barnHtml() {
    const s = G.state;
    const goods = C.crops.map(function (c) { return c.id; }).concat(Object.keys(C.products)).filter(G.stockOf);
    const sellAll = goods.length ? '<button class="btn green" data-sellall>' + t('barn.sellAll') + ' ' +
      ico('coin', 'tiny') + G.stockValue() + '</button>' : '';
    return '<div class="p-head"><span>' + t('barn') + ' ' + G.stockTotal() + '/' + G.barnCapacity() + '</span>' +
      '<span class="p-coins">' + ico('coin') + s.coins + '</span><button class="p-x" data-close>×</button></div>' +
      '<div class="p-list"><div class="barn-facts"><span>' + t(goods.length ? 'barn.note' : 'barn.empty') + '</span>' + sellAll + '</div>' +
      goods.map(stockHtml).join('') + '</div>';
  }

  function handHtml(hand, i) {
    const s = G.state;
    const shape = hand.zone ? C.handShapes[hand.zone.shape] : null;
    const crops = C.crops.filter(function (crop) { return crop.level <= s.level; }).map(function (crop) {
      return '<button class="pick' + (hand.crop === crop.id ? ' sel' : '') + '" data-hand="' + i + '" data-pick="' + crop.id +
        '" title="' + t('crop.' + crop.id) + '">' + ico(crop.id) + '</button>';
    }).join('');
    return '<div class="item hand' + (shape ? '' : ' missing') + '">' +
      '<div class="i-icon">' + img(S.shopIcons.hands) + '</div>' +
      '<div class="i-text"><div class="i-name">' + t('hands.name', { n: i + 1 }) + ' · ' +
      (shape ? t('hands.zone', { w: shape[0], h: shape[1] }) : t('hands.idle')) + '</div>' +
      '<div class="crops">' + crops + '</div></div>' +
      '<div class="i-act"><button class="btn' + (shape ? '' : ' green') + '" data-place="' + i + '">' +
      t(shape ? 'hands.move' : 'hands.place') + '</button></div></div>';
  }

  function handsHtml() {
    const hands = G.state.hands;
    return '<div class="p-head"><span>' + t('hands') + '</span><button class="p-x" data-close>×</button></div>' +
      '<div class="p-list"><div class="barn-facts"><span>' + t(hands.length ? 'hands.note' : 'hands.empty') + '</span></div>' +
      hands.map(handHtml).join('') + '</div>';
  }

  function relicHtml(relic) {
    const found = G.hasRelic(relic.id);
    return '<div class="item' + (found ? '' : ' missing') + '">' +
      '<div class="i-icon">' + img(S.relics[relic.id], found ? '' : 'sil') + '</div>' +
      '<div class="i-text"><div class="i-name">' + (found ? t('relic.' + relic.id) : t('relics.unknown')) + '</div>' +
      '<div class="i-desc">' + G.perkText(relic) + '</div></div></div>';
  }

  function relicsHtml() {
    const s = G.state;
    const ducklings = G.ducklingCount();
    const next = C.pond.ducklingAt[ducklings];
    const facts = [
      t('relics.cost') + ' ' + ico('coin', 'tiny') + G.throwCost(),
      t('relics.chance', { pct: Math.round(G.relicChance() * 100) }),
      t('relics.ducklings', { n: ducklings, max: C.pond.ducklingAt.length }) +
        (next ? ' · ' + t('relics.nextDuckling', { n: next - s.pond.throws }) : '')
    ];
    const sets = C.relicSets.map(function (set) {
      const relics = G.setRelics(set.id);
      const found = relics.filter(function (relic) { return G.hasRelic(relic.id); }).length;
      return '<div class="set-head' + (G.setDone(set.id) ? ' done' : '') + '">' +
        '<div class="set-name"><span>' + t('relicSet.' + set.id) + '</span><span>' + found + '/' + relics.length + '</span></div>' +
        '<div class="set-perk">' + t('relics.setPerk') + ' ' + G.perkText(set) + '</div></div>' +
        relics.map(relicHtml).join('');
    }).join('');
    return '<div class="p-head"><span>' + t('relics') + '</span><button class="p-x" data-close>×</button></div>' +
      '<div class="p-list"><div class="pond-facts">' +
      (s.up.ducks ? facts.join('<br>') : t('relics.locked')) + '</div>' + sets + '</div>';
  }

  function statHtml(sprite, key, value) {
    return '<div class="stat">' + img(sprite) + '<span>' + t(key) + '</span><b>' + value + '</b></div>';
  }

  function statGroupHtml(key, total, rows) {
    return '<div class="set-head"><div class="set-name"><span>' + t(key) + '</span><span>' + total + '</span></div></div>' + rows.join('');
  }

  function playedText(seconds) {
    const minutes = Math.floor(seconds / 60);
    return t('stats.time', { h: Math.floor(minutes / 60), m: minutes % 60 });
  }

  function statsHtml() {
    const s = G.state;
    const st = s.stats;
    const bought = C.upgrades.reduce(function (sum, u) { return sum + s.up[u.id]; }, 0);
    const levels = C.upgrades.reduce(function (sum, u) { return sum + u.levels.length; }, 0);
    const farm = [
      statHtml(S.icons.sun, 'stats.days', Math.floor(s.time / C.dayLength) + 1),
      statHtml(S.icons.hammock, 'stats.played', playedText(st.played)),
      statHtml(S.icons.coin, 'stats.earned', st.earned),
      statHtml(S.icons.bag, 'stats.spent', st.spent),
      statHtml(S.icons.market, 'stats.orders', st.orders),
      statHtml(S.icons.house, 'stats.upgrades', bought + '/' + levels)
    ];
    const goods = C.crops.map(function (c) { return c.id; }).concat(Object.keys(C.products)).filter(function (id) {
      const crop = G.cropById[id];
      return st.items[id] || (crop ? crop.level <= s.level : s.up[id === 'egg' ? 'coop' : 'trees'] > 0);
    });
    const harvest = goods.map(function (id) { return statHtml(S.icons[id], 'crop.' + id, st.items[id] || 0); });
    const total = goods.reduce(function (sum, id) { return sum + (st.items[id] || 0); }, 0);
    const field = [
      statHtml(S.icons.hoe, 'stats.tilled', st.tilled),
      statHtml(S.icons.seeds, 'stats.planted', st.planted),
      statHtml(S.icons.can, 'stats.watered', st.watered)
    ];
    if (s.up.clover || st.golden) field.push(statHtml(S.icons.clover, 'stats.golden', st.golden));
    if (s.up.flowers || st.pollinated) field.push(statHtml(S.icons.flower, 'stats.pollinated', st.pollinated));
    const fun = [];
    if (s.up.lanterns) fun.push(statHtml(S.icons.lantern, 'stats.fireflies', st.fireflies));
    if (s.up.scarecrow) fun.push(statHtml(S.shopIcons.scarecrow, 'stats.hats', st.hats));
    if (s.up.cat) {
      fun.push(statHtml(S.shopIcons.cat, 'stats.pets', st.pets));
      fun.push(statHtml(S.icons.gem, 'stats.gifts', st.gifts));
    }
    if (s.up.ducks) {
      fun.push(statHtml(S.shopIcons.ducks, 'stats.tosses', s.pond.throws));
      fun.push(statHtml(S.icons.star, 'stats.relics', s.relics.length + '/' + C.relics.length));
    }
    return '<div class="p-head"><span>' + t('stats') + '</span><button class="p-x" data-close>×</button></div>' +
      '<div class="p-list">' +
      statGroupHtml('stats.farm', t('level', { n: s.level }), farm) +
      statGroupHtml('stats.harvest', total, harvest) +
      statGroupHtml('stats.field', '', field) +
      (fun.length ? statGroupHtml('stats.fun', '', fun) : '') +
      '</div>';
  }

  function toggleHtml(key, on, action) {
    return '<div class="s-row"><span>' + t(key) + '</span><button class="btn' + (on ? ' green' : '') + '" data-set="' + action + '">' +
      t(on ? 'set.on' : 'set.off') + '</button></div>';
  }

  function settingsHtml() {
    const st = G.state.settings;
    const langs = Object.keys(MF.locales).map(function (code) {
      return '<button class="btn' + (MF.i18n.lang === code ? ' green' : '') + '" data-lang="' + code + '">' + MF.locales[code].langName + '</button>';
    }).join('');
    return '<div class="p-head"><span>' + t('settings') + '</span><button class="p-x" data-close>×</button></div>' +
      '<div class="p-list settings">' +
      toggleHtml('set.sound', st.sound, 'sound') +
      toggleHtml('set.music', st.music, 'music') +
      '<div class="s-row"><span>' + t('set.lang') + '</span><span class="s-group">' + langs + '</span></div>' +
      '<div class="s-note">' + t('set.resetNote') + '</div>' +
      '<div class="s-row"><span></span><button class="btn red" data-set="reset">' + t(resetArmed ? 'set.resetConfirm' : 'set.reset') + '</button></div>' +
      '</div>';
  }

  function renderModal() {
    if (!modalKind) return;
    const list = el.panel.querySelector('.p-list');
    const scroll = list ? list.scrollTop : 0;
    const before = cache.panel;
    const html = { shop: shopHtml, barn: barnHtml, hands: handsHtml, relics: relicsHtml, stats: statsHtml, settings: settingsHtml };
    setHtml('panel', el.panel, html[modalKind]());
    if (before !== cache.panel) {
      const fresh = el.panel.querySelector('.p-list');
      if (fresh) fresh.scrollTop = scroll;
    }
  }

  function openModal(kind) {
    placing = null;
    modalKind = kind;
    resetArmed = false;
    delete cache.panel;
    el.modal.classList.remove('hidden');
    el.tooltip.classList.add('hidden');
    MF.render.hover = null;
    if (kind === 'shop') G.shopOpened();
    MF.audio.unlock();
    MF.audio.play('click');
    renderModal();
  }

  function closeModal() {
    modalKind = null;
    el.modal.classList.add('hidden');
  }

  function startPlacing(index) {
    const zone = G.state.hands[index].zone;
    closeModal();
    placing = { index: index, shape: zone ? zone.shape : 0 };
    MF.audio.play('click');
    U.refresh();
  }

  function placeClick(e) {
    if (e.button === 2) {
      placing.shape = G.nextShape(placing.shape);
      MF.audio.play('click');
      return;
    }
    if (e.button !== 0) return;
    const zone = G.zoneAt(mouse.x, mouse.y, placing.shape);
    if (!zone || G.placeHand(placing.index, zone)) placing = null;
  }

  function onPanelClick(e) {
    const target = e.target.closest('button');
    if (!target) return;
    if (target.dataset.close !== undefined) {
      MF.audio.play('click');
      return closeModal();
    }
    if (target.dataset.buy) {
      const bought = G.buy(target.dataset.buy);
      cache.hotbar = null;
      if (bought && target.dataset.buy === 'hands') return startPlacing(G.state.hands.length - 1);
      return renderModal();
    }
    if (target.dataset.open) return openModal(target.dataset.open);
    if (target.dataset.place) return startPlacing(Number(target.dataset.place));
    if (target.dataset.pick) {
      G.setHandCrop(Number(target.dataset.hand), target.dataset.pick);
      return renderModal();
    }
    if (target.dataset.sell) {
      G.sell(target.dataset.sell, Number(target.dataset.n) || Infinity);
      return renderModal();
    }
    if (target.dataset.sellall !== undefined) {
      G.sellAll();
      return renderModal();
    }
    if (target.dataset.lang) {
      G.state.settings.lang = target.dataset.lang;
      MF.i18n.set(target.dataset.lang);
      G.save();
      U.rebuild();
      return renderModal();
    }
    const action = target.dataset.set;
    const st = G.state.settings;
    if (action === 'sound') st.sound = !st.sound;
    if (action === 'music') {
      st.music = !st.music;
      MF.audio.syncMusic();
    }
    if (action === 'reset') {
      if (!resetArmed) resetArmed = true;
      else {
        G.reset();
        MF.render.rebuild();
        closeModal();
        U.rebuild();
        return;
      }
    }
    MF.audio.play('click');
    G.save();
    renderModal();
  }

  function trackMouse(e) {
    const box = el.canvas.getBoundingClientRect();
    mouse.clientX = e.clientX;
    mouse.clientY = e.clientY;
    mouse.x = ((e.clientX - box.left) / box.width) * C.viewW;
    mouse.y = ((e.clientY - box.top) / box.height) * C.viewH;
    mouse.inside = true;
  }

  function clockText(time) {
    const phase = (time % C.dayLength) / C.dayLength;
    const minutes = Math.floor(((6 + phase * 24) % 24) * 6) * 10;
    return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  }

  function ripeText(plot) {
    if (!G.state.up.almanac) return '';
    const ripe = G.ripening(plot);
    const day = Math.floor(ripe.at / C.dayLength);
    const today = day === Math.floor(G.state.time / C.dayLength);
    const when = today ? clockText(ripe.at) : t('info.ripeDay', { n: day + 1, time: clockText(ripe.at) });
    return t('info.ripeAt', { time: when }) + (ripe.watered ? '' : ' ' + t('info.ifWatered'));
  }

  function tooltipHtml(p) {
    const s = G.state;
    if (!p) return '';
    if (p.type === 'well') return t('tip.well');
    if (p.type === 'barn') return t('tip.barn', { n: G.stockTotal(), max: G.barnCapacity() });
    if (p.type === 'egg') return t('tip.egg');
    if (p.type === 'house') return t('tip.house');
    if (p.type === 'firefly') return t('tip.firefly');
    if (p.type === 'hat') return t('tip.hat');
    if (p.type === 'cat') return t('tip.cat');
    if (p.type === 'gift') return t('tip.gift');
    if (p.type === 'hand') {
      return t('tip.hand', { name: t('crop.' + s.hands[p.index].crop) }) + '<br><small>' + t('tip.handHint') + '</small>';
    }
    if (p.type === 'relic') {
      const relic = C.relics.filter(function (item) { return item.id === p.id; })[0];
      return t('relic.' + p.id) + '<br><small>' + G.perkText(relic) + '</small>';
    }
    if (p.type === 'pond') {
      if (s.pond.find) return t('tip.pondBusy');
      const cost = G.throwCost();
      return t('tip.pond') + ' <span class="' + (s.coins < cost ? 'bad' : '') + '">' + ico('coin', 'tiny') + cost + '</span>' +
        (G.relicsLeft().length ? '<br><small>' + t('relics.chance', { pct: Math.round(G.relicChance() * 100) }) + '</small>' : '');
    }
    if (p.type === 'tree') return t(s.trees[p.index].apples ? 'tip.tree' : 'tip.treeEmpty');
    const plot = s.plots[p.index];
    if (p.action === 'till') return t('act.till');
    if (p.action === 'plant') {
      const crop = G.cropById[s.selected];
      const cost = G.seedCost(crop) * p.targets.length;
      return t('act.plant', { name: t('crop.' + crop.id) }) + ' <span class="' + (s.coins < G.seedCost(crop) ? 'bad' : '') + '">' +
        ico('coin', 'tiny') + cost + '</span>';
    }
    const name = t('crop.' + plot.crop);
    const pollen = plot.pollen ? '<br><small>' + t('info.pollen') + '</small>' : '';
    if (p.action === 'harvest') return t('act.harvest', { name: name }) + pollen;
    const pct = Math.floor((plot.growth / G.cropById[plot.crop].time) * 100);
    const info = t('info.growing', { name: name, pct: pct }) + (plot.pollen ? ' · ' + t('info.pollen') : '');
    const ripe = ripeText(plot);
    if (p.action === 'water') return t('act.water') + '<br><small>' + info + (ripe ? '<br>' + ripe : '') + '</small>';
    return info + (ripe ? '<br><small>' + ripe + '</small>' : '');
  }

  function refreshHover() {
    MF.render.placing = null;
    if (!mouse.inside || modalKind) {
      MF.render.hover = null;
      el.tooltip.classList.add('hidden');
      el.canvas.style.cursor = 'default';
      return;
    }
    if (placing) {
      const zone = G.zoneAt(mouse.x, mouse.y, placing.shape);
      MF.render.hover = null;
      MF.render.placing = { index: placing.index, zone: zone, ok: !!zone && G.zoneFree(zone, placing.index) };
      el.tooltip.classList.add('hidden');
      el.canvas.style.cursor = zone ? 'pointer' : 'default';
      return;
    }
    const p = G.probe(mouse.x, mouse.y);
    MF.render.hover = p;
    const html = tooltipHtml(p);
    el.canvas.style.cursor = p && (p.type !== 'plot' || p.action) && p.type !== 'house' && p.type !== 'relic' ? 'pointer' : 'default';
    if (!html) {
      el.tooltip.classList.add('hidden');
      return;
    }
    setHtml('tooltip', el.tooltip, html);
    el.tooltip.classList.remove('hidden');
    const x = Math.min(mouse.x * WORLD_SCALE + 16, C.viewW * WORLD_SCALE - el.tooltip.offsetWidth - 6);
    const y = Math.min(mouse.y * WORLD_SCALE + 18, C.viewH * WORLD_SCALE - el.tooltip.offsetHeight - 6);
    el.tooltip.style.left = x + 'px';
    el.tooltip.style.top = y + 'px';
  }

  function refreshStats() {
    const s = G.state;
    setText($('st-coins'), s.coins);
    const maxed = s.level >= G.maxLevel;
    setText($('st-level'), t(maxed ? 'levelMax' : 'level', { n: s.level }));
    $('st-xp').style.width = (maxed ? 100 : Math.round((s.xp / C.levelXp[s.level - 1]) * 100)) + '%';
    const cap = G.canCapacity();
    setText($('st-water'), s.up.sprinkler ? '∞' : s.water + '/' + cap);
    $('st-waterbar').style.width = (s.up.sprinkler ? 100 : Math.round((s.water / cap) * 100)) + '%';
    setText($('st-day'), t('day', { n: Math.floor(s.time / C.dayLength) + 1 }));
    setText($('st-clock'), clockText(s.time));
    const sky = S.url(MF.render.darkness() > 0.5 ? S.icons.moon : S.icons.sun);
    if (cache.sky !== sky) {
      cache.sky = sky;
      $('st-sky').src = sky;
    }
    $('shop-badge').classList.toggle('hidden', !G.canBuyAny());
    setText($('relics-count'), s.relics.length + '/' + C.relics.length);
    $('btn-barn').classList.toggle('hidden', !s.up.barn);
    $('btn-barn').classList.toggle('full', G.stockTotal() >= G.barnCapacity());
    setText($('barn-count'), G.stockTotal() + '/' + G.barnCapacity());
  }

  function refreshHint() {
    const key = placing ? 'hint.place' : G.hintKey();
    el.hint.classList.toggle('hidden', !key || !!modalKind);
    if (key) setHtml('hint', el.hint, t(key));
  }

  U.rebuild = function () {
    Object.keys(cache).forEach(function (key) { delete cache[key]; });
    document.title = t('title');
    buildSide();
    U.refresh();
  };

  U.refresh = function () {
    refreshStats();
    setHtml('hotbar', el.hotbar, hotbarHtml());
    setHtml('orders', $('orders'), ordersHtml());
    refreshHint();
    refreshHover();
    renderModal();
  };

  U.tick = function (dt) {
    refreshTimer += dt;
    if (refreshTimer < REFRESH) return;
    refreshTimer = 0;
    U.refresh();
  };

  U.open = openModal;

  U.float = function (x, y, text, kind) {
    const node = document.createElement('div');
    node.className = 'float ' + (kind || '');
    node.textContent = text;
    node.style.left = Math.max(40, Math.min(C.viewW * WORLD_SCALE - 40, x * WORLD_SCALE)) + 'px';
    node.style.top = Math.max(24, y * WORLD_SCALE) + 'px';
    el.floats.appendChild(node);
    node.addEventListener('animationend', function () { node.remove(); });
  };

  U.toast = function (html, icon) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = (icon ? ico(icon) : '') + '<span>' + html + '</span>';
    el.toasts.appendChild(node);
    setTimeout(function () { node.classList.add('out'); }, 4200);
    setTimeout(function () { node.remove(); }, 4800);
  };

  U.init = function () {
    ['stage', 'side', 'hotbar', 'hint', 'tooltip', 'floats', 'toasts', 'modal', 'panel'].forEach(function (id) { el[id] = $(id); });
    el.canvas = $('game');

    el.canvas.addEventListener('mousedown', function (e) {
      MF.audio.unlock();
      trackMouse(e);
      if (placing) {
        placeClick(e);
        return U.refresh();
      }
      if (e.button !== 0) return;
      mouse.down = true;
      stroke = new Set();
      G.command(G.probe(mouse.x, mouse.y), stroke, false, mouse.x, mouse.y);
      refreshHover();
    });
    el.canvas.addEventListener('mousemove', function (e) {
      trackMouse(e);
      if (mouse.down && !placing) G.command(G.probe(mouse.x, mouse.y), stroke, true, mouse.x, mouse.y);
      refreshHover();
    });
    el.canvas.addEventListener('mouseleave', function () {
      mouse.inside = false;
      refreshHover();
    });
    el.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('mouseup', function () { mouse.down = false; });
    window.addEventListener('blur', function () { mouse.down = false; });

    el.hotbar.addEventListener('click', function (e) {
      const slot = e.target.closest('[data-crop]');
      if (!slot) return;
      MF.audio.unlock();
      G.selectCrop(slot.dataset.crop);
      U.refresh();
    });
    el.modal.addEventListener('mousedown', function (e) {
      if (e.target === el.modal) closeModal();
    });
    el.panel.addEventListener('click', onPanelClick);
    window.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      placing = null;
      closeModal();
      U.refresh();
    });
    window.addEventListener('resize', layout);

    layout();
    U.rebuild();
  };
})();
