import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Check, MapPin, Phone, Star } from 'lucide-react';
import { api, formatMinutes, isNotFound } from '@/lib/api';
import { AppLinks, Brand } from '../../AppLinks';

export const revalidate = 60;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function load(slug: string) {
  try {
    return await api.restaurants.detail(slug);
  } catch (e) {
    if (isNotFound(e)) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await load((await params).slug);
  return { title: r.name, description: r.description ?? undefined };
}

export default async function RestaurantPage({ params }: { params: Promise<{ slug: string }> }) {
  const r = await load((await params).slug);
  const today = DAYS.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: r.timezone, weekday: 'long' }).format(new Date()));

  return (
    <main className="page">
      <Brand />
      <section className="card stack">
        <div className="row between">
          <span className={`pill ${r.openNow ? 'ok' : ''}`}>{r.openNow ? '● Open now' : 'Closed'}</span>
          {r.ratingAvg ? <span className="row small" style={{ gap: 4 }}><Star size={14} fill="currentColor" /> {r.ratingAvg.toFixed(1)} ({r.ratingCount})</span> : null}
        </div>
        <h1>{r.name}</h1>
        {r.description ? <p className="muted">{r.description}</p> : null}
        <p className="row small muted"><MapPin size={15} /> {r.addressLine}, {r.city}</p>
        {r.phone ? <a className="row small muted" href={`tel:${r.phone}`}><Phone size={15} /> {r.phone}</a> : null}
      </section>
      {r.services.length ? (
        <section className="card">
          <h2>Service at your table</h2>
          <div className="chips">{r.services.map((s) => <span key={s.id} className={`pill ${s.isPrimary ? 'primary' : ''}`}>{s.name}</span>)}</div>
        </section>
      ) : null}
      <section className="card hours">
        <h2>Opening hours</h2>
        {DAYS.map((d, i) => {
          const w = r.openingHours.filter((h) => h.dayOfWeek === i);
          return (
            <div key={d} className={i === today ? 'today' : undefined}>
              <span>{d}</span>
              <span>{w.length ? w.map((h) => `${formatMinutes(h.opensMinute)} – ${formatMinutes(h.closesMinute)}`).join(', ') : 'Closed'}</span>
            </div>
          );
        })}
      </section>
      {r.amenities.length ? (
        <section className="card">
          <h2>Amenities</h2>
          <div className="chips">{r.amenities.map((a) => <span key={a.key} className="pill ok"><Check size={13} /> {a.name}</span>)}</div>
        </section>
      ) : null}
      <AppLinks />
    </main>
  );
}
