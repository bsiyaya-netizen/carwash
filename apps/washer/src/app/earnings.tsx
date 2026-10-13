import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { money, when } from '../lib/format';
import type { Booking } from '../lib/types';
import { Card, Chip, colors, H, Muted, styles } from '../lib/ui';

type Period = 'day' | 'week' | 'month';

interface Earnings {
  jobs: number;
  gross_cents: number;
  tips_cents: number;
  share_cents: number;
  cash_collected_cents: number;
  payout_cents: number;
  washerShare: number;
  daily: { day: string; jobs: number; gross_cents: number; tips_cents: number }[];
  rating: { avg: number | null; count: number };
}

export default function EarningsScreen() {
  const [period, setPeriod] = useState<Period>('week');
  const [e, setE] = useState<Earnings | null>(null);
  const [history, setHistory] = useState<Booking[]>([]);

  useEffect(() => { api<Earnings>(`/washer/earnings?period=${period}`).then(setE); }, [period]);
  useEffect(() => { api<Booking[]>('/washer/jobs').then((j) => setHistory(j.filter((b) => b.status === 'completed'))); }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.wrap}>
        {(['day', 'week', 'month'] as Period[]).map((p) => (
          <Chip key={p} label={p === 'day' ? 'Today' : p === 'week' ? 'Last 7 days' : 'Last 30 days'} selected={period === p} onPress={() => setPeriod(p)} />
        ))}
      </View>
      {e && (
        <>
          <Card>
            <Muted>Your payout</Muted>
            <Text style={{ fontSize: 32, fontWeight: '800', color: colors.success }}>{money(e.payout_cents)}</Text>
            <Muted>{e.jobs} jobs · ★ {e.rating.avg ?? '–'} ({e.rating.count} reviews)</Muted>
          </Card>
          <Card>
            <Line label="Job value" value={money(e.gross_cents)} />
            <Line label={`Your share (${Math.round(e.washerShare * 100)}%)`} value={money(e.share_cents)} />
            <Line label="Tips (100% yours)" value={money(e.tips_cents)} />
            <Line label="Cash you already collected" value={`-${money(e.cash_collected_cents)}`} />
          </Card>
          {e.daily.length > 0 && <H>By day</H>}
          {e.daily.map((d) => (
            <Card key={d.day}>
              <Line label={`${d.day} · ${d.jobs} jobs`} value={money(Math.round(d.gross_cents * e.washerShare) + d.tips_cents)} />
            </Card>
          ))}
        </>
      )}
      <H>Completed jobs</H>
      {history.length === 0 && <Muted>No completed jobs yet.</Muted>}
      {history.map((b) => (
        <Card key={b.id}>
          <Line label={b.package.name} value={money(b.total_cents)} />
          <Muted>{when(b.scheduled_at)} · {b.customer.name}{b.tip_cents ? ` · tip ${money(b.tip_cents)}` : ''}</Muted>
          {b.review && <Muted>{'★'.repeat(b.review.rating)} {b.review.comment}</Muted>}
        </Card>
      ))}
    </ScrollView>
  );
}

const Line = ({ label, value }: { label: string; value: string }) => (
  <View style={[styles.row, { paddingVertical: 3 }]}>
    <Muted>{label}</Muted>
    <Text style={{ fontWeight: '600' }}>{value}</Text>
  </View>
);
