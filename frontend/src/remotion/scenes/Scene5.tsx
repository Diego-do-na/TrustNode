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
const BG_IMAGE_SRC: string | null = null; // staticFile("bg/scene5-paper-assembly.jpg")
const UI_CLIP_SRC: string | null = null; // staticFile("ui/scene5-pdf-export.mp4")

// === BEATS (300 frames @ 30fps) ===
const BEATS = [
  { id: "click", text: "Un clic.", start: 0, end: 90 },
  { id: "latex", text: "PDF tipografiado en LaTeX.", start: 90, end: 190 },
  { id: "ready", text: "Listo para tu cliente. Listo para el regulador.", start: 190, end: 300 },
] as const;

const BEAT_3_START = 190;
const FLATTEN_DURATION = 30; // frames

export const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const activeBeat = BEATS.find((b) => frame >= b.start && frame < b.end) ?? BEATS[0];
  const beatLocalFrame = frame - activeBeat.start;
  const beatDuration = activeBeat.end - activeBeat.start;

  // Entrada isométrica del PDF desde la derecha
  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 22, stiffness: 80, mass: 1.2 },
  });

  // Tilt isométrico inicial (rotateX 8°, rotateY -18°)
  const initialRotX = 8;
  const initialRotY = -18;

  // En el beat 3, "se aplana" a 0° y se centra hero
  const flattenProgress = interpolate(
    frame,
    [BEAT_3_START, BEAT_3_START + FLATTEN_DURATION],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const rotX = interpolate(flattenProgress, [0, 1], [initialRotX, 0]);
  const rotY = interpolate(flattenProgress, [0, 1], [initialRotY, 0]);
  const uiScale = interpolate(flattenProgress, [0, 1], [1, 1.18]);

  const uiTranslateX = interpolate(
    enterSpring,
    [0, 1],
    [600, 0]
  );
  const uiOpacity = interpolate(enterSpring, [0, 0.4, 1], [0, 0.6, 1]);

  // Centra el clip al aplanar
  const uiCenteringX = interpolate(flattenProgress, [0, 1], [0, -260]);

  // Texto izquierda fade
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
  const textY = interpolate(textEnter, [0, 1], [30, 0]);

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
                "radial-gradient(ellipse at 50% 50%, rgba(0,217,255,0.10) 0%, rgba(10,10,15,0) 60%), repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 120px), #0A0A0F",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.15)",
              fontSize: 22,
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            [ BG IA · escena 5 · floating PDF assembly line ]
          </div>
        )}
      </AbsoluteFill>

      {/* ========= CAPA 2: TEXTO IZQUIERDA ========= */}
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 0,
          height: "100%",
          width: "42%",
          display: "flex",
          alignItems: "center",
          opacity: 1 - flattenProgress * 0.7, // se desvanece al aplanar el PDF
        }}
      >
        <h1
          style={{
            color: THEME.fg,
            fontFamily: FONT_STACK,
            fontWeight: 700,
            fontSize: activeBeat.text.length > 25 ? 64 : 130,
            lineHeight: 1.05,
            letterSpacing: -1.5,
            margin: 0,
            opacity: textOpacity,
            transform: `translateY(${textY}px)`,
          }}
        >
          {activeBeat.id === "latex" ? (
            <>
              PDF tipografiado en{" "}
              <span style={{ color: THEME.accentCyan }}>LaTeX.</span>
            </>
          ) : (
            activeBeat.text
          )}
        </h1>
      </div>

      {/* ========= CAPA 3: PDF UI (isométrico → flatten center hero) ========= */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: 120,
          perspective: 2200,
        }}
      >
        <div
          style={{
            width: 520,
            height: 720,
            transform: `
              translateX(${uiTranslateX + uiCenteringX}px)
              rotateX(${rotX}deg)
              rotateY(${rotY}deg)
              scale(${uiScale})
            `,
            transformStyle: "preserve-3d",
            opacity: uiOpacity,
            borderRadius: 6,
            overflow: "hidden",
            background: "#F5F5F0",
            boxShadow: `
              0 80px 180px rgba(0,0,0,0.7),
              0 40px 80px rgba(0,217,255,0.10),
              inset 0 0 0 1px rgba(255,255,255,0.06)
            `,
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
                padding: 56,
                fontFamily:
                  "'Computer Modern', 'Latin Modern Roman', Georgia, serif",
                color: "#1a1a1a",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: "#666",
                  marginBottom: 14,
                }}
              >
                TrustNode · Audit Report
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  lineHeight: 1.2,
                  marginBottom: 22,
                  borderBottom: "1px solid #ccc",
                  paddingBottom: 14,
                }}
              >
                Informe de Auditoría Financiera
              </div>
              <div style={{ fontSize: 12, color: "#444", lineHeight: 1.7 }}>
                <div style={{ marginBottom: 14, fontWeight: 600 }}>
                  1. Resumen Ejecutivo
                </div>
                <div style={{ marginBottom: 6 }}>
                  El presente informe consolida los hallazgos del análisis
                </div>
                <div style={{ marginBottom: 6 }}>
                  automatizado realizado sobre los estados financieros
                </div>
                <div style={{ marginBottom: 14 }}>
                  del ejercicio 2025.
                </div>
                <div
                  style={{
                    fontFamily: "Courier, monospace",
                    background: "#eeece4",
                    padding: 12,
                    borderRadius: 2,
                    fontSize: 11,
                    marginBottom: 14,
                  }}
                >
                  Total findings = 1{","}247<br />
                  High severity = 87 (6.98%)
                </div>
                <div style={{ marginBottom: 6, fontWeight: 600 }}>
                  2. Hallazgos
                </div>
                <div style={{ color: "#666" }}>
                  2.1 Inconsistencias en cuentas por cobrar . . . . . . . p. 12
                </div>
                <div style={{ color: "#666" }}>
                  2.2 Desviaciones de inventario . . . . . . . . . . . . p. 19
                </div>
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: 30,
                  left: 56,
                  right: 56,
                  fontSize: 10,
                  color: "#888",
                  borderTop: "1px solid #ddd",
                  paddingTop: 10,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>TrustNode · Confidential</span>
                <span>1 / 47</span>
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>

      {/* ========= CAPA 4: GRANO ========= */}
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
