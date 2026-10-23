import { useState } from 'react';
import { StaffGate } from '../components/StaffGate';
import { StaffHeader } from '../components/StaffHeader';
import { AdminMenu } from '../components/admin/AdminMenu';
import { AdminDashboard } from '../components/admin/AdminDashboard';
import { AdminHistory } from '../components/admin/AdminHistory';
import { AdminTools } from '../components/admin/AdminTools';
const tabs = [
  'Dashboard',
  'Menu',
  'Order history',
  'Table QR codes',
  'Demo reset',
] as const;
export function AdminPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Dashboard');
  return (
    <StaffGate role="admin">
      {(user) => (
        <>
          <StaffHeader user={user} />
          <main id="main" className="admin-main">
            <div className="admin-heading">
              <p className="eyebrow">BEHIND THE COUNTER</p>
              <h1>Cafe management</h1>
              <p>The details that make every service feel effortless.</p>
            </div>
            <nav className="admin-tabs" aria-label="Admin sections">
              {tabs.map((name) => (
                <button
                  key={name}
                  aria-current={tab === name ? 'page' : undefined}
                  onClick={() => setTab(name)}
                >
                  {name}
                </button>
              ))}
            </nav>
            {tab === 'Dashboard' ? (
              <AdminDashboard />
            ) : tab === 'Menu' ? (
              <AdminMenu />
            ) : tab === 'Order history' ? (
              <AdminHistory />
            ) : (
              <AdminTools
                key={tab}
                mode={tab === 'Demo reset' ? 'reset' : 'qr'}
              />
            )}
          </main>
        </>
      )}
    </StaffGate>
  );
}
