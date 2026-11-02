/*
 * 各世界 / 游戏的开放状态（唯一开关）
 * false = 入口显示「建设中 / 即将开放」，按钮不可点；做完并检查通过后改成 true 即可。
 */
window.WX_READY = {
  // 首页的世界
  gallery: true,
  cosmos: true,
  flora: true,
  colors: true,
  game: true,   // 游戏厅大厅
  books: true,
  // 游戏厅里的游戏
  quest: true,
  racing: true,
  orbit: true,
  shadow: true,
  metro: true,
};
