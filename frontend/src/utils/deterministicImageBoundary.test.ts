import { describe, expect, it } from "vitest";
import { reconstructDeterministicImageBoundary } from "./deterministicImageBoundary";
import type { ExtendedPointTuple } from "../types/domain";

describe('deterministic-image boundary reconstruction', () => {
    const boundary: ExtendedPointTuple[] = [
        [2, 0, 2, 0],
        [0, 2, 0, 2],
        [-2, 0, -2, 0],
        [0, -2, 0, -2]
    ];
    it('subtracts the system noise along the normalized outward normals', () => {
        const reconstructed = reconstructDeterministicImageBoundary(boundary, 0.5);

        expect(reconstructed).toEqual([
            { x: 1.5, y: 0, nx: 1, ny: 0 },
            { x: 0, y: 1.5, nx: 0, ny: 1 },
            { x: -1.5, y: 0, nx: -1, ny: 0 },
            { x: 0, y: -1.5, nx: 0, ny: -1 }
        ])

        reconstructed.forEach((point, index) => {
            const [sourceX, sourceY] = boundary[index];
            expect(
                Math.hypot(sourceX - point.x, sourceY - point.y),
            ).toBeCloseTo(0.5, 12);
        })

        it('returns the same system when the noise is zero', () => {
            const reconstructed = reconstructDeterministicImageBoundary(boundary, 0.0);
            reconstructed.forEach((point, index) => {
                expect(point.x).toBe(boundary[index][0])
                expect(point.y).toBe(boundary[index][1])
            })
        })

        it('removes a duplicated closing sample', () => {
            const reconstructed = reconstructDeterministicImageBoundary(
                [...boundary, boundary[0]], 0.5
            )

            expect(reconstructed).toHaveLength(4);
        })

        it('fail fast for invalid input', () => {
            expect(() => reconstructDeterministicImageBoundary(
                boundary,
                -0.1
            )).toThrow(/nonnegative/)

            expect(() => reconstructDeterministicImageBoundary(
                [[0, 0, 1, 0], [1, 0, 1, 0]],
                0.1,
            )).toThrow(/three ordered/);

            expect(() => reconstructDeterministicImageBoundary(
                [
                    [0, 0, 1, 0],
                    [1, 0, 0, 0],
                    [0, 1, 0, 1],
                ],
                0.1,
            )).toThrow(/degenerate normal/);
        })

    })
})