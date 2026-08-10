use bist::{
    BoundaryHenonSystemAnalysis, HenonParams, ManifoldConfig, SaddlePoint, SaddleType,
    UlamComputer, UnstableManifoldComputer,
};
use nalgebra::Vector2;
use std::time::Instant;

// Local henon_map for trajectory benchmarking (standard 2D Hénon map)
fn henon_map(x: f64, y: f64, a: f64, b: f64) -> (f64, f64) {
    (1.0 - a * x * x + y, b * x)
}

fn main() {
    println!("# Performance Benchmark Results\n");

    benchmark_periodic_orbits();
    benchmark_trajectory();
    benchmark_manifold();
    benchmark_ulam();

    println!("\nBenchmark complete.");
}

fn benchmark_periodic_orbits() {
    println!("### Periodic Orbit Detection Scalability\n");
    println!("| Max Period | Orbits Found | Time (ms) |");
    println!("|------------|--------------|-----------|");

    let a = 1.4;
    let b = 0.3;

    for max_period in 1..=8 {
        let start = Instant::now();
        let system = BoundaryHenonSystemAnalysis::new(a, b, 0.0625, max_period);
        let duration = start.elapsed();
        let orbits_count = system.orbit_database.total_count();

        println!(
            "| {} | {} | {:.2} |",
            max_period,
            orbits_count,
            duration.as_secs_f64() * 1000.0
        );
    }
    println!();
}

fn benchmark_trajectory() {
    println!("### Trajectory Integration Performance\n");

    let iterations_list = [1_000, 10_000, 100_000];
    let a = 1.4;
    let b = 0.3;
    let x0 = 0.1;
    let y0 = 0.1;

    for &n in &iterations_list {
        let start = Instant::now();

        let mut x = x0;
        let mut y = y0;

        for _ in 0..n {
            let (nx, ny) = henon_map(x, y, a, b);
            x = nx;
            y = ny;
        }

        let duration = start.elapsed();
        println!(
            "- {} iterations: {:.2} ms (final: {:.4}, {:.4})",
            n,
            duration.as_secs_f64() * 1000.0,
            x,
            y
        );
    }
    println!();
}

fn benchmark_manifold() {
    println!("### Unstable Manifold Computation\n");

    let a = 1.4;
    let b = 0.3;
    let epsilon = 0.0625;

    let params = HenonParams::new(a, b, epsilon).unwrap();
    let config = ManifoldConfig::default();

    // We need a saddle point to compute manifold from.
    // Let's use the fixed point for the map (simple case) or find one.
    // For a=1.4, b=0.3, there is a fixed point around (0.63135448, 0.18940634) which is a saddle.

    // Fixed point calculation: x = 1 - ax^2 + y, y = bx => x = 1 - ax^2 + bx => ax^2 + (1-b)x - 1 = 0
    // x = (-(1-b) + sqrt((1-b)^2 + 4a)) / 2a
    let term = (1.0 - b as f64).powi(2) + 4.0 * a;
    let x_fixed = (-(1.0 - b) + term.sqrt()) / (2.0 * a);
    let y_fixed = b * x_fixed;

    let pos = Vector2::new(x_fixed, y_fixed);
    let jac = params.jacobian(pos);

    // Calculate eigenvectors
    let trace = jac[(0, 0)] + jac[(1, 1)];
    let det = jac[(0, 0)] * jac[(1, 1)] - jac[(0, 1)] * jac[(1, 0)];
    let disc = trace * trace - 4.0 * det;
    let lambda1 = (trace + disc.sqrt()) / 2.0;

    // Eigenvector for lambda1: (A - lambda1 I) v = 0 => (J11 - lambda1) x + J12 y = 0 => y = -(J11 - lambda1)/J12 * x
    // J12 is 1.0, so y = (lambda1 - J11) * x
    let eig_x = 1.0;
    let eig_y = lambda1 - jac[(0, 0)];
    let eigenvec = Vector2::new(eig_x, eig_y).normalize();

    let saddle = SaddlePoint {
        position: pos,
        period: 1,
        eigenvector: eigenvec,
        eigenvalue: lambda1,
        saddle_type: SaddleType::Regular,
    };

    let computer = UnstableManifoldComputer::new(params, config);

    let start = Instant::now();
    let result = computer.compute_manifold(&saddle, &[]);
    let duration = start.elapsed();

    match result {
        Ok((traj_plus, traj_minus)) => {
            let total_points = traj_plus.points.len() + traj_minus.points.len();
            println!(
                "Rust/WASM implementation: {} points in {:.4} seconds",
                total_points,
                duration.as_secs_f64()
            );
        }
        Err(e) => println!("Error computing manifold: {}", e),
    }
    println!();
}

fn benchmark_ulam() {
    println!("### Ulam Method Grid Resolution Scaling\n");
    println!("| Grid | Boxes | Samples | Time (s) |");
    println!("|------|-------|---------|----------|");

    let grids = [10, 20, 40, 60, 80];
    let a = 1.4;
    let b = 0.3;
    let points_per_box = 64;
    let epsilon = 0.001; // Small epsilon for benchmark

    for &dim in &grids {
        let start = Instant::now();
        let _computer = UlamComputer::new(a, b, dim, points_per_box, epsilon).unwrap();
        let duration = start.elapsed();

        let boxes = dim * dim;
        let samples = boxes * points_per_box;

        println!(
            "| {} x {} | {} | {} | {:.4} |",
            dim,
            dim,
            boxes,
            samples,
            duration.as_secs_f64()
        );
    }
    println!();
}
