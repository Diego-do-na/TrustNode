import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
  // Video,
} from "remotion";
import { THEME, FONT_STACK, SERIF_STACK } from "../theme";

// === ASSETS ===
const BG_IMAGE_SRC: string | null = null; // staticFile("bg/scene4-gold-ink-library.jpg")
const UI_CLIP_SRC: string | null = null; // staticFile("ui/scene4-executive-summary-typing.mp4")

// === BEATS (300 frames @ 30fps) ===
const BEATS = [
  { id: "neg", text: "No te entrega datos.", start: 0, end: 100 },
  { id: "pos", text: "Te entrega una opinión.", start: 100, end: 200 },
  { id: "voice", text: "Redactada como un auditor senior.", start: 200, end: 300 },
] as const;

export const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const activeBeat = BEATS.find((b) => frame >= b.start && frame < b.end) ?? BEATS[0];
  const beatLocalFrame = frame - activeBeat.start;
  const beatDuration = activeBeat.end - activeBeat.start;

  // Elevación 3D del clip (entra desde abajo en spring)
  const elevation = spring({
    frame,
    fps,
    config: { damping: 26, stiffness: 70, mass: 1.4 },
  });
  const uiTranslateY = interpolate(elevation, [0, 1], [80, 0]);
  const uiOpacity = interpolate(elevation, [0, 1], [0, 1]);

  // Light beam pulse (gold)
  const beamAlpha = interpolate(
    Math.sin(frame * 0.06),
    [-1, 1],
    [0.35, 0.7]
  );

  // Text enter/exit
  const textEnter = interpolate(beatLocalFrame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textExit = interpolate(
    beatLocalFrame,
    [beatDuration - 14, beatDuration],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const textOpacity = textEnter * textExit;
  const textX = interpolate(textEnter, [0, 1], [-30, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, fontFamily: FONT_STACK }}>
      {/* ========= CAPA 1: FONDO IA ========= */}
      <AbsoluteFill>
        {BG_IMAGE_SRC ? (
          <Img
            src={BG_IMAGE_SRC}
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background:
                "radial-gradient(ellipse at 60% 0%, rgba(212,175,55,0.18) 0%, rgba(10,10,15,0) 50%), radial-gradient(ellipse at 50% 100%, rgba(212,175,55,0.06) 0%, rgba(10,10,15,0) 60%), #0A0A0F",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.15)",
              fontSize: 22,
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            [ BG IA · escena 4 · gold ink editorial library ]
          </div>
        )}
      </AbsoluteFill>

      {/* ========= CAPA 2: VOLUMETRIC LIGHT BEAM (top → down, gold) ========= */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: 700,
          height: "100%",
          transform: "translateX(-50%)",
          background: `linear-gradient(180deg, rgba(212,175,55,${beamAlpha * 0.25}) 0%, transparent 70%)`,
          filter: "blur(40px)",
          pointerEvents: "none",
          mixBlendMode: "screen",
        }}
      />

      {/* ========= CAPA 3: TEXTO IZQUIERDA (serif, columna vertical) ========= */}
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 0,
          height: "100%",
          width: "32%",
          display: "flex",
          alignItems: "center",
        }}
      >
        <h1
          style={{
            fontFamily: SERIF_STACK,
            fontWeight: 500,
            color: THEME.fg,
            fontSize: 76,
            lineHeight: 1.1,
            letterSpacing: -1,
            fontStyle: "italic",
            margin: 0,
            opacity: textOpacity,
            transform: `translateX(${textX}px)`,
            textShadow:
              activeBeat.id === "pos"
                ? `0 0 30px rgba(212,175,55,0.4)`
                : "none",
          }}
        >
          {activeBeat.id === "pos" ? (
            <>
              Te entrega{" "}
              <span style={{ color: THEME.accentGold }}>una opinión.</span>
            </>
          ) : (
            activeBeat.text
          )}
        </h1>
      </div>

      {/* ========= CAPA 4: CLIP UI CENTRADO (formato carta 3:4, elevado 3D) ========= */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: 140,
          perspective: 2200,
        }}
      >
        <div
          style={{
            width: 560,
            height: 760,
            transform: `translateY(${uiTranslateY}px) rotateY(-6deg) rotateX(2deg)`,
            transformStyle: "preserve-3d",
            opacity: uiOpacity,
            borderRadius: 8,
            overflow: "hidden",
            background: "#F5F5F0",
            boxShadow: `
              0 80px 160px rgba(0,0,0,0.7),
              0 30px 60px rgba(212,175,55,0.18),
              inset 0 0 0 1px rgba(255,255,255,0.08)
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
                fontFamily: SERIF_STACK,
                color: "#1a1a1a",
                fontSize: 18,
                lineHeight: 1.6,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  letterSpacing: 4,
                  textTransform: "uppercase",
                  color: "#8a7530",
                  marginBottom: 28,
                }}
              >
                Resumen Ejecutivo
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 18 }}>
                Opinión del auditor
              </div>
              <p style={{ margin: 0, marginBottom: 14 }}>
                Tras revisar los estados financieros del ejercicio 2025
                <sup style={{ color: "#8a7530" }}>[1]</sup>, identificamos
                3 hallazgos de materialidad alta
                <sup style={{ color: "#8a7530" }}>[2]</sup> que requieren
                ajuste antes de la emisión del dictamen.
              </p>
              <div
                style={{
                  width: Math.min(420, beatLocalFrame * 6),
                  height: 14,
                  background: "#e8e6db",
                  marginTop: 18,
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  width: Math.min(380, Math.max(0, (beatLocalFrame - 8) * 6)),
                  height: 14,
                  background: "#e8e6db",
                  marginTop: 10,
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  width: Math.min(260, Math.max(0, (beatLocalFrame - 16) * 6)),
                  height: 14,
                  background: "#e8e6db",
                  marginTop: 10,
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  marginTop: 40,
                  fontSize: 12,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: "rgba(0,0,0,0.35)",
                }}
              >
                [ UI clip · streaming token-by-token ]
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>

      {/* ========= CAPA 5: PARTÍCULAS DOR ========= */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        {Array.from({ length: 20 }).map((_, i) => {
          const seed = i * 137.508;
          const px = (seed * 7) % 100;
          const py = ((seed * 13) % 100 + frame * 0.08) % 100;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${px}%`,
                top: `${py}%`,
                width: 3,
                height: 3,
                borderRadius: "50%",
                background: THEME.accentGold,
                opacity: 0.35,
                filter: "blur(0.5px)",
                boxShadow: `0 0 8px ${THEME.accentGold}`,
              }}
            />
          );
        })}
      </AbsoluteFill>

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
