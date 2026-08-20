use bist::validation::run_scientific_validation;

#[test]
fn reference_suite_is_release_green() {
    let report = run_scientific_validation().expect("scientific validation should run");
    assert!(report.passed, "validation report: {report:#?}");
}
