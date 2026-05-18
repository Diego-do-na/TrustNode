import { AbsoluteFill, Series } from "remotion";
import { Scene1 } from "./scenes/Scene1";
import { Scene2 } from "./scenes/Scene2";
import { Scene3 } from "./scenes/Scene3";
import { Scene4 } from "./scenes/Scene4";
import { Scene5 } from "./scenes/Scene5";
import { Scene6 } from "./scenes/Scene6";

export const SCENE_DURATIONS = {
  scene1: 240, // 0:00 → 0:08  (Problema)
  scene2: 300, // 0:08 → 0:18  (Motor offline)
  scene3: 360, // 0:18 → 0:30  (Análisis / Heatmap)
  scene4: 300, // 0:30 → 0:40  (Resumen ejecutivo)
  scene5: 300, // 0:40 → 0:50  (PDF LaTeX)
  scene6: 300, // 0:50 → 1:00  (99% Efficiency)
} as const;

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0F" }}>
      <Series>
        <Series.Sequence durationInFrames={SCENE_DURATIONS.scene1}>
          <Scene1 />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENE_DURATIONS.scene2}>
          <Scene2 />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENE_DURATIONS.scene3}>
          <Scene3 />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENE_DURATIONS.scene4}>
          <Scene4 />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENE_DURATIONS.scene5}>
          <Scene5 />
        </Series.Sequence>

        <Series.Sequence durationInFrames={SCENE_DURATIONS.scene6}>
          <Scene6 />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
