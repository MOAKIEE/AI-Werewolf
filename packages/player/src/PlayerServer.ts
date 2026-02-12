import {
  Role,
  GamePhase,
  type StartGameParams,
  type PlayerContext,
  type WitchContext,
  type SeerContext,
  type PlayerId,
  PersonalityType,
  VotingResponseType,
  SpeechResponseType,
  VotingResponseSchema,
  NightActionResponseType,
  WerewolfNightActionSchema,
  SeerNightActionSchema,
  WitchNightActionSchema,
  SpeechResponseSchema
} from '@ai-werewolf/types';
import { WerewolfPrompts } from './prompts';
import { generateObject, generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';
import {
  getAITelemetryConfig,
  createGameSession,
  type AITelemetryContext
} from './services/langfuse';
import { PlayerConfig } from './config/PlayerConfig';

const ROLE_SCHEMA_MAP = {
  [Role.WEREWOLF]: WerewolfNightActionSchema,
  [Role.SEER]: SeerNightActionSchema,
  [Role.WITCH]: WitchNightActionSchema,
} as const;

export class PlayerServer {
  private gameId?: string;
  private playerId?: number;
  private role?: Role;
  private teammates?: PlayerId[];
  private config: PlayerConfig;
  private runtimeApiKey?: string;
  private runtimeProvider?: string;
  private runtimeModel?: string;
  private runtimeBaseURL?: string;

  constructor(config: PlayerConfig) {
    this.config = config;
  }

  setApiKey(apiKey: string, provider?: string, model?: string, baseURL?: string): void {
    this.runtimeApiKey = apiKey;
    this.runtimeProvider = provider;
    this.runtimeModel = model;
    this.runtimeBaseURL = baseURL;
    console.log(`🔑 Runtime API key set (provider: ${provider || 'default'}, model: ${model || 'default'}, baseURL: ${baseURL || 'default'})`);
  }

  async startGame(params: StartGameParams): Promise<void> {
    this.gameId = params.gameId;
    this.role = params.role as Role;
    this.teammates = params.teammates;
    this.playerId = params.playerId;

    createGameSession(this.gameId, {
      playerId: this.playerId,
      role: this.role,
      teammates: this.teammates
    });
    
    if (this.config.logging.enabled) {
      console.log(`🎮 Player started game ${this.gameId} as ${this.role}`);
      console.log(`👤 Player ID: ${this.playerId}`);
      if (this.teammates && this.teammates.length > 0) {
        console.log(`🤝 Teammates: ${this.teammates.join(', ')}`);
      }
      console.log(`📊 Game ID (session): ${this.gameId}`);
    }
  }

  async speak(context: PlayerContext): Promise<SpeechResponseType> {
    console.log(`[speak] Player ${this.playerId} - role: ${this.role}, hasApiKey: ${!!(this.runtimeApiKey || this.config.ai.apiKey)}`);

    if (!this.role) {
      console.warn(`[speak] Player ${this.playerId} - No role assigned, returning fallback`);
      return { speech: "我需要仔细思考一下当前的情况。" };
    }

    const effectiveApiKey = this.runtimeApiKey || this.config.ai.apiKey;
    if (!effectiveApiKey) {
      console.warn(`[speak] Player ${this.playerId} - No API key set, returning fallback`);
      return { speech: "我需要仔细思考一下当前的情况。" };
    }

    return await this.generateSpeech(context);
  }

  async vote(context: PlayerContext): Promise<VotingResponseType> {
    console.log(`[vote] Player ${this.playerId} - role: ${this.role}, hasApiKey: ${!!(this.runtimeApiKey || this.config.ai.apiKey)}`);

    if (!this.role) {
      console.warn(`[vote] Player ${this.playerId} - No role assigned, returning fallback`);
      return { target: 1, reason: "默认投票给玩家1" };
    }

    const effectiveApiKey = this.runtimeApiKey || this.config.ai.apiKey;
    if (!effectiveApiKey) {
      console.warn(`[vote] Player ${this.playerId} - No API key set, returning fallback`);
      return { target: 1, reason: "默认投票给玩家1" };
    }

    return await this.generateVote(context);
  }

  async useAbility(context: PlayerContext | WitchContext | SeerContext): Promise<any> {
    const effectiveApiKey = this.runtimeApiKey || this.config.ai.apiKey;
    if (!this.role || !effectiveApiKey) {
      throw new Error("我没有特殊能力可以使用。");
    }

    return await this.generateAbilityUse(context);
  }

  async lastWords(): Promise<string> {
    return "很遗憾要离开游戏了，希望好人阵营能够获胜！";
  }

  getStatus() {
    return {
      gameId: this.gameId,
      playerId: this.playerId,
      role: this.role,
      teammates: this.teammates,
      isAlive: true,
      config: {
        personality: this.config.game.personality
      }
    };
  }

  getRole(): Role | undefined {
    return this.role;
  }

  getPlayerId(): number | undefined {
    return this.playerId;
  }

  getTeammates(): PlayerId[] | undefined {
    return this.teammates;
  }

  getPersonalityPrompt(): string {
    return this.buildPersonalityPrompt();
  }

  getGameId(): string | undefined {
    return this.gameId;
  }

  private async generateWithLangfuse<T>(
    params: {
      functionId: string;
      schema: any;
      prompt: string;
      maxOutputTokens?: number;
      temperature?: number;
      context?: PlayerContext;
    }
  ): Promise<T> {
    const { functionId, context, schema, prompt, maxOutputTokens, temperature } = params;

    console.log(`[${functionId}] prompt:`, prompt);
    console.log(`[${functionId}] schema:`, JSON.stringify(schema.shape, null, 2));

    const telemetryConfig = this.getTelemetryConfig(functionId, context);

    try {
      const result = await generateObject({
        model: this.getModel(),
        schema: schema,
        prompt: prompt,
        maxOutputTokens: maxOutputTokens || this.config.ai.maxTokens,
        temperature: temperature ?? this.config.ai.temperature,
        ...(telemetryConfig && { experimental_telemetry: telemetryConfig }),
      });

      console.log(`[${functionId}] result:`, JSON.stringify(result.object, null, 2));

      return result.object as T;
    } catch (error: any) {
      if (error?.name === 'AI_NoObjectGeneratedError' || error?.message?.includes('No object generated')) {
        console.log(`[${functionId}] generateObject failed, falling back to generateText with JSON mode`);
        return await this.generateWithFallback<T>(params);
      }
      console.error(`AI ${functionId} failed:`, error);
      throw new Error(`Failed to generate ${functionId}: ${error}`);
    }
  }

  private async generateWithFallback<T>(
    params: {
      functionId: string;
      schema: any;
      prompt: string;
      maxOutputTokens?: number;
      temperature?: number;
      context?: PlayerContext;
    }
  ): Promise<T> {
    const { functionId, schema, prompt, maxOutputTokens, temperature } = params;

    const schemaDescription = JSON.stringify(schema.shape, null, 2);
    const enhancedPrompt = `${prompt}

IMPORTANT: You must respond with a valid JSON object that matches this exact schema:
${schemaDescription}

Do not include any text before or after the JSON. Only output the JSON object.`;

    try {
      const result = await generateText({
        model: this.getModel(),
        prompt: enhancedPrompt,
        maxTokens: maxOutputTokens || this.config.ai.maxTokens,
        temperature: temperature ?? this.config.ai.temperature,
      });

      console.log(`[${functionId}] raw response:`, result.text);

      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      const cleaned = this.cleanParsedObject(parsed, schema);
      
      console.log(`[${functionId}] parsed result:`, JSON.stringify(cleaned, null, 2));

      return cleaned as T;
    } catch (error) {
      console.error(`AI ${functionId} fallback failed:`, error);
      throw new Error(`Failed to generate ${functionId} (fallback): ${error}`);
    }
  }

  private cleanParsedObject(obj: any, schema: any): any {
    const result: any = {};
    const schemaShape = schema.shape;
    
    for (const key of Object.keys(schemaShape)) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (value !== null && value !== undefined) {
          result[key] = value;
        }
      }
    }
    
    return result;
  }

  private getModel() {
    const provider = this.runtimeProvider || this.config.ai.provider;
    const model = this.runtimeModel || this.config.ai.model;
    const apiKey = this.runtimeApiKey || this.config.ai.apiKey;
    const baseURL = this.runtimeBaseURL || this.config.ai.baseURL;

    if (provider === 'openai') {
      const openai = createOpenAI({
        apiKey: apiKey || process.env.OPENAI_API_KEY,
      });
      return openai.chatModel(model);
    }

    if (provider === 'minimax') {
      const minimax = createOpenAICompatible({
        name: 'minimax',
        baseURL: baseURL || 'https://api.minimaxi.com/v1',
        apiKey: apiKey || process.env.MINIMAX_API_KEY,
      });
      return minimax.chatModel(model);
    }

    if (provider === 'custom' || provider === 'openrouter') {
      const openrouter = createOpenAICompatible({
        name: provider === 'custom' ? 'custom' : 'openrouter',
        baseURL: baseURL || 'https://openrouter.ai/api/v1',
        apiKey: apiKey || process.env.OPENROUTER_API_KEY,
        headers: provider === 'openrouter' ? {
          'HTTP-Referer': 'https://mojo.monad.xyz',
          'X-Title': 'AI Werewolf Game',
        } : undefined,
      });
      return openrouter.chatModel(model);
    }

    const openrouter = createOpenAICompatible({
      name: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey || process.env.OPENROUTER_API_KEY,
      headers: {
        'HTTP-Referer': 'https://mojo.monad.xyz',
        'X-Title': 'AI Werewolf Game',
      },
    });
    return openrouter.chatModel(model);
  }

  private async generateSpeech(context: PlayerContext): Promise<SpeechResponseType> {
    const prompt = this.buildSpeechPrompt(context);
    
    return this.generateWithLangfuse<SpeechResponseType>({
      functionId: 'speech-generation',
      schema: SpeechResponseSchema,
      prompt: prompt,
      context: context,
    });
  }

  private async generateVote(context: PlayerContext): Promise<VotingResponseType> {
    const prompt = this.buildVotePrompt(context);
    
    return this.generateWithLangfuse<VotingResponseType>({
      functionId: 'vote-generation',
      schema: VotingResponseSchema,
      prompt: prompt,
      context: context,
    });
  }

  private async generateAbilityUse(context: PlayerContext | WitchContext | SeerContext): Promise<NightActionResponseType> {
    if (this.role === Role.VILLAGER) {
      throw new Error('Village has no night action, should be skipped');
    }
    
    const schema = ROLE_SCHEMA_MAP[this.role!];
    if (!schema) {
      throw new Error(`Unknown role: ${this.role}`);
    }

    const prompt = this.buildAbilityPrompt(context);
    
    return this.generateWithLangfuse<NightActionResponseType>({
      functionId: 'ability-generation',
      schema: schema,
      prompt: prompt,
      context: context,
    });
  }

  private buildSpeechPrompt(context: PlayerContext): string {
    const speechPrompt = WerewolfPrompts.getSpeech(this, context);
    return speechPrompt + '\n\n请返回JSON格式，包含以下字段：\n- speech: 你的发言内容（20-50字的自然对话，其他玩家都能听到）\n\n请直接返回JSON格式的结果，不要包含其他说明文字。';
  }

  private buildVotePrompt(context: PlayerContext): string {
    const personalityPrompt = this.buildPersonalityPrompt();

    const additionalParams = {
      teammates: this.teammates
    };

    if (this.role === Role.SEER && 'investigatedPlayers' in context) {
      const seerContext = context as any;
      const checkResults: {[key: string]: 'good' | 'werewolf'} = {};
      
      for (const investigation of Object.values(seerContext.investigatedPlayers)) {
        const investigationData = investigation as { target: number; isGood: boolean };
        checkResults[investigationData.target.toString()] = investigationData.isGood ? 'good' : 'werewolf';
      }
      
      (additionalParams as any).checkResults = checkResults;
    }

    const votingPrompt = WerewolfPrompts.getVoting(this, context);
    return personalityPrompt + votingPrompt + '\n\n注意：请严格按照投票格式返回JSON，包含target和reason字段。';
  }

  private buildAbilityPrompt(context: PlayerContext | WitchContext | SeerContext): string {
    return WerewolfPrompts.getNightAction(this, context);
  }

  private getTelemetryConfig(
    functionId: string,
    context?: PlayerContext
  ) {
    return false;
  }

  private buildPersonalityPrompt(): string {
    if (!this.config.game.strategy) {
      return '';
    }

    const personalityType = this.config.game.strategy === 'balanced' ? 'cunning' : this.config.game.strategy as PersonalityType;
    
    return WerewolfPrompts.getPersonality(personalityType) + '\n\n';
  }
}
