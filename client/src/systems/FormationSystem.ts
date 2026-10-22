import { FormationType, Vec2 } from '../../../shared/types';

export function getFormationOffsets(formation: FormationType, heading: Vec2): Vec2[] {
  const len = Math.hypot(heading.x, heading.y) || 1;
  const fx = heading.x / len;
  const fy = heading.y / len;
  const rx = -fy;
  const ry = fx;

  if (formation === 'LINE') {
    return [
      { x: 0, y: 0 },
      { x: rx * 1.25, y: ry * 1.25 },
      { x: -rx * 1.25, y: -ry * 1.25 },
    ];
  }

  if (formation === 'SPREAD') {
    return [
      { x: fx * 0.6, y: fy * 0.6 },
      { x: -fx * 1.35 + rx * 1.6, y: -fy * 1.35 + ry * 1.6 },
      { x: -fx * 1.35 - rx * 1.6, y: -fy * 1.35 - ry * 1.6 },
    ];
  }

  return [
    { x: 0, y: 0 },
    { x: -fx * 1.25 + rx * 1.05, y: -fy * 1.25 + ry * 1.05 },
    { x: -fx * 1.25 - rx * 1.05, y: -fy * 1.25 - ry * 1.05 },
  ];
}
