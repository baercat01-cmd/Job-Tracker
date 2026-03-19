import { useId, useState } from 'react';

const SEAL_SRC = '/martin-builder-document-seal.png';

/**
 * Martin Builder signed seal — uses extracted circular seal artwork (`public/martin-builder-document-seal.png`).
 * Circular clip removes square white corners; light scale trims outer mat so the seal fills the disc.
 */
export function MartinBuilderContractSeal({
  className = '',
  variant = 'default',
}: {
  className?: string;
  variant?: 'default' | 'compact';
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fidSharp = `mbSealSharp-${uid}`;
  const size = variant === 'compact' ? 220 : 300;
  /** Extra zoom crops away the white mat outside the gold rim */
  const trimMat = 1.32;

  if (!imgFailed) {
    return (
      <div
        className={`relative flex-shrink-0 select-none leading-none ${className}`}
        role="img"
        aria-label="Martin Builder document seal — signed contract"
        style={{ width: size, height: size }}
      >
        <svg
          className="pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden"
          aria-hidden
          focusable="false"
        >
          <defs>
            <filter
              id={fidSharp}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
              colorInterpolationFilters="sRGB"
            >
              <feConvolveMatrix
                order="3"
                kernelMatrix="0 -0.35 0 -0.35 2.4 -0.35 0 -0.35 0"
                divisor="1"
                targetX="1"
                targetY="1"
                edgeMode="duplicate"
                result="conv"
              />
              <feColorMatrix
                in="conv"
                type="matrix"
                values="1.1 0 0 0 0
                        0 1.1 0 0 0
                        0 0 1.1 0 0
                        0 0 0 1 0"
              />
            </filter>
          </defs>
        </svg>
        <div className="relative h-full w-full overflow-hidden rounded-full bg-[#0a1628] shadow-[0_16px_42px_rgba(15,23,42,0.28)]">
          <img
            src={SEAL_SRC}
            alt=""
            width={512}
            height={512}
            decoding="async"
            draggable={false}
            className="pointer-events-none h-full w-full max-w-none select-none object-cover object-center"
            style={{
              transform: `scale(${trimMat})`,
              transformOrigin: 'center center',
              filter: `url(#${fidSharp})`,
            }}
            onError={() => setImgFailed(true)}
          />
        </div>
      </div>
    );
  }

  return <MartinBuilderContractSealSvg className={className} size={size} />;
}

/** SVG fallback when PNG is unavailable */
function MartinBuilderContractSealSvg({ className, size }: { className: string; size: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gGold = `mbG-${uid}`;
  const gGoldLight = `mbGl-${uid}`;
  const gGoldDeep = `mbGd-${uid}`;
  const gFace = `mbFace-${uid}`;
  const fEmboss = `mbEmb-${uid}`;
  const pathSealTop = `mbArcSeal-${uid}`;
  const pathSignedBot = `mbArcSigned-${uid}`;
  const c = 110;
  const view = 220;

  const sideDots: number[] = [];
  for (let deg = 115; deg <= 155; deg += 8) sideDots.push((deg * Math.PI) / 180);
  for (let deg = 205; deg <= 245; deg += 8) sideDots.push((deg * Math.PI) / 180);
  for (let deg = 295; deg <= 335; deg += 8) sideDots.push((deg * Math.PI) / 180);
  for (let deg = 25; deg <= 65; deg += 8) sideDots.push((deg * Math.PI) / 180);
  const dotR = 92;

  return (
    <div
      className={`flex-shrink-0 select-none ${className}`}
      role="img"
      aria-label="Martin Builder document seal — signed contract"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${view} ${view}`}
        className="drop-shadow-[0_12px_28px_rgba(15,23,42,0.3)]"
      >
        <defs>
          <linearGradient id={gGold} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f5e6a8" />
            <stop offset="35%" stopColor="#c9a227" />
            <stop offset="100%" stopColor="#7a5c12" />
          </linearGradient>
          <linearGradient id={gGoldLight} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fff8dc" />
            <stop offset="50%" stopColor="#e8c547" />
            <stop offset="100%" stopColor="#8b6914" />
          </linearGradient>
          <linearGradient id={gGoldDeep} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5c4a1a" />
            <stop offset="45%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#f5e6b8" />
          </linearGradient>
          <radialGradient id={gFace} cx="32%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#f8f8f9" />
            <stop offset="100%" stopColor="#ececee" />
          </radialGradient>
          <filter id={fEmboss} x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="0.5" result="b" />
            <feOffset in="b" dx="0.5" dy="0.8" result="o" />
            <feFlood floodColor="#2a2008" floodOpacity="0.4" result="f" />
            <feComposite in="f" in2="o" operator="in" result="s" />
            <feMerge>
              <feMergeNode in="s" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={c} cy={c} r={106} fill="none" stroke={`url(#${gGold})`} strokeWidth={2} />
        <circle
          cx={c}
          cy={c}
          r={103.5}
          fill="none"
          stroke={`url(#${gGold})`}
          strokeWidth={2.2}
          strokeDasharray="1.1 5.2"
          strokeLinecap="round"
        />
        <circle cx={c} cy={c} r={100.8} fill="none" stroke="#9a7b2c" strokeWidth={0.5} opacity={0.7} />

        <path
          d={`M ${c} ${c} m 0 -99.5 a 99.5 99.5 0 1 1 0 199 a 99.5 99.5 0 1 1 0 -199 M ${c} ${c} m 0 -80 a 80 80 0 1 0 0 160 a 80 80 0 1 0 0 -160`}
          fill="#0a1628"
          fillRule="evenodd"
        />

        {sideDots.map((ang, i) => (
          <circle
            key={i}
            cx={c + dotR * Math.cos(ang)}
            cy={c + dotR * Math.sin(ang)}
            r={1.9}
            fill={`url(#${gGold})`}
          />
        ))}

        <path id={pathSealTop} d={`M ${c - 72} ${c - 36} A 88 88 0 0 1 ${c + 72} ${c - 36}`} fill="none" />
        <path id={pathSignedBot} d={`M ${c + 72} ${c + 42} A 88 88 0 0 1 ${c - 72} ${c + 42}`} fill="none" />

        <text
          fill={`url(#${gGoldLight})`}
          fontSize={13}
          fontWeight={800}
          fontFamily="system-ui, sans-serif"
          letterSpacing="0.5em"
          filter={`url(#${fEmboss})`}
        >
          <textPath href={`#${pathSealTop}`} startOffset="50%" textAnchor="middle">
            SEAL
          </textPath>
        </text>
        <text
          fill={`url(#${gGoldLight})`}
          fontSize={12}
          fontWeight={800}
          fontFamily="system-ui, sans-serif"
          letterSpacing="0.38em"
          filter={`url(#${fEmboss})`}
        >
          <textPath href={`#${pathSignedBot}`} startOffset="50%" textAnchor="middle">
            SIGNED
          </textPath>
        </text>

        <circle cx={c} cy={c} r={79} fill="none" stroke={`url(#${gGold})`} strokeWidth={1.6} />
        <circle cx={c} cy={c} r={77} fill={`url(#${gFace})`} />
        <circle cx={c} cy={c} r={77} fill="none" stroke="#e5e5e7" strokeWidth={0.4} />

        <ellipse
          cx={c}
          cy={c - 1}
          rx={54}
          ry={23}
          fill="none"
          stroke={`url(#${gGold})`}
          strokeWidth={1.2}
          transform={`rotate(14 ${c} ${c - 1})`}
        />

        <g filter={`url(#${fEmboss})`}>
          <text
            x={c}
            y={c - 13}
            textAnchor="middle"
            fill={`url(#${gGoldDeep})`}
            fontSize={19}
            fontWeight={700}
            fontFamily="Georgia, Times, serif"
            letterSpacing="0.14em"
          >
            MARTIN
          </text>
          <text
            x={c}
            y={c + 11}
            textAnchor="middle"
            fill={`url(#${gGoldDeep})`}
            fontSize={19}
            fontWeight={700}
            fontFamily="Georgia, Times, serif"
            letterSpacing="0.12em"
          >
            BUILDER
          </text>
        </g>

        <text
          x={c}
          y={c + 33}
          textAnchor="middle"
          fill="#0f172a"
          fontSize={7}
          fontWeight={600}
          fontFamily="system-ui, sans-serif"
          letterSpacing="0.26em"
        >
          DOCUMENT SEAL
        </text>
        <text
          x={c}
          y={c + 44}
          textAnchor="middle"
          fill="#334155"
          fontSize={6.6}
          fontFamily="system-ui, sans-serif"
          letterSpacing="0.2em"
        >
          EST. 1983
        </text>
      </svg>
    </div>
  );
}
