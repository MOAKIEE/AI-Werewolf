import { PlayerServer } from './PlayerServer';
import { PlayerConfig } from './config/PlayerConfig';

export class PlayerManager {
  private players: Map<number, PlayerServer> = new Map();
  private configs: Map<number, PlayerConfig> = new Map();
  private defaultConfig: PlayerConfig;
  private globalApiKey?: string;
  private globalProvider?: string;
  private globalModel?: string;
  private globalBaseURL?: string;

  constructor(defaultConfig: PlayerConfig) {
    this.defaultConfig = defaultConfig;
  }

  createPlayer(playerId: number, personality?: string): PlayerServer {
    if (this.players.has(playerId)) {
      console.log(`⚠️  Player ${playerId} already exists, returning existing instance`);
      return this.players.get(playerId)!;
    }

    const config: PlayerConfig = {
      ...this.defaultConfig,
      game: {
        ...this.defaultConfig.game,
        personality: personality || this.defaultConfig.game.personality,
      }
    };

    const player = new PlayerServer(config);
    this.players.set(playerId, player);
    this.configs.set(playerId, config);

    if (this.globalApiKey) {
      player.setApiKey(this.globalApiKey, this.globalProvider, this.globalModel, this.globalBaseURL);
    }

    console.log(`✅ Created player ${playerId} with personality: ${config.game.personality}`);
    return player;
  }

  removePlayer(playerId: number): boolean {
    const deleted = this.players.delete(playerId);
    this.configs.delete(playerId);

    if (deleted) {
      console.log(`🗑️  Removed player ${playerId}`);
    } else {
      console.log(`⚠️  Player ${playerId} not found`);
    }

    return deleted;
  }

  getPlayer(playerId: number): PlayerServer {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found. Please create the player first.`);
    }
    return player;
  }

  hasPlayer(playerId: number): boolean {
    return this.players.has(playerId);
  }

  getPlayerIds(): number[] {
    return Array.from(this.players.keys()).sort((a, b) => a - b);
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  getAllPlayersStatus(): Array<{ playerId: number; status: any }> {
    return Array.from(this.players.entries()).map(([playerId, player]) => ({
      playerId,
      status: player.getStatus(),
    }));
  }

  clear(): void {
    this.players.clear();
    this.configs.clear();
    console.log('🧹 Cleared all players');
  }

  healthCheck(): {
    total: number;
    active: number;
    playerIds: number[];
  } {
    const activeCount = Array.from(this.players.values()).filter(
      player => player.getStatus().gameId !== undefined
    ).length;

    return {
      total: this.players.size,
      active: activeCount,
      playerIds: this.getPlayerIds(),
    };
  }

  setApiKeyForAll(apiKey: string, provider?: string, model?: string, baseURL?: string): void {
    this.globalApiKey = apiKey;
    this.globalProvider = provider;
    this.globalModel = model;
    this.globalBaseURL = baseURL;

    this.players.forEach(player => {
      player.setApiKey(apiKey, provider, model, baseURL);
    });
    console.log(`🔑 Set API key for all ${this.players.size} players (provider: ${provider || 'default'}, model: ${model || 'default'}, baseURL: ${baseURL || 'default'})`);
  }

  getGlobalApiKey(): string | undefined {
    return this.globalApiKey;
  }
}
