// 星环列车 · 共享常量（纯数据，不依赖 three，可在 Node 中测试）

export const LANE_W = 2.3;
export const LANE_X = [-LANE_W, 0, LANE_W];
export const DECK_HW = LANE_W * 1.5 + 0.9; // 轨道甲板半宽

// 障碍尺寸
export const BAR_H = 0.95;      // 警示栏高度（跳过）
export const BAR_D = 0.4;       // 警示栏厚度
export const GANTRY_Y = 1.2;    // 信号门架下沿（滑过）
export const GANTRY_TOP = 3.6;
export const GANTRY_D = 0.6;
export const CONT_H = 2.6;      // 货柜高度（绕开）
export const ROOF_H = 2.4;      // 货运车厢车顶（可以奔跑）
export const SHUTTLE_H = 2.7;   // 迎面穿梭车
export const CAR_LEN = 10;      // 车厢长度
export const CAR_GAP = 1.1;     // 车厢间距
export const RAMP_LEN = 8;      // 坡道长度
export const OBST_HW = 1.05;    // 普通障碍半宽
export const TRAIN_HW = 1.08;   // 车厢半宽

// 小轨（玩家）
export const P_HW = 0.32;
export const P_HD = 0.35;
export const P_STAND = 1.55;
export const P_SLIDE = 0.7;
export const FOOT_HW = 0.22;

// 物理
export const GRAV = 34;
export const JUMP_H = 1.45;
export const JUMP_V = Math.sqrt(2 * GRAV * JUMP_H);
export const SLIDE_T = 0.7;
export const LANE_RATE = 17;
export const STEP_UP = 0.5;

// 道具
export const JET_T = 6.2;
export const JET_Y = 6.4;
export const MAGNET_T = 10;
export const DOUBLE_T = 12;
export const SHIELD_T = 30;
export const MAGNET_R = 7.5;

export const VIEW_AHEAD = 235;   // 渲染前方距离
export const GEN_AHEAD = 330;    // 生成前方距离

// 速度与难度随时间增长
export function speedAt(t) {
  return 14 + 16 * (1 - Math.exp(-t / 150));
}
export function diffAt(t) {
  return 1 - Math.exp(-Math.max(0, t - 5) / 115);
}

export const POW_INFO = {
  magnet: { name: '磁吸', color: '#6fc8ff', dur: MAGNET_T },
  shield: { name: '护盾', color: '#5ff2c4', dur: SHIELD_T },
  jet: { name: '喷射', color: '#ff8a3d', dur: JET_T },
  double: { name: '双倍', color: '#ff6fd8', dur: DOUBLE_T },
};

export const BIOME_SECONDS = 45;
