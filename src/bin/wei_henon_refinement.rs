use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use bist::scientific::wei_refinement::{run_wei_split_refinement, RefinementProfile};

fn write_atomic(path: &Path, contents: &str) -> Result<(), Box<dyn std::error::Error>> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("output path requires a UTF-8 file name")?;
    let temporary = path.with_file_name(format!(".{file_name}.tmp"));
    fs::write(&temporary, contents)?;
    fs::rename(&temporary, path)?;
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut profile = RefinementProfile::Smoke;
    let mut output_directory = PathBuf::from("validation/wei_henon_refinement_smoke");
    let mut arguments = env::args().skip(1);
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--reference" => {
                profile = RefinementProfile::Reference;
                output_directory = PathBuf::from("validation/wei_henon_refinement_reference");
            }
            "--out-dir" => {
                output_directory = PathBuf::from(
                    arguments
                        .next()
                        .ok_or("--out-dir requires a directory path")?,
                );
            }
            "--help" | "-h" => {
                println!(
                    "Usage: wei_henon_refinement [--reference] [--out-dir DIRECTORY]\n\
                     Exports experiment_bundle.json and acceptance_table.csv.\n\
                     A scientifically unsupported target is recorded in the bundle and does not make export fail."
                );
                return Ok(());
            }
            unknown => return Err(format!("Unknown argument: {unknown}").into()),
        }
    }

    let bundle = run_wei_split_refinement(profile)?;
    let json = format!("{}\n", serde_json::to_string_pretty(&bundle)?);
    let csv = bundle.acceptance_table_csv();
    fs::create_dir_all(&output_directory)?;
    let bundle_path = output_directory.join("experiment_bundle.json");
    let table_path = output_directory.join("acceptance_table.csv");
    write_atomic(&bundle_path, &json)?;
    write_atomic(&table_path, &csv)?;
    println!("Wrote {}", bundle_path.display());
    println!("Wrote {}", table_path.display());
    println!(
        "Wei split target accepted by this bundle: {}",
        bundle.accepted
    );
    Ok(())
}
