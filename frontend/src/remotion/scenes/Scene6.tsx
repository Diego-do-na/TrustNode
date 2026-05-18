import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
} from "remotion";
import { THEME, FONT_STACK } from "../theme";

// === ASSETS ===
const BG_IMAGE_SRC: string | null = null; // staticFile("bg/scene6-void-core.jpg")
// Esta escena no tiene UI_CLIP — es 100% tipográfica/abstracta.

// === BEATS (300 frames @ 30fps) ===
// Beat 1: 0–150   → counter 0 → 99
// Beat 2: 150–220 → "Menos tiempo. Cero exposición."
// Beat 3: 220–300 → Logo lockup "TrustNode" + fade to black
const COUNTER_END = 150;
const TAGLINE_END = 220;
const TOTAL = 300;

export const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // === Counter 0 → 99 (con spring para easing dramático) ===
  const counterSpring = spring({
    frame,
    fps,
    config: { damping: 22, stiffness: 55, mass: 1.2 },
    durationInFrames: COUNTER_END - 10,
  });
  const counterValue = Math.floor(interpolate(counterSpring, [0, 1], [0, 99]));

  // Pulse del core blanco
  const corePulse = interpolate(
    Math.sin(frame * 0.12),
    [-1, 1],
    [0.6, 1]
  );

  // Beat 1: "99%" hero
  const counterOpacity = interpolate(
    frame,
    [0, 18, COUNTER_END - 20, COUNTER_END],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const counterScale = interpolate(
    frame,
    [0, 30, COUNTER_END - 20, COUNTER_END],
    [0.6, 1, 1.02, 1.25],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Beat 2: Tagline
  const taglineOpacity = interpolate(
    frame,
    [COUNTER_END, COUNTER_END + 18, TAGLINE_END - 14, TAGLINE_END],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const taglineY = interpolate(
    frame,
    [COUNTER_END, COUNTER_END + 20],
    [30, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Beat 3: Logo lockup
  const logoSpring = spring({
    frame: frame - TAGLINE_END,
    fps,
    config: { damping: 18, stiffness: 90, mass: 1 },
  });
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1]);
  const logoLetterSpacing = interpolate(logoSpring, [0, 1], [-8, 8]);
  const logoScale = interpolate(logoSpring, [0, 1], [0.92, 1]);

  // Fade to black absoluto al final
  const fadeOut = interpolate(frame, [TOTAL - 30, TOTAL], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000", fontFamily: FONT_STACK }}>
      {/* ========= CAPA 1: FONDO IA (void + core pulsante) ========= */}
      <AbsoluteFill>
        {BG_IMAGE_SRC ? (
          <Img
            src={BG_IMAGE_SRC}
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: `radial-gradient(circle at 50% 50%, rgba(255,255,255,${corePulse * 0.18}) 0%, rgba(245,245,240,${corePulse * 0.06}) 12%, rgba(10,10,15,0) 50%), #000000`,
            }}
          />
        )}
      </AbsoluteFill>

      {/* ========= CAPA 2: RAYOS VOLUMÉTRICOS ========= */}
      <AbsoluteFill
        style={{
          background:
            "conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(255,255,255,0.04) 15deg, transparent 30deg, transparent 90deg, rgba(255,255,255,0.04) 105deg, transparent 120deg, transparent 180deg, rgba(255,255,255,0.04) 195deg, transparent 210deg, transparent 270deg, rgba(255,255,255,0.04) 285deg, transparent 300deg)",
          opacity: corePulse * 0.5,
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      />

      {/* ========= BEAT 1: COUNTER 99% HERO ========= */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: counterOpacity,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            color: THEME.fg,
            fontFamily: FONT_STACK,
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
            transform: `scale(${counterScale})`,
            textShadow: "0 0 100px rgba(255,255,255,0.25)",
          }}
        >
          <span
            style={{
              fontSize: 540,
              lineHeight: 1,
              letterSpacing: -16,
            }}
          >
            {counterValue}
          </span>
          <span
            style={{
              fontSize: 220,
              lineHeight: 1,
              letterSpacing: -6,
              color: THEME.accentCyan,
              marginLeft: 8,
            }}
          >
            %
          </span>
        </div>
      </AbsoluteFill>

      {/* ========= BEAT 1 (subtítulo): "Efficiency Gain" ========= */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          paddingBottom: 180,
          opacity: counterOpacity,
        }}
      >
        <div
          style={{
            color: THEME.muted,
            fontSize: 28,
            letterSpacing: 14,
            textTransform: "uppercase",
          }}
        >
          Efficiency Gain
        </div>
      </AbsoluteFill>

      {/* ========= BEAT 2: TAGLINE ========= */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: taglineOpacity,
        }}
      >
        <h1
          style={{
            color: THEME.fg,
            fontFamily: FONT_STACK,
            fontWeight: 600,
            fontSize: 100,
            lineHeight: 1.1,
            letterSpacing: -2,
            textAlign: "center",
            margin: 0,
            transform: `translateY(${taglineY}px)`,
            maxWidth: "80%",
          }}
        >
          Menos tiempo.{" "}
          <span style={{ color: THEME.accentCyan }}>Cero exposición.</span>
        </h1>
      </AbsoluteFill>

      {/* ========= BEAT 3: LOGO LOCKUP ========= */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: logoOpacity,
        }}
      >
        <div
          style={{
            color: THEME.fg,
            fontFamily: FONT_STACK,
            fontWeight: 700,
            fontSize: 180,
            letterSpacing: logoLetterSpacing,
            transform: `scale(${logoScale})`,
            textShadow: "0 0 60px rgba(255,255,255,0.25)",
          }}
        >
          TrustNode
        </div>
        <div
          style={{
            color: THEME.muted,
            fontSize: 26,
            letterSpacing: 10,
            textTransform: "uppercase",
            marginTop: 30,
          }}
        >
          Audita como nunca antes.
        </div>
      </AbsoluteFill>

      {/* ========= CAPA FINAL: FADE TO BLACK ABSOLUTO ========= */}
      <AbsoluteFill
        style={{
          backgroundColor: "#000000",
          opacity: fadeOut,
          pointerEvents: "none",
        }}
      />

      {/* ========= CAPA: GRANO ========= */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/></svg>\")",
          opacity: 0.05,
          mixBlendMode: "overlay",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
