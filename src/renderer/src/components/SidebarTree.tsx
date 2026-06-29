// Left sidebar: one collapsible reference tree (GitKraken §1.1) — Local,
// Remotes, Stashes, Tags, Pull Requests, Worktrees. Replaces the old BranchList
// and the former modal panels for stash/tags/GitHub/worktrees. Sections are
// added here as each is migrated off its modal.

import LocalSection from './sections/LocalSection'
import RemotesSection from './sections/RemotesSection'
import StashesSection from './sections/StashesSection'
import TagsSection from './sections/TagsSection'
import PullRequestsSection from './sections/PullRequestsSection'
import WorktreesSection from './sections/WorktreesSection'

export default function SidebarTree(): React.JSX.Element {
  return (
    <aside className="sidebar-tree">
      <LocalSection />
      <RemotesSection />
      <StashesSection />
      <TagsSection />
      <PullRequestsSection />
      <WorktreesSection />
    </aside>
  )
}
