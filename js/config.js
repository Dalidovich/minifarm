window.MF = window.MF || {};

MF.config = {
  viewW: 380,
  viewH: 270,
  tile: 16,
  dayLength: 300,
  offlineCap: 7200,
  startCoins: 20,
  field: { x: 112, y: 80, cols: 8, rows: 5, tiers: [[3, 2], [4, 3], [5, 4], [6, 5], [8, 5]] },
  house: { x: 17, y: 20, w: 50, h: 58 },
  well: { x: 82, y: 42, w: 24, h: 30 },
  pen: { x: 272, y: 44, w: 88, h: 68 },
  treeSpots: [[286, 170], [322, 160], [354, 172]],
  lanternSpots: [[52, 166], [176, 166], [252, 166]],
  scarecrow: { x: 92, y: 98 },
  catZone: { x: 90, y: 206, w: 270, h: 24 },
  levelXp: [15, 40, 100, 220, 450, 800, 1300, 2000, 3000],
  canCapacity: [10, 20, 35, 60],
  wetDuration: [45, 70, 100, 150],
  toolShapes: [
    [[0, 0]],
    [[0, 0], [-1, 0], [1, 0]],
    [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
  ],
  fertBonus: 0.15,
  houseBonus: [1, 1.1, 1.25],
  eggInterval: 60,
  appleInterval: 90,
  maxApples: 3,
  orderDelay: 15,
  orderSkipDelay: 30,
  crops: [
    { id: 'radish', level: 1, cost: 2, sell: 6, time: 20, xp: 1 },
    { id: 'carrot', level: 2, cost: 5, sell: 12, time: 40, xp: 2 },
    { id: 'potato', level: 3, cost: 10, sell: 24, time: 70, xp: 4 },
    { id: 'tomato', level: 4, cost: 18, sell: 42, time: 100, xp: 6 },
    { id: 'corn', level: 5, cost: 30, sell: 70, time: 140, xp: 9 },
    { id: 'pumpkin', level: 6, cost: 50, sell: 120, time: 200, xp: 14 },
    { id: 'strawberry', level: 7, cost: 80, sell: 190, time: 260, xp: 20 },
    { id: 'sunflower', level: 8, cost: 120, sell: 290, time: 330, xp: 28 }
  ],
  products: {
    egg: { sell: 15, xp: 2 },
    apple: { sell: 40, xp: 4 }
  },
  upgrades: [
    { id: 'field', levels: [{ cost: 60, level: 1 }, { cost: 300, level: 2 }, { cost: 1500, level: 4 }, { cost: 6000, level: 6 }] },
    { id: 'can', levels: [{ cost: 40, level: 1 }, { cost: 250, level: 3 }, { cost: 1200, level: 5 }] },
    { id: 'tool', levels: [{ cost: 150, level: 2 }, { cost: 2000, level: 5 }] },
    { id: 'fert', levels: [{ cost: 80, level: 2 }, { cost: 300, level: 3 }, { cost: 1000, level: 5 }, { cost: 3000, level: 6 }, { cost: 8000, level: 8 }] },
    { id: 'sprinkler', levels: [{ cost: 5000, level: 7 }] },
    { id: 'coop', levels: [{ cost: 300, level: 3 }, { cost: 400, level: 3 }, { cost: 700, level: 4 }, { cost: 1200, level: 5 }] },
    { id: 'trees', levels: [{ cost: 400, level: 4 }, { cost: 900, level: 5 }, { cost: 2000, level: 6 }] },
    { id: 'house', levels: [{ cost: 2500, level: 5 }, { cost: 20000, level: 8 }] },
    { id: 'flowers', levels: [{ cost: 100, level: 1 }] },
    { id: 'scarecrow', levels: [{ cost: 250, level: 2 }] },
    { id: 'lanterns', levels: [{ cost: 600, level: 3 }] },
    { id: 'cat', levels: [{ cost: 1000, level: 4 }] }
  ]
};
