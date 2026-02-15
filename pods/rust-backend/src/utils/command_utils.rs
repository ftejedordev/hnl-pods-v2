/// Normalize MCP command: convert `uvx` to `uv tool run` for compatibility
pub fn normalize_mcp_command(command: &str, args: &[String]) -> (String, Vec<String>) {
    if command == "uvx" {
        let mut new_args = vec!["tool".to_string(), "run".to_string()];
        new_args.extend(args.iter().cloned());
        ("uv".to_string(), new_args)
    } else {
        (command.to_string(), args.to_vec())
    }
}

/// Fix malformed stdio arguments (extra quotes, spaces)
pub fn fix_stdio_args(args: &[String]) -> Vec<String> {
    let mut fixed = Vec::new();
    for arg in args {
        let cleaned = if arg.starts_with("\"\"") && arg.ends_with("\"\"") {
            arg[2..arg.len() - 2].to_string()
        } else if arg.starts_with('"') && arg.ends_with('"') && arg.len() > 1 {
            arg[1..arg.len() - 1].to_string()
        } else {
            arg.clone()
        };

        if cleaned.contains(' ') && !cleaned.starts_with('@') && !cleaned.starts_with('/') {
            fixed.extend(cleaned.split_whitespace().map(String::from));
        } else {
            fixed.push(cleaned);
        }
    }
    fixed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_uvx_to_uv_tool_run() {
        let (cmd, args) = normalize_mcp_command(
            "uvx",
            &["some-package".to_string(), "--flag".to_string()],
        );
        assert_eq!(cmd, "uv");
        assert_eq!(args, vec!["tool", "run", "some-package", "--flag"]);
    }

    #[test]
    fn test_normalize_non_uvx_unchanged() {
        let (cmd, args) = normalize_mcp_command(
            "npx",
            &["-y".to_string(), "@modelcontextprotocol/server-filesystem".to_string()],
        );
        assert_eq!(cmd, "npx");
        assert_eq!(args, vec!["-y", "@modelcontextprotocol/server-filesystem"]);
    }

    #[test]
    fn test_normalize_empty_args() {
        let (cmd, args) = normalize_mcp_command("uvx", &[]);
        assert_eq!(cmd, "uv");
        assert_eq!(args, vec!["tool", "run"]);
    }

    #[test]
    fn test_fix_double_quoted_args() {
        let args = vec!["\"\"value\"\"".to_string()];
        let fixed = fix_stdio_args(&args);
        assert_eq!(fixed, vec!["value"]);
    }

    #[test]
    fn test_fix_single_quoted_args() {
        let args = vec!["\"value\"".to_string()];
        let fixed = fix_stdio_args(&args);
        assert_eq!(fixed, vec!["value"]);
    }

    #[test]
    fn test_fix_arg_with_spaces_splits() {
        let args = vec!["--flag value".to_string()];
        let fixed = fix_stdio_args(&args);
        assert_eq!(fixed, vec!["--flag", "value"]);
    }

    #[test]
    fn test_fix_scoped_package_not_split() {
        let args = vec!["@modelcontextprotocol/server-filesystem".to_string()];
        let fixed = fix_stdio_args(&args);
        assert_eq!(fixed, vec!["@modelcontextprotocol/server-filesystem"]);
    }

    #[test]
    fn test_fix_path_not_split() {
        let args = vec!["/home/user/some path".to_string()];
        let fixed = fix_stdio_args(&args);
        // Starts with /, should not be split even though it has a space
        assert_eq!(fixed, vec!["/home/user/some path"]);
    }

    #[test]
    fn test_fix_normal_args_unchanged() {
        let args = vec!["-y".to_string(), "bash-mcp".to_string()];
        let fixed = fix_stdio_args(&args);
        assert_eq!(fixed, vec!["-y", "bash-mcp"]);
    }
}
