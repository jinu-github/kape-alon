import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import QRCode from 'qrcode';
import { cafeConfig } from '@kape/shared';
import { adminApi } from '../../lib/admin';
import { retryRead } from '../../lib/api';
import { AsyncState } from '../AsyncState';
export function AdminTools({ mode }: { mode: 'qr' | 'reset' }) {
  const query = useQuery({
    queryKey: ['staff', 'admin', 'settings'],
    queryFn: adminApi.settings,
    retry: retryRead,
  });
  if (query.isPending) return <AsyncState loading />;
  if (query.isError)
    return (
      <AsyncState error={query.error} onRetry={() => void query.refetch()} />
    );
  return mode === 'qr' ? (
    <QrCodes tables={query.data.tables} baseUrl={query.data.customerBaseUrl} />
  ) : (
    <Reset enabled={query.data.resetEnabled} />
  );
}
function QrCodes({ tables, baseUrl }: { tables: number[]; baseUrl: string }) {
  const [table, setTable] = useState(tables[0] ?? 0);
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const url = new URL('/t/' + table, baseUrl).href;
  useEffect(() => {
    let active = true;
    setImage('');
    setError('');
    if (table)
      void QRCode.toDataURL(url, {
        width: 768,
        margin: 4,
        errorCorrectionLevel: 'M',
      })
        .then((value) => {
          if (active) setImage(value);
        })
        .catch(() => {
          if (active)
            setError(
              'Could not generate the QR code. Choose a table to try again.',
            );
        });
    return () => {
      active = false;
    };
  }, [table, url]);
  if (!tables.length)
    return <p className="admin-panel">No active tables are available.</p>;
  return (
    <section className="qr-section">
      <h2>Table QR codes</h2>
      <label className="qr-controls">
        Table
        <select
          value={table}
          onChange={(event) => setTable(Number(event.target.value))}
        >
          {tables.map((number) => (
            <option key={number} value={number}>
              Table {number}
            </option>
          ))}
        </select>
      </label>
      <div className="qr-print">
        <h3>{cafeConfig.name}</h3>
        <p>Table {table} · Scan to order</p>
        {error ? (
          <p role="alert">{error}</p>
        ) : image ? (
          <img
            width="256"
            height="256"
            src={image}
            alt={'QR code for table ' + table}
          />
        ) : (
          <p role="status">Generating QR code…</p>
        )}
        <p className="qr-url">{url}</p>
      </div>
      <div className="admin-actions qr-controls">
        {image && (
          <a
            className="button"
            href={image}
            download={'table-' + table + '.png'}
          >
            Download PNG
          </a>
        )}
        <button
          className="button"
          disabled={!image}
          onClick={() => window.print()}
        >
          Print table card
        </button>
      </div>
    </section>
  );
}
function Reset({ enabled }: { enabled: boolean }) {
  const [confirmation, setConfirmation] = useState('');
  const cache = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: adminApi.reset,
    onSuccess: () => {
      cache.clear();
      navigate('/login?role=admin', { replace: true });
    },
  });
  return (
    <section className="admin-panel reset-panel">
      <h2>Reset demo data</h2>
      <p>
        This deletes all cafe orders, menu changes and staff sessions, then
        reloads the sample data. Everyone must sign in again. Only use this on a
        disposable demo database.
      </p>
      {!enabled ? (
        <p>Reset is disabled by the server configuration.</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmation === 'RESET DEMO DATA') mutation.mutate();
          }}
        >
          <label>
            Type RESET DEMO DATA to confirm
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            className="button danger"
            disabled={confirmation !== 'RESET DEMO DATA' || mutation.isPending}
          >
            {mutation.isPending ? 'Resetting…' : 'Reset demo data'}
          </button>
        </form>
      )}
      {mutation.isError && (
        <p role="alert" className="error-message">
          {mutation.error.message}
        </p>
      )}
    </section>
  );
}
