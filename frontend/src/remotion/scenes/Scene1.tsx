import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Img,
  // Video, // ← Descomenta cuando inyectes el clip MP4 real
} from "remotion";
import { THEME, FONT_STACK } from "../theme";

// === ASSETS (inyectar después) ===
// Sustituye estas constantes por staticFile("...") cuando los assets estén en /public
const BG_IMAGE_SRC: string | null = null; // ej: staticFile("bg/scene1-falling-data.jpg")
const UI_CLIP_SRC: string | null = null; // ej: staticFile("ui/scene1-excel-timelapse.mp4")

// === BEATS (en frames @ 30fps, duración total: 240) ===
const BEATS = [
  { text: "47 horas.", start: 0, end: 75 },
  { text: "Por una sola auditoría.", start: 75, end: 150 },
  { text: "Y luego, la nube se queda con tus datos.", start: 150, end: 240, glitch: true },
] as const;

export const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Beat activo
  const activeBeat = BEATS.find((b) => frame >= b.start && frame < b.end) ?? BEATS[0];

  // Animación entrada/salida del texto activo
  const beatLocalFrame = frame - activeBeat.start;
  const beatDuration = activeBeat.end - activeBeat.start;

  const textEnter = interpolate(beatLocalFrame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const textExit = interpolate(
    beatLocalFrame,
    [beatDuration - 10, beatDuration],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const textOpacity = textEnter * textExit;
  const textTranslateY = interpolate(textEnter, [0, 1], [40, 0]);

  // Glitch en beat 3
  const glitchOffset =
    "glitch" in activeBeat && activeBeat.glitch
      ? Math.sin(frame * 1.8) * 2 + (Math.random() > 0.92 ? 6 : 0)
      : 0;

  // Vignette pulse (tensión)
  const vignetteAlpha = interpolate(
    Math.sin(frame * 0.08),
    [-1, 1],
    [0.55, 0.75]
  );

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, fontFamily: FONT_STACK }}>
      {/* ========= CAPA 1: FONDO IA (placeholder) ========= */}
      <AbsoluteFill>
        {BG_IMAGE_SRC ? (
          <Img
            src={BG_IMAGE_SRC}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.85,
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background:
                "radial-gradient(ellipse at 30% 40%, rgba(255,59,48,0.18) 0%, rgba(10,10,15,0) 55%), radial-gradient(ellipse at 70% 70%, rgba(255,59,48,0.10) 0%, rgba(10,10,15,0) 60%), #0A0A0F",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.15)",
              fontSize: 22,
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            [ BG IA · escena 1 · falling red data ]
          </div>
        )}
      </AbsoluteFill>

      {/* ========= CAPA 2: VIGNETTE ========= */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignetteAlpha}) 100%)`,
          pointerEvents: "none",
        }}
      />

      {/* ========= CAPA 3: CLIP UI (esquina inferior derecha, 40%, blur, opacidad 60%) ========= */}
      <div
        style={{
          position: "absolute",
          right: 80,
          bottom: 80,
          width: width * 0.4,
          height: height * 0.4,
          opacity: 0.6,
          filter: "blur(1.5px) saturate(0.7)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {UI_CLIP_SRC ? (
          // <Video src={UI_CLIP_SRC} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div /> // placeholder hasta importar <Video />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background:
                "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 28px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.35)",
              fontSize: 16,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            [ UI clip · Excel timelapse + cursor ]
          </div>
        )}
      </div>

      {/* ========= CAPA 4: TIPOGRAFÍA CINÉTICA ========= */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingLeft: 120,
          paddingRight: 120,
        }}
      >
        <h1
          style={{
            color: THEME.fg,
            fontFamily: FONT_STACK,
            fontWeight: 700,
            fontSize: activeBeat.text.length > 25 ? 110 : 180,
            lineHeight: 1.02,
            letterSpacing: -2,
            margin: 0,
            maxWidth: "75%",
            opacity: textOpacity,
            transform: `translate(${glitchOffset}px, ${textTranslateY}px)`,
            textShadow:
              "glitch" in activeBeat && activeBeat.glitch
                ? `${glitchOffset}px 0 ${THEME.accentRed}, ${-glitchOffset}px 0 ${THEME.accentCyan}`
                : "none",
          }}
        >
          {activeBeat.text}
        </h1>
      </AbsoluteFill>

      {/* ========= CAPA 5: GRANO / NOISE (sutil) ========= */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/></svg>\")",
          opacity: 0.06,
          mixBlendMode: "overlay",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
