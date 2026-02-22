use crate::actions::SemanticAction;
use crate::config::ButtonMapping;

pub struct KeyboardInput;

impl KeyboardInput {
    pub fn match_action(key: &str, modifiers: &[String], mappings: &[ButtonMapping]) -> Option<SemanticAction> {
        for mapping in mappings {
            if let Some(ref kb) = mapping.keyboard {
                if kb.key.eq_ignore_ascii_case(key) && modifiers_match(&kb.modifiers, modifiers) {
                    return Self::action_from_name(&mapping.action);
                }
            }
        }
        None
    }

    fn action_from_name(name: &str) -> Option<SemanticAction> {
        match name {
            "explain" => Some(SemanticAction::Explain),
            "fix" => Some(SemanticAction::Fix),
            "continue" => Some(SemanticAction::Continue),
            "plan" => Some(SemanticAction::Plan),
            "summarize" => Some(SemanticAction::Summarize),
            "context" => Some(SemanticAction::Context),
            "interrupt" => Some(SemanticAction::Interrupt),
            _ => None,
        }
    }
}

fn modifiers_match(expected: &[String], actual: &[String]) -> bool {
    if expected.len() != actual.len() {
        return false;
    }
    for exp in expected {
        if !actual.iter().any(|a| a.eq_ignore_ascii_case(exp)) {
            return false;
        }
    }
    true
}
