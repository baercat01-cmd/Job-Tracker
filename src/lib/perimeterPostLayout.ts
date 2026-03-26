/**
 * Perimeter post layout logic for building plans
 * Computes post positions on building perimeter (8' OC standard + overhead door jamb posts)
 */

import type { BuildingPlanModel, PlanPoint } from './buildingPlanModel';

/** Post thickness/width in feet (T-post standard dimension) */
export const POST_Tp = 0.3333; // ~4"

export type PerimeterEdge = 'front' | 'back' | 'left' | 'right';

export interface PerimeterPostSlot {
  /** Which edge of the building perimeter */
  edge: PerimeterEdge;
  /** Distance along that edge from the edge's start corner (ft) */
  along: number;
  /** Reason for this post (e.g., '8ft_oc', 'overhead_jamb', 'corner') */
  reason: string;
}

/**
 * Compute all perimeter post positions for a given plan.
 * Places posts at:
 * - Building corners
 * - 8' OC along each wall
 * - Overhead door jamb positions (where overhead doors require structural posts)
 */
export function computePerimeterPostSlotsFromPlan(plan: BuildingPlanModel): PerimeterPostSlot[] {
  const posts: PerimeterPostSlot[] = [];
  const width = plan.dims.width;
  const length = plan.dims.length;

  // Helper: add posts at regular intervals along an edge
  function addOCPostsAlongEdge(edge: PerimeterEdge, edgeLength: number) {
    const postSpacing = 8; // 8' OC standard
    
    // Corner post at start
    posts.push({ edge, along: 0, reason: 'corner' });
    
    // Intermediate posts at 8' OC
    let pos = postSpacing;
    while (pos < edgeLength - 0.001) {
      posts.push({ edge, along: pos, reason: '8ft_oc' });
      pos += postSpacing;
    }
    
    // Corner post at end (will overlap with next edge's start corner, that's ok)
    if (edgeLength > 0.001) {
      posts.push({ edge, along: edgeLength, reason: 'corner' });
    }
  }

  // Add standard 8' OC posts for each edge
  addOCPostsAlongEdge('front', width);
  addOCPostsAlongEdge('right', length);
  addOCPostsAlongEdge('back', width);
  addOCPostsAlongEdge('left', length);

  // Add overhead door jamb posts
  for (const opening of plan.openings) {
    if (opening.type !== 'overhead_door') continue;
    
    const wall = plan.walls.find(w => w.id === opening.wallId);
    if (!wall) continue;
    
    // Determine which edge this wall is on (simplified for rectangular buildings)
    const edge = determineEdgeFromWall(wall, width, length);
    if (!edge) continue;
    
    // Jamb posts at opening edges
    const leftJamb = opening.offset;
    const rightJamb = opening.offset + opening.width;
    
    posts.push({ edge, along: leftJamb, reason: 'overhead_jamb' });
    posts.push({ edge, along: rightJamb, reason: 'overhead_jamb' });
  }

  // Remove duplicates (keep posts within ~0.1ft of each other as one post)
  return deduplicatePosts(posts);
}

/**
 * Convert a perimeter slot to actual plan coordinates
 */
export function perimeterSlotToPlanPoint(
  slot: PerimeterPostSlot,
  buildingWidth: number,
  buildingLength: number
): PlanPoint {
  const { edge, along } = slot;
  
  switch (edge) {
    case 'front':
      // Front edge: y=0, x runs from 0 to width
      return { x: along, y: 0 };
    
    case 'right':
      // Right edge: x=width, y runs from 0 to length
      return { x: buildingWidth, y: along };
    
    case 'back':
      // Back edge: y=length, x runs from width down to 0
      return { x: buildingWidth - along, y: buildingLength };
    
    case 'left':
      // Left edge: x=0, y runs from length down to 0
      return { x: 0, y: buildingLength - along };
    
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * Determine which perimeter edge a wall belongs to (for rectangular buildings)
 */
function determineEdgeFromWall(
  wall: { start: PlanPoint; end: PlanPoint },
  buildingWidth: number,
  buildingLength: number
): PerimeterEdge | null {
  const { start, end } = wall;
  const tolerance = 0.1;
  
  // Front edge (y ≈ 0)
  if (Math.abs(start.y) < tolerance && Math.abs(end.y) < tolerance) {
    return 'front';
  }
  
  // Back edge (y ≈ length)
  if (Math.abs(start.y - buildingLength) < tolerance && Math.abs(end.y - buildingLength) < tolerance) {
    return 'back';
  }
  
  // Left edge (x ≈ 0)
  if (Math.abs(start.x) < tolerance && Math.abs(end.x) < tolerance) {
    return 'left';
  }
  
  // Right edge (x ≈ width)
  if (Math.abs(start.x - buildingWidth) < tolerance && Math.abs(end.x - buildingWidth) < tolerance) {
    return 'right';
  }
  
  return null;
}

/**
 * Remove duplicate posts (posts within 0.1ft are considered the same position)
 */
function deduplicatePosts(posts: PerimeterPostSlot[]): PerimeterPostSlot[] {
  const result: PerimeterPostSlot[] = [];
  const tolerance = 0.1;
  
  for (const post of posts) {
    // Check if we already have a post at this position
    const duplicate = result.find(
      p => p.edge === post.edge && Math.abs(p.along - post.along) < tolerance
    );
    
    if (!duplicate) {
      result.push(post);
    } else {
      // If duplicate, prefer structural posts (overhead_jamb) over standard OC posts
      if (post.reason === 'overhead_jamb' && duplicate.reason === '8ft_oc') {
        // Replace the OC post with the jamb post
        const index = result.indexOf(duplicate);
        result[index] = post;
      }
    }
  }
  
  return result;
}
