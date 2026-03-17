import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface KdsItemPayload {
  id: string;
  order_id: string;
  order_item_id: number;
  order_number: number;
  customer_name: string;
  order_type: string;
  product_name: string;
  quantity: number;
  modifiers_json: string[];
  notes: string;
  station: string;
  status: string;
  routed_at: string;
  ready_at: string | null;
  delivered_at: string | null;
}

export function subscribeKds(
  station: string,
  onInsert: (item: KdsItemPayload) => void,
  onUpdate: (item: KdsItemPayload) => void
): RealtimeChannel {
  return supabase
    .channel(`kds:${station}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'kds_items', filter: `station=eq.${station}` },
      (payload) => onInsert(payload.new as KdsItemPayload)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'kds_items', filter: `station=eq.${station}` },
      (payload) => onUpdate(payload.new as KdsItemPayload)
    )
    .subscribe();
}

export function subscribePosEvents(callbacks: {
  onOrderCreated?: (payload: any) => void;
  onWasteCreated?: (payload: any) => void;
  onMenuUpdated?: () => void;
  onOrderComplete?: (payload: any) => void;
}): RealtimeChannel {
  const channel = supabase.channel('pos-events');

  if (callbacks.onOrderCreated) {
    channel.on('broadcast', { event: 'order:created' }, ({ payload }) => callbacks.onOrderCreated!(payload));
  }
  if (callbacks.onWasteCreated) {
    channel.on('broadcast', { event: 'waste:created' }, ({ payload }) => callbacks.onWasteCreated!(payload));
  }
  if (callbacks.onMenuUpdated) {
    channel.on('broadcast', { event: 'menu:updated' }, () => callbacks.onMenuUpdated!());
  }
  if (callbacks.onOrderComplete) {
    channel.on('broadcast', { event: 'kds:order-complete' }, ({ payload }) => callbacks.onOrderComplete!(payload));
  }

  return channel.subscribe();
}

export function unsubscribe(channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}
