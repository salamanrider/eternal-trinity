export type CombatMode = 'MANUAL' | 'AUTO_ATTACK' | 'FULL_AUTO' | 'HOLD';
export type FormationType = 'TRIANGLE' | 'LINE' | 'SPREAD';
export type CharacterRole = 'GUARDIAN' | 'ARCANIST' | 'RANGER';
export type UnitAnimState = 'IDLE' | 'WALK' | 'ATTACK' | 'HIT' | 'DEAD';
export type AIState =
  | 'IDLE'
  | 'FOLLOW_FORMATION'
  | 'SEEK_TARGET'
  | 'CHASE'
  | 'ATTACK'
  | 'RETREAT'
  | 'LOOT'
  | 'RETURN_ANCHOR'
  | 'HOLD';

export interface Vec2 {
  x: number;
  y: number;
}

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

// Convert world tile coordinates (wx, wy) to isometric screen coordinates (sx, sy)
export function worldToIso(wx: number, wy: number): Vec2 {
  return {
    x: (wx - wy) * (TILE_WIDTH / 2),
    y: (wx + wy) * (TILE_HEIGHT / 2),
  };
}

// Convert isometric screen coordinates (sx, sy) back to world tile coordinates (wx, wy)
export function isoToWorld(sx: number, sy: number): Vec2 {
  const halfW = TILE_WIDTH / 2;
  const halfH = TILE_HEIGHT / 2;
  return {
    x: (sx / halfW + sy / halfH) / 2,
    y: (sy / halfH - sx / halfW) / 2,
  };
}

export function distWorld(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface CharacterConfig {
  id: string;
  name: string;
  role: CharacterRole;
  color: number;
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  attackRange: number;
  attackSpeedMs: number;
  moveSpeed: number;
  skillName: string;
  skillMpCost: number;
  skillCooldownMs: number;
}

export const STARTING_SQUAD: CharacterConfig[] = [
  {
    id: 'kael',
    name: 'Kael',
    role: 'GUARDIAN',
    color: 0x3b82f6,
    maxHp: 420,
    maxMp: 100,
    atk: 26,
    def: 16,
    attackRange: 1.55,
    attackSpeedMs: 1050,
    moveSpeed: 3.1,
    skillName: 'Aegis Taunt',
    skillMpCost: 20,
    skillCooldownMs: 6000,
  },
  {
    id: 'lyra',
    name: 'Lyra',
    role: 'ARCANIST',
    color: 0xa855f7,
    maxHp: 230,
    maxMp: 220,
    atk: 38,
    def: 7,
    attackRange: 4.3,
    attackSpeedMs: 1350,
    moveSpeed: 2.9,
    skillName: 'Arcane Nova',
    skillMpCost: 35,
    skillCooldownMs: 7000,
  },
  {
    id: 'riven',
    name: 'Riven',
    role: 'RANGER',
    color: 0x22c55e,
    maxHp: 260,
    maxMp: 130,
    atk: 33,
    def: 9,
    attackRange: 5.0,
    attackSpeedMs: 800,
    moveSpeed: 3.35,
    skillName: 'Piercing Crit',
    skillMpCost: 25,
    skillCooldownMs: 5500,
  },
];

// Client-to-server intention payloads (Phase 2 Multiplayer)
export interface MoveIntentionPayload {
  wx: number;
  wy: number;
  leaderIndex: number;
  formation: FormationType;
  mode: CombatMode;
}

export interface SkillIntentionPayload {
  memberIndex: number;
  targetEnemyId?: string | null;
}
