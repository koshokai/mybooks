/* 远征 · 数据：英雄、地域、魔物、首领、升级、符文、成就（全部原创） */
(function () {
  'use strict';
  const Q = window.Q;

  /* 粒子调色板（索引） */
  Q.PAL = [
    '#ffffff', '#ffd76b', '#ff9a3c', '#ff5a2a', '#ff3b3b', '#7fe8ff', '#4aa8ff', '#c6f3ff',
    '#b388ff', '#ff6bd5', '#7dffb5', '#c8ff6b', '#ffb0c0', '#9b6bff', '#ffe9b0', '#8a7a70',
  ];
  Q.C = { white: 0, gold: 1, orange: 2, ember: 3, red: 4, cyan: 5, blue: 6, ice: 7, violet: 8, magenta: 9, jade: 10, lime: 11, pink: 12, purple: 13, cream: 14, ash: 15 };

  /* ---------- 英雄 ---------- */
  Q.HEROES = {
    guard: {
      id: 'guard', cls: '誓卫', name: '澄钧', en: 'OATHGUARD', color: '#ffcf6b', color2: '#ff8a3d', pc: 1,
      title: '持盾立誓的边境守卫',
      lore: '星坠那夜，他独自守住了最后一座烽台。如今他立下誓言：要把每一颗坠星踏碎。',
      hp: 150, spd: 150, armor: 2, crit: 0.05, critMul: 0, area: 1, might: 1, regen: 0.25, dr: 0.15,
      weapon: 'w_guard', skill: 'k_guard', skillCd: 7,
      passive: { name: '磐誓', desc: '受到的伤害降低 15%，自带 2 点护甲' },
      bars: [['生命', 5], ['攻击', 3], ['速度', 2], ['射程', 1], ['上手', 5]],
    },
    mage: {
      id: 'mage', cls: '星术师', name: '黎萤', en: 'ASTROMANCER', color: '#b49bff', color2: '#6be4ff', pc: 8,
      title: '读懂坠星的年轻术士',
      lore: '她在星屑里听见了低语——那些星辰不是自己坠落的，而是被什么东西拽了下来。',
      hp: 110, spd: 160, armor: 0, crit: 0.05, critMul: 0, area: 1.15, might: 1.05, regen: 0.2, dr: 0,
      weapon: 'w_mage', skill: 'k_mage', skillCd: 9,
      passive: { name: '星辉', desc: '范围 +15%，伤害 +5%' },
      bars: [['生命', 2], ['攻击', 4], ['速度', 3], ['射程', 5], ['上手', 4]],
    },
    ranger: {
      id: 'ranger', cls: '游猎者', name: '青隼', en: 'WAYFARER', color: '#6bffb5', color2: '#c8ff6b', pc: 10,
      title: '追猎坠星兽的旷野游侠',
      lore: '她追着一头坠星兽走过了三个季节。弓弦每响一次，旷野便安静一分。',
      hp: 115, spd: 176, armor: 0, crit: 0.12, critMul: 0.3, area: 1, might: 1, regen: 0.2, dr: 0,
      weapon: 'w_ranger', skill: 'k_ranger', skillCd: 5.5,
      passive: { name: '鹰眸', desc: '暴击率 +7%，暴击伤害 +30%，身法更快' },
      bars: [['生命', 3], ['攻击', 4], ['速度', 5], ['射程', 4], ['上手', 2]],
      unlockCost: 150,
    },
  };
  Q.HERO_ORDER = ['guard', 'mage', 'ranger'];

  /* ---------- 地域 ---------- */
  Q.BIOMES = [
    { id: 'ember', name: '烬原', en: 'EMBER PLAINS', sub: '坠星燃起的焦土', ground: '#1b100c', ground2: '#2a150f', ground3: '#3a1c12', crack: '#ff6a2a', crack2: '#ffb347', light: '#ffae6b', accent: '#ff6b4a', vign: '#0d0403', amb: 'ember', root: 50 },
    { id: 'frost', name: '霜林', en: 'FROST WOODS', sub: '星寒冻结的古林', ground: '#0b1820', ground2: '#13293a', ground3: '#1f3c4f', crack: '#7fe8ff', crack2: '#e6fbff', light: '#bfe9ff', accent: '#7fd8ff', vign: '#01060b', amb: 'snow', root: 52 },
    { id: 'abyss', name: '星陨深渊', en: 'STARFALL ABYSS', sub: '群星坠落之处', ground: '#0a0714', ground2: '#170c28', ground3: '#26103a', crack: '#c86bff', crack2: '#ff6bd5', light: '#d9b8ff', accent: '#c58bff', vign: '#030109', amb: 'motes', root: 47 },
  ];

  /* ---------- 魔物 ----------
     arch: swarm 扑咬 / runner 疾奔 / split 分裂 / mini 碎块 / caster 施法 / charger 冲锋 / bomber 自爆 / brute 巨兽 / elite 精英 */
  Q.ENEMIES = {
    imp: { name: '烬鬼', arch: 'swarm', biome: 0, r: 12, hp: 13, spd: 76, dmg: 8, xp: 1, mass: 1, pc: 3 },
    magma: { name: '熔核', arch: 'split', biome: 0, r: 17, hp: 34, spd: 54, dmg: 10, xp: 2, mass: 1.6, child: 'magmaS', nChild: 3, pc: 2 },
    magmaS: { name: '熔核碎块', arch: 'mini', biome: 0, r: 9, hp: 7, spd: 98, dmg: 6, xp: 1, mass: 0.6, pc: 2 },
    cult: { name: '灰烬术士', arch: 'caster', biome: 0, r: 13, hp: 24, spd: 60, dmg: 8, xp: 3, mass: 1, shot: 'fire', shotCd: 2.9, range: 270, pc: 2 },
    horn: { name: '熔角兽', arch: 'charger', biome: 0, r: 17, hp: 48, spd: 64, dmg: 14, xp: 3, mass: 2.4, pc: 3 },
    beetle: { name: '爆焰虫', arch: 'bomber', biome: 0, r: 12, hp: 15, spd: 112, dmg: 20, xp: 2, mass: 0.8, pc: 1 },
    ogre: { name: '黑岩蛮兽', arch: 'brute', biome: 0, r: 24, hp: 150, spd: 44, dmg: 18, xp: 8, mass: 5, pc: 3 },
    warden: { name: '黑曜守卫', arch: 'elite', biome: 0, r: 28, hp: 560, spd: 54, dmg: 20, xp: 30, mass: 9, shot: 'fire', pc: 2 },

    wolf: { name: '霜狼', arch: 'runner', biome: 1, r: 12, hp: 15, spd: 116, dmg: 9, xp: 1, mass: 1, pc: 7 },
    crystal: { name: '冰晶簇', arch: 'split', biome: 1, r: 17, hp: 38, spd: 52, dmg: 10, xp: 2, mass: 1.8, child: 'crystalS', nChild: 3, pc: 5 },
    crystalS: { name: '碎冰', arch: 'mini', biome: 1, r: 9, hp: 8, spd: 100, dmg: 6, xp: 1, mass: 0.6, pc: 7 },
    wisp: { name: '霜魄', arch: 'caster', biome: 1, r: 13, hp: 26, spd: 66, dmg: 9, xp: 3, mass: 0.8, shot: 'ice', shotCd: 2.6, range: 290, pc: 5 },
    stag: { name: '冰角鹿', arch: 'charger', biome: 1, r: 18, hp: 54, spd: 70, dmg: 15, xp: 3, mass: 2.4, pc: 7 },
    bloat: { name: '寒霜囊', arch: 'bomber', biome: 1, r: 13, hp: 17, spd: 102, dmg: 22, xp: 2, mass: 0.9, pc: 5 },
    yeti: { name: '雪魈', arch: 'brute', biome: 1, r: 25, hp: 170, spd: 48, dmg: 20, xp: 8, mass: 5, pc: 7 },
    sentry: { name: '寒铁哨卫', arch: 'elite', biome: 1, r: 28, hp: 620, spd: 58, dmg: 22, xp: 30, mass: 9, shot: 'ice', pc: 5 },

    shade: { name: '虚蚀者', arch: 'swarm', biome: 2, r: 12, hp: 16, spd: 88, dmg: 10, xp: 1, mass: 1, pc: 9 },
    egg: { name: '裂隙卵', arch: 'split', biome: 2, r: 18, hp: 42, spd: 50, dmg: 12, xp: 2, mass: 1.8, child: 'eggS', nChild: 4, pc: 8 },
    eggS: { name: '裂隙幼体', arch: 'mini', biome: 2, r: 9, hp: 8, spd: 110, dmg: 7, xp: 1, mass: 0.6, pc: 9 },
    eye: { name: '观星眼', arch: 'caster', biome: 2, r: 14, hp: 28, spd: 62, dmg: 10, xp: 3, mass: 0.9, shot: 'void', shotCd: 2.4, range: 300, pc: 9 },
    husk: { name: '星骸', arch: 'charger', biome: 2, r: 18, hp: 58, spd: 72, dmg: 16, xp: 3, mass: 2.4, pc: 8 },
    nova: { name: '湮星', arch: 'bomber', biome: 2, r: 12, hp: 18, spd: 120, dmg: 24, xp: 2, mass: 0.8, pc: 0 },
    colos: { name: '虚空巨像', arch: 'brute', biome: 2, r: 26, hp: 190, spd: 46, dmg: 22, xp: 8, mass: 5, pc: 8 },
    herald: { name: '星甲统领', arch: 'elite', biome: 2, r: 29, hp: 680, spd: 60, dmg: 24, xp: 30, mass: 9, shot: 'void', pc: 9 },
  };

  /* ---------- 远征三程 ---------- */
  Q.STAGES = [
    {
      biome: 0, boss: 'heyan', elite: 'warden', count: [30, 140], rate: [1.7, 5.6], hpMul: 1, dmgMul: 1,
      roster: [['imp', 0, 10], ['magma', 0.08, 4], ['cult', 0.2, 3], ['horn', 0.33, 3], ['beetle', 0.46, 3], ['ogre', 0.6, 2]],
      ring: 'imp', rush: 'horn',
      events: [[0.2, 'ring'], [0.36, 'elite'], [0.52, 'swarm'], [0.64, 'rush'], [0.76, 'elite'], [0.86, 'ring']],
    },
    {
      biome: 1, boss: 'linyuan', elite: 'sentry', count: [100, 210], rate: [3.8, 8], hpMul: 3.3, dmgMul: 1.55,
      roster: [['wolf', 0, 10], ['crystal', 0.04, 4], ['wisp', 0.1, 4], ['stag', 0.22, 3.5], ['bloat', 0.34, 3], ['yeti', 0.48, 2]],
      ring: 'wolf', rush: 'stag',
      events: [[0.1, 'ring'], [0.22, 'elite'], [0.36, 'rush'], [0.46, 'swarm'], [0.58, 'elite'], [0.68, 'rush'], [0.78, 'ring'], [0.9, 'elite']],
    },
    {
      biome: 2, boss: 'yuanyao', elite: 'herald', count: [140, 300], rate: [5, 11], hpMul: 8, dmgMul: 2.0,
      roster: [['shade', 0, 10], ['egg', 0.04, 4], ['eye', 0.1, 3], ['husk', 0.2, 3], ['nova', 0.32, 3], ['colos', 0.44, 2]],
      ring: 'shade', rush: 'husk',
      events: [[0.12, 'ring'], [0.24, 'elite'], [0.4, 'swarm'], [0.5, 'rush'], [0.6, 'elite'], [0.72, 'ring'], [0.82, 'elite'], [0.92, 'swarm']],
    },
  ];

  /* ---------- 首领 ---------- */
  Q.BOSSES = {
    heyan: { name: '赫焱', title: '烬原之主', full: '熔心巨像 · 赫焱', r: 58, hp: 9000, spd: 60, dmg: 20, color: '#ff7a3a', pc: 2,
      line: '炽热的心核在岩躯中跳动——它曾是一颗坠落的星。' },
    linyuan: { name: '凛渊', title: '霜林古灵', full: '霜角古灵 · 凛渊', r: 54, hp: 19000, spd: 95, dmg: 23, color: '#9fe8ff', pc: 5,
      line: '古林的守护灵被星寒冻结了千年，如今只认得杀意。' },
    yuanyao: { name: '渊曜', title: '坠星之主', full: '坠星之主 · 渊曜', r: 66, hp: 55000, spd: 42, dmg: 30, color: '#d38bff', pc: 8,
      line: '拽落群星的，正是它。' },
  };

  /* ---------- 升级 ----------
     kind: weapon 主武器 / skill 技能 / spell 法术 / passive 天赋 */
  Q.UPG = {
    w_guard: { kind: 'weapon', hero: 'guard', name: '裂空斩', glyph: '斩', color: '#ffcf6b', max: 5, evo: 'e_guard',
      lv: ['向瞄准方向挥出弧形斩击，击退敌人', '斩击伤害 +30%', '斩击范围与弧度扩大', '同时向身后再斩一刀', '每次斩击释放飞行的月牙剑气'] },
    w_mage: { kind: 'weapon', hero: 'mage', name: '星弹', glyph: '星', color: '#b49bff', max: 5, evo: 'e_mage',
      lv: ['发射会自动追踪的星辰飞弹', '星弹 +1', '星弹伤害 +30%', '星弹 +1', '星弹命中时爆裂，波及周围'] },
    w_ranger: { kind: 'weapon', hero: 'ranger', name: '穿云箭', glyph: '箭', color: '#6bffb5', max: 5, evo: 'e_ranger',
      lv: ['快速射出可穿透多名敌人的利箭', '穿透 +1，伤害 +15%', '每次多射 1 支箭', '伤害 +30%', '每第 4 次射击额外射出 2 支'] },
    k_guard: { kind: 'skill', hero: 'guard', name: '镇岳盾冲', glyph: '盾', color: '#ffb347', max: 3,
      lv: ['举盾冲锋（无敌），撞飞并眩晕沿途敌人，落地震荡', '冷却 -20%，伤害 +40%', '震荡范围扩大；冲锋后「固守」2.5 秒，受到伤害减半'] },
    k_mage: { kind: 'skill', hero: 'mage', name: '星爆新星', glyph: '爆', color: '#8fd0ff', max: 3,
      lv: ['引爆新星，击退周围敌人并留下迟滞星域', '冷却 -20%，伤害 +40%', '片刻后再次爆发；星域会将敌人吸向中心'] },
    k_ranger: { kind: 'skill', hero: 'ranger', name: '影跃·棘阱', glyph: '阱', color: '#c8ff6b', max: 3,
      lv: ['向后翻跃（无敌），原地留下缠绕敌人的棘阱，随后爆裂', '冷却 -20%，落点再留一个棘阱', '棘阱爆裂范围 +40%，且必定暴击'] },

    orbit: { kind: 'spell', name: '星环刃', glyph: '刃', color: '#ffe08a', max: 5, evo: 'e_orbit',
      lv: ['2 柄星刃环绕身旁，切割靠近的敌人', '星刃 +1', '星刃伤害 +50%', '星刃 +1，环绕半径扩大', '星刃 +1，转速加快'] },
    chain: { kind: 'spell', name: '掣雷', glyph: '雷', color: '#8fd8ff', max: 5, evo: 'e_chain',
      lv: ['召来闪电，在敌人之间跳跃 3 次', '跳跃 +1', '冷却 -18%', '伤害 +40%', '跳跃 +2，每次施放两道'] },
    flame: { kind: 'spell', name: '焚步', glyph: '焰', color: '#ff8a3d', max: 5, evo: 'e_flame',
      lv: ['所过之处留下灼烧的火焰', '火焰伤害 +50%', '火焰持续更久', '火焰范围扩大', '火焰伤害 +50%'] },
    frost: { kind: 'spell', name: '凛霜脉冲', glyph: '霜', color: '#9fe8ff', max: 5, evo: 'e_frost',
      lv: ['周期释放寒霜脉冲，伤害并减速周围敌人', '脉冲范围扩大', '伤害 +60%', '冷却 -20%', '30% 几率冻结敌人'] },
    meteor: { kind: 'spell', name: '星坠', glyph: '陨', color: '#ffb86b', max: 5, evo: 'e_meteor',
      lv: ['召唤陨星砸向敌群', '陨星 +1', '伤害 +45%', '爆炸范围扩大', '陨星 +1'] },
    sword: { kind: 'spell', name: '灵剑', glyph: '剑', color: '#8affc8', max: 5, evo: 'e_sword',
      lv: ['召出 2 柄追踪敌人的灵剑', '灵剑 +1', '伤害 +50%', '灵剑 +1', '穿透 +2，伤害 +15%'] },
    disc: { kind: 'spell', name: '月轮', glyph: '轮', color: '#d9e6ff', max: 5, evo: 'e_disc',
      lv: ['掷出往返的月轮，贯穿沿途敌人', '月轮 +1', '月轮变大', '伤害 +50%', '月轮 +1'] },

    might: { kind: 'passive', name: '锋锐', glyph: '锋', color: '#ff7a5a', max: 5, per: '伤害 +12%' },
    haste: { kind: 'passive', name: '迅捷', glyph: '迅', color: '#ffd36b', max: 5, per: '攻击与法术冷却 -8%' },
    swift: { kind: 'passive', name: '疾风', glyph: '疾', color: '#9dffb0', max: 5, per: '移动速度 +8%' },
    magnet: { kind: 'passive', name: '星引', glyph: '引', color: '#7fe8ff', max: 5, per: '拾取范围 +30%' },
    vital: { kind: 'passive', name: '坚韧', glyph: '韧', color: '#ff8aa8', max: 5, per: '最大生命 +20，每秒回复 +0.3' },
    area: { kind: 'passive', name: '广域', glyph: '域', color: '#c69bff', max: 5, per: '攻击与法术范围 +10%' },
    crit: { kind: 'passive', name: '鹰眼', glyph: '鹰', color: '#ffe66b', max: 5, per: '暴击率 +5%，暴击伤害 +15%' },
    multi: { kind: 'passive', name: '裂影', glyph: '影', color: '#b0a0ff', max: 3, per: '投射物数量 +1' },
    wis: { kind: 'passive', name: '慧心', glyph: '慧', color: '#8ff0ff', max: 5, per: '经验获取 +10%' },
    armor: { kind: 'passive', name: '磐甲', glyph: '甲', color: '#e0bf94', max: 5, per: '护甲 +1（每次受伤减免 1 点）' },
    leech: { kind: 'passive', name: '噬魂', glyph: '噬', color: '#ff5a7a', max: 5, per: '每次击杀回复 0.25 生命' },
  };
  Q.SPELLS = ['orbit', 'chain', 'flame', 'frost', 'meteor', 'sword', 'disc'];
  Q.PASSIVES = ['might', 'haste', 'swift', 'magnet', 'vital', 'area', 'crit', 'multi', 'wis', 'armor', 'leech'];

  Q.EVOS = {
    e_guard: { base: 'w_guard', need: 'armor', name: '千钧斩', glyph: '钧', desc: '斩击更大更重；每第 3 次挥砍化为环身旋斩并掀起震波' },
    e_mage: { base: 'w_mage', need: 'wis', name: '群星低语', glyph: '辰', desc: '星弹命中后分裂为两枚追踪小星，伤害 +30%' },
    e_ranger: { base: 'w_ranger', need: 'might', name: '贯日', glyph: '曜', desc: '利箭化为光矢，无限穿透；每第 5 次射击散射 7 支' },
    e_orbit: { base: 'orbit', need: 'area', name: '星河旋舞', glyph: '河', desc: '内外两重星刃逆向旋转、呼吸起伏，伤害翻倍' },
    e_chain: { base: 'chain', need: 'crit', name: '九霄雷殛', glyph: '霄', desc: '天雷连劈三道，落点爆裂，并在敌群中跳跃 6 次' },
    e_flame: { base: 'flame', need: 'swift', name: '燎原', glyph: '燎', desc: '烈焰更大更猛并点燃敌人；燃烧者倒下时留下火海' },
    e_frost: { base: 'frost', need: 'vital', name: '永冬之心', glyph: '冬', desc: '脉冲冻结一切，冻结的敌人受到伤害 +50%；每 8 秒凝成冰甲抵挡一次伤害' },
    e_meteor: { base: 'meteor', need: 'multi', name: '星陨天幕', glyph: '幕', desc: '陨星如雨倾泻，落点燃起星火' },
    e_sword: { base: 'sword', need: 'haste', name: '万剑归宗', glyph: '宗', desc: '十二柄灵剑环身待命，连绵不绝地射向敌人' },
    e_disc: { base: 'disc', need: 'magnet', name: '望舒引月', glyph: '望', desc: '巨月盘旋往复，碾碎沿途敌人并牵引星晶' },
  };

  /* ---------- 符文盘（永久强化） ---------- */
  Q.RUNES = [
    { id: 'hp', name: '坚体', glyph: '坚', max: 5, base: 20, per: 8, fmt: (v) => `最大生命 +${v}%` },
    { id: 'dmg', name: '锐锋', glyph: '锐', max: 5, base: 24, per: 5, fmt: (v) => `伤害 +${v}%` },
    { id: 'spd', name: '迅步', glyph: '步', max: 3, base: 20, per: 4, fmt: (v) => `移动速度 +${v}%` },
    { id: 'mag', name: '星引', glyph: '引', max: 3, base: 15, per: 15, fmt: (v) => `拾取范围 +${v}%` },
    { id: 'xp', name: '慧光', glyph: '慧', max: 5, base: 22, per: 6, fmt: (v) => `经验获取 +${v}%` },
    { id: 'cd', name: '疾咒', glyph: '咒', max: 3, base: 30, per: 6, fmt: (v) => `技能冷却 -${v}%` },
    { id: 'armor', name: '磐身', glyph: '磐', max: 3, base: 30, per: 1, fmt: (v) => `护甲 +${v}` },
    { id: 'regen', name: '回春', glyph: '春', max: 3, base: 25, per: 0.25, fmt: (v) => `每秒回复 +${v} 生命` },
    { id: 'reroll', name: '重铸', glyph: '铸', max: 3, base: 28, per: 1, fmt: (v) => `每局重铸选项 +${v} 次` },
    { id: 'dust', name: '星运', glyph: '运', max: 5, base: 30, per: 10, fmt: (v) => `星尘获取 +${v}%` },
    { id: 'choice', name: '天择', glyph: '择', max: 1, base: 160, per: 1, fmt: () => '升级时多 1 个选项' },
    { id: 'revive', name: '涅槃', glyph: '涅', max: 1, base: 200, per: 1, fmt: () => '每局可复活一次（恢复一半生命）' },
  ];
  Q.runeCost = (rune, rank) => Math.round(rune.base * Math.pow(1.65, rank));
  Q.runeLv = (id) => Q.save.runes[id] | 0;

  /* ---------- 成就 ---------- */
  Q.ACH = {
    'first-boss': '击败首个首领',
    'frost': '踏入霜林',
    'abyss': '直面深渊',
    'victory': '通关远征',
    'quick-win': '速战告捷',
    'kills-1000': '单局千斩',
    'evolve': '初次进化',
    'flawless': '无伤斩首',
    'level-30': '登峰 · 等级 30',
  };

  /* ---------- 模式 ---------- */
  Q.MODES = {
    normal: { id: 'normal', name: '远征', sub: '约 11 分钟 · 三程三首领', stageDur: 160, xpMul: 1.12, bossMul: 1, dustMul: 1 },
    quick: { id: 'quick', name: '速战', sub: '约 6 分钟 · 节奏加倍', stageDur: 80, xpMul: 2.35, bossMul: 0.7, dustMul: 0.6 },
  };
})();
