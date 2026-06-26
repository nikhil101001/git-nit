// AI settings dialog: enable/disable, pick the provider + model, and store the
// API key (write-only — the field shows a placeholder when a key already exists,
// and the key itself never comes back from main).

import { useEffect, useState } from 'react'

import type { AiProviderId } from '../../../shared/types'
import { useAi } from '../ai-store'
import { useUi } from '../ui-store'

export default function AiSettings(): React.JSX.Element | null {
  const show = useUi((s) => s.showAiSettings)
  const close = (): void => useUi.getState().setShowAiSettings(false)
  const config = useAi((s) => s.config)
  const error = useAi((s) => s.error)
  const refresh = useAi((s) => s.refresh)

  const [key, setKey] = useState('')

  useEffect(() => {
    if (show) void refresh()
  }, [show, refresh])

  if (!show) return null

  const saveKey = async (): Promise<void> => {
    if (key.trim() === '') return
    await useAi.getState().setKey(config.provider, key.trim())
    setKey('')
  }

  return (
    <div className="modal-overlay" onMouseDown={close}>
      <div className="small-modal ai-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">AI commit messages</div>

        {error && <div className="banner error">{error}</div>}

        <label className="ai-row">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => void useAi.getState().patchConfig({ enabled: e.target.checked })}
          />
          Enable AI-generated commit messages
        </label>

        <label className="ai-field">
          Provider
          <select
            value={config.provider}
            onChange={(e) =>
              void useAi.getState().patchConfig({ provider: e.target.value as AiProviderId })
            }
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="ollama">Ollama (local)</option>
          </select>
        </label>

        <label className="ai-field">
          Model
          <input
            value={config.model}
            onChange={(e) => void useAi.getState().patchConfig({ model: e.target.value })}
          />
        </label>

        {config.provider === 'anthropic' && (
          <label className="ai-field">
            API key
            <input
              type="password"
              placeholder={config.hasKey ? '•••••••• (stored)' : 'sk-ant-…'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onBlur={() => void saveKey()}
            />
          </label>
        )}
        {config.provider === 'ollama' && (
          <p className="muted ai-note">
            Ollama runs locally at http://localhost:11434 — no API key needed.
          </p>
        )}

        <div className="modal-foot">
          <button onClick={close}>Done</button>
        </div>
      </div>
    </div>
  )
}
