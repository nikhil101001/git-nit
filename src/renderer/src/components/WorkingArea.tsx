// Right-panel view when the Working Directory node is selected: file lists +
// commit box on the left, the interactive diff on the right.

import StagingPanel from './StagingPanel'
import CommitBox from './CommitBox'
import DiffView from './DiffView'

export default function WorkingArea(): React.JSX.Element {
  return (
    <div className="work-area">
      <div className="work-files">
        <StagingPanel />
        <CommitBox />
      </div>
      <DiffView />
    </div>
  )
}
