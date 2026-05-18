import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
  // Video,
} from "remotion";
import { THEME, FONT_STACK } from "../theme";

// === ASSETS ===
const BG_IMAGE_SRC: string | null = null; // staticFile("bg/scene3-heatmap-grid.jpg")
const UI_CLIP_SRC: string | null = null; // staticFile("ui/scene3-heatmap-findings.mp4")

// === BEATS (360 frames @ 30fps) ===
const BEATS = [
  { id: "intro", text: "Detecta lo que un humano tardaría días en ver.", start: 0, end: 120 },
  { id: "counter", text: "findings", start: 120, end: 240 },
  { id: "tags", text: "Riesgo · Materialidad · Evidencia.", start: 240, end: 360 },
] as const;

const TARGET_COUNT = 1247;

export const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const activeBeat = BEATS.find((b) => frame >= b.start && frame < b.end) ?? BEATS[0];
  const beatLocalFrame = frame - activeBeat.start;
  const beatDuration = activeBeat.end - activeBeat.start;

  // Scanner laser sweep (eje X, recorre cada 2s)
  const scannerX = interpolate(frame % 60, [0, 60], [-20, 120]);

  // Tilt nadir leve sobre el clip UI (cámara desde abajo)
  const uiTilt = interpolate(frame, [0, 360], [-5, -7]);

  // Counter spring
  const counterSpring = spring({
    frame: activeBeat.id === "counter" ? beatLocalFrame : 0,
    fps,
    config: { damping: 18, stiffness: 60, mass: 1.1 },
  });
  const counterValue = Math.floor(interpolate(counterSpring, [0, 1], [0, TARGET_COUNT]));

  // Text enter/exit común
  const textEnter = interpolate(beatLocalFrame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textExit = interpolate(
    beatLocalFrame,
    [beatDuration - 12, beatDuration],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const textOpacity = textEnter * textExit;
  const textY = interpolate(textEnter, [0, 1], [25, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, fontFamily: FONT_STACK }}>
      {/* ========= CAPA 1: FONDO IA ========= */}
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
              background:
                "radial-gradient(circle at 50% 60%, rgba(255,59,48,0.10) 0%, rgba(10,10,15,0) 55%), repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 80px), repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 80px), #0A0A0F",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.15)",
              fontSize: 22,
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            [ BG IA · escena 3 · heatmap grid forensic ]
          </div>
        )}
      </AbsoluteFill>

      {/* ========= CAPA 2: SCANNER LASER ========= */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: `${scannerX}%`,
          width: 2,
          height: "100%",
          background:
            "linear-gradient(180deg, transparent, rgba(0,217,255,0.7), transparent)",
          boxShadow: "0 0 24px rgba(0,217,255,0.55)",
          pointerEvents: "none",
        }}
      />

      {/* ========= CAPA 3: CLIP UI (70% centro, plano nadir, sombra proyectada) ========= */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          perspective: 2000,
        }}
      >
        <div
          style={{
            width: "70%",
            height: "62%",
            transform: `rotateX(${uiTilt}deg)`,
            transformStyle: "preserve-3d",
            borderRadius: 16,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: `
              0 60px 120px rgba(0,0,0,0.75),
              0 30px 60px rgba(255,59,48,0.12),
              inset 0 0 0 1px rgba(255,255,255,0.04)
            `,
            opacity: activeBeat.id === "counter" ? 0.35 : 0.95,
            transition: "opacity 0.3s",
          }}
        >
          {UI_CLIP_SRC ? (
            // <Video src={UI_CLIP_SRC} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "linear-gradient(160deg, #0d0d14 0%, #050507 100%)",
                display: "grid",
                gridTemplateColumns: "repeat(16, 1fr)",
                gridTemplateRows: "repeat(8, 1fr)",
                gap: 4,
                padding: 24,
              }}
            >
              {Array.from({ length: 128 }).map((_, i) => {
                const seed = (i * 9301 + 49297) % 233280;
                const ignite = (seed / 233280 + frame / 200) % 1;
                const heat = ignite > 0.85 ? 1 : ignite > 0.65 ? 0.55 : 0.15;
                const color =
                  heat > 0.8
                    ? `rgba(255,59,48,${heat})`
                    : heat > 0.5
                    ? `rgba(212,175,55,${heat})`
                    : `rgba(0,217,255,${heat * 0.6})`;
                return (
                  <div
                    key={i}
                    style={{
                      background: color,
                      borderRadius: 2,
                      boxShadow: heat > 0.8 ? `0 0 12px ${color}` : "none",
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </AbsoluteFill>

      {/* ========= CAPA 4: TIPOGRAFÍA VISION PRO FLOTANTE (esquina sup. izq.) ========= */}
      {activeBeat.id !== "counter" && (
        <div
          style={{
            position: "absolute",
            top: 100,
            left: 100,
            maxWidth: "55%",
            opacity: textOpacity,
            transform: `translateY(${textY}px)`,
          }}
        >
          <div
            style={{
              padding: "26px 36px",
              borderRadius: 22,
              background: "rgba(20,20,28,0.45)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
            }}
          >
            <h1
              style={{
                color: THEME.fg,
                fontFamily: FONT_STACK,
                fontWeight: 600,
                fontSize: 56,
                lineHeight: 1.08,
                letterSpacing: -1,
                margin: 0,
              }}
            >
              {activeBeat.text}
            </h1>
          </div>
        </div>
      )}

      {/* ========= CAPA 5: CONTADOR HERO (rompe la grilla) ========= */}
      {activeBeat.id === "counter" && (
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              color: THEME.fg,
              fontFamily: FONT_STACK,
              fontWeight: 800,
              fontSize: 380,
              lineHeight: 1,
              letterSpacing: -10,
              textShadow: "0 0 80px rgba(255,59,48,0.35)",
              fontVariantNumeric: "tabular-nums",
              transform: `scale(${interpolate(counterSpring, [0, 1], [0.85, 1])})`,
            }}
          >
            {counterValue.toLocaleString("es-ES")}
          </div>
          <div
            style={{
              color: THEME.muted,
              fontSize: 36,
              letterSpacing: 12,
              textTransform: "uppercase",
              marginTop: -10,
              opacity: textOpacity,
            }}
          >
            findings
          </div>
        </AbsoluteFill>
      )}

      {/* ========= CAPA 6: GRANO ========= */}
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
