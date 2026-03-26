import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { loftStructureThicknessFt } from '@/lib/buildingPlanModel';
import { computePerimeterPostSlots, POST_Tg as Tg, POST_Tp as Tp } from '@/lib/perimeterPostLayout';
import type { EstimatorBuildingState, EstimatorOpening } from '@/lib/planToEstimator3D';

export interface VisibilityState {
  frame: boolean;
  shell: boolean;
  roof: boolean;
  /**
   * When shell is on: draw triangular end-wall sheeting (gable). Default true if omitted.
   * Turn off for “walls only” (four rectangles to eave, no end triangles, no roof planes).
   */
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
  const Wc = 0.4583; // 2x6 chord (5.5")
  const vertChordDepth = Wc / Math.cos(angle);

  const frameX = (w / 2) - Tg;

  // Materials
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xc4a484 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.5 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
  const shellGablesOn = visibility.shellGables !== false;

  // 1. Slab
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, l), slabMat);
  slab.position.y = -0.25;
  group.add(slab);

  const loftDeckMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8 });
  const loftHoleMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
  const loftVolumeMat = new THREE.MeshStandardMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.14 });
  const stairMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6 });
  for (const lf of state.lofts) {
    const deckTopY = lf.elevation;
    const loftDeckThick = loftStructureThicknessFt(h, deckTopY);
    const deckCenterY = deckTopY - loftDeckThick / 2;

    const deck = new THREE.Mesh(new THREE.BoxGeometry(lf.width, loftDeckThick, lf.depth), loftDeckMat);
    deck.position.set(lf.centerX, deckCenterY, lf.centerZ);
    if (visibility.frame || visibility.shell) group.add(deck);

    if (lf.stairOpening) {
      const holeMesh = new THREE.Mesh(
        new THREE.BoxGeometry(lf.stairOpening.w, loftDeckThick + 0.08, lf.stairOpening.d),
        loftHoleMat
      );
      holeMesh.position.set(lf.stairOpening.ox, deckCenterY, lf.stairOpening.oz);
      group.add(holeMesh);
    }

    const headroom = Math.max(1, Math.min(lf.clearHeight, 24));
    const vol = new THREE.Mesh(new THREE.BoxGeometry(lf.width, headroom, lf.depth), loftVolumeMat);
    vol.position.set(lf.centerX, deckTopY + headroom / 2, lf.centerZ);
    if (visibility.frame || visibility.shell) group.add(vol);
  }

  for (const st of state.stairs) {
    const len = Math.sqrt(st.run * st.run + st.rise * st.rise) || 0.01;
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(st.width, 0.22, len), stairMat);
    ramp.position.set(0, st.rise / 2, st.run / 2);
    ramp.rotation.x = -Math.atan2(st.rise, st.run);
    const g = new THREE.Group();
    g.position.set(st.footX, 0, st.footZ);
    g.rotation.y = (-st.angleDeg * Math.PI) / 180;
    g.add(ramp);
    if (visibility.frame || visibility.shell) group.add(g);
  }

  const offsetZ = l / 2;
  const zEnd = offsetZ - Tg - Tp / 2;

  const overheadsForLayout = state.openings
    .filter((o) => o.kind === 'overhead_door')
    .map((o) => ({ wall: o.wall, offset: o.offset, width: o.w }));
  const postSlots = computePerimeterPostSlots(w, state.length, overheadsForLayout);

  // 2–3. Perimeter posts (8' OC + overhead jamb posts; interior posts between jambs removed)
  if (visibility.frame) {
    for (const slot of postSlots) {
      if (slot.edge === 'Left' || slot.edge === 'Right') {
        const postH = h + heel + vertChordDepth;
        const side = slot.edge === 'Left' ? -1 : 1;
        const p = new THREE.Mesh(new THREE.BoxGeometry(Tp, postH, Tp), woodMat);
        p.position.set((frameX - Tp / 2) * side, postH / 2, slot.along);
        group.add(p);
      } else {
        const posX = slot.along;
        const run = frameX - Math.abs(posX);
        const epTop = h + heel + run * Math.tan(angle) + vertChordDepth;
        const ep = new THREE.Mesh(new THREE.BoxGeometry(Tp, epTop, Tp), woodMat);
        const zPos = slot.edge === 'Front' ? -zEnd : zEnd;
        ep.position.set(posX, epTop / 2, zPos);
        ep.rotation.y = Math.PI / 2;
        group.add(ep);
      }
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

  // 7. Windows, doors, overhead — glass only with shell (no frame); full rough opening when frame on
  const openingWorldPlacement = (op: EstimatorOpening, inset: number) => {
    let px = 0;
    let pz = 0;
    let ry = 0;
    if (op.wall === 'Front') {
      pz = -l / 2 - inset;
      px = -w / 2 + op.offset + op.w / 2;
    } else if (op.wall === 'Back') {
      pz = l / 2 + inset;
      px = -w / 2 + op.offset + op.w / 2;
    } else if (op.wall === 'Left') {
      px = -w / 2 - inset;
      pz = -l / 2 + op.offset + op.w / 2;
      ry = Math.PI / 2;
    } else if (op.wall === 'Right') {
      px = w / 2 + inset;
      pz = -l / 2 + op.offset + op.w / 2;
      ry = Math.PI / 2;
    }
    return { px, pz, ry };
  };

  const parseHexColor = (hex: string): number => {
    const h = hex.replace('#', '').trim();
    if (h.length === 6 && /^[0-9a-fA-F]+$/.test(h)) return parseInt(h, 16);
    return 0x475569;
  };

  const placeOpening = (op: EstimatorOpening, withFraming: boolean) => {
    const opG = new THREE.Group();
    opG.add(new THREE.Mesh(new THREE.BoxGeometry(op.w, op.h, 0.2), glassMat));
    if (withFraming) {
      const fD = 0.292;
      const header = new THREE.Mesh(new THREE.BoxGeometry(op.w + 2 * Tg, fD, Tg), woodMat);
      header.position.set(0, op.h / 2 + fD / 2, 0);
      opG.add(header);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(op.w + 2 * Tg, fD, Tg), woodMat);
      sill.position.set(0, -op.h / 2 - fD / 2, 0);
      opG.add(sill);
      [-1, 1].forEach((s) => {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(Tg, op.h, fD), woodMat);
        jamb.position.set((op.w / 2 + Tg / 2) * s, 0, 0);
        opG.add(jamb);
      });
    }
    const inset = withFraming ? Tg / 2 : 0.03;
    const { px, pz, ry } = openingWorldPlacement(op, inset);
    opG.position.set(px, op.elev + op.h / 2, pz);
    opG.rotation.y = ry;
    group.add(opG);
  };

  const placeOverheadOpening = (op: EstimatorOpening, withFraming: boolean) => {
    if (op.kind !== 'overhead_door' || !op.overheadStyle) return;
    const st = op.overheadStyle;
    const rows = st.panelRows;
    const cols = st.panelCols;
    const winSet = new Set(st.windowPanelIndices);
    const faceColor = parseHexColor(st.colorHex);
    const doorMat = new THREE.MeshStandardMaterial({
      color: faceColor,
      roughness: 0.45,
      metalness: 0.12,
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55 });

    const opG = new THREE.Group();
    const inset = withFraming ? Tg / 2 : 0.03;
    const { px, pz, ry } = openingWorldPlacement(op, inset);

    const margin = 0.06;
    const cellW = (op.w - margin * 2) / cols;
    const cellH = (op.h - margin * 2) / rows;
    const gap = 0.04;
    const depth = 0.05;
    const backZ = 0.015;

    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(op.w - margin * 0.5, op.h - margin * 0.5, 0.028),
      trimMat
    );
    backing.position.set(0, 0, backZ);
    opG.add(backing);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const cx = -op.w / 2 + margin + (c + 0.5) * cellW;
        const cy = -op.h / 2 + margin + (r + 0.5) * cellH;
        const innerW = Math.max(0.05, cellW - gap);
        const innerH = Math.max(0.05, cellH - gap);
        const mat = winSet.has(idx) ? glassMat : doorMat;
        const panel = new THREE.Mesh(new THREE.BoxGeometry(innerW, innerH, depth), mat);
        panel.position.set(cx, cy, backZ + 0.014 + depth / 2);
        opG.add(panel);
      }
    }

    if (withFraming) {
      const fD = 0.292;
      const header = new THREE.Mesh(new THREE.BoxGeometry(op.w + 2 * Tg, fD, Tg), woodMat);
      header.position.set(0, op.h / 2 + fD / 2, 0);
      opG.add(header);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(op.w + 2 * Tg, fD, Tg), woodMat);
      sill.position.set(0, -op.h / 2 - fD / 2, 0);
      opG.add(sill);
      [-1, 1].forEach((s) => {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(Tg, op.h, fD), woodMat);
        jamb.position.set((op.w / 2 + Tg / 2) * s, 0, 0);
        opG.add(jamb);
      });
    }

    opG.position.set(px, op.elev + op.h / 2, pz);
    opG.rotation.y = ry;
    group.add(opG);
  };

  if (visibility.frame) {
    state.openings.forEach((op) => {
      if (op.kind === 'overhead_door') placeOverheadOpening(op, true);
      else placeOpening(op, true);
    });
  } else if (visibility.shell) {
    state.openings.forEach((op) => {
      if (op.kind === 'overhead_door') placeOverheadOpening(op, false);
      else placeOpening(op, false);
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

  // 10. Sheeting (Shell) — sidewalls + optional gable end caps (no roof planes; those are §11)
  if (visibility.shell) {
    [-1, 1].forEach((sz) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), metalMat);
      wall.position.set(0, h / 2, (l / 2) * sz);
      group.add(wall);
      if (shellGablesOn) {
        const gable = new THREE.Mesh(new THREE.CylinderGeometry(0, w / 2, peakH, 3), metalMat);
        gable.position.set(0, h + peakH / 2, (l / 2) * sz);
        gable.rotation.z = Math.PI;
        group.add(gable);
      }
    });
    [-1, 1].forEach((sx) => {
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

