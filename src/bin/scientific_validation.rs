use std::env;
use std::fs;
use std::path::PathBuf;

use bist::validation::run_scientific_validation;

fn output_path() -> Option<PathBuf> {
    let mut args = env::args().skip(1);
    while let Some(argument) = args.next() {
        if argument == "--out" {
            return args.next().map(PathBuf::from);
        }
    }
    None
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let report = run_scientific_validation()?;
    let json = serde_json::to_string_pretty(&report)?;

    if let Some(path) = output_path() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, format!("{json}\n"))?;
        println!("Wrote scientific validation report to {}", path.display());
    } else {
        println!("{json}");
    }

    if !report.passed {
        return Err("One or more scientific validation cases failed".into());
    }
    Ok(())
}
