import { useEffect, useState } from "react";

export function useCountUp(target: number | null, duration = 1100): number | null {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target === null) {
      setValue(0);
      return;
    }

    let startTime: number | null = null;
    let frame = 0;

    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return target === null ? null : value;
}
