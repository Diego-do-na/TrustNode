import { useCallback, useEffect, useRef, useState } from "react";

const CUBE_SIZE = 52;

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
  const dragOffset = useRef({ x: 0, y: 0 });

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
    setDragging(true);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setPos(clamp(e.clientX - dragOffset.current.x, e.clientY - dragOffset.current.y));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p.x, p.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  return (
    <section
      className={`playground-cube-scene${dragging ? " is-dragging" : ""}`}
      style={{ left: pos.x, top: pos.y, width: CUBE_SIZE, height: CUBE_SIZE }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-hidden
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
  );
}
