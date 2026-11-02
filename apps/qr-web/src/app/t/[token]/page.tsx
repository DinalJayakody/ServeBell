import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Users } from 'lucide-react';
import { api, isNotFound, storeLinks } from '@/lib/api';
import { AppLinks, Brand } from '../../AppLinks';

export const dynamic = 'force-dynamic';

async function resolve(token: string) {
  try {
    return await api.qr.resolve(token);
  } catch (e) {
    if (isNotFound(e)) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const qr = await resolve(token);
  return { title: `${qr.restaurant.name} — Table ${qr.table.label}` };
}

/** Landing page for a scanned table QR. The app takes over for anything that needs an account. */
export default async function TablePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const qr = await resolve(token);
  const { restaurant: r, table } = qr;

  return (
    <main className="page">
      <Brand />
      <section className="card hero stack">
        <span className="pill" style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.18)', color: '#fff' }}>You’re at</span>
        <h1>Table {table.label}</h1>
        <p>{r.name}</p>
        <div className="row small" style={{ gap: 16 }}>
          <span className="row" style={{ gap: 6 }}><Users size={15} /> Seats {table.capacity}</span>
          {table.zone ? <span className="row" style={{ gap: 6 }}><MapPin size={15} /> {table.zone}</span> : null}
        </div>
      </section>
      <section className="card stack">
        <h2>Request service from your phone</h2>
        <p className="muted small">Open ServeBell to call a waiter, ask for water or cutlery, order and request the bill. Your request goes straight to the team on duty.</p>
        <AppLinks deepLink={`${storeLinks.scheme}://t/${encodeURIComponent(token)}`} expoPath={`/t/${encodeURIComponent(token)}`} />
      </section>
      <Link className="btn" href={`/r/${r.slug}`}>View restaurant details</Link>
      <p className="footer">Not your table? Ask a staff member for help.</p>
    </main>
  );
}
