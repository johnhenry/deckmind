use std::path::Path;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Wraps whisper.cpp via whisper-rs for local speech-to-text.
pub struct WhisperTranscriber {
    ctx: WhisperContext,
}

impl WhisperTranscriber {
    /// Load a whisper GGML model from disk.
    pub fn new(model_path: &Path) -> Result<Self, String> {
        let params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(
            model_path.to_str().ok_or("Invalid model path")?,
            params,
        )
        .map_err(|e| format!("Failed to load whisper model: {}", e))?;

        Ok(WhisperTranscriber { ctx })
    }

    /// Transcribe 16kHz mono f32 audio samples to text.
    pub fn transcribe(&self, samples: &[f32]) -> Result<String, String> {
        let mut state = self
            .ctx
            .create_state()
            .map_err(|e| format!("Failed to create whisper state: {}", e))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

        // Optimize for real-time/low-latency
        params.set_language(Some("en"));
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        params.set_single_segment(true);
        // Use 4 threads for Steam Deck's 4-core CPU
        params.set_n_threads(4);

        state
            .full(params, samples)
            .map_err(|e| format!("Whisper transcription failed: {}", e))?;

        let num_segments = state.full_n_segments().map_err(|e| format!("Failed to get segments: {}", e))?;

        let mut text = String::new();
        for i in 0..num_segments {
            if let Ok(segment) = state.full_get_segment_text(i) {
                text.push_str(&segment);
            }
        }

        let trimmed = text.trim().to_string();
        log::info!("Transcribed: \"{}\"", trimmed);
        Ok(trimmed)
    }
}
