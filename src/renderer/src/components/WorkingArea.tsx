// Right-panel content for the Working Directory: the staged/unstaged file lists
// and the commit box. Selecting a file opens its diff in the center column (the
// DiffView), GitKraken-style — not inline here.

import StagingPanel from './StagingPanel'
import CommitBox from './CommitBox'

export default function WorkingArea(): React.JSX.Element {
  return (
    <div className="work-panel">
      <StagingPanel />
      <CommitBox />
    </div>
  )
}
