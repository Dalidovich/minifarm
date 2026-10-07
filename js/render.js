(function () {
  const C = MF.config;
  const S = MF.sprites;
  const APPLE_SPOTS = [[9, 15], [21, 10], [17, 22]];
  const RAIN_DROPS = 70;

  let ctx = null;
  let ground = null;
  let clock = 0;
  let particles = [];
  let drops = [];
  let backTrees = [];

  const R = (MF.render = { hover: null });

  function rect(g, color, x, y, w, h) {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  }

  function ellipse(g, color, cx, cy, rx, ry) {
    g.fillStyle = color;
    for (let dy = -ry; dy <= ry; dy++) {
      const half = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry + 1)));
      g.fillRect(cx - half, cy + dy, half * 2, 1);
    }
  }

  function flower(g, x, y, color) {
    rect(g, color, x - 1, y, 3, 1);
    rect(g, color, x, y - 1, 1, 3);
    rect(g, '#f7d04a', x, y, 1, 1);
  }

  function onPath(x, y) {
    return (y >= 186 && y <= 206) || (x >= 33 && x <= 52 && y >= 76 && y <= 192);
  }

  function inField(x, y) {
    const f = C.field;
    return x >= f.x - 6 && x <= f.x + f.cols * C.tile + 6 && y >= f.y - 6 && y <= f.y + f.rows * C.tile + 6;
  }

  function inPond(x, y) {
    return x < 76 && y > 204;
  }

  function drawPath(g, rnd) {
    for (let x = 0; x < C.viewW; x++) {
      const top = 190 + Math.round(Math.sin(x * 0.11) * 1.2);
      rect(g, '#c9a96e', x, top - 1, 1, 14);
      rect(g, '#dcbf85', x, top, 1, 12);
    }
    for (let y = 78; y < 192; y++) {
      const left = 37 + Math.round(Math.sin(y * 0.17) * 1.2);
      rect(g, '#c9a96e', left - 1, y, 13, 1);
      rect(g, '#dcbf85', left, y, 11, 1);
    }
    for (let i = 0; i < 260; i++) {
      const horizontal = rnd() < 0.75;
      const x = horizontal ? Math.floor(rnd() * C.viewW) : 38 + Math.floor(rnd() * 9);
      const y = horizontal ? 192 + Math.floor(rnd() * 9) : 80 + Math.floor(rnd() * 110);
      rect(g, rnd() < 0.5 ? '#cdb078' : '#ead3a0', x, y, rnd() < 0.3 ? 2 : 1, 1);
    }
  }

  function drawPond(g) {
    ellipse(g, '#5e9c46', 40, 230, 33, 20);
    ellipse(g, '#3f8fc4', 40, 230, 31, 18);
    ellipse(g, '#5bb4e5', 40, 229, 30, 17);
    ellipse(g, '#7cc8ee', 34, 225, 16, 7);
    ellipse(g, '#4f9a3f', 56, 236, 4, 2);
    rect(g, '#f29bb5', 56, 235, 1, 1);
    ellipse(g, '#4f9a3f', 24, 238, 3, 2);
  }

  function drawFieldFrame(g) {
    const size = MF.game.fieldSize();
    const w = size[0] * C.tile;
    const h = size[1] * C.tile;
    rect(g, 'rgba(40,60,30,0.25)', C.field.x - 2, C.field.y + h + 3, w + 4, 2);
    rect(g, '#3b2a22', C.field.x - 4, C.field.y - 4, w + 8, h + 8);
    rect(g, '#a8703a', C.field.x - 3, C.field.y - 3, w + 6, h + 6);
    rect(g, '#c8914f', C.field.x - 3, C.field.y - 3, w + 6, 1);
    rect(g, '#7d4e24', C.field.x - 3, C.field.y + h + 2, w + 6, 1);
    rect(g, '#3b2a22', C.field.x - 1, C.field.y - 1, w + 2, h + 2);
  }

  function drawPenGround(g, rnd) {
    const p = C.pen;
    rect(g, '#d2bd86', p.x + 3, p.y + 6, p.w - 6, p.h - 6);
    rect(g, '#d2bd86', p.x + 5, p.y + 4, p.w - 10, p.h - 2);
    for (let i = 0; i < 90; i++) {
      rect(g, rnd() < 0.5 ? '#c2ab74' : '#e2cf9c', p.x + 5 + Math.floor(rnd() * (p.w - 11)), p.y + 7 + Math.floor(rnd() * (p.h - 9)), 1, 1);
    }
  }

  function drawFlowerBeds(g, rnd) {
    const colors = ['#f29bb5', '#fff7e6', '#8a5fb5', '#f08a2c', '#d9483b'];
    const put = function (x, y) {
      rect(g, '#4f9a3f', x, y + 1, 1, 2);
      flower(g, x, y, colors[Math.floor(rnd() * colors.length)]);
    };
    for (let x = 14; x < 34; x += 4) put(x, 82 + Math.floor(rnd() * 3));
    for (let x = 54; x < 72; x += 4) put(x, 82 + Math.floor(rnd() * 3));
    for (let y = 94; y < 184; y += 7) {
      put(32 + Math.floor(rnd() * 2), y);
      put(53 + Math.floor(rnd() * 2), y + 3);
    }
    for (let x = 62; x < 372; x += 9) {
      if (x > 100 && x < 250) continue;
      put(x, 184 + Math.floor(rnd() * 2));
    }
    for (let x = 4; x < 376; x += 11) {
      if (x > 76 && x < 304) continue;
      put(x, 208 + Math.floor(rnd() * 2));
    }
  }

  R.rebuild = function () {
    const s = MF.game.state;
    const rnd = S.rng(7);
    ground = S.canvas(C.viewW, C.viewH);
    const g = ground.getContext('2d');
    rect(g, '#84c95c', 0, 0, C.viewW, C.viewH);
    for (let i = 0; i < 1500; i++) {
      rect(g, rnd() < 0.5 ? '#78bd52' : '#93d46a', Math.floor(rnd() * C.viewW), Math.floor(rnd() * C.viewH), rnd() < 0.3 ? 2 : 1, 1);
    }
    for (let i = 0; i < 110; i++) {
      const x = Math.floor(rnd() * C.viewW);
      const y = Math.floor(rnd() * C.viewH);
      rect(g, '#62a747', x, y, 1, 2);
      rect(g, '#62a747', x + 2, y + 1, 1, 1);
    }
    drawPath(g, rnd);
    drawPond(g);
    const wild = ['#fff7e6', '#f29bb5', '#f7d04a', '#8a5fb5'];
    for (let i = 0; i < 46; i++) {
      const x = 4 + Math.floor(rnd() * (C.viewW - 8));
      const y = 34 + Math.floor(rnd() * (C.viewH - 40));
      const color = wild[Math.floor(rnd() * wild.length)];
      if (onPath(x, y) || inField(x, y) || inPond(x, y)) continue;
      flower(g, x, y, color);
    }
    for (let i = 0; i < 9; i++) {
      const x = 6 + Math.floor(rnd() * (C.viewW - 12));
      const y = 40 + Math.floor(rnd() * (C.viewH - 50));
      if (onPath(x, y) || inField(x, y) || inPond(x, y)) continue;
      rect(g, '#3b2a22', x - 1, y, 5, 3);
      rect(g, '#9aa5ad', x, y, 3, 2);
      rect(g, '#c3ccd2', x, y, 2, 1);
    }
    if (s.up.coop > 0) drawPenGround(g, rnd);
    if (s.up.flowers > 0) drawFlowerBeds(g, rnd);
    drawFieldFrame(g);
  };

  R.init = function (canvasEl) {
    ctx = canvasEl.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const rnd = S.rng(11);
    backTrees = [];
    for (let x = -10; x < C.viewW + 10; x += 28 + Math.floor(rnd() * 10)) {
      backTrees.push({ x: x, y: 22 + Math.floor(rnd() * 8), v: rnd() < 0.5 ? 0 : 1 });
    }
    backTrees.push({ x: 2, y: 152, v: 0 }, { x: 370, y: 248, v: 1 }, { x: 340, y: 266, v: 0 });
    drops = [];
    for (let i = 0; i < RAIN_DROPS; i++) drops.push({ x: Math.random() * (C.viewW + 60), y: Math.random() * C.viewH });
    R.rebuild();
  };

  R.burst = function (x, y, colors, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 40,
        vy: -20 - Math.random() * 40,
        life: 0.35 + Math.random() * 0.35,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  };

  function shadow(x, y, w) {
    rect(ctx, 'rgba(40,60,30,0.25)', Math.round(x - w / 2), y - 1, w, 2);
    rect(ctx, 'rgba(40,60,30,0.25)', Math.round(x - w / 2) + 1, y + 1, w - 2, 1);
  }

  function stageOf(plot) {
    const ratio = plot.growth / MF.game.cropById[plot.crop].time;
    if (ratio >= 1) return 3;
    if (ratio >= 0.45) return 2;
    if (ratio >= 0.12) return 1;
    return 0;
  }

  function drawPlots(s) {
    const size = MF.game.fieldSize();
    for (let row = 0; row < size[1]; row++) {
      for (let col = 0; col < size[0]; col++) {
        const plot = s.plots[row * C.field.cols + col];
        const tile = plot.kind === 'grass' ? S.tiles.grass : plot.wet > 0 ? S.tiles.wet : S.tiles.soil;
        ctx.drawImage(tile, C.field.x + col * C.tile, C.field.y + row * C.tile);
      }
    }
  }

  function drawHover() {
    const h = R.hover;
    if (!h || h.type !== 'plot') return;
    ctx.fillStyle = h.action ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)';
    h.targets.forEach(function (i) { corners(MF.game.plotPos(i)); });
  }

  function corners(p) {
    ctx.fillRect(p.x, p.y, 5, 1);
    ctx.fillRect(p.x, p.y, 1, 5);
    ctx.fillRect(p.x + 10, p.y, 5, 1);
    ctx.fillRect(p.x + 14, p.y, 1, 5);
    ctx.fillRect(p.x, p.y + 14, 5, 1);
    ctx.fillRect(p.x, p.y + 10, 1, 5);
    ctx.fillRect(p.x + 10, p.y + 14, 5, 1);
    ctx.fillRect(p.x + 14, p.y + 10, 1, 5);
  }

  function drawQueue() {
    ctx.fillStyle = Math.sin(clock * 8) > 0 ? '#f7d04a' : '#fff7e6';
    MF.game.queue.forEach(function (task) {
      if (task.type === 'plot') corners(MF.game.plotPos(task.index));
      if (task.type === 'go') {
        ctx.fillRect(Math.round(task.x) - 2, Math.round(task.y), 5, 1);
        ctx.fillRect(Math.round(task.x), Math.round(task.y) - 1, 1, 3);
      }
    });
  }

  function farmerSprite(f) {
    const set = S.farmer[f.dir];
    if (f.state === 'walk') return set.walk[Math.floor(f.step) % 4];
    if (f.state === 'act' && f.tool && set.act) return set.act[f.tool][f.hit ? 1 : 0];
    if (f.state === 'idle' && set.idle[2] && f.idleT % 3.2 > 3.05) return set.idle[2];
    return set.idle[f.state === 'idle' ? Math.floor(f.idleT / 0.6) % 2 : 0];
  }

  function farmerItem(items) {
    const f = MF.game.farmer;
    items.push({
      y: f.y,
      draw: function () {
        const hop = f.state === 'act' && !f.tool && !f.hit ? -2 : 0;
        shadow(f.x, Math.round(f.y), 10);
        ctx.drawImage(farmerSprite(f), Math.round(f.x) - S.farmer[f.dir].anchorX, Math.round(f.y) - S.farmerAnchorY + hop);
      }
    });
  }

  function cropItems(s, items) {
    const size = MF.game.fieldSize();
    for (let row = 0; row < size[1]; row++) {
      for (let col = 0; col < size[0]; col++) {
        const i = row * C.field.cols + col;
        const plot = s.plots[i];
        if (plot.kind !== 'crop') continue;
        const x = C.field.x + col * C.tile;
        const y = C.field.y + row * C.tile;
        items.push({
          y: y + 14,
          draw: function () {
            const stage = stageOf(plot);
            const sway = stage === 3 && Math.sin(clock * 3 + i * 1.7) > 0.7 ? -1 : 0;
            ctx.drawImage(S.plants[plot.crop][stage], x - 1, y - 8 + sway);
            if (stage < 3 && plot.wet <= 0 && Math.sin(clock * 5) > -0.4) {
              ctx.drawImage(S.miniDrop, x + 10, y - 3 + Math.round(Math.sin(clock * 4 + i)));
            }
            if (stage === 3 && Math.random() < 0.01) R.burst(x + 8, y + 2, ['#fff7e6', '#f7d04a'], 1);
          }
        });
      }
    }
  }

  function fenceRow(x, y, w) {
    rect(ctx, '#3b2a22', x, y + 2, w, 3);
    rect(ctx, '#c8914f', x, y + 2, w, 1);
    rect(ctx, '#a8703a', x, y + 3, w, 1);
    for (let px = x; px <= x + w - 3; px += 11) {
      rect(ctx, '#3b2a22', px - 1, y - 1, 5, 9);
      rect(ctx, '#c8914f', px, y, 3, 7);
      rect(ctx, '#a8703a', px + 2, y, 1, 7);
    }
  }

  function fenceColumn(x, y, h) {
    rect(ctx, '#3b2a22', x - 1, y, 4, h);
    rect(ctx, '#c8914f', x, y, 2, h);
    rect(ctx, '#a8703a', x + 1, y, 1, h);
  }

  function penItems(s, items) {
    const p = C.pen;
    items.push({ y: p.y + 6, draw: function () { fenceRow(p.x, p.y, p.w); } });
    items.push({
      y: p.y + 14,
      draw: function () {
        shadow(p.x + 21, p.y + 14, 26);
        ctx.drawImage(S.coop, p.x + 4, p.y - 18);
      }
    });
    items.push({
      y: p.y + p.h + 6,
      draw: function () {
        fenceColumn(p.x, p.y + 6, p.h - 2);
        fenceColumn(p.x + p.w - 2, p.y + 6, p.h - 2);
        fenceRow(p.x, p.y + p.h, C.penGate.x - p.x);
        fenceRow(C.penGate.x + C.penGate.w, p.y + p.h, p.x + p.w - C.penGate.x - C.penGate.w);
      }
    });
    MF.game.chickens.forEach(function (ch) {
      items.push({
        y: ch.y,
        draw: function () {
          const set = S.chickens[ch.look][ch.left ? 'left' : 'right'];
          const frame = ch.moving ? Math.floor(ch.step) % 2 : 0;
          shadow(ch.x, Math.round(ch.y), 8);
          ctx.drawImage(set[frame], Math.round(ch.x) - 5, Math.round(ch.y) - 9);
        }
      });
    });
    s.eggs.forEach(function (egg) {
      items.push({
        y: egg.y - 1,
        draw: function () { ctx.drawImage(S.egg, egg.x - 3, egg.y - 6); }
      });
    });
  }

  function treeItems(s, items) {
    backTrees.forEach(function (t) {
      items.push({
        y: t.y,
        draw: function () {
          shadow(t.x + 17, t.y, 20);
          ctx.drawImage(S.trees[t.v], t.x, t.y - 41);
        }
      });
    });
    s.trees.forEach(function (tree, i) {
      const spot = C.treeSpots[i];
      items.push({
        y: spot[1],
        draw: function () {
          shadow(spot[0], spot[1], 20);
          ctx.drawImage(S.appleTree, spot[0] - 17, spot[1] - 41);
          for (let a = 0; a < tree.apples; a++) {
            const ax = spot[0] - 17 + APPLE_SPOTS[a][0];
            const ay = spot[1] - 41 + APPLE_SPOTS[a][1];
            rect(ctx, '#3b2a22', ax - 1, ay, 5, 3);
            rect(ctx, '#3b2a22', ax, ay - 1, 3, 5);
            rect(ctx, '#d9483b', ax, ay, 3, 3);
            rect(ctx, '#fff7e6', ax, ay, 1, 1);
          }
        }
      });
    });
  }

  function staticItems(s, items) {
    items.push({
      y: C.house.y + C.house.h,
      draw: function () {
        shadow(C.house.x + 25, C.house.y + C.house.h - 1, 44);
        ctx.drawImage(S.house[s.up.house], C.house.x, C.house.y);
      }
    });
    items.push({
      y: C.well.y + C.well.h,
      draw: function () {
        shadow(C.well.x + 12, C.well.y + C.well.h - 1, 22);
        ctx.drawImage(S.well, C.well.x, C.well.y);
      }
    });
    if (s.up.scarecrow) {
      items.push({
        y: C.scarecrow.y + 30,
        draw: function () {
          shadow(C.scarecrow.x + 9, C.scarecrow.y + 29, 10);
          ctx.drawImage(S.scarecrow, C.scarecrow.x, C.scarecrow.y);
        }
      });
    }
    if (s.up.lanterns) {
      C.lanternSpots.forEach(function (spot) {
        items.push({ y: spot[1] + 22, draw: function () { ctx.drawImage(S.lantern, spot[0], spot[1]); } });
      });
    }
    const cat = MF.game.cat;
    if (cat) {
      items.push({
        y: cat.y,
        draw: function () {
          const set = S.cat[cat.left ? 'left' : 'right'];
          shadow(cat.x, Math.round(cat.y), 10);
          ctx.drawImage(set[cat.moving ? Math.floor(cat.step) % 2 : 0], Math.round(cat.x) - 6, Math.round(cat.y) - 9);
        }
      });
    }
  }

  function drawPondSparkles() {
    const phase = Math.floor(clock * 2);
    [[26, 222], [44, 232], [34, 240], [54, 226], [18, 230]].forEach(function (p, i) {
      if ((phase + i) % 3 === 0) rect(ctx, '#e8f7ff', p[0], p[1], 3, 1);
    });
  }

  function drawParticles(dt) {
    particles = particles.filter(function (p) { return p.life > 0; });
    particles.forEach(function (p) {
      p.life -= dt;
      p.vy += 160 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      rect(ctx, p.color, Math.round(p.x), Math.round(p.y), p.life > 0.2 ? 2 : 1, p.life > 0.2 ? 2 : 1);
    });
  }

  function drawSprinklerMist(s) {
    if (!s.up.sprinkler) return;
    const size = MF.game.fieldSize();
    if (Math.random() < 0.5) {
      R.burst(C.field.x + Math.random() * size[0] * C.tile, C.field.y + Math.random() * size[1] * C.tile, ['#c9ecfb', '#8fd3f4'], 1);
    }
  }

  function drawRain(s, dt) {
    if (s.rain <= 0) return;
    rect(ctx, 'rgba(70,90,125,0.2)', 0, 0, C.viewW, C.viewH);
    ctx.fillStyle = 'rgba(200,232,250,0.75)';
    drops.forEach(function (d) {
      d.y += 240 * dt;
      d.x -= 50 * dt;
      if (d.y > C.viewH) {
        d.y = -4;
        d.x = Math.random() * (C.viewW + 60);
      }
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 3);
    });
  }

  R.darkness = function () {
    const phase = (MF.game.state.time % C.dayLength) / C.dayLength;
    if (phase < 0.62) return 0;
    if (phase < 0.72) return (phase - 0.62) / 0.1;
    if (phase < 0.92) return 1;
    return 1 - (phase - 0.92) / 0.08;
  };

  function drawNight(s) {
    const dark = R.darkness();
    if (dark <= 0) return;
    const dusk = 1 - Math.abs(dark - 0.5) * 2;
    if (dusk > 0) rect(ctx, 'rgba(255,140,70,' + (0.16 * dusk).toFixed(3) + ')', 0, 0, C.viewW, C.viewH);
    rect(ctx, 'rgba(22,26,74,' + (0.52 * dark).toFixed(3) + ')', 0, 0, C.viewW, C.viewH);
    if (dark < 0.4) return;
    const lights = [];
    S.houseWindows[s.up.house].forEach(function (w) {
      rect(ctx, '#ffe08a', C.house.x + w[0], C.house.y + w[1], w[2], w[3]);
      rect(ctx, '#3b2a22', C.house.x + w[0] + 3, C.house.y + w[1], 1, w[3]);
      rect(ctx, '#3b2a22', C.house.x + w[0], C.house.y + w[1] + 3, w[2], 1);
      lights.push([C.house.x + w[0] + 3, C.house.y + w[1] + 3]);
    });
    if (s.up.lanterns) {
      C.lanternSpots.forEach(function (spot) {
        rect(ctx, '#fff3c4', spot[0] + 2, spot[1] + 2, 4, 5);
        lights.push([spot[0] + 4, spot[1] + 4]);
      });
    }
    ctx.globalCompositeOperation = 'lighter';
    lights.forEach(function (l) { ctx.drawImage(S.glow, l[0] - 24, l[1] - 24); });
    ctx.globalCompositeOperation = 'source-over';
  }

  R.draw = function (dt) {
    const s = MF.game.state;
    clock += dt;
    ctx.drawImage(ground, 0, 0);
    drawPondSparkles();
    drawPlots(s);
    drawQueue();
    drawHover();
    const items = [];
    staticItems(s, items);
    treeItems(s, items);
    if (s.up.coop > 0) penItems(s, items);
    cropItems(s, items);
    farmerItem(items);
    items.sort(function (a, b) { return a.y - b.y; });
    items.forEach(function (item) { item.draw(); });
    drawSprinklerMist(s);
    drawParticles(dt);
    drawRain(s, dt);
    drawNight(s);
  };
})();
