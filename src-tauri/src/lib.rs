use std::fs;
use std::path::PathBuf;

fn game_dir() -> Result<PathBuf, String> {
    // Try OneDrive\Documents and the system Documents folder, in order.
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(onedrive) = std::env::var("OneDrive") {
        candidates.push(
            PathBuf::from(onedrive)
                .join("Documents")
                .join("Battlefield 6")
                .join("settings")
                .join("steam"),
        );
    }

    if let Some(docs) = dirs::document_dir() {
        candidates.push(
            docs.join("Battlefield 6").join("settings").join("steam"),
        );
    }

    for path in &candidates {
        if path.exists() {
            return Ok(path.clone());
        }
    }
    Err(format!(
        "Could not find Battlefield 6 settings directory. Tried: {:?}",
        candidates
    ))
}

#[tauri::command]
fn deploy_profile(content: String) -> Result<String, String> {
    let dir = game_dir()?;
    let dest = dir.join("PROFSAVE_profile");
    fs::write(&dest, content).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_game_profile() -> Result<String, String> {
    let dir = game_dir()?;
    let src = dir.join("PROFSAVE_profile");
    fs::read_to_string(&src).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![deploy_profile, read_game_profile])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
