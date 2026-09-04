import { z } from 'zod';
import { MAX_TYPED_SIGNATURE_LENGTH } from '../signature/signature';

/**
 * A signature arriving from somewhere that is not this process: a restored draft, a form
 * post, a server action's argument.
 *
 * All of those are untrusted in the same way and for the same reason, so they parse through
 * one schema rather than through a copy each. `clampSignature` still runs afterwards — this
 * decides whether the shape is a signature at all, and that trims it to what the product
 * will draw.
 *
 * The bounds here are larger than `clampSignature`'s on purpose. They are the parser's
 * ceiling, not the product's rule: their job is to stop a megabyte of numbers being walked
 * over before anything looks at it, and being generous means a slightly enthusiastic scrawl
 * gets trimmed rather than rejected.
 */

/** Parser ceilings, not product limits — see `MAX_SIGNATURE_STROKES` / `MAX_SIGNATURE_POINTS`. */
export const MAX_PARSED_STROKES = 200;
export const MAX_PARSED_STROKE_NUMBERS = 2_000;

/**
 * Every coordinate must be a real number. NaN and Infinity survive `typeof x === 'number'`,
 * travel through JSON as `null` or blow up an SVG path, and would change the canonical string
 * the commitment hash is taken over.
 */
const coordinate = z.number().refine(Number.isFinite, 'expected a finite number');

export const signatureSchema = z.union([
  z.object({
    kind: z.literal('typed'),
    name: z.string().max(MAX_TYPED_SIGNATURE_LENGTH * 4),
  }),
  z.object({
    kind: z.literal('drawn'),
    strokes: z.array(z.array(coordinate).max(MAX_PARSED_STROKE_NUMBERS)).max(MAX_PARSED_STROKES),
    height: coordinate.pipe(z.number().positive()),
  }),
]);

export type SignatureInput = z.input<typeof signatureSchema>;
