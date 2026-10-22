import Phaser from 'phaser';
import {
  AIState,
  CharacterConfig,
  CombatMode,
  distWorld,
  FormationType,
  isoToWorld,
  STARTING_SQUAD,
  TILE_HEIGHT,
  TILE_WIDTH,
  UnitAnimState,
  Vec2,
  worldToIso,
} from '../../../shared/types';
import { getFormationOffsets } from '../systems/FormationSystem';
import { NetworkClient } from '../systems/NetworkClient';

interface SquadMember {
  cfg: CharacterConfig;
  index: number;
  wx: number;
  wy: number;
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  atk: number;
  def: number;
  level: number;
  xp: number;
  animState: UnitAnimState;
  aiState: AIState;
  targetEnemyId: string | null;
  lastAttackTime: number;
  skillReadyAt: number;
  tauntUntil: number;
  container: Phaser.GameObjects.Container;
  bodySprite: Phaser.GameObjects.Sprite;
  hpBarFill: Phaser.GameObjects.Rectangle;
  leaderRing: Phaser.GameObjects.Ellipse;
}

interface EnemyUnit {
  id: string;
  kind: 'SLIME' | 'WOLF';
  name: string;
  wx: number;
  wy: number;
  spawnX: number;
  spawnY: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  range: number;
  speed: number;
  xpReward: number;
  goldReward: number;
  targetMemberIndex: number | null;
  lastAttackTime: number;
  deadUntil: number | null;
  container: Phaser.GameObjects.Container;
  bodySprite: Phaser.GameObjects.Sprite;
  hpBarFill: Phaser.GameObjects.Rectangle;
}

interface LootDrop {
  id: string;
  wx: number;
  wy: number;
  gold: number;
  item: string | null;
  sprite: Phaser.GameObjects.Container;
}

export class MainScene extends Phaser.Scene {
  private mapSize = 36;
  private obstacles = new Set<string>();
  private squad: SquadMember[] = [];
  private enemies: EnemyUnit[] = [];
  private loots: LootDrop[] = [];
  private remoteSprites = new Map<string, Phaser.GameObjects.Container>();

  private leaderIndex = 0;
  private combatMode: CombatMode = 'MANUAL';
  private formation: FormationType = 'TRIANGLE';
  private squadHeading: Vec2 = { x: 1, y: 1 };
  private moveTarget: Vec2 | null = null;
  private autoAnchor: Vec2 = { x: 20, y: 20 };
  private joystickVec: Vec2 = { x: 0, y: 0 };

  private gold = 100;
  private potions = 5;
  private kills = 0;
  private inventory: string[] = [
    'Rusty Broadsword (Kael)',
    'Apprentice Staff (Lyra)',
    'Oak Shortbow (Riven)',
  ];
  private targetMarker!: Phaser.GameObjects.Ellipse;
  private net = new NetworkClient();

  constructor() {
    super('MainScene');
  }

  preload() {
    this.generateProceduralTextures();
  }

  create() {
    this.buildIsometricWorld();
    this.spawnSquad();
    this.spawnEnemies();
    this.setupInputsAndHUD();

    this.targetMarker = this.add
      .ellipse(0, 0, 34, 18)
      .setStrokeStyle(2, 0xf5c542, 0.9)
      .setVisible(false);

    // Try connecting to local Colyseus server if running
    this.net.connect().then((ok) => {
      const el = document.getElementById('net-status');
      if (el) {
        el.textContent = ok
          ? `Mode: Online (${this.net.sessionId})`
          : 'Mode: Offline / Local Prototype';
      }
    });
  }

  private generateProceduralTextures() {
    const g = this.make.graphics({ x: 0, y: 0 });

    const makeIsoTile = (key: string, fill: number, border: number, detail?: number) => {
      g.clear();
      g.fillStyle(fill, 1);
      g.lineStyle(1, border, 0.65);
      g.beginPath();
      g.moveTo(32, 0);
      g.lineTo(64, 16);
      g.lineTo(32, 32);
      g.lineTo(0, 16);
      g.closePath();
      g.fillPath();
      g.strokePath();
      if (detail) {
        g.fillStyle(detail, 0.5);
        g.fillRect(28, 13, 4, 2);
        g.fillRect(35, 17, 3, 2);
      }
      g.generateTexture(key, TILE_WIDTH, TILE_HEIGHT);
    };

    makeIsoTile('tile_town', 0x6c757d, 0x495057, 0xadb5bd);
    makeIsoTile('tile_grass', 0x2d6a4f, 0x1b4332, 0x40916c);
    makeIsoTile('tile_road', 0x9c6644, 0x7f5539, 0xb08968);
    makeIsoTile('tile_portal', 0x3a0ca3, 0x7209b7, 0x4cc9f0);

    g.clear();
    g.fillStyle(0x5c3a21, 1);
    g.fillRect(20, 36, 8, 20);
    g.fillStyle(0x1e5631, 1);
    g.fillCircle(24, 24, 18);
    g.fillStyle(0x2d8a4e, 1);
    g.fillCircle(20, 20, 12);
    g.generateTexture('prop_tree', 48, 60);

    g.clear();
    g.fillStyle(0x5a626a, 1);
    g.fillRoundedRect(6, 10, 32, 22, 6);
    g.fillStyle(0x88929b, 1);
    g.fillRoundedRect(10, 12, 20, 12, 4);
    g.generateTexture('prop_rock', 44, 34);

    const makeCharTex = (key: string, armorColor: number, accentColor: number) => {
      g.clear();
      g.fillStyle(0x222733, 1);
      g.fillRect(10, 36, 5, 10);
      g.fillRect(17, 36, 5, 10);
      g.fillStyle(armorColor, 1);
      g.fillRect(8, 18, 16, 19);
      g.fillStyle(accentColor, 1);
      g.fillRect(7, 18, 18, 4);
      g.fillStyle(0xf3d2b3, 1);
      g.fillRect(10, 7, 12, 11);
      g.fillStyle(accentColor, 1);
      g.fillRect(9, 5, 14, 5);
      g.fillStyle(0x111111, 1);
      g.fillRect(12, 11, 2, 2);
      g.fillRect(18, 11, 2, 2);
      g.generateTexture(key, 32, 48);
    };

    makeCharTex('char_kael', 0x2563eb, 0xfbbf24);
    makeCharTex('char_lyra', 0x7e22ce, 0x38bdf8);
    makeCharTex('char_riven', 0x15803d, 0xa3e635);
    makeCharTex('npc_captain', 0xb45309, 0xfde047);

    g.clear();
    g.fillStyle(0x06b6d4, 0.9);
    g.fillRoundedRect(4, 10, 24, 18, 8);
    g.fillStyle(0xffffff, 1);
    g.fillRect(9, 15, 3, 3);
    g.fillRect(19, 15, 3, 3);
    g.generateTexture('enemy_slime', 32, 30);

    g.clear();
    g.fillStyle(0x78350f, 1);
    g.fillRoundedRect(4, 12, 28, 16, 4);
    g.fillStyle(0x92400e, 1);
    g.fillRect(22, 6, 10, 10);
    g.fillStyle(0xef4444, 1);
    g.fillRect(28, 9, 2, 2);
    g.generateTexture('enemy_wolf', 36, 32);

    g.destroy();
  }

  private buildIsometricWorld() {
    for (let wx = 0; wx < this.mapSize; wx++) {
      for (let wy = 0; wy < this.mapSize; wy++) {
        const iso = worldToIso(wx, wy);
        const isTown = wx < 13 && wy < 13;
        const isPortal = (wx === 12 && wy === 12) || (wx === 15 && wy === 15);
        const isRoad = Math.abs(wx - wy) <= 1 && wx < 22;

        let tex = isTown ? 'tile_town' : 'tile_grass';
        if (isRoad) tex = 'tile_road';
        if (isPortal) tex = 'tile_portal';

        const tile = this.add.image(iso.x, iso.y, tex);
        tile.setDepth(iso.y - 1000);

        if (!isTown && !isRoad && !isPortal) {
          const hash = (wx * 73 + wy * 37) % 97;
          if (hash === 0 || hash === 11) {
            this.obstacles.add(`${wx},${wy}`);
            const tree = this.add.image(iso.x, iso.y - 18, 'prop_tree');
            tree.setDepth(iso.y);
          } else if (hash === 23) {
            this.obstacles.add(`${wx},${wy}`);
            const rock = this.add.image(iso.x, iso.y - 6, 'prop_rock');
            rock.setDepth(iso.y);
          }
        }
      }
    }

    this.createTownNPC(5, 5, 'Commander Vane (Quests)');
    this.createTownNPC(8, 4, 'Merchant Elia (Shop)');
    this.createTownLabel(12, 12, '🌀 Portal to Whispering Plains');
  }

  private createTownNPC(wx: number, wy: number, labelText: string) {
    const iso = worldToIso(wx, wy);
    const shadow = this.add.ellipse(iso.x, iso.y + 4, 24, 12, 0x000000, 0.45);
    shadow.setDepth(iso.y - 1);
    const spr = this.add.image(iso.x, iso.y - 14, 'npc_captain');
    spr.setDepth(iso.y);
    const lbl = this.add
      .text(iso.x, iso.y - 46, labelText, {
        fontSize: '11px',
        color: '#fde047',
        backgroundColor: 'rgba(0,0,0,0.65)',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5);
    lbl.setDepth(iso.y + 1);
  }

  private createTownLabel(wx: number, wy: number, text: string) {
    const iso = worldToIso(wx, wy);
    this.add
      .text(iso.x, iso.y - 26, text, {
        fontSize: '11px',
        color: '#67e8f9',
        backgroundColor: 'rgba(15,23,42,0.75)',
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(iso.y + 20);
  }

  private spawnSquad() {
    const startCoords: Vec2[] = [
      { x: 7, y: 7 },
      { x: 6, y: 8 },
      { x: 8, y: 6 },
    ];

    STARTING_SQUAD.forEach((cfg, idx) => {
      const pos = startCoords[idx];
      const iso = worldToIso(pos.x, pos.y);

      const shadow = this.add.ellipse(0, 4, 24, 12, 0x000000, 0.45);
      const leaderRing = this.add
        .ellipse(0, 4, 32, 16)
        .setStrokeStyle(2, 0xf5c542, 1)
        .setVisible(idx === 0);

      const texKey = `char_${cfg.id}`;
      const bodySprite = this.add.sprite(0, -14, texKey);

      const hpBg = this.add.rectangle(0, -44, 30, 5, 0x111827);
      const hpBarFill = this.add.rectangle(-15, -44, 30, 5, 0x22c55e).setOrigin(0, 0.5);
      const nameTag = this.add
        .text(0, -54, cfg.name, {
          fontSize: '10px',
          color: '#f8fafc',
        })
        .setOrigin(0.5);

      const container = this.add.container(iso.x, iso.y, [
        shadow,
        leaderRing,
        bodySprite,
        hpBg,
        hpBarFill,
        nameTag,
      ]);
      container.setDepth(iso.y);

      this.squad.push({
        cfg,
        index: idx,
        wx: pos.x,
        wy: pos.y,
        hp: cfg.maxHp,
        mp: cfg.maxMp,
        maxHp: cfg.maxHp,
        maxMp: cfg.maxMp,
        atk: cfg.atk,
        def: cfg.def,
        level: 1,
        xp: 0,
        animState: 'IDLE',
        aiState: 'IDLE',
        targetEnemyId: null,
        lastAttackTime: 0,
        skillReadyAt: 0,
        tauntUntil: 0,
        container,
        bodySprite,
        hpBarFill,
        leaderRing,
      });
    });

    this.cameras.main.startFollow(this.squad[0].container, true, 0.1, 0.1);
  }

  private spawnEnemies() {
    const spots: Array<{ x: number; y: number; kind: 'SLIME' | 'WOLF' }> = [
      { x: 16, y: 15, kind: 'SLIME' },
      { x: 18, y: 17, kind: 'SLIME' },
      { x: 15, y: 19, kind: 'SLIME' },
      { x: 20, y: 16, kind: 'SLIME' },
      { x: 21, y: 21, kind: 'WOLF' },
      { x: 23, y: 19, kind: 'WOLF' },
      { x: 19, y: 24, kind: 'WOLF' },
      { x: 25, y: 23, kind: 'WOLF' },
      { x: 27, y: 26, kind: 'WOLF' },
      { x: 24, y: 28, kind: 'SLIME' },
    ];

    spots.forEach((sp, i) => {
      const isWolf = sp.kind === 'WOLF';
      const iso = worldToIso(sp.x, sp.y);
      const shadow = this.add.ellipse(0, 4, 24, 11, 0x000000, 0.4);
      const bodySprite = this.add.sprite(0, -10, isWolf ? 'enemy_wolf' : 'enemy_slime');
      const hpBg = this.add.rectangle(0, -30, 28, 4, 0x111827);
      const hpBarFill = this.add.rectangle(-14, -30, 28, 4, 0xef4444).setOrigin(0, 0.5);
      const nameTag = this.add
        .text(0, -39, isWolf ? 'Plains Wolf' : 'Mana Slime', {
          fontSize: '9px',
          color: '#fca5a5',
        })
        .setOrigin(0.5);

      const container = this.add.container(iso.x, iso.y, [
        shadow,
        bodySprite,
        hpBg,
        hpBarFill,
        nameTag,
      ]);
      container.setDepth(iso.y);

      const maxHp = isWolf ? 150 : 95;
      this.enemies.push({
        id: `enemy_${i}`,
        kind: sp.kind,
        name: isWolf ? 'Plains Wolf' : 'Mana Slime',
        wx: sp.x,
        wy: sp.y,
        spawnX: sp.x,
        spawnY: sp.y,
        hp: maxHp,
        maxHp,
        atk: isWolf ? 22 : 14,
        def: isWolf ? 6 : 3,
        range: 1.45,
        speed: isWolf ? 2.45 : 1.85,
        xpReward: isWolf ? 45 : 28,
        goldReward: isWolf ? 18 : 10,
        targetMemberIndex: null,
        lastAttackTime: 0,
        deadUntil: null,
        container,
        bodySprite,
        hpBarFill,
      });
    });
  }

  private setupInputsAndHUD() {
    const squadPanel = document.getElementById('squad-panel')!;
    squadPanel.innerHTML = this.squad
      .map(
        (m, idx) => `
      <div class="char-card ${idx === 0 ? 'leader' : ''}" id="card-${idx}" data-idx="${idx}">
        <div class="char-header">
          <span>${m.cfg.name} <small id="lvl-${idx}">Lv1</small></span>
          <span class="char-role">${m.cfg.role.slice(0, 4)}</span>
        </div>
        <div class="bar-bg"><div class="hp-fill" id="hp-bar-${idx}"></div></div>
        <div class="bar-bg"><div class="mp-fill" id="mp-bar-${idx}"></div></div>
        <div class="char-state" id="state-${idx}">IDLE</div>
      </div>
    `
      )
      .join('');

    squadPanel.querySelectorAll('.char-card').forEach((el) => {
      el.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        const idx = Number((el as HTMLElement).dataset.idx);
        this.selectLeader(idx);
      });
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const worldPt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const wCoord = isoToWorld(worldPt.x, worldPt.y);
      const clampedX = Phaser.Math.Clamp(wCoord.x, 1, this.mapSize - 2);
      const clampedY = Phaser.Math.Clamp(wCoord.y, 1, this.mapSize - 2);

      const clickedEnemy = this.enemies.find(
        (e) =>
          e.deadUntil === null &&
          distWorld({ x: e.wx, y: e.wy }, { x: clampedX, y: clampedY }) < 1.25
      );

      if (clickedEnemy) {
        this.squad.forEach((m) => (m.targetEnemyId = clickedEnemy.id));
        this.spawnFloatingText(clickedEnemy.wx, clickedEnemy.wy, 'TARGET!', '#f5c542');
      } else {
        this.moveTarget = { x: clampedX, y: clampedY };
        const iso = worldToIso(clampedX, clampedY);
        this.targetMarker.setPosition(iso.x, iso.y).setVisible(true);
      }
    });

    const joyZone = document.getElementById('joystick-zone')!;
    const joyKnob = document.getElementById('joystick-knob')!;
    let joyActive = false;
    const center = { x: 62, y: 62 };

    const updateJoy = (clientX: number, clientY: number) => {
      const rect = joyZone.getBoundingClientRect();
      const dx = clientX - (rect.left + center.x);
      const dy = clientY - (rect.top + center.y);
      const maxR = 38;
      const dist = Math.min(Math.hypot(dx, dy), maxR);
      const ang = Math.atan2(dy, dx);
      const kx = Math.cos(ang) * dist;
      const ky = Math.sin(ang) * dist;
      joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;

      const normX = kx / maxR;
      const normY = ky / maxR;
      this.joystickVec = {
        x: normX + normY,
        y: normY - normX,
      };
      this.moveTarget = null;
      this.targetMarker.setVisible(false);
    };

    joyZone.addEventListener('pointerdown', (e) => {
      joyActive = true;
      updateJoy(e.clientX, e.clientY);
    });
    window.addEventListener('pointermove', (e) => {
      if (joyActive) updateJoy(e.clientX, e.clientY);
    });
    window.addEventListener('pointerup', () => {
      joyActive = false;
      joyKnob.style.transform = 'translate(0px, 0px)';
      this.joystickVec = { x: 0, y: 0 };
    });

    document.querySelectorAll('#mode-group .hud-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mode-group .hud-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.combatMode = (btn as HTMLElement).dataset.mode as CombatMode;
        const leader = this.squad[this.leaderIndex];
        this.autoAnchor = { x: leader.wx, y: leader.wy };
        this.spawnFloatingText(leader.wx, leader.wy, `MODE: ${this.combatMode}`, '#63b3ed');
      });
    });

    document.querySelectorAll('#form-group .hud-btn[data-form]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document
          .querySelectorAll('#form-group .hud-btn[data-form]')
          .forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.formation = (btn as HTMLElement).dataset.form as FormationType;
      });
    });

    document.getElementById('btn-potion')!.addEventListener('click', () => this.useSquadPotion());
    document.getElementById('btn-portal')!.addEventListener('click', () => this.togglePortalTeleport());
    document.getElementById('btn-attack')!.addEventListener('click', () => this.manualFocusAttack());

    [0, 1, 2].forEach((idx) => {
      document.getElementById(`btn-skill-${idx}`)!.addEventListener('click', () => {
        this.triggerCharacterSkill(this.squad[idx], performance.now());
      });
    });

    const modal = document.getElementById('modal-overlay')!;
    document.getElementById('btn-inv')!.addEventListener('click', () => {
      this.renderInventoryModal();
      modal.style.display = modal.style.display === 'block' ? 'none' : 'block';
    });
    document.getElementById('btn-close-modal')!.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  private selectLeader(idx: number) {
    if (this.squad[idx].animState === 'DEAD') return;
    this.leaderIndex = idx;
    this.squad.forEach((m, i) => {
      m.leaderRing.setVisible(i === idx);
      document.getElementById(`card-${i}`)?.classList.toggle('leader', i === idx);
    });
    this.cameras.main.startFollow(this.squad[idx].container, true, 0.1, 0.1);
  }

  private togglePortalTeleport() {
    const leader = this.squad[this.leaderIndex];
    const inTown = leader.wx < 13 && leader.wy < 13;
    const dest = inTown ? { x: 16, y: 16 } : { x: 7, y: 7 };
    this.squad.forEach((m, i) => {
      m.wx = dest.x + (i - 1) * 0.8;
      m.wy = dest.y + (i - 1) * 0.5;
      m.targetEnemyId = null;
    });
    this.autoAnchor = { x: dest.x, y: dest.y };
    this.moveTarget = null;
    this.spawnFloatingText(
      dest.x,
      dest.y,
      inTown ? 'Entered Whispering Plains!' : 'Returned to Havenfall Town!',
      '#a855f7'
    );
  }

  private useSquadPotion() {
    if (this.potions <= 0) return;
    const needHeal = this.squad.some((m) => m.animState !== 'DEAD' && m.hp < m.maxHp);
    if (!needHeal) return;
    this.potions--;
    this.squad.forEach((m) => {
      if (m.animState !== 'DEAD') {
        m.hp = Math.min(m.maxHp, m.hp + Math.round(m.maxHp * 0.45));
        m.mp = Math.min(m.maxMp, m.mp + 45);
        this.spawnFloatingText(m.wx, m.wy, '+HP/MP', '#4ade80');
      }
    });
  }

  private manualFocusAttack() {
    const leader = this.squad[this.leaderIndex];
    const nearest = this.findBestTargetFor(leader, 8);
    if (nearest) {
      this.squad.forEach((m) => (m.targetEnemyId = nearest.id));
      if (this.combatMode === 'MANUAL') {
        this.moveTarget = { x: nearest.wx, y: nearest.wy };
      }
    }
  }

  update(time: number, delta: number) {
    const dt = delta / 1000;
    this.updateRespawnsAndRegen(time, dt);
    this.updateSquadAIAndMovement(time, dt);
    this.updateEnemiesAI(time, dt);
    this.syncRemotePlayers();
    this.updateHUDAndMinimap(time);
  }

  private syncRemotePlayers() {
    const leader = this.squad[this.leaderIndex];
    this.net.sendMoveIntention(
      {
        wx: leader.wx,
        wy: leader.wy,
        leaderIndex: this.leaderIndex,
        formation: this.formation,
        mode: this.combatMode,
      },
      performance.now()
    );

    for (const [sid, snap] of this.net.remoteSquads.entries()) {
      let cont = this.remoteSprites.get(sid);
      const iso = worldToIso(snap.wx, snap.wy);
      if (!cont) {
        const spr = this.add.sprite(0, -14, 'char_kael').setAlpha(0.8);
        const tag = this.add
          .text(0, -48, snap.name, { fontSize: '10px', color: '#93c5fd' })
          .setOrigin(0.5);
        cont = this.add.container(iso.x, iso.y, [spr, tag]);
        this.remoteSprites.set(sid, cont);
      }
      cont.setPosition(iso.x, iso.y).setDepth(iso.y);
    }
  }

  private updateRespawnsAndRegen(time: number, dt: number) {
    const leader = this.squad[this.leaderIndex];
    const inTown = leader.wx < 13 && leader.wy < 13;

    this.squad.forEach((m) => {
      if (m.animState === 'DEAD') {
        if (inTown) {
          m.animState = 'IDLE';
          m.hp = Math.round(m.maxHp * 0.5);
          m.mp = Math.round(m.maxMp * 0.5);
          m.bodySprite.setAngle(0).setAlpha(1);
        }
        return;
      }
      const regenMult = inTown ? 4.0 : 1.0;
      m.hp = Math.min(m.maxHp, m.hp + 2.2 * regenMult * dt);
      m.mp = Math.min(m.maxMp, m.mp + 3.5 * regenMult * dt);
    });

    this.enemies.forEach((e) => {
      if (e.deadUntil !== null && time >= e.deadUntil) {
        e.deadUntil = null;
        e.hp = e.maxHp;
        e.wx = e.spawnX;
        e.wy = e.spawnY;
        e.targetMemberIndex = null;
        e.container.setVisible(true);
      }
    });
  }

  private updateSquadAIAndMovement(time: number, dt: number) {
    const leader = this.squad[this.leaderIndex];

    if (this.combatMode === 'FULL_AUTO') {
      const lowMember = this.squad.find((m) => m.animState !== 'DEAD' && m.hp / m.maxHp < 0.38);
      if (lowMember && this.potions > 0) {
        this.useSquadPotion();
      }
      const partyAvgHp =
        this.squad.reduce((s, m) => s + m.hp / m.maxHp, 0) / this.squad.length;
      if (partyAvgHp < 0.25 && this.potions === 0 && leader.wx >= 13) {
        this.moveTarget = { x: 9, y: 9 };
        leader.aiState = 'RETREAT';
      }
    }

    const joyMag = Math.hypot(this.joystickVec.x, this.joystickVec.y);
    if (joyMag > 0.1) {
      const stepX = (this.joystickVec.x / joyMag) * leader.cfg.moveSpeed * dt;
      const stepY = (this.joystickVec.y / joyMag) * leader.cfg.moveSpeed * dt;
      this.squadHeading = { x: stepX, y: stepY };
      this.moveUnitWithAvoidance(leader, leader.wx + stepX, leader.wy + stepY);
      leader.animState = 'WALK';
      leader.aiState = 'IDLE';
    } else if (this.moveTarget) {
      const d = distWorld({ x: leader.wx, y: leader.wy }, this.moveTarget);
      if (d > 0.25) {
        const dx = this.moveTarget.x - leader.wx;
        const dy = this.moveTarget.y - leader.wy;
        this.squadHeading = { x: dx, y: dy };
        const step = Math.min(d, leader.cfg.moveSpeed * dt);
        this.moveUnitWithAvoidance(leader, leader.wx + (dx / d) * step, leader.wy + (dy / d) * step);
        leader.animState = 'WALK';
      } else {
        this.moveTarget = null;
        this.targetMarker.setVisible(false);
        leader.animState = 'IDLE';
      }
    }

    for (let i = this.loots.length - 1; i >= 0; i--) {
      const loot = this.loots[i];
      const collector = this.squad.find(
        (m) =>
          m.animState !== 'DEAD' &&
          distWorld({ x: m.wx, y: m.wy }, { x: loot.wx, y: loot.wy }) < 1.35
      );
      if (collector) {
        this.gold += loot.gold;
        if (loot.item) this.inventory.push(loot.item);
        this.spawnFloatingText(loot.wx, loot.wy, `+${loot.gold}G`, '#facc15');
        loot.sprite.destroy();
        this.loots.splice(i, 1);
      }
    }

    const offsets = getFormationOffsets(this.formation, this.squadHeading);

    this.squad.forEach((m, idx) => {
      if (m.animState === 'DEAD') return;

      let target =
        this.enemies.find((e) => e.id === m.targetEnemyId && e.deadUntil === null) || null;

      if (!target && this.combatMode !== 'MANUAL') {
        const radius = this.combatMode === 'HOLD' ? m.cfg.attackRange + 0.5 : 9.5;
        target = this.findBestTargetFor(m, radius);
        if (target) m.targetEnemyId = target.id;
      }

      if (
        this.combatMode === 'FULL_AUTO' &&
        idx === this.leaderIndex &&
        !target &&
        this.loots.length > 0
      ) {
        const nearLoot = this.loots[0];
        if (distWorld({ x: m.wx, y: m.wy }, { x: nearLoot.wx, y: nearLoot.wy }) < 8) {
          m.aiState = 'LOOT';
          this.stepTowards(m, nearLoot.wx, nearLoot.wy, dt);
          this.syncUnitVisual(m, time);
          return;
        }
      }

      if (target) {
        const distToEnemy = distWorld({ x: m.wx, y: m.wy }, { x: target.wx, y: target.wy });
        if (distToEnemy <= m.cfg.attackRange) {
          m.aiState = 'ATTACK';
          m.animState = 'ATTACK';
          this.performUnitAttack(m, target, time);
        } else if (
          this.combatMode !== 'HOLD' &&
          !(idx === this.leaderIndex && (joyMag > 0.1 || this.moveTarget))
        ) {
          m.aiState = 'CHASE';
          m.animState = 'WALK';
          this.stepTowards(m, target.wx, target.wy, dt);
        }
      } else {
        if (idx !== this.leaderIndex && this.combatMode !== 'HOLD') {
          const slotIndex = idx === 0 ? 1 : idx;
          const off = offsets[slotIndex] || { x: 0, y: 0 };
          const destX = leader.wx + off.x;
          const destY = leader.wy + off.y;
          const dSlot = distWorld({ x: m.wx, y: m.wy }, { x: destX, y: destY });
          if (dSlot > 0.35) {
            m.aiState = 'FOLLOW_FORMATION';
            m.animState = 'WALK';
            this.stepTowards(m, destX, destY, dt);
          } else {
            m.aiState = 'IDLE';
            m.animState = 'IDLE';
          }
        } else if (
          this.combatMode === 'FULL_AUTO' &&
          idx === this.leaderIndex &&
          !this.moveTarget &&
          joyMag <= 0.1
        ) {
          const dAnchor = distWorld({ x: m.wx, y: m.wy }, this.autoAnchor);
          if (dAnchor > 7.5) {
            m.aiState = 'RETURN_ANCHOR';
            this.stepTowards(m, this.autoAnchor.x, this.autoAnchor.y, dt);
          } else {
            m.aiState = 'SEEK_TARGET';
            m.animState = 'IDLE';
          }
        } else if (this.combatMode === 'HOLD') {
          m.aiState = 'HOLD';
          m.animState = 'IDLE';
        }
      }

      this.applySquadSeparation(m);
      this.syncUnitVisual(m, time);
    });
  }

  private findBestTargetFor(member: SquadMember, searchRadius: number): EnemyUnit | null {
    const candidates = this.enemies.filter(
      (e) =>
        e.deadUntil === null &&
        distWorld({ x: member.wx, y: member.wy }, { x: e.wx, y: e.wy }) <= searchRadius
    );
    if (candidates.length === 0) return null;

    if (member.cfg.role === 'GUARDIAN') {
      return candidates.sort((a, b) => {
        const aAggro = a.targetMemberIndex !== null ? -2 : 0;
        const bAggro = b.targetMemberIndex !== null ? -2 : 0;
        return (
          distWorld({ x: member.wx, y: member.wy }, { x: a.wx, y: a.wy }) +
          aAggro -
          (distWorld({ x: member.wx, y: member.wy }, { x: b.wx, y: b.wy }) + bAggro)
        );
      })[0];
    }

    if (member.cfg.role === 'ARCANIST') {
      return candidates.sort((a, b) => {
        const neighborsA = candidates.filter(
          (o) => distWorld({ x: a.wx, y: a.wy }, { x: o.wx, y: o.wy }) < 2.5
        ).length;
        const neighborsB = candidates.filter(
          (o) => distWorld({ x: b.wx, y: b.wy }, { x: o.wx, y: o.wy }) < 2.5
        ).length;
        return neighborsB - neighborsA;
      })[0];
    }

    return candidates.sort((a, b) => a.hp - b.hp)[0];
  }

  private performUnitAttack(member: SquadMember, target: EnemyUnit, time: number) {
    if (
      this.combatMode === 'FULL_AUTO' &&
      time >= member.skillReadyAt &&
      member.mp >= member.cfg.skillMpCost * 1.2
    ) {
      this.triggerCharacterSkill(member, time);
      return;
    }

    if (time - member.lastAttackTime < member.cfg.attackSpeedMs) return;
    member.lastAttackTime = time;

    const isCrit = member.cfg.role === 'RANGER' && Math.random() < 0.35;
    const rawDmg = Math.max(4, member.atk - target.def + Phaser.Math.Between(-2, 4));
    const finalDmg = isCrit ? Math.round(rawDmg * 1.75) : rawDmg;

    this.drawAttackEffect(member.wx, member.wy, target.wx, target.wy, member.cfg.color);
    this.damageEnemy(target, finalDmg, member.index, isCrit ? '#facc15' : '#ffffff', time);
  }

  private triggerCharacterSkill(member: SquadMember, time: number) {
    if (member.animState === 'DEAD') return;
    if (time < member.skillReadyAt || member.mp < member.cfg.skillMpCost) return;

    const target =
      this.enemies.find((e) => e.id === member.targetEnemyId && e.deadUntil === null) ||
      this.findBestTargetFor(member, 6.5);
    if (!target && member.cfg.role !== 'GUARDIAN') return;

    member.mp -= member.cfg.skillMpCost;
    member.skillReadyAt = time + member.cfg.skillCooldownMs;
    this.net.sendSkillIntention({ memberIndex: member.index, targetEnemyId: target?.id });

    if (member.cfg.role === 'GUARDIAN') {
      member.tauntUntil = time + 4500;
      this.spawnFloatingText(member.wx, member.wy, '🛡️ AEGIS TAUNT!', '#60a5fa');
      this.enemies.forEach((e) => {
        if (
          e.deadUntil === null &&
          distWorld({ x: member.wx, y: member.wy }, { x: e.wx, y: e.wy }) <= 4.5
        ) {
          e.targetMemberIndex = member.index;
          this.damageEnemy(e, Math.round(member.atk * 1.2), member.index, '#60a5fa', time);
        }
      });
    } else if (member.cfg.role === 'ARCANIST' && target) {
      this.spawnFloatingText(target.wx, target.wy, '✨ ARCANE NOVA!', '#c084fc');
      const iso = worldToIso(target.wx, target.wy);
      const ring = this.add.circle(iso.x, iso.y, 44, 0xa855f7, 0.35).setDepth(iso.y + 10);
      this.tweens.add({
        targets: ring,
        scale: 1.5,
        alpha: 0,
        duration: 380,
        onComplete: () => ring.destroy(),
      });

      this.enemies.forEach((e) => {
        if (
          e.deadUntil === null &&
          distWorld({ x: target.wx, y: target.wy }, { x: e.wx, y: e.wy }) <= 2.7
        ) {
          this.damageEnemy(e, Math.round(member.atk * 1.85), member.index, '#c084fc', time);
        }
      });
    } else if (member.cfg.role === 'RANGER' && target) {
      this.spawnFloatingText(target.wx, target.wy, '🏹 PIERCING CRIT!', '#4ade80');
      this.drawAttackEffect(member.wx, member.wy, target.wx, target.wy, 0x4ade80);
      this.damageEnemy(target, Math.round(member.atk * 2.4), member.index, '#4ade80', time);
    }
  }

  private damageEnemy(
    enemy: EnemyUnit,
    dmg: number,
    attackerIdx: number,
    color: string,
    time: number
  ) {
    enemy.hp = Math.max(0, enemy.hp - dmg);
    if (enemy.targetMemberIndex === null) enemy.targetMemberIndex = attackerIdx;
    this.spawnFloatingText(enemy.wx, enemy.wy, `-${dmg}`, color);

    if (enemy.hp <= 0) {
      enemy.deadUntil = time + 9000;
      enemy.container.setVisible(false);
      this.kills++;
      this.grantSquadExp(enemy.xpReward);
      this.spawnLoot(enemy.wx, enemy.wy, enemy.goldReward);
    }
  }

  private grantSquadExp(xpAmount: number) {
    this.squad.forEach((m) => {
      if (m.animState === 'DEAD') return;
      m.xp += xpAmount;
      const needed = m.level * 100;
      if (m.xp >= needed) {
        m.xp -= needed;
        m.level++;
        m.maxHp += 28;
        m.maxMp += 15;
        m.atk += 4;
        m.def += 2;
        m.hp = m.maxHp;
        m.mp = m.maxMp;
        this.spawnFloatingText(m.wx, m.wy, `LEVEL UP! Lv${m.level}`, '#fde047');
      }
    });
  }

  private spawnLoot(wx: number, wy: number, gold: number) {
    const iso = worldToIso(wx, wy);
    const orb = this.add.circle(0, 0, 6, 0xfacc15, 1).setStrokeStyle(2, 0xffffff);
    const cont = this.add.container(iso.x, iso.y, [orb]).setDepth(iso.y + 2);
    const dropItem = Math.random() < 0.25 ? 'Mystic Crystal' : null;
    this.loots.push({
      id: `loot_${Date.now()}_${Math.random()}`,
      wx,
      wy,
      gold,
      item: dropItem,
      sprite: cont,
    });
  }

  private updateEnemiesAI(time: number, dt: number) {
    this.enemies.forEach((e) => {
      if (e.deadUntil !== null) return;

      const tauntingGuardian = this.squad.find(
        (m) =>
          m.cfg.role === 'GUARDIAN' &&
          m.animState !== 'DEAD' &&
          time < m.tauntUntil &&
          distWorld({ x: m.wx, y: m.wy }, { x: e.wx, y: e.wy }) <= 5.0
      );
      if (tauntingGuardian) {
        e.targetMemberIndex = tauntingGuardian.index;
      }

      if (e.targetMemberIndex === null || this.squad[e.targetMemberIndex].animState === 'DEAD') {
        const nearMember = this.squad.find(
          (m) => m.animState !== 'DEAD' && distWorld({ x: m.wx, y: m.wy }, { x: e.wx, y: e.wy }) < 4.2
        );
        e.targetMemberIndex = nearMember ? nearMember.index : null;
      }

      if (e.targetMemberIndex !== null) {
        const target = this.squad[e.targetMemberIndex];
        if (target.wx < 13 && target.wy < 13) {
          e.targetMemberIndex = null;
          return;
        }
        const d = distWorld({ x: e.wx, y: e.wy }, { x: target.wx, y: target.wy });
        if (d <= e.range) {
          if (time - e.lastAttackTime >= 1350) {
            e.lastAttackTime = time;
            const shieldBonus = time < target.tauntUntil ? 6 : 0;
            const dmg = Math.max(2, e.atk - (target.def + shieldBonus));
            target.hp = Math.max(0, target.hp - dmg);
            this.spawnFloatingText(target.wx, target.wy, `-${dmg}`, '#f87171');
            if (target.hp <= 0) {
              target.animState = 'DEAD';
              target.aiState = 'IDLE';
              target.bodySprite.setAngle(90).setAlpha(0.5);
              if (this.leaderIndex === target.index) {
                const alive = this.squad.find((m) => m.animState !== 'DEAD');
                if (alive) this.selectLeader(alive.index);
              }
            }
          }
        } else if (d < 8.5) {
          const dx = target.wx - e.wx;
          const dy = target.wy - e.wy;
          e.wx += (dx / d) * e.speed * dt;
          e.wy += (dy / d) * e.speed * dt;
        } else {
          e.targetMemberIndex = null;
        }
      }

      const iso = worldToIso(e.wx, e.wy);
      e.container.setPosition(iso.x, iso.y).setDepth(iso.y);
      e.hpBarFill.width = 28 * (e.hp / e.maxHp);
    });
  }

  private stepTowards(unit: SquadMember, tx: number, ty: number, dt: number) {
    const d = distWorld({ x: unit.wx, y: unit.wy }, { x: tx, y: ty });
    if (d < 0.05) return;
    const step = Math.min(d, unit.cfg.moveSpeed * dt);
    const nx = unit.wx + ((tx - unit.wx) / d) * step;
    const ny = unit.wy + ((ty - unit.wy) / d) * step;
    this.moveUnitWithAvoidance(unit, nx, ny);
  }

  private moveUnitWithAvoidance(unit: SquadMember, nx: number, ny: number) {
    const tileKey = `${Math.round(nx)},${Math.round(ny)}`;
    if (!this.obstacles.has(tileKey)) {
      unit.wx = Phaser.Math.Clamp(nx, 1, this.mapSize - 2);
      unit.wy = Phaser.Math.Clamp(ny, 1, this.mapSize - 2);
      return;
    }
    if (!this.obstacles.has(`${Math.round(nx)},${Math.round(unit.wy)}`)) {
      unit.wx = nx;
    } else if (!this.obstacles.has(`${Math.round(unit.wx)},${Math.round(ny)}`)) {
      unit.wy = ny;
    }
  }

  private applySquadSeparation(member: SquadMember) {
    this.squad.forEach((other) => {
      if (other.index === member.index || other.animState === 'DEAD') return;
      const d = distWorld({ x: member.wx, y: member.wy }, { x: other.wx, y: other.wy });
      if (d > 0 && d < 0.72) {
        const push = (0.72 - d) * 0.25;
        member.wx += ((member.wx - other.wx) / d) * push;
        member.wy += ((member.wy - other.wy) / d) * push;
      }
    });
  }

  private syncUnitVisual(m: SquadMember, time: number) {
    const iso = worldToIso(m.wx, m.wy);
    m.container.setPosition(iso.x, iso.y);
    m.container.setDepth(iso.y);
    m.hpBarFill.width = 30 * (m.hp / m.maxHp);

    if (m.animState === 'WALK') {
      m.bodySprite.y = -14 + Math.sin(time * 0.015 + m.index) * 2.5;
    } else {
      m.bodySprite.y = -14;
    }
  }

  private drawAttackEffect(wx1: number, wy1: number, wx2: number, wy2: number, color: number) {
    const p1 = worldToIso(wx1, wy1);
    const p2 = worldToIso(wx2, wy2);
    const line = this.add
      .line(0, 0, p1.x, p1.y - 16, p2.x, p2.y - 12, color, 0.9)
      .setOrigin(0, 0)
      .setLineWidth(2.5)
      .setDepth(Math.max(p1.y, p2.y) + 15);
    this.tweens.add({ targets: line, alpha: 0, duration: 180, onComplete: () => line.destroy() });
  }

  private spawnFloatingText(wx: number, wy: number, msg: string, color: string) {
    const iso = worldToIso(wx, wy);
    const txt = this.add
      .text(iso.x, iso.y - 42, msg, {
        fontSize: '12px',
        fontStyle: 'bold',
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(iso.y + 50);

    this.tweens.add({
      targets: txt,
      y: iso.y - 68,
      alpha: 0,
      duration: 750,
      onComplete: () => txt.destroy(),
    });
  }

  private updateHUDAndMinimap(time: number) {
    const leader = this.squad[this.leaderIndex];
    const inTown = leader.wx < 13 && leader.wy < 13;
    const banner = document.getElementById('zone-banner')!;
    banner.textContent = inTown
      ? '🏰 Havenfall Town (Safe Zone)'
      : '⚔️ Whispering Plains (Hunting Grounds)';

    this.squad.forEach((m, i) => {
      const hpEl = document.getElementById(`hp-bar-${i}`);
      const mpEl = document.getElementById(`mp-bar-${i}`);
      const stEl = document.getElementById(`state-${i}`);
      const lvEl = document.getElementById(`lvl-${i}`);
      const cardEl = document.getElementById(`card-${i}`);
      if (hpEl) hpEl.style.width = `${(m.hp / m.maxHp) * 100}%`;
      if (mpEl) mpEl.style.width = `${(m.mp / m.maxMp) * 100}%`;
      if (stEl) stEl.textContent = m.animState === 'DEAD' ? 'DEAD (Town Revive)' : `${m.aiState}`;
      if (lvEl) lvEl.textContent = `Lv${m.level}`;
      if (cardEl) cardEl.classList.toggle('dead', m.animState === 'DEAD');

      const cdEl = document.getElementById(`sk-cd-${i}`)!;
      const rem = Math.max(0, m.skillReadyAt - time);
      if (rem > 0) {
        cdEl.style.display = 'flex';
        cdEl.textContent = (rem / 1000).toFixed(1);
      } else {
        cdEl.style.display = 'none';
      }
    });

    document.getElementById('quest-prog')!.textContent = `${Math.min(8, this.kills)}/8`;
    document.getElementById('gold-val')!.textContent = `${this.gold}`;
    document.getElementById('pot-val')!.textContent = `${this.potions}`;

    const canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#14261c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#3b4252';
      ctx.fillRect(0, 0, (13 / this.mapSize) * canvas.width, (13 / this.mapSize) * canvas.height);

      ctx.fillStyle = '#ef4444';
      this.enemies.forEach((e) => {
        if (e.deadUntil === null) {
          ctx.fillRect(
            (e.wx / this.mapSize) * canvas.width - 1.5,
            (e.wy / this.mapSize) * canvas.height - 1.5,
            3,
            3
          );
        }
      });

      this.squad.forEach((m, idx) => {
        ctx.fillStyle = idx === this.leaderIndex ? '#facc15' : '#38bdf8';
        ctx.fillRect(
          (m.wx / this.mapSize) * canvas.width - 2,
          (m.wy / this.mapSize) * canvas.height - 2,
          4,
          4
        );
      });
    }
  }

  private renderInventoryModal() {
    const el = document.getElementById('inv-list')!;
    const statsHtml = this.squad
      .map(
        (m) =>
          `<div><b>${m.cfg.name} (Lv${m.level})</b> — ATK: ${m.atk} | DEF: ${m.def} | XP: ${m.xp}/${m.level * 100}</div>`
      )
      .join('');
    const itemsHtml = this.inventory.map((it) => `<li>${it}</li>`).join('');
    el.innerHTML = `${statsHtml}<hr style="margin:6px 0;border-color:#4a5568;"/><b>Equipment & Loot:</b><ul style="padding-left:16px;">${itemsHtml}</ul>`;
  }
}
