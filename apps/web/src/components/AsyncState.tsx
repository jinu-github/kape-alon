export function AsyncState({
  loading,
  error,
  onRetry,
  title,
}: {
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <section className="state-panel" role={error ? 'alert' : 'status'}>
      {loading && (
        <span className="loading-mark" aria-hidden="true">
          ≈
        </span>
      )}
      <h2>
        {loading
          ? 'Good things take a moment.'
          : (title ?? 'Let’s try that again.')}
      </h2>
      <p>
        {loading
          ? 'We’re connecting to the cafe. The server may be waking up — thank you for your patience.'
          : error?.message}
      </p>
      {onRetry && (
        <button className="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </section>
  );
}
