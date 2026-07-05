export default function StatusBadge({ status }: { status: string }) {
  return <span className={`badge st-${status}`}>{status}</span>;
}
