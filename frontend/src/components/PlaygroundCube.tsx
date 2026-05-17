import { useCallback, useEffect, useRef, useState } from "react";
import { TrustNodeEasterEggModal } from "./TrustNodeEasterEggModal";

const CUBE_SIZE = 52;
const TAP_MOVE_THRESHOLD = 8;

function initialPosition() {
  if (typeof window === "undefined") return { x: 24, y: 24 };
  return {
    x: Math.max(16, window.innerWidth - CUBE_SIZE - 48),
    y: Math.max(16, window.innerHeight - CUBE_SIZE - 48),
  };
}

export function PlaygroundCube() {
  const [pos, setPos] = useState(initialPosition);
  const [dragging, setDragging] = useState(false);
  const [easterEggOpen, setEasterEggOpen] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const pointerStart = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const pointerActive = useRef(false);

  const clamp = useCallback((x: number, y: number) => {
    const maxX = window.innerWidth - CUBE_SIZE - 8;
    const maxY = window.innerHeight - CUBE_SIZE - 8;
    return {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY),
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerActive.current = true;
    didDrag.current = false;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerActive.current) return;

    const dx = e.clientX - pointerStart.current.x;
    const dy = e.clientY - pointerStart.current.y;

    if (!didDrag.current && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
      didDrag.current = true;
      setDragging(true);
    }

    if (didDrag.current) {
      setPos(clamp(e.clientX - dragOffset.current.x, e.clientY - dragOffset.current.y));
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerActive.current) return;

    if (!didDrag.current) {
      setEasterEggOpen(true);
    }

    pointerActive.current = false;
    didDrag.current = false;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p.x, p.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  return (
    <>
      <section
        className={`playground-cube-scene print:hidden${dragging ? " is-dragging" : ""}`}
        style={{ left: pos.x, top: pos.y, width: CUBE_SIZE, height: CUBE_SIZE }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        aria-label="Playground cube — tap for a surprise"
        title="Tap me"
      >
        <article className={`playground-cube${dragging ? " is-spinning-fast" : ""}`}>
          <span className="cube-face cube-front" />
          <span className="cube-face cube-back" />
          <span className="cube-face cube-right" />
          <span className="cube-face cube-left" />
          <span className="cube-face cube-top" />
          <span className="cube-face cube-bottom" />
        </article>
      </section>

      <TrustNodeEasterEggModal open={easterEggOpen} onClose={() => setEasterEggOpen(false)} />
    </>
  );
}
