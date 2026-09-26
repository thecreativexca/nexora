/** Streaming skeleton shown while the catalogue query runs. */
export default function ProductsLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-56 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-9 w-24 animate-pulse rounded-full bg-slate-100" />
        ))}
      </div>
      <ul
        aria-hidden="true"
        className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <li
            key={index}
            className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
          />
        ))}
      </ul>
      <p className="sr-only" role="status">
        Loading products
      </p>
    </div>
  );
}
