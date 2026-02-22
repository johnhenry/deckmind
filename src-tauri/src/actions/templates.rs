use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SemanticAction {
    Explain,
    Fix,
    Continue,
    Plan,
    Summarize,
    Context,
    Interrupt,
    Voice { transcription: String },
}

impl SemanticAction {
    pub fn label(&self) -> &str {
        match self {
            SemanticAction::Explain => "Explain",
            SemanticAction::Fix => "Fix",
            SemanticAction::Continue => "Continue",
            SemanticAction::Plan => "Plan",
            SemanticAction::Summarize => "Summarize",
            SemanticAction::Context => "Context",
            SemanticAction::Interrupt => "Interrupt",
            SemanticAction::Voice { .. } => "Voice",
        }
    }

    pub fn description(&self) -> &str {
        match self {
            SemanticAction::Explain => "Understand current state",
            SemanticAction::Fix => "Diagnose & repair",
            SemanticAction::Continue => "Resume last task",
            SemanticAction::Plan => "Decide next steps",
            SemanticAction::Summarize => "Summarize recent activity",
            SemanticAction::Context => "What am I doing",
            SemanticAction::Interrupt => "Stop agent",
            SemanticAction::Voice { .. } => "Freeform instruction",
        }
    }

    pub fn template(&self) -> String {
        match self {
            SemanticAction::Explain => {
                r#"You are supervising a shell session on a portable device.
The user pressed "Explain" — they want to understand the current state.

Environment:
{context}

Explain concisely:
1. What the user appears to be working on
2. The current state of the project/task
3. Any errors or issues visible

Keep your response brief and actionable. Use bullet points."#.to_string()
            }
            SemanticAction::Fix => {
                r#"You are supervising a shell session. The user pressed "Fix" — something is broken and they want you to diagnose and repair it.

Environment:
{context}

Instructions:
1. Identify the most likely error or failure
2. Explain the root cause briefly
3. Propose a fix
4. If in auto/confirm mode, execute the fix"#.to_string()
            }
            SemanticAction::Continue => {
                r#"You are supervising a shell session. The user pressed "Continue" — resume the last task that was in progress.

Environment:
{context}

Instructions:
1. Identify the task that was in progress
2. Determine the next logical step
3. Continue working on it
4. Report what you're doing"#.to_string()
            }
            SemanticAction::Plan => {
                r#"You are supervising a shell session. The user pressed "Plan" — they want you to analyze the current situation and propose next steps.

Environment:
{context}

Instructions:
1. Assess current project state
2. Identify what needs to be done next
3. Propose a clear action plan with numbered steps
4. Prioritize by impact and dependency"#.to_string()
            }
            SemanticAction::Summarize => {
                r#"You are supervising a shell session. The user pressed "Summarize" — they want a concise summary of recent activity.

Environment:
{context}

Provide:
1. What has been accomplished recently
2. Current status
3. Any pending items or blockers

Keep it under 5 bullet points."#.to_string()
            }
            SemanticAction::Context => {
                r#"You are supervising a shell session. The user pressed "Context" — they just picked up their device and want to know where they left off.

Environment:
{context}

Respond as if the user is saying "what was I doing?"
1. Current project/directory
2. Last task being worked on
3. Current state (clean, errors, in-progress)
4. Suggested next action

Be conversational and brief."#.to_string()
            }
            SemanticAction::Interrupt => {
                String::new() // Handled differently - sends Ctrl+C
            }
            SemanticAction::Voice { transcription } => {
                format!(
                    r#"You are supervising a shell session. The user gave a voice command:

"{}"

Environment:
{{context}}

Follow their instruction. Be concise in your response."#,
                    transcription
                )
            }
        }
    }
}
