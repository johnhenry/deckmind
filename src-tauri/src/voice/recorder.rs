use std::sync::{Arc, Mutex, mpsc};
use std::thread;

/// Commands sent to the recording thread.
enum RecordCmd {
    Start,
    /// Stop and send back the samples via the sender.
    Stop(mpsc::Sender<Vec<f32>>),
    Shutdown,
}

/// Records audio from the default input device into an f32 sample buffer.
/// The cpal Stream lives on a dedicated thread so it never needs Send+Sync.
pub struct AudioRecorder {
    cmd_tx: mpsc::Sender<RecordCmd>,
    _thread: Option<thread::JoinHandle<()>>,
    recording: Arc<Mutex<bool>>,
}

// Safety: the cpal::Stream lives entirely on the recorder thread.
// AudioRecorder only holds a channel sender and an Arc<Mutex<bool>>.
unsafe impl Send for AudioRecorder {}
unsafe impl Sync for AudioRecorder {}

impl AudioRecorder {
    pub fn new() -> Self {
        let (cmd_tx, cmd_rx) = mpsc::channel::<RecordCmd>();
        let recording = Arc::new(Mutex::new(false));
        let recording_flag = recording.clone();

        let handle = thread::spawn(move || {
            recorder_thread(cmd_rx, recording_flag);
        });

        AudioRecorder {
            cmd_tx,
            _thread: Some(handle),
            recording,
        }
    }

    pub fn start(&mut self) -> Result<(), String> {
        if self.is_recording() {
            return Ok(());
        }
        self.cmd_tx.send(RecordCmd::Start).map_err(|e| e.to_string())
    }

    /// Stop recording and return 16kHz mono f32 samples.
    pub fn stop(&mut self) -> Result<Vec<f32>, String> {
        if !self.is_recording() {
            return Ok(Vec::new());
        }
        let (tx, rx) = mpsc::channel();
        self.cmd_tx.send(RecordCmd::Stop(tx)).map_err(|e| e.to_string())?;
        // Wait up to 5 seconds for samples
        rx.recv_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| format!("Timeout waiting for audio samples: {}", e))
    }

    pub fn is_recording(&self) -> bool {
        *self.recording.lock().unwrap_or_else(|e| e.into_inner())
    }
}

impl Drop for AudioRecorder {
    fn drop(&mut self) {
        let _ = self.cmd_tx.send(RecordCmd::Shutdown);
    }
}

/// Runs on a dedicated thread; owns the cpal Stream (which isn't Send).
fn recorder_thread(
    cmd_rx: mpsc::Receiver<RecordCmd>,
    recording_flag: Arc<Mutex<bool>>,
) {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    let mut current_stream: Option<cpal::Stream> = None;
    let samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let mut device_sample_rate: u32 = 0;

    loop {
        match cmd_rx.recv() {
            Ok(RecordCmd::Start) => {
                // Set up audio capture
                let host = cpal::default_host();
                let device = match host.default_input_device() {
                    Some(d) => d,
                    None => {
                        log::error!("No audio input device");
                        continue;
                    }
                };

                let config = match device.default_input_config() {
                    Ok(c) => c,
                    Err(e) => {
                        log::error!("No input config: {}", e);
                        continue;
                    }
                };

                device_sample_rate = config.sample_rate().0;
                let channels = config.channels() as usize;

                // Clear previous
                if let Ok(mut buf) = samples.lock() {
                    buf.clear();
                }

                let samples_ref = samples.clone();

                let stream = device
                    .build_input_stream(
                        &config.into(),
                        move |data: &[f32], _: &cpal::InputCallbackInfo| {
                            if let Ok(mut buf) = samples_ref.lock() {
                                for frame in data.chunks(channels) {
                                    let mono: f32 =
                                        frame.iter().sum::<f32>() / channels as f32;
                                    buf.push(mono);
                                }
                            }
                        },
                        move |err| {
                            log::error!("Audio input error: {}", err);
                        },
                        None,
                    );

                match stream {
                    Ok(s) => {
                        if let Err(e) = s.play() {
                            log::error!("Failed to play stream: {}", e);
                            continue;
                        }
                        current_stream = Some(s);
                        if let Ok(mut flag) = recording_flag.lock() {
                            *flag = true;
                        }
                        log::info!("Recording started: {}Hz, {} ch", device_sample_rate, channels);
                    }
                    Err(e) => {
                        log::error!("Failed to build stream: {}", e);
                    }
                }
            }
            Ok(RecordCmd::Stop(reply)) => {
                // Drop stream to stop recording
                current_stream.take();
                if let Ok(mut flag) = recording_flag.lock() {
                    *flag = false;
                }

                let raw = {
                    let buf = samples.lock().unwrap();
                    buf.clone()
                };

                // Resample to 16kHz
                let resampled = if device_sample_rate == 16000 || raw.is_empty() {
                    raw
                } else {
                    resample(&raw, device_sample_rate, 16000)
                };

                let duration = resampled.len() as f32 / 16000.0;
                log::info!("Recording stopped: {:.1}s of audio", duration);

                let _ = reply.send(resampled);
            }
            Ok(RecordCmd::Shutdown) | Err(_) => {
                current_stream.take();
                break;
            }
        }
    }
}

/// Linear interpolation resampling.
fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    let ratio = from_rate as f64 / to_rate as f64;
    let output_len = (samples.len() as f64 / ratio) as usize;
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let src_idx = i as f64 * ratio;
        let idx = src_idx as usize;
        let frac = (src_idx - idx as f64) as f32;

        let s0 = samples[idx.min(samples.len() - 1)];
        let s1 = samples[(idx + 1).min(samples.len() - 1)];
        output.push(s0 + (s1 - s0) * frac);
    }

    output
}
