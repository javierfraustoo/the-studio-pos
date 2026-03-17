import React, { useState } from 'react';
import { useStore } from '../store/useStore';

// ─── Thermal Printer Simulator ──────────────────────────────────────────────

function PrinterSimulator() {
  const { printerLogs } = useStore();
  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  const log = selectedLog ? printerLogs.find((l) => l.id === selectedLog) : printerLogs[0];

  return (
    <div style={styles.simCard}>
      <div style={styles.simHeader}>
        <div style={styles.simIcon}>&#128424;</div>
        <div>
          <h3 style={styles.simTitle}>Impresora Termica</h3>
          <span style={styles.simSubtitle}>EPSON TM-m30II (simulada)</span>
        </div>
        <div style={{...styles.statusDot, backgroundColor: '#10B981'}} />
      </div>

      {/* Log selector */}
      {printerLogs.length > 0 && (
        <div style={styles.logTabs}>
          {printerLogs.slice(0, 8).map((l) => (
            <button
              key={l.id}
              onClick={() => setSelectedLog(l.id)}
              style={{
                ...styles.logTab,
                backgroundColor: (log?.id === l.id) ? '#1F2937' : '#F3F4F6',
                color: (log?.id === l.id) ? '#FFF' : '#374151',
              }}
            >
              #{l.orderNumber} {l.type === 'bar_order' ? 'Barra' : 'Recibo'}
            </button>
          ))}
        </div>
      )}

      {/* Thermal paper simulation */}
      <div style={styles.thermalPaper}>
        {log ? (
          <pre style={styles.receiptText}>{log.content}</pre>
        ) : (
          <p style={styles.noJobs}>Sin impresiones recientes. Crea una orden para ver la salida.</p>
        )}
      </div>

      {printerLogs.length > 0 && (
        <div style={styles.simFooter}>
          <span style={styles.footerText}>
            {printerLogs.length} job{printerLogs.length > 1 ? 's' : ''} procesado{printerLogs.length > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Payment Terminal Simulator ─────────────────────────────────────────────

function PaymentTerminalSimulator() {
  const { paymentTerminalStatus } = useStore();

  const statusConfig = {
    idle: { label: 'Esperando...', color: '#6B7280', bg: '#F9FAFB', animation: '' },
    processing: { label: 'Leyendo tarjeta...', color: '#D97706', bg: '#FFFBEB', animation: 'pulse' },
    approved: { label: 'APROBADO', color: '#059669', bg: '#D1FAE5', animation: '' },
    declined: { label: 'DECLINADO', color: '#DC2626', bg: '#FEE2E2', animation: '' },
  };

  const cfg = statusConfig[paymentTerminalStatus];

  return (
    <div style={styles.simCard}>
      <div style={styles.simHeader}>
        <div style={styles.simIcon}>&#128179;</div>
        <div>
          <h3 style={styles.simTitle}>Terminal Bancaria</h3>
          <span style={styles.simSubtitle}>Stripe Terminal (simulada)</span>
        </div>
        <div style={{...styles.statusDot, backgroundColor: paymentTerminalStatus === 'idle' ? '#9CA3AF' : cfg.color}} />
      </div>

      <div style={{...styles.terminalScreen, backgroundColor: cfg.bg}}>
        <div style={{...styles.terminalDisplay}}>
          {paymentTerminalStatus === 'processing' && (
            <div style={styles.cardAnimation}>
              <div style={styles.cardIcon}>&#128179;</div>
              <div style={styles.dots}>
                <span style={{...styles.dot, animationDelay: '0s'}}>.</span>
                <span style={{...styles.dot, animationDelay: '0.3s'}}>.</span>
                <span style={{...styles.dot, animationDelay: '0.6s'}}>.</span>
              </div>
            </div>
          )}
          {paymentTerminalStatus === 'approved' && (
            <div style={styles.approvedIcon}>&#10003;</div>
          )}
          <span style={{...styles.terminalLabel, color: cfg.color}}>{cfg.label}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Cash Drawer Simulator ──────────────────────────────────────────────────

function CashDrawerSimulator() {
  const { cashDrawerOpen } = useStore();

  return (
    <div style={styles.simCard}>
      <div style={styles.simHeader}>
        <div style={styles.simIcon}>&#128176;</div>
        <div>
          <h3 style={styles.simTitle}>Cajon de Dinero</h3>
          <span style={styles.simSubtitle}>RJ11 via impresora</span>
        </div>
        <div style={{...styles.statusDot, backgroundColor: cashDrawerOpen ? '#EF4444' : '#10B981'}} />
      </div>

      <div style={{
        ...styles.drawerVisual,
        backgroundColor: cashDrawerOpen ? '#FEF3C7' : '#F3F4F6',
        borderColor: cashDrawerOpen ? '#F59E0B' : '#D1D5DB',
      }}>
        <div style={{
          ...styles.drawerBox,
          transform: cashDrawerOpen ? 'translateY(20px)' : 'translateY(0)',
          opacity: cashDrawerOpen ? 1 : 0.5,
        }}>
          {cashDrawerOpen ? (
            <>
              <div style={styles.drawerOpenLabel}>ABIERTO</div>
              <div style={styles.moneySlots}>
                {['$500', '$200', '$100', '$50', '$20'].map((d) => (
                  <div key={d} style={styles.moneySlot}>{d}</div>
                ))}
              </div>
            </>
          ) : (
            <div style={styles.drawerClosedLabel}>CERRADO</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export default function HardwareSimulators() {
  return (
    <div style={styles.container}>
      <div style={styles.simGrid}>
        <PrinterSimulator />
        <div style={styles.rightCol}>
          <PaymentTerminalSimulator />
          <CashDrawerSimulator />
        </div>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 0, height: '100%', overflowY: 'auto' },
  simGrid: { display: 'flex', gap: 16, height: '100%' },
  rightCol: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 300, flex: '0 0 300px' },

  simCard: { backgroundColor: '#FFF', borderRadius: 16, border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
  simHeader: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 12px' },
  simIcon: { fontSize: 24, width: 40, height: 40, borderRadius: 10, backgroundColor: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  simTitle: { fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 },
  simSubtitle: { fontSize: 11, color: '#9CA3AF' },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 'auto' },
  simFooter: { padding: '8px 16px', borderTop: '1px solid #F3F4F6' },
  footerText: { fontSize: 11, color: '#9CA3AF' },

  // Printer
  logTabs: { display: 'flex', gap: 4, padding: '0 12px 8px', flexWrap: 'wrap' },
  logTab: { padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500 },
  thermalPaper: {
    flex: 1, margin: '0 12px 12px', padding: 16, borderRadius: 8,
    backgroundColor: '#FFFEF5',
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 19px, #F0EDE4 19px, #F0EDE4 20px)',
    border: '1px dashed #D1C8A8', overflowY: 'auto', minHeight: 200,
  },
  receiptText: { fontFamily: '"Courier New", Courier, monospace', fontSize: 11, lineHeight: '20px', margin: 0, whiteSpace: 'pre', color: '#1F2937' },
  noJobs: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginTop: 40 },

  // Terminal
  terminalScreen: { margin: '0 12px 12px', padding: 24, borderRadius: 12, border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80 },
  terminalDisplay: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  terminalLabel: { fontSize: 16, fontWeight: 700, letterSpacing: 1 },
  cardAnimation: { display: 'flex', alignItems: 'center', gap: 8 },
  cardIcon: { fontSize: 28 },
  dots: { display: 'flex', gap: 2 },
  dot: { fontSize: 24, fontWeight: 700, color: '#D97706' },
  approvedIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#059669', color: '#FFF', fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },

  // Drawer
  drawerVisual: { margin: '0 12px 12px', padding: 16, borderRadius: 12, border: '2px solid', transition: 'all 0.3s ease', minHeight: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  drawerBox: { transition: 'all 0.3s ease', textAlign: 'center', width: '100%' },
  drawerOpenLabel: { fontSize: 14, fontWeight: 800, color: '#D97706', marginBottom: 8, letterSpacing: 2 },
  drawerClosedLabel: { fontSize: 14, fontWeight: 700, color: '#9CA3AF', letterSpacing: 2 },
  moneySlots: { display: 'flex', gap: 4, justifyContent: 'center' },
  moneySlot: { padding: '4px 8px', backgroundColor: '#FDE68A', borderRadius: 4, fontSize: 10, fontWeight: 700, color: '#78350F' },
};
