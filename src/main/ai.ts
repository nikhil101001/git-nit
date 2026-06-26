// AI commit messages (M3): a small pluggable `AiProvider` behind an opt-in flag.
// The default provider calls Anthropic's Claude (`claude-haiku-4-5` — cheap/fast)
// via the official SDK with a user-supplied key from safeStorage; an Ollama
// provider covers local/offline use. The key and the SDK live ONLY in the main
// process — the renderer asks "generate a message" and gets back text.

import Anthropic from '@anthropic-ai/sdk'
import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'

import * as auth from './auth'
import { AppError } from './errors'
import { COMMIT_SYSTEM_PROMPT, boundDiff } from './ai-bound'
import type { AiConfig, AiConfigInput, AiProviderId, AiResult } from '../shared/types'

const KEY_SECRET = 'anthropic.key'
const DEFAULT_MODEL = 'claude-haiku-4-5'
const OLLAMA_DEFAULT_MODEL = 'llama3.1'

interface StoredConfig {
  enabled: boolean
  provider: AiProviderId
  model: string
}

const configFile = (): string => join(app.getPath('userData'), 'ai-config.json')

function loadConfig(): StoredConfig {
  try {
    const c = JSON.parse(readFileSync(configFile(), 'utf8')) as Partial<StoredConfig>
    return {
      enabled: c.enabled === true,
      provider: c.provider === 'ollama' ? 'ollama' : 'anthropic',
      model: typeof c.model === 'string' && c.model ? c.model : DEFAULT_MODEL
    }
  } catch {
    return { enabled: false, provider: 'anthropic', model: DEFAULT_MODEL }
  }
}

function saveConfig(c: StoredConfig): void {
  writeFileSync(configFile(), JSON.stringify(c), { mode: 0o600 })
}

export function getConfig(): AiConfig {
  return { ...loadConfig(), hasKey: auth.hasSecret(KEY_SECRET) }
}

export function setConfig(input: AiConfigInput): AiConfig {
  const c = loadConfig()
  if (typeof input.enabled === 'boolean') c.enabled = input.enabled
  if (input.provider === 'anthropic' || input.provider === 'ollama') c.provider = input.provider
  if (typeof input.model === 'string' && input.model) c.model = input.model
  saveConfig(c)
  return getConfig()
}

export function setKey(provider: AiProviderId, key: string): void {
  if (provider === 'anthropic') auth.setSecret(KEY_SECRET, key)
  // Ollama is local and needs no key.
}

interface AiProvider {
  generate(input: string, model: string): Promise<string>
}

class AnthropicProvider implements AiProvider {
  async generate(input: string, model: string): Promise<string> {
    const key = auth.getSecret(KEY_SECRET)
    if (!key) throw new AppError('git', 'no Anthropic API key set — add one in AI settings')
    const client = new Anthropic({ apiKey: key })
    const msg = await client.messages
      .create({
        model: model || DEFAULT_MODEL,
        max_tokens: 512,
        system: COMMIT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: input }]
      })
      .catch((e: unknown) => {
        throw new AppError('git', `Anthropic request failed: ${(e as Error).message}`)
      })
    return msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
  }
}

class OllamaProvider implements AiProvider {
  async generate(input: string, model: string): Promise<string> {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || OLLAMA_DEFAULT_MODEL,
        system: COMMIT_SYSTEM_PROMPT,
        prompt: input,
        stream: false
      })
    }).catch(() => {
      throw new AppError('git', 'could not reach Ollama at http://localhost:11434')
    })
    if (!res.ok) throw new AppError('git', `Ollama error ${res.status}`)
    const data = (await res.json().catch(() => ({}))) as { response?: string }
    return String(data.response ?? '').trim()
  }
}

/** Generate a commit message from the staged diff (+ its --stat fallback). */
export async function generateCommitMessage(diff: string, stat: string): Promise<AiResult> {
  const config = loadConfig()
  if (!config.enabled) throw new AppError('git', 'AI commit messages are disabled')
  if (diff.trim() === '') throw new AppError('git', 'nothing staged to summarize')

  const { input, truncated } = boundDiff(diff, stat)
  const provider: AiProvider =
    config.provider === 'ollama' ? new OllamaProvider() : new AnthropicProvider()
  // Don't send a Claude model name to Ollama (and vice-versa is the user's call).
  const model =
    config.provider === 'ollama' && config.model.startsWith('claude')
      ? OLLAMA_DEFAULT_MODEL
      : config.model

  const message = await provider.generate(input, model)
  if (!message) throw new AppError('git', 'the model returned an empty message')
  return { message, truncated }
}
