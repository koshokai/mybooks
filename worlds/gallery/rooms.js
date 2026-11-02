/*
 * 展厅配置
 * 数据来自芝加哥艺术博物馆开放接口（api.artic.edu），只取公有领域（CC0）作品。
 * 每个展厅由若干位画家组成：q 为搜索词，match 用于核对 artist_title，cn 为中文名。
 * types: 只保留这些作品类型（null 表示不限）
 */
window.ROOMS = [
  {
    id: "impression", no: "I", name: "印象派之光", en: "The Light of Impressionism",
    wall: "#33473a", light: "#fff1d0", types: ["Painting"],
    intro: "十九世纪的巴黎，一群年轻画家把画架搬出画室，追逐转瞬即逝的光与空气。他们画干草堆、睡莲、舞者和雨中的街道——画的不是物体，而是光。",
    artists: [
      { q: "Claude Monet", match: "Monet", cn: "克劳德·莫奈" },
      { q: "Pierre-Auguste Renoir", match: "Renoir", cn: "雷诺阿" },
      { q: "Gustave Caillebotte", match: "Caillebotte", cn: "卡耶博特" },
      { q: "Camille Pissarro", match: "Pissarro", cn: "毕沙罗" },
      { q: "Edgar Degas", match: "Degas", cn: "德加" },
      { q: "Berthe Morisot", match: "Morisot", cn: "贝尔特·莫里索" },
      { q: "Alfred Sisley", match: "Sisley", cn: "西斯莱" },
      { q: "Edouard Manet", match: "Manet", cn: "马奈" },
    ],
  },
  {
    id: "post", no: "II", name: "星夜与色块", en: "Post-Impressionism",
    wall: "#1e2b47", light: "#ffe9b8", types: ["Painting"],
    intro: "梵高的笔触在燃烧，修拉用无数色点拼出一个星期天的下午，塞尚把自然还原成圆柱、球体与圆锥。印象派之后，色彩开始表达情绪与结构。",
    artists: [
      { q: "Vincent van Gogh", match: "Gogh", cn: "文森特·梵高" },
      { q: "Georges Seurat", match: "Seurat", cn: "乔治·修拉" },
      { q: "Paul Cezanne", match: "zanne", cn: "保罗·塞尚" },
      { q: "Paul Gauguin", match: "Gauguin", cn: "保罗·高更" },
      { q: "Henri de Toulouse-Lautrec", match: "Toulouse", cn: "图卢兹-罗特列克" },
      { q: "Paul Signac", match: "Signac", cn: "保罗·西涅克" },
      { q: "Odilon Redon", match: "Redon", cn: "奥迪隆·雷东" },
      { q: "Henri Rousseau", match: "Rousseau", cn: "亨利·卢梭" },
    ],
  },
  {
    id: "ukiyoe", no: "III", name: "浮世绘 · 东方之浪", en: "Ukiyo-e: Pictures of the Floating World",
    wall: "#e8dfcb", light: "#fffaf0", types: null, lightWall: true,
    intro: "江户时代的木版画，曾以几文钱的价格在街头售卖，后来漂洋过海，深深影响了莫奈与梵高。北斋的巨浪、广重的雨夜，是一个时代的速写。",
    artists: [
      { q: "Katsushika Hokusai", match: "Hokusai", cn: "葛饰北斋" },
      { q: "Utagawa Hiroshige", match: "Hiroshige", cn: "歌川广重" },
      { q: "Kitagawa Utamaro", match: "Utamaro", cn: "喜多川歌麿" },
      { q: "Utagawa Kuniyoshi", match: "Kuniyoshi", cn: "歌川国芳" },
      { q: "Suzuki Harunobu", match: "Harunobu", cn: "铃木春信" },
    ],
  },
  {
    id: "masters", no: "IV", name: "古典大师", en: "Old Masters",
    wall: "#4a1d24", light: "#ffe2b0", types: ["Painting"],
    intro: "从文艺复兴到巴洛克，光从画面深处升起。伦勃朗的暗部、格列柯拉长的人物、鲁本斯奔放的笔触——欧洲绘画在这里建立了它的语法。",
    artists: [
      { q: "El Greco", match: "Greco", cn: "埃尔·格列柯" },
      { q: "Rembrandt van Rijn", match: "Rembrandt", cn: "伦勃朗" },
      { q: "Peter Paul Rubens", match: "Rubens", cn: "鲁本斯" },
      { q: "Francisco Goya", match: "Goya", cn: "戈雅" },
      { q: "Jean-Baptiste-Simeon Chardin", match: "Chardin", cn: "夏尔丹" },
      { q: "Giovanni di Paolo", match: "Giovanni di Paolo", cn: "乔瓦尼·迪·保罗" },
      { q: "Hubert Robert", match: "Hubert Robert", cn: "休伯特·罗贝尔" },
      { q: "Jusepe de Ribera", match: "Ribera", cn: "里贝拉" },
    ],
  },
  {
    id: "nature", no: "V", name: "田野与山川", en: "Landscapes & Rural Life",
    wall: "#3a3226", light: "#ffeccc", types: ["Painting"],
    intro: "巴比松画派走进枫丹白露的森林，米勒画下弯腰的农人，柯罗的树林总笼着一层银灰色的雾。人与土地，是最古老也最动人的题材。",
    artists: [
      { q: "Jean-Francois Millet", match: "Millet", cn: "让-弗朗索瓦·米勒" },
      { q: "Jean-Baptiste-Camille Corot", match: "Corot", cn: "柯罗" },
      { q: "Gustave Courbet", match: "Courbet", cn: "库尔贝" },
      { q: "Jules Breton", match: "Jules Breton", cn: "儒勒·布雷东" },
      { q: "George Inness", match: "Inness", cn: "乔治·英尼斯" },
      { q: "Thomas Cole", match: "Thomas Cole", cn: "托马斯·科尔" },
      { q: "Eugene Delacroix", match: "Delacroix", cn: "德拉克洛瓦" },
    ],
  },
  {
    id: "america", no: "VI", name: "新大陆的肖像", en: "American Painters",
    wall: "#2a3038", light: "#fff0d6", types: ["Painting"],
    intro: "霍默笔下的大海与渔民，萨金特优雅的肖像，卡萨特温柔的母与子，惠斯勒的夜曲。十九世纪的美国画家在欧洲学艺，又画出了自己的大陆。",
    artists: [
      { q: "Winslow Homer", match: "Homer", cn: "温斯洛·霍默" },
      { q: "John Singer Sargent", match: "Sargent", cn: "约翰·辛格·萨金特" },
      { q: "Mary Cassatt", match: "Cassatt", cn: "玛丽·卡萨特" },
      { q: "James McNeill Whistler", match: "Whistler", cn: "惠斯勒" },
      { q: "William Merritt Chase", match: "Chase", cn: "威廉·梅里特·蔡斯" },
      { q: "Frederic Edwin Church", match: "Church", cn: "弗雷德里克·丘奇" },
    ],
  },
  {
    id: "ink", no: "VII", name: "水墨卷轴", en: "Chinese Painting",
    wall: "#ece4d1", light: "#fffaf0", types: null, lightWall: true, place: "China",
    intro: "立轴、手卷与册页。山水之间有隐士，花鸟之间有四季。中国画不求逼真，而求气韵——留白处，正是画意所在。",
    artists: [
      { q: "hanging scroll ink China", match: null, cn: null },
      { q: "handscroll ink landscape China", match: null, cn: null },
      { q: "album leaf China painting", match: null, cn: null },
      { q: "Qing dynasty painting ink", match: null, cn: null },
      { q: "Ming dynasty painting ink", match: null, cn: null },
    ],
  },
];

/* 常见画家中文名（展厅之外的作品也能显示中文） */
window.ARTIST_CN = Object.fromEntries(
  window.ROOMS.flatMap((r) => r.artists.filter((a) => a.cn).map((a) => [a.match, a.cn]))
);
