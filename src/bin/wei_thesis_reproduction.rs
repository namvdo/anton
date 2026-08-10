use std::env;
use std::fs;
use std::path::PathBuf;

use bist::scientific::wei_reproduction::{run_wei_reproduction, ReproductionProfile};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut profile = ReproductionProfile::Smoke;
    let mut output: Option<PathBuf> = None;
    let mut arguments = env::args().skip(1);
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--reference" => profile = ReproductionProfile::Reference,
            "--out" => {
                output = Some(PathBuf::from(
                    arguments.next().ok_or("--out requires a file path")?,
                ));
            }
            unknown => return Err(format!("Unknown argument: {unknown}").into()),
        }
    }

    let report = run_wei_reproduction(profile)?;
    let json = format!("{}\n", serde_json::to_string_pretty(&report)?);
    if let Some(path) = output {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, json)?;
        println!("Wrote Wei thesis reproduction report to {}", path.display());
    } else {
        print!("{json}");
    }
    if !report.passed {
        return Err("Wei thesis reproduction checks did not pass".into());
    }
    Ok(())
}
