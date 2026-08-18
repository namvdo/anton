import type { ExtendedPointTuple, ExtendedState } from "../types/domain";

const NORMAL_TOLERANCE = 1e-14;

const positionDistance = (
    left: ExtendedState,
    right: ExtendedState
): number => Math.hypot(left.x - right.x, left.y - right.y);

/**
 * Reconstructs the deterministic boundary from the unstable manifold normal bundle.
 * 
 * c_i = p_i - epsilon * n_i
 * 
 * The input must be an ordered, closed boundary represented without requiring 
 * a duplicated final point.
 * 
 */

export const reconstructDeterministicImageBoundary = (
    boundary: ExtendedPointTuple[],
    epsilonValue: number
): ExtendedState[] => {
    const epsilon = Number(epsilonValue);

    if (!Number.isFinite(epsilon) || epsilon < 0) {
        throw new Error('System noise must be finite and non-negative for deterministic image reconstruction')
    }

    if (!Array.isArray(boundary) || boundary.length < 3) {
        throw new Error("At least three ordered extended boundary samples are required")
    }

    const cleaned: ExtendedState[] = [];
    boundary.forEach((sample, index) => {
        if (!Array.isArray(sample) || sample.length < 4) {
            throw new Error(`Boundary sample ${index} is not an extended state.`);
        }

        const [xValue, yValue, nxValue, nyValue] = sample;

        const x = Number(xValue);
        const y = Number(yValue);
        const nx = Number(nxValue);
        const ny = Number(nyValue);

        if (![x, y, nx, ny].every(Number.isFinite)) {
            throw new Error(
                `Boundary sample ${index} contains a non-finite position or normal.`,
            )
        }

        const normalLength = Math.hypot(nx, ny);

        if (normalLength < NORMAL_TOLERANCE) {
            throw new Error(
                `Boundary sample ${index} contains a degenerate normal`
            )
        }

        const normalized: ExtendedState = {
            x,
            y,
            nx: nx / normalLength,
            ny: ny / normalLength
        }


        const previous = cleaned.at(-1);
        if (
            !previous
            || positionDistance(previous, normalized) > NORMAL_TOLERANCE
        ) {
            cleaned.push(normalized);
        }

        const first = cleaned[0];
        const last = cleaned.at(-1);

        if (
            first 
            && last 
            && cleaned.length > 1
            && positionDistance(first, last) <= NORMAL_TOLERANCE
        ) {
            cleaned.pop();
        }


        if (cleaned.length < 3) {
            throw new Error(
                'The boundary must contain at least three distinct positions.',
            );
        }

        return cleaned.map(({x, y, nx, ny}, index) => {
            const reconstructed = {
                x: x - epsilon * nx,
                y: y - epsilon * ny,
                nx,
                ny
            }

            if (!Number.isFinite(reconstructed.x) || !Number.isFinite(reconstructed.y)) {
                throw new Error(
                 'Deterministic-image reconstruction produced a non-finite position.',
                );
            }

            return reconstructed;
        })

    })

} 