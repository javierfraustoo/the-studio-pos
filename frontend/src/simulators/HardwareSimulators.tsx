import React, { useState } from 'react';
import { useStore } from '../store/useStore';

function PrinterSimulator() {
  const { printerLogs } = useStore();
  const [selectedLog, setSelectedLog] = useState<string | null>(null);
  const log = selectedLog ? printerLogs.find((l) => l.id === selectedLog) : printerLogs[0];

  return (
    <div style={S.simCard}>
      <div style={S.simHeader}>
        <div style={S.simIcon}>🖨</div>
        <div>
          <h3 style={S.simTitle}>Impresora Térmica</h3>
          <span style={S.simSubtitle}>EPSON TM-m30II (simulada)</span>
        </div>
        <div style={{ ...S.statusDot, backgroundColor: '#10B981' }} />
      </div>
      {printerLogs.length > 0 && (
        <div style={S.logTabs}>
          {printerLogs.slice(0, 8).map((l) => (
            <button key={l.id} onClick={() => setSelectedLog(l.id)}
              style={{ ...S.logTab, backgroundColor: (log?.id === l.id) ? 'var(--accent)' : 'var(--bg-hover)', color: (log?.id === l.id) ? '#FFF' : 'var(--text-muted)' }}>
              #{l.orderNumber}
            </button>
          ))}
        </div>
      )}
      <div style={S.thermalPaper}>
        {log ? <pre style={S.receiptText}>{log.content}</pre> : <p style={S.noJobs}>Sin impresiones. Crea una orden.</p>}
      </div>
      {printerLogs.length > 0 && (
        <div style={S.simFooter}>
          <span style={S.footerText}>{printerLogs.length} job{printerLogs.length > 1 ? 's' : ''} procesado{printerLogs.length > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}

function PaymentTerminalSimulator() {
  const { paymentTerminalStatus } = useStore();
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    idle: { label: 'Esperando...', color: 'var(--text-faint)', bg: 'var(--bg-hover)' },
    processing: { label: 'Leyendo tarjeta...', color: '#F59E0B', bg: 'var(--warning-bg)' },
    approved: { label: 'APROBADO', color: '#10B981', bg: 'var(--success-bg)' },
  };
  const c = cfg[paymentTerminalStatus] || cfg.idle;

  return (
    <div style={S.simCard}>
      <div style={S.simHeader}>
        <div style={S.simIcon}>💳</div>
        <div>
          <h3 style={S.simTitle}>Terminal Bancaria</h3>
          <span style={S.simSubtitle}>Stripe Terminal (simulada)</span>
        </div>
        <div style={{ ...S.statusDot, backgroundColor: paymentTerminalStatus === 'idle' ? 'var(--text-faint)' : c.color }} />
      </div>
      <div style={{ ...S.terminalScreen, backgroundColor: c.bg }}>
        <div style={S.terminalDisplay}>
          {paymentTerminalStatus === 'approved' && (
            <div style={{ width: 36, height: 36, borderRadius: 18, background: 'linear-gradient(135deg, #059669, #10B981)', color: '#FFF', fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
          )}
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.05em', color: c.color }}>{c.label}</span>
        </div>
      </div>
    </div>
  );
}

function CashDrawerSimulator() {
  const { cashDrawerOpen } = useStore();
  return (
    <div style={S.simCard}>
      <div style={S.simHeader}>
        <div style={S.simIcon}>💰</div>
        <div>
          <h3 style={S.simTitle}>Cajón de Dinero</h3>
          <span style={S.simSubtitle}>RJ11 vía impresora</span>
        </div>
        <div style={{ ...S.statusDot, backgroundColor: cashDrawerOpen ? '#EF4444' : '#10B981' }} />
      </div>
      <div style={{ ...S.drawerVisual, backgroundColor: cashDrawerOpen ? 'var(--warning-bg)' : 'var(--bg-hover)', borderColor: cashDrawerOpen ? '#F59E0B' : 'var(--border)' }}>
        <div style={{ ...S.drawerBox, transform: cashDrawerOpen ? 'translateY(16px)' : 'translateY(0)', opacity: cashDrawerOpen ? 1 : 0.5 }}>
          {cashDrawerOpen ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#F59E0B', marginBottom: 6, letterSpacing: '0.1em' }}>ABIERTO</div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                {['$500', '$200', '$100', '$50', '$20'].map((d) => (
                  <div key={d} style={{ padding: '3px 6px', backgroundColor: 'var(--warning-bg)', borderRadius: 4, fontSize: 9, fontWeight: 700, color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>{d}</div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: '0.1em' }}>CERRADO</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HardwareSimulators() {
  return (
    <div style={S.container}>
      <div style={S.simGrid}>
        <PrinterSimulator />
        <div style={S.rightCol}>
          <PaymentTerminalSimulator />
          <CashDrawerSimulator />
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  container: { padding: 0, height: '100%', overflowY: 'auto' },
  simGrid: { display: 'flex', gap: 12, height: '100%', padding: 12 },
  rightCol: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 280, flex: '0 0 280px' },

  simCard: { backgroundColor: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
  simHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 10px' },
  simIcon: { fontSize: 20, width: 36, height: 36, borderRadius: 10, backgroundColor: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  simTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  simSubtitle: { fontSize: 10, color: 'var(--text-faint)' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 'auto' },
  simFooter: { padding: '6px 14px', borderTop: '1px solid var(--border-light)' },
  footerText: { fontSize: 10, color: 'var(--text-faint)' },

  logTabs: { display: 'flex', gap: 4, padding: '0 10px 6px', flexWrap: 'wrap' },
  logTab: { padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600 },
  thermalPaper: {
    flex: 1, margin: '0 10px 10px', padding: 12, borderRadius: 10,
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px dashed var(--border)', overflowY: 'auto', minHeight: 160,
  },
  receiptText: { fontFamily: '"Courier New", Courier, monospace', fontSize: 10, lineHeight: '16px', margin: 0, whiteSpace: 'pre', color: 'var(--text-secondary)' },
  noJobs: { color: 'var(--text-faint)', fontSize: 12, textAlign: 'center', marginTop: 30 },

  terminalScreen: { margin: '0 10px 10px', padding: 20, borderRadius: 12, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 60 },
  terminalDisplay: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },

  drawerVisual: { margin: '0 10px 10px', padding: 14, borderRadius: 12, border: '2px solid', transition: 'all 0.3s ease', minHeight: 55, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  drawerBox: { transition: 'all 0.3s ease', textAlign: 'center', width: '100%' },
};
