mod recorder;
mod transcriber;
pub mod downloader;

pub use recorder::AudioRecorder;
pub use transcriber::WhisperTranscriber;

use std::sync::{Arc, Mutex};
use std::path::PathBuf;

/// Push-to-talk voice engine combining audio recording and whisper.cpp transcription.
pub struct VoiceEngine {
    recorder: Arc<Mutex<AudioRecorder>>,
    transcriber: Option<WhisperTranscriber>,
    model_path: PathBuf,
}

impl VoiceEngine {
    pub fn new(model_name: &str) -> Self {
        let model_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".deckmind")
            .join("models");

        let model_path = model_dir.join(format!("ggml-{}.bin", model_name));

        VoiceEngine {
            recorder: Arc::new(Mutex::new(AudioRecorder::new())),
            transcriber: None,
            model_path,
        }
    }

    /// Initialize the whisper model. Call once at startup or lazily on first use.
    pub fn init_model(&mut self) -> Result<(), String> {
        if self.transcriber.is_some() {
            return Ok(());
        }

        if !self.model_path.exists() {
            return Err(format!(
                "Whisper model not found at {}. Download it with:\n\
                 curl -L -o {} \\\n  \
                 https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
                self.model_path.display(),
                self.model_path.display(),
                self.model_path.file_name().unwrap().to_string_lossy(),
            ));
        }

        let transcriber = WhisperTranscriber::new(&self.model_path)?;
        self.transcriber = Some(transcriber);
        log::info!("Whisper model loaded from {}", self.model_path.display());
        Ok(())
    }

    /// Begin recording audio from the microphone.
    pub fn start_recording(&self) -> Result<(), String> {
        let mut recorder = self.recorder.lock().map_err(|e| e.to_string())?;
        recorder.start()
    }

    /// Stop recording and transcribe the captured audio.
    /// Returns the transcribed text.
    pub fn stop_and_transcribe(&mut self) -> Result<String, String> {
        // Stop recording and get audio samples
        let samples = {
            let mut recorder = self.recorder.lock().map_err(|e| e.to_string())?;
            recorder.stop()?
        };

        if samples.is_empty() {
            return Err("No audio recorded".to_string());
        }

        // Ensure model is loaded
        if self.transcriber.is_none() {
            self.init_model()?;
        }

        // Transcribe
        let transcriber = self.transcriber.as_ref().ok_or("Transcriber not initialized")?;
        transcriber.transcribe(&samples)
    }

    pub fn is_recording(&self) -> bool {
        self.recorder
            .lock()
            .map(|r| r.is_recording())
            .unwrap_or(false)
    }

    pub fn model_path(&self) -> &PathBuf {
        &self.model_path
    }

    /// Switch to a different whisper model. Resets the transcriber so it
    /// will be lazily reloaded on the next transcription request.
    pub fn set_model(&mut self, model_name: &str) {
        let model_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".deckmind")
            .join("models");
        self.model_path = model_dir.join(format!("ggml-{}.bin", model_name));
        self.transcriber = None;
        log::info!("Whisper model switched to {}", self.model_path.display());
    }
}
