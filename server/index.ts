import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server, Room, Client } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MoveIntentionPayload, SkillIntentionPayload } from '../shared/types';

interface ServerPlayerSquad {
  sessionId: string;
  name: string;
  wx: number;
  wy: number;
  leaderIndex: number;
  formation: string;
  mode: string;
  lastIntentAt: number;
}

class EternalWorldRoom extends Room {
  maxClients = 24;
  private squads = new Map<string, ServerPlayerSquad>();

  onCreate() {
    this.onMessage('intent_move', (client: Client, payload: MoveIntentionPayload) => {
      const sq = this.squads.get(client.sessionId);
      if (!sq) return;
      const now = Date.now();
      if (now - sq.lastIntentAt < 50) return; // Rate limit 20 msg/s
      sq.lastIntentAt = now;

      // Server-side validation & clamping
      sq.wx = Math.max(1, Math.min(34, Number(payload.wx) || sq.wx));
      sq.wy = Math.max(1, Math.min(34, Number(payload.wy) || sq.wy));
      sq.leaderIndex = [0, 1, 2].includes(payload.leaderIndex) ? payload.leaderIndex : 0;
      sq.formation = payload.formation || 'TRIANGLE';
      sq.mode = payload.mode || 'MANUAL';
    });

    this.onMessage('intent_skill', (client: Client, payload: SkillIntentionPayload) => {
      this.broadcast('skill_fx', {
        sessionId: client.sessionId,
        memberIndex: payload.memberIndex,
        targetEnemyId: payload.targetEnemyId,
      });
    });

    this.setSimulationInterval(() => {
      this.broadcast('world_snapshot', {
        squads: Array.from(this.squads.values()),
      });
    }, 100);
  }

  onJoin(client: Client, options: { name?: string }) {
    this.squads.set(client.sessionId, {
      sessionId: client.sessionId,
      name: options?.name || `Squad_${client.sessionId.slice(0, 4)}`,
      wx: 7,
      wy: 7,
      leaderIndex: 0,
      formation: 'TRIANGLE',
      mode: 'MANUAL',
      lastIntentAt: 0,
    });
  }

  onLeave(client: Client) {
    this.squads.delete(client.sessionId);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('world_room', EternalWorldRoom);

const PORT = Number(process.env.PORT || 2567);
gameServer.listen(PORT).then(() => {
  console.log(`[Eternal Trinity Server] Colyseus listening on ws://0.0.0.0:${PORT}`);
});
