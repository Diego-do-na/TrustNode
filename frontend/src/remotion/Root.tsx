import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

export const FPS = 30;
export const DURATION_IN_FRAMES = 1800; // 60s @ 30fps
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TrustNodePromo"
        component={MainVideo}
        durationInFrames={DURATION_IN_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
