//! Minimal JSON writer/reader.
//!
//! The core crate is dependency-free by design, but the audit log needs a
//! durable, append-only, line-delimited format. This module implements the
//! small, strict subset of JSON that the audit log uses:
//! flat objects whose values are strings, integers, booleans or null.
//!
//! It is deliberately not a general-purpose JSON implementation.

use crate::error::{Error, Result};

/// Value types supported by the audit log format.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Value {
    Str(String),
    Int(i64),
    Bool(bool),
    Null,
}

impl Value {
    fn to_json(&self) -> String {
        match self {
            Value::Str(value) => format!("\"{}\"", escape(value)),
            Value::Int(value) => value.to_string(),
            Value::Bool(value) => value.to_string(),
            Value::Null => "null".to_string(),
        }
    }
}

/// Escapes a string for JSON output.
pub fn escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 8);
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

/// Serialises a flat object into one JSON line (no trailing newline).
pub fn write_object(pairs: &[(&str, Value)]) -> String {
    let mut out = String::from('{');
    for (index, (key, value)) in pairs.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        out.push_str(&format!("\"{}\":{}", escape(key), value.to_json()));
    }
    out.push('}');
    out
}

/// Parses one JSON object line into its key/value pairs.
///
/// Only the subset produced by [`write_object`] is accepted; anything else is an
/// error rather than a best-effort guess, so a corrupted audit line is reported
/// instead of being silently reinterpreted.
pub fn read_object(line: &str) -> Result<Vec<(String, Value)>> {
    let bytes: Vec<char> = line.trim().chars().collect();
    let mut index = 0usize;
    let mut pairs = Vec::new();

    skip_ws(&bytes, &mut index);
    expect(&bytes, &mut index, '{')?;
    skip_ws(&bytes, &mut index);

    if peek(&bytes, index) == Some('}') {
        index += 1;
        return Ok(pairs);
    }

    loop {
        skip_ws(&bytes, &mut index);
        let key = read_string(&bytes, &mut index)?;
        skip_ws(&bytes, &mut index);
        expect(&bytes, &mut index, ':')?;
        skip_ws(&bytes, &mut index);
        let value = read_value(&bytes, &mut index)?;
        pairs.push((key, value));
        skip_ws(&bytes, &mut index);

        match peek(&bytes, index) {
            Some(',') => index += 1,
            Some('}') => {
                index += 1;
                break;
            }
            _ => return Err(invalid("expected ',' or '}'")),
        }
    }

    skip_ws(&bytes, &mut index);
    if index != bytes.len() {
        return Err(invalid("trailing characters after object"));
    }
    Ok(pairs)
}

fn invalid(message: &str) -> Error {
    Error::new(crate::error::ErrorCode::Internal, format!("json: {message}"))
}

fn peek(bytes: &[char], index: usize) -> Option<char> {
    bytes.get(index).copied()
}

fn skip_ws(bytes: &[char], index: &mut usize) {
    while matches!(peek(bytes, *index), Some(' ') | Some('\t') | Some('\r') | Some('\n')) {
        *index += 1;
    }
}

fn expect(bytes: &[char], index: &mut usize, expected: char) -> Result<()> {
    match peek(bytes, *index) {
        Some(found) if found == expected => {
            *index += 1;
            Ok(())
        }
        _ => Err(invalid("unexpected token")),
    }
}

fn read_string(bytes: &[char], index: &mut usize) -> Result<String> {
    expect(bytes, index, '"')?;
    let mut out = String::new();
    loop {
        let ch = peek(bytes, *index).ok_or_else(|| invalid("unterminated string"))?;
        *index += 1;
        match ch {
            '"' => return Ok(out),
            '\\' => {
                let escape_char = peek(bytes, *index).ok_or_else(|| invalid("bad escape"))?;
                *index += 1;
                match escape_char {
                    '"' => out.push('"'),
                    '\\' => out.push('\\'),
                    '/' => out.push('/'),
                    'n' => out.push('\n'),
                    'r' => out.push('\r'),
                    't' => out.push('\t'),
                    'u' => {
                        let hex: String = bytes
                            .get(*index..*index + 4)
                            .ok_or_else(|| invalid("bad unicode escape"))?
                            .iter()
                            .collect();
                        *index += 4;
                        let code = u32::from_str_radix(&hex, 16).map_err(|_| invalid("bad hex"))?;
                        out.push(char::from_u32(code).ok_or_else(|| invalid("bad codepoint"))?);
                    }
                    other => return Err(invalid(&format!("unsupported escape '{other}'"))),
                }
            }
            other => out.push(other),
        }
    }
}

fn read_value(bytes: &[char], index: &mut usize) -> Result<Value> {
    match peek(bytes, *index).ok_or_else(|| invalid("unexpected end of input"))? {
        '"' => Ok(Value::Str(read_string(bytes, index)?)),
        't' => {
            if line_contains_at(bytes, *index, "true") {
                *index += 4;
                Ok(Value::Bool(true))
            } else {
                Err(invalid("bad literal"))
            }
        }
        'f' => {
            if line_contains_at(bytes, *index, "false") {
                *index += 5;
                Ok(Value::Bool(false))
            } else {
                Err(invalid("bad literal"))
            }
        }
        'n' => {
            if line_contains_at(bytes, *index, "null") {
                *index += 4;
                Ok(Value::Null)
            } else {
                Err(invalid("bad literal"))
            }
        }
        '-' | '0'..='9' => {
            let start = *index;
            if peek(bytes, *index) == Some('-') {
                *index += 1;
            }
            while matches!(peek(bytes, *index), Some('0'..='9')) {
                *index += 1;
            }
            let text: String = bytes[start..*index].iter().collect();
            let number = text.parse::<i64>().map_err(|_| invalid("bad number"))?;
            Ok(Value::Int(number))
        }
        other => Err(invalid(&format!("unexpected character '{other}'"))),
    }
}

fn line_contains_at(bytes: &[char], index: usize, needle: &str) -> bool {
    needle.chars().enumerate().all(|(offset, expected)| {
        bytes.get(index + offset).copied() == Some(expected)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_a_flat_object() {
        let line = write_object(&[
            ("id", Value::Str("evt_1".to_string())),
            ("count", Value::Int(42)),
            ("ok", Value::Bool(true)),
            ("detail", Value::Null),
        ]);
        let parsed = read_object(&line).unwrap();
        assert_eq!(parsed.len(), 4);
        assert_eq!(parsed[0].0, "id");
        assert_eq!(parsed[0].1, Value::Str("evt_1".to_string()));
        assert_eq!(parsed[1].1, Value::Int(42));
        assert_eq!(parsed[2].1, Value::Bool(true));
        assert_eq!(parsed[3].1, Value::Null);
    }

    #[test]
    fn escapes_special_characters() {
        let tricky = "line\nbreak \"quoted\" \\ back";
        let line = write_object(&[("detail", Value::Str(tricky.to_string()))]);
        let parsed = read_object(&line).unwrap();
        assert_eq!(parsed[0].1, Value::Str(tricky.to_string()));
    }

    #[test]
    fn escapes_control_characters() {
        let line = write_object(&[("detail", Value::Str("a\u{1}b".to_string()))]);
        let parsed = read_object(&line).unwrap();
        assert_eq!(parsed[0].1, Value::Str("a\u{1}b".to_string()));
    }

    #[test]
    fn rejects_malformed_input_instead_of_guessing() {
        assert!(read_object("{").is_err());
        assert!(read_object("{\"a\":}").is_err());
        assert!(read_object("{\"a\":1,}{").is_err());
        assert!(read_object("not json").is_err());
        assert!(read_object("{\"a\":1} trailing").is_err());
    }

    #[test]
    fn accepts_an_empty_object() {
        assert_eq!(read_object("{}").unwrap().len(), 0);
    }
}
