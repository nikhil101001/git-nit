// Tags sidebar section (the browseable tag list moves out of a modal). Click a
// tag to select its commit in the graph; push/delete inline. Creation uses the
// small TagDialog popover (＋ creates at HEAD; the commit context menu targets a
// specific commit).

import { useTags } from '../../tag-store'
import { useGraph } from '../../graph-store'
import { useUi } from '../../ui-store'
import * as actions from '../../actions'
import SidebarSection from '../SidebarSection'

export default function TagsSection(): React.JSX.Element {
  const tags = useTags((s) => s.tags)
  const select = useGraph((s) => s.select)

  const action = (
    <button className="mini" title="New tag at HEAD" onClick={() => useUi.getState().setTagFor('HEAD')}>
      ＋
    </button>
  )

  return (
    <SidebarSection id="tags" title="Tags" count={tags.length} action={action}>
      <ul>
        {tags.map((t) => (
          <li key={t.name} className="sb-row">
            <button
              className="sb-row-main tag"
              title={`${t.name} → ${t.target.slice(0, 8)}`}
              onClick={() => select(t.target)}
            >
              {t.name}
            </button>
            <span className="sb-row-actions">
              <button className="mini" title="Push tag" onClick={() => void actions.tagPush(t.name)}>
                push
              </button>
              <button className="mini danger" title="Delete tag" onClick={() => void actions.tagDelete(t.name)}>
                ✕
              </button>
            </span>
          </li>
        ))}
        {tags.length === 0 && <li className="muted">no tags</li>}
      </ul>
    </SidebarSection>
  )
}
