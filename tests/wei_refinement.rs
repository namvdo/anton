use bist::scientific::wei_refinement::{
    run_wei_split_refinement, AssessmentStatus, RefinementProfile,
};

#[test]
fn smoke_refinement_preserves_the_evidence_boundary() {
    let bundle = run_wei_split_refinement(RefinementProfile::Smoke)
        .expect("Wei refinement smoke workflow should complete");

    assert_eq!(bundle.rows.len(), 6);
    assert!(bundle.rows.iter().all(|row| {
        row.mis_count > 0
            && row.mis_box_count > 0
            && row.maximum_absorption_residual <= bundle.config.absorption_tolerance
            && row.box_width > 0.0
            && row.box_height > 0.0
    }));

    let local = bundle
        .assessments
        .iter()
        .find(|assessment| assessment.id == "continued_period_two_saddle_node_signature")
        .expect("local branch assessment");
    assert_eq!(local.status, AssessmentStatus::Supported);

    let topological = bundle
        .assessments
        .iter()
        .find(|assessment| assessment.id == "wei_mis_split_near_a_0_595")
        .expect("topological assessment");
    assert_eq!(topological.status, AssessmentStatus::NotSupported);
    assert!(
        !bundle.accepted,
        "the smoke grids must not be promoted into a topological claim"
    );
    assert!(bundle.rows.iter().filter(|row| row.a == 0.6).all(|row| {
        row.period_two_points == 4
            && row.period_two_stable_points == 2
            && row.period_two_saddle_points == 2
            && row.manifold_to_mis_boundary_p95_box_units.is_some()
            && row.mis_boundary_to_manifold_p95_box_units.is_some()
    }));

    assert_eq!(
        bundle.acceptance_table_csv().lines().count(),
        bundle.rows.len() + 1
    );
}
