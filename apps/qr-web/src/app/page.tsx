import { BellRing, CalendarCheck, QrCode } from 'lucide-react';
import { AppLinks, Brand } from './AppLinks';

export default function Home() {
  return (
    <main className="page">
      <Brand />
      <section className="card hero stack">
        <h1>Your table. Our priority.</h1>
        <p>Scan the QR code on your table to call a waiter, request utensils, browse the menu and track your requests in real time.</p>
      </section>
      <section className="card stack">
        {[
          { icon: <QrCode size={20} />, title: 'Scan your table', body: 'Every table has its own QR code — no app needed to look around.' },
          { icon: <BellRing size={20} />, title: 'Request a waiter instantly', body: 'One tap notifies the team. See who accepted and when.' },
          { icon: <CalendarCheck size={20} />, title: 'Reserve the table you like', body: 'Browse floor plans and book ahead.' },
        ].map((f) => (
          <div key={f.title} className="row" style={{ alignItems: 'flex-start' }}>
            <span className="pill primary" style={{ padding: 8 }}>{f.icon}</span>
            <div>
              <strong>{f.title}</strong>
              <p className="muted small">{f.body}</p>
            </div>
          </div>
        ))}
      </section>
      <AppLinks />
      <p className="footer">© {new Date().getFullYear()} ServeBell</p>
    </main>
  );
}
