import { useRepo } from '../store'

export default function RepoPicker(): React.JSX.Element {
  const pickAndOpen = useRepo((s) => s.pickAndOpen)
  return (
    <button className="repo-picker" onClick={() => void pickAndOpen()}>
      Open repo…
    </button>
  )
}
