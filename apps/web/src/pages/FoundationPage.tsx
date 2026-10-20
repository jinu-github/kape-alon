import { useQuery } from '@tanstack/react-query';
import { cafeConfig, healthResponseSchema } from '@kape/shared';

async function fetchHealth() {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/health`,
    { signal: AbortSignal.timeout(15000) },
  );
  const result = healthResponseSchema.parse(await response.json());
  if (!response.ok || result.status !== 'ok')
    throw new Error('Database unavailable');
  return result;
}

export function FoundationPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: 2,
    retryDelay: 3000,
    refetchOnWindowFocus: false,
  });
  return (
    <>
      <div className="bg-[#243f35] px-4 py-3 text-center text-xs tracking-wide text-white">
        Demo site with sample data
      </div>
      <main className="mx-auto max-w-5xl px-6 py-12 sm:px-12 sm:py-20">
        <header className="flex items-center justify-between gap-4 border-b border-[#243f35]/20 pb-6">
          <span className="font-serif text-2xl">{cafeConfig.name}</span>
          <span className="text-xs uppercase tracking-widest">
            Coffee & brunch
          </span>
        </header>
        <section className="max-w-2xl py-14">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em]">
            A little pause, a good cup.
          </p>
          <h1 className="font-serif text-5xl leading-[1.1] sm:text-7xl">
            {cafeConfig.tagline}
          </h1>
          <p className="mt-7 max-w-lg leading-7 text-[#4c5c53]">
            The foundation for a simpler cafe experience. Browse from your
            table, send your order to the kitchen, and enjoy the moment.
          </p>
        </section>
        <section
          aria-labelledby="foundation-title"
          className="rounded-2xl border border-[#243f35]/20 bg-white/60 p-6 sm:p-8"
        >
          <p className="text-xs font-semibold uppercase tracking-widest">
            Development preview · Phase 1
          </p>
          <h2 id="foundation-title" className="mt-3 font-serif text-2xl">
            The essentials are in place.
          </h2>
          <p className="mt-3 text-sm leading-6">
            Menu browsing and ordering arrive in Phase 2. This preview checks
            the connection to the API and database.
          </p>
          <div
            role="status"
            aria-live="polite"
            className="mt-6 text-sm font-medium"
          >
            {health.isPending
              ? 'Connecting… The server may be waking up. Thanks for your patience.'
              : health.isError
                ? 'The cafe server is unavailable. Check that the API and database are running, then try again.'
                : 'Connected · API and database are ready.'}
          </div>
          {health.isError && (
            <button
              className="mt-4 min-h-11 rounded-lg bg-[#243f35] px-5 py-3 text-sm text-white"
              onClick={() => {
                void health.refetch();
              }}
            >
              Try again
            </button>
          )}
        </section>
        <footer className="mt-10 text-xs text-[#4c5c53]">
          Made for slow mornings. Built for busy kitchens.
        </footer>
      </main>
    </>
  );
}
