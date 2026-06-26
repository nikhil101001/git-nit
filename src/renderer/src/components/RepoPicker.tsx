import * as actions from '../actions'

export default function RepoPicker(): React.JSX.Element {
  return (
    <button className="repo-picker" onClick={() => void actions.pickAndOpen()}>
      Open repo…
    </button>
  )
}
