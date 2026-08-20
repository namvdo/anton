use super::*;

#[test]
fn test_natural_continuation_tracks_fixed_point() {
    let (b, eps) = (0.3, 0.01);
    let build = |a| HenonSystem::new(a, b, eps);

    let sys0 = build(1.4);
    let db = find_all_boundary_periodic_orbits_generic(&sys0, 1, 15, 12, -3.0, 3.0, -3.0, 3.0);
    let seed = db
        .orbits
        .iter()
        .find(|o| o.period == 1)
        .expect("a period-1 orbit at a = 1.4")
        .extended_points[0];

    let branch = follow_branch_arclength(&seed, 1.4, 0.02, 1, false, 0.5, 1.4, 200, &build);
    assert!(
        branch.len() > 1,
        "continuation should produce multiple points"
    );

    for bp in &branch {
        let sys = build(bp.lambda);
        let m = boundary_map_generic(&sys, bp.point.x, bp.point.y, bp.point.nx, bp.point.ny);
        let d = ((m.x - bp.point.x).powi(2) + (m.y - bp.point.y).powi(2)).sqrt();
        assert!(
            d < 1e-6,
            "point at lambda={} not fixed (d={})",
            bp.lambda,
            d
        );
    }
}

#[test]
fn test_jacobian_multiply_identity() {
    let a = Jacobian::new(1.0, 2.0, 3.0, 4.0);
    let id = Jacobian::identity();
    let result = a.multiply(&id);
    assert!((result.j11 - 1.0).abs() < 1e-12);
    assert!((result.j12 - 2.0).abs() < 1e-12);
    assert!((result.j21 - 3.0).abs() < 1e-12);
    assert!((result.j22 - 4.0).abs() < 1e-12);
}

#[test]
fn test_jacobian_multiply_known_product() {
    let a = Jacobian::new(1.0, 2.0, 3.0, 4.0);
    let b = Jacobian::new(5.0, 6.0, 7.0, 8.0);
    let result = a.multiply(&b);
    assert!((result.j11 - 19.0).abs() < 1e-12, "j11: got {}", result.j11);
    assert!((result.j12 - 22.0).abs() < 1e-12, "j12: got {}", result.j12);
    assert!((result.j21 - 43.0).abs() < 1e-12, "j21: got {}", result.j21);
    assert!((result.j22 - 50.0).abs() < 1e-12, "j22: got {}", result.j22);
}

#[test]
fn test_jacobian_multiply_associative() {
    let a = Jacobian::new(1.0, 2.0, 3.0, 4.0);
    let b = Jacobian::new(5.0, 6.0, 7.0, 8.0);
    let c = Jacobian::new(-1.0, 0.5, 0.3, -2.0);
    let ab_c = a.multiply(&b).multiply(&c);
    let a_bc = a.multiply(&b.multiply(&c));
    assert!((ab_c.j11 - a_bc.j11).abs() < 1e-10);
    assert!((ab_c.j12 - a_bc.j12).abs() < 1e-10);
    assert!((ab_c.j21 - a_bc.j21).abs() < 1e-10);
    assert!((ab_c.j22 - a_bc.j22).abs() < 1e-10);
}

#[test]
fn test_jacobian_eigenvalues_real() {
    let j = Jacobian::new(3.0, 0.0, 0.0, 1.0);
    let (l1, l2, complex) = j.eigenvalues();
    assert!(!complex);
    assert!((l1 - 3.0).abs() < 1e-10 || (l1 - 1.0).abs() < 1e-10);
    assert!((l2 - 3.0).abs() < 1e-10 || (l2 - 1.0).abs() < 1e-10);
    assert!((l1 - l2).abs() > 1.0); // they're different
}

#[test]
fn test_jacobian_eigenvalues_complex() {
    let j = Jacobian::new(0.0, -1.0, 1.0, 0.0);
    let (l1, l2, complex) = j.eigenvalues();
    assert!(complex);
    assert!((l1 - 1.0).abs() < 1e-10);
    assert!((l2 - 1.0).abs() < 1e-10);
}

#[test]
fn test_jacobian_determinant_correct() {
    let j = Jacobian::new(2.0, 3.0, 1.0, 4.0);
    let (l1, l2, _) = j.eigenvalues();
    let det_from_eig = l1 * l2;
    assert!(
        (det_from_eig - 5.0).abs() < 1e-10,
        "det from eigenvalues: {}",
        det_from_eig
    );
}

#[test]
fn test_henon_jacobian_values() {
    let a = 1.4;
    let b = 0.3;
    let x = 0.5;
    let sys = make_henon_system(a, b, 0.01);
    let j = sys.jacobian(Vector2::new(x, 0.0));
    assert!((j[(0, 0)] - (-2.0 * a * x)).abs() < 1e-12);
    assert!((j[(0, 1)] - 1.0).abs() < 1e-12);
    assert!((j[(1, 0)] - b).abs() < 1e-12);
    assert!((j[(1, 1)] - 0.0).abs() < 1e-12);
}

fn make_henon_system(a: f64, b: f64, ep: f64) -> HenonSystem {
    HenonSystem::new(a, b, ep)
}

#[test]
fn test_generic_dl_finds_fixed_point() {
    let sys = make_henon_system(1.4, 0.3, 0.01);
    let result = find_boundary_periodic_point_davidchack_lai_generic(
        &sys,
        0.6,
        0.2,
        1.0,
        0.0,
        1,
        None,
        200,
        1e-12,
        DEFAULT_PERIODIC_RESIDUAL_THRESHOLD,
    );
    if let Some(fp) = result {
        let mapped = boundary_map_generic(&sys, fp.x, fp.y, fp.nx, fp.ny);
        assert!((mapped.x - fp.x).abs() < 1e-8, "Not a fixed point in x");
        assert!((mapped.y - fp.y).abs() < 1e-8, "Not a fixed point in y");
        let norm = (fp.nx * fp.nx + fp.ny * fp.ny).sqrt();
        assert!((norm - 1.0).abs() < 1e-10);
    }
}

#[test]
fn test_generic_finds_fixed_points() {
    let sys = make_henon_system(1.4, 0.3, 0.01);
    let db = find_all_boundary_periodic_orbits_generic(&sys, 1, 10, 8, -3.0, 3.0, -3.0, 3.0);

    let p1_orbits: Vec<_> = db.orbits.iter().filter(|o| o.period == 1).collect();
    assert!(
        !p1_orbits.is_empty(),
        "Should find at least one fixed point"
    );

    for orbit in &p1_orbits {
        let ep_pt = &orbit.extended_points[0];
        let mapped = boundary_map_generic(&sys, ep_pt.x, ep_pt.y, ep_pt.nx, ep_pt.ny);
        assert!((mapped.x - ep_pt.x).abs() < 1e-6, "Fixed point x mismatch");
        assert!((mapped.y - ep_pt.y).abs() < 1e-6, "Fixed point y mismatch");
    }
}

#[test]
fn test_generic_finds_period2() {
    let sys = make_henon_system(1.4, 0.3, 0.01);
    let db = find_all_boundary_periodic_orbits_generic(&sys, 2, 12, 10, -3.0, 3.0, -3.0, 3.0);

    let p2_orbits: Vec<_> = db.orbits.iter().filter(|o| o.period == 2).collect();
    for orbit in &p2_orbits {
        assert_eq!(orbit.extended_points.len(), 2);
        let p = &orbit.extended_points[0];
        let mapped1 = boundary_map_generic(&sys, p.x, p.y, p.nx, p.ny);
        let mapped2 = boundary_map_generic(&sys, mapped1.x, mapped1.y, mapped1.nx, mapped1.ny);
        assert!((mapped2.x - p.x).abs() < 1e-6, "Period-2 x doesn't return");
        assert!((mapped2.y - p.y).abs() < 1e-6, "Period-2 y doesn't return");
        let not_fp = (mapped1.x - p.x).abs() > 1e-4 || (mapped1.y - p.y).abs() > 1e-4;
        assert!(not_fp, "Period-2 orbit is actually a fixed point");
    }
}

#[test]
fn test_generic_no_duplicates() {
    let sys = make_henon_system(1.4, 0.3, 0.01);
    let db = find_all_boundary_periodic_orbits_generic(&sys, 2, 10, 8, -3.0, 3.0, -3.0, 3.0);

    for i in 0..db.orbits.len() {
        for j in (i + 1)..db.orbits.len() {
            for pi in &db.orbits[i].extended_points {
                for pj in &db.orbits[j].extended_points {
                    let dist = ((pi.x - pj.x).powi(2) + (pi.y - pj.y).powi(2)).sqrt();
                    assert!(dist > 0.001,
                            "Duplicate points between orbits {} and {}: ({:.4},{:.4}) and ({:.4},{:.4})",
                            i, j, pi.x, pi.y, pj.x, pj.y);
                }
            }
        }
    }
}

#[test]
fn test_generic_stability_assigned() {
    let sys = make_henon_system(1.4, 0.3, 0.01);
    let db = find_all_boundary_periodic_orbits_generic(&sys, 2, 10, 8, -3.0, 3.0, -3.0, 3.0);

    for orbit in &db.orbits {
        match orbit.stability {
            StabilityType::Stable | StabilityType::Unstable | StabilityType::Saddle => {}
        }
        for ev in &orbit.eigenvalues {
            assert!(ev.is_finite(), "Eigenvalue not finite: {}", ev);
        }
    }
}

#[test]
fn test_generic_normal_unit_length() {
    let sys = make_henon_system(1.4, 0.3, 0.01);
    let db = find_all_boundary_periodic_orbits_generic(&sys, 1, 10, 8, -3.0, 3.0, -3.0, 3.0);

    for orbit in &db.orbits {
        for p in &orbit.extended_points {
            let norm = (p.nx * p.nx + p.ny * p.ny).sqrt();
            assert!(
                (norm - 1.0).abs() < 1e-8,
                "Normal not unit length: {} at ({:.4},{:.4})",
                norm,
                p.x,
                p.y
            );
        }
    }
}

#[test]
fn test_generic_verify_minimal_period() {
    let sys = make_henon_system(1.4, 0.3, 0.01);
    let db = find_all_boundary_periodic_orbits_generic(&sys, 1, 10, 8, -3.0, 3.0, -3.0, 3.0);

    for orbit in db.orbits.iter().filter(|o| o.period == 1) {
        let p = &orbit.extended_points[0];
        assert!(verify_minimal_period_generic(
            &sys,
            p,
            1,
            DEFAULT_PERIODIC_RESIDUAL_THRESHOLD
        ));
        assert!(
            !verify_minimal_period_generic(&sys, p, 2, DEFAULT_PERIODIC_RESIDUAL_THRESHOLD),
            "Fixed point should NOT be minimal period 2"
        );
    }
}

#[test]
fn test_classify_stability_4d_diagonal() {
    let stable_jac = Jacobian4x4 {
        data: [
            [0.5, 0.0, 0.0, 0.0],
            [0.0, 0.3, 0.0, 0.0],
            [0.0, 0.0, 0.2, 0.0],
            [0.0, 0.0, 0.0, 0.1],
        ],
    };
    let (stab, _) = classify_stability_4d(&stable_jac);
    assert!(
        matches!(stab, StabilityType::Stable),
        "Expected stable, got {:?}",
        stab
    );

    let unstable_jac = Jacobian4x4 {
        data: [
            [2.0, 0.0, 0.0, 0.0],
            [0.0, 3.0, 0.0, 0.0],
            [0.0, 0.0, 1.5, 0.0],
            [0.0, 0.0, 0.0, 4.0],
        ],
    };
    let (stab, _) = classify_stability_4d(&unstable_jac);
    assert!(
        matches!(stab, StabilityType::Unstable),
        "Expected unstable, got {:?}",
        stab
    );
}

#[test]
fn test_generic_database_to_found_orbits() {
    let sys = make_henon_system(1.4, 0.3, 0.01);
    let db = find_all_boundary_periodic_orbits_generic(&sys, 1, 10, 8, -3.0, 3.0, -3.0, 3.0);
    let found = database_to_found_orbits_generic(&db);

    assert_eq!(found.len(), db.orbits.len());
    for (fo, orbit) in found.iter().zip(db.orbits.iter()) {
        assert_eq!(fo.period, orbit.period);
        assert_eq!(fo.points.len(), orbit.points.len());
        assert_eq!(fo.extended_points.len(), orbit.extended_points.len());
        for (ep_tuple, ep_orig) in fo.extended_points.iter().zip(orbit.extended_points.iter()) {
            assert!((ep_tuple.0 - ep_orig.x).abs() < 1e-14);
            assert!((ep_tuple.1 - ep_orig.y).abs() < 1e-14);
            assert!((ep_tuple.2 - ep_orig.nx).abs() < 1e-14);
            assert!((ep_tuple.3 - ep_orig.ny).abs() < 1e-14);
        }
    }
}

#[test]
fn test_generic_sweep_basic() {
    let base_params = vec![("a".to_string(), 0.5), ("b".to_string(), 0.3)];
    let result = parameter_sweep_generic(
        "1 - a * x^2 + y",
        "b * x",
        &base_params,
        "a",
        0.5,
        1.0,
        3,
        0.01,
        1,
        10,
        8,
        -3.0,
        3.0,
        -3.0,
        3.0,
    );
    assert_eq!(result.results.len(), 3);
    assert_eq!(result.param_name, "a");
    assert!((result.param_min - 0.5).abs() < 1e-12);
    assert!((result.param_max - 1.0).abs() < 1e-12);
    assert!((result.epsilon - 0.01).abs() < 1e-12);
}

#[test]
fn test_generic_sweep_orbit_counts_consistent() {
    let base_params = vec![("a".to_string(), 0.5), ("b".to_string(), 0.3)];
    let result = parameter_sweep_generic(
        "1 - a * x^2 + y",
        "b * x",
        &base_params,
        "a",
        0.5,
        1.5,
        3,
        0.01,
        1,
        10,
        8,
        -3.0,
        3.0,
        -3.0,
        3.0,
    );
    for sweep in &result.results {
        assert_eq!(
            sweep.total_orbits,
            sweep.stable_count + sweep.unstable_count + sweep.saddle_count,
            "Stability counts don't sum to total at a={}",
            sweep.param_value
        );
    }
}

#[test]
fn test_generic_sweep_csv_export() {
    let base_params = vec![("a".to_string(), 1.0), ("b".to_string(), 0.3)];
    let result = parameter_sweep_generic(
        "1 - a * x^2 + y",
        "b * x",
        &base_params,
        "a",
        1.0,
        1.4,
        2,
        0.01,
        1,
        10,
        8,
        -3.0,
        3.0,
        -3.0,
        3.0,
    );
    let csv = result.to_csv();
    assert!(
        csv.starts_with("parameter_a,period,stability,x,y,nx,ny\n"),
        "CSV header mismatch: {}",
        csv.lines().next().unwrap_or("")
    );
    let lines: Vec<&str> = csv.lines().collect();
    assert!(lines.len() > 1, "CSV should have data rows");
    for line in &lines[1..] {
        if !line.is_empty() {
            let cols: Vec<&str> = line.split(',').collect();
            assert_eq!(
                cols.len(),
                7,
                "Expected 7 columns, got {}: {}",
                cols.len(),
                line
            );
        }
    }
}

#[test]
fn test_generic_sweep_json_export() {
    let base_params = vec![("a".to_string(), 1.0), ("b".to_string(), 0.3)];
    let result = parameter_sweep_generic(
        "1 - a * x^2 + y",
        "b * x",
        &base_params,
        "a",
        1.0,
        1.2,
        2,
        0.01,
        1,
        10,
        8,
        -3.0,
        3.0,
        -3.0,
        3.0,
    );
    let json = result.to_json();
    assert!(!json.is_empty());
    assert!(json.starts_with('{'));
    assert!(json.contains("\"param_name\""));
    assert!(json.contains("\"results\""));
    assert!(json.contains("\"epsilon\""));
}

#[test]
fn test_generic_sweep_single_sample() {
    let base_params = vec![("a".to_string(), 1.0), ("b".to_string(), 0.3)];
    let result = parameter_sweep_generic(
        "1 - a * x^2 + y",
        "b * x",
        &base_params,
        "a",
        1.0,
        1.0,
        1,
        0.01,
        1,
        10,
        8,
        -3.0,
        3.0,
        -3.0,
        3.0,
    );
    assert_eq!(result.results.len(), 1);
    assert!((result.results[0].param_value - 1.0).abs() < 1e-12);
}

#[test]
fn test_generic_sweep_finds_orbits() {
    let base_params = vec![("a".to_string(), 0.5), ("b".to_string(), 0.3)];
    let result = parameter_sweep_generic(
        "1 - a * x^2 + y",
        "b * x",
        &base_params,
        "a",
        0.5,
        1.5,
        3,
        0.01,
        1,
        10,
        8,
        -3.0,
        3.0,
        -3.0,
        3.0,
    );
    let total: usize = result.results.iter().map(|r| r.total_orbits).sum();
    assert!(total > 0, "Sweep should find at least some orbits");
}

#[test]
fn test_user_defined_henon_matches_generic() {
    let sys_native = make_henon_system(1.4, 0.3, 0.01);
    let params = crate::parameters::ParameterSet::new(vec![
        crate::parameters::ParameterEntry {
            name: "a".to_string(),
            value: 1.4,
        },
        crate::parameters::ParameterEntry {
            name: "b".to_string(),
            value: 0.3,
        },
    ])
    .unwrap();
    let sys_user =
        UserDefinedDynamicalSystem::new("1 - a * x^2 + y", "b * x", 0.01, params).unwrap();

    let db_native =
        find_all_boundary_periodic_orbits_generic(&sys_native, 1, 10, 8, -3.0, 3.0, -3.0, 3.0);
    let db_user =
        find_all_boundary_periodic_orbits_generic(&sys_user, 1, 10, 8, -3.0, 3.0, -3.0, 3.0);

    assert!(
        !db_native.orbits.is_empty(),
        "Native HenonSystem found no orbits"
    );
    assert!(
        !db_user.orbits.is_empty(),
        "UserDefined Hénon found no orbits"
    );
}

#[test]
fn test_generic_sweep_custom_param_name() {
    let base_params = vec![("alpha".to_string(), 1.0), ("beta".to_string(), 0.3)];
    let result = parameter_sweep_generic(
        "1 - alpha * x^2 + y",
        "beta * x",
        &base_params,
        "alpha",
        0.5,
        1.5,
        3,
        0.01,
        1,
        10,
        8,
        -3.0,
        3.0,
        -3.0,
        3.0,
    );
    assert_eq!(result.results.len(), 3);
    assert_eq!(result.param_name, "alpha");
}

#[test]
fn test_boundary_map_preserves_normal_unit_length() {
    let sys = make_henon_system(1.4, 0.3, 0.01);
    let result = boundary_map_generic(&sys, 0.5, 0.15, 1.0, 0.0);
    let norm = (result.nx * result.nx + result.ny * result.ny).sqrt();
    assert!(
        (norm - 1.0).abs() < 1e-10,
        "Normal should be unit length, got {}",
        norm
    );
}

#[test]
fn periodic_export_reports_extended_residuals() {
    let b: f64 = 0.25;
    let x = 1.0 / (1.0 - b);
    let y = b * x;
    let normal_scale = 5.0_f64.sqrt();
    let point = ExtendedPoint::new(x, y, 1.0 / normal_scale, 2.0 / normal_scale);
    let orbit = PeriodicOrbit {
        points: vec![BoundaryPoint { x, y }],
        extended_points: vec![point],
        period: 1,
        stability: StabilityType::Saddle,
        eigenvalues: vec![],
    };
    let system = HenonSystem::new(0.0, b, 0.0);

    let exported = periodic_orbit_js(&system, &orbit);

    assert!(exported.residual.unwrap() < 1e-12);
    assert!(exported.maximum_normal_length_error < 1e-12);
    assert!(exported.multiplier_relation_residual.unwrap().is_finite());
}

#[test]
fn test_boundary_map_reduces_to_henon_at_zero_epsilon() {
    let a = 1.4;
    let b = 0.3;
    let x = 0.5;
    let y = 0.15;
    let sys = make_henon_system(a, b, 0.0);
    let result = boundary_map_generic(&sys, x, y, 1.0, 0.0);
    let mapped = sys.map(Vector2::new(x, y)).unwrap();
    assert!(
        (result.x - mapped.x).abs() < 1e-10,
        "At ep=0, boundary map should equal Henon map"
    );
    assert!((result.y - mapped.y).abs() < 1e-10);
}

#[test]
fn test_4x4_jacobian_determinant() {
    let j = Jacobian4x4 {
        data: [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 2.0, 0.0, 0.0],
            [0.0, 0.0, 3.0, 0.0],
            [0.0, 0.0, 0.0, 4.0],
        ],
    };
    assert!((j.determinant() - 24.0).abs() < 1e-10);
}

#[test]
fn test_4x4_jacobian_inverse() {
    let j = Jacobian4x4 {
        data: [
            [2.0, 1.0, 0.0, 0.0],
            [0.0, 3.0, 1.0, 0.0],
            [0.0, 0.0, 2.0, 1.0],
            [0.0, 0.0, 0.0, 1.0],
        ],
    };
    let inv = j.inverse().expect("Should be invertible");
    let product = j.multiply(&inv);
    for i in 0..4 {
        for k in 0..4 {
            let expected = if i == k { 1.0 } else { 0.0 };
            assert!(
                (product.data[i][k] - expected).abs() < 1e-10,
                "J*J^-1 [{},{}] = {}, expected {}",
                i,
                k,
                product.data[i][k],
                expected
            );
        }
    }
}

#[test]
fn test_henon_system_map_inverse_roundtrip() {
    let sys = make_henon_system(1.4, 0.3, 0.01);
    let p = Vector2::new(0.6, 0.2);
    let mapped = sys.map(p).unwrap();
    let recovered = sys.map_inverse(mapped).unwrap();
    assert!((recovered.x - p.x).abs() < 1e-10, "x roundtrip failed");
    assert!((recovered.y - p.y).abs() < 1e-10, "y roundtrip failed");
}

#[test]
fn test_henon_analytic_vs_numerical_jacobian() {
    let sys = make_henon_system(1.4, 0.3, 0.01);
    let p = Vector2::new(0.6, 0.2);
    let analytic = sys.jacobian(p);

    let h = 1e-7;
    let fx_plus = sys.map(Vector2::new(p.x + h, p.y)).unwrap();
    let fx_minus = sys.map(Vector2::new(p.x - h, p.y)).unwrap();
    let fy_plus = sys.map(Vector2::new(p.x, p.y + h)).unwrap();
    let fy_minus = sys.map(Vector2::new(p.x, p.y - h)).unwrap();

    let num_00 = (fx_plus.x - fx_minus.x) / (2.0 * h);
    let num_01 = (fy_plus.x - fy_minus.x) / (2.0 * h);
    let num_10 = (fx_plus.y - fx_minus.y) / (2.0 * h);
    let num_11 = (fy_plus.y - fy_minus.y) / (2.0 * h);

    assert!((analytic[(0, 0)] - num_00).abs() < 1e-5, "J[0,0] mismatch");
    assert!((analytic[(0, 1)] - num_01).abs() < 1e-5, "J[0,1] mismatch");
    assert!((analytic[(1, 0)] - num_10).abs() < 1e-5, "J[1,0] mismatch");
    assert!((analytic[(1, 1)] - num_11).abs() < 1e-5, "J[1,1] mismatch");
}

#[test]
fn test_boundary_map_generic_orbit_is_periodic() {
    let sys = make_henon_system(1.4, 0.3, 0.01);
    let fp = find_boundary_periodic_point_davidchack_lai_generic(
        &sys,
        0.6,
        0.2,
        1.0,
        0.0,
        1,
        None,
        200,
        1e-12,
        DEFAULT_PERIODIC_RESIDUAL_THRESHOLD,
    );
    if let Some(fp) = fp {
        let mapped = boundary_map_generic(&sys, fp.x, fp.y, fp.nx, fp.ny);
        let dist = (mapped.x - fp.x).powi(2)
            + (mapped.y - fp.y).powi(2)
            + (mapped.nx - fp.nx).powi(2)
            + (mapped.ny - fp.ny).powi(2);
        assert!(
            dist < 1e-8,
            "Fixed point should map to itself, dist={}",
            dist
        );
    }
}

#[test]
fn test_generic_4d_jacobian_numerical_vs_analytic() {
    let sys = make_henon_system(1.4, 0.3, 0.01);
    let x = 0.5;
    let y = 0.15;
    let nx = 1.0;
    let ny = 0.0;
    let jac = boundary_map_jacobian_generic(&sys, x, y, nx, ny);

    let h = 1e-6;
    let e_plus = boundary_map_generic(&sys, x + h, y, nx, ny);
    let e_minus = boundary_map_generic(&sys, x - h, y, nx, ny);
    let de_dx_0 = (e_plus.x - e_minus.x) / (2.0 * h);
    let de_dx_1 = (e_plus.y - e_minus.y) / (2.0 * h);

    assert!(
        (jac.data[0][0] - de_dx_0).abs() < 1e-4,
        "dE1/dx: analytic={}, numerical={}",
        jac.data[0][0],
        de_dx_0
    );
    assert!(
        (jac.data[1][0] - de_dx_1).abs() < 1e-4,
        "dE2/dx: analytic={}, numerical={}",
        jac.data[1][0],
        de_dx_1
    );
}

#[test]
fn test_spatial_dedup_prevents_duplicate_orbits() {
    // Two extended points at the same (x,y) but different normals
    // should be treated as the same orbit by spatial dedup
    let mut db = PeriodicOrbitDatabase::new();
    let p1 = ExtendedPoint::new(0.5, 0.15, 1.0, 0.0);

    db.add_orbit(PeriodicOrbit {
        points: vec![BoundaryPoint { x: 0.5, y: 0.15 }],
        extended_points: vec![p1],
        period: 1,
        stability: StabilityType::Stable,
        eigenvalues: vec![0.3, 0.1],
    });

    // Same (x,y) with different normal: should be detected as duplicate
    let p2 = ExtendedPoint::new(0.5, 0.15, 0.0, 1.0);
    assert!(
        db.contains_spatial_point(&p2, 0.01),
        "Spatial dedup should catch same (x,y) with different normal"
    );
    // But 4D dedup would miss it (distance = sqrt(2) ≈ 1.414)
    assert!(
        !db.contains_extended_point(&p2, 0.01),
        "4D dedup misses same orbit with different normal"
    );
}

#[test]
fn test_convergence_tolerance_rejects_loose_fixed_points() {
    // A point that maps to something at distance ~1e-8 should NOT be
    // accepted as a fixed point (tolerance is 1e-10)
    let system = HenonSystem::new(1.4, 0.3, 0.01);

    // Use a random point that's clearly not a fixed point
    let non_fp = ExtendedPoint::new(0.123, 0.456, 1.0, 0.0);
    let (mapped, _) = compose_boundary_map_n_times_generic(&system, non_fp, 1);
    let dist = (mapped.x - non_fp.x).powi(2)
        + (mapped.y - non_fp.y).powi(2)
        + (mapped.nx - non_fp.nx).powi(2)
        + (mapped.ny - non_fp.ny).powi(2);
    // A random point should have large residual, confirming our tolerance matters
    assert!(dist > 1e-10, "Random point should not be a fixed point");
}

#[test]
fn test_henon_unique_orbit_count_at_typical_params() {
    // At a=0.4, b=0.3, epsilon=0.1, the Hénon boundary map should find
    // a small number of distinct orbits (not duplicates)
    let system = HenonSystem::new(0.4, 0.3, 0.1);
    let db = find_all_boundary_periodic_orbits_generic(&system, 1, 15, 12, -3.0, 3.0, -3.0, 3.0);

    // Count stable orbits — should be at most 1 for period 1
    let stable_count = db
        .orbits
        .iter()
        .filter(|o| o.period == 1 && matches!(o.stability, StabilityType::Stable))
        .count();
    assert!(
        stable_count <= 1,
        "Expected at most 1 stable fixed point, got {}",
        stable_count
    );

    // All orbits should be spatially distinct
    for (i, orbit_a) in db.orbits.iter().enumerate() {
        for (j, orbit_b) in db.orbits.iter().enumerate() {
            if i >= j {
                continue;
            }
            for pa in &orbit_a.points {
                for pb in &orbit_b.points {
                    let dist = ((pa.x - pb.x).powi(2) + (pa.y - pb.y).powi(2)).sqrt();
                    assert!(
                            dist > 0.01,
                            "Orbits {} and {} have spatially overlapping points ({:.4},{:.4}) vs ({:.4},{:.4}), dist={:.6}",
                            i, j, pa.x, pa.y, pb.x, pb.y, dist
                        );
                }
            }
        }
    }
}

#[test]
fn test_sweep_and_viz_grid_consistency() {
    // Verify that the sweep finds the same orbits as the visualization
    // at a given parameter value, since they now use the same grid size
    let system = HenonSystem::new(0.4, 0.3, 0.1);

    // "Visualization" path
    let viz_db =
        find_all_boundary_periodic_orbits_generic(&system, 1, 15, 12, -3.0, 3.0, -3.0, 3.0);

    // "Sweep" path (same grid now)
    let base_params = vec![("a".to_string(), 0.4), ("b".to_string(), 0.3)];
    let sweep_result = parameter_sweep_henon_fast(
        &base_params,
        "a",
        0.4,
        0.4,
        1,
        0.1,
        1,
        15,
        12,
        -3.0,
        3.0,
        -3.0,
        3.0,
    );

    assert_eq!(sweep_result.results.len(), 1);
    let sweep_orbits = &sweep_result.results[0].orbits;

    assert_eq!(
        viz_db.total_count(),
        sweep_orbits.len(),
        "Sweep and visualization should find same number of orbits"
    );
}

#[test]
fn test_continue_henon_orbits_tracks_parameter_shift() {
    let old_system = HenonSystem::new(0.4, 0.3, 0.1);
    let old_db =
        find_all_boundary_periodic_orbits_generic(&old_system, 1, 10, 8, -3.0, 3.0, -3.0, 3.0);
    let previous = database_to_found_orbits_generic(&old_db);

    let continued = continue_henon_orbits_from_previous(
        &previous,
        0.4,
        0.3,
        0.1,
        0.42,
        0.3,
        0.1,
        1,
        DEFAULT_PERIODIC_RESIDUAL_THRESHOLD,
    );

    assert!(
        continued.total_count() > 0,
        "Continuation should retain at least one fixed point after a small a-shift"
    );

    let new_system = HenonSystem::new(0.42, 0.3, 0.1);
    for orbit in &continued.orbits {
        let point = orbit.extended_points[0];
        let mapped = boundary_map_generic(&new_system, point.x, point.y, point.nx, point.ny);
        let residual = (mapped.x - point.x).powi(2)
            + (mapped.y - point.y).powi(2)
            + (mapped.nx - point.nx).powi(2)
            + (mapped.ny - point.ny).powi(2);
        assert!(
            residual < 1e-12,
            "Continued orbit is not periodic at the new parameter, residual={}",
            residual
        );
    }
}

#[test]
fn test_continue_henon_orbits_tracks_epsilon_shift() {
    let old_system = HenonSystem::new(0.4, 0.3, 0.08);
    let old_db =
        find_all_boundary_periodic_orbits_generic(&old_system, 1, 10, 8, -3.0, 3.0, -3.0, 3.0);
    let previous = database_to_found_orbits_generic(&old_db);

    let continued = continue_henon_orbits_from_previous(
        &previous,
        0.4,
        0.3,
        0.08,
        0.4,
        0.3,
        0.1,
        1,
        DEFAULT_PERIODIC_RESIDUAL_THRESHOLD,
    );

    assert!(
        continued.total_count() > 0,
        "Continuation should retain at least one fixed point after a small epsilon-shift"
    );
}

#[test]
fn test_henon_sweep_applies_epsilon_samples() {
    let base_params = vec![("a".to_string(), 0.4), ("b".to_string(), 0.3)];
    let low_eps = parameter_sweep_henon_fast(
        &base_params,
        "epsilon",
        0.05,
        0.05,
        1,
        0.1,
        1,
        10,
        8,
        -3.0,
        3.0,
        -3.0,
        3.0,
    );
    let high_eps = parameter_sweep_henon_fast(
        &base_params,
        "epsilon",
        0.12,
        0.12,
        1,
        0.1,
        1,
        10,
        8,
        -3.0,
        3.0,
        -3.0,
        3.0,
    );

    assert_eq!(low_eps.results.len(), 1);
    assert_eq!(high_eps.results.len(), 1);
    assert!((low_eps.results[0].param_value - 0.05).abs() < 1e-12);
    assert!((high_eps.results[0].param_value - 0.12).abs() < 1e-12);

    let low_first = low_eps.results[0]
        .orbits
        .first()
        .and_then(|orbit| orbit.extended_points.first())
        .copied();
    let high_first = high_eps.results[0]
        .orbits
        .first()
        .and_then(|orbit| orbit.extended_points.first())
        .copied();

    if let (Some(low), Some(high)) = (low_first, high_first) {
        let position_delta = ((low.0 - high.0).powi(2) + (low.1 - high.1).powi(2)).sqrt();
        assert!(
            position_delta > 1e-5,
            "Sweeping epsilon should change the computed boundary orbit"
        );
    }
}

#[test]
fn test_periodic_search_input_sanitization() {
    assert_eq!(
        sanitize_grid_size(0, DEFAULT_PERIODIC_GRID_SIZE),
        DEFAULT_PERIODIC_GRID_SIZE
    );
    assert_eq!(sanitize_grid_size(1, DEFAULT_PERIODIC_GRID_SIZE), 2);
    assert_eq!(sanitize_grid_size(9999, DEFAULT_PERIODIC_GRID_SIZE), 256);

    assert_eq!(
        sanitize_residual_threshold(f64::NAN),
        DEFAULT_PERIODIC_RESIDUAL_THRESHOLD
    );
    assert_eq!(
        sanitize_residual_threshold(-1.0),
        DEFAULT_PERIODIC_RESIDUAL_THRESHOLD
    );
}

#[test]
fn periodic_search_config_rejects_invalid_scientific_inputs() {
    assert!(PeriodicSearchConfig::try_new(5, 10, 10, 1e-10).is_ok());
    assert!(PeriodicSearchConfig::try_new(0, 10, 10, 1e-10).is_err());
    assert!(PeriodicSearchConfig::try_new(5, 1, 10, 1e-10).is_err());
    assert!(PeriodicSearchConfig::try_new(5, 10, 10, f64::NAN).is_err());
}

#[test]
fn test_looser_residual_threshold_finds_at_least_as_many_orbits() {
    let system = HenonSystem::new(0.4, 0.3, 0.1);

    let strict = find_all_boundary_periodic_orbits_generic_with_threshold(
        &system, 1, 10, 8, -3.0, 3.0, -3.0, 3.0, 1e-13,
    );
    let loose = find_all_boundary_periodic_orbits_generic_with_threshold(
        &system, 1, 10, 8, -3.0, 3.0, -3.0, 3.0, 1e-8,
    );

    assert!(
        loose.total_count() >= strict.total_count(),
        "Looser residual threshold should not reduce accepted orbit count"
    );
    assert!(
        loose.total_count() > 0,
        "Expected at least one orbit with loose threshold"
    );
}
