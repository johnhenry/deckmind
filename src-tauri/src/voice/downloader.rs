use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;

#[derive(Debug, Clone, Serialize)]
pub struct WhisperModelInfo {
    pub name: String,
    pub filename: String,
    pub size_bytes: u64,
    pub size_label: String,
    pub downloaded: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub model_name: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: u8,
    pub done: bool,
    pub error: Option<String>,
}

struct ModelDef {
    name: &'static str,
    size_bytes: u64,
    size_label: &'static str,
}

const MODELS: &[ModelDef] = &[
    ModelDef { name: "tiny.en", size_bytes: 75_000_000, size_label: "75 MB" },
    ModelDef { name: "base.en", size_bytes: 142_000_000, size_label: "142 MB" },
    ModelDef { name: "small.en", size_bytes: 466_000_000, size_label: "466 MB" },
    ModelDef { name: "medium.en", size_bytes: 1_500_000_000, size_label: "1.5 GB" },
];

pub fn models_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".deckmind")
        .join("models")
}

pub fn model_path(name: &str) -> PathBuf {
    models_dir().join(format!("ggml-{}.bin", name))
}

pub fn list_models() -> Vec<WhisperModelInfo> {
    MODELS
        .iter()
        .map(|m| {
            let path = model_path(m.name);
            WhisperModelInfo {
                name: m.name.to_string(),
                filename: format!("ggml-{}.bin", m.name),
                size_bytes: m.size_bytes,
                size_label: m.size_label.to_string(),
                downloaded: path.exists(),
            }
        })
        .collect()
}

pub async fn download_model(
    app: tauri::AppHandle,
    model_name: String,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    use futures_util::StreamExt;

    let dir = models_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create models dir: {}", e))?;

    let filename = format!("ggml-{}.bin", model_name);
    let final_path = dir.join(&filename);
    let part_path = dir.join(format!("{}.part", filename));

    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
        filename
    );

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}: {}", response.status(), url));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();

    let mut file = std::fs::File::create(&part_path)
        .map_err(|e| format!("Cannot create {}: {}", part_path.display(), e))?;

    let mut downloaded: u64 = 0;
    let mut last_percent: u8 = 0;

    let emit_progress = |app: &tauri::AppHandle, downloaded: u64, total: u64, percent: u8, done: bool, error: Option<String>, name: &str| {
        let _ = app.emit("model-download-progress", DownloadProgress {
            model_name: name.to_string(),
            downloaded_bytes: downloaded,
            total_bytes: total,
            percent,
            done,
            error,
        });
    };

    emit_progress(&app, 0, total_bytes, 0, false, None, &model_name);

    while let Some(chunk_result) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            drop(file);
            let _ = std::fs::remove_file(&part_path);
            emit_progress(&app, downloaded, total_bytes, last_percent, true, Some("Cancelled".to_string()), &model_name);
            return Err("Download cancelled".to_string());
        }

        let chunk = chunk_result.map_err(|e| format!("Download stream error: {}", e))?;

        use std::io::Write;
        file.write_all(&chunk)
            .map_err(|e| format!("Write error: {}", e))?;

        downloaded += chunk.len() as u64;

        let percent = if total_bytes > 0 {
            ((downloaded as f64 / total_bytes as f64) * 100.0) as u8
        } else {
            0
        };

        if percent != last_percent {
            last_percent = percent;
            emit_progress(&app, downloaded, total_bytes, percent, false, None, &model_name);
        }
    }

    drop(file);

    std::fs::rename(&part_path, &final_path)
        .map_err(|e| format!("Cannot rename .part file: {}", e))?;

    emit_progress(&app, downloaded, total_bytes, 100, true, None, &model_name);

    log::info!("Downloaded whisper model {} to {}", model_name, final_path.display());
    Ok(())
}
