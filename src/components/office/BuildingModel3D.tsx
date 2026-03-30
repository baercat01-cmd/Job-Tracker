import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface EstimatorOpening {
  id: number;
  wall: 'Front' | 'Back' | 'Left' | 'Right';
  offset: number;
  elev: number;
  w: number;
  h: number;
}

export interface EstimatorBuildingState {
  width: number;
  length: number;
  height: number;
  pitch: number;
  openings: EstimatorOpening[];
}

export interface VisibilityState {
  frame: boolean;
  shell: boolean;
  roof: boolean;
  /** When shell is on: triangular metal on front/back gables. `false` = end walls only (no gable triangles). Default true if omitted. */
  shellGables?: boolean;
}

export function BuildingModel3D({ state, visibility }: { state: EstimatorBuildingState; visibility: VisibilityState }) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (groupRef.current) {
      buildModel(groupRef.current, state, visibility);
    }
  }, [state, visibility]);

  return <group ref={groupRef} />;
}

// NOTE: Extracted from BuildingEstimator3D so multiple screens can reuse it.
export function buildModel(group: THREE.Group, state: EstimatorBuildingState, visibility: VisibilityState) {
  // Clear existing geometry
  while (group.children.length > 0) {
    group.remove(group.children[0]);
  }

  const w = state.width;
  const l = Math.ceil(state.length / 8) * 8;
  const h = state.height;
  const pitch = state.pitch;
  const angle = Math.atan(pitch / 12);
  const peakH = (w / 2) * (pitch / 12);

  // Physical Constants
  const heel = 0.5; // 6 inches
  const eaveOverhang = 1.5;
  const gableOverhang = 1.5;
  const Tp = 0.4583; // 6x6 post
  const Tg = 0.125; // 1.5" girt
  const Wc = 0.4583; // 2x6 chord (5.5")
  const vertChordDepth = Wc / Math.cos(angle);

  const frameX = (w / 2) - Tg;

  // Materials
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xc4a484 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.5 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });

  // 1. Slab
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, l), slabMat);
  slab.position.y = -0.25;
  group.add(slab);

  const offsetZ = l / 2;

  // 2. Sidewall Posts (8' OC)
  if (visibility.frame) {
    const nB = l / 8;
    for (let i = 0; i <= nB; i++) {
      let z = (i * 8) - offsetZ;
      if (i === 0) z += (Tp / 2 + Tg);
      if (i === nB) z -= (Tp / 2 + Tg);
      [-1, 1].forEach(side => {
        const postH = h + heel + vertChordDepth;
        const p = new THREE.Mesh(new THREE.BoxGeometry(Tp, postH, Tp), woodMat);
        p.position.set((frameX - Tp / 2) * side, postH / 2, z);
        group.add(p);
      });
    }
  }

  // 3. Endwall Posts
  if (visibility.frame) {
    for (let x = 8; x < w - 1; x += 8) {
      const posX = x - w / 2;
      [-1, 1].forEach(sideZ => {
        const run = frameX - Math.abs(posX);
        const epTop = h + heel + (run * Math.tan(angle)) + vertChordDepth;
        const ep = new THREE.Mesh(new THREE.BoxGeometry(Tp, epTop, Tp), woodMat);
        const zPos = (offsetZ - Tg - Tp / 2) * sideZ;
        ep.position.set(posX, epTop / 2, zPos);
        ep.rotation.y = Math.PI / 2;
        group.add(ep);
      });
    }
  }

  // 4. Truss Carrier Headers
  if (visibility.frame) {
    [-1, 1].forEach(side => {
      const bLen = l + 2 * Tg;
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(Tg, 0.77, bLen), woodMat);
      b1.position.set(frameX * side, h - 0.385, 0);
      group.add(b1);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(Tg, 0.77, bLen), woodMat);
      b2.position.set((frameX - Tp - Tg) * side, h - 0.385, 0);
      group.add(b2);
    });
  }

  // 5. Trusses (4' OC)
  if (visibility.frame) {
    for (let t = 0; t <= l; t += 4) {
      let z = t - offsetZ;
      if (t === 0) z = -offsetZ + Tg / 2;
      else if (t === l) z = offsetZ - Tg / 2;
      else if (t % 8 === 0) z += (Tp / 2 + Tg / 2);

      const truss = new THREE.Group();
      truss.position.set(0, h, z);

      // Bottom Chord
      const bc = new THREE.Mesh(new THREE.BoxGeometry(frameX * 2, Wc, Tg), woodMat);
      bc.position.y = Wc / 2;
      truss.add(bc);

      // Top Chords (Rafters)
      const totalRun = frameX + eaveOverhang;
      [-1, 1].forEach(side => {
        const shape = new THREE.Shape();
        const ridgeY = heel + (frameX * Math.tan(angle));
        const tailY = ridgeY - (totalRun * Math.tan(angle));

        shape.moveTo(0, ridgeY + vertChordDepth);
        shape.lineTo(totalRun, tailY + vertChordDepth);
        shape.lineTo(totalRun, tailY);
        shape.lineTo(0, ridgeY);
        shape.lineTo(0, ridgeY + vertChordDepth);

        const rGeom = new THREE.ExtrudeGeometry(shape, { depth: Tg, bevelEnabled: false });
        const r = new THREE.Mesh(rGeom, woodMat);
        if (side === 1) r.position.set(0, 0, -Tg / 2);
        else { r.position.set(0, 0, Tg / 2); r.scale.x = -1; }
        truss.add(r);
      });

      group.add(truss);
    }
  }

  // 6. Roof Purlins (2' OC)
  const peakTopSurfaceY = h + heel + vertChordDepth + (frameX * Math.tan(angle));
  if (visibility.frame) {
    const pLen = l + (gableOverhang * 2) + (2 * Tg);
    for (let dist = 0.5; dist < (frameX + eaveOverhang - 0.2); dist += 2) {
      [-1, 1].forEach(side => {
        const pur = new THREE.Mesh(new THREE.BoxGeometry(0.292, Tg, pLen), woodMat);
        const py = peakTopSurfaceY - (dist * Math.tan(angle)) + (Tg / 2 / Math.cos(angle));
        pur.position.set(dist * side, py, 0);
        pur.rotation.z = angle * -side;
        group.add(pur);
      });
    }
  }

  // 7. Windows & Framing
  if (visibility.frame) {
    state.openings.forEach(op => {
      const opG = new THREE.Group();
      opG.add(new THREE.Mesh(new THREE.BoxGeometry(op.w, op.h, 0.2), glassMat));

      const fD = 0.292;
      const header = new THREE.Mesh(new THREE.BoxGeometry(op.w + 2 * Tg, fD, Tg), woodMat);
      header.position.set(0, op.h / 2 + fD / 2, 0);
      opG.add(header);

      const sill = new THREE.Mesh(new THREE.BoxGeometry(op.w + 2 * Tg, fD, Tg), woodMat);
      sill.position.set(0, -op.h / 2 - fD / 2, 0);
      opG.add(sill);

      [-1, 1].forEach(s => {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(Tg, op.h, fD), woodMat);
        jamb.position.set((op.w / 2 + Tg / 2) * s, 0, 0);
        opG.add(jamb);
      });

      let px = 0, pz = 0, ry = 0;
      if (op.wall === 'Front') { pz = -l / 2 - Tg / 2; px = -w / 2 + op.offset + op.w / 2; }
      else if (op.wall === 'Back') { pz = l / 2 + Tg / 2; px = -w / 2 + op.offset + op.w / 2; }
      else if (op.wall === 'Left') { px = -w / 2 - Tg / 2; pz = -l / 2 + op.offset + op.w / 2; ry = Math.PI / 2; }
      else if (op.wall === 'Right') { px = w / 2 + Tg / 2; pz = -l / 2 + op.offset + op.w / 2; ry = Math.PI / 2; }

      opG.position.set(px, op.elev + op.h / 2, pz);
      opG.rotation.y = ry;
      group.add(opG);
    });
  }

  // 8. Wall Girts
  if (visibility.frame) {
    for (let gy = 2; gy < h; gy += 2) {
      [-1, 1].forEach(sx => {
        const g = new THREE.Mesh(new THREE.BoxGeometry(Tg, 0.292, l), woodMat);
        g.position.set((w / 2 - Tg / 2) * sx, gy, 0);
        group.add(g);
      });
      [-1, 1].forEach(sz => {
        const g = new THREE.Mesh(new THREE.BoxGeometry(w, 0.292, Tg), woodMat);
        g.position.set(0, gy, (l / 2 - Tg / 2) * sz);
        group.add(g);
      });
    }
  }

  // 9. Fascia
  if (visibility.frame) {
    const fasciaFullLen = l + (gableOverhang * 2) + (2 * Tg);
    const purlinVertOffset = Tg / Math.cos(angle);

    [-1, 1].forEach(side => {
      const eaveF = new THREE.Mesh(new THREE.BoxGeometry(Tg, Wc, fasciaFullLen), woodMat);
      const xF = (frameX + eaveOverhang + Tg / 2) * side;
      const eaveRafterTopYAtEnd = h + heel + vertChordDepth - (eaveOverhang * Math.tan(angle));
      eaveF.position.set(xF, eaveRafterTopYAtEnd - Wc / 2, 0);
      group.add(eaveF);
    });

    const rakeLen = (w / 2 + eaveOverhang) / Math.cos(angle);
    [-1, 1].forEach(sideZ => {
      const zPos = (l / 2 + gableOverhang + Tg / 2) * sideZ;
      [-1, 1].forEach(sideX => {
        const rakeF = new THREE.Mesh(new THREE.BoxGeometry(rakeLen, Wc, Tg), woodMat);
        const mx = ((w / 2 + eaveOverhang) / 2) * sideX;
        const rakePurlinTopY = peakTopSurfaceY - (Math.abs(mx) * Math.tan(angle)) + purlinVertOffset;
        rakeF.position.set(mx, rakePurlinTopY - (Wc / 2) * Math.cos(angle), zPos);
        rakeF.rotation.z = angle * -sideX;
        group.add(rakeF);
      });
    });
  }

  // 10. Sheeting (Shell)
  if (visibility.shell) {
    const showGableEnds = visibility.shellGables !== false;
    [-1, 1].forEach(sz => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), metalMat);
      wall.position.set(0, h / 2, (l / 2) * sz);
      group.add(wall);
      if (showGableEnds) {
        const gable = new THREE.Mesh(new THREE.CylinderGeometry(0, w / 2, peakH, 3), metalMat);
        gable.position.set(0, h + peakH / 2, (l / 2) * sz);
        gable.rotation.z = Math.PI;
        group.add(gable);
      }
    });
    [-1, 1].forEach(sx => {
      const sidewall = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, l), metalMat);
      sidewall.position.set((w / 2) * sx, h / 2, 0);
      group.add(sidewall);
    });
  }

  // 11. Roof Sheeting
  if (visibility.roof) {
    const slopeLen = Math.sqrt(Math.pow(w / 2, 2) + Math.pow(peakH, 2)) + eaveOverhang;
    [-1, 1].forEach(side => {
      const r = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.1, l + (gableOverhang * 2)), metalMat);
      r.position.set((slopeLen / 2 - (eaveOverhang / 2)) * side, h + peakH / 2 + 0.6, 0);
      r.rotation.z = angle * -side;
      group.add(r);
    });
  }
}

