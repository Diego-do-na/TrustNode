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

// === ASSETS (inyectar después) ===
const BG_IMAGE_SRC: string | null = null; // staticFile("bg/scene2-neural-core.jpg")
const UI_CLIP_SRC: string | null = null; // staticFile("ui/scene2-ollama-terminal.mp4")

// === BEATS (300 frames @ 30fps) ===
const BEATS = [
  { id: "intro", text: "Conoce TrustNode.", start: 0, end: 100 },
  { id: "stack", text: "Llama 3.1 · ChromaDB · RAG", start: 100, end: 200 },
  { id: "claim", text: "Zero Cloud. 100% Local.", start: 200, end: 300 },
] as const;

export const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const activeBeat = BEATS.find((b) => frame >= b.start && frame < b.end) ?? BEATS[0];
  const beatLocalFrame = frame - activeBeat.start;
  const beatDuration = activeBeat.end - activeBeat.start;

  // Parallax sutil sobre el clip UI (oscila eje Y)
  const parallaxY = Math.sin(frame * 0.04) * 6;

  // Glow cyan pulsa
  const glowIntensity = interpolate(
    Math.sin(frame * 0.1),
    [-1, 1],
    [0.45, 0.85]
  );

  // Letras stagger del beat activo
  const letters = activeBeat.text.split("");

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
                "radial-gradient(circle at 75% 50%, rgba(0,217,255,0.18) 0%, rgba(10,10,15,0) 50%), radial-gradient(circle at 25% 30%, rgba(0,217,255,0.08) 0%, rgba(10,10,15,0) 45%), #0A0A0F",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.15)",
              fontSize: 22,
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            [ BG IA · escena 2 · neural core glowing cyan ]
          </div>
        )}
      </AbsoluteFill>

      {/* ========= CAPA 2: VIGNETTE ========= */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.65) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* ========= CAPA 3: SPLIT 50/50 ========= */}
      <AbsoluteFill style={{ display: "flex", flexDirection: "row" }}>
        {/* IZQUIERDA: tipografía alineada al baseline inferior, stagger letra por letra */}
        <div
          style={{
            width: "50%",
            height: "100%",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-start",
            paddingLeft: 100,
            paddingBottom: 120,
          }}
        >
          <h1
            style={{
              color: THEME.fg,
              fontFamily: FONT_STACK,
              fontWeight: 700,
              fontSize: activeBeat.text.length > 22 ? 88 : 130,
              lineHeight: 1.02,
              letterSpacing: -1.5,
              margin: 0,
              display: "flex",
              flexWrap: "wrap",
              maxWidth: "100%",
            }}
          >
            {letters.map((ch, i) => {
              const letterSpring = spring({
                frame: beatLocalFrame - i * 1.6,
                fps,
                config: { damping: 14, stiffness: 110, mass: 0.7 },
              });
              const letterOpacity = interpolate(letterSpring, [0, 1], [0, 1]);
              const letterY = interpolate(letterSpring, [0, 1], [50, 0]);

              // Exit
              const exit = interpolate(
                beatLocalFrame,
                [beatDuration - 14, beatDuration],
                [1, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );

              return (
                <span
                  key={`${activeBeat.id}-${i}`}
                  style={{
                    display: "inline-block",
                    opacity: letterOpacity * exit,
                    transform: `translateY(${letterY}px)`,
                    whiteSpace: "pre",
                    color:
                      activeBeat.id === "claim" && (ch === "Z" || ch === "1" || ch === "0")
                        ? THEME.accentCyan
                        : THEME.fg,
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </h1>
        </div>

        {/* DERECHA: clip UI con tilt 3D -12° eje Y + parallax + glow cyan */}
        <div
          style={{
            width: "50%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            perspective: 1800,
          }}
        >
          <div
            style={{
              width: "82%",
              height: "62%",
              transform: `translateY(${parallaxY}px) rotateY(-12deg)`,
              transformStyle: "preserve-3d",
              borderRadius: 14,
              overflow: "hidden",
              border: "1px solid rgba(0,217,255,0.25)",
              boxShadow: `
                0 0 80px rgba(0,217,255,${glowIntensity * 0.55}),
                0 30px 100px rgba(0,0,0,0.7),
                inset 0 0 0 1px rgba(255,255,255,0.04)
              `,
              position: "relative",
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
                  background:
                    "linear-gradient(160deg, #0d0d14 0%, #050507 100%)",
                  color: "rgba(0,217,255,0.7)",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 18,
                  padding: 32,
                  lineHeight: 1.6,
                }}
              >
                <div style={{ opacity: 0.6, marginBottom: 12 }}>~ trustnode $</div>
                <div>ollama run llama3.1</div>
                <div style={{ opacity: 0.55 }}>
                  ▌ loading model (8B params)...
                </div>
                <div style={{ marginTop: 18, opacity: 0.4, fontSize: 14, letterSpacing: 2 }}>
                  [ UI clip · terminal Ollama + ChromaDB indexing ]
                </div>
              </div>
            )}
          </div>
        </div>
      </AbsoluteFill>

      {/* ========= CAPA 5: GRANO ========= */}
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
