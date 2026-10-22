import * as Colyseus from 'colyseus.js';
import { MoveIntentionPayload, SkillIntentionPayload } from '../../../shared/types';

export interface RemoteSquadSnapshot {
  sessionId: string;
  name: string;
  wx: number;
  wy: number;
  formation: string;
}

export class NetworkClient {
  private client: Colyseus.Client | null = null;
  private room: Colyseus.Room | null = null;
  public connected = false;
  public sessionId = 'local';
  public remoteSquads = new Map<string, RemoteSquadSnapshot>();
  private lastSendAt = 0;

  async connect(serverUrl = `ws://${window.location.hostname || 'localhost'}:2567`): Promise<boolean> {
    try {
      this.client = new Colyseus.Client(serverUrl);
      this.room = await this.client.joinOrCreate('world_room', {
        name: `Trinity_${Math.floor(100 + Math.random() * 899)}`,
      });
      this.sessionId = this.room.sessionId;
      this.connected = true;

      this.room.onMessage('world_snapshot', (payload: { squads: RemoteSquadSnapshot[] }) => {
        this.remoteSquads.clear();
        for (const sq of payload.squads) {
          if (sq.sessionId !== this.sessionId) {
            this.remoteSquads.set(sq.sessionId, sq);
          }
        }
      });

      this.room.onLeave(() => {
        this.connected = false;
      });
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }

  sendMoveIntention(payload: MoveIntentionPayload, now: number) {
    if (!this.connected || !this.room) return;
    if (now - this.lastSendAt < 100) return; // Rate limit 10Hz
    this.lastSendAt = now;
    this.room.send('intent_move', payload);
  }

  sendSkillIntention(payload: SkillIntentionPayload) {
    if (!this.connected || !this.room) return;
    this.room.send('intent_skill', payload);
  }
}
