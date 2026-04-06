/**
 * Place trim degree labels on the outside of each bend (reflex side), not inside the acute/obtuse
 * wedge that matches the displayed interior angle. Uses only local geometry at the corner — no Y-based heuristics.
 */

export type TrimCornerSegment = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

/**
 * Returns the direction (radians) from the corner along which the angle label should sit: the bisector
 * of the *exterior* bend (opposite the smaller wedge between the two legs).
 */
export function getOutsideBendAngleLabelBisectorRad(prev: TrimCornerSegment, curr: TrimCornerSegment): number {
  const corner = curr.start;

  let rInX = prev.start.x - corner.x;
  let rInY = prev.start.y - corner.y;
  let rOutX = curr.end.x - corner.x;
  let rOutY = curr.end.y - corner.y;

  let lenIn = Math.hypot(rInX, rInY);
  let lenOut = Math.hypot(rOutX, rOutY);

  if (lenIn < 1e-9 || lenOut < 1e-9) {
    const prevDx = prev.end.x - prev.start.x;
    const prevDy = prev.end.y - prev.start.y;
    const currDx = curr.end.x - curr.start.x;
    const currDy = curr.end.y - curr.start.y;
    const pl = Math.hypot(prevDx, prevDy) || 1;
    const cl = Math.hypot(currDx, currDy) || 1;
    rInX = -prevDx / pl;
    rInY = -prevDy / pl;
    rOutX = currDx / cl;
    rOutY = currDy / cl;
    lenIn = 1;
    lenOut = 1;
  } else {
    rInX /= lenIn;
    rInY /= lenIn;
    rOutX /= lenOut;
    rOutY /= lenOut;
  }

  let bx = rInX + rOutX;
  let by = rInY + rOutY;
  const blen = Math.hypot(bx, by);
  if (blen < 1e-8) {
    return Math.atan2(rInY, rInX) + Math.PI / 2;
  }
  bx /= blen;
  by /= blen;
  const interiorBisector = Math.atan2(by, bx);
  return interiorBisector + Math.PI;
}
