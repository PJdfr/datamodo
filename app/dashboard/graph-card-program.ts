// The Graph tab's CARD node program — sigma draws nodes as WebGL discs by
// default; this subclass swaps the circle SDF for a ROUNDED RECTANGLE so every
// node reads as a tiny card (the walk's visual grammar): paper fill, the kind
// color as the frame. Plus matching canvas-2D label/hover drawers (the default
// ones assume a disc and leave a gap / draw a white pill with a black shadow).
//
// CLIENT-ONLY: sigma touches WebGL globals at import time — graph-view loads
// this module dynamically, never from server code.

import { NodeCircleProgram, type NodeHoverDrawingFunction, type NodeLabelDrawingFunction } from "sigma/rendering";

/** Card proportions as fractions of the node radius. The circle program draws
 *  one triangle circumscribing radius `v_radius` — anything inside that radius
 *  survives, so the card's half-diagonal must stay ≤ 1 (0.84² + 0.56² ≈ 0.97). */
export const CARD = { halfW: 0.84, halfH: 0.56, corner: 0.24 } as const;

const FRAGMENT_SHADER_SOURCE = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

uniform float u_correctionRatio;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);
// datamodo paper (#FFFDF8): the card fill; the node color draws the frame —
// the walk's card tone idiom (10% wash + colored border), in one attribute.
const vec3 paper = vec3(1.0, 0.9922, 0.9725);

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main(void) {
  float aa = u_correctionRatio * 2.0;
  vec2 halfSize = vec2(${CARD.halfW}, ${CARD.halfH}) * v_radius;
  float corner = ${CARD.corner} * v_radius;
  float dist = sdRoundBox(v_diffVector, halfSize, corner);

  #ifdef PICKING_MODE
  // Picking needs ONE flat color (the node id) across the whole hit shape.
  if (dist < 0.0) gl_FragColor = v_color;
  else gl_FragColor = transparent;
  #else
  float border = max(aa * 1.25, 0.14 * v_radius);
  vec4 frame = v_color;
  vec4 fill = vec4(mix(paper, v_color.rgb, 0.16), v_color.a);
  vec4 card = mix(fill, frame, smoothstep(-border - aa, -border, dist));
  gl_FragColor = mix(card, transparent, smoothstep(-aa, 0.0, dist));
  #endif
}
`;

export default class NodeCardProgram extends NodeCircleProgram {
  getDefinition() {
    return { ...super.getDefinition(), FRAGMENT_SHADER_SOURCE };
  }
}

const roundRectPath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.closePath();
};

/** Same as sigma's disc label, but seated against the card's actual right
 *  edge (halfW·size) instead of a disc's radius. */
export const drawCardNodeLabel: NodeLabelDrawingFunction = (context, data, settings) => {
  if (!data.label) return;
  const { labelSize, labelFont, labelWeight } = settings;
  context.font = `${labelWeight} ${labelSize}px ${labelFont}`;
  context.fillStyle = settings.labelColor.attribute
    ? ((data as Record<string, unknown>)[settings.labelColor.attribute] as string) ?? settings.labelColor.color ?? "#000"
    : settings.labelColor.color ?? "#000";
  context.fillText(data.label, data.x + data.size * CARD.halfW + 5, data.y + labelSize / 3);
};

/** Hover halo: one paper rounded-rect hugging the card and stretching right
 *  to house the label — warm ink shadow, never black (brand). */
export const drawCardNodeHover: NodeHoverDrawingFunction = (context, data, settings) => {
  const { labelSize, labelFont, labelWeight } = settings;
  context.font = `${labelWeight} ${labelSize}px ${labelFont}`;

  const halfW = data.size * CARD.halfW;
  const halfH = data.size * CARD.halfH;
  const PAD = 3;
  const label = typeof data.label === "string" ? data.label : null;
  const textWidth = label ? context.measureText(label).width : 0;

  const boxH = Math.max(2 * (halfH + PAD), labelSize + 2 * PAD + 2);
  const boxW = 2 * (halfW + PAD) + (label ? textWidth + 10 : 0);

  context.fillStyle = "#FFFDF8";
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 2;
  context.shadowBlur = 9;
  context.shadowColor = "rgba(33,30,24,0.30)";
  roundRectPath(context, data.x - halfW - PAD, data.y - boxH / 2, boxW, boxH, Math.min(8, boxH / 2));
  context.fill();
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.shadowBlur = 0;

  if (label) {
    context.fillStyle = "#211E18";
    context.fillText(label, data.x + halfW + 6, data.y + labelSize / 3);
  }
};
