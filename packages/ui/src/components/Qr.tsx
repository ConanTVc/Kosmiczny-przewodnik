import { useMemo } from 'preact/hooks';
import { encode } from 'uqr';

/**
 * Kod QR jako SVG (czarno na białym – tak skanuje każdy telefon, niezależnie od motywu).
 * Moduły rysujemy jedną ścieżką; nic nie trafia do DOM jako surowy HTML.
 */
export function Qr({ text, label, size = 168 }: { text: string; label: string; size?: number }) {
  const { path, modules } = useMemo(() => {
    const qr = encode(text, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { path: d, modules: qr.size };
  }, [text]);
  return (
    <svg
      class="kp-qr"
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${modules} ${modules}`}
      shape-rendering="crispEdges"
    >
      <rect width={modules} height={modules} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
