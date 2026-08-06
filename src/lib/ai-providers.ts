import type { AiApiFormat, AiProvider, AppSettings, ModelConfig, ThinkingLevel } from '@/types'
import { uid } from './utils'

/**
 * AI 供应商预设与迁移工具
 * - 列出常见供应商以便快速添加
 * - 提供「自定义」选项让用户填写任意 OpenAI 兼容 / Responses API 端点
 */

export interface AiProviderPreset {
  presetId: string
  name: string
  apiFormat: AiApiFormat
  baseUrl: string
  /** 官网/ApiKey 申请地址，便于用户跳转 */
  apiKeyUrl?: string
  /** 默认推荐模型（仅作为占位提示，不强制） */
  defaultModel?: string
}

/**
 * 常见 AI 供应商预设列表
 * - 默认采用 OpenAI 兼容 /chat/completions 格式
 * - OpenAI 官方同时支持 Responses API，用户可在添加后切换 apiFormat
 */
export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    presetId: 'openai',
    name: 'OpenAI',
    apiFormat: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4o-mini',
  },
  {
    presetId: 'deepseek',
    name: 'DeepSeek',
    apiFormat: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    defaultModel: 'deepseek-chat',
  },
  {
    presetId: 'moonshot',
    name: 'Moonshot (Kimi)',
    apiFormat: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    defaultModel: 'moonshot-v1-8k',
  },
  {
    presetId: 'zhipu',
    name: '智谱 (Zhipu)',
    apiFormat: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    defaultModel: 'glm-4-flash',
  },
  {
    presetId: 'qwen',
    name: '通义千问 (Qwen)',
    apiFormat: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey',
    defaultModel: 'qwen-turbo',
  },
  {
    presetId: 'anthropic',
    name: 'Anthropic (Claude)',
    apiFormat: 'openai',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-3-5-haiku-latest',
  },
  {
    presetId: 'custom',
    name: '自定义',
    apiFormat: 'openai',
    baseUrl: '',
  },
]

/** 按 presetId 查找预设 */
export function findPreset(presetId: string): AiProviderPreset | undefined {
  return AI_PROVIDER_PRESETS.find((p) => p.presetId === presetId)
}

/** 创建一个空白自定义供应商 */
export function createEmptyProvider(): AiProvider {
  return {
    id: uid('provider'),
    name: '自定义供应商',
    presetId: null,
    apiFormat: 'openai',
    baseUrl: '',
    apiKey: '',
    models: [],
    modelConfigs: {},
  }
}

/** 从预设创建供应商 */
export function createProviderFromPreset(preset: AiProviderPreset): AiProvider {
  return {
    id: uid('provider'),
    name: preset.name,
    presetId: preset.presetId === 'custom' ? null : preset.presetId,
    apiFormat: preset.apiFormat,
    baseUrl: preset.baseUrl,
    apiKey: '',
    models: [],
    modelConfigs: {},
  }
}

/** 默认模型配置：思考关闭、无自定义参数 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  thinkingLevel: 'off',
}

/** 获取某模型的配置，缺失时返回默认值 */
export function getModelConfig(
  provider: AiProvider,
  modelId: string,
): ModelConfig {
  return provider.modelConfigs?.[modelId] ?? DEFAULT_MODEL_CONFIG
}

/** 更新某模型的配置（覆盖） */
export function setModelConfig(
  provider: AiProvider,
  modelId: string,
  config: ModelConfig,
): AiProvider {
  return {
    ...provider,
    modelConfigs: {
      ...provider.modelConfigs,
      [modelId]: config,
    },
  }
}

/** 删除某模型的配置 */
export function removeModelConfig(
  provider: AiProvider,
  modelId: string,
): AiProvider {
  if (!provider.modelConfigs?.[modelId]) return provider
  const next = { ...provider.modelConfigs }
  delete next[modelId]
  return { ...provider, modelConfigs: next }
}

/**
 * 根据供应商预设与模型名推断思考参数应该使用哪种字段
 * - openai:    reasoning_effort（o1/o3/o4 系列原生支持）
 * - deepseek:  thinking（{ type: 'enabled' | 'disabled' }）
 * - anthropic: thinking（{ type: 'enabled', budget_tokens }）
 * - 其它：尝试 reasoning_effort（多数 OpenAI 兼容代理也认）
 */
export type ThinkingParamStyle = 'reasoning_effort' | 'thinking_object' | 'none'

export function detectThinkingStyle(
  provider: AiProvider,
  modelId: string,
): ThinkingParamStyle {
  const pid = provider.presetId
  const m = modelId.toLowerCase()
  // OpenAI o 系列推理模型
  if (pid === 'openai' && /\bo[1-9]\b/.test(m)) return 'reasoning_effort'
  // DeepSeek reasoner / R1
  if (pid === 'deepseek' && /(reasoner|r1)/.test(m)) return 'thinking_object'
  // Anthropic Claude（extended thinking）
  if (pid === 'anthropic' && /claude/.test(m)) return 'thinking_object'
  // 通用：若模型名暗示推理则尝试 reasoning_effort
  if (/(reason|think|o1|o3|o4|r1)/.test(m)) return 'reasoning_effort'
  return 'none'
}

/**
 * 构造思考等级相关的请求参数
 * - off：返回空对象
 * - low/medium/high：根据 ThinkingParamStyle 输出对应字段
 */
export function buildThinkingParams(
  provider: AiProvider,
  modelId: string,
  level: ThinkingLevel,
): Record<string, unknown> {
  if (level === 'off') return {}
  const style = detectThinkingStyle(provider, modelId)
  if (style === 'none') return {}
  if (style === 'reasoning_effort') {
    return { reasoning_effort: level }
  }
  if (style === 'thinking_object') {
    // Anthropic/DeepSeek 风格：enabled + budget
    // budget 按 level 估算（4k/8k/16k）
    const budget = level === 'low' ? 4096 : level === 'medium' ? 8192 : 16384
    return { thinking: { type: 'enabled', budget_tokens: budget } }
  }
  return {}
}

/**
 * 迁移旧的单一 AI 配置到新的供应商列表
 * - 若旧字段 aiEndpoint/aiApiKey 非空且 aiProviders 为空，则创建一个默认供应商
 * - 默认模型取 aiModel 或 'gpt-4o-mini'
 */
export function migrateLegacySettings(settings: Partial<AppSettings>): {
  aiProviders: AiProvider[]
  defaultAiProviderId: string | null
  defaultAiModel: string
} {
  const hasLegacy =
    settings.aiEndpoint && settings.aiEndpoint.trim().length > 0
  if (hasLegacy && (!settings.aiProviders || settings.aiProviders.length === 0)) {
    const provider: AiProvider = {
      id: uid('provider'),
      name: '默认供应商',
      presetId: null,
      apiFormat: 'openai',
      baseUrl: settings.aiEndpoint!,
      apiKey: settings.aiApiKey ?? '',
      models: [],
      modelConfigs: {},
    }
    return {
      aiProviders: [provider],
      defaultAiProviderId: provider.id,
      defaultAiModel: settings.aiModel || 'gpt-4o-mini',
    }
  }
  return {
    aiProviders: (settings.aiProviders ?? []).map(normalizeProvider),
    defaultAiProviderId: settings.defaultAiProviderId ?? null,
    defaultAiModel: settings.defaultAiModel ?? settings.aiModel ?? 'gpt-4o-mini',
  }
}

/** 补齐旧 AiProvider 缺失的 models / modelConfigs 字段 */
export function normalizeProvider(p: AiProvider): AiProvider {
  return {
    ...p,
    models: p.models ?? [],
    modelConfigs: p.modelConfigs ?? {},
  }
}
