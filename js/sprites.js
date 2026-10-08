(function () {
  const PAL = {
    k: '#3b2a22', w: '#fff7e6', W: '#d9cdb8',
    g: '#4f9a3f', G: '#6dbf4b', l: '#a4de6a',
    r: '#d9483b', R: '#a32d2d',
    o: '#f08a2c', O: '#c4631a',
    y: '#f7d04a', Y: '#d6a021',
    b: '#a8703a', B: '#7d4e24', n: '#d9a066',
    p: '#f29bb5', P: '#c0577f',
    u: '#8a5fb5', U: '#5e3d8a',
    c: '#5bb4e5', C: '#3f7fc4',
    s: '#9aa5ad', S: '#6b757d'
  };
  const OUTLINE = '#3b2a22';
  const LEAF_OUTLINE = '#2f5a2c';

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function grid(rows, opts) {
    const o = opts || {};
    const w = o.w || Math.max.apply(null, rows.map(function (r) { return r.length; }));
    const h = o.h || rows.length;
    const ox = o.ox || 0;
    const oy = o.bottom !== undefined ? h - o.bottom - rows.length : (o.oy || 0);
    const pal = o.pal ? Object.assign({}, PAL, o.pal) : PAL;
    const c = canvas(w, h);
    const g = c.getContext('2d');
    rows.forEach(function (row, y) {
      for (let x = 0; x < row.length; x++) {
        const color = pal[row[x]];
        if (color) {
          g.fillStyle = color;
          g.fillRect(x + ox, y + oy, 1, 1);
        }
      }
    });
    return c;
  }

  function paint(w, h, fn) {
    const c = canvas(w, h);
    const g = c.getContext('2d');
    const rect = function (color, x, y, rw, rh) {
      g.fillStyle = color;
      g.fillRect(x, y, rw, rh);
    };
    fn(rect, g);
    return c;
  }

  function disc(rect, color, cx, cy, r) {
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r + r - dy * dy));
      rect(color, cx - half, cy + dy, half * 2 + 1, 1);
    }
  }

  function outline(src, color) {
    const w = src.width;
    const h = src.height;
    const out = canvas(w, h);
    const g = out.getContext('2d');
    const d = src.getContext('2d').getImageData(0, 0, w, h).data;
    const solid = function (x, y) {
      return x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
    };
    g.fillStyle = color || OUTLINE;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) {
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    g.drawImage(src, 0, 0);
    return out;
  }

  function flip(src) {
    const c = canvas(src.width, src.height);
    const g = c.getContext('2d');
    g.translate(src.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }

  const urls = new Map();
  function url(c) {
    if (!urls.has(c)) urls.set(c, c.toDataURL());
    return urls.get(c);
  }

  const ICONS = {
    radish: [
      '.......gG...',
      '......gGl...',
      '...g..Gl....',
      '...Gg.G.....',
      '....GGG.....',
      '...krrrk....',
      '..krprrrk...',
      '..krrrrRk...',
      '..krrrrRk...',
      '...krrRk....',
      '....kRk.....',
      '.....k......'
    ],
    carrot: [
      '....g..g....',
      '.....gGg....',
      '....gGlG....',
      '.....GG.....',
      '....kook....',
      '...koooOk...',
      '...koyoOk...',
      '....kooOk...',
      '....koOk....',
      '.....kOk....',
      '.....kOk....',
      '......k.....'
    ],
    potato: [
      '............',
      '............',
      '....kkkk....',
      '..kknnnnkk..',
      '.knnnnnnnbk.',
      '.knnBnnnnbk.',
      'knnnnnnBnnbk',
      'knnnnnnnnbbk',
      '.knBnnnnbbk.',
      '..kknbbbkk..',
      '....kkkk....',
      '............'
    ],
    tomato: [
      '............',
      '.....gg.....',
      '...kkgGkk...',
      '..krrGgrrk..',
      '.krrwrrrrrk.',
      '.krwrrrrrRk.',
      '.krrrrrrrRk.',
      '.krrrrrrrRk.',
      '.krrrrrrRRk.',
      '..krrrRRRk..',
      '...kkkkkk...',
      '............'
    ],
    corn: [
      '.....kk.....',
      '....kyyk....',
      '....kyYk....',
      '...kyyyyk...',
      '...kyYyYk...',
      '...kyyyyk...',
      '..gkyYyYkg..',
      '..GgyyyygG..',
      '..GGgyygGG..',
      '...GGggGG...',
      '....GGGG....',
      '.....gg.....'
    ],
    pumpkin: [
      '............',
      '.....gg.....',
      '......g.....',
      '..kkkkgkkk..',
      '.koooOoooOk.',
      'kooyoOooOoOk',
      'koooOoooOoOk',
      'koooOoooOoOk',
      'koooOoooOoOk',
      '.kooOoooOOk.',
      '..kkkkkkkk..',
      '............'
    ],
    strawberry: [
      '............',
      '....g.gg....',
      '...gGGGGg...',
      '..krGrGrrk..',
      '.krrrrryrrk.',
      '.kryrrrrrRk.',
      '.krrrryrrRk.',
      '..krrrrrRk..',
      '..kryrrRRk..',
      '...krrRRk...',
      '....krRk....',
      '.....kk.....'
    ],
    sunflower: [
      '....yyyy....',
      '..yyYyyYyy..',
      '.yyykkkkyyy.',
      '.yYkBbBbkYy.',
      'yykbBbBbBkyy',
      'yykBbBbBbkyy',
      'yykbBbBbBkyy',
      '.yYkBbBbkYy.',
      '.yyykkkkyyy.',
      '..yyYyyYyy..',
      '....yyyy....',
      '............'
    ],
    egg: [
      '............',
      '....kkkk....',
      '...kwwwwk...',
      '..kwwwwwWk..',
      '..kwwwwwWk..',
      '.kwwwwwwWWk.',
      '.kwwwwwwWWk.',
      '.kwwwwwWWWk.',
      '..kwwwWWWk..',
      '...kkkkkk...',
      '............',
      '............'
    ],
    apple: [
      '............',
      '......B.....',
      '.....Bgg....',
      '..kkkBkGk...',
      '.krrrkrrrk..',
      'krrwrrrrrRk.',
      'krwrrrrrrRk.',
      'krrrrrrrrRk.',
      'krrrrrrrRRk.',
      '.krrrrrRRk..',
      '..kkkkkkk...',
      '............'
    ],
    coin: [
      '....kkkk....',
      '..kkyyyykk..',
      '.kyyyyyyyYk.',
      '.kyyYYyyyYk.',
      'kyyYyyyyyyYk',
      'kyyYyyyyyyYk',
      'kyyYyyyyyyYk',
      'kyyYyyyyyyYk',
      '.kyyYYyyyYk.',
      '.kyyyyyyYYk.',
      '..kkYYYYkk..',
      '....kkkk....'
    ],
    drop: [
      '.....kk.....',
      '.....kck....',
      '....kcck....',
      '....kccCk...',
      '...kcwccCk..',
      '...kcwccCk..',
      '..kcwcccCCk.',
      '..kcccccCCk.',
      '..kcccccCCk.',
      '...kccCCCk..',
      '....kkkkk...',
      '............'
    ],
    star: [
      '.....kk.....',
      '....kyyk....',
      '....kyyk....',
      'kkkkyyyykkkk',
      'kyyyyyyyyyYk',
      '.kyyyyyyyYk.',
      '..kyyyyyYk..',
      '..kyyyyyYk..',
      '.kyyyYYyyYk.',
      '.kyyYkkYyYk.',
      'kyYkk..kkYYk',
      'kkk......kkk'
    ],
    sun: [
      '.....y......',
      '.y...y...y..',
      '..y.....y...',
      '....yyyy....',
      '...yyyyyy...',
      'yy.yyyyyy.yy',
      '...yyyyyy...',
      '....yyyy....',
      '..y.....y...',
      '.y...y...y..',
      '.....y......',
      '............'
    ],
    moon: [
      '............',
      '....kkkk....',
      '...kwwkk....',
      '..kwwk......',
      '.kwwwk......',
      '.kwwwk......',
      '.kwwwwk.....',
      '.kwwwwwkkkk.',
      '..kwwwwwwk..',
      '...kkwwkk...',
      '.....kk.....',
      '............'
    ],
    can: [
      '............',
      '......kkk...',
      '.k...k...k..',
      'kck.kkkkkkk.',
      '.kckkcccccCk',
      '..kkcwccccCk',
      '...kcwccccCk',
      '...kccccccCk',
      '...kccccccCk',
      '...kcccccCCk',
      '....kkkkkkk.',
      '............'
    ],
    hoe: [
      '........kkk.',
      '.......kssSk',
      '......kbksSk',
      '.....kbk.kSk',
      '....kbk...k.',
      '...kbk......',
      '..kbk.......',
      '.kbk........',
      'kbk.........',
      'kk..........',
      '............',
      '............'
    ],
    shovel: [
      '.........kkk',
      '........kbbk',
      '.......kbkk.',
      '......kbk...',
      '.....kbk....',
      '....kbk.....',
      '.kkkbk......',
      'kssskk......',
      'ksssSk......',
      'kssSSk......',
      '.kSSk.......',
      '..kk........'
    ],
    bag: [
      '............',
      '...kk..kk...',
      '..knnkknnk..',
      '...knnnnk...',
      '..knnnnnnk..',
      '.knnnGGnnnk.',
      '.knnGGlGnnk.',
      '.knnGlGGnnk.',
      '.knnnGGnnbk.',
      '.knnnnnnbbk.',
      '..kkkkkkkk..',
      '............'
    ],
    sprinkler: [
      '.c...c..c...',
      '..c..c.c....',
      'c..c.c.c..c.',
      '.c..ccc..c..',
      '....kSk.....',
      '...kssSk....',
      '....kSk.....',
      '....kSk.....',
      '....kSk.....',
      '...kkSkk....',
      '..kSSSSSk...',
      '..kkkkkkk...'
    ],
    house: [
      '.....kk.....',
      '....krrk.kk.',
      '...krrrrkbk.',
      '..krrrrrrkk.',
      '.krrrrrrrrk.',
      'krrrrrrrrrrk',
      'kkwwwwwwwwkk',
      '.kwwwkkwcwk.',
      '.kwwwkbwcwk.',
      '.kwwwkbwwwk.',
      '.kkkkkkkkkk.',
      '............'
    ],
    flower: [
      '............',
      '....pp.pp...',
      '...pPPpPPp..',
      '...pPyyyPp..',
      '....pyyyp...',
      '...pPyyyPp..',
      '...pPPpPPp..',
      '....pp.pp...',
      '.....Gg.....',
      '...GlGg.G...',
      '....GGgGg...',
      '.....Gg.....'
    ],
    boot: [
      '............',
      '...kkkkk....',
      '...kbbbk....',
      '...kbbbk....',
      '...kbbbk....',
      '...kbbbk....',
      '...kbbbkkk..',
      '..kbbbbbbbk.',
      '..kbbbbbbBk.',
      '..kBBBBBBBk.',
      '..kkkkkkkkk.',
      '............'
    ],
    lantern: [
      '....kkkk....',
      '...kSSSSk...',
      '..kkkkkkkk..',
      '..kyyyyyyk..',
      '..kyywwyyk..',
      '..kyywwyyk..',
      '..kyyyyyyk..',
      '..kkkkkkkk..',
      '.....kk.....',
      '.....kk.....',
      '.....kk.....',
      '....kkkk....'
    ],
    gem: [
      '............',
      '............',
      '...kkkkkk...',
      '..kwccccCk..',
      '.kwcccccCCk.',
      '.kccccccCCk.',
      '..kccccCCk..',
      '...kccCCk...',
      '....kcCk....',
      '.....kk.....',
      '............',
      '............'
    ],
    clover: [
      '..kkk..kkk..',
      '.kGGGkkGGGk.',
      'kGlGGGGGlGGk',
      'kGGGGggGGGGk',
      '.kGGGggGGGk.',
      '.kGGGggGGGk.',
      'kGGGGggGGGGk',
      'kGlGGGGGGGgk',
      '.kGGGkkGGgk.',
      '..kkkgkkkk..',
      '....kgk.....',
      '....kk......'
    ],
    seeds: [
      '............',
      '..kkkkkkkk..',
      '..kwwwwwwk..',
      '..kkkkkkkk..',
      '..kwwwwwwk..',
      '..kwwGGwwk..',
      '..kwGggGwk..',
      '..kwwggwwk..',
      '..kwwwgwwk..',
      '..kwwwwwwk..',
      '..kkkkkkkk..',
      '............'
    ],
    market: [
      '............',
      '.kkkkkkkkkk.',
      'krrwwrrwwrrk',
      'krrwwrrwwrrk',
      '.kkkkkkkkkk.',
      '..k......k..',
      '..k.r.oy.k..',
      '.kkkkkkkkkk.',
      '.kbbbbbbbbk.',
      '.kbBBBBBBbk.',
      '.kkkkkkkkkk.',
      '............'
    ],
    sign: [
      '............',
      '.kkkkkkkkkk.',
      '.knnnnnnnnk.',
      '.knnnyynnnk.',
      '.knnyyyynnk.',
      '.knnnyynnnk.',
      '.knnnnnnnnk.',
      '.kkkkkkkkkk.',
      '.....kk.....',
      '.....kk.....',
      '.....kk.....',
      '....kkkk....'
    ],
    feed: [
      '............',
      '............',
      '....y..y....',
      '..y..yy..y..',
      '.kkkkkkkkkk.',
      '.kyyYyyyYyk.',
      '.kkkkkkkkkk.',
      '..kbbbbbbk..',
      '..kbbbbbBk..',
      '...kBBBBk...',
      '....kkkk....',
      '............'
    ],
    shears: [
      '..k......k..',
      '..kk....kk..',
      '..ksk..ksk..',
      '...kskksk...',
      '....kssk....',
      '.....kk.....',
      '....krrk....',
      '...krkkrk...',
      '..krk..krk..',
      '..krk..krk..',
      '...kk..kk...',
      '............'
    ],
    hammock: [
      '............',
      '............',
      '.k........k.',
      '.krr....rrk.',
      '.kwwrrrrwwk.',
      '.k..wwww..k.',
      '.k........k.',
      '.k........k.',
      '.k........k.',
      'kkk......kkk',
      '............',
      '............'
    ],
    almanac: [
      '............',
      '..kkkkkkkk..',
      '.kRrrrrrrrk.',
      '.kRryyyyrrk.',
      '.kRryrryrrk.',
      '.kRryyyyrrk.',
      '.kRrrrrrrrk.',
      '.kRrrrrrrrk.',
      '.kRkkkkkkkk.',
      '.kwwwwwwwwk.',
      '..kkkkkkkk..',
      '............'
    ],
    crate: [
      '............',
      '.kkkkkkkkkk.',
      '.knnnnnnnnk.',
      '.kkkkkkkkkk.',
      '.kbnbBBbnbk.',
      '.kbbnBBnbbk.',
      '.kbBBnnBBbk.',
      '.kbBBnnBBbk.',
      '.kbbnBBnbbk.',
      '.kbnbBBbnbk.',
      '.kkkkkkkkkk.',
      '............'
    ],
    insider: [
      '............',
      '............',
      '.kkkkkkkkkk.',
      '.kkwwwwwwkk.',
      '.kwkwwwwkwk.',
      '.kwwkrrkwwk.',
      '.kwwwrrwwwk.',
      '.kwwwwwwwwk.',
      '.kwwwwwwwwk.',
      '.kkkkkkkkkk.',
      '............',
      '............'
    ],
    request: [
      '............',
      '............',
      '.kkkkkkkkkk.',
      '.klllgllllk.',
      '.kllllllllk.',
      '..kllglllk..',
      '..kllllllk..',
      '.klllgllllk.',
      '.kllllllllk.',
      '.kkkkkkkkkk.',
      '............',
      '............'
    ],
    poster: [
      '............',
      '............',
      '.kkkkkkkkkk.',
      '.kyyyYyyyyk.',
      '.kyyyyyyyyk.',
      '..kyyYyyyk..',
      '..kyyyyyyk..',
      '.kyyyYyyyyk.',
      '.kyyyyyyyyk.',
      '.kkkkkkkkkk.',
      '............',
      '............'
    ]
  };

  const BUSH_SMALL = [
    '....G.....G.....',
    '.....Gl..Gg.....',
    '..G..GGlGGg..G..',
    '...Gl.GGGg.Gg...',
    '....GGgGGgGg....',
    '.....gGGGGg.....'
  ];

  const STALK_SMALL = [
    '......lG........',
    '.......Gg.......',
    '...Gl..Gg.......',
    '....GG.Gg.lG....',
    '.....gGGgGG.....',
    '.......GgG......',
    '.......Gg.......',
    '.......Gg.......'
  ];

  const PLANTS = {
    sprout: [
      '.....l....G.....',
      '.....Gl..Gg.....',
      '......GgGg......',
      '.......Gg.......',
      '.......g........'
    ],
    radish: [BUSH_SMALL, [
      '...l...G....l...',
      '..G.Gl.Gl.GlG.G.',
      '...GGlGGlGGgG...',
      '..G.GGlGGGgG.G..',
      '...GgGGgGGgGg...',
      '....gkrrrrkg....',
      '.....krprRk.....',
      '......kkkk......'
    ]],
    carrot: [BUSH_SMALL, [
      '....l..l...l....',
      '..l.G.lG.l.G.l..',
      '...G.GlG.GlG....',
      '..l.GGlGGGlG.l..',
      '...GgGGlGGgGg...',
      '....gkooookg....',
      '.....koyoOk.....',
      '......kkkk......'
    ]],
    potato: [BUSH_SMALL, [
      '......lGl.......',
      '....GlGGGlG.....',
      '...GGGlGGGgG....',
      '..GlGGGgGGGgG...',
      '..GGgGGGgGGgG...',
      '...gGGgGGgGg....',
      '.knnk.gGg.knnk..',
      '.knBnk...knnBk..',
      '..kkk.....kkk...'
    ]],
    tomato: [[
      '.......b........',
      '.....GlbG.......',
      '....GGlbGg......',
      '...GlGGbGGg.....',
      '...GGGgbGgG.....',
      '....GgGbGg......',
      '.....gGbg.......',
      '.......b........'
    ], [
      '.......b........',
      '....GlGbGl......',
      '...GGlGbGGg.....',
      '..GlrrGbGrrG....',
      '..GGrRGbGrRg....',
      '...GGGgbrrGG....',
      '..GrrGGbrRGg....',
      '..GrRgGbGGg.....',
      '...gGGgbGg......',
      '.......b........'
    ]],
    corn: [[
      '.......l........',
      '......lG........',
      '...l..GG..l.....',
      '....G.Gg.G......',
      '.....GGgG.......',
      '......Gg........',
      '..l...Gg...l....',
      '...G..Gg..G.....',
      '....G.Gg.G......',
      '.....GGgG.......',
      '......Gg........'
    ], [
      '.......Y........',
      '......YyY.......',
      '.......l........',
      '...l..lG...l....',
      '....G.GG..G.....',
      '.....GGgyG......',
      '......GyyY......',
      '..l..yGyy..l....',
      '...GyyGgY.G.....',
      '....yYGgGG......',
      '.....GGg........',
      '......Gg........',
      '......Gg........'
    ]],
    pumpkin: [[
      '...Gl.....lG....',
      '..GGGg.g.GGGg...',
      '..gGg.gGg.gGg...',
      '.....gg.gg......'
    ], [
      '..Gl............',
      '.GGGg...g.....l.',
      '.gGg.kkkgkkk.GGg',
      '....koooOoooOk.g',
      '...kooyoOooOoOk.',
      '...koooOoooOoOk.',
      '...koooOoooOoOk.',
      '....kooOoooOOk..',
      '.....kkkkkkkk...'
    ]],
    strawberry: [BUSH_SMALL, [
      '....l..G...l....',
      '..G.GlGGlGGg.G..',
      '...GGrGGGgGrG...',
      '..GlGrRGGGgrRg..',
      '...GgGGrGgGGg...',
      '....gGgrRGgg....',
      '......gGg.......'
    ]],
    sunflower: [STALK_SMALL, [
      '.....yyyyy......',
      '...yyYyyyYyy....',
      '..yyykkkkkyyy...',
      '..yYkBbBbBkYy...',
      '..yykbBbBbkyy...',
      '..yYkBbBbBkYy...',
      '..yyykkkkkyyy...',
      '...yyYyyyYyy....',
      '.....yyGyy......',
      '.......Gg.......',
      '...Gl..Gg.......',
      '....GG.Gg.lG....',
      '.....gGGgGG.....',
      '.......GgG......',
      '.......Gg.......',
      '.......Gg.......'
    ]]
  };

  const CHICKEN = [
    ['......rr..', '.....kwwk.', '.kk.kwwkwo', 'kwwkwwwwk.', 'kwwwwwwwk.', 'kWwwwwwwk.', '.kWWwwwk..', '..kkkkk...', '...y..y...'],
    ['......rr..', '.....kwwk.', '.kk.kwwkwo', 'kwwkwwwwk.', 'kwwwwwwwk.', 'kWwwwwwwk.', '.kWWwwwk..', '..kkkkk...', '..y....y..']
  ];

  const CAT = [
    ['k.......k..k', 'ok......okok', 'ok......oooo', 'ok.....kokok', '.okkkkkoooop', '.kooOoooooo.', '.koooOooook.', '.kok...kok..', '.kk....kk...'],
    ['........k..k', 'kk......okok', 'ook.....oooo', '.ok....kokok', '.okkkkkoooop', '.kooOoooooo.', '.koooOooook.', '..kok.kok...', '..kk..kk....']
  ];

  const DUCK = ['......kk..', '.....kwwk.', '.kk.kwwkwo', 'kwwkwwwwk.', 'kwwwwwwwk.', 'kWwwwwwwk.', '.kWWwwwk..', '..kkkkk...'];
  const DUCKLING = ['....kk.', '...kyyo', '.kkkyyk', 'kyyyyyk', 'kYyyyk.', '.kkkk..'];
  const EGG = ['..kk..', '.kwwk.', 'kwwwWk', 'kwwwWk', 'kwwWWk', '.kWWk.', '..kk..'];

  const RELICS = {
    sword: [
      '.....y.....',
      '.....b.....',
      '...YyyyY...',
      '.....w.....',
      '.....w.....',
      '.....W.....',
      '.....w.....',
      '.....w.....',
      '..ssswsss..',
      '.sssswSsss.',
      'sssssSSssss',
      'sSsssssSsSs',
      'SSsSSsSSSsS'
    ],
    axe: [
      '.yyy.b....',
      'yyyyyb....',
      'yYyyyb....',
      'yyyyyb....',
      '.yYy.b....',
      '.....b....',
      '.....b....',
      '..nnnbnn..',
      '.nnBnnnnn.',
      '.bbbbbbbb.',
      '.bBbbBbbb.',
      '.bbbBbbBb.'
    ],
    fish: [
      '...wwwwww...',
      '..cccccccc..',
      '.cccccycycc.',
      '.cyccyyyyyc.',
      'ccyyyyyykycc',
      '.cyccyyyyyc.',
      '.cccccccccc.',
      '..CCCCCCCC..',
      '...CCCCCC...'
    ],
    bottle: [
      '..bb..',
      '..cc..',
      '..cc..',
      '.cccc.',
      'cwcccc',
      'cwwwwc',
      'cwrrwc',
      'cwwwwc',
      'cwwnwc',
      'cccccc',
      '.CCCC.'
    ],
    ring: [
      '..yyyyy..',
      '.yyoYYyy.',
      'yyY...Yyy',
      'yo.....Yy',
      'yY.....oy',
      'yY.....Yy',
      'yyY...Yyy',
      '.yyYoYyy.',
      '..yyyyy..',
      '..sssss..',
      '.sssSsss.',
      '.SSSSSSS.'
    ],
    duck: [
      '.....yyy..',
      '....yyyyy.',
      '....yykyoo',
      '....yyyyo.',
      'y..yyyyy..',
      'yyyyyyyyy.',
      'yyyYYyyyy.',
      '.yyyyyyyy.',
      '..yyyyyy..'
    ],
    nessie: [
      '..GG..........',
      '.GkGG.........',
      '.GGGG.........',
      '...GG.........',
      '...GG....GG...',
      '...GGg..GGGG.G',
      '.ccGGgccGGGGcG',
      'cccccccccccccc',
      '.cCCcccCCccCc.'
    ],
    frog: [
      '...y.y.y....',
      '...yyyyy....',
      '..GGGGGGG...',
      '.GwkGGGwkG..',
      '.GGGGGGGGG..',
      '.GGlllllGG..',
      '..GlllllG.yy',
      '.GGlllllGGyY',
      'GGG.GGG.GGG.'
    ],
    pipe: [
      'GGGGGGGGGGGG',
      'GllGGGGGGGgG',
      'GllGGGGGGGgG',
      'gggggggggggg',
      '.GllGGGGGgG.',
      '.GllGGGGGgG.',
      '.GllGGGGGgG.',
      '.GllGGGGGgG.',
      '.GllGGGGGgG.',
      '.GllGGGGGgG.'
    ],
    rupee: [
      '..lGg..',
      '.llGgg.',
      'lwlGggg',
      'lwlGggg',
      'lllGggg',
      'lllGggg',
      'lllGggg',
      '.llGgg.',
      '..lGg..'
    ],
    cube: [
      'SSSsssssSSS',
      'SSwwwwwwwSS',
      'SwwwwwwwwwS',
      'swwppwppwws',
      'swwpppppwws',
      'swwpppppwws',
      'swwwpppwwws',
      'swwwwpwwwws',
      'SwwwwwwwwwS',
      'SSwwwwwwwSS',
      'SSSsssssSSS'
    ],
    pickaxe: [
      '..ccccccc..',
      '.ccCCbCCcc.',
      'cc...b...cc',
      'c....b....c',
      '.....b.....',
      '.....b.....',
      '.....b.....',
      '.....b.....',
      '..sssbsss..',
      '.sSsssssSs.'
    ],
    tetromino: [
      'uuuUuuuUuuuU',
      'uuuUuuuUuuuU',
      'uuuUuuuUuuuU',
      'UUUUUUUUUUUU',
      '....uuuU....',
      '....uuuU....',
      '....uuuU....',
      '....UUUU....'
    ],
    muncher: [
      '..yyyyy.....',
      '.yyykyyy....',
      'yyyyyyy.....',
      'yyyyy.......',
      'yyyy....w..w',
      'yyyyy.......',
      'yyyyyyy.....',
      '.yyyyyyy....',
      '..yyyyy.....'
    ],
    bonfire: [
      '.....s.....',
      '.....s.....',
      '....sSs....',
      '.....s.....',
      '...o.s.o...',
      '..oyosoyo..',
      '.ooyyyyyoo.',
      '.oyywyywyo.',
      '.BbBoyoBbB.',
      'BBbbBBBbbBB'
    ],
    invader: [
      '..u.....u..',
      '...u...u...',
      '..uuuuuuu..',
      '.uu.uuu.uu.',
      'uuuuuuuuuuu',
      'u.uuuuuuu.u',
      'u.u.....u.u',
      '...uu.uu...'
    ]
  };

  function relicSprite(rows) {
    return outline(grid(rows, { w: rows[0].length + 2, h: rows.length + 2, ox: 1, oy: 1 }));
  }
  const MINI_DROP = ['..k..', '.kck.', '.kck.', 'kcwck', 'kccCk', '.kkk.'];

  function plantSprite(rows) {
    return outline(grid(rows, { w: 18, h: 24, ox: 1, bottom: 2 }), LEAF_OUTLINE);
  }

  function seedSprite() {
    return paint(18, 24, function (rect) {
      [[5, 14], [11, 16], [7, 19]].forEach(function (p) {
        rect('#f2e2b0', p[0], p[1], 2, 1);
        rect('#5c3a22', p[0], p[1] + 1, 2, 1);
      });
    });
  }

  function soilTile(base, dark, light) {
    return paint(16, 16, function (rect) {
      rect(base, 0, 0, 16, 16);
      rect(dark, 0, 15, 16, 1);
      rect(dark, 15, 0, 1, 16);
      [3, 7, 11].forEach(function (y) {
        rect(dark, 2, y, 12, 1);
        rect(light, 2, y + 1, 12, 1);
      });
    });
  }

  function grassTile() {
    const rnd = rng(3);
    return paint(16, 16, function (rect) {
      rect('#7dbd57', 0, 0, 16, 16);
      rect('#6cab4b', 0, 15, 16, 1);
      rect('#6cab4b', 15, 0, 1, 16);
      for (let i = 0; i < 12; i++) {
        rect(rnd() < 0.5 ? '#6cab4b' : '#93d46a', 1 + Math.floor(rnd() * 13), 1 + Math.floor(rnd() * 13), 1, 1);
      }
      rect('#5a9a3f', 4, 5, 1, 3);
      rect('#5a9a3f', 6, 6, 1, 2);
      rect('#5a9a3f', 10, 9, 1, 3);
      rect('#5a9a3f', 12, 10, 1, 2);
    });
  }

  function windowPane(rect, x, y, w, h) {
    rect(OUTLINE, x - 1, y - 1, w + 2, h + 2);
    rect('#8fd3f4', x, y, w, h);
    rect('#c9ecfb', x, y, 2, 2);
    rect(OUTLINE, x + Math.floor(w / 2), y, 1, h);
    rect(OUTLINE, x, y + Math.floor(h / 2), w, 1);
  }

  const HOUSE_WINDOWS = [
    [[34, 39, 7, 7]],
    [[34, 38, 7, 7]],
    [[9, 38, 7, 7], [34, 38, 7, 7]]
  ];

  function house(tier) {
    const roofs = [['#e3c35a', '#c29a3a'], ['#d0553f', '#a63b2e'], ['#4f8fb0', '#376d8c']];
    const walls = [['#c8935a', '#a8703a'], ['#f2e6cf', '#d9c7a6'], ['#f7efe0', '#dccdb0']];
    return outline(paint(50, 58, function (rect) {
      const roof = roofs[tier];
      const wall = walls[tier];
      if (tier > 0) {
        rect('#8c6f63', 34, 3, 6, 14);
        rect('#6e554c', 34, 3, 6, 2);
      }
      rect(wall[0], 7, 30, 36, 26);
      rect(wall[1], 7, 52, 36, 4);
      if (tier === 0) {
        [34, 39, 44, 49].forEach(function (y) { rect(wall[1], 7, y, 36, 1); });
      }
      for (let i = 0; i < 24; i++) {
        const half = 15 + Math.round((i * 9) / 23);
        rect(i % 4 === 3 ? roof[1] : roof[0], 25 - half, 7 + i, half * 2, 1);
      }
      rect(roof[1], 1, 29, 48, 2);
      rect('#7d4e24', 21, 42, 9, 14);
      rect('#5c3a1c', 21, 42, 9, 1);
      rect('#5c3a1c', 25, 43, 1, 13);
      rect('#f7d04a', 28, 49, 1, 2);
      HOUSE_WINDOWS[tier].forEach(function (w) {
        windowPane(rect, w[0], w[1], w[2], w[3]);
        if (tier === 2) {
          rect('#a8703a', w[0] - 1, w[1] + w[3] + 1, w[2] + 2, 2);
          rect('#f29bb5', w[0], w[1] + w[3], 1, 1);
          rect('#f7d04a', w[0] + 3, w[1] + w[3], 1, 1);
          rect('#f29bb5', w[0] + 6, w[1] + w[3], 1, 1);
        }
      });
    }));
  }

  function tree(seed, tones) {
    const rnd = rng(seed);
    return outline(paint(34, 42, function (rect) {
      rect('#7d4e24', 15, 26, 4, 14);
      rect('#a8703a', 15, 26, 2, 14);
      rect('#7d4e24', 13, 39, 8, 1);
      disc(rect, tones[0], 17, 16, 14);
      disc(rect, tones[1], 16, 14, 11);
      disc(rect, tones[2], 12, 10, 5);
      for (let i = 0; i < 18; i++) {
        const a = rnd() * Math.PI * 2;
        const r = rnd() * 11;
        rect(rnd() < 0.5 ? tones[0] : tones[2], Math.round(16 + Math.cos(a) * r), Math.round(15 + Math.sin(a) * r), 2, 1);
      }
    }));
  }

  function coop() {
    return outline(paint(34, 32, function (rect) {
      rect('#c8553d', 5, 13, 24, 17);
      [17, 22, 27].forEach(function (y) { rect('#a63b2e', 5, y, 24, 1); });
      for (let i = 0; i < 11; i++) {
        const half = 8 + Math.round(i * 0.8);
        rect(i % 3 === 2 ? '#7d4e24' : '#a8703a', 17 - half, 2 + i, half * 2, 1);
      }
      rect('#3b2a22', 13, 20, 8, 10);
      rect('#5c3a1c', 14, 21, 6, 9);
      rect('#f2e6cf', 23, 17, 4, 4);
      rect('#3b2a22', 24, 18, 2, 2);
      rect('#c8914f', 11, 30, 12, 1);
    }));
  }

  function barn() {
    return outline(paint(40, 36, function (rect) {
      rect('#c8553d', 4, 16, 32, 18);
      [21, 26, 31].forEach(function (y) { rect('#a63b2e', 4, y, 32, 1); });
      for (let i = 0; i < 14; i++) {
        const half = i < 6 ? 7 + Math.round(i * 1.6) : 16 + Math.round((i - 6) * 0.45);
        rect(i % 3 === 2 ? '#6b757d' : '#9aa5ad', 20 - half, 2 + i, half * 2, 1);
      }
      rect('#fff7e6', 12, 19, 16, 15);
      rect('#a8703a', 13, 20, 14, 14);
      rect('#fff7e6', 19, 20, 2, 14);
      for (let i = 0; i < 6; i++) {
        rect('#fff7e6', 13 + i, 21 + i * 2, 1, 2);
        rect('#fff7e6', 26 - i, 21 + i * 2, 1, 2);
      }
      rect('#3b2a22', 30, 19, 4, 4);
      rect('#f7d04a', 31, 20, 2, 2);
      rect('#c8914f', 11, 34, 18, 1);
    }));
  }

  function well() {
    return outline(paint(24, 30, function (rect) {
      for (let i = 0; i < 6; i++) {
        const half = 6 + i;
        rect(i % 3 === 2 ? '#a63b2e' : '#d0553f', 12 - half, 1 + i, half * 2, 1);
      }
      rect('#a8703a', 4, 7, 2, 12);
      rect('#a8703a', 18, 7, 2, 12);
      rect('#7d4e24', 6, 9, 12, 1);
      rect('#d9cdb8', 11, 10, 1, 4);
      rect('#9aa5ad', 9, 14, 5, 4);
      rect('#6b757d', 9, 17, 5, 1);
      rect('#9aa5ad', 2, 19, 20, 10);
      rect('#c3ccd2', 2, 19, 20, 2);
      rect('#3f7fc4', 5, 19, 14, 1);
      rect('#6b757d', 2, 23, 20, 1);
      rect('#6b757d', 2, 26, 20, 1);
      [6, 13, 19].forEach(function (x) { rect('#6b757d', x, 21, 1, 2); });
      [9, 16].forEach(function (x) { rect('#6b757d', x, 24, 1, 2); });
      [5, 12, 19].forEach(function (x) { rect('#6b757d', x, 27, 1, 2); });
    }));
  }

  function scarecrow(hatOn) {
    return outline(paint(18, 30, function (rect) {
      rect('#a8703a', 8, 12, 2, 17);
      rect('#a8703a', 2, 14, 14, 2);
      rect('#f7d04a', 1, 13, 2, 4);
      rect('#f7d04a', 15, 13, 2, 4);
      rect('#d0553f', 5, 13, 8, 8);
      rect('#4f8fb0', 6, 16, 2, 2);
      rect('#f7d04a', 10, 18, 2, 2);
      rect('#e8c98a', 6, 6, 6, 6);
      rect('#3b2a22', 7, 8, 1, 1);
      rect('#3b2a22', 10, 8, 1, 1);
      rect('#3b2a22', 8, 10, 2, 1);
      if (hatOn) {
        rect('#c29a3a', 4, 5, 10, 2);
        rect('#c29a3a', 6, 2, 6, 3);
        rect('#a63b2e', 6, 4, 6, 1);
      } else {
        rect('#e8c98a', 6, 5, 6, 1);
        rect('#f7d04a', 7, 4, 1, 1);
        rect('#f7d04a', 9, 3, 1, 2);
        rect('#f7d04a', 11, 4, 1, 1);
      }
    }));
  }

  function hat() {
    return outline(paint(12, 7, function (rect) {
      rect('#c29a3a', 1, 4, 10, 2);
      rect('#c29a3a', 3, 1, 6, 3);
      rect('#a63b2e', 3, 3, 6, 1);
    }));
  }

  function lantern() {
    return outline(paint(8, 22, function (rect) {
      rect('#5a4a44', 3, 8, 2, 12);
      rect('#5a4a44', 2, 20, 4, 1);
      rect('#5a4a44', 1, 1, 6, 1);
      rect('#f7d04a', 2, 2, 4, 5);
      rect('#fff7e6', 3, 3, 2, 3);
      rect('#5a4a44', 1, 7, 6, 1);
    }));
  }

  function glow() {
    return paint(48, 48, function (rect, g) {
      [[22, 0.07], [16, 0.09], [10, 0.11], [5, 0.14]].forEach(function (step) {
        g.globalAlpha = step[1];
        disc(rect, '#ffd27a', 24, 24, step[0]);
      });
      g.globalAlpha = 1;
    });
  }

  const S = (MF.sprites = { canvas: canvas, rng: rng, url: url, houseWindows: HOUSE_WINDOWS });

  S.icons = {};
  Object.keys(ICONS).forEach(function (name) { S.icons[name] = grid(ICONS[name], { w: 12, h: 12 }); });

  S.tiles = {
    grass: grassTile(),
    soil: soilTile('#b98654', '#9a6b3f', '#cc9a66'),
    wet: soilTile('#80583a', '#63412a', '#946a48')
  };

  const seed = seedSprite();
  const sprout = plantSprite(PLANTS.sprout);
  S.plants = {};
  MF.config.crops.forEach(function (crop) {
    const stages = PLANTS[crop.id];
    S.plants[crop.id] = [seed, sprout, plantSprite(stages[0]), plantSprite(stages[1])];
  });

  S.house = [house(0), house(1), house(2)];
  S.trees = [tree(5, ['#3f8a3a', '#57a845', '#7cc65a']), tree(9, ['#357a3c', '#4b9a44', '#6dbb55'])];
  S.appleTree = tree(21, ['#4a9440', '#66b84e', '#8fd466']);
  S.coop = coop();
  S.well = well();
  S.barn = barn();
  S.scarecrow = scarecrow(true);
  S.scarecrowBare = scarecrow(false);
  S.hat = hat();
  S.lantern = lantern();
  S.glow = glow();
  S.egg = grid(EGG);
  S.miniDrop = grid(MINI_DROP);

  const brown = { w: '#d9a066', W: '#a8703a' };
  const whiteRight = CHICKEN.map(function (rows) { return grid(rows); });
  const brownRight = CHICKEN.map(function (rows) { return grid(rows, { pal: brown }); });
  S.chickens = [
    { right: whiteRight, left: whiteRight.map(flip) },
    { right: brownRight, left: brownRight.map(flip) }
  ];
  const duckRight = [grid(DUCK), grid(DUCK, { pal: brown })];
  S.ducks = duckRight.map(function (duck) { return { right: duck, left: flip(duck) }; });
  const ducklingRight = grid(DUCKLING);
  S.duckling = { right: ducklingRight, left: flip(ducklingRight) };
  S.icons.duckling = grid(DUCKLING, { w: 12, h: 12, ox: 2, oy: 3 });
  S.relics = {};
  Object.keys(RELICS).forEach(function (id) { S.relics[id] = relicSprite(RELICS[id]); });
  const catRight = CAT.map(function (rows) { return grid(rows); });
  S.cat = { right: catRight, left: catRight.map(flip) };

  const FARMER = {
    hat: '#f2cf5b', hatDark: '#c9a13a', band: '#d9483b',
    skin: '#f5c9a0', skinDark: '#dba87c', hair: '#7d4e24', blush: '#f29b8a', eye: '#3b2a22',
    shirt: '#d9483b', overalls: '#4f7fc4', overallsDark: '#3a5f9c', boot: '#5c3a22',
    wood: '#a8703a', metal: '#c3ccd2', can: '#5bb4e5', canDark: '#3f7fc4', water: '#8fd3f4',
    seed: '#f2e2b0', leaf: '#a4de6a'
  };
  let look = FARMER;
  const FARMER_W = 24;
  const FARMER_H = 24;
  const FARMER_OX = 3;
  const FARMER_OY = 3;

  function farmerFront(U, L, o, back) {
    const F = look;
    const liftL = o.legs === 1 ? 1 : 0;
    const liftR = o.legs === 2 ? 1 : 0;
    L(F.overallsDark, 5, 16, 3, 2 - liftL);
    L(F.boot, 5, 18 - liftL, 3, 2);
    L(F.overallsDark, 8, 16, 3, 2 - liftR);
    L(F.boot, 8, 18 - liftR, 3, 2);
    U(F.shirt, 4, 10, 8, 3);
    U(F.overalls, 4, 13, 8, 3);
    if (back) {
      U(F.overalls, 5, 10, 1, 3);
      U(F.overalls, 10, 10, 1, 3);
    } else {
      U(F.overalls, 5, 11, 6, 2);
      U(F.overalls, 5, 10, 1, 1);
      U(F.overalls, 10, 10, 1, 1);
      U(F.overallsDark, 7, 13, 2, 1);
    }
    U(F.shirt, 2, 10, 2, 4 - liftL);
    U(F.skin, 2, 14 - liftL, 2, 1);
    U(F.shirt, 12, 10, 2, 4 - liftR);
    U(F.skin, 12, 14 - liftR, 2, 1);
    U(F.skin, 4, 4, 8, 6);
    if (back) {
      U(F.hair, 4, 4, 8, 5);
    } else {
      U(F.hair, 4, 4, 1, 2);
      U(F.hair, 11, 4, 1, 2);
      if (o.blink) {
        U(F.skinDark, 6, 7, 1, 1);
        U(F.skinDark, 9, 7, 1, 1);
      } else {
        U(F.eye, 6, 6, 1, 2);
        U(F.eye, 9, 6, 1, 2);
      }
      U(F.blush, 5, 8, 1, 1);
      U(F.blush, 10, 8, 1, 1);
    }
    U(F.hat, 4, 0, 8, 3);
    U(F.hatDark, 10, 0, 2, 2);
    U(F.band, 4, 2, 8, 1);
    U(F.hat, 2, 3, 12, 1);
  }

  function farmerTool(U, L, o) {
    const F = look;
    const raised = o.arm === 'up';
    if (o.tool === 'hoe' && raised) {
      U(F.wood, 13, -2, 1, 12);
      U(F.metal, 14, -2, 3, 2);
    } else if (o.tool === 'hoe') {
      [[13, 12], [14, 13], [14, 14], [15, 15], [15, 16], [16, 17]].forEach(function (p) { U(F.wood, p[0], p[1], 1, 1); });
      L(F.metal, 15, 18, 3, 2);
    } else if (o.tool === 'shovel' && raised) {
      U(F.wood, 13, 0, 1, 10);
      U(F.metal, 12, -4, 3, 4);
    } else if (o.tool === 'shovel') {
      [[13, 12], [14, 13], [14, 14], [15, 15], [15, 16]].forEach(function (p) { U(F.wood, p[0], p[1], 1, 1); });
      L(F.metal, 15, 17, 3, 3);
    } else if (o.tool === 'can' && raised) {
      U(F.can, 13, 9, 4, 4);
      U(F.canDark, 13, 12, 4, 1);
      U(F.canDark, 17, 9, 2, 1);
    } else if (o.tool === 'can') {
      U(F.can, 13, 11, 4, 4);
      U(F.canDark, 13, 14, 4, 1);
      U(F.canDark, 17, 13, 1, 1);
      U(F.canDark, 18, 14, 1, 1);
      L(F.water, 19, 16, 1, 1);
      L(F.water, 18, 18, 1, 1);
      L(F.water, 20, 18, 1, 1);
    } else if (o.tool === 'seed' && raised) {
      U(F.seed, 13, 8, 1, 1);
    } else if (o.tool === 'seed') {
      L(F.seed, 15, 14, 1, 1);
      L(F.seed, 16, 16, 1, 1);
      L(F.seed, 14, 17, 1, 1);
    } else if (o.tool === 'grab' && raised) {
      U(F.leaf, 12, 7, 3, 2);
    }
  }

  function farmerSide(U, L, o) {
    const F = look;
    if (o.legs) {
      L(F.overallsDark, 5, 16, 3, 1);
      L(F.overallsDark, 4, 17, 3, 1);
      L(F.boot, 3, 18, 3, 2);
      L(F.overallsDark, 8, 16, 3, 1);
      L(F.overallsDark, 9, 17, 3, 1);
      L(F.boot, 10, 18, 3, 2);
    } else {
      L(F.overallsDark, 6, 16, 4, 2);
      L(F.boot, 6, 18, 5, 2);
    }
    U(F.shirt, 5, 10, 6, 3);
    U(F.overalls, 5, 13, 6, 3);
    U(F.overalls, 8, 11, 3, 2);
    U(F.overalls, 7, 10, 1, 1);
    U(F.skin, 5, 4, 7, 6);
    U(F.hair, 5, 4, 2, 4);
    U(F.skin, 12, 7, 1, 1);
    if (o.blink) U(F.skinDark, 10, 7, 1, 1);
    else U(F.eye, 10, 6, 1, 2);
    U(F.blush, 9, 8, 1, 1);
    U(F.hat, 5, 0, 7, 3);
    U(F.hatDark, 5, 0, 2, 2);
    U(F.band, 5, 2, 7, 1);
    U(F.hat, 3, 3, 12, 1);
    farmerTool(U, L, o);
    if (o.arm === 'fwd') {
      U(F.shirt, 8, 10, 2, 2);
      U(F.shirt, 9, 12, 2, 2);
      U(F.skin, 10, 14, 2, 1);
    } else if (o.arm === 'back') {
      U(F.shirt, 6, 10, 2, 2);
      U(F.shirt, 5, 12, 2, 2);
      U(F.skin, 4, 14, 2, 1);
    } else if (o.arm === 'up') {
      U(F.shirt, 9, 10, 3, 2);
      U(F.skin, 12, 9, 2, 2);
    } else if (o.arm === 'down') {
      U(F.shirt, 9, 11, 3, 2);
      U(F.skin, 12, 12, 2, 2);
    } else {
      U(F.shirt, 7, 10, 2, 4);
      U(F.skin, 7, 14, 2, 1);
    }
  }

  function farmerFrame(dir, o) {
    const bob = o.bob || 0;
    return outline(paint(FARMER_W, FARMER_H, function (rect) {
      const U = function (color, x, y, w, h) { rect(color, FARMER_OX + x, FARMER_OY + y + bob, w, h); };
      const L = function (color, x, y, w, h) { rect(color, FARMER_OX + x, FARMER_OY + y, w, h); };
      if (dir === 'right') farmerSide(U, L, o);
      else farmerFront(U, L, o, dir === 'up');
    }));
  }

  function farmerSet(dir) {
    const side = dir === 'right';
    const set = {
      anchorX: FARMER_OX + 8,
      idle: [farmerFrame(dir, {}), farmerFrame(dir, { bob: 1 })],
      walk: [
        farmerFrame(dir, { legs: 1, bob: 1, arm: 'fwd' }),
        farmerFrame(dir, {}),
        farmerFrame(dir, { legs: 2, bob: 1, arm: 'back' }),
        farmerFrame(dir, {})
      ]
    };
    if (dir !== 'up') set.idle.push(farmerFrame(dir, { blink: true }));
    if (side) {
      set.act = {};
      ['hoe', 'can', 'seed', 'shovel'].forEach(function (tool) {
        set.act[tool] = [farmerFrame(dir, { arm: 'up', tool: tool }), farmerFrame(dir, { arm: 'down', tool: tool, bob: 1 })];
      });
      set.act.grab = [farmerFrame(dir, { arm: 'down', bob: 1 }), farmerFrame(dir, { arm: 'up', tool: 'grab' })];
    }
    return set;
  }

  function flipSet(set) {
    const out = { anchorX: FARMER_W - set.anchorX, idle: set.idle.map(flip), walk: set.walk.map(flip), act: {} };
    Object.keys(set.act).forEach(function (tool) { out.act[tool] = set.act[tool].map(flip); });
    return out;
  }

  function farmerSets(colors) {
    look = Object.assign({}, FARMER, colors);
    const right = farmerSet('right');
    return { down: farmerSet('down'), up: farmerSet('up'), right: right, left: flipSet(right) };
  }

  S.farmer = farmerSets({});
  S.workers = {
    henhand: farmerSets({
      hat: '#fff7e6', hatDark: '#d9cdb8', band: '#5bb4e5', hair: '#d6a021',
      shirt: '#5bb4e5', overalls: '#a8703a', overallsDark: '#7d4e24'
    }),
    picker: farmerSets({
      hat: '#6dbf4b', hatDark: '#4f9a3f', band: '#fff7e6', hair: '#3b2a22',
      shirt: '#f2cf5b', overalls: '#4f9a3f', overallsDark: '#3a7a30'
    }),
    manager: farmerSets({
      hat: '#3b2a22', hatDark: '#241812', band: '#d9483b', hair: '#3b2a22',
      shirt: '#fff7e6', overalls: '#3d5a8a', overallsDark: '#2a3f66'
    }),
    hand: farmerSets({
      hat: '#e8b25a', hatDark: '#c28a3a', band: '#4f9a3f', hair: '#a8703a',
      shirt: '#fff7e6', overalls: '#8a5fb5', overallsDark: '#6a4590'
    })
  };
  S.farmerAnchorY = FARMER_OY + 20;

  S.shopIcons = {
    field: S.tiles.soil,
    boots: S.icons.boot,
    can: S.icons.can,
    tool: S.icons.hoe,
    shovel: S.icons.shovel,
    fert: S.icons.bag,
    sprinkler: S.icons.sprinkler,
    hands: S.workers.hand.down.idle[0],
    seeds: S.icons.seeds,
    barn: S.barn,
    market: S.icons.market,
    sign: S.icons.sign,
    insider: S.icons.insider,
    manager: S.workers.manager.down.idle[0],
    feed: S.icons.feed,
    henhand: S.workers.henhand.down.idle[0],
    shears: S.icons.shears,
    picker: S.workers.picker.down.idle[0],
    hammock: S.icons.hammock,
    almanac: S.icons.almanac,
    ducks: duckRight[0],
    coop: whiteRight[0],
    trees: S.icons.apple,
    house: S.icons.house,
    clover: S.icons.clover,
    flowers: S.icons.flower,
    scarecrow: S.scarecrow,
    lanterns: S.icons.lantern,
    cat: catRight[0]
  };
})();
