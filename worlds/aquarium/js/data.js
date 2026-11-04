// 物种、水草、造景素材与模板的资料（中文名、学名、原产地、习性、趣闻、价格、行为参数）

/*
 * beh：school 群游 | solo 独游 | betta 领地 | bottom 底栖 | glass 吸附玻璃 | shrimp 虾
 * zone：喜欢的水层（0 = 底床，1 = 水面）
 * size：模型长度（缸宽 10 个单位 ≈ 1 米，为了好看适当放大）
 */
export const SPECIES = [
  {
    id: "neon", name: "红绿灯", alias: "霓虹脂鲤", latin: "Paracheirodon innesi", price: 4, beh: "school", zone: [0.3, 0.7], speed: 0.62, size: 0.42, acc: "#3fd0ff",
    origin: "南美洲亚马孙河上游（秘鲁、哥伦比亚、巴西）的林间溪流",
    habit: "温和的群游鱼，喜欢 6 条以上结队活动，偏爱柔软偏酸的水和茂密的水草。",
    facts: [
      "身上那条电光蓝的条纹不是色素，而是皮肤里的虹彩细胞反射光线形成的。",
      "夜里休息时，它的蓝色和红色会明显变淡，天亮后再恢复鲜艳。",
      "它是全世界最受欢迎的观赏鱼之一，如今市面上的个体大多来自人工繁殖。",
    ],
  },
  {
    id: "rummy", name: "红鼻剪刀", alias: "红头剪刀", latin: "Hemigrammus bleheri", price: 5, beh: "school", zone: [0.25, 0.65], speed: 0.7, size: 0.46, acc: "#ff4a4a",
    origin: "南美洲巴西与哥伦比亚的内格罗河、梅塔河流域",
    habit: "群游非常整齐，常常整群同时转向，是水草缸里最受欢迎的“队列鱼”之一。",
    facts: [
      "鲜红的“鼻子”对环境很敏感，水质变差或受到惊吓时红色会变淡。",
      "尾鳍上黑白相间的条纹像一把小剪刀，中文名“红鼻剪刀”由此而来。",
      "在野外，它们生活在水色像浓茶一样的“黑水”河流里。",
    ],
  },
  {
    id: "lampeye", name: "蓝眼灯", alias: "诺曼灯眼鳉", latin: "Poropanchax normani", price: 4, beh: "school", zone: [0.62, 0.95], speed: 0.55, size: 0.34, acc: "#5fd8ff",
    origin: "西非（从塞内加尔到尼日利亚、喀麦隆及乍得湖一带）的溪流与湿地",
    habit: "成群在水体上层游动，胆子不大，喜欢有漂浮植物和柔和灯光的环境。",
    facts: [
      "眼睛上缘有一块亮蓝色的反光，在暗处也像小灯一样闪烁，“蓝眼灯”因此得名。",
      "它属于鳉形目，是生活在非洲的一类小型卵生鳉鱼。",
      "成鱼体长只有 4 厘米左右，是非常迷你的群游鱼。",
    ],
  },
  {
    id: "zebra", name: "斑马鱼", alias: "斑马担尼鱼", latin: "Danio rerio", price: 3, beh: "school", zone: [0.5, 0.9], speed: 0.95, size: 0.42, acc: "#7aa8ff",
    origin: "南亚（印度、孟加拉国、尼泊尔、巴基斯坦）的溪流、稻田与池塘",
    habit: "精力充沛，常成群在中上层快速穿梭，非常耐养。",
    facts: [
      "它是著名的模式生物，胚胎几乎透明，科学家可以直接观察器官的发育过程。",
      "斑马鱼的心肌、鳍和视网膜受损后都能再生。",
      "人类约 70% 的基因在斑马鱼身上能找到对应的同源基因。",
    ],
  },
  {
    id: "harlequin", name: "三角灯", alias: "异形波鱼", latin: "Trigonostigma heteromorpha", price: 5, beh: "school", zone: [0.35, 0.75], speed: 0.55, size: 0.42, acc: "#ff9a6a",
    origin: "东南亚马来半岛、新加坡、泰国南部及苏门答腊岛的溪流与泥炭沼泽",
    habit: "温和的群游鱼，喜欢在水草之间成群慢慢游弋。",
    facts: [
      "身体后半部有一块醒目的黑色三角形斑块，中文名“三角灯”由此而来。",
      "产卵时，它们会翻转身体，把卵粘在宽大水草叶片的背面。",
      "它原本被归入波鱼属（Rasbora），1999 年才被划入新设立的三角波鱼属。",
    ],
  },
  {
    id: "guppy", name: "孔雀鱼", alias: "百万鱼", latin: "Poecilia reticulata", price: 6, beh: "solo", zone: [0.5, 0.92], speed: 0.5, size: 0.44, acc: "#ffb43a", breeds: true,
    origin: "南美洲东北部（委内瑞拉、圭亚那、苏里南）及特立尼达和多巴哥等加勒比海岛屿",
    habit: "活泼好动、适应力强，常在中上层游动；雄鱼会不停地在雌鱼面前展示华丽的尾鳍。",
    facts: [
      "孔雀鱼是卵胎生鱼类，雌鱼直接产下能游泳的小鱼。",
      "雌鱼能把精子储存在体内，一次交配后可以先后生下好几窝小鱼。",
      "因为爱吃孑孓，它曾被引入世界许多地方帮助控制蚊子，所以有“百万鱼”的外号。",
    ],
  },
  {
    id: "betta", name: "斗鱼", alias: "暹罗斗鱼", latin: "Betta splendens", price: 15, beh: "betta", zone: [0.55, 0.92], speed: 0.32, size: 0.62, acc: "#ff3d6a", max: 1,
    origin: "东南亚湄公河流域（泰国、柬埔寨、老挝、越南）的稻田与沼泽",
    habit: "雄鱼领地意识很强，会张开鳃盖和鱼鳍“炫耀”；喜欢在水流平缓的上层慢慢游。",
    facts: [
      "它有一种叫“迷鳃”（迷器）的辅助呼吸器官，可以直接浮到水面呼吸空气。",
      "雄鱼会在水面吐出一团泡泡做巢，并独自守护卵和刚孵化的小鱼。",
      "两条雄性斗鱼相遇会激烈打斗，所以一缸只能养一条雄鱼。",
    ],
  },
  {
    id: "angel", name: "神仙鱼", alias: "燕鱼", latin: "Pterophyllum scalare", price: 18, beh: "solo", zone: [0.35, 0.8], speed: 0.3, size: 0.8, acc: "#e8eef2",
    origin: "南美洲亚马孙河流域及其支流（秘鲁、哥伦比亚、巴西）",
    habit: "优雅沉稳，喜欢在高大的水草和沉木之间缓缓巡游；成年后有一定领地性。",
    facts: [
      "扁平高挑的身形，让它能在水草茎和树根之间灵活穿梭、隐藏。",
      "它属于丽鱼科（慈鲷），亲鱼会把卵产在宽大的叶片或沉木表面并共同守护。",
      "腹部那两根细长的丝状“飘带”，其实是特化延长的腹鳍。",
    ],
  },
  {
    id: "discus", name: "七彩神仙", alias: "铁饼鱼", latin: "Symphysodon aequifasciatus", price: 30, beh: "solo", zone: [0.3, 0.7], speed: 0.26, size: 0.86, acc: "#ff7a3a",
    origin: "南美洲亚马孙河流域的缓流与湖泊",
    habit: "性格温和但比较敏感，喜欢安静、温暖（约 28–30℃）、柔软偏酸的水，常常小群聚在一起。",
    facts: [
      "亲鱼体表会分泌一层营养丰富的黏液，刚孵化的小鱼就靠“吃”父母身上的黏液长大。",
      "因为体色艳丽、身形浑圆，它常被称为“热带鱼之王”。",
      "紧张或身体不适时，它身上的深色横纹会变得更明显。",
    ],
  },
  {
    id: "goldfish", name: "金鱼", alias: "琉金", latin: "Carassius auratus", price: 12, beh: "solo", zone: [0.2, 0.75], speed: 0.3, size: 0.78, acc: "#ff8a1e",
    origin: "中国——由野生鲫鱼经过上千年的人工选育而来",
    habit: "温和贪吃，喜欢在底层翻找食物；本是冷水鱼，更适合凉爽一些的水温。",
    facts: [
      "早在宋代，中国人就开始在池塘里饲养金鱼，后来逐渐培育出数百个品种。",
      "金鱼的记忆远不止“7 秒”，实验表明它能记住训练内容达数月之久。",
      "金鱼没有真正的胃，食物直接进入肠道消化，所以更适合少量多餐。",
    ],
  },
  {
    id: "cory", name: "熊猫鼠鱼", alias: "熊猫兵鲶", latin: "Corydoras panda", price: 8, beh: "bottom", zone: [0, 0.1], speed: 0.28, size: 0.42, acc: "#f4ece4",
    origin: "南美洲秘鲁乌卡亚利河（Ucayali）上游的支流",
    habit: "群居的底栖鱼，用嘴边的触须在底沙里翻找食物，性格非常温和。",
    facts: [
      "它能用肠道吸收空气中的氧气，所以常会突然冲上水面“吸一口气”再潜回水底。",
      "背鳍和胸鳍的第一根鳍条是硬棘，遇到危险时会竖起并锁住。",
      "身体两侧覆盖着两排骨板而不是普通的鳞片，所以这类鱼也叫“甲鲶”。",
    ],
  },
  {
    id: "oto", name: "小精灵", alias: "耳斑鲶", latin: "Otocinclus affinis", price: 6, beh: "glass", zone: [0.1, 0.9], speed: 0.06, size: 0.36, acc: "#c8b27a",
    origin: "巴西东南部的溪流",
    habit: "小巧安静的除藻能手，喜欢吸附在玻璃和叶面上，成群生活更安心。",
    facts: [
      "它的嘴像吸盘，可以牢牢吸附在玻璃或叶片上，一边吸着一边刮食藻类。",
      "它属于甲鲶科（俗称“异型”）里的小型成员，身上覆盖着骨板。",
      "它非常依赖藻类和生物膜为食，刚开的“太干净”的新缸反而养不好它。",
    ],
  },
  {
    id: "shrimp", name: "樱花虾", alias: "红樱桃虾", latin: "Neocaridina davidi", price: 3, beh: "shrimp", zone: [0, 0.2], speed: 0.07, size: 0.3, acc: "#ff4a5a",
    origin: "东亚：中国（含台湾）、朝鲜半岛及越南北部的淡水溪流与池塘",
    habit: "整天忙着用小钳子在叶片和石头上拾取生物膜与藻类，喜欢成群活动，对水质比较敏感。",
    facts: [
      "鲜艳的红色是人工选育的结果，野生个体大多是不起眼的褐绿色。",
      "它会定期蜕壳长大，蜕下的旧壳常被自己或同伴吃掉，用来补充矿物质。",
      "雌虾把卵抱在腹部约三周，孵出来的就是迷你小虾，没有浮游幼体阶段。",
    ],
  },
];
export const SP = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export const PLANTS = [
  { id: "hairgrass", name: "牛毛毡", latin: "Eleocharis acicularis", price: 3, cat: "前景草坪", desc: "细如牛毛的草叶，铺满前景像一片小草原。" },
  { id: "hc", name: "迷你矮珍珠", latin: "Hemianthus callitrichoides", price: 3, cat: "前景草坪", desc: "世界上叶片最小的水草之一，能长成绒毯般的草坪。" },
  { id: "rotala", name: "宫廷草", latin: "Rotala rotundifolia", price: 3, cat: "有茎草", desc: "强光下顶端会泛出粉红色，适合成丛种在中后景。" },
  { id: "macrandra", name: "红蝴蝶", latin: "Rotala macrandra", price: 4, cat: "红色水草", desc: "叶片宽大鲜红，是水草缸里的“视觉焦点”。" },
  { id: "vallis", name: "苦草", latin: "Vallisneria spiralis", price: 3, cat: "后景长草", desc: "带状长叶能长到水面，随水流轻轻摇摆。" },
  { id: "sword", name: "皇冠草", latin: "Echinodorus grisebachii", price: 4, cat: "中景", desc: "莲座状的大叶片，原产南美，是经典的中景草。" },
  { id: "anubias", name: "小水榕", latin: "Anubias barteri var. nana", price: 3, cat: "附着植物", desc: "叶片厚实、生长缓慢，绑在石头或沉木上就能生长。", epi: true },
  { id: "fern", name: "铁皇冠", latin: "Microsorum pteropus", price: 3, cat: "附着植物", desc: "一种水生蕨类，适合附着在沉木上，耐阴好养。", epi: true },
  { id: "moss", name: "莫丝", latin: "Taxiphyllum barbieri", price: 2, cat: "附着植物", desc: "爪哇莫丝，细密的苔藓能把沉木裹成“老树”。", epi: true },
];
export const PL = Object.fromEntries(PLANTS.map((p) => [p.id, p]));

export const DECOR = [
  { id: "seiryu", t: "rock", name: "青龙石", price: 3, desc: "青灰色带白色纹理，棱角分明，是岩石造景的主角。" },
  { id: "matsu", t: "rock", name: "松皮石", price: 3, desc: "层层叠叠的纹理像松树皮，带着温暖的褐色调。" },
  { id: "pebble", t: "rock", name: "鹅卵石", price: 2, desc: "被溪水打磨得圆润光滑，适合点缀前景。" },
  { id: "spider", t: "wood", name: "杜鹃根", price: 5, desc: "枝杈纤细繁多，像一棵在水中伸展的小树。" },
  { id: "log", t: "wood", name: "沉木", price: 6, desc: "粗壮虬曲的老树根，沉稳而有力量。" },
];
export const DE = Object.fromEntries(DECOR.map((d) => [d.id, d]));

export const PRESETS = [
  { id: "iwagumi", name: "岩石造景", en: "Iwagumi", desc: "青龙石为骨，牛毛毡与矮珍珠铺成草原。" },
  { id: "forest", name: "沉木森林", en: "Driftwood Forest", desc: "杜鹃根搭成的林间小径，莫丝像青苔挂满枝头。" },
  { id: "dutch", name: "荷兰式水草", en: "Dutch Style", desc: "层次分明、色彩缤纷的水下花园。" },
];

export const NAMES = ["团团", "泡泡", "豆豆", "闪闪", "米粒", "糖糖", "波波", "果冻", "年糕", "汤圆", "布丁", "可乐", "芝麻", "小满", "阿福", "七七",
  "十一", "橘子", "青柠", "雪球", "麻薯", "饺子", "花卷", "栗子", "小鱼干", "蓝莓", "樱桃", "星星", "月饼", "元宝", "豌豆", "柚子", "奶茶", "布丁丁",
  "拾柒", "小舟", "知了", "阿喵", "春卷", "芋圆", "杏仁", "云朵", "小雨", "露露", "嘟嘟", "圆圆", "啵啵", "丸子", "可可", "椰子"];

export const MAX_FISH = 48;
